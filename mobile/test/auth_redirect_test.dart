import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:sproutsync_mobile/auth_redirect.dart';

void main() {
  test('APK callbacks never inherit localhost from a web location', () {
    final callback = authCallbackUrl(
        isWeb: false, webLocation: Uri.parse('http://localhost:5173/'));
    expect(callback, 'io.sproutsync.app://login-callback/');
    expect(authBrowserLaunchMode(isWeb: false), LaunchMode.externalApplication);
  });

  test('web callback stays on its host without replaying old auth parameters',
      () {
    expect(
        authCallbackUrl(
            isWeb: true,
            webLocation:
                Uri.parse('https://sproutsync.example/mobile?code=old#old')),
        'https://sproutsync.example/mobile');
    expect(authBrowserLaunchMode(isWeb: true), LaunchMode.platformDefault);
    expect(
        () =>
            authCallbackUrl(isWeb: true, webLocation: Uri.parse('file:///app')),
        throwsArgumentError);
  });

  test('native callback matches both platform registrations', () {
    final callback = Uri.parse(nativeAuthCallback);
    final android =
        File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
    final ios = File('ios/Runner/Info.plist').readAsStringSync();
    expect(android, contains('android:scheme="${callback.scheme}"'));
    expect(android, contains('android:host="${callback.host}"'));
    expect(ios, contains('<string>${callback.scheme}</string>'));
  });
}
