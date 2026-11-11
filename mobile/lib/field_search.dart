import 'dart:async';
import 'package:flutter/material.dart';
import 'field_data.dart';
import 'field_widgets.dart';

/// Full-screen, keyboard-safe search over the shared authorized record index.
class FieldSearchPage extends StatefulWidget {
  /// Uses the same RLS-protected search as the web workspace.
  const FieldSearchPage({super.key, required this.search});

  /// Authenticated search boundary; results retain server-enforced permissions.
  final Future<List<FieldRecord>> Function(String query) search;
  @override
  State<FieldSearchPage> createState() => _FieldSearchPageState();
}

class _FieldSearchPageState extends State<FieldSearchPage> {
  final controller = TextEditingController();
  Timer? debounce;
  int request = 0;
  bool loading = false;
  String? error;
  List<FieldRecord> results = [];
  static const pages = ['Today', 'Batches', 'Alerts', 'Account'];
  static const icons = [
    Icons.wb_sunny_outlined,
    Icons.spa_outlined,
    Icons.notifications_outlined,
    Icons.person_outline
  ];
  static const kinds = {
    'batch': 'Batch',
    'device': 'Chamber',
    'alert': 'Alert',
    'evidence': 'Check',
    'evaluation': 'Assessment',
    'maintenance': 'Maintenance',
    'schedule': 'Irrigation plan',
    'watering': 'Watering history',
    'activity': 'Activity',
    'access': 'Evaluator access'
  };

  void changed(String value) {
    debounce?.cancel();
    final generation = ++request;
    setState(() {
      results = [];
      error = null;
      loading = value.trim().length >= 2;
    });
    if (!loading) return;
    debounce = Timer(const Duration(milliseconds: 300), () async {
      try {
        final found = await widget.search(value.trim());
        if (mounted && generation == request) {
          setState(() {
            results = found;
            loading = false;
          });
        }
      } catch (_) {
        if (mounted && generation == request) {
          setState(() {
            error =
                'Saved records could not be searched. Check your connection and try again.';
            loading = false;
          });
        }
      }
    });
  }

  @override
  void dispose() {
    request++;
    debounce?.cancel();
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final query = controller.text.trim().toLowerCase();
    return Scaffold(
      appBar: AppBar(title: const Text('Search workspace')),
      body: SafeArea(
          child: Column(children: [
        Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: TextField(
              key: const ValueKey('global-field-query'),
              controller: controller,
              autofocus: true,
              textInputAction: TextInputAction.search,
              maxLength: 100,
              onChanged: changed,
              decoration: InputDecoration(
                  labelText: 'Search records and pages',
                  hintText: 'Batch code, chamber, notes or serial',
                  counterText: '',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: query.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Clear search',
                          onPressed: () {
                            controller.clear();
                            changed('');
                          },
                          icon: const Icon(Icons.close))),
            )),
        if (loading) const LinearProgressIndicator(minHeight: 2),
        Expanded(
            child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                children: [
              if (error != null)
                FieldNotice(
                    title: 'Search unavailable',
                    message: error!,
                    warning: true,
                    onRetry: () => changed(controller.text)),
              for (var index = 0; index < pages.length; index++)
                if (query.isEmpty ||
                    '${pages[index]} ${index == 3 ? 'settings profile preferences' : ''}'
                        .toLowerCase()
                        .contains(query))
                  ListTile(
                      leading: Icon(icons[index], color: FieldColors.forest),
                      title: Text(pages[index]),
                      subtitle: const Text('Open page'),
                      trailing: const Icon(Icons.arrow_outward, size: 18),
                      onTap: () => Navigator.pop(context, <String, dynamic>{
                            'kind': 'page',
                            'destination': index
                          })),
              if (query.isNotEmpty && query.length < 2)
                const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Text(
                        'Type at least 2 characters to search saved records.')),
              if (query.length >= 2 && !loading && error == null)
                Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                        results.isEmpty
                            ? 'No saved records match. Try a code, name or a different word.'
                            : '${results.length} saved matches',
                        style: const TextStyle(color: FieldColors.muted))),
              for (final result in results)
                Card(
                    child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 8),
                        leading: CircleAvatar(
                            backgroundColor: FieldColors.mint,
                            foregroundColor: FieldColors.forest,
                            child: Icon(result['kind'] == 'device'
                                ? Icons.sensors
                                : result['kind'] == 'alert'
                                    ? Icons.notifications_outlined
                                    : result['kind'] == 'batch'
                                        ? Icons.spa_outlined
                                        : Icons.description_outlined)),
                        title: Text('${result['title']}',
                            maxLines: 2, overflow: TextOverflow.ellipsis),
                        subtitle: Text(
                            '${kinds[result['kind']] ?? 'Record'} · ${result['subtitle'] ?? ''}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => Navigator.pop(context, result))),
              const Padding(
                  padding: EdgeInsets.only(top: 20),
                  child: Text(
                      'Only records available to your account are searched. Up to 5 matches per record type.',
                      style:
                          TextStyle(fontSize: 12, color: FieldColors.muted))),
            ])),
      ])),
    );
  }
}
