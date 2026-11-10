import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';

/// One persisted, policy-filtered mobile record.
typedef FieldRecord = Map<String, dynamic>;

/// Sources used by the field app, rather than an entire reporting warehouse.
const fieldTables = [
  'batches',
  'devices',
  'alerts',
  'telemetry_readings',
  'irrigation_schedules',
  'evidence_records',
  'evaluations',
  'maintenance_records',
];

/// A refresh can succeed for some sources while another source is unavailable.
class FieldSnapshot {
  /// Creates a snapshot without replacing failed sources with empty lists.
  const FieldSnapshot(this.records,
      {this.preferences, this.unavailable = const []});

  /// Only successfully fetched sources are included.
  final Map<String, List<FieldRecord>> records;

  /// Saved in-app notification preferences, if available.
  final FieldRecord? preferences;

  /// Human-readable source names that failed to refresh.
  final List<String> unavailable;
}

/// Data boundary shared by foreground refresh and realtime invalidation.
abstract class FieldDataSource {
  /// Loads authorized records for the signed-in profile.
  Future<FieldSnapshot> load(int userId);

  /// Inserts a record and returns only after the server confirms persistence.
  Future<FieldRecord> insert(String table, FieldRecord values);

  /// Updates one authorized record; a denied or missing row is an error.
  Future<FieldRecord> update(String table, int id, FieldRecord values);

  /// Persists the current user's in-app badge preferences.
  Future<FieldRecord> savePreferences(FieldRecord values);

  /// Changes trigger a debounced refresh; they are never treated as full records.
  Stream<void> get changes;

  /// Releases any realtime connection owned by this source.
  Future<void> dispose();
}

/// Reads through Supabase's authenticated REST API and existing RLS policies.
class SupabaseFieldDataSource implements FieldDataSource {
  /// Uses the current authenticated client; contains no privileged credentials.
  SupabaseFieldDataSource(this.client);

  /// Authenticated public client shared with sign-in.
  final SupabaseClient client;
  RealtimeChannel? _channel;
  final _events = StreamController<void>.broadcast();

  @override
  Future<FieldRecord> insert(String table, FieldRecord values) async =>
      await client
          .from(table)
          .insert(values)
          .select()
          .single()
          .timeout(const Duration(seconds: 15));

  @override
  Future<FieldRecord> update(String table, int id, FieldRecord values) async =>
      await client
          .from(table)
          .update(values)
          .eq('id', id)
          .select()
          .single()
          .timeout(const Duration(seconds: 15));

  @override
  Future<FieldRecord> savePreferences(FieldRecord values) async => await client
      .from('notification_preferences')
      .upsert(values)
      .select()
      .single()
      .timeout(const Duration(seconds: 15));

  @override
  Stream<void> get changes {
    if (_channel == null) {
      var channel = client
          .channel('mobile-field-${DateTime.now().microsecondsSinceEpoch}');
      for (final table in [
        'batches',
        'devices',
        'alerts',
        'telemetry_readings'
      ]) {
        channel = channel.onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: table,
          callback: (_) {
            if (!_events.isClosed) _events.add(null);
          },
        );
      }
      _channel = channel.subscribe();
    }
    return _events.stream;
  }

  Future<List<FieldRecord>> _records(String table) async {
    const order = {
      'batches': 'started_at',
      'irrigation_schedules': 'next_run_at',
      'evidence_records': 'recorded_at',
      'maintenance_records': 'performed_at',
    };
    final rows = <FieldRecord>[];
    // Operational directories stay complete. Recent history is intentionally 50.
    final history = ['evidence_records', 'evaluations', 'maintenance_records']
        .contains(table);
    final pageSize = history ? 50 : 500;
    final deadline = DateTime.now().add(const Duration(seconds: 15));
    for (var offset = 0;; offset += pageSize) {
      final budget = deadline.difference(DateTime.now());
      if (budget <= Duration.zero) {
        throw TimeoutException('Record refresh exceeded its time budget.');
      }
      final page = await client
          .from(table)
          .select()
          .order(order[table] ?? 'created_at', ascending: false)
          .order('id')
          .range(offset, offset + pageSize - 1)
          .timeout(budget);
      rows.addAll(page);
      if (history || page.length < pageSize) break;
    }
    return rows;
  }

  @override
  Future<FieldSnapshot> load(int userId) async {
    final result = <String, List<FieldRecord>>{};
    final unavailable = <String>[];
    await Future.wait(
        fieldTables.where((t) => t != 'telemetry_readings').map((table) async {
      try {
        result[table] =
            await _records(table).timeout(const Duration(seconds: 15));
      } catch (_) {
        unavailable.add(table.replaceAll('_', ' '));
      }
    }));
    // One latest raw reading per chamber, never the entire telemetry history.
    // If any read fails, preserve the previous telemetry snapshot as stale.
    if (result.containsKey('devices')) {
      try {
        final latest = await Future.wait(result['devices']!.map((device) async {
          return await client
              .from('telemetry_readings')
              .select()
              .eq('device_id', device['id'])
              .eq('aggregation', 'raw')
              .order('recorded_at', ascending: false)
              .limit(1);
        })).timeout(const Duration(seconds: 15));
        result['telemetry_readings'] = latest.expand((rows) => rows).toList();
      } catch (_) {
        unavailable.add('telemetry readings');
      }
    } else {
      unavailable.add('telemetry readings');
    }
    FieldRecord? preferences;
    try {
      preferences = await client
          .from('notification_preferences')
          .select()
          .eq('user_id', userId)
          .maybeSingle()
          .timeout(const Duration(seconds: 10));
    } catch (_) {
      unavailable.add('notification preferences');
    }
    return FieldSnapshot(result,
        preferences: preferences, unavailable: unavailable);
  }

  @override
  Future<void> dispose() async {
    if (_channel != null) {
      await client.removeChannel(_channel!);
    }
    await _events.close();
  }
}

/// True only for recent timestamps, with a small allowance for clock skew.
bool isRecent(dynamic timestamp, DateTime now,
    {Duration age = const Duration(minutes: 5)}) {
  final time = DateTime.tryParse(timestamp?.toString() ?? '');
  if (time == null) return false;
  final elapsed = now.difference(time);
  return elapsed >= const Duration(seconds: -30) && elapsed <= age;
}

/// Compact age text never hides a missing or invalid timestamp.
String readingAge(dynamic timestamp, DateTime now) {
  final time = DateTime.tryParse(timestamp?.toString() ?? '');
  if (time == null) return 'Time unavailable';
  final seconds = now.difference(time).inSeconds;
  if (seconds < -30) return 'Device clock ahead';
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return '${seconds ~/ 60} min ago';
  if (seconds < 86400) return '${seconds ~/ 3600} hr ago';
  return '${seconds ~/ 86400} days ago';
}

/// Resolves a printed raw identifier or an explicitly supported SproutSync URI.
/// External URLs are never opened, fetched, or interpreted as arbitrary records.
String labelIdentity(String value) {
  final trimmed = value.trim();
  final uri = Uri.tryParse(trimmed);
  if (uri != null && uri.hasScheme) {
    if (uri.scheme != 'sproutsync' || !['batch', 'device'].contains(uri.host)) {
      return '';
    }
    return uri.pathSegments.join('/').trim();
  }
  return trimmed;
}
