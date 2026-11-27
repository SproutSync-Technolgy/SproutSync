import type {CSSProperties, ReactNode} from "react";

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

const WIDTH = 320;
const TOP = 7;
const BOTTOM = 66;

function displayNumber(value: number) {
  return new Intl.NumberFormat(undefined, {maximumFractionDigits: 2}).format(value);
}

export function TelemetryMetricCard({label,value,unit,color,icon,status,statusTone,reference,range,points}: Props) {
  const metricStyle = {"--metric-color":color,"--metric-tint":`${color}18`} as CSSProperties & {"--metric-color":string;"--metric-tint":string};
  const samples = points.filter((point) => typeof point.value === "number" && Number.isFinite(point.value));
  const values = samples.map((point) => Number(point.value));
  const dataMin = Math.min(range.min,...values);
  const dataMax = Math.max(range.max,...values);
  const span = Math.max(dataMax-dataMin, Math.abs(dataMin)*0.04, 1);
  const min = dataMin-span*0.12;
  const max = dataMax+span*0.12;
  const y = (reading: number) => BOTTOM-((reading-min)/(max-min))*(BOTTOM-TOP);
  const plotted = samples.map((point,index) => ({
    ...point,
    x: samples.length < 2 ? WIDTH-3 : 3+(index/(samples.length-1))*(WIDTH-6),
    y: y(Number(point.value)),
  }));
  const line = plotted.map((point) => `${point.x},${point.y}`).join(" ");
  const area = plotted.length ? `3,${BOTTOM} ${line} ${plotted[plotted.length-1].x},${BOTTOM}` : "";
  const bandTop = y(range.max);
  const bandBottom = y(range.min);
  const unitText = unit ? ` ${unit}` : "";
  const spokenSamples = plotted.map((point) => `${displayNumber(Number(point.value))}${unitText} at ${new Date(point.timestamp).toLocaleString()}`).join("; ");
  const currentText = value == null || !Number.isFinite(value) ? "No current sensor value" : `Current ${label}: ${displayNumber(value)}${unitText}`;

  return <article className="telemetry-metric-card" style={metricStyle}>
    <div className="telemetry-card-heading">
      <span className="telemetry-card-icon" aria-hidden="true">{icon}</span>
      <span className="telemetry-card-label">{label}</span>
      <span className={`telemetry-status-chip telemetry-status-${statusTone}`}><span aria-hidden="true" />{status}</span>
    </div>
    <div className="telemetry-card-reading">
      <span className="telemetry-reading-value">{value == null || !Number.isFinite(value) ? "—" : displayNumber(value)}</span>
      {unit && <span className="telemetry-reading-unit">{unit}</span>}
    </div>
    <div className="telemetry-chart-heading">
      <span>Recent raw readings</span>
      <span>{samples.length} samples</span>
    </div>
    {plotted.length ? <svg className="telemetry-sparkline" viewBox={`0 0 ${WIDTH} 74`} preserveAspectRatio="none" role="img" aria-label={`${currentText}. Reference ${reference}. Recent raw readings: ${spokenSamples}`}>
      <title>{currentText}; reference {reference}</title>
      <rect x="0" y={bandTop} width={WIDTH} height={Math.max(0,bandBottom-bandTop)} rx="3" className="telemetry-target-band" />
      <line x1="0" x2={WIDTH} y1={bandTop} y2={bandTop} className="telemetry-target-edge" />
      <line x1="0" x2={WIDTH} y1={bandBottom} y2={bandBottom} className="telemetry-target-edge" />
      {plotted.length > 1 && <polygon points={area} className="telemetry-trend-area" />}
      {plotted.length > 1 && <polyline points={line} className="telemetry-trend-line" />}
      {plotted.map((point,index) => <circle key={`${point.timestamp}-${index}`} cx={point.x} cy={point.y} r={index === plotted.length-1 ? 4 : 2.3} className={index === plotted.length-1 ? "telemetry-point-current" : "telemetry-point"}>
        <title>{displayNumber(Number(point.value))}{unitText} · {new Date(point.timestamp).toLocaleString()}</title>
      </circle>)}
    </svg> : <div className="telemetry-chart-empty">Waiting for raw samples</div>}
    <div className="telemetry-card-footer"><span>Reference</span><strong>{reference}</strong></div>
  </article>;
}
