import 'package:flutter_test/flutter_test.dart';
import 'package:sproutsync_mobile/main.dart';

void main() {
  testWidgets('shows setup instead of fabricated readings when unconfigured',
      (tester) async {
    await tester.pumpWidget(const SproutSyncMobileApp());

    expect(find.text('Welcome to SproutSync'), findsOneWidget);
    expect(find.textContaining('SUPABASE_URL'), findsOneWidget);
  });
}
