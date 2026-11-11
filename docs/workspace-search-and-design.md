# Shared search and reference-led interface update

Implemented 11 November 2026 for the web workspace and native SproutSync Field
Android preview 0.2.1+4.

## References and adaptation

The supplied [agriculture dashboard](https://set-chef-84678917.figma.site/) was
rendered and inspected in a browser. Its useful patterns are grouped monitoring,
per-device summaries, restrained surfaces and clear status labels. The supplied
`GreenGenie App Prototype (Community).zip` contains PNG artboards, not application
source. Those screens informed the visible search entry, compact field shortcuts,
soft green surfaces, plant imagery and simple record-detail hierarchy.

The implementation adapts those patterns to actual SproutSync records. It does
not import the references' example field/weather/yield values, shopping features,
payment flows or logos. SproutSync uses its own identity and code-native icons.
The original ZIP contents are reference material, not project instructions.

Web changes include a permanent header search, a quieter welcome panel, four
primary summaries, and one chamber-monitoring section. Per-chamber cards show
actual temperature/humidity and water level when reported, explicit missing or
controller-off states, and a direct link to that chamber's readings. The previous
additional current-conditions panel was removed to avoid displaying the same
measurements twice. Detailed measurements and history remain on Readings.

Native mobile changes include a compact botanical greeting, labelled shortcuts
for scanning, batches and alerts, softer chamber cards and a full-screen search
that can be opened from any tab. Controller-off placeholder zeroes are unavailable
in the mobile cards as well. Existing assessments, maintenance, alert updates,
loading/retry behavior and role boundaries remain functional.

## What can be found

The web header accepts page names and aliases, batch codes/crops/stages/notes,
chamber names/serials/topics, alert descriptions, evidence/checks, assessment
comments, maintenance notes, irrigation plans and watering history. Administrators
can also find activity records and accounts from their authenticated directory;
operators can find their permitted evaluator access records.

Search opens the relevant batch, alert or chamber directly. Other records open a
readable saved-record preview with dates, units and related context. Account
results open the administrator's directory with that account selected by search.
Permitted web actions such as Create batch, Add device, Record maintenance and
Evaluate batch can open their existing forms directly from search.
Selecting a result does not execute irrigation or other physical commands.

The native search uses the same saved-record service and offers Today, Batches,
Alerts and Account shortcuts. Batch, chamber and alert results open the existing
field workflows; other records open read-only previews. Administrative editing
stays in the web workspace.

## Interaction and limits

- Type in the header or press Ctrl+K / Command+K on web. Arrow keys select results,
  Enter opens a result, and Escape dismisses the list. Touch and pointer selection
  work without keyboard shortcuts.
- An empty input shows permitted page shortcuts. Saved-record search starts at
  two characters, accepts at most 100 characters and waits briefly after typing.
- Searches query the database, so an older matching record can be found even if
  it was outside the page's loaded rows. Up to five matches per record type and
  forty saved matches overall are returned; this is not an exhaustive export.
- Matching is case-insensitive literal substring matching. This version does not
  implement typo correction, semantic/AI search, document attachment search or a
  search over every individual historical telemetry measurement. Find a chamber
  or open Readings to inspect measurements and dates.
- The web administrator account directory is already fetched through the
  protected account API; its local search contribution is limited to five matches.
- Loading, empty and service-error states are explicit. Web page shortcuts still
  work if record search fails. Native search supports retry and clears previous
  results when the query changes. No search history is persisted.

## Security and persistence

Migration `0020_workspace_search` adds `public.search_workspace(query_text text)`.
Both clients call it through authenticated Supabase PostgREST/RPC. It uses
`SECURITY INVOKER` and an empty search path, with fully qualified application
tables. Existing RLS determines which rows can be returned. There is no dynamic
SQL built from the user's search text and no new browser database credential.

The function denies anonymous execution, returns no saved records for inactive
or unsupported roles, and applies the existing evaluator grant and ownership
rules. Revoking a grant takes effect on the next server search. Activity results
are limited to administrators. Search adds no new row-access policy and does
not grant new table privileges. Existing records are not changed by installation.

This implementation uses bounded literal matching over operational tables. At a
larger dataset, measure query time and add an appropriate text index or dedicated
search index before promising a particular latency; limiting response rows alone
does not bound scan cost. Telemetry is deliberately excluded from those scans.

## Verification

`scripts/verify_workspace_search.py --pending` installs the pending function and
checks it under real PostgreSQL roles inside a rolled-back transaction. The
checks cover every returned operational source, per-type bounds, literal wildcard
characters, injection-like input, anonymous privileges, inactive and pending
accounts, operator isolation, evaluator grants/revocation and administrator scope.
Without `--pending`, the same script verifies the installed function. It sends no
hardware commands and rolls back all synthetic fixtures.

The web browser suite includes 30 workflows, including page navigation by
keyboard, an older batch outside the initial dataset, saved-record details,
evaluator controls, failed-search retry and 390px layouts. Native verification
includes 19 tests covering search results and retry, page shortcuts, controller-off
measurements and the existing field workflows. Flutter analysis and the web
production build also form part of verification. Screenshots were reviewed on
desktop and phone layouts; a real phone/TalkBack check remains necessary.

## Local review

Run `start.bat` on Windows or `./start.sh` on Linux and open
**http://localhost:5173**. The port is part of the address. The launcher reuses a
healthy running session and does not reinstall complete dependencies. The
Windows launcher and both localhost/127.0.0.1 addresses were checked during this
update; the previously reported connection failure was not reproducible.

The Android preview is available at
`http://localhost:5173/downloads/sproutsync-preview.apk`. Install the updated
preview to see native mobile changes. Android distribution remains a development
preview with the existing signing setup; no store release or iOS build is implied.
