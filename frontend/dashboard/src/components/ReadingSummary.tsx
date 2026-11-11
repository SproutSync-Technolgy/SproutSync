import type {LatestReading} from "../data/liveTelemetry";
import {aggregationLabel} from "../data/deviceHealth";

export function measurement(value: number | null | undefined, unit: string) {
  return value == null || !Number.isFinite(value) ? "—" : `${Number(value.toFixed(2))} ${unit}`;
}

const metrics = [
  ["temperature_c", "Air temperature", "°C"],
  ["humidity_percent", "Humidity", "%"],
  ["water_level_percent", "Fresh water", "%"],
  ["water_temperature_c", "Water temperature", "°C"],
  ["light_lux", "Light", "lux"],
  ["wastewater_level_percent", "Wastewater", "%"],
] as const;

/** Native disclosure keeps sample provenance available to keyboard and touch. */
export function ReadingSummary({reading}: {reading: LatestReading}) {
  const averaged = ["minute","five_min","five_minute","hourly","daily"].includes(reading.aggregation ?? "");
  if (!averaged) return <span>{aggregationLabel(reading.aggregation)}</span>;
  return <details className="reading-summary">
    <summary>{aggregationLabel(reading.aggregation,reading.provisional)}</summary>
    <div>
      {reading.provisional && <p>Current-minute preview. This updates in place and is not an extra saved record.</p>}
      <p>{reading.sample_count ?? 1} packets · {reading.fault_count ?? 0} with a fault</p>
      {reading.window_started_at && reading.window_ended_at && <p>{new Date(reading.window_started_at).toLocaleTimeString()}–{new Date(reading.window_ended_at).toLocaleTimeString()}</p>}
      <dl>{metrics.map(([key,label,unit]) => {
        const stats = reading.metric_stats?.[key];
        const count = reading.metric_counts?.[key] ?? stats?.count;
        return <div key={key}><dt>{label}</dt><dd>{count == null ? "Sample count unavailable" : `${count} valid samples`}{stats && stats.count > 0 && <> · {measurement(stats.min,unit)}–{measurement(stats.max,unit)}</>}</dd></div>;
      })}</dl>
    </div>
  </details>;
}
