import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sproutsync_mobile/main.dart';
import 'package:sproutsync_mobile/screens.dart';

void main() {
  testWidgets('Google details are prefilled, reviewable and editable',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: ProfileForm(profile: const {
      'email': 'pat@example.invalid',
      'first_name': 'Pat',
      'last_name': 'Green',
      'organization': 'Sprout Lab',
      'phone': '',
      'registration_provider': 'google',
    }, onSaved: (_) {})));
    expect(find.text('Pat'), findsOneWidget);
    expect(find.text('Green'), findsOneWidget);
    expect(find.byType(TextFormField), findsNothing);
    await tester.tap(find.text('Edit information'));
    await tester.pumpAndSettle();
    expect(find.byType(TextFormField), findsNWidgets(4));
    expect(find.text('Pat'), findsOneWidget);
  });
  testWidgets('record validation prevents empty database writes',
      (tester) async {
    var writes = 0;
    await tester.pumpWidget(MaterialApp(
        home: RecordEditor(
            title: 'Create batch',
            fields: const [InputField('code', 'Batch code')],
            onSave: (_) async {
              writes++;
            })));
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.text('Required'), findsOneWidget);
    expect(writes, 0);
  });
  testWidgets('evaluator record editor hides operational save controls',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: RecordEditor(
            title: 'Review batch',
            readOnly: true,
            fields: const [InputField('notes', 'Notes', initial: 'Growing')],
            onSave: (_) async {})));
    expect(find.text('Save'), findsNothing);
    expect(tester.widget<TextFormField>(find.byType(TextFormField)).enabled,
        isFalse);
  });
}
