# SproutSync Mobile

The Flutter app shares Supabase Auth and database access policies with the web app.
Android, iOS and web host projects are included.

The app provides verified email/password signup, Google sign-in, inbox verification
for new Google accounts, prefilled profile confirmation, and five main tabs:
Home, Batches, Alerts, Reports and More. Operators can manage batches, register
devices by QR/serial, record maintenance, and acknowledge or resolve alerts.
Evaluators can review shared/sample records and submit evaluations. Account and
notification settings persist in Supabase. Pull-to-refresh and a foreground
30-second refresh keep records current.

## Run and validate

Use Flutter stable (the local SDK is at `../.tools/flutter`):

```powershell
flutter pub get
flutter analyze
flutter test
flutter run --dart-define-from-file=config.local.json
```

The ignored `config.local.json` file should contain only the public client values:

```json
{
  "SUPABASE_URL": "https://your-project.supabase.co",
  "SUPABASE_ANON_KEY": "your-public-client-key"
}
```

Never put service-role keys, database passwords, SMTP passwords, or Google client
secrets in a mobile build. Row-level policies enforce user access to the database.

## Build the downloadable Android preview

From the repository root, after configuring `.env` and Android/Java tooling:

```powershell
backend/api/.venv/Scripts/python.exe scripts/build_mobile.py
```

The helper reads only the public Supabase values into a temporary build definition,
builds the ARM64 APK, and places it in
`frontend/dashboard/public/downloads/sproutsync-preview.apk` with a release manifest
and SHA-256 checksum. The web app's **Download mobile app** button opens the
download page and automatically starts this APK download. The binary is ignored
by Git; rerun the build helper before deploying the web bundle on another machine.

This is a development preview using Android's development signing certificate,
not a Play Store release. It targets Android 7.0+ on ARM64 phones. The build keeps
the full icon font because Windows application control blocks the local Flutter
font-subset optimizer. Store distribution needs a production signing key. iOS
distribution requires macOS/Xcode and an Apple signing identity.

## Supabase Auth setup

Apply the Alembic migrations and the email templates described in
[`docs/workspace-release.md`](../docs/workspace-release.md). Add
`io.sproutsync.app://login-callback/` to the Supabase redirect allowlist. Android
and iOS deep-link handlers and camera-permission descriptions are included.

Database sample records are labelled and shared through RLS. Wi-Fi provisioning
and physical irrigation remain controller responsibilities. Native push delivery
and offline telemetry caching are separate hardware/platform integration work.
