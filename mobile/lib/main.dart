import 'package:flutter/material.dart';

/// Starts the SproutSync mobile application.
void main() {
  runApp(const SproutSyncMobileApp());
}

/// Provides the mobile theme and the initial grower-oriented shell.
class SproutSyncMobileApp extends StatelessWidget {
  /// Creates the root SproutSync mobile widget.
  const SproutSyncMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SproutSync',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF43A957),
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: const Color(0xFFF5FAF6),
        useMaterial3: true,
      ),
      home: const MobileScaffoldScreen(),
    );
  }
}

/// Shows the initial mobile navigation shell until API-backed screens are added.
class MobileScaffoldScreen extends StatelessWidget {
  /// Creates the mobile scaffold screen.
  const MobileScaffoldScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'SproutSync',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        actions: [
          IconButton(
            onPressed: () {},
            tooltip: 'Notifications',
            icon: const Icon(Icons.notifications_none_rounded),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Good morning, grower',
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: const Color(0xFF193C2E),
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Your mobile dashboard will connect to batches, conditions, and alerts here.',
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: const Color(0xFF6E8375),
                ),
          ),
          const SizedBox(height: 24),
          const _ScaffoldStatusCard(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard_rounded),
            label: 'Overview',
          ),
          NavigationDestination(
            icon: Icon(Icons.spa_outlined),
            selectedIcon: Icon(Icons.spa_rounded),
            label: 'Batches',
          ),
          NavigationDestination(
            icon: Icon(Icons.water_drop_outlined),
            selectedIcon: Icon(Icons.water_drop_rounded),
            label: 'Watering',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings_rounded),
            label: 'Settings',
          ),
        ],
      ),
    );
  }
}

/// Makes the scaffold's current API integration boundary visible to reviewers.
class _ScaffoldStatusCard extends StatelessWidget {
  const _ScaffoldStatusCard();

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.eco_rounded, color: Color(0xFF43A957), size: 32),
            const SizedBox(height: 16),
            Text(
              'Mobile foundation ready',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: const Color(0xFF254D39),
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              'API authentication, batch models, and telemetry contracts will be connected in the next mobile slice.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: const Color(0xFF71867A),
                  ),
            ),
          ],
        ),
      ),
    );
  }
}
