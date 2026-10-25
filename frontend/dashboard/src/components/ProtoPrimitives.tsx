import React, { useState, useEffect } from 'react';
import { useDialog } from './useDialog';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  ChevronDown,
  CheckCircle2,
  CircleDot,
  Lock,
  Leaf,
  type LucideIcon,
} from 'lucide-react';
import logoUrl from '../assets/logo.png';
import {
  type Tone,
  toneMap,
  type Role,
  ROLE_LABEL,
  LIFECYCLE,
  stageState,
  FAQ,
} from '../data/prototypeFixtures';

/* ------------------------------------------------------------------ */
/* Brand Logo                                                         */
/* ------------------------------------------------------------------ */

export function Logo({ className = 'h-12 w-12' }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center bg-transparent ${className}`}>
      <img src={logoUrl} alt="SproutSync logo" className="h-full w-full object-contain drop-shadow-sm" />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Badge & Button Primitives                                          */
/* ------------------------------------------------------------------ */

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneMap[tone]}`}
    >
      {children}
    </span>
  );
}

export function Btn({
  children,
  onClick,
  variant = 'primary',
  className = '',
  type = 'button',
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'outline' | 'ghost' | 'subtle';
  className?: string;
  disabled?: boolean;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 disabled:pointer-events-none';
  const styles = {
    primary: 'bg-primary text-primary-foreground hover:bg-emerald-600 shadow-sm shadow-emerald-600/20',
    outline: 'border border-border bg-card text-foreground hover:bg-secondary',
    ghost: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
    subtle: 'bg-secondary text-secondary-foreground hover:bg-accent',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function GoogleIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-border bg-card p-5 ${
        onClick
          ? 'cursor-pointer transition-all hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-900/5'
          : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Spring Animated Modal                                              */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const dialogRef = useDialog(open, onClose);
  const titleId = React.useId();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            className="max-h-[90vh] w-full overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-card p-6 sm:max-w-lg sm:rounded-2xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 id={titleId} className="text-lg font-bold text-foreground">{title}</h3>
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Toggle Switch                                                      */
/* ------------------------------------------------------------------ */

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? 'bg-primary' : 'bg-switch-background'
      }`}
    >
      <motion.span
        className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow"
        animate={{ x: on ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Growth Lifecycle Stepper                                           */
/* ------------------------------------------------------------------ */

export function Lifecycle({
  day,
  detailed = false,
}: {
  day: number;
  detailed?: boolean;
}) {
  const current = LIFECYCLE.find((s) => stageState(day, s.range) === 'current');
  return (
    <div>
      {current && (
        <div className="mb-4 rounded-xl bg-primary/5 px-4 py-3">
          <p className="text-xs text-muted-foreground">Current stage</p>
          <p className="font-bold text-primary">
            {current.name} · {current.sub}
          </p>
        </div>
      )}
      <ol className="relative space-y-1">
        {LIFECYCLE.map((s, i) => {
          const st = stageState(day, s.range);
          const last = i === LIFECYCLE.length - 1;
          return (
            <li key={s.key} className="relative flex gap-3 pb-3">
              {!last && (
                <span
                  className={`absolute left-[11px] top-6 h-full w-0.5 ${
                    st === 'done' ? 'bg-primary' : 'bg-border'
                  }`}
                />
              )}
              <span
                className={`relative z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
                  st === 'done'
                    ? 'border-primary bg-primary text-white'
                    : st === 'current'
                    ? 'border-primary bg-white text-primary'
                    : 'border-border bg-white text-transparent'
                }`}
              >
                {st === 'done' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : st === 'current' ? (
                  <CircleDot className="h-4 w-4" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-border" />
                )}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-sm font-semibold ${
                    st === 'current'
                      ? 'text-primary'
                      : st === 'todo'
                      ? 'text-muted-foreground'
                      : 'text-foreground'
                  }`}
                >
                  {s.name} {st === 'current' && <span className="text-xs font-normal">(current)</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.sub}
                  {st === 'done' ? ' · complete' : ''}
                </p>
                {detailed && <p className="mt-0.5 text-xs text-muted-foreground/80">{s.tech}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ List Accordion                                                 */
/* ------------------------------------------------------------------ */

export function FaqList() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-2">
      {FAQ.map((f, i) => {
        const expanded = open === i;
        return (
          <div key={i} className="overflow-hidden rounded-xl border border-border">
            <button
              onClick={() => setOpen(expanded ? null : i)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-secondary"
            >
              <span className="flex-1 text-sm font-semibold">{f.q}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                  expanded ? 'rotate-180' : ''
                }`}
              />
            </button>
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <p className="border-t border-border px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                    {f.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings Panel                                                     */
/* ------------------------------------------------------------------ */

export function SettingsPanel() {
  const [rows, setRows] = useState([
    { label: 'Farm alerts', on: true, d: 'Low water, drainage and device warnings' },
    { label: 'Harvest reminders', on: true, d: 'Notify me when a batch is ready' },
    { label: 'Weekly email report', on: false, d: 'Water use and yield summary' },
  ]);
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-sm font-semibold">Notifications</p>
        <div className="divide-y divide-border">
          {rows.map((r, i) => (
            <div key={r.label} className="flex items-center justify-between gap-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{r.label}</p>
                <p className="text-xs text-muted-foreground">{r.d}</p>
              </div>
              <Toggle
                on={r.on}
                label={r.label}
                onChange={() =>
                  setRows(rows.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))
                }
              />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-secondary p-4 text-sm">
        <p className="font-semibold">About SproutSync</p>
        <p className="mt-1 text-muted-foreground">
          An automated system for growing mung bean sprouts — handles watering, tracks conditions, and
          keeps records for every batch. Version 1.0.0 · Firmware v2.1.0
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Personal Profile Editor                                            */
/* ------------------------------------------------------------------ */

export function ProfileEditor({
  role,
  name,
  email,
  onSave,
  onCancel,
}: {
  role: Role;
  name: string;
  email?: string;
  onSave: (n: string) => void;
  onCancel: () => void;
}) {
  const [displayName, setDisplayName] = useState(name);
  const [saving, setSaving] = useState(false);
  const trimmed = displayName.trim();
  const error =
    trimmed.length === 0
      ? 'Display name is required.'
      : trimmed.length > 40
      ? 'Keep the name under 40 characters.'
      : '';
  const dirty = trimmed !== name;
  const initials = (trimmed || name).charAt(0).toUpperCase();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (error) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      onSave(trimmed);
    }, 500);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-4">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
          {initials}
        </span>
        <div>
          <p className="text-lg font-bold">{trimmed || '—'}</p>
          <Badge tone={role === 'admin' ? 'blue' : role === 'evaluator' ? 'gray' : 'green'}>
            {ROLE_LABEL[role]}
          </Badge>
        </div>
      </div>

      <div>
        <label htmlFor="pf-name" className="mb-1.5 block text-sm font-medium">
          Display name
        </label>
        <input
          id="pf-name"
          value={displayName}
          maxLength={60}
          onChange={(e) => setDisplayName(e.target.value)}
          aria-invalid={!!error}
          className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      <div className="rounded-xl bg-secondary p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Read-only
        </p>
        <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {[
            ['Role', ROLE_LABEL[role]],
            ['Account ID', `SS-${role.toUpperCase()}-001`],
            ['Permissions', 'Managed by administrator'],
            ['Email', email || 'grower@sproutsync.io'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
              <dd className="text-sm font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          Your role and access level are managed by your authenticated account session.
        </p>
      </div>

      <div className="flex gap-2">
        <Btn type="submit" className="flex-1">
          {saving ? 'Saving…' : 'Save'}
        </Btn>
        <Btn type="button" variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Btn>
      </div>
      {dirty && !saving && (
        <p className="text-center text-xs text-amber-600">You have unsaved changes.</p>
      )}
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Device Actions Simulator                                           */
/* ------------------------------------------------------------------ */

export function DeviceActions({ name }: { name: string }) {
  const [note, setNote] = useState<string | null>(null);
  const record = (kind: string) => setNote(`${kind} logged for “${name}”.`);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Btn
          variant="outline"
          className="flex-1 text-xs"
          onClick={() => record('Diagnostics request')}
        >
          Request diagnostics
        </Btn>
        <Btn
          variant="subtle"
          className="flex-1 text-xs"
          onClick={() => record('Maintenance note')}
        >
          Record maintenance
        </Btn>
      </div>
      {note && (
        <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">{note}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Access Denied State                                                */
/* ------------------------------------------------------------------ */

export function AccessDenied({ onBack }: { onBack: () => void }) {
  return (
    <Card className="mx-auto max-w-md text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-secondary text-muted-foreground">
        <Lock className="h-7 w-7" />
      </span>
      <h3 className="mt-4 text-lg font-bold">Access restricted</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Your role does not have access to this page. Contact an administrator if you need access.
      </p>
      <div className="mt-5 flex justify-center">
        <Btn onClick={onBack}>Back to Overview</Btn>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Evaluator Acceptance Evidence View                                 */
/* ------------------------------------------------------------------ */

export function Evidence() {
  const rows = [
    {
      c: 'Scheduled rinsing executes in tray sequence',
      method: 'Timed run + valve-response log',
      rule: 'All 3 trays actuate in order',
      status: 'Not yet tested',
    },
    {
      c: 'Drainage verified before next tray',
      method: 'Drainage-check sensor / interlock log',
      rule: 'Supplied on validation',
      status: 'Not yet tested',
    },
    {
      c: 'Low fresh-water interlock pauses watering',
      method: 'Drain-down test to threshold',
      rule: 'Watering pauses < 15%',
      status: 'Not yet tested',
    },
    {
      c: 'Delivered water attributable per tray',
      method: 'Flow sensor under valve sequencing',
      rule: 'Documented assumptions',
      status: 'Not yet tested',
    },
    {
      c: 'Records persist through disconnection',
      method: 'Disconnect + reconnect queue check',
      rule: 'Queue recovers on reconnect',
      status: 'Not yet tested',
    },
  ];
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Acceptance evidence</h3>
          <Badge tone="gray">Read-only</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Criteria, planned measurement methods and result status. Results are populated only from
          actual tests — never from sample operational readings.
        </p>
        <div className="mt-4 -mx-2 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-2 py-2 font-medium">Criterion</th>
                <th className="px-2 py-2 font-medium">Planned method</th>
                <th className="px-2 py-2 font-medium">Expected rule</th>
                <th className="px-2 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.c} className="border-b border-border/50 align-top">
                  <td className="px-2 py-2.5 font-medium">{r.c}</td>
                  <td className="px-2 py-2.5 text-muted-foreground">{r.method}</td>
                  <td className="px-2 py-2.5 text-muted-foreground">{r.rule}</td>
                  <td className="px-2 py-2.5">
                    <Badge tone="amber">{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton and Metric Stat                                           */
/* ------------------------------------------------------------------ */

export function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-secondary" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-2xl bg-secondary" />
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'green',
}: {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <Badge tone={tone}>{sub}</Badge>
      </div>
      <p className="mt-3 text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </Card>
  );
}
