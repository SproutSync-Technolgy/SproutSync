import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'main.dart';

/// A row returned by the Supabase REST API.
typedef Record = Map<String, dynamic>;

/// Persistent record sources shared with the web workspace.
const tables = [
  'batches',
  'devices',
  'trays',
  'alerts',
  'telemetry_readings',
  'watering_events',
  'irrigation_schedules',
  'evidence_records',
  'evaluations',
  'maintenance_records'
];

/// Formats a persisted timestamp in the device's local time.
String displayDate(dynamic value) {
  final parsed = DateTime.tryParse(value?.toString() ?? '');
  return parsed == null
      ? 'Not set'
      : parsed.toLocal().toString().substring(0, 16);
}

/// Shows persisted production, evaluation and monitoring records.
class MobileWorkspace extends StatefulWidget {
  /// Creates the MobileWorkspace widget or field definition.
  const MobileWorkspace(
      {super.key, required this.profile, required this.onProfile});

  /// The current database profile.
  final Record profile;

  /// Updates the root account state after profile edits.
  final ValueChanged<Record> onProfile;
  @override
  State<MobileWorkspace> createState() => _MobileWorkspaceState();
}

class _MobileWorkspaceState extends State<MobileWorkspace>
    with WidgetsBindingObserver {
  final client = Supabase.instance.client;
  Map<String, List<Record>> data = {for (final table in tables) table: []};
  int tab = 0, generation = 0;
  bool loading = true, busy = false;
  String? error;
  Timer? timer;
  Record notificationPreferences = {
    'alerts_enabled': true,
    'harvest_enabled': true
  };
  int get notificationCount => alerts
      .where((alert) =>
          alert['status'] != 'resolved' &&
          (alert['category'] == 'harvest'
              ? notificationPreferences['harvest_enabled'] == true
              : notificationPreferences['alerts_enabled'] == true))
      .length;
  bool get operator => ['operator', 'admin'].contains(widget.profile['role']);
  List<Record> get alerts => data['alerts']!;
  List<Record> get batches => data['batches']!;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(refresh());
    timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        unawaited(refresh());
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(refresh());
  }

  @override
  void dispose() {
    timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> refresh() async {
    final request = ++generation;
    try {
      final result = await Future.wait(tables.map((table) async {
        final records = <Record>[];
        for (var offset = 0;; offset += 1000) {
          const columns = {
            'batches': 'started_at',
            'telemetry_readings': 'recorded_at',
            'watering_events': 'occurred_at',
            'irrigation_schedules': 'next_run_at',
            'evidence_records': 'recorded_at',
            'maintenance_records': 'performed_at',
            'trays': 'id'
          };
          final rows = await client
              .from(table)
              .select()
              .order(columns[table] ?? 'created_at', ascending: false)
              .range(offset, offset + 999);
          records.addAll(rows);
          if (rows.length < 1000) break;
        }
        return MapEntry(table, records);
      }));
      final preferences = await client
          .from('notification_preferences')
          .select()
          .eq('user_id', widget.profile['id'])
          .maybeSingle();
      if (mounted && request == generation) {
        setState(() {
          data = Map.fromEntries(result);
          if (preferences != null) notificationPreferences = preferences;
          error = null;
          loading = false;
        });
      }
    } catch (e) {
      if (mounted && request == generation) {
        setState(() {
          error = readableError(e);
          loading = false;
        });
      }
    }
  }

  void toast(String message) {
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    }
  }

  String deviceName(dynamic id) =>
      data['devices']!
          .where((d) => d['id'] == id)
          .map((d) => d['name'].toString())
          .firstOrNull ??
      'Device $id';
  String batchName(dynamic id) =>
      batches
          .where((b) => b['id'] == id)
          .map((b) => b['code'].toString())
          .firstOrNull ??
      'All batches';
  Future<void> signOut() async {
    final yes = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('Are you sure you want to sign out?'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('No')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Yes'))
                ]));
    if (yes != true || !mounted) return;
    try {
      await client.auth.signOut(scope: SignOutScope.local);
    } catch (e) {
      toast(readableError(e));
    }
  }

  Future<void> create(
      String table, String title, List<InputField> fields) async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(
        builder: (_) => RecordEditor(
            title: title,
            fields: fields,
            onSave: (values) async {
              final payload = <String, dynamic>{
                ...values,
                'owner_id': widget.profile['id']
              };
              for (final key in [
                'device_id',
                'batch_id',
                'rating',
                'duration_seconds'
              ]) {
                if (payload.containsKey(key)) {
                  payload[key] = int.tryParse(payload[key].toString());
                }
              }
              if (table == 'evaluations') {
                payload.remove('owner_id');
                payload['evaluator_id'] = widget.profile['id'];
              }
              if (table == 'batches') {
                payload['started_at'] =
                    DateTime.now().toUtc().toIso8601String();
              }
              await client.from(table).insert(payload).select().single();
            })));
    if (saved == true) {
      await refresh();
      toast('Record saved.');
    }
  }

  List<InputField> get batchFields => [
        const InputField('code', 'Batch code', maxLength: 64),
        const InputField('seed_type', 'Crop', initial: 'Mung beans'),
        const InputField('notes', 'Notes', required: false, multiline: true)
      ];
  InputField get deviceField => InputField('device_id', 'Device', options: {
        for (final d in data['devices']!) '${d['id']}': '${d['name']}'
      });
  InputField get batchField => InputField('batch_id', 'Batch',
      options: {for (final b in batches) '${b['id']}': '${b['code']}'});

  Future<void> showAlert(Record alert) async {
    await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (sheetContext) => StatefulBuilder(
            builder: (sheetContext, setSheetState) => Padding(
                padding: const EdgeInsets.all(24),
                child: SingleChildScrollView(
                    child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                      Text(alert['title'],
                          style: const TextStyle(
                              fontSize: 23, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 12),
                      Text(alert['message']),
                      const SizedBox(height: 20),
                      const Text('Recommended action',
                          style: TextStyle(fontWeight: FontWeight.bold)),
                      Text(alert['recommended_action'].toString().isEmpty
                          ? 'Inspect the device and its readings.'
                          : alert['recommended_action']),
                      const SizedBox(height: 20),
                      if (operator && alert['status'] != 'resolved')
                        Row(
                          children: [
                            for (final status in ['acknowledged', 'resolved'])
                              Expanded(
                                  child: Padding(
                                      padding: const EdgeInsets.all(4),
                                      child: FilledButton.tonal(
                                          onPressed: busy
                                              ? null
                                              : () async {
                                                  setSheetState(
                                                      () => busy = true);
                                                  try {
                                                    await client
                                                        .from('alerts')
                                                        .update(
                                                            {'status': status})
                                                        .eq('id', alert['id'])
                                                        .select()
                                                        .single();
                                                    if (sheetContext.mounted) {
                                                      Navigator.pop(
                                                          sheetContext);
                                                    }
                                                    await refresh();
                                                    toast(status == 'resolved'
                                                        ? 'Alert resolved.'
                                                        : 'Alert acknowledged.');
                                                  } catch (e) {
                                                    toast(readableError(e));
                                                  } finally {
                                                    if (mounted) busy = false;
                                                    if (sheetContext.mounted) {
                                                      setSheetState(() {});
                                                    }
                                                  }
                                                },
                                          child: Text(status == 'resolved'
                                              ? 'Resolve'
                                              : 'Acknowledge'))))
                          ],
                        ),
                      TextButton(
                          onPressed:
                              busy ? null : () => Navigator.pop(sheetContext),
                          child: const Text('Close')),
                    ])))));
  }

  Future<void> showBatch(Record batch) async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(
        builder: (_) => RecordEditor(
            title: '${batch['code']} · ${batch['seed_type']}',
            readOnly: !operator || batch['status'] == 'archived',
            fields: [
              InputField('stage', 'Growth stage',
                  initial: batch['stage'],
                  options: {
                    for (final s in [
                      'soaking',
                      'rinsing',
                      'growing',
                      'ready',
                      'harvested'
                    ])
                      s: s
                  }),
              InputField('notes', 'Notes',
                  required: false,
                  multiline: true,
                  initial: batch['notes'] ?? ''),
              InputField('status', 'Status',
                  initial: batch['status'],
                  options: const {'active': 'Active', 'archived': 'Archived'})
            ],
            onSave: (values) async {
              await client
                  .from('batches')
                  .update(values)
                  .eq('id', batch['id'])
                  .select()
                  .single();
            })));
    if (saved == true) {
      await refresh();
      toast('Batch updated.');
    }
  }

  Future<void> addDevice() async {
    final code = await Navigator.of(context)
        .push<String>(MaterialPageRoute(builder: (_) => const DeviceScanner()));
    if (!mounted || code == null) return;
    await create('devices', 'Register device', [
      const InputField('name', 'Device name'),
      InputField('serial_number', 'Device serial number', initial: code)
    ]);
  }

  Future<void> copyReport() async {
    String cell(dynamic value) {
      var text = '${value ?? ''}';
      if (RegExp(r'^[=+@\-\t\r]').hasMatch(text)) text = "'$text";
      return '"${text.replaceAll('"', '""')}"';
    }

    final rows = [
      ['Batch', 'Crop', 'Stage', 'Status', 'Started'],
      ...batches.map((b) =>
          [b['code'], b['seed_type'], b['stage'], b['status'], b['started_at']])
    ];
    await Clipboard.setData(ClipboardData(
        text: rows.map((row) => row.map(cell).join(',')).join('\r\n')));
    toast('Batch report copied as CSV.');
  }

  Widget card(String title, String value, IconData icon) => Card(
      elevation: 0,
      color: Colors.white,
      child: Padding(
          padding: const EdgeInsets.all(18),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon, color: const Color(0xFF247547)),
            const SizedBox(height: 14),
            Text(value,
                style:
                    const TextStyle(fontSize: 23, fontWeight: FontWeight.bold)),
            Text(title,
                style: const TextStyle(fontSize: 12, color: Colors.black54))
          ])));
  Widget empty(String text) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 12),
      child: Column(children: [
        const Icon(Icons.eco_outlined, size: 36, color: Colors.grey),
        const SizedBox(height: 12),
        Text(text,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.black54))
      ]));
  Widget section(String title, List<Widget> children) => Padding(
      padding: const EdgeInsets.only(top: 20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(title,
            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        ...children
      ]));
  List<Widget> home() {
    final latest = data['telemetry_readings']!.firstOrNull;
    final schedules = data['irrigation_schedules']!
        .where((s) =>
            s['enabled'] == true &&
            DateTime.parse(s['next_run_at']).isAfter(DateTime.now()))
        .toList()
      ..sort((a, b) =>
          a['next_run_at'].toString().compareTo(b['next_run_at'].toString()));
    final online = data['devices']!
        .where((d) =>
            d['status'] == 'online' &&
            d['last_seen_at'] != null &&
            DateTime.now()
                    .difference(DateTime.parse(d['last_seen_at']))
                    .inMinutes <
                5)
        .length;
    final metrics = [
      card('System status', '$online online', Icons.sensors),
      card(
          'Active batches',
          '${batches.where((b) => b['status'] == 'active').length}',
          Icons.spa_outlined),
      card(
          'Active / total trays',
          '${data['trays']!.where((t) => t['status'] == 'active').length} / ${data['trays']!.length}',
          Icons.grid_view),
      card(
          'Active alerts',
          '${alerts.where((a) => a['status'] != 'resolved').length}',
          Icons.notifications_outlined),
      card(
          'Water level',
          latest?['water_level_percent'] == null
              ? '—'
              : '${latest!['water_level_percent']}%',
          Icons.water_drop_outlined),
      card(
          'Temperature',
          latest?['temperature_c'] == null
              ? '—'
              : '${latest!['temperature_c']}°C',
          Icons.thermostat),
      card(
          'Humidity',
          latest?['humidity_percent'] == null
              ? '—'
              : '${latest!['humidity_percent']}%',
          Icons.water),
      card(
          'Water temperature',
          latest?['water_temperature_c'] == null
              ? '—'
              : '${latest!['water_temperature_c']}°C',
          Icons.thermostat_outlined),
      card(
          'Light level',
          latest?['light_lux'] == null ? '—' : '${latest!['light_lux']} lux',
          Icons.dark_mode_outlined),
      card(
          'Wastewater',
          latest?['wastewater_level_percent'] == null
              ? '—'
              : '${latest!['wastewater_level_percent']}%',
          Icons.waves),
    ];
    return [
      Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
              color: const Color(0xFF1B5A38),
              borderRadius: BorderRadius.circular(22)),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Hello, ${widget.profile['first_name']}.',
                style: const TextStyle(
                    fontSize: 27,
                    fontWeight: FontWeight.bold,
                    color: Colors.white)),
            const SizedBox(height: 8),
            Text(
                operator
                    ? 'Your growing space at a glance.'
                    : 'Your shared batches and evidence.',
                style: const TextStyle(color: Colors.white70))
          ])),
      if (batches.any((batch) => batch['is_demo'] == true))
        const Padding(
            padding: EdgeInsets.all(8),
            child: Text('Sample records · Saved in your workspace',
                style: TextStyle(fontSize: 12, color: Colors.black54))),
      const SizedBox(height: 16),
      for (var i = 0; i < metrics.length; i += 2)
        IntrinsicHeight(
            child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
              Expanded(child: metrics[i]),
              Expanded(child: metrics[i + 1])
            ])),
      if (latest != null)
        Padding(
            padding: const EdgeInsets.all(8),
            child: Text('Last reading: ${displayDate(latest['recorded_at'])}',
                style: const TextStyle(fontSize: 12, color: Colors.black54))),
      section('Next irrigation', [
        Text(schedules.isEmpty
            ? 'No upcoming run'
            : '${deviceName(schedules.first['device_id'])} · ${displayDate(schedules.first['next_run_at'])} · ${schedules.first['duration_seconds']}s')
      ]),
      section('Recent batches', batchCards(batches.take(3).toList()))
    ];
  }

  List<Widget> batchCards(List<Record> records) => records.isEmpty
      ? [
          empty(operator
              ? 'Create your first batch.'
              : 'No batches have been shared with your account yet.')
        ]
      : records
          .map((b) => Card(
              elevation: 0,
              color: Colors.white,
              child: ListTile(
                  contentPadding: const EdgeInsets.all(16),
                  leading: const Icon(Icons.spa_outlined),
                  title: Text(b['code'],
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle:
                      Text('${b['seed_type']} · ${b['stage']}\n${b['status']}'),
                  isThreeLine: true,
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => showBatch(b))))
          .toList();
  List<Widget> more() => [
        ListTile(
            leading: const Icon(Icons.person_outline),
            title: Text(widget.profile['display_name']),
            subtitle: Text(widget.profile['email']),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.push(
                context,
                MaterialPageRoute<void>(
                    builder: (_) => ProfileForm(
                        editing: true,
                        profile: widget.profile,
                        onSaved: (profile) {
                          widget.onProfile(profile);
                          Navigator.pop(context);
                        })))),
        section(
            'Devices',
            data['devices']!.isEmpty
                ? [empty('Link a device to start receiving readings.')]
                : data['devices']!
                    .map((d) => Card(
                        child: ListTile(
                            leading: const Icon(Icons.sensors),
                            title: Text(d['name']),
                            subtitle: Text(
                                '${d['status']} · Last seen ${displayDate(d['last_seen_at'])}'))))
                    .toList()),
        if (operator)
          OutlinedButton.icon(
              onPressed: addDevice,
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Add device / scan QR')),
        const Padding(
            padding: EdgeInsets.all(8),
            child: Text(
                'Connect a registered chamber to Wi-Fi through its controller setup. It stays pending until a heartbeat is received.',
                style: TextStyle(fontSize: 12, color: Colors.black54))),
        section(
            'Maintenance',
            data['maintenance_records']!.isEmpty
                ? [empty('No maintenance records yet.')]
                : data['maintenance_records']!
                    .map((m) => ListTile(
                        title: Text(deviceName(m['device_id'])),
                        subtitle: Text(
                            '${m['notes']}\n${displayDate(m['performed_at'])}')))
                    .toList()),
        if (operator)
          OutlinedButton(
              onPressed: data['devices']!.isEmpty
                  ? null
                  : () => create('maintenance_records', 'Record maintenance', [
                        deviceField,
                        const InputField('notes', 'Maintenance notes',
                            multiline: true)
                      ]),
              child: const Text('Record maintenance')),
        section(
            'Evidence',
            data['evidence_records']!.isEmpty
                ? [empty('No evidence has been shared yet.')]
                : data['evidence_records']!
                    .map((e) => ListTile(
                        leading: const Icon(Icons.fact_check_outlined),
                        title: Text(e['title']),
                        subtitle: Text(
                            '${e['category']} · ${e['result']}\n${e['notes']}')))
                    .toList()),
        if (!operator)
          OutlinedButton(
              onPressed: batches.isEmpty
                  ? null
                  : () => create('evaluations', 'Evaluate batch', [
                        batchField,
                        const InputField('rating', 'Rating', options: {
                          '1': '1 — Poor',
                          '2': '2 — Fair',
                          '3': '3 — Good',
                          '4': '4 — Very good',
                          '5': '5 — Excellent'
                        }),
                        const InputField('comments', 'Comments',
                            multiline: true)
                      ]),
              child: const Text('Submit evaluation')),
        section('Notifications', [
          NotificationSettings(
              userId: widget.profile['id'],
              onChanged: (preferences) =>
                  setState(() => notificationPreferences = preferences))
        ]),
        const SizedBox(height: 24),
        OutlinedButton.icon(
            onPressed: signOut,
            icon: const Icon(Icons.logout),
            label: const Text('Sign out')),
      ];
  @override
  Widget build(BuildContext context) {
    final water = data['watering_events']!.fold<double>(
            0, (sum, w) => sum + (w['volume_ml'] as num).toDouble()) /
        1000;
    final content = switch (tab) {
      0 => home(),
      1 => [
          if (operator)
            FilledButton.icon(
                onPressed: () => create('batches', 'New batch', batchFields),
                icon: const Icon(Icons.add),
                label: const Text('New batch')),
          const SizedBox(height: 12),
          ...batchCards(batches)
        ],
      2 => alerts.isEmpty
          ? [empty('No alerts have been recorded.')]
          : alerts
              .map((a) => Card(
                  elevation: 0,
                  color: Colors.white,
                  child: ListTile(
                      leading: Icon(Icons.notifications_outlined,
                          color: a['severity'] == 'critical'
                              ? Colors.red
                              : Colors.orange),
                      title: Text(a['title']),
                      subtitle: Text(
                          '${a['status']} · ${displayDate(a['created_at'])}'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => showAlert(a))))
              .toList(),
      3 => [
          card('Recorded water use', '${water.toStringAsFixed(1)} L',
              Icons.water_drop_outlined),
          card(
              'Harvested batches',
              '${batches.where((b) => b['stage'] == 'harvested').length}',
              Icons.spa),
          OutlinedButton.icon(
              onPressed: batches.isEmpty ? null : copyReport,
              icon: const Icon(Icons.copy),
              label: const Text('Copy batch report as CSV')),
          section(
              'Watering history',
              data['watering_events']!.isEmpty
                  ? [empty('No watering events yet.')]
                  : data['watering_events']!
                      .map((w) => ListTile(
                          title: Text(batchName(w['batch_id'])),
                          subtitle: Text(
                              '${(w['volume_ml'] / 1000).toStringAsFixed(2)} L · ${displayDate(w['occurred_at'])}')))
                      .toList())
        ],
      _ => more(),
    };
    return Scaffold(
        appBar: AppBar(
            title: Text(['Home', 'Batches', 'Alerts', 'Reports', 'More'][tab],
                style: const TextStyle(fontWeight: FontWeight.bold)),
            actions: [
              IconButton(
                  tooltip: 'Refresh',
                  onPressed: refresh,
                  icon: const Icon(Icons.refresh)),
              IconButton(
                  tooltip: 'Alerts',
                  onPressed: () => setState(() => tab = 2),
                  icon: Badge(
                      isLabelVisible: notificationCount > 0,
                      label: Text('$notificationCount'),
                      child: const Icon(Icons.notifications_outlined)))
            ]),
        body: SafeArea(
            child: loading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: refresh,
                    child: ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(20),
                        children: [
                          if (error != null)
                            Padding(
                                padding: const EdgeInsets.only(bottom: 16),
                                child: Text('$error Pull down to retry.',
                                    style: TextStyle(
                                        color: Theme.of(context)
                                            .colorScheme
                                            .error))),
                          ...content
                        ]))),
        bottomNavigationBar: NavigationBar(
            selectedIndex: tab,
            onDestinationSelected: (index) => setState(() => tab = index),
            destinations: const [
              NavigationDestination(
                  icon: Icon(Icons.home_outlined),
                  selectedIcon: Icon(Icons.home),
                  label: 'Home'),
              NavigationDestination(
                  icon: Icon(Icons.spa_outlined), label: 'Batches'),
              NavigationDestination(
                  icon: Icon(Icons.notifications_outlined), label: 'Alerts'),
              NavigationDestination(
                  icon: Icon(Icons.bar_chart), label: 'Reports'),
              NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More')
            ]));
  }
}

