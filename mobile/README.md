# Mobile

The future SproutSync mobile application will be built with Flutter and Dart.
Web development remains the current priority; this directory is an isolated
scaffold so mobile work can begin without coupling Flutter dependencies to the
React workspace.

## Planned responsibilities

- Grower-focused batch and telemetry views
- Alert notifications and watering schedule
- Google sign-in through the SproutSync API
- Shared REST models based on [`packages/contracts/`](../packages/contracts/)
- Offline-friendly read cache after the web API contracts stabilize

## Local setup

Install the Flutter stable channel and Android Studio or Xcode for the target
platform. Flutter is not currently installed in the repository environment.

```powershell
flutter pub get
flutter run
```

The scaffold currently renders a startup screen only. It does not contact the
API, store credentials, or include platform-specific generated folders yet.
Run `flutter create .` inside this directory after installing Flutter to
generate Android, iOS, web, and desktop host projects as needed.
