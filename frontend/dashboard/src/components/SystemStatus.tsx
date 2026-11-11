import { useEffect, useId, useRef, useState } from "react";
import { Circle, RefreshCw, Radio, AlertTriangle } from "lucide-react";
import type { Device } from "../data/workspace";
import type { LatestReading, MQTTStatus } from "../data/liveTelemetry";
import {deviceIsConnected} from "../data/deviceHealth";

export function controllerOff(value?: string) {
  return ["SYSTEM OFF", "POWER OFF", "OFF"].includes((value ?? "").replaceAll("_", " ").replace(/\s+/g, " ").trim().toUpperCase());
}

export function SystemStatus({ devices, latest, mqtt, error, retry, staleSeconds, transport }: {
  devices: Device[]; latest: LatestReading[]; mqtt: MQTTStatus | null; error: string; retry: () => void;
  staleSeconds?: number; transport?: "starting" | "api" | "database" | "unavailable";
}) {
  const [mode, setMode] = useState<"closed" | "preview" | "pinned">("closed");
  const open = mode !== "closed";
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const realDevices = devices.filter((device) => !device.is_demo);
  const connected = realDevices.filter((device) => deviceIsConnected(device,staleSeconds ?? mqtt?.stale_seconds ?? 30));
  const problems = connected.some((device) => device.status === "fault");
  const summary = !realDevices.length ? "No chamber connected" : connected.length ? problems ? "Chamber needs attention" : connected.length < realDevices.length ? "Some chambers offline" : "Chambers connected" : error ? "Updates unavailable" : transport === "starting" ? "Checking connection" : "Chambers offline";
  const tone = connected.length && !problems && connected.length === realDevices.length ? "connected" : connected.length ? "attention" : "offline";
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) { setMode("closed"); } };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div ref={ref} className="system-status" onKeyDown={(event) => {if (event.key === "Escape") {event.stopPropagation(); ref.current?.querySelector("button")?.focus(); setMode("closed");}}} onMouseEnter={() => setMode((current) => current === "closed" ? "preview" : current)} onMouseLeave={() => { setMode((current) => current === "preview" ? "closed" : current); }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) {setMode("closed");} }}>
    <button type="button" className={`icon-button status-trigger ${tone}`} aria-label={`System status: ${summary}`} aria-expanded={open} aria-controls={id} onClick={() => {setMode((current) => current === "pinned" ? "closed" : "pinned");}} onFocus={() => setMode((current) => current === "closed" ? "preview" : current)}>
      <Circle size={18} fill="currentColor" aria-hidden="true" />
    </button>
    {open && <section id={id} role="region" aria-label="System status details" className="status-popover">
      <div className="status-popover-heading"><Radio size={18} /><strong>{summary}</strong></div>
      <p className="status-transport">Live updates: {error ? "Unavailable" : transport === "database" ? "Supabase · every 2 seconds" : transport === "api" ? "Backend API · every 2 seconds" : "Checking"}. MQTT broker: {mqtt ? mqtt.connected ? "Connected" : "Disconnected" : "Not checked"}. Chamber status uses its latest packet.</p>
      {!realDevices.length && <p>No physical chambers are linked to this workspace.</p>}
      {realDevices.map((device) => {
        const reading = latest.find((item) => item.device_id === device.id);
        const recent = connected.some((item) => item.id === device.id);
        const state = !recent ? device.status === "pending" ? "Waiting for first packet" : error ? "Status unavailable — updates could not be checked" : "Offline — no recent packet" : controllerOff(reading?.sensor_status) ? "Connected · Controller off" : reading?.sd_ok === false ? "Connected · SD card error" : device.status === "fault" ? "Connected · device reports an issue" : "Connected";
        return <div key={device.id} className="status-device"><strong>{device.name}</strong><span>{state}</span><small>{device.last_seen_at ? `Last packet ${new Date(device.last_seen_at).toLocaleString()}` : "No packet received yet"}</small></div>;
      })}
      {error && <p className="status-error"><AlertTriangle size={15} />Live updates could not be checked. Saved readings remain available.</p>}
      <button type="button" className="status-retry" onClick={retry}><RefreshCw size={14} /> Check connection</button>
    </section>}
  </div>;
}
