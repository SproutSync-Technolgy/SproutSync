import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Native callback registered in Android, iOS and Supabase's redirect allowlist.
const nativeAuthCallback = 'io.sproutsync.app://login-callback/';

/// Returns to the installed app on phones, never a development web server.
String authCallbackUrl({bool isWeb = kIsWeb, Uri? webLocation}) {
  if (!isWeb) return nativeAuthCallback;
  final location = webLocation ?? Uri.base;
  if (!['http', 'https'].contains(location.scheme) || location.host.isEmpty) {
    throw ArgumentError(
        'Web authentication requires an HTTP(S) application URL.');
  }
  return Uri(
          scheme: location.scheme,
          host: location.host,
          port: location.hasPort ? location.port : null,
          path: location.path)
      .toString();
}

/// Uses the system browser on phones so Google can return through the app link.
LaunchMode authBrowserLaunchMode({bool isWeb = kIsWeb}) =>
    isWeb ? LaunchMode.platformDefault : LaunchMode.externalApplication;
