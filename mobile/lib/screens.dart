import 'dart:async';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'main.dart';
import 'field_data.dart';
import 'field_widgets.dart';
import 'field_search.dart';

/// A row returned by the Supabase REST API.
typedef Record = Map<String, dynamic>;

/// Persistent record sources shared with the web workspace.
const tables = fieldTables;

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
      {super.key,
      required this.profile,
      required this.onProfile,
      this.dataSource});

  /// The current database profile.
  final Record profile;

  /// Optional source for isolated UI testing; production uses authenticated REST.
  final FieldDataSource? dataSource;

  /// Updates the root account state after profile edits.
  final ValueChanged<Record> onProfile;
  @override
  State<MobileWorkspace> createState() => _MobileWorkspaceState();
}

class _MobileWorkspaceState extends State<MobileWorkspace>
    with WidgetsBindingObserver {
  SupabaseClient get client => Supabase.instance.client;
  late final FieldDataSource source;
  StreamSubscription<void>? changes;
  Timer? debounce;
  DateTime? lastSync;
  List<String> unavailable = [];
  bool refreshing = false;
  String batchSearch = "", batchFilter = "Active", alertFilter = "Open";
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
  bool get admin => ['admin', 'superadmin'].contains(widget.profile['role']);
  bool get evaluator => widget.profile['role'] == 'evaluator';
  String get roleLabel => admin
      ? 'Administrator'
      : operator
          ? 'Operator'
          : 'Evaluator';
  String get rolePurpose => admin
      ? 'Check chamber health and shared records here. Register equipment and manage account access in the web workspace.'
      : operator
          ? 'Run production and record human actions. Live sensing and safety interlocks remain with the chamber controller.'
          : 'Review shared evidence independently. Your assessment never replaces a machine reading; document a mismatch for follow-up.';
  List<Record> get alerts => data['alerts']!;
  List<Record> get batches => data['batches']!;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    source = widget.dataSource ?? SupabaseFieldDataSource(client);
    changes = source.changes.listen((_) {
      if (WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        debounce ??= Timer(const Duration(seconds: 5), () {
          debounce = null;
          unawaited(refresh());
        });
      }
    });
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
    debounce?.cancel();
    unawaited(changes?.cancel());
    unawaited(source.dispose());
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> refresh() async {
    if (refreshing) return;
    final request = ++generation;
    if (mounted) setState(() => refreshing = true);
    try {
      final result = await source.load(widget.profile['id'] as int);
      if (mounted && request == generation) {
        setState(() {
          data = {...data, ...result.records};
          if (result.preferences != null) {
            notificationPreferences = result.preferences!;
          }
          unavailable = result.unavailable;
          error = unavailable.isEmpty
              ? null
              : 'Could not refresh: ${unavailable.join(', ')}.';
          if (unavailable.isEmpty) lastSync = DateTime.now();
          loading = false;
        });
      }
    } catch (e) {
      if (mounted && request == generation) {
        setState(() {
          error = readableError(e);
          unavailable = ['workspace'];
          loading = false;
        });
      }
    } finally {
      if (mounted && request == generation) setState(() => refreshing = false);
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
  Future<void> searchWorkspace() async {
    final result = await Navigator.push<Record>(
        context,
        MaterialPageRoute(
            builder: (_) => FieldSearchPage(search: source.search)));
    if (!mounted || result == null) return;
    if (result['kind'] == 'page') {
      setState(() => tab = result['destination'] as int);
      return;
    }
    final payload = Map<String, dynamic>.from(result['payload'] as Map);
    final table = {
      'batch': 'batches',
      'device': 'devices',
      'alert': 'alerts',
      'evaluation': 'evaluations',
      'maintenance': 'maintenance_records',
      'evidence': 'evidence_records',
      'schedule': 'irrigation_schedules'
    }[result['kind']];
    if (table != null) {
      setState(() {
        data[table] = [
          payload,
          ...data[table]!.where((row) => row['id'] != payload['id'])
        ];
      });
    }
    if (result['kind'] == 'batch') {
      await showBatch(payload);
      return;
    }
    if (result['kind'] == 'device') {
      await showDeviceSnapshot(payload);
      return;
    }
    if (result['kind'] == 'alert') {
      await showAlert(payload);
      return;
    }
    const labels = {
      'notes': 'Notes',
      'comments': 'Observations',
      'rating': 'Rating out of 5',
      'result': 'Result',
      'category': 'Category',
      'duration_seconds': 'Duration (seconds)',
      'volume_ml': 'Water delivered (ml)',
      'next_run_at': 'Planned time',
      'performed_at': 'Performed',
      'occurred_at': 'Event time',
      'recorded_at': 'Recorded',
      'created_at': 'Created',
      'evaluator_email': 'Evaluator email',
      'action': 'Action',
      'resource': 'Record'
    };
    await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (sheet) => SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
            child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${result['title']}',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  const Text('Saved workspace record',
                      style: TextStyle(color: FieldColors.muted)),
                  for (final entry in labels.entries)
                    if (payload[entry.key] != null &&
                        '${payload[entry.key]}'.isNotEmpty)
                      Padding(
                          padding: const EdgeInsets.only(top: 18),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(entry.value,
                                    style: const TextStyle(
                                        fontSize: 12,
                                        color: FieldColors.muted)),
                                const SizedBox(height: 4),
                                Text(entry.key.endsWith('_at')
                                    ? displayDate(payload[entry.key])
                                    : '${payload[entry.key]}')
                              ])),
                  const SizedBox(height: 24),
                  SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                          onPressed: () => Navigator.pop(sheet),
                          child: const Text('Close'))),
                ])));
  }

  Future<void> signOut() async {
    final yes = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('Are you sure you want to sign out?'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Sign out'))
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
              final related = table == 'evaluations'
                  ? batches
                      .where((b) => b['id'] == payload['batch_id'])
                      .firstOrNull
                  : data['devices']!
                      .where((d) => d['id'] == payload['device_id'])
                      .firstOrNull;
              if (table == 'maintenance_records' &&
                  related?['is_demo'] == true) {
                payload['is_demo'] = true;
              }
              await source.insert(table, payload);
            })));
    if (saved == true) {
      await refresh();
      toast('Record saved.');
    }
  }

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
                      const SizedBox(height: 8),
                      Text(
                          alert['batch_id'] == null
                              ? 'No batch linked'
                              : 'Batch ${batchName(alert['batch_id'])}',
                          style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF52665A))),
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
                                                    await source.update(
                                                        'alerts',
                                                        alert['id'] as int,
                                                        {'status': status});
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
    final evidence = data['evidence_records']!
        .where((e) => e['batch_id'] == batch['id'])
        .toList();
    final reviews = data['evaluations']!
        .where((e) => e['batch_id'] == batch['id'])
        .toList();
    await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (sheetContext) => SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 4, 24, 28),
            child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('${batch['code']}',
                      style: Theme.of(context).textTheme.headlineMedium),
                  Text('${batch['seed_type']} · Operator #${batch['owner_id']}',
                      style: const TextStyle(color: FieldColors.muted)),
                  const SizedBox(height: 14),
                  Wrap(spacing: 8, children: [
                    FieldTag('${batch['stage']}'),
                    FieldTag('${batch['status']}'),
                    if (batch['is_demo'] == true) const FieldTag('Sample')
                  ]),
                  const SizedBox(height: 16),
                  Text(
                      'Started: ${displayDate(batch['started_at'])}\nTarget harvest: ${displayDate(batch['target_harvest_at'])}'),
                  if ('${batch['notes'] ?? ''}'.trim().isNotEmpty)
                    section('Operator notes', [Text('${batch['notes']}')]),
                  section('Recent shared evidence', [
                    const Text(
                        'Matching items from the latest 50 visible evidence records.',
                        style:
                            TextStyle(fontSize: 12, color: FieldColors.muted)),
                    if (evidence.isEmpty)
                      const Text(
                          'No recent evidence available for this batch.'),
                    for (final item in evidence.take(5))
                      ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.fact_check_outlined),
                          title: Text('${item['title']}'),
                          subtitle: Text(
                              '${item['result']} · ${displayDate(item['recorded_at'])}\n${item['notes'] ?? ''}')),
                  ]),
                  section('Recent human assessments', [
                    const Text(
                        'Matching items from the latest 50 visible assessments.',
                        style:
                            TextStyle(fontSize: 12, color: FieldColors.muted)),
                    if (reviews.isEmpty)
                      const Text(
                          'No recent assessment available for this batch.'),
                    for (final item in reviews.take(5))
                      ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.star_outline,
                              color: FieldColors.amber),
                          title: Text(
                              '${item['rating']}/5 · Evaluator #${item['evaluator_id']}'),
                          subtitle: Text(
                              '${item['comments']}\n${displayDate(item['created_at'])}')),
                  ]),
                  const SizedBox(height: 18),
                  if (operator && batch['status'] != 'archived')
                    FilledButton.icon(
                        onPressed: () {
                          Navigator.pop(sheetContext);
                          unawaited(editBatch(batch));
                        },
                        icon: const Icon(Icons.edit_outlined),
                        label: const Text('Update stage or notes')),
                  if (evaluator) ...[
                    const Text('Your independent assessment'),
                    FieldStars(
                        value: 0,
                        onChanged: (rating) {
                          Navigator.pop(sheetContext);
                          unawaited(submitEvaluation(batch, rating));
                        })
                  ],
                ])));
  }

  Future<void> editBatch(Record batch) async {
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
              await source.update('batches', batch['id'] as int, values);
            })));
    if (saved == true) {
      await refresh();
      toast('Batch updated.');
    }
  }

  Future<void> recordMaintenance([Record? selectedDevice]) async {
    Record? device = selectedDevice;
    if (device == null) {
      final code = await Navigator.of(context).push<String>(MaterialPageRoute(
          builder: (_) => const DeviceScanner(
              title: 'Scan equipment for maintenance',
              helper:
                  'Use the camera to identify the chamber before recording work.',
              manualLabel: 'Or enter equipment serial number')));
      if (!mounted || code == null) return;
      final normalized = code.trim().toLowerCase();
      device = data['devices']!
          .where((item) =>
              item['serial_number'].toString().toLowerCase() == normalized ||
              item['name'].toString().toLowerCase() == normalized)
          .firstOrNull;
    }
    if (device == null) {
      toast('No registered equipment matches that serial number.');
      return;
    }
    await create('maintenance_records', 'Record maintenance', [
      InputField('device_id', 'Equipment',
          initial: '${device['id']}',
          options: {'${device['id']}': '${device['name']}'}),
      const InputField('notes', 'What was inspected or changed?',
          multiline: true)
    ]);
  }

  Future<void> submitEvaluation([Record? batch, int? rating]) async {
    await create('evaluations', 'Submit field assessment', [
      InputField('batch_id', 'Batch',
          initial: batch == null ? '' : '${batch['id']}',
          options: {for (final b in batches) '${b['id']}': '${b['code']}'}),
      InputField('rating', 'Human assessment',
          initial: rating?.toString() ?? '',
          options: const {
            '1': '1 - Poor',
            '2': '2 - Fair',
            '3': '3 - Good',
            '4': '4 - Very good',
            '5': '5 - Excellent'
          }),
      const InputField('comments', 'Comments', multiline: true, maxLength: 2000)
    ]);
  }

  Future<void> scanWorkspace() async {
    final code = await Navigator.of(context).push<String>(MaterialPageRoute(
        builder: (_) => const DeviceScanner(
            title: 'Scan batch or chamber',
            helper:
                'Scan a label where the work happens to open its shared record.',
            manualLabel: 'Or enter batch code or serial number')));
    if (!mounted || code == null) return;
    final normalized = labelIdentity(code).toLowerCase();
    if (normalized.isEmpty) {
      toast('Use a printed batch code, chamber serial, or SproutSync label.');
      return;
    }
    final batch = batches
        .where((item) => item['code'].toString().toLowerCase() == normalized)
        .firstOrNull;
    if (batch != null) {
      await showBatch(batch);
      return;
    }
    final device = data['devices']!
        .where((item) =>
            item['serial_number'].toString().toLowerCase() == normalized ||
            item['name'].toString().toLowerCase() == normalized)
        .firstOrNull;
    if (device != null) {
      await showDeviceSnapshot(device);
      return;
    }
    toast(operator
        ? 'No linked record matches that label. Check the code or register equipment in the web workspace.'
        : 'No shared batch or chamber matches that label. Ask the operator to confirm access.');
  }

  Record? readingFor(Record device) => data['telemetry_readings']!
      .where((item) => item['device_id'] == device['id'])
      .firstOrNull;

  Future<void> showDeviceSnapshot(Record device) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (sheetContext) => SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
          child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ChamberCard(
                    device: device,
                    reading: readingFor(device),
                    sourceUnavailable: sensorUnavailable),
                section('Chamber record', [
                  Text(
                      'Last heartbeat: ${displayDate(device['last_seen_at'])}'),
                  if (device['firmware_version'] != null)
                    Text('Firmware: ${device['firmware_version']}'),
                  const SizedBox(height: 12),
                  const Text(
                      'A saved schedule is a plan. This screen does not start a pump or confirm a completed rinse.'),
                ]),
                section(
                    'Recent maintenance',
                    data['maintenance_records']!
                        .where((m) => m['device_id'] == device['id'])
                        .take(5)
                        .map((m) => ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text('${m['notes']}'),
                            subtitle: Text(displayDate(m['performed_at']))))
                        .toList()),
                if (operator)
                  Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: FilledButton.icon(
                          onPressed: () {
                            Navigator.pop(sheetContext);
                            unawaited(recordMaintenance(device));
                          },
                          icon: const Icon(Icons.build_outlined),
                          label: const Text('Record maintenance'))),
              ])),
    );
  }

  bool get sensorUnavailable => unavailable.any(
      (name) => ['workspace', 'devices', 'telemetry readings'].contains(name));

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
  String get firstName {
    final raw = '${widget.profile['first_name'] ?? ''}'.trim();
    final fallback =
        '${widget.profile['display_name'] ?? ''}'.split(',').last.trim();
    final name = (raw.isEmpty ? fallback : raw).split(RegExp(r'\s+')).first;
    return name.isEmpty
        ? 'grower'
        : name[0].toUpperCase() + name.substring(1).toLowerCase();
  }

  List<Widget> home() {
    final active = batches.where((b) => b['status'] == 'active').toList();
    final openAlerts = alerts.where((a) => a['status'] != 'resolved').toList()
      ..sort((a, b) => (a['severity'] == 'critical' ? 0 : 1)
          .compareTo(b['severity'] == 'critical' ? 0 : 1));
    final schedules = data['irrigation_schedules']!
        .where((s) =>
            s['enabled'] == true &&
            (DateTime.tryParse('${s['next_run_at']}')
                    ?.isAfter(DateTime.now()) ??
                false))
        .toList()
      ..sort((a, b) => '${a['next_run_at']}'.compareTo('${b['next_run_at']}'));
    return [
      Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
            color: FieldColors.mint, borderRadius: BorderRadius.circular(24)),
        child: Row(children: [
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                const Text('YOUR GROWING SPACE',
                    style: TextStyle(
                        fontSize: 10,
                        letterSpacing: 1.4,
                        color: FieldColors.forest,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 12),
                Text('Hello, $firstName.',
                    style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 8),
                Text(
                    evaluator
                        ? 'Your next observation starts here.'
                        : 'A clear start to your next round.',
                    style: const TextStyle(color: FieldColors.muted)),
                const SizedBox(height: 14),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  FieldTag(
                      '${active.length} active ${active.length == 1 ? 'batch' : 'batches'}'),
                  FieldTag(
                      '${openAlerts.length} open ${openAlerts.length == 1 ? 'alert' : 'alerts'}',
                      color: openAlerts.isEmpty
                          ? FieldColors.forest
                          : FieldColors.amber)
                ]),
              ])),
          const SizedBox(width: 8),
          const Icon(Icons.spa_outlined, size: 64, color: Color(0xFF6E9C68))
        ]),
      ),
      const SizedBox(height: 16),
      OutlinedButton.icon(
          key: const ValueKey('field-workspace-search'),
          onPressed: searchWorkspace,
          icon: const Icon(Icons.search),
          label: const Align(
              alignment: Alignment.centerLeft,
              child: Text('Find a batch, chamber or record'))),
      const SizedBox(height: 16),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
            child: FieldShortcut(
                label: 'Scan label',
                icon: Icons.qr_code_scanner,
                onTap: scanWorkspace)),
        const SizedBox(width: 10),
        Expanded(
            child: FieldShortcut(
                label: 'Track batches',
                icon: Icons.spa_outlined,
                onTap: () => setState(() => tab = 1))),
        const SizedBox(width: 10),
        Expanded(
            child: FieldShortcut(
                label: 'Open alerts',
                icon: Icons.notifications_outlined,
                onTap: () => setState(() => tab = 2),
                attention: openAlerts.isNotEmpty)),
      ]),
      if (openAlerts.isNotEmpty)
        section('Needs attention',
            [for (final alert in openAlerts.take(2)) alertCard(alert)]),
      section(
          'Your chambers',
          data['devices']!.isEmpty
              ? [
                  empty(
                      'No chambers are linked. Ask your administrator to register and assign your equipment.')
                ]
              : [
                  for (final device in data['devices']!)
                    ChamberCard(
                        device: device,
                        reading: readingFor(device),
                        sourceUnavailable: sensorUnavailable,
                        onTap: () => showDeviceSnapshot(device))
                ]),
      section('Next planned rinse', [
        if (unavailable.contains('irrigation schedules'))
          const Text(
              'Schedules could not be refreshed. Any plan shown below may be outdated.'),
        if (schedules.isEmpty)
          const Text('No upcoming plan available.')
        else
          Card(
              child: ListTile(
                  leading: const Icon(Icons.water_drop_outlined,
                      color: FieldColors.water),
                  title: Text(deviceName(schedules.first['device_id'])),
                  subtitle: Text(
                      '${displayDate(schedules.first['next_run_at'])} · ${schedules.first['duration_seconds']} seconds${schedules.first['is_demo'] == true ? ' · Sample' : ''}'))),
        const SizedBox(height: 6),
        const Text(
            'Local phone time. A saved plan does not confirm pump execution.',
            style: TextStyle(fontSize: 12, color: FieldColors.muted)),
      ]),
      section(evaluator ? 'Ready to review' : 'On your next round',
          batchCards(active.take(3).toList())),
      TextButton(
          onPressed: () => setState(() => tab = 1),
          child: const Text('See all batches')),
    ];
  }

  Widget alertCard(Record alert) => Card(
          child: ListTile(
        contentPadding: const EdgeInsets.all(16),
        leading: Icon(
            alert['severity'] == 'critical'
                ? Icons.error_outline
                : Icons.notifications_outlined,
            color: alert['severity'] == 'critical'
                ? FieldColors.danger
                : FieldColors.amber),
        title: Text('${alert['title']}',
            style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(
            '${batchName(alert['batch_id'])} · ${alert['severity']}\n${alert['status']} · ${displayDate(alert['created_at'])}'),
        isThreeLine: true,
        trailing: const Icon(Icons.chevron_right),
        onTap: () => showAlert(alert),
      ));

  List<Widget> batchCards(List<Record> records) => records.isEmpty
      ? [
          empty(evaluator
              ? 'No shared batches match. Ask your operator to check your access.'
              : 'No batches match. Start production in the web workspace, then track it here.')
        ]
      : records
          .map((batch) => Card(
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                  onTap: () => showBatch(batch),
                  child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(children: [
                              const Icon(Icons.spa_outlined,
                                  color: FieldColors.forest),
                              const SizedBox(width: 12),
                              Expanded(
                                  child: Text('${batch['code']}',
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleMedium)),
                              const Icon(Icons.chevron_right,
                                  color: FieldColors.muted)
                            ]),
                            const SizedBox(height: 10),
                            Text('${batch['seed_type']} · ${batch['status']}'),
                            const SizedBox(height: 8),
                            Wrap(spacing: 8, runSpacing: 6, children: [
                              FieldTag('${batch['stage']}'),
                              if (batch['is_demo'] == true)
                                const FieldTag('Sample',
                                    color: FieldColors.water)
                            ]),
                            const SizedBox(height: 10),
                            Text(
                                'Started ${displayDate(batch['started_at'])}\nTarget harvest ${displayDate(batch['target_harvest_at'])}',
                                style: const TextStyle(
                                    fontSize: 12, color: FieldColors.muted)),
                            if (evaluator) ...[
                              const SizedBox(height: 10),
                              const Text('Tap a star to assess this batch',
                                  style: TextStyle(fontSize: 12)),
                              FieldStars(
                                  value: 0,
                                  onChanged: (rating) =>
                                      submitEvaluation(batch, rating)),
                            ],
                          ])))))
          .toList();

  List<Widget> batchList() {
    final query = batchSearch.trim().toLowerCase();
    final filtered = batches
        .where((batch) =>
            (batchFilter == 'All' ||
                batch['status'] == batchFilter.toLowerCase()) &&
            ['code', 'seed_type', 'stage', 'owner_id']
                .any((key) => '${batch[key]}'.toLowerCase().contains(query)))
        .toList();
    return [
      Text(evaluator ? 'Review shared production' : 'Keep your round moving',
          style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 8),
      const Text('Find a batch or scan its label to open the right record.',
          style: TextStyle(color: FieldColors.muted)),
      const SizedBox(height: 18),
      TextField(
          key: const ValueKey('batch-search'),
          decoration: const InputDecoration(
              labelText: 'Search batches',
              hintText: 'Code, seed, stage or operator number',
              prefixIcon: Icon(Icons.search)),
          onChanged: (value) => setState(() => batchSearch = value)),
      const SizedBox(height: 12),
      Wrap(spacing: 8, children: [
        for (final filter in ['Active', 'Archived', 'All'])
          ChoiceChip(
              label: Text(filter),
              selected: batchFilter == filter,
              onSelected: (_) => setState(() => batchFilter = filter))
      ]),
      const SizedBox(height: 12),
      Text('${filtered.length} matching batches',
          style: const TextStyle(fontSize: 12, color: FieldColors.muted)),
      ...batchCards(filtered),
    ];
  }

  List<Widget> alertList() {
    final filtered = alerts
        .where((a) =>
            alertFilter == 'All' ||
            (alertFilter == 'Resolved'
                ? a['status'] == 'resolved'
                : a['status'] != 'resolved'))
        .toList();
    return [
      Text('Know what needs a check',
          style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 8),
      const Text(
          'Open an alert for context and the recommended next step. These are in-app records, not background push notifications.',
          style: TextStyle(color: FieldColors.muted)),
      const SizedBox(height: 12),
      Wrap(spacing: 8, children: [
        for (final filter in ['Open', 'Resolved', 'All'])
          ChoiceChip(
              label: Text(filter),
              selected: alertFilter == filter,
              onSelected: (_) => setState(() => alertFilter = filter))
      ]),
      const SizedBox(height: 12),
      if (filtered.isEmpty)
        empty('No $alertFilter alerts available.')
      else
        ...filtered.map(alertCard),
    ];
  }

  List<Widget> account() => [
        Card(
            child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const CircleAvatar(
                          radius: 26,
                          backgroundColor: FieldColors.mint,
                          child: Icon(Icons.person_outline,
                              color: FieldColors.forest)),
                      const SizedBox(height: 14),
                      Text('${widget.profile['display_name'] ?? firstName}',
                          style: Theme.of(context).textTheme.titleLarge),
                      Text('${widget.profile['email'] ?? ''}'),
                      const SizedBox(height: 12),
                      FieldTag(roleLabel),
                      const SizedBox(height: 14),
                      Text(rolePurpose,
                          style: const TextStyle(color: FieldColors.muted)),
                      TextButton.icon(
                          onPressed: () => Navigator.push(
                              context,
                              MaterialPageRoute<void>(
                                  builder: (_) => ProfileForm(
                                      editing: true,
                                      profile: widget.profile,
                                      onSaved: (profile) {
                                        widget.onProfile(profile);
                                        Navigator.pop(context);
                                      }))),
                          icon: const Icon(Icons.edit_outlined),
                          label: const Text('Account details')),
                    ]))),
        section('Notification preferences', [
          const Text(
              'Choose which saved alerts contribute to your in-app badge. Phone push delivery is not enabled.'),
          NotificationSettings(
              userId: widget.profile['id'],
              preferences: notificationPreferences,
              available: !unavailable.any((name) =>
                  ['workspace', 'notification preferences'].contains(name)),
              onRetry: refresh,
              onSave: source.savePreferences,
              onChanged: (preferences) =>
                  setState(() => notificationPreferences = preferences)),
        ]),
        section('About this app', [
          const Text(
              'SproutSync Field is your mobile workspace for chamber checks, label scanning, batch updates and independent assessments. It shares authorized records with the web app. Planning, access administration and exports are handled on the web.'),
          const SizedBox(height: 12),
          const Text(
              'Connection required. The app retains the last view in memory during refresh failures; it does not save an offline copy or queue actions.')
        ]),
        const SizedBox(height: 24),
        OutlinedButton.icon(
            onPressed: signOut,
            icon: const Icon(Icons.logout),
            label: const Text('Sign out')),
      ];

  @override
  Widget build(BuildContext context) {
    final content = switch (tab) {
      0 => home(),
      1 => batchList(),
      2 => alertList(),
      _ => account()
    };
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    return Scaffold(
      appBar: AppBar(
          title:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(['Today', 'Batches', 'Alerts', 'Account'][tab],
                style: const TextStyle(fontWeight: FontWeight.w700)),
            Text('SproutSync Field · $roleLabel',
                style: const TextStyle(fontSize: 11, color: FieldColors.muted)),
          ]),
          actions: [
            IconButton(
                tooltip: 'Search workspace',
                onPressed: searchWorkspace,
                icon: const Icon(Icons.search)),
            IconButton(
                tooltip: 'Scan label',
                onPressed: loading ? null : scanWorkspace,
                icon: const Icon(Icons.qr_code_scanner)),
            IconButton(
                tooltip: 'Refresh workspace',
                onPressed: refreshing ? null : refresh,
                icon: const Icon(Icons.refresh))
          ]),
      body: SafeArea(
          child: loading
              ? const FieldLoading()
              : Column(children: [
                  if (refreshing) const LinearProgressIndicator(minHeight: 2),
                  Expanded(
                      child: AnimatedSwitcher(
                          duration:
                              Duration(milliseconds: reduceMotion ? 0 : 180),
                          transitionBuilder: (child, animation) =>
                              FadeTransition(opacity: animation, child: child),
                          child: RefreshIndicator(
                              key: ValueKey(tab),
                              onRefresh: refresh,
                              child: ListView(
                                  key: PageStorageKey('field-tab-$tab'),
                                  physics:
                                      const AlwaysScrollableScrollPhysics(),
                                  padding:
                                      const EdgeInsets.fromLTRB(20, 12, 20, 32),
                                  children: [
                                    if (error != null)
                                      FieldNotice(
                                          title: lastSync == null
                                              ? 'Workspace partly unavailable'
                                              : 'Showing last available records',
                                          message:
                                              '$error ${lastSync == null ? 'Unavailable sources may be empty.' : 'Last complete sync: ${displayDate(lastSync!.toIso8601String())}. Some records may be outdated.'}',
                                          warning: true,
                                          onRetry: refreshing ? null : refresh)
                                    else
                                      Padding(
                                          padding:
                                              const EdgeInsets.only(bottom: 12),
                                          child: Text(
                                              'Updated ${readingAge(lastSync?.toIso8601String(), DateTime.now())} · Pull to refresh',
                                              style: const TextStyle(
                                                  fontSize: 11,
                                                  color: FieldColors.muted))),
                                    if (batches
                                            .any((b) => b['is_demo'] == true) ||
                                        data['devices']!
                                            .any((d) => d['is_demo'] == true))
                                      const FieldNotice(
                                          title: 'Sample records included',
                                          message:
                                              'Sample batches, chambers and rinse plans are demonstrations. They do not prove live sensor or pump activity.'),
                                    ...content,
                                  ])))),
                ])),
      bottomNavigationBar: NavigationBar(
          selectedIndex: tab,
          onDestinationSelected: (index) => setState(() => tab = index),
          destinations: [
            const NavigationDestination(
                icon: Icon(Icons.wb_sunny_outlined),
                selectedIcon: Icon(Icons.wb_sunny),
                label: 'Today'),
            const NavigationDestination(
                icon: Icon(Icons.spa_outlined),
                selectedIcon: Icon(Icons.spa),
                label: 'Batches'),
            NavigationDestination(
                icon: Badge(
                    isLabelVisible: notificationCount > 0,
                    label: Text('$notificationCount'),
                    child: const Icon(Icons.notifications_outlined)),
                label: 'Alerts'),
            const NavigationDestination(
                icon: Icon(Icons.person_outline),
                selectedIcon: Icon(Icons.person),
                label: 'Account'),
          ]),
    );
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
    if (busy || !form.currentState!.validate()) return;
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
                                  child: f.key == 'rating'
                                      ? FormField<String>(
                                          initialValue:
                                              controllers[f.key]!.text.isEmpty
                                                  ? null
                                                  : controllers[f.key]!.text,
                                          validator: (value) =>
                                              value == null || value.isEmpty
                                                  ? 'Select a rating'
                                                  : null,
                                          builder: (state) => Column(
                                                  crossAxisAlignment:
                                                      CrossAxisAlignment.start,
                                                  children: [
                                                    Text(f.label,
                                                        style: Theme.of(context)
                                                            .textTheme
                                                            .bodySmall),
                                                    const SizedBox(height: 8),
                                                    FieldStars(
                                                        value: int.tryParse(
                                                                state.value ??
                                                                    '') ??
                                                            0,
                                                        onChanged: busy ||
                                                                widget.readOnly
                                                            ? null
                                                            : (rating) {
                                                                controllers[f
                                                                            .key]!
                                                                        .text =
                                                                    '$rating';
                                                                state.didChange(
                                                                    '$rating');
                                                              }),
                                                    const SizedBox(height: 6),
                                                    const Text(
                                                        '1 Poor · 2 Fair · 3 Good · 4 Very good · 5 Excellent',
                                                        style: TextStyle(
                                                            fontSize: 11,
                                                            color: Colors
                                                                .black54)),
                                                    if (state.hasError)
                                                      Padding(
                                                          padding: const EdgeInsets
                                                              .only(top: 6),
                                                          child: Text(
                                                              state.errorText!,
                                                              style: TextStyle(
                                                                  color: Theme.of(
                                                                          context)
                                                                      .colorScheme
                                                                      .error,
                                                                  fontSize:
                                                                      12)))
                                                  ]))
                                      : f.options != null
                                          ? DropdownButtonFormField<String>(
                                              isExpanded: true,
                                              initialValue: controllers[f.key]!.text.isEmpty
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
                                                  : (value) =>
                                                      controllers[f.key]!.text = value ?? '',
                                              validator: (value) => f.required && (value == null || value.isEmpty) ? 'Required' : null)
                                          : TextFormField(controller: controllers[f.key], enabled: !busy && !widget.readOnly, maxLines: f.multiline ? 4 : 1, maxLength: f.multiline ? 2000 : f.maxLength, decoration: InputDecoration(labelText: f.label), validator: (value) => f.required && (value?.trim().isEmpty ?? true) ? 'Required' : null)),
                            if (error != null)
                              Text(error!,
                                  style: TextStyle(
                                      color:
                                          Theme.of(context).colorScheme.error)),
                            if (!widget.readOnly)
                              FilledButton(
                                  onPressed: busy ? null : save,
                                  child: busy
                                      ? const SizedBox(
                                          width: 22,
                                          height: 22,
                                          child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                              color: Colors.white))
                                      : const Text('Save'))
                          ]))))));
}