/// Describes one validated field in a persisted record editor.
class InputField {
  /// Creates the InputField widget or field definition.
  const InputField(this.key, this.label,
      {this.initial = '',
      this.required = true,
      this.multiline = false,
      this.options,
      this.maxLength = 120});

  /// The column key, label and initial value.
  final String key, label, initial;

  /// Whether input is required and rendered over multiple lines.
  final bool required, multiline;

  /// Available values for a selection field.
  final Map<String, String>? options;

  /// Maximum allowed input length.
  final int maxLength;
}

/// Edits a record with validation and read-only evaluator support.
class RecordEditor extends StatefulWidget {
  /// Creates the RecordEditor widget or field definition.
  const RecordEditor(
      {super.key,
      required this.title,
      required this.fields,
      required this.onSave,
      this.readOnly = false});

  /// The editor title shown above the record.
  final String title;

  /// The validated fields shown by this editor.
  final List<InputField> fields;

  /// Persists valid field values before the editor closes.
  final Future<void> Function(Map<String, String>) onSave;

  /// Disables operational editing for read-only accounts.
  final bool readOnly;
  @override
  State<RecordEditor> createState() => _RecordEditorState();
}

class _RecordEditorState extends State<RecordEditor> {
  final form = GlobalKey<FormState>();
  late final controllers = {
    for (final f in widget.fields) f.key: TextEditingController(text: f.initial)
  };
  bool busy = false;
  String? error;
  @override
  void dispose() {
    for (final c in controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> save() async {
    if (!form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.onSave(
          {for (final e in controllers.entries) e.key: e.value.text.trim()});
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => error = readableError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
      canPop: !busy,
      child: Scaffold(
          appBar: AppBar(title: Text(widget.title)),
          body: SafeArea(
              child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: Form(
                      key: form,
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            for (final f in widget.fields)
                              Padding(
                                  padding: const EdgeInsets.only(bottom: 18),
                                  child: f.options != null
                                      ? DropdownButtonFormField<String>(
                                          initialValue:
                                              controllers[f.key]!.text.isEmpty
                                                  ? null
                                                  : controllers[f.key]!.text,
                                          decoration: InputDecoration(
                                              labelText: f.label),
                                          items: f.options!.entries
                                              .map((e) => DropdownMenuItem(
                                                  value: e.key,
                                                  child: Text(e.value)))
                                              .toList(),
                                          onChanged: busy || widget.readOnly
                                              ? null
                                              : (value) => controllers[f.key]!
                                                  .text = value ?? '',
                                          validator: (value) => f.required &&
                                                  (value == null ||
                                                      value.isEmpty)
                                              ? 'Required'
                                              : null)
                                      : TextFormField(
                                          controller: controllers[f.key],
                                          enabled: !busy && !widget.readOnly,
                                          maxLines: f.multiline ? 4 : 1,
                                          maxLength: f.multiline ? 2000 : f.maxLength,
                                          decoration: InputDecoration(labelText: f.label),
                                          validator: (value) => f.required && (value?.trim().isEmpty ?? true) ? 'Required' : null)),
                            if (error != null)
                              Text(error!,
                                  style: TextStyle(
                                      color:
                                          Theme.of(context).colorScheme.error)),
                            if (!widget.readOnly)
                              FilledButton(
                                  onPressed: busy ? null : save,
                                  child: Text(busy ? 'Saving…' : 'Save'))
                          ]))))));
}

