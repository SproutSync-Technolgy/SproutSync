# IoT

Device-side SproutSync software lives here.

## ESP32

[`esp32/`](./esp32/) is the PlatformIO Arduino firmware. The ESP32 is intended
to own time-sensitive sensing, local irrigation scheduling, safety interlocks,
and offline event buffering.

```powershell
pio run --project-dir iot\esp32
```

Compilation does not prove hardware safety. Confirm the board, GPIO map, relay
polarity, sensor limits, pump limits, and emergency-stop behavior before
uploading or energizing actuators.
