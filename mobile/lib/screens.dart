import 'dart:async';
import 'package:flutter/material.dart';
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
  bool get admin => widget.profile['role'] == 'admin';
  String get roleLabel => admin ? 'Admin IT' : operator ? 'Operator' : 'Evaluator';
  String get rolePurpose => admin
      ? 'Register equipment and provision access without replacing operator production decisions or evaluator judgment.'
      : operator
          ? 'Run production and record human actions. Live sensing and safety interlocks remain with the chamber controller.'
          : 'Review shared evidence independently. Your assessment never replaces a machine reading; document a mismatch for follow-up.';
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
                      const SizedBox(height: 8),
                      Text(alert['batch_id'] == null
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

  Future<void> recordMaintenance() async {
    final code = await Navigator.of(context).push<String>(MaterialPageRoute(
        builder: (_) => const DeviceScanner(
            title: 'Scan equipment for maintenance',
            helper:
                'Use the camera to identify the chamber before recording work.',
            manualLabel: 'Or enter equipment serial number')));
    if (!mounted || code == null) return;
    final normalized = code.trim().toLowerCase();
    final device = data['devices']!
        .where((item) =>
            item['serial_number'].toString().toLowerCase() == normalized ||
            item['name'].toString().toLowerCase() == normalized)
        .firstOrNull;
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

  Future<void> showIncidentDraft() async {
    await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (context) => Padding(
            padding: EdgeInsets.fromLTRB(
                24, 8, 24, MediaQuery.viewInsetsOf(context).bottom + 24),
            child: SingleChildScrollView(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                  Text('Report current situation',
                      style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 8),
                  const Text(
                      'UI draft only. Submission is not connected, so no incident will be saved.',
                      style: TextStyle(color: Colors.black54)),
                  const SizedBox(height: 18),
                  const Wrap(spacing: 8, runSpacing: 8, children: [
                    Chip(label: Text('1 Describe')),
                    Chip(label: Text('2 Locate')),
                    Chip(label: Text('3 Link records')),
                    Chip(label: Text('4 Escalate'))
                  ]),
                  const SizedBox(height: 18),
                  const TextField(
                      maxLines: 3,
                      decoration:
                          InputDecoration(labelText: 'Current situation')),
                  const SizedBox(height: 14),
                  const TextField(
                      decoration: InputDecoration(
                          labelText: 'Location or component',
                          hintText: 'For example 3D fan, seal, pump or tray')),
                  const SizedBox(height: 14),
                  TextField(
                      decoration: InputDecoration(
                          labelText: 'Affected batch',
                          hintText: batches.isEmpty
                              ? 'No shared batches available'
                              : 'Type a batch code')),
                  const SizedBox(height: 14),
                  const DropdownMenu<String>(
                      expandedInsets: EdgeInsets.zero,
                      label: Text('Risk category'),
                      dropdownMenuEntries: [
                        DropdownMenuEntry(
                            value: 'pests',
                            label: 'Pests or external contamination'),
                        DropdownMenuEntry(
                            value: 'water', label: 'Water contamination'),
                        DropdownMenuEntry(
                            value: 'compliance', label: 'Compliance risk'),
                        DropdownMenuEntry(
                            value: 'light', label: 'Light leak'),
                        DropdownMenuEntry(
                            value: 'equipment', label: 'Equipment problem')
                      ]),
                  const SizedBox(height: 14),
                  const TextField(
                      decoration:
                          InputDecoration(labelText: 'Screen or LCD message')),
                  const SizedBox(height: 18),
                  const FilledButton(
                      onPressed: null,
                      child: Text('Submit incident report'))
                ]))));
  }

  Future<void> submitEvaluation() async {
    await create('evaluations', 'Submit field assessment', [
      batchField,
      const InputField('rating', 'Human assessment', options: {
        '1': '1 - Poor',
        '2': '2 - Fair',
        '3': '3 - Good',
        '4': '4 - Very good',
        '5': '5 - Excellent'
      }),
      const InputField(
          'comments', 'Observations or disagreement with machine data',
          multiline: true)
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
    final normalized = code.trim().toLowerCase();
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
        ? 'No linked record matches that label. Register a new chamber from More if needed.'
        : 'No shared batch or chamber matches that label. Ask the operator to confirm access.');
  }

  Future<void> showDeviceSnapshot(Record device) async {
    final reading = data['telemetry_readings']!
        .where((item) => item['device_id'] == device['id'])
        .firstOrNull;
    await showModalBottomSheet<void>(
        context: context,
        useSafeArea: true,
        showDragHandle: true,
        builder: (context) => Padding(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 28),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const CircleAvatar(child: Icon(Icons.sensors)),
                  title: Text(device['name'],
                      style: Theme.of(context).textTheme.titleLarge),
                  subtitle: Text(
                      '${device['status']} · Last seen ${displayDate(device['last_seen_at'])}')),
              const Divider(),
              if (reading == null)
                const Padding(
                    padding: EdgeInsets.all(20),
                    child: Text('No machine reading is available yet.'))
              else
                ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.monitor_heart_outlined),
                    title: Text(
                        '${reading['temperature_c'] ?? '—'}°C · ${reading['humidity_percent'] ?? '—'}% humidity'),
                    subtitle: Text(
                        'Machine reading · ${displayDate(reading['recorded_at'])}'))
            ])));
  }

  Widget card(String title, String value, IconData icon) => Card(
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
  Widget roleScopeCard() => Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
          color: const Color(0xFFEEF7F1),
          border: Border.all(color: const Color(0xFFDCEFE2)),
          borderRadius: BorderRadius.circular(16)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Icon(Icons.verified_user_outlined, color: Color(0xFF1F6F45)),
        const SizedBox(width: 14),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('$roleLabel field scope',
              style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(rolePurpose, style: const TextStyle(color: Color(0xFF52665A)))
        ]))
      ]));
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
          'Active alerts',
          '${alerts.where((a) => a['status'] != 'resolved').length}',
          Icons.notifications_outlined),
      card(
          'Latest temperature',
          latest?['temperature_c'] == null
              ? '—'
              : '${latest!['temperature_c']}°C',
          Icons.thermostat),
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
                    ? 'Today’s production priorities, ready for the floor.'
                    : 'Shared work that is ready for independent review.',
                style: const TextStyle(color: Colors.white70))
          ])),
      const SizedBox(height: 12),
      roleScopeCard(),
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

  List<Widget> scanTools() => [
        Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
                color: const Color(0xFF123F2B),
                borderRadius: BorderRadius.circular(20)),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.qr_code_scanner,
                  size: 34, color: Color(0xFFDCEFE2)),
              const SizedBox(height: 18),
              const Text('Open the record in front of you',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              const Text(
                  'Scan a batch or chamber label to avoid searching and reduce entry mistakes.',
                  style: TextStyle(color: Color(0xFFC9DED0), height: 1.5)),
              const SizedBox(height: 20),
              FilledButton.icon(
                  onPressed: scanWorkspace,
                  icon: const Icon(Icons.center_focus_strong),
                  label: const Text('Scan label'))
            ])),
        const SizedBox(height: 18),
        section('Quick capture', [
          if (operator)
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              OutlinedButton.icon(
                  onPressed:
                      data['devices']!.isEmpty ? null : recordMaintenance,
                  icon: const Icon(Icons.camera_alt_outlined),
                  label: const Text('Scan equipment & record maintenance')),
              const SizedBox(height: 8),
              const Text(
                  'The camera identifies the equipment. Maintenance photo upload is not connected yet.',
                  style: TextStyle(fontSize: 12, color: Colors.black54)),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                  onPressed: showIncidentDraft,
                  icon: const Icon(Icons.report_problem_outlined),
                  label: const Text('Report current situation'))
            ])
          else
            OutlinedButton.icon(
                onPressed: batches.isEmpty ? null : submitEvaluation,
                icon: const Icon(Icons.fact_check_outlined),
                label: const Text('Submit field assessment'))
        ]),
        const Padding(
            padding: EdgeInsets.only(top: 18),
            child: Text(
                'Planning, printable historical reports, and account access remain in the web workspace.',
                style: TextStyle(color: Color(0xFF52665A))))
      ];

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
                      Text('${b['seed_type']} · ${b['stage']}\n${b['status']} · Operator #${b['owner_id']}'),
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
            'Sensors & chamber equipment',
            data['devices']!.isEmpty
                ? [empty('No equipment is linked yet.')]
                : data['devices']!
                    .map((d) => Card(
                        child: ListTile(
                            leading: const Icon(Icons.sensors),
                            title: Text(d['name']),
                            subtitle: Text(
                                'Serial ${d['serial_number']}\n${d['status']} · Last seen ${displayDate(d['last_seen_at'])}'),
                            isThreeLine: true)))
                    .toList()),
        if (admin)
          OutlinedButton.icon(
              onPressed: addDevice,
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Register equipment')),
        const Padding(
            padding: EdgeInsets.all(8),
            child: Text(
                'Admin IT registers equipment. Connect a registered chamber to Wi-Fi through its controller setup; it stays pending until a heartbeat is received.',
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
    final content = switch (tab) {
      0 => home(),
      1 => scanTools(),
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
                          '${a['batch_id'] == null ? 'No batch linked' : 'Batch ${batchName(a['batch_id'])}'}\n${a['status']} · ${displayDate(a['created_at'])}'),
                      isThreeLine: true,
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => showAlert(a))))
              .toList(),
      _ => more(),
    };
    return Scaffold(
        appBar: AppBar(
            title: Text(['Today', 'Scan', 'Alerts', 'More'][tab],
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
                  icon: Icon(Icons.today_outlined),
                  selectedIcon: Icon(Icons.today),
                  label: 'Today'),
              NavigationDestination(
                  icon: Icon(Icons.qr_code_scanner), label: 'Scan'),
              NavigationDestination(
                  icon: Icon(Icons.notifications_outlined), label: 'Alerts'),
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
                                  child: f.key == 'rating'
                                      ? FormField<String>(
                                          initialValue: controllers[f.key]!
                                                  .text
                                                  .isEmpty
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
                                                SegmentedButton<String>(
                                                    multiSelectionEnabled:
                                                        false,
                                                    emptySelectionAllowed: true,
                                                    showSelectedIcon: false,
                                                    segments: [
                                                      for (final value in [
                                                        '1',
                                                        '2',
                                                        '3',
                                                        '4',
                                                        '5'
                                                      ])
                                                        ButtonSegment(
                                                            value: value,
                                                            icon: const Icon(
                                                                Icons.star_outline,
                                                                size: 18),
                                                            label: Text(value))
                                                    ],
                                                    selected: state.value == null
                                                        ? <String>{}
                                                        : {state.value!},
                                                    onSelectionChanged:
                                                        busy || widget.readOnly
                                                            ? null
                                                            : (selection) {
                                                                final value =
                                                                    selection
                                                                            .isEmpty
                                                                        ? null
                                                                        : selection
                                                                            .first;
                                                                controllers[f
                                                                            .key]!
                                                                        .text =
                                                                    value ?? '';
                                                                state.didChange(
                                                                    value);
                                                              }),
                                                const SizedBox(height: 6),
                                                const Text(
                                                    '1 Poor · 2 Fair · 3 Good · 4 Very good · 5 Excellent',
                                                    style: TextStyle(
                                                        fontSize: 11,
                                                        color:
                                                            Colors.black54)),
                                                if (state.hasError)
                                                  Padding(
                                                      padding:
                                                          const EdgeInsets.only(
                                                              top: 6),
                                                      child: Text(
                                                          state.errorText!,
                                                          style: TextStyle(
                                                              color: Theme.of(
                                                                      context)
                                                                  .colorScheme
                                                                  .error,
                                                              fontSize: 12)))
                                              ]))
                                      : f.options != null
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
