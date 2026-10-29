# Find an ESP32 over Wi-Fi or Bluetooth

Open **Add device** in the operator workspace. The dialog searches the local
API server's network for SproutSync ESP32 announcements. Select **Use device**,
name the controller, then **Connect device**. A new serial is registered to your
workspace without a prior administrator grant. An existing serial owned by
another workspace cannot be claimed. Existing assigned controllers can still
be connected by choosing their serial and MQTT prefix.

**Search Bluetooth** opens the browser's device chooser and reads a SproutSync
Bluetooth LE identity. Use a supported Chrome/Edge browser on localhost or HTTPS,
with Bluetooth enabled on the computer and board. The chooser requires a click;
the website cannot silently list all Bluetooth devices. Bluetooth identifies
the board; sensor readings still arrive through Wi-Fi and MQTT.

After adding the board, **Waiting for a fresh sensor packet** means its record
was saved but live telemetry has not arrived. **Device detected** appears only
after fresh, validated telemetry with the matching serial reaches the MQTT
bridge. Discovery alone never marks sensor data live.

## Firmware integration

An ESP32's radios alone do not announce its application identity. Existing sensor
firmware must include the discovery contract below. The repository's original
serial-only starter does not include sensor acquisition or MQTT publishing.

The reusable Arduino module is
[`SproutSyncDiscovery.h`](../iot/esp32/include/SproutSyncDiscovery.h). Copy it
into the existing ESP32 Arduino/PlatformIO project, then integrate it with the
board's existing setup, Wi-Fi, sensor, and MQTT code:

```cpp
#include "SproutSyncDiscovery.h"
SproutSyncDiscovery discovery;

// In the existing setup(), after configuring Wi-Fi:
// Use the real firmware's existing MQTT prefix and printed serial, if assigned.
// Check the returned bool and report a configuration failure if false.
discovery.begin("sproutsync/my-controller", "MY-PRINTED-SERIAL", "My controller");

// In the existing loop(), alongside the sensor/MQTT processing:
discovery.loop();

// In every existing telemetry JSON packet:
// payload["serialNumber"] = discovery.serialNumber();
// Publish to discovery.topicPrefix() + "/telemetry".
```

Calling `begin()` with no arguments derives a stable `ESP32-<chip ID>` serial
and unique MQTT prefix. It starts BLE discovery; Wi-Fi discovery starts when
the caller's existing Wi-Fi connection is ready. Supply a printed serial when
reconnecting a board that already has a device record. The module normalizes
serials to uppercase and exposes the exact value to include in telemetry.

The module configures no sensor pins, actuators, irrigation, calibration, or
Wi-Fi credentials. It uses the ESP32 Arduino WiFi, ESPmDNS, and BLE libraries.
The supplied build uses `esp32dev` for the team's ESP32-WROOM module on a
development board with 4 MB flash. Confirm the exact development-board/flash
variant before uploading. Other ESP32
variants need their own board configuration and Bluetooth capability check.

### Optional discovery-only bench build

`iot/esp32/src/discovery_example.cpp` demonstrates identity announcements without
sensor or MQTT code. It is a separate PlatformIO environment:

```powershell
Copy-Item iot/esp32/include/discovery_secrets.example.h iot/esp32/include/discovery_secrets.h
# Edit the ignored discovery_secrets.h locally with your Wi-Fi configuration.
pio run --project-dir iot/esp32 -e discovery
```

This command only compiles. The example uses a large application partition for
BLE and Wi-Fi on a 4 MB ESP32. Uploading it would replace the board's existing
application; integrate the module into actual sensor firmware for live readings.
No firmware is uploaded by the application or its launchers.

## Discovery contract

Wi-Fi discovery uses DNS-SD/mDNS service `_sproutsync._tcp.local.`. TXT values
are UTF-8 strings:

| TXT field | Example |
| --- | --- |
| `protocol` | `sproutsync-discovery-v1` |
| `model` | `ESP32` |
| `serial_number` | `ESP32-A1B2C3` |
| `name` | `SproutSync chamber` |
| `topic_prefix` | `sproutsync/ESP32-A1B2C3` |

The module advertises TCP port 45900, which returns the same JSON identity and
closes. The API reads mDNS metadata and private/link-local IPv4 addresses; it
does not scan arbitrary ports or fetch device URLs. Scans take about four seconds,
reuse results for eight seconds, and issue selection tokens valid for two minutes.
If a selection expires, search and select the board again.

BLE advertises service `f7b20001-11f9-4c7c-9f23-74c367499f20`. Read-only
characteristic `f7b20002-11f9-4c7c-9f23-74c367499f20` contains UTF-8 JSON with
the same five fields. The browser disconnects after reading the identity.
Serials contain 1–64 ASCII letters/digits, colons, underscores, or hyphens and
start with a letter/digit. Names contain 1–120 characters. Prefixes contain
1–160 ASCII letters/digits, underscores, or hyphens in nonempty slash-separated
segments. The firmware module additionally limits identity size to 512 bytes.

Announcements and browser-reported BLE identities enable self-registration;
they are not cryptographic proof of hardware ownership. Server-side checks
prevent transferring an already registered serial or sharing an MQTT prefix.
Use authenticated device enrollment and broker topic permissions for production.

## Troubleshooting

- **No Wi-Fi result:** the computer running FastAPI and board need the same LAN,
  with multicast UDP 5353 permitted. Guest Wi-Fi/client isolation, VPNs, routers,
  and Windows firewall rules can prevent discovery. Having the browser on the
  board's network is insufficient if the API runs somewhere else. Native API
  mode is recommended for Windows LAN discovery; Docker networking may block it.
- **No Bluetooth result:** confirm the board advertises the service UUID above,
  enable Bluetooth, move closer, and use the supported browser context.
- **Found but pending:** confirm the board's MQTT broker/prefix, actual sensor
  publishing, and `serialNumber`. Wireless registrations reject packets without
  this field or with a different serial. See [MQTT setup](mqtt-device-setup.md).
- **Code changed while running:** stop and restart with `stop.bat`/`start.bat`.
  Startup installs the new `zeroconf` dependency only when needed and applies
  migration `0014_wireless_discovery` before starting the API.

Implementation references: [python-zeroconf API](https://python-zeroconf.readthedocs.io/en/stable/api.html)
and [Chrome Web Bluetooth documentation](https://developer.chrome.com/docs/capabilities/bluetooth).