/// Scans a chamber QR code or accepts its serial number manually.
class DeviceScanner extends StatefulWidget {
  /// Creates the DeviceScanner widget or field definition.
  const DeviceScanner({super.key});
  @override
  State<DeviceScanner> createState() => _DeviceScannerState();
}

class _DeviceScannerState extends State<DeviceScanner> {
  bool scanned = false;
  final manual = TextEditingController();
  final controller = MobileScannerController();
  @override
  void dispose() {
    manual.dispose();
    controller.dispose();
    super.dispose();
  }

  void complete(String value) {
    if (scanned || value.trim().isEmpty) return;
    scanned = true;
    unawaited(controller.stop());
    Navigator.pop(context, value.trim());
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Scan device QR')),
      body: SafeArea(
          child: ListView(padding: const EdgeInsets.all(24), children: [
        SizedBox(
            height: 300,
            child: ClipRRect(
                borderRadius: BorderRadius.circular(24),
                child: MobileScanner(
                    controller: controller,
                    onDetect: (capture) {
                      for (final barcode in capture.barcodes) {
                        if (barcode.rawValue != null) {
                          complete(barcode.rawValue!);
                          break;
                        }
                      }
                    },
                    errorBuilder: (context, error) => const Center(
                        child: Text(
                            'Camera unavailable. Enter the serial number below.'))))),
        const SizedBox(height: 24),
        TextField(
            controller: manual,
            decoration:
                const InputDecoration(labelText: 'Or enter serial number')),
        const SizedBox(height: 16),
        FilledButton(
            onPressed: () => complete(manual.text),
            child: const Text('Continue'))
      ])));
}

