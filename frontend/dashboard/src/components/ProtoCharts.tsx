import { useState } from 'react';
import { motion } from 'motion/react';

/* ------------------------------------------------------------------ */
/* Circular progress ring — used for layman-friendly percentages       */
/* ------------------------------------------------------------------ */

export function Ring({
  value,
  label,
  sub,
  tone = '#16A34A',
}: {
  value: number;
  label: string;
  sub?: string;
  tone?: string;
}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-32 w-32">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#E5F3EB" strokeWidth="9" />
          <motion.circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={tone}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c - (value / 100) * c }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-foreground">{value}%</span>
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
      </div>
      <span className="mt-2 text-sm font-medium text-foreground">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tiny sparkline                                                      */
/* ------------------------------------------------------------------ */

export function Spark({ data, color = '#16A34A' }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data
    .map(
      (d, i) =>
        `${(i / (data.length - 1 || 1)) * 100},${28 - ((d - min) / (max - min || 1)) * 24}`
    )
    .join(' ');
  return (
    <svg viewBox="0 0 100 32" className="h-8 w-full" preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Labelled bar chart percentage mapper                               */
/* ------------------------------------------------------------------ */

export function barPct(data: number[]): number[] {
  const hi = Math.max(...data);
  const lo = Math.min(...data);
  const span = hi - lo;
  if (span <= 0) return data.map(() => 70);
  const floor = lo - span * 0.55;
  const denom = hi - floor;
  return data.map((v) => Math.max(10, Math.min(100, ((v - floor) / denom) * 100)));
}

export function BarChart({
  data,
  labels,
  unit = '',
  color = '#16A34A',
  height = 'h-40',
  highlightLast = false,
}: {
  data: number[];
  labels: string[];
  unit?: string;
  color?: string;
  height?: string;
  highlightLast?: boolean;
}) {
  const pcts = barPct(data);
  return (
    <div className={`flex ${height} items-end gap-2`}>
      {data.map((v, i) => {
        const active = highlightLast && i === data.length - 1;
        return (
          <div key={i} className="flex h-full flex-1 flex-col items-center gap-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground">
              {v}
              {unit}
            </span>
            <div className="flex w-full flex-1 items-end">
              <motion.div
                className="w-full rounded-t-md"
                style={{ backgroundColor: active ? color : `${color}55` }}
                initial={{ height: 0 }}
                animate={{ height: `${pcts[i]}%` }}
                transition={{ delay: i * 0.05, duration: 0.5 }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{labels[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Donut chart for distribution splits                                */
/* ------------------------------------------------------------------ */

export function Donut({
  segments,
  size = 120,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = 42;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox="0 0 100 100"
        style={{ width: size, height: size }}
        className="-rotate-90 shrink-0"
      >
        <circle cx="50" cy="50" r={r} fill="none" stroke="#E5F3EB" strokeWidth="12" />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="12"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-acc}
              strokeLinecap="round"
            />
          );
          acc += len;
          return el;
        })}
      </svg>
      <div className="space-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="ml-auto font-semibold">{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Daily water-use chart with view table                              */
/* ------------------------------------------------------------------ */

export function WaterUseChart({
  data,
  height = 'h-48',
}: {
  data: { day: string; L: number }[];
  height?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const total = +data.reduce((s, d) => s + d.L, 0).toFixed(1);
  const maximum = Math.max(1, ...data.map((d) => d.L));
  const pcts = data.map((d) => (d.L / maximum) * 100);

  if (!data.length) {
    return (
      <div className="grid h-40 place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        No water records available.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Period total: <b className="text-foreground">{total} L</b>
        </p>
        <button
          onClick={() => setShowTable((v) => !v)}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {showTable ? 'View chart' : 'View data'}
        </button>
      </div>
      {showTable ? (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-1.5">Day</th>
              <th className="py-1.5 text-right">Water (L)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day} className="border-b border-border/50">
                <td className="py-1.5">{d.day}</td>
                <td className="py-1.5 text-right font-mono">{d.L.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div
          className={`flex ${height} items-end gap-2`}
          role="img"
          aria-label={`Daily water use. ${data.map((d) => `${d.day} ${d.L} litres`).join(', ')}. Total ${total} litres.`}
        >
          {data.map((d, i) => (
            <div key={d.day} className="flex h-full flex-1 flex-col items-center gap-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground">{d.L}L</span>
              <div className="flex w-full flex-1 items-end">
                <motion.div
                  className="w-full rounded-t-md bg-blue-500/80"
                  style={{ minHeight: 4 }}
                  initial={{ height: 0 }}
                  animate={{ height: `${pcts[i]}%` }}
                  transition={{ delay: i * 0.05, duration: 0.5 }}
                  title={`${d.day}: ${d.L} L`}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{d.day}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
