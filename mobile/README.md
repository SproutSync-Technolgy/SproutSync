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

### Google sign-in opens localhost on the phone

`localhost` on a phone means the phone itself, not your development computer.
If Google completes sign-in and the browser opens `http://localhost:5173`,
hosted Supabase Auth is falling back to its Site URL instead of the native callback.
Changing the computer's IP address in the APK is not the solution.

1. Open your Supabase project's **Authentication > URL Configuration**.
2. Under **Redirect URLs**, add exactly `io.sproutsync.app://login-callback/`
   (including the trailing slash), then save. Keep existing web redirect entries.
3. In Google Cloud's web OAuth client, keep the authorized redirect URI as
   `https://<your-project>.supabase.co/auth/v1/callback`. The custom app URI belongs
   in Supabase, not in Google's web client configuration.
4. Close the failed browser tab and start a fresh Google sign-in from the APK.
   A previous failed callback cannot be reused. Allow the browser to open SproutSync
   when prompted. Both the phone and computer can use different networks; the APK
   talks directly to hosted Supabase and does not need a local backend for sign-in.

From the repository root, check the actual hosted redirect without signing in
or sending an email:

```powershell
backend/api/.venv/Scripts/python.exe scripts/check_mobile_auth.py
```

The check starts its own anonymous OAuth authorization without following Google,
then inspects only that request's redirect metadata. Both printed addresses should
be `io.sproutsync.app://login-callback/`. For Auth versions with opaque state it
uses `DATABASE_URL` locally for a read-only lookup of its own flow; database
credentials never go in the APK. It does not change hosted Auth settings.

The app uses the system browser on native platforms and a single callback helper
for OAuth, signup, resends, inbox verification and recovery. Regression tests
check that native callbacks cannot inherit localhost and match Android/iOS
registrations. Changing the allowlist alone also fixes this redirect in the older
APK; version 0.1.1 additionally fixes email-link return paths and browser errors.

Database sample records are labelled and shared through RLS. Wi-Fi provisioning
and physical irrigation remain controller responsibilities. Native push delivery
and offline telemetry caching are separate hardware/platform integration work.
