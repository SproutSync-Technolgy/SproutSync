import 'package:flutter/material.dart';
import 'field_data.dart';

/// Shared, purpose-based colors for daylight use on the growing floor.
abstract final class FieldColors {
  /// Primary action and brand.
  static const forest = Color(0xFF185B42);

  /// Page background.
  static const canvas = Color(0xFFF5F7F2);

  /// Soft background for positive or neutral brand content.
  static const mint = Color(0xFFE7F2EA);

  /// Water and informational content.
  static const water = Color(0xFF235F82);

  /// Warnings; always accompanied by words or icons.
  static const amber = Color(0xFF875500);

  /// Critical conditions and failures.
  static const danger = Color(0xFFB3261E);

  /// Primary text.
  static const ink = Color(0xFF1C3028);

  /// Secondary text with readable contrast on light surfaces.
  static const muted = Color(0xFF52665B);
}

/// A compact status label that does not depend on color perception.
class FieldTag extends StatelessWidget {
  /// Creates a status chip without introducing an extra tap target.
  const FieldTag(this.label, {super.key, this.color = FieldColors.forest});

  /// Human-readable status.
  final String label;

  /// Semantic foreground color.
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
            color: color.withValues(alpha: .09),
            borderRadius: BorderRadius.circular(10)),
        child: Text(label,
            style: TextStyle(
                color: color, fontSize: 12, fontWeight: FontWeight.w700)),
      );
}

/// Honest source state with an explicit recovery action.
class FieldNotice extends StatelessWidget {
  /// Creates an information or failure notice.
  const FieldNotice(
      {super.key,
      required this.title,
      required this.message,
      this.onRetry,
      this.warning = false});

  /// Short state label.
  final String title;

  /// Explains the state and its consequence.
  final String message;

  /// Explicit retry, when recovery is available.
  final VoidCallback? onRetry;

  /// Whether this is a degraded state.
  final bool warning;
  @override
  Widget build(BuildContext context) => Semantics(
      liveRegion: warning,
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
            color: warning ? const Color(0xFFFFF3DC) : FieldColors.mint,
            borderRadius: BorderRadius.circular(16)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(warning ? Icons.cloud_off_outlined : Icons.info_outline,
                size: 20,
                color: warning ? FieldColors.amber : FieldColors.forest),
            const SizedBox(width: 8),
            Expanded(
                child: Text(title,
                    style: const TextStyle(fontWeight: FontWeight.w700)))
          ]),
          const SizedBox(height: 6),
          Text(message),
          if (onRetry != null)
            TextButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Try again')),
        ]),
      ));
}

/// Initial loading preserves the shape of the page and announces its purpose.
class FieldLoading extends StatelessWidget {
  /// Creates a loading placeholder without a continuously flashing shimmer.
  const FieldLoading({super.key});
  @override
  Widget build(BuildContext context) => Semantics(
      label: 'Loading your chambers and batches',
      liveRegion: true,
      child: ListView(padding: const EdgeInsets.all(20), children: [
        const LinearProgressIndicator(minHeight: 3),
        const SizedBox(height: 28),
        const Text('Getting your workspace ready',
            style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        const Text('Checking chambers, shared batches and alerts.'),
        for (final height in [112.0, 184.0, 104.0])
          Container(
              height: height,
              margin: const EdgeInsets.only(top: 18),
              decoration: BoxDecoration(
                  color: FieldColors.mint,
                  borderRadius: BorderRadius.circular(20))),
      ]));
}

/// Per-chamber reading; no cross-device average or stale-as-live measurement.
class ChamberCard extends StatelessWidget {
  /// Creates a current or explicitly stale chamber summary.
  const ChamberCard(
      {super.key,
      required this.device,
      this.reading,
      this.onTap,
      this.sourceUnavailable = false});

  /// Registered device identity.
  final FieldRecord device;

  /// Latest raw reading for this exact device.
  final FieldRecord? reading;

  /// Opens the device's contextual details.
  final VoidCallback? onTap;

