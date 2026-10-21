import 'package:flutter_test/flutter_test.dart';
import 'package:sproutsync_mobile/main.dart';

void main() {
  testWidgets('shows the mobile scaffold status', (tester) async {
    await tester.pumpWidget(const SproutSyncMobileApp());

    expect(find.text('Mobile foundation ready'), findsOneWidget);
    expect(find.text('Good morning, grower'), findsOneWidget);
  });
}