/// Persists alert delivery preferences for the signed-in account.
class NotificationSettings extends StatefulWidget {
  /// Creates the NotificationSettings widget or field definition.
  const NotificationSettings({super.key, required this.userId, this.onChanged});

  /// Updates the surrounding notification badge after preferences change.
  final ValueChanged<Record>? onChanged;

  /// The database profile owning these preferences.
  final int userId;
  @override
  State<NotificationSettings> createState() => _NotificationSettingsState();
}

class _NotificationSettingsState extends State<NotificationSettings> {
  bool? alerts, harvest;
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    try {
      final data = await Supabase.instance.client
          .from('notification_preferences')
          .select()
          .eq('user_id', widget.userId)
          .maybeSingle();
      if (mounted) {
        setState(() {
          alerts = data?['alerts_enabled'] ?? true;
          harvest = data?['harvest_enabled'] ?? true;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = readableError(e));
    }
  }

  Future<void> save(bool a, bool h) async {
    setState(() => busy = true);
    try {
      await Supabase.instance.client.from('notification_preferences').upsert({
        'user_id': widget.userId,
        'alerts_enabled': a,
        'harvest_enabled': h
      });
      if (mounted) {
        setState(() {
          alerts = a;
          harvest = h;
          error = null;
        });
        widget.onChanged?.call({'alerts_enabled': a, 'harvest_enabled': h});
      }
    } catch (e) {
      if (mounted) setState(() => error = readableError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(children: [
        if (error != null)
          Text(error!, style: const TextStyle(color: Colors.red)),
        if (alerts == null)
          const Text('Loading preferences…')
        else ...[
          SwitchListTile(
              title: const Text('Alert notifications'),
              value: alerts!,
              onChanged: busy ? null : (value) => save(value, harvest!)),
          SwitchListTile(
              title: const Text('Harvest notifications'),
              value: harvest!,
              onChanged: busy ? null : (value) => save(alerts!, value))
        ]
      ]);
}
