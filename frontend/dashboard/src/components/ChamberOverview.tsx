import { ArrowUpRight, Cpu, Droplets, Thermometer, Sprout } from "lucide-react";
import type { Device, Reading } from "../data/workspace";
import type { LatestReading, MQTTStatus } from "../data/liveTelemetry";
import { controllerOff } from "./SystemStatus";

export function ChamberOverview({devices, readings, latest, mqtt, error, onOpen}: {
  devices: Device[]; readings: Reading[]; latest: LatestReading[]; mqtt: MQTTStatus | null;
  error: string; onOpen: (id: number) => void;
}) {
  if (!devices.length) return null;
  return <section className="surface chamber-overview" aria-labelledby="chamber-overview-title">
    <div className="section-title"><div><h2 id="chamber-overview-title">Chamber monitoring</h2><p>Choose a chamber to see its conditions and saved history.</p></div><span className="chamber-count">{devices.length} linked</span></div>
    <div className="chamber-overview-grid">{devices.slice(0, 6).map((device) => {
      const reading = latest.find((row) => row.device_id === device.id) ?? readings.find((row) => row.device_id === device.id && (!row.aggregation || row.aggregation === "raw"));
      const recent = !error && mqtt?.connected && device.last_seen_at && Date.now() - Date.parse(device.last_seen_at) <= (mqtt.stale_seconds ?? 30) * 1000 && ["online", "fault"].includes(device.status);
      const off = controllerOff(reading?.sensor_status);
      const status = device.is_demo ? "Sample chamber" : !recent ? device.status === "pending" ? "Awaiting first packet" : "Offline" : off ? "Controller off" : device.status === "fault" ? "Needs attention" : "Connected";
      const tone = device.is_demo || !recent ? "neutral" : off || device.status === "fault" ? "attention" : "healthy";
      const metric = (value?: number | null, unit = "") => off || value == null ? "—" : `${value}${unit}`;
      return <button type="button" key={device.id} className={`chamber-overview-card ${tone}`} onClick={() => onOpen(device.id)} aria-label={`View chamber ${device.name}`}>
        <div className="chamber-card-heading"><span className="chamber-card-icon"><Cpu size={20} /></span><span><strong>{device.name}</strong><small>{device.serial_number}</small></span><ArrowUpRight size={17} /></div>
        <div className="chamber-card-conditions"><span><Thermometer size={16} /><strong>{metric(reading?.temperature_c, "°C")}</strong><small>Air temperature</small></span><span><Droplets size={16} /><strong>{metric(reading?.humidity_percent, "%")}</strong><small>Humidity</small></span>{reading?.water_level_percent != null && <span><Droplets size={16} /><strong>{metric(reading.water_level_percent, "%")}</strong><small>Water level</small></span>}<Sprout size={58} strokeWidth={1.2} aria-hidden="true" /></div>
        {off && <p className="chamber-reading-note">Controller off. Measurements are unavailable until the chamber resumes reporting.</p>}
        <div className="chamber-card-footer"><span className={`chamber-health ${tone}`}>{status}</span><small>{reading ? `${recent ? "Measured" : "Last known"} ${new Date(reading.recorded_at).toLocaleString()}` : "No reading yet"}</small></div>
      </button>;
    })}</div>
    {devices.length > 6 && <p className="chamber-overview-hint">Showing 6 chambers. Find any linked chamber using the header search.</p>}
  </section>;
}