/// Scans a chamber QR code or accepts its serial number manually.
class DeviceScanner extends StatefulWidget {
  /// Creates the DeviceScanner widget or field definition.
  const DeviceScanner(
      {super.key,
      this.title = 'Scan device QR',
      this.helper = 'Scan the QR code or enter the serial number manually.',
      this.manualLabel = 'Or enter serial number'});

  /// Page title and short instruction shown before the camera.
  final String title, helper, manualLabel;
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
      appBar: AppBar(title: Text(widget.title)),
      body: SafeArea(
          child: ListView(padding: const EdgeInsets.all(24), children: [
        Text(widget.helper, style: Theme.of(context).textTheme.bodyLarge),
        const SizedBox(height: 18),
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
            decoration: InputDecoration(labelText: widget.manualLabel)),
        const SizedBox(height: 16),
        FilledButton(
            onPressed: () => complete(manual.text),
            child: const Text('Continue'))
      ])));
}

/// Persists alert delivery preferences for the signed-in account.
class NotificationSettings extends StatefulWidget {
  /// Creates the NotificationSettings widget or field definition.
  const NotificationSettings(
      {super.key,
      required this.userId,
      required this.preferences,
      required this.onSave,
      this.available = true,
      this.onRetry,
      this.onChanged});

  /// Last confirmed settings for the signed-in user.
  final Record preferences;

