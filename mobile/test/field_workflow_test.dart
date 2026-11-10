import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sproutsync_mobile/field_data.dart';
import 'package:sproutsync_mobile/field_widgets.dart';
import 'package:sproutsync_mobile/screens.dart';

class _MemoryFieldSource implements FieldDataSource {
  final events = StreamController<void>.broadcast();
  final Map<String, List<FieldRecord>> records = {
    for (final table in fieldTables) table: [],
    'devices': [
      {
        'id': 7,
        'name': 'Growing chamber',
        'serial_number': 'SS-007',
        'status': 'online',
        'last_seen_at': DateTime.now().toUtc().toIso8601String()
      }
    ],
    'telemetry_readings': [
      {
        'id': 2,
        'device_id': 7,
        'temperature_c': 25.4,
        'humidity_percent': 68.2,
        'recorded_at': DateTime.now().toUtc().toIso8601String()
      }
    ],
    'batches': [
      {
        'id': 11,
        'owner_id': 20,
        'code': 'MB-011',
        'seed_type': 'Mung bean',
        'stage': 'growing',
        'status': 'active',
        'started_at': '2026-11-01T08:00:00Z',
        'target_harvest_at': '2026-11-12T08:00:00Z',
        'notes': 'Inspect before harvest',
        'is_demo': true
      },
      {
        'id': 12,
        'owner_id': 20,
        'code': 'MB-012',
        'seed_type': 'Soybean',
        'stage': 'harvested',
        'status': 'archived'
      },
    ],
    'alerts': [
      {
        'id': 4,
        'title': 'Inspect tank level',
        'severity': 'critical',
        'status': 'active',
        'message': 'Check water supply.',
        'recommended_action': 'Inspect the chamber.',
        'batch_id': 11,
        'created_at': '2026-11-10T08:00:00Z'
      }
    ],
  };
  int loads = 0;
  bool failWrite = false, failLoad = false;
  Completer<void>? gate;
  FieldRecord? saved;
  String? savedTable;
  FieldRecord preferences = {'alerts_enabled': true, 'harvest_enabled': true};
  @override
  Stream<void> get changes => events.stream;
  @override
  Future<FieldSnapshot> load(int userId) async {
    loads++;
    await gate?.future;
    if (failLoad) throw StateError('Offline');
    return FieldSnapshot(Map.from(records), preferences: preferences);
  }

  @override
  Future<FieldRecord> insert(String table, FieldRecord values) async {
    if (failWrite) throw StateError('Denied');
    savedTable = table;
    saved = Map.from(values);
    return {'id': 99, ...values};
  }

  @override
  Future<FieldRecord> update(String table, int id, FieldRecord values) async {
    if (failWrite) throw StateError('Denied');
    savedTable = table;
    saved = {'id': id, ...values};
    final row = records[table]!.firstWhere((row) => row['id'] == id);
    row.addAll(values);
    return row;
  }

  @override
  Future<FieldRecord> savePreferences(FieldRecord values) async {
    if (failWrite) throw StateError('Denied');
    preferences = values;
    return values;
  }

  @override
  Future<void> dispose() => events.close();
}

const _capture = bool.fromEnvironment('CAPTURE_MOBILE');
final _boundary = GlobalKey();
bool _fontsLoaded = false;

Future<void> _launch(WidgetTester tester, _MemoryFieldSource source,
    {String role = 'operator', double width = 390, double scale = 1}) async {
  tester.view.physicalSize = Size(width, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(RepaintBoundary(
      key: _boundary,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: _fontsLoaded
            ? fieldTheme().copyWith(
                textTheme: fieldTheme().textTheme.apply(fontFamily: 'Roboto'))
            : fieldTheme(),
        builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(scale)),
            child: child!),
        home: MobileWorkspace(profile: {
          'id': 20,
          'role': role,
          'first_name': 'PAT',
          'display_name': 'Pat Green',
          'email': 'pat@example.invalid'
        }, onProfile: (_) {}, dataSource: source),
      )));
  await tester.pump();
}

