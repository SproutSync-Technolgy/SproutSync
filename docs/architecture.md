# Architecture

The SDP defines two controllers: the ESP32 owns time-sensitive sensing, sequential irrigation, safety interlocks and MicroSD event buffering. A Raspberry Pi 4 hosts supervisory FastAPI, PostgreSQL and Mosquitto services. The browser is a responsive operator interface.

```mermaid
flowchart LR
  Browser[React dashboard] -->|Bearer-token REST| Pi[FastAPI]
  Browser -->|Auth and protected PostgREST/RPC| Supabase[Supabase project]
  Pi -->|Auth verification| Supabase
  Pi --> DB[(Local PostgreSQL)]
  Pi <-->|MQTT over secure WebSockets| Broker[Configured MQTT broker]
  Broker <-->|MQTT over TLS in deployment| ESP[ESP32]
  ESP --> SD[(MicroSD event queue)]
  ESP --> HW[Sensors and actuators]
```

The implemented workspace requires Supabase Auth, PostgREST/RPCs, and PostgreSQL
with row-level policies. FastAPI and the browser must use the same project.
Use hosted development Supabase or the complete local Supabase stack; optional
Compose PostgreSQL alone does not provide the required Auth schemas or HTTP
APIs. See [SETUP.md](../SETUP.md). Local hardware irrigation must not depend on
cloud availability.

No AI service, mobile app or multiple admin portals are specified in the SDP, so those reference-image modules are not included.

Production boundaries: add device credentials, MQTT security, and production
TLS with per-device ACLs before network deployment. Anonymous MQTT in Compose
is loopback-only development configuration. Deployment certificates, secrets
and volumes must stay outside Git.

Implemented API foundation: Supabase Auth bearer-token verification,
PostgreSQL-backed local user projection, `/auth/me`, and Alembic identity
migrations. MQTT ingestion now binds registered device serials to unique topic
prefixes, stores validated sensor packets, and detects stale/disconnected devices.
Supabase Realtime delivers authorized inserts to the browser; a scoped API
snapshot provides recovery. See [MQTT device setup](mqtt-device-setup.md).
Active operators can register a newly discovered ESP32 over local mDNS or a
browser-triggered Bluetooth LE identity read. The native API scans its own LAN;
Bluetooth uses the browser computer's radio. Both paths preserve existing serial
ownership and wait for matching MQTT telemetry before showing live status.
See [discovery contract and ESP32-WROOM integration](device-discovery.md).
Proposed next API modules: trays,
irrigation, alerts, yield, reports and audit. Introduce modules as their first
vertical slices are implemented instead of creating empty layers.

The team uses ESP32-WROOM. Unresolved hardware details include the exact development
board/flash configuration, sensor firmware, sensors, GPIO mapping, relay polarity,
limits, and irrigation timings. None should be inferred from the scaffold.
