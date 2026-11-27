import {lazy, Suspense, useState, type CSSProperties, type ReactNode} from "react";
import {Activity, Clock3, LoaderCircle} from "lucide-react";
import {Modal} from "./ProtoPrimitives";

const TelemetryDetailChart = lazy(() => import("./TelemetryDetailChart"));

export type TelemetryPoint = {value: number | null | undefined; timestamp: string};

type Props = {
  label: string;
  value: number | null | undefined;
  unit: string;
  color: string;
  icon: ReactNode;
  status: string;
  statusTone: "good" | "attention" | "stale" | "empty";
  reference: string;
  range: {min: number; max: number};
  points: TelemetryPoint[];
};

function displayNumber(value: number) {
  return new Intl.NumberFormat(undefined, {maximumFractionDigits: 2}).format(value);
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(timestamp);
}

export function TelemetryMetricCard({label,value,unit,color,icon,status,statusTone,reference,range,points}: Props) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<"24h" | "7d" | "all">("all");
  const metricStyle = {"--metric-color":color,"--metric-tint":`${color}18`} as CSSProperties & {"--metric-color":string;"--metric-tint":string};
  const samples = points
    .filter((point) => typeof point.value === "number" && Number.isFinite(point.value) && Number.isFinite(Date.parse(point.timestamp)))
    .map((point) => ({...point,time:Date.parse(point.timestamp),value:Number(point.value)}));
  const periodMs = period === "24h" ? 24 * 60 * 60 * 1000 : period === "7d" ? 7 * 24 * 60 * 60 * 1000 : null;
  const cutoff = periodMs == null ? null : Date.now() - periodMs;
  const visibleSamples = cutoff == null ? samples : samples.filter((sample) => sample.time >= cutoff);
  const unitText = unit ? ` ${unit}` : "";

  return <>
    <button type="button" className="telemetry-metric-card telemetry-metric-trigger" style={metricStyle} onClick={() => setOpen(true)} title={`View ${label.toLowerCase()} chart and readings`} aria-label={`${label}: ${value == null || !Number.isFinite(value) ? "no current reading" : `${displayNumber(value)} ${unit}`}. ${status}. View chart and raw readings.`}>
      <span className="telemetry-card-heading">
        <span className="telemetry-card-icon" aria-hidden="true">{icon}</span>
        <span className="telemetry-card-label">{label}</span>
        <span className={`telemetry-status-chip telemetry-status-${statusTone}`} title={status}><span aria-hidden="true" />{statusTone === "good" ? "Live" : statusTone === "stale" ? "Last known" : statusTone === "attention" ? "Check" : "No data"}</span>
      </span>
      <span className="telemetry-card-reading">
        <span className="telemetry-reading-value">{value == null || !Number.isFinite(value) ? "—" : displayNumber(value)}</span>
        {unit && <span className="telemetry-reading-unit">{unit}</span>}
      </span>
      <span className="telemetry-card-compact-chart"><span className="telemetry-card-chart-caption"><span><Activity size={13} aria-hidden="true" /> View trend</span><span>{samples.length} samples</span></span></span>
      <span className="telemetry-card-footer"><span>Reference</span><strong>{reference}</strong></span>
    </button>
    <Modal open={open} onClose={() => setOpen(false)} title={`${label} readings`} className="telemetry-detail-modal">
      <div className="telemetry-detail-summary">
        <span className="telemetry-card-icon" style={metricStyle} aria-hidden="true">{icon}</span>
        <div><span className="telemetry-detail-label">Current reading</span><strong>{value == null || !Number.isFinite(value) ? "—" : `${displayNumber(value)} ${unit}`}</strong></div>
        <span className={`telemetry-status-chip telemetry-status-${statusTone}`}><span aria-hidden="true" />{status}</span>
      </div>
      <section className="telemetry-detail-panel" aria-label={`${label} trend chart`}>
        <div className="telemetry-detail-panel-heading"><div><strong>Raw sensor trend</strong><span>{visibleSamples.length} readings · {period === "all" ? "all available history" : `last ${period}`}{value == null || !Number.isFinite(value) ? " · no current value" : ""}</span></div><span className="telemetry-reference-chip">{reference}</span></div>
        <div className="telemetry-range-picker" role="group" aria-label="Chart time range">
          {([ ["24h", "24 hours"], ["7d", "7 days"], ["all", "All history"] ] as const).map(([key, title]) => <button key={key} type="button" aria-pressed={period === key} onClick={() => setPeriod(key)}>{title}</button>)}
        </div>
        {visibleSamples.length ? <Suspense fallback={<div className="telemetry-chart-loading" role="status"><LoaderCircle size={18} className="animate-spin" /> Loading chart…</div>}><TelemetryDetailChart samples={visibleSamples} label={label} unit={unit} color={color} range={range} formatNumber={displayNumber} formatTimestamp={formatTimestamp} /></Suspense> : <p className="telemetry-chart-empty">{samples.length ? "No saved readings in this time range. Choose a wider range to see earlier data." : "No saved readings for this sensor yet."}</p>}
      </section>
      <section className="telemetry-detail-history" aria-label={`${label} reading history`}>
        <div className="telemetry-detail-panel-heading"><div><strong>Reading history</strong><span>Newest readings first</span></div><span className="telemetry-reference-chip"><Clock3 size={13} /> {samples.length}</span></div>
        {visibleSamples.length ? <div className="telemetry-detail-table-wrap"><table className="telemetry-detail-table"><thead><tr><th scope="col">Recorded</th><th scope="col">Value</th></tr></thead><tbody>{[...visibleSamples].reverse().map((point,index) => <tr key={`${point.timestamp}-${index}`}><td>{new Date(point.timestamp).toLocaleString()}</td><td>{displayNumber(point.value)}{unitText}</td></tr>)}</tbody></table></div> : <p className="telemetry-detail-empty">{samples.length ? "No readings in this time range. Choose a wider range to view history." : "Sensor history will appear here when readings arrive."}</p>}
      </section>
    </Modal>
  </>;
}