  /// Last read could not be refreshed.
  final bool sourceUnavailable;
  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final demo = device['is_demo'] == true;
    final online = !sourceUnavailable &&
        !demo &&
        device['status'] == 'online' &&
        isRecent(device['last_seen_at'], now);
    final fresh = online &&
        reading?['is_demo'] != true &&
        isRecent(reading?['recorded_at'], now);
    final status = demo
        ? 'Sample'
        : sourceUnavailable
            ? 'Unavailable'
            : device['status'] == 'fault'
                ? 'Device fault'
                : online
                    ? 'Recent heartbeat'
                    : 'No recent heartbeat';
    final readingLabel = sourceUnavailable
        ? 'Last known reading'
        : device['status'] == 'fault'
            ? 'Check sensor'
            : fresh
                ? 'Recent reading'
                : isRecent(reading?['recorded_at'], now)
                    ? 'Check connection'
                    : 'Older reading';
    String metric(String key, String suffix) => reading?[key] is num
        ? '${(reading![key] as num).toStringAsFixed(1)}$suffix'
        : '—';
    return Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
            onTap: onTap,
            child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const CircleAvatar(
                                backgroundColor: FieldColors.mint,
                                foregroundColor: FieldColors.forest,
                                child: Icon(Icons.sensors)),
                            const SizedBox(width: 12),
                            Expanded(
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                  Text('${device['name'] ?? 'Chamber'}',
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleMedium),
                                  Text(
                                      '${device['serial_number'] ?? 'Serial unavailable'}',
                                      style: const TextStyle(
                                          color: FieldColors.muted,
                                          fontSize: 12)),
                                ])),
                            const Icon(Icons.chevron_right,
                                color: FieldColors.muted),
                          ]),
                      const SizedBox(height: 14),
                      Wrap(spacing: 8, runSpacing: 8, children: [
                        FieldTag(status,
                            color: online || demo
                                ? FieldColors.forest
                                : FieldColors.amber),
                        if (reading != null)
                          FieldTag(readingLabel,
                              color:
                                  fresh ? FieldColors.water : FieldColors.amber)
                      ]),
                      const SizedBox(height: 16),
                      if (reading == null)
                        Text(
                            sourceUnavailable
                                ? 'Sensor service unavailable. Retry to check conditions.'
                                : 'Waiting for the first sensor reading.',
                            style: const TextStyle(color: FieldColors.muted))
                      else ...[
                        Wrap(spacing: 24, runSpacing: 14, children: [
                          _Measurement(
                              'Air temperature',
                              metric('temperature_c', '°C'),
                              Icons.thermostat_outlined),
                          _Measurement(
                              'Humidity',
                              metric('humidity_percent', '%'),
                              Icons.water_drop_outlined),
                          if (reading?['water_level_percent'] != null)
                            _Measurement(
                                'Tank level',
                                metric('water_level_percent', '%'),
                                Icons.water_outlined),
                        ]),
                        const SizedBox(height: 12),
                        Text(
                            'Measured ${readingAge(reading!['recorded_at'], now)} · ${fresh ? 'Machine source' : 'Check chamber before acting'}',
                            style: const TextStyle(
                                fontSize: 12, color: FieldColors.muted)),
                      ],
                    ]))));
  }
}

class _Measurement extends StatelessWidget {
  const _Measurement(this.label, this.value, this.icon);
  final String label, value;
  final IconData icon;
  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 17, color: FieldColors.water),
          const SizedBox(width: 4),
          Text(value, style: Theme.of(context).textTheme.titleLarge)
        ]),
        Text(label,
            style: const TextStyle(fontSize: 12, color: FieldColors.muted)),
      ]);
}

/// Five accessible, 48-pixel star targets with a single selected rating.
class FieldStars extends StatelessWidget {
  /// Creates the mobile assessment rating control.
  const FieldStars({super.key, required this.value, required this.onChanged});

  /// Selected one-to-five rating; zero means not selected.
  final int value;

  /// Disabled while saving or when read-only.
  final ValueChanged<int>? onChanged;
  @override
  Widget build(BuildContext context) => Wrap(children: [
        for (var star = 1; star <= 5; star++)
          Semantics(
              selected: value == star,
              child: IconButton(
                tooltip: 'Rate $star out of 5',
                constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                onPressed: onChanged == null ? null : () => onChanged!(star),
                color: FieldColors.amber,
                icon: Icon(
                    star <= value
                        ? Icons.star_rounded
                        : Icons.star_outline_rounded,
                    size: 30),
              )),
      ]);
}

/// Shared production theme, also used by phone-layout verification.
ThemeData fieldTheme() {
  const primary = FieldColors.forest;
  final scheme = ColorScheme.fromSeed(
    seedColor: primary,
    brightness: Brightness.light,
    surface: FieldColors.canvas,
  ).copyWith(
    primary: primary,
    onPrimary: Colors.white,
    secondary: FieldColors.water,
    error: FieldColors.danger,
    onSurface: FieldColors.ink,
    onSurfaceVariant: FieldColors.muted,
    outline: const Color(0xFFCBD8CF),
    surfaceContainerLow: Colors.white,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: FieldColors.canvas,
    textTheme: const TextTheme(
      headlineMedium:
          TextStyle(fontSize: 28, height: 1.15, fontWeight: FontWeight.w700),
      titleLarge:
          TextStyle(fontSize: 22, height: 1.2, fontWeight: FontWeight.w700),
      titleMedium:
          TextStyle(fontSize: 16, height: 1.3, fontWeight: FontWeight.w700),
      bodyLarge: TextStyle(fontSize: 16, height: 1.5),
      bodyMedium: TextStyle(fontSize: 14, height: 1.5),
      labelLarge: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.symmetric(vertical: 6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0xFFDCE5DF)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      height: 72,
      backgroundColor: Colors.white,
      indicatorColor: FieldColors.mint,
      elevation: 0,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: FieldColors.canvas,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      elevation: 0,
      scrolledUnderElevation: 0,
    ),
  );
}
