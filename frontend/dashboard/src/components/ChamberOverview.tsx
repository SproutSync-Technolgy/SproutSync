import { ArrowUpRight, Cpu, Droplets, Thermometer, Sun, Waves, HardDrive, Zap } from "lucide-react";
import type { Device, Reading } from "../data/workspace";
import type { LatestReading, MQTTStatus } from "../data/liveTelemetry";
import { controllerOff } from "./SystemStatus";
import {deviceIsConnected} from "../data/deviceHealth";

export function ChamberOverview({devices, readings, latest, mqtt, error, staleSeconds, onOpen}: {
  devices: Device[]; readings: Reading[]; latest: LatestReading[]; mqtt: MQTTStatus | null;
  error: string; onOpen: (id: number) => void;
  staleSeconds?: number;
}) {
  if (!devices.length) return null;
  return <section className="surface chamber-overview" aria-labelledby="chamber-overview-title">
    <div className="section-title"><div><h2 id="chamber-overview-title">Chamber monitoring</h2><p>Choose a chamber to see its conditions and saved history.</p></div><span className="chamber-count">{devices.length} linked</span></div>
    <div className="chamber-overview-grid">{devices.slice(0, 6).map((device) => {
      const reading = latest.find((row) => row.device_id === device.id) ?? readings.find((row) => row.device_id === device.id && (!row.aggregation || ["raw","event"].includes(row.aggregation)));
      const recent = deviceIsConnected(device, staleSeconds ?? mqtt?.stale_seconds ?? 30);
      const off = controllerOff(reading?.sensor_status);
      const status = device.is_demo ? "Sample chamber" : !recent ? device.status === "pending" ? "Awaiting first packet" : error ? "Status unavailable" : "Offline" : off ? "Connected · Controller off" : device.status === "fault" ? "Connected · Needs attention" : "Connected";
      const tone = device.is_demo || !recent ? "neutral" : off || device.status === "fault" ? "attention" : "healthy";
      const metric = (value?: number | null, unit = "") => off || value == null ? "—" : `${Number(value.toFixed(2))}${unit}`;
      return <button type="button" key={device.id} className={`chamber-overview-card ${tone}`} onClick={() => onOpen(device.id)} aria-label={`View chamber ${device.name}`}>
        <div className="chamber-card-heading"><span className="chamber-card-icon"><Cpu size={20} /></span><span><strong>{device.name}</strong><small>{device.serial_number}</small></span><ArrowUpRight size={17} /></div>
        <div className="chamber-card-conditions">{[
          [Thermometer,"Air temperature",reading?.temperature_c,"°C"],
          [Droplets,"Humidity",reading?.humidity_percent,"%"],
          [Waves,"Fresh-water tank",reading?.water_level_percent,"%"],
          [Thermometer,"Water temperature",reading?.water_temperature_c,"°C"],
          [Sun,"Light level",reading?.light_lux," lux"],
          [Waves,"Wastewater tank",reading?.wastewater_level_percent,"%"],
        ].map(([Icon,label,value,unit]) => {
          const MetricIcon = Icon as typeof Thermometer;
          return <span key={String(label)} className="chamber-metric" title={value == null ? "This measurement has not been reported by the chamber." : undefined}><MetricIcon size={16} aria-hidden="true"/><small>{String(label)}</small><strong>{metric(value as number | null | undefined,String(unit))}</strong>{value == null && <em>Not reported</em>}</span>;
        })}</div>
        <div className="chamber-hardware"><span><Zap size={14} aria-hidden="true"/>Supply: {reading?.voltage == null ? "Not reported" : `${Number(reading.voltage.toFixed(2))} V`}</span><span><HardDrive size={14} aria-hidden="true"/>SD card: {reading?.sd_ok == null ? "Not reported" : reading.sd_ok ? "Ready" : "Error"}</span></div>
        {off && <p className="chamber-reading-note">Controller off. Measurements are unavailable until the chamber resumes reporting.</p>}
        <div className="chamber-card-footer"><span className={`chamber-health ${tone}`}>{status}</span><small>{reading ? `${recent ? "Measured" : "Last known"} ${new Date(reading.recorded_at).toLocaleString()}` : "No reading yet"}</small></div>
      </button>;
    })}</div>
    {devices.length > 6 && <p className="chamber-overview-hint">Showing 6 chambers. Find any linked chamber using the header search.</p>}
  </section>;
}