  /// Persists changes through the authenticated source.
  final Future<Record> Function(Record) onSave;

  /// Whether these preferences were successfully loaded.
  final bool available;

  /// Reloads after a source failure.
  final VoidCallback? onRetry;

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
  void didUpdateWidget(covariant NotificationSettings oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!busy &&
        (oldWidget.preferences['alerts_enabled'] !=
                widget.preferences['alerts_enabled'] ||
            oldWidget.preferences['harvest_enabled'] !=
                widget.preferences['harvest_enabled'])) {
      alerts = null;
      harvest = null;
    }
  }

  Future<void> save(bool a, bool h) async {
    setState(() => busy = true);
    try {
      await widget.onSave({
        'user_id': widget.userId,
        'alerts_enabled': a,
        'harvest_enabled': h,
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
        if (!widget.available)
          FieldNotice(
              title: 'Preferences unavailable',
              message: 'Refresh before changing your badge settings.',
              warning: true,
              onRetry: widget.onRetry)
        else ...[
          SwitchListTile(
              title: const Text('Alert badge'),
              value: alerts ?? widget.preferences['alerts_enabled'] == true,
              onChanged: busy
                  ? null
                  : (value) => save(
                      value,
                      harvest ??
                          widget.preferences['harvest_enabled'] == true)),
          SwitchListTile(
              title: const Text('Harvest badge'),
              value: harvest ?? widget.preferences['harvest_enabled'] == true,
              onChanged: busy
                  ? null
                  : (value) => save(
                      alerts ?? widget.preferences['alerts_enabled'] == true,
                      value))
        ],
        if (error != null)
          FieldNotice(
              title: 'Preferences were not saved',
              message: error!,
              warning: true,
              onRetry: widget.onRetry),
      ]);
}
