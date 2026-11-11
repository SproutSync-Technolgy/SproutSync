import { useEffect, useId, useRef, useState } from "react";
import { Circle, RefreshCw, Radio, AlertTriangle } from "lucide-react";
import type { Device } from "../data/workspace";
import type { LatestReading, MQTTStatus } from "../data/liveTelemetry";

export function controllerOff(value?: string) {
  return ["SYSTEM OFF", "POWER OFF", "OFF"].includes((value ?? "").replaceAll("_", " ").replace(/\s+/g, " ").trim().toUpperCase());
}

export function SystemStatus({ devices, latest, mqtt, error, retry }: {
  devices: Device[]; latest: LatestReading[]; mqtt: MQTTStatus | null; error: string; retry: () => void;
}) {
  const [mode, setMode] = useState<"closed" | "preview" | "pinned">("closed");
  const open = mode !== "closed";
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const realDevices = devices.filter((device) => !device.is_demo);
  const isRecent = (device: Device) => Boolean(device.last_seen_at && Date.now() - Date.parse(device.last_seen_at) <= (mqtt?.stale_seconds ?? 30) * 1000 && Date.parse(device.last_seen_at) <= Date.now() + 5000);
  const connected = realDevices.filter((device) => ["online", "fault"].includes(device.status) && isRecent(device) && !error && mqtt?.connected);
  const problems = connected.some((device) => device.status === "fault");
  const summary = error ? "Updates unavailable" : !mqtt ? "Checking connection" : !realDevices.length ? "No chamber connected" : !connected.length ? "Chambers offline" : problems ? "Chamber needs attention" : connected.length < realDevices.length ? "Some chambers offline" : "Chambers connected";
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
      <p className="status-transport">Update service: {error ? "Unavailable" : mqtt?.connected ? "Connected" : "Not connected"}. Chamber health is checked separately.</p>
      {!realDevices.length && <p>No physical chambers are linked to this workspace.</p>}
      {realDevices.map((device) => {
        const reading = latest.find((item) => item.device_id === device.id);
        const recent = connected.some((item) => item.id === device.id);
        const state = !recent ? device.status === "pending" ? "Waiting for first packet" : "Offline — no recent packet" : controllerOff(reading?.sensor_status) ? "Controller off" : reading?.sd_ok === false ? "Connected · SD card error" : device.status === "fault" ? "Connected · device reports an issue" : "Connected";
        return <div key={device.id} className="status-device"><strong>{device.name}</strong><span>{state}</span><small>{device.last_seen_at ? `Last packet ${new Date(device.last_seen_at).toLocaleString()}` : "No packet received yet"}</small></div>;
      })}
      {error && <p className="status-error"><AlertTriangle size={15} />Live updates could not be checked. Saved readings remain available.</p>}
      <button type="button" className="status-retry" onClick={retry}><RefreshCw size={14} /> Check connection</button>
    </section>}
  </div>;
}
