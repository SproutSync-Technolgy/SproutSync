import { useEffect, useRef, useState, type FormEvent } from "react";
import { connectDevice, type MQTTStatus } from "../data/liveTelemetry";
import { bluetoothSupported, registerNearby, scanBluetooth, scanWifi, type NearbyDevice } from "../data/deviceDiscovery";
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
    <p role="status">{error ? "Live updates unavailable: " + error : mqtt ? states[mqtt.state] ?? "Checking MQTT connection…" : "Checking live device service…"}</p>
    {(error || (mqtt && !mqtt.connected)) && <Btn variant="ghost" onClick={retry}>Retry live connection</Btn>}
  </div>;
}

export function DeviceConnectionForm({ devices, mqtt, liveError, onSaved, onDone }: {
  devices: Device[]; mqtt: MQTTStatus | null; liveError: string;
  onSaved: (device: Device) => void; onDone: (deviceId?: number) => void;
}) {
  const eligible = devices.filter((d) => !d.is_demo);
  const [serial, setSerial] = useState(eligible[0]?.serial_number ?? "");
  const selected = eligible.find((d) => d.serial_number === serial);
  const [name, setName] = useState(selected?.name ?? "Chamber controller");
  const [prefix, setPrefix] = useState(selected?.mqtt_topic_prefix ?? "sproutsync");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState<Device | null>(null);
  const [nearby, setNearby] = useState<NearbyDevice[]>([]);
  const [candidate, setCandidate] = useState<NearbyDevice | null>(null);
  const [wifiBusy, setWifiBusy] = useState(false);
  const [bluetoothBusy, setBluetoothBusy] = useState(false);
  const [wifiError, setWifiError] = useState("");
  const [bluetoothMessage, setBluetoothMessage] = useState("");
  const wifiRequest = useRef<AbortController | null>(null);
  const bluetoothRequest = useRef<AbortController | null>(null);
  const latest = devices.find((d) => d.id === waiting?.id);
  const detected = Boolean(waiting?.connection_requested_at && latest?.last_seen_at &&
    latest.connection_requested_at === waiting.connection_requested_at &&
    Date.parse(latest.last_seen_at) >= Date.parse(waiting.connection_requested_at) &&
    ["online", "fault"].includes(latest.status) && !liveError && mqtt?.connected);

  async function searchWifi(manual = false) {
    wifiRequest.current?.abort();
    const controller = new AbortController();
    wifiRequest.current = controller;
    setWifiBusy(true);
    setWifiError("");
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const found = await scanWifi(controller.signal);
      if (controller.signal.aborted) return;
      setNearby((current) => [...new Map([...current.filter((d) => d.transport === "bluetooth"), ...found].map((d) => [d.serial_number, d])).values()]);
    } catch (err) {
      if (wifiRequest.current === controller && manual) {
        setWifiError(controller.signal.aborted ? "Wi-Fi search timed out. Check the API and local network, then search again." : errorMessage(err));
      }
    } finally {
      clearTimeout(timer);
      if (wifiRequest.current === controller) setWifiBusy(false);
    }
  }
  useEffect(() => {
    void searchWifi(false);
    return () => {
      const wifi = wifiRequest.current;
      wifiRequest.current = null;
      wifi?.abort();
      bluetoothRequest.current?.abort();
      bluetoothRequest.current = null;
    };
  }, []);

  async function searchBluetooth() {
    const controller = new AbortController();
    bluetoothRequest.current = controller;
    setBluetoothBusy(true);
    setBluetoothMessage("");
    try {
      const found = await scanBluetooth(controller.signal);
      if (controller.signal.aborted) return;
      setNearby((current) => [...current.filter((d) => d.serial_number !== found.serial_number), found]);
      choose(found);
      setBluetoothMessage("Bluetooth device identity read. Select Connect device to add it.");
    } catch (err) {
      if (!controller.signal.aborted) setBluetoothMessage(err instanceof DOMException && err.name === "NotFoundError" ? "No Bluetooth device was selected. Check Bluetooth and try again." : errorMessage(err));
    } finally {
      if (!controller.signal.aborted) setBluetoothBusy(false);
    }
  }
  function choose(device: NearbyDevice) {
    setCandidate(device); setSerial(device.serial_number); setName(device.name); setPrefix(device.topic_prefix);
    setWaiting(null); setError("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const device = candidate ? await registerNearby(candidate, name) : await connectDevice({ serial_number: serial, name, topic_prefix: prefix });
      setWaiting(device); onSaved(device);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <div>
      <p className="mb-3 text-sm text-muted-foreground">Power on your ESP32. Search Wi-Fi for devices on the same network as this local server, or choose a nearby device through Bluetooth.</p>
      <div className="flex flex-wrap gap-2">
        <Btn type="button" variant="outline" onClick={() => void searchWifi(true)} disabled={wifiBusy || busy}>{wifiBusy ? "Searching Wi-Fi…" : "Search Wi-Fi"}</Btn>
        <Btn type="button" variant="outline" onClick={() => void searchBluetooth()} disabled={!bluetoothSupported() || bluetoothBusy || busy}>{bluetoothBusy ? "Reading Bluetooth device…" : "Search Bluetooth"}</Btn>
      </div>
      {!bluetoothSupported() && <p className="mt-2 text-xs text-muted-foreground">Bluetooth search needs a supported Chrome/Edge browser on localhost or HTTPS.</p>}
      <div className="mt-3 space-y-2" aria-live="polite">
        {wifiError && <p role="alert" className="feedback-error">{wifiError}</p>}
        {bluetoothMessage && <p className="text-sm">{bluetoothMessage}</p>}
        {nearby.map((device) => <div key={device.serial_number} className="rounded-xl border border-border p-3">
          <strong className="block break-words">{device.name}</strong>
          <p className="text-xs text-muted-foreground break-words">{device.serial_number} · {device.transport === "wifi" ? "Wi-Fi" : "Bluetooth"}{device.addresses.length ? " · " + device.addresses.join(", ") : ""}</p>
          {device.available ? <Btn type="button" variant="outline" className="mt-2" disabled={busy} aria-pressed={candidate?.serial_number === device.serial_number} onClick={() => choose(device)}>{candidate?.serial_number === device.serial_number ? "Selected: " : "Use device: "}{device.name}</Btn> : <p className="mt-2 text-xs">Already registered to another workspace.</p>}
        </div>)}
        {!nearby.length && !wifiBusy && !wifiError && <p className="text-sm text-muted-foreground">No nearby ESP32 found yet. Devices appear here when they run SproutSync discovery firmware. Check Wi-Fi, enable Bluetooth, and search again.</p>}
      </div>
    </div>
    {(candidate || eligible.length > 0) && <form onSubmit={submit} className="space-y-4 border-t border-border pt-4">
      <fieldset disabled={busy} className="space-y-4">
        {candidate ? <label className="field">Device serial number<input readOnly value={serial} /></label> : null}
        {eligible.length > 0 && <label className="field">{candidate ? "Or choose an assigned device" : "Device serial number"}
          <select value={candidate ? "" : serial} onChange={(event) => {
            const device = eligible.find((d) => d.serial_number === event.target.value);
            if (!device) return;
            setCandidate(null); setSerial(device.serial_number); setName(device.name); setPrefix(device.mqtt_topic_prefix ?? "sproutsync"); setWaiting(null); setError("");
          }} required={!candidate}>
            {candidate && <option value="">Use the nearby device above</option>}
            {eligible.map((d) => <option key={d.id} value={d.serial_number}>{d.serial_number} · {d.name}</option>)}
          </select>
        </label>}
        <label className="field">Device name<input value={name} onChange={(e) => { setName(e.target.value); setWaiting(null); }} required maxLength={120} /></label>
        <label className="field">MQTT topic prefix<input value={prefix} readOnly={Boolean(candidate)} onChange={(e) => { setPrefix(e.target.value); setWaiting(null); }} required maxLength={160} pattern="[A-Za-z0-9_\-]+(/[A-Za-z0-9_\-]+)*" aria-describedby="topic-help" /></label>
        <p id="topic-help" className="text-xs text-muted-foreground">{candidate ? "Reported by the ESP32. " : ""}Listening on {prefix || "sproutsync"}/telemetry.</p>
        <label className="field">MQTT broker<input readOnly value={mqtt?.broker_url ?? "Checking server broker…"} /></label>
        <p className="text-xs text-muted-foreground">Nearby discovery identifies the board's announcement. Live sensor status starts after its fresh MQTT packets arrive.</p>
        {(error || liveError) && <p role="alert" className="feedback-error">{error || liveError}</p>}
        {waiting && <div role="status" className="rounded-xl border border-border p-3 text-sm">
          {detected ? latest?.status === "fault" ? "Device detected. A sensor fault was reported; review Readings." : "Device detected. Live sensor readings are being saved." : "Device added. Waiting for a fresh sensor packet… Check device Wi-Fi, broker, and topic prefix if no readings arrive."}
          {latest?.last_seen_at && <p>Last packet: {new Date(latest.last_seen_at).toLocaleString()}</p>}
        </div>}
        <Btn type="submit" disabled={busy || !serial} className="w-full">{busy ? "Connecting…" : waiting ? "Retry device detection" : "Connect device"}</Btn>
      </fieldset>
      {waiting && <Btn type="button" variant="outline" onClick={() => onDone(detected ? waiting.id : undefined)}>{detected ? "View live readings" : "Keep listening in background"}</Btn>}
    </form>}
  </div>;
}