Future<void> _screenshot(WidgetTester tester, String name) async {
  if (!_capture) return;
  await tester.pumpAndSettle();
  await tester.runAsync(() async {
    final image = await (_boundary.currentContext!.findRenderObject()
            as RenderRepaintBoundary)
        .toImage(pixelRatio: 2);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final file = File('../.tools/mobile-review/$name.png');
    await file.parent.create(recursive: true);
    await file.writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  WidgetController.hitTestWarningShouldBeFatal = true;
  setUpAll(() async {
    final root = Platform.environment['FLUTTER_ROOT'] ?? '../.tools/flutter';
    for (final font in {
      'Roboto': 'roboto-regular.ttf',
      'MaterialIcons': 'materialicons-regular.otf'
    }.entries) {
      final file =
          File('$root/bin/cache/artifacts/material_fonts/${font.value}');
      if (!file.existsSync()) continue;
      final loader = FontLoader(font.key)
        ..addFont(
            file.readAsBytes().then((bytes) => ByteData.sublistView(bytes)));
      await loader.load();
      _fontsLoaded = true;
    }
  });
  test('reading age and scanner identities reject unsafe or invalid provenance',
      () {
    final now = DateTime.utc(2026, 11, 10, 10);
    expect(isRecent('2026-11-10T09:59:00Z', now), isTrue);
    expect(isRecent('2026-11-10T09:40:00Z', now), isFalse);
    expect(isRecent('2026-11-10T11:00:00Z', now), isFalse);
    expect(readingAge(null, now), 'Time unavailable');
    expect(labelIdentity(' sproutsync://batch/MB-011 '), 'MB-011');
    expect(labelIdentity('https://attacker.invalid/MB-011'), isEmpty);
    expect(labelIdentity('SS-007'), 'SS-007');
  });

  test('semantic foreground colors retain readable contrast on field surfaces',
      () {
    for (final foreground in [
      FieldColors.forest,
      FieldColors.water,
      FieldColors.amber,
      FieldColors.danger,
      FieldColors.ink,
      FieldColors.muted
    ]) {
      for (final background in [Colors.white, FieldColors.canvas]) {
        final ratio = (background.computeLuminance() + .05) /
            (foreground.computeLuminance() + .05);
        expect(ratio, greaterThanOrEqualTo(4.5));
      }
    }
  });

  testWidgets(
      'operator updates the selected batch and records maintenance against its chamber',
      (tester) async {
    final source = _MemoryFieldSource();
    await _launch(tester, source);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Batches').last);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('MB-011'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('MB-011'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Update stage or notes'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Update stage or notes'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byType(TextFormField), 'Inspected during morning round.');
    await tester.ensureVisible(find.text('Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(source.savedTable, 'batches');
    expect(source.records['batches']!.first['notes'],
        'Inspected during morning round.');
    await tester.tap(find.text('Today').last);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byType(ChamberCard), 250);
    await tester.ensureVisible(find.text('Growing chamber'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Growing chamber'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Record maintenance'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Record maintenance'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byType(TextFormField), 'Cleaned the tray rails.');
    await tester.ensureVisible(find.text('Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(source.savedTable, 'maintenance_records');
    expect(source.saved, containsPair('device_id', 7));
    expect(source.saved, containsPair('owner_id', 20));
    expect(source.saved, containsPair('notes', 'Cleaned the tray rails.'));
    expect(tester.takeException(), isNull);
  });

  testWidgets('loading does not pretend the workspace has zero records',
      (tester) async {
    final source = _MemoryFieldSource()..gate = Completer<void>();
    await _launch(tester, source);
    expect(find.byType(FieldLoading), findsOneWidget);
    expect(find.text('0 active batches'), findsNothing);
    source.gate!.complete();
    await tester.pumpAndSettle();
    expect(find.text('Hello, Pat.'), findsOneWidget);
    expect(find.text('1 active batch'), findsOneWidget);
    expect(find.text('Sample records included'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await _screenshot(tester, 'today');
  });

  testWidgets('batch search and archive filters work without scanning',
      (tester) async {
    await _launch(tester, _MemoryFieldSource());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Batches').last);
    await tester.pumpAndSettle();
    expect(find.text('MB-011'), findsOneWidget);
    expect(find.text('MB-012'), findsNothing);
    await tester.tap(find.text('All').last);
    await tester.enterText(find.byKey(const ValueKey('batch-search')), 'soy');
    await tester.pumpAndSettle();
    expect(find.text('MB-012'), findsOneWidget);
    expect(find.text('MB-011'), findsNothing);
    await tester.enterText(find.byKey(const ValueKey('batch-search')), '');
    await tester.pumpAndSettle();
    await _screenshot(tester, 'batches');
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'assessment carries selected batch and stars; a failure preserves comments for retry',
      (tester) async {
    final source = _MemoryFieldSource()..failWrite = true;
    await _launch(tester, source, role: 'evaluator');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Batches').last);
    await tester.pumpAndSettle();
    final stars = find.byTooltip('Rate 4 out of 5').first;
    await tester.ensureVisible(stars);
    await tester.pumpAndSettle();
    await tester.tap(stars);
    await tester.pumpAndSettle();
    expect(tester.widget<FieldStars>(find.byType(FieldStars)).value, 4);
    expect(find.text('MB-011'), findsOneWidget);
    expect(source.saved, isNull);
    await _screenshot(tester, 'assessment');
    await tester.enterText(
        find.byType(TextFormField), 'Good growth; inspect humidity probe.');
    await tester.ensureVisible(find.text('Save'));
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.text('Good growth; inspect humidity probe.'), findsOneWidget);
    expect(source.saved, isNull);
    source.failWrite = false;
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(source.savedTable, 'evaluations');
    expect(source.saved, containsPair('batch_id', 11));
    expect(source.saved, containsPair('rating', 4));
    expect(source.saved, containsPair('evaluator_id', 20));
    expect(source.saved!.containsKey('is_demo'), isFalse);
    expect(source.saved!.containsKey('owner_id'), isFalse);
    expect(find.byType(RecordEditor), findsNothing);
  });

  testWidgets(
      'alert failure keeps detail open and retry changes the actual record',
      (tester) async {
    final source = _MemoryFieldSource()..failWrite = true;
    await _launch(tester, source);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Alerts').last);
    await tester.pumpAndSettle();
    await _screenshot(tester, 'alerts');
    await tester.tap(find.text('Inspect tank level'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Acknowledge'));
    await tester.pumpAndSettle();
    expect(source.records['alerts']!.single['status'], 'active');
    expect(find.text('Recommended action'), findsOneWidget);
    source.failWrite = false;
    await tester.tap(find.text('Acknowledge'));
    await tester.pumpAndSettle();
    expect(source.records['alerts']!.single['status'], 'acknowledged');
    expect(find.text('Recommended action'), findsNothing);
  });

  testWidgets(
      'failed refresh retains readings but never calls the chamber connected',
      (tester) async {
    final source = _MemoryFieldSource();
    await _launch(tester, source);
    await tester.pumpAndSettle();
    source.failLoad = true;
    await tester.tap(find.byTooltip('Refresh workspace'));
    await tester.pumpAndSettle();
    expect(find.text('Showing last available records'), findsOneWidget);
    await tester.scrollUntilVisible(find.byType(ChamberCard), 250);
    expect(find.text('Unavailable'), findsOneWidget);
    expect(find.text('Recent heartbeat'), findsNothing);
    expect(find.text('25.4°C'), findsOneWidget);
    await _screenshot(tester, 'chamber-unavailable');
    source.failLoad = false;
    await tester.tap(find.byTooltip('Refresh workspace'));
    await tester.pumpAndSettle();
    expect(find.text('Showing last available records'), findsNothing);
  });

  testWidgets(
      'phone layout supports large text and actionable account settings',
      (tester) async {
    final source = _MemoryFieldSource();
    await _launch(tester, source, width: 320, scale: 1.6);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Account').last);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Alert badge'), 250);
    await tester.ensureVisible(find.byType(Switch).first);
    await tester.pumpAndSettle();
    source.failWrite = true;
    await tester.tap(find.byType(Switch).first);
    await tester.pumpAndSettle();
    expect(tester.widget<Switch>(find.byType(Switch).first).value, isTrue);
    source.failWrite = false;
    await tester.ensureVisible(find.byType(Switch).first);
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Switch).first);
    await tester.pumpAndSettle();
    expect(source.preferences['alerts_enabled'], isFalse);
    expect(tester.widget<Switch>(find.byType(Switch).first).value, isFalse);
    expect(tester.takeException(), isNull);
    await _screenshot(tester, 'account-large-text');
  });
}
