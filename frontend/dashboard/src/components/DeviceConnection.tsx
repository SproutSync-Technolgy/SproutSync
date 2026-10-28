import { useState, type FormEvent } from "react";
import { connectDevice, type MQTTStatus } from "../data/liveTelemetry";
import { errorMessage, type Device } from "../data/workspace";
import { Btn } from "./ProtoPrimitives";

export function LiveConnectionStatus({ mqtt, error, retry }: { mqtt: MQTTStatus | null; error: string; retry: () => void }) {
  const states: Record<string, string> = {
    disabled: "Live MQTT is disabled on the server.",
    configuration_error: "The server MQTT configuration needs attention.",
    connecting: "Connecting to the MQTT broker…",
    reconnecting: "MQTT disconnected. Reconnecting…",
    connection_error: "The MQTT broker rejected the connection. Check server settings.",
    subscription_error: "The MQTT broker rejected a topic subscription. Check topic permissions.",
    connected: "MQTT connected. Sensor packets update this view automatically; recovery checks run every 2 seconds.",
  };
  return <div className="mb-4 rounded-xl border border-border p-3 text-sm">
    <p role="status">{error ? `Live updates unavailable: ${error}` : mqtt ? states[mqtt.state] ?? "Checking MQTT connection…" : "Checking live device service…"}</p>
    {(error || (mqtt && !mqtt.connected)) && <Btn variant="ghost" onClick={retry}>Retry live connection</Btn>}
  </div>;
}

export function DeviceConnectionForm({ devices, mqtt, liveError, onSaved, onDone }: {
  devices: Device[];
  mqtt: MQTTStatus | null;
  liveError: string;
  onSaved: (device: Device) => void;
  onDone: (deviceId?: number) => void;
}) {
  const eligible = devices.filter((d) => !d.is_demo);
  const [serial, setSerial] = useState(eligible[0]?.serial_number ?? "");
  const selected = eligible.find((d) => d.serial_number === serial);
  const [name, setName] = useState(selected?.name ?? "Chamber controller");
  const [prefix, setPrefix] = useState(selected?.mqtt_topic_prefix ?? "sproutsync");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState<Device | null>(null);
  const latest = devices.find((d) => d.id === waiting?.id);
  const detected = Boolean(waiting?.connection_requested_at && latest?.last_seen_at &&
    latest.connection_requested_at === waiting.connection_requested_at &&
    Date.parse(latest.last_seen_at) >= Date.parse(waiting.connection_requested_at) &&
    ["online", "fault"].includes(latest.status) && !liveError && mqtt?.connected);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const device = await connectDevice({ serial_number: serial, name, topic_prefix: prefix });
      setWaiting(device);
      onSaved(device);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!eligible.length) return <p>No hardware serial is assigned to this account yet. Ask your administrator to grant your device serial, then refresh the workspace.</p>;

  return <form onSubmit={submit} className="space-y-4">
    <p className="text-sm text-muted-foreground">Power on your ESP32 and connect it to Wi-Fi. Choose its assigned serial and the topic prefix configured on the device.</p>
    <fieldset disabled={busy} className="space-y-4">
      <label className="field">Device serial number
        <select value={serial} onChange={(event) => {
          const device = eligible.find((d) => d.serial_number === event.target.value)!;
          setSerial(device.serial_number); setName(device.name); setPrefix(device.mqtt_topic_prefix ?? "sproutsync"); setWaiting(null);
        }} required>
          {eligible.map((d) => <option key={d.id} value={d.serial_number}>{d.serial_number} · {d.name}</option>)}
        </select>
      </label>
      <label className="field">Device name<input value={name} onChange={(e) => { setName(e.target.value); setWaiting(null); }} required maxLength={120} /></label>
      <label className="field">MQTT topic prefix<input value={prefix} onChange={(e) => { setPrefix(e.target.value); setWaiting(null); }} required maxLength={160} pattern="[A-Za-z0-9_\-]+(/[A-Za-z0-9_\-]+)*" aria-describedby="topic-help" /></label>
      <p id="topic-help" className="text-xs text-muted-foreground">Listening on {prefix || "sproutsync"}/telemetry. Use a different prefix for each device.</p>
      <label className="field">MQTT broker<input readOnly value={mqtt?.broker_url ?? "Checking server broker…"} /></label>
      <p className="text-xs text-muted-foreground">This connection detects telemetry on the selected topic. The shared test broker does not verify a device's physical identity.</p>
      {(error || liveError) && <p role="alert" className="feedback-error">{error || liveError}</p>}
      {waiting && <div role="status" className="rounded-xl border border-border p-3 text-sm">
        {detected ? latest?.status === "fault" ? "Device detected. A sensor fault was reported; review Readings." : "Device detected. Live sensor readings are being saved." : "Connection saved. Waiting for a fresh sensor packet… Check device Wi-Fi, broker, and topic prefix if no readings arrive."}
        {latest?.last_seen_at && <p>Last packet: {new Date(latest.last_seen_at).toLocaleString()}</p>}
      </div>}
      <Btn type="submit" disabled={busy} className="w-full">{busy ? "Connecting…" : waiting ? "Retry device detection" : "Connect device"}</Btn>
    </fieldset>
    {waiting && <Btn type="button" variant="outline" onClick={() => onDone(detected ? waiting.id : undefined)}>{detected ? "View live readings" : "Keep listening in background"}</Btn>}
  </form>;
}
