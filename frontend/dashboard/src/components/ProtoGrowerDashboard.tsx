import React, { useState, useEffect, useMemo, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Boxes,
  Droplets,
  Bell,
  FileBarChart,
  Wrench,
  Settings,
  LifeBuoy,
  Menu,
  X,
  Search,
  LogOut,
  User as UserIcon,
  Cpu,
  Clock,
  TrendingUp,
  ShieldCheck,
  HardDrive,
  MessageSquare,
  CheckCircle2,
  CircleDot,
  Filter,
  Plus,
  Wifi,
  Sprout,
  CalendarClock,
  Check,
  CheckCheck,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Timer,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import chamberViews from '../assets/chamber-views.png';
import {
  type Role,
  ROLE_LABEL,
  can,
  SENSORS,
  BATCHES as FIXED_BATCHES,
  ALERTS,
  WATER_WEEK,
  WATER_WEEK_TOTAL,
  WATER_TODAY,
  DEVICES_ONLINE,
  DEVICES_TOTAL,
  PROTOCOL,
  TRAYS,
  TICKETS,
  OPS_LOGS,
  type Tone,
  type SensorItem,
  type DemoBatch,
} from '../data/prototypeFixtures';
import {
  Logo,
  Badge,
  Btn,
  Card,
  Modal,
  Lifecycle,
  FaqList,
  SettingsPanel,
  ProfileEditor,
  DeviceActions,
  AccessDenied,
  Evidence,
  Skeleton,
  Stat,
} from './ProtoPrimitives';
import { Ring, Spark, BarChart, Donut, WaterUseChart } from './ProtoCharts';

export type AuthenticatedUser = {
  id: number;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
};

export type LiveBatch = {
  id: number;
  code: string;
  seed_type: string;
  stage: string;
  status: string;
  target_harvest_at: string | null;
};

type NavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
};

const NAV_ALL: NavItem[] = [
  { key: 'home', label: 'Overview', icon: LayoutDashboard, roles: ['admin', 'operator', 'evaluator'] },
  { key: 'batches', label: 'Batches', icon: Boxes, roles: ['admin', 'operator', 'evaluator'] },
  { key: 'water', label: 'Irrigation', icon: Droplets, roles: ['admin', 'operator', 'evaluator'] },
  { key: 'alerts', label: 'Alerts', icon: Bell, roles: ['admin', 'operator', 'evaluator'] },
  { key: 'reports', label: 'Reports', icon: FileBarChart, roles: ['admin', 'operator', 'evaluator'] },
  { key: 'evidence', label: 'Acceptance evidence', icon: ShieldCheck, roles: ['admin', 'evaluator'] },
  { key: 'maintenance', label: 'Maintenance', icon: Wrench, roles: ['admin', 'operator'] },
  { key: 'support', label: 'Operational logs', icon: MessageSquare, roles: ['admin', 'operator'] },
];

/* ------------------------------------------------------------------ */
/* CreateBatchModal (Main's live Supabase/FastAPI batch creator)      */
/* ------------------------------------------------------------------ */

function CreateBatchModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (batch: LiveBatch) => void;
}) {
  const [code, setCode] = useState('');
  const [startedAt, setStartedAt] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/v1/batches', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          started_at: new Date(`${startedAt}T00:00:00Z`).toISOString(),
        }),
      });
      if (!response.ok) throw new Error('Unable to create batch. Please try again.');
      const newBatch = (await response.json()) as LiveBatch;
      onCreated(newBatch);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create batch.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-secondary p-4">
        <p className="text-sm font-semibold">New production batch</p>
        <p className="text-xs text-muted-foreground">
          Create an active batch record in SproutSync. It will appear alongside your fixed demonstration trays.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="create-batch-code" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Batch code
          </label>
          <input
            id="create-batch-code"
            required
            maxLength={64}
            placeholder="e.g. MB-2411"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label htmlFor="create-batch-start" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Start date
          </label>
          <input
            id="create-batch-start"
            required
            type="date"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2 pt-2">
          <Btn type="submit" className="flex-1" disabled={saving}>
            {saving ? 'Creating…' : 'Create batch'}
          </Btn>
          <Btn type="button" variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Btn>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Grower Dashboard Shell                                             */
/* ------------------------------------------------------------------ */

export function ProtoGrowerDashboard({
  user,
  role,
  onLogout,
}: {
  user: AuthenticatedUser;
  role: Role;
  onLogout: () => void;
}) {
  const [active, setActive] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(user.display_name || user.email || 'Grower');
  const [modal, setModal] = useState<null | { title: string; body: React.ReactNode }>(null);

  // Live database batches
  const [liveBatches, setLiveBatches] = useState<LiveBatch[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/batches', { credentials: 'include', signal: controller.signal })
      .then((res) => {
        if (!res.ok) return [];
        return res.json() as Promise<LiveBatch[]>;
      })
      .then((data) => setLiveBatches(data || []))
      .catch(() => setLiveBatches([]));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(t);
  }, [active]);

  const nav = NAV_ALL.filter((n) => n.roles.includes(role));
  const navKeys = nav.map((n) => n.key);
  const activeLabel = nav.find((n) => n.key === active)?.label ?? 'Overview';

  const openSensor = (s: SensorItem) =>
    setModal({
      title: s.name,
      body: (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-secondary p-4">
            <div>
              <p className="text-3xl font-bold text-foreground">{s.value}</p>
              <p className="text-sm text-muted-foreground">Configured range {s.ideal}</p>
            </div>
            <Badge tone={s.tone}>{s.simple}</Badge>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Last 7 readings</p>
            <Spark data={s.trend} color={s.color} />
            <p className="font-mono mt-1 text-xs text-muted-foreground">{s.trend.join(' · ')}</p>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{s.detail}</p>
        </div>
      ),
    });

  const openBatch = (b: DemoBatch) =>
    setModal({
      title: `Batch ${b.id}`,
      body: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{b.tray}</span>
            <Badge tone={b.tone}>{b.status}</Badge>
          </div>
          <div className="flex justify-center">
            <Ring value={b.pct} label={`Day ${b.day} of ${b.total}`} sub="ready" />
          </div>
          <p className="text-center text-sm text-muted-foreground">{b.note}</p>
          <div>
            <p className="mb-3 text-sm font-semibold">Growth lifecycle</p>
            <Lifecycle day={b.day} detailed />
          </div>
          <div className="font-mono grid grid-cols-2 gap-2 rounded-xl bg-secondary p-3 text-xs">
            <span>Seed lot: MG-77</span>
            <span>Rinses/day: {PROTOCOL.rinsesPerDay}</span>
            <span>Protocol: {PROTOCOL.version}</span>
            <span>Tray: {b.tray}</span>
            <span className="col-span-2 text-muted-foreground">
              Harvest yield is recorded by the operator after inspection — not available until then.
            </span>
          </div>
        </div>
      ),
    });

  const openDevice = (d: {
    name: string;
    status: string;
    tone: Tone;
    last: string;
    tech: [string, string][];
  }) =>
    setModal({
      title: d.name,
      body: (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-secondary p-4">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Cpu className="h-5 w-5 text-muted-foreground" /> {d.last}
            </span>
            <Badge tone={d.tone}>{d.status}</Badge>
          </div>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {d.tech.map(([k, v]) => (
              <div key={k} className="border-b border-border/50 py-1.5">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className="font-mono text-sm">{v}</dd>
              </div>
            ))}
          </dl>
          {can(role, 'recordMaintenance') ? (
            <DeviceActions name={d.name} />
          ) : (
            <p className="rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
              Read-only — recording maintenance requires the Operator role.
            </p>
          )}
        </div>
      ),
    });

  const openProfile = () =>
    setModal({
      title: 'Personal profile',
      body: (
        <ProfileEditor
          role={role}
          name={displayName}
          email={user.email}
          onSave={(n) => {
            setDisplayName(n);
            setModal(null);
          }}
          onCancel={() => setModal(null)}
        />
      ),
    });

  const openSettings = () => setModal({ title: 'Settings', body: <SettingsPanel /> });
  const openHelp = () =>
    setModal({
      title: 'Help & FAQ',
      body: (
        <div className="space-y-4">
          <div className="rounded-xl bg-secondary p-4">
            <p className="text-sm font-semibold">Need more help?</p>
            <p className="text-sm text-muted-foreground">
              Email <span className="font-mono">support@sproutsync.io</span> or review the operational logs.
            </p>
          </div>
          <FaqList />
        </div>
      ),
    });

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Dark Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 px-5 py-5">
          <Logo />
          <span className="text-lg font-bold">SproutSync</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto rounded-lg p-1 hover:bg-sidebar-accent lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {nav.map((n) => {
            const on = active === n.key;
            return (
              <button
                key={n.key}
                onClick={() => {
                  setActive(n.key);
                  setSidebarOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  on
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                }`}
              >
                <n.icon className="h-[18px] w-[18px]" />
                {n.label}
                {n.key === 'alerts' && (
                  <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                    3
                  </span>
                )}
                {n.key === 'support' && (
                  <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-amber-950">
                    2
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/20 text-sm font-bold text-sidebar-foreground">
              {displayName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              <p className="truncate text-xs text-sidebar-foreground/60">{ROLE_LABEL[role]}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="lg:pl-64">
        {/* Sticky Header */}
        <header className="sticky top-0 z-30 flex w-full items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-secondary lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold leading-tight">{activeLabel}</h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {role === 'admin'
                  ? 'System administration & monitoring'
                  : role === 'evaluator'
                  ? 'Read-only view of records & evidence'
                  : 'Run batches & monitor your growing system'}
              </p>
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <div className="relative hidden items-center md:flex">
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
              <input
                placeholder="Search…"
                aria-label="Search"
                className="w-40 rounded-xl border border-border bg-input-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary lg:w-56"
              />
            </div>

            {/* Notification Popover */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => {
                  setNotifOpen(!notifOpen);
                  setProfileOpen(false);
                }}
                aria-label="Notifications"
                className="relative grid h-11 w-11 place-items-center rounded-xl hover:bg-secondary"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-red-500" />
              </button>
              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="fixed inset-x-3 top-16 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80"
                  >
                    <p className="px-3 py-2 text-sm font-semibold">Notifications</p>
                    {ALERTS.map((a) => (
                      <div key={a.id} className="flex gap-3 rounded-xl px-3 py-2.5 hover:bg-secondary">
                        <a.icon
                          className={`h-5 w-5 shrink-0 ${
                            a.tone === 'red'
                              ? 'text-red-500'
                              : a.tone === 'amber'
                              ? 'text-amber-500'
                              : 'text-primary'
                          }`}
                        />
                        <div>
                          <p className="text-sm font-medium leading-tight">{a.title}</p>
                          <p className="text-xs text-muted-foreground">{a.time}</p>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile Menu */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => {
                  setProfileOpen(!profileOpen);
                  setNotifOpen(false);
                }}
                aria-label="Account menu"
                className="flex h-11 items-center gap-2 rounded-xl px-1 pr-2 hover:bg-secondary"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {displayName.charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-[8rem] truncate text-sm font-semibold sm:block">
                  {displayName.split(' ')[0]}
                </span>
              </button>
              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute right-0 z-50 mt-2 w-56 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-border bg-card p-2 shadow-xl"
                  >
                    <div className="px-3 py-2">
                      <p className="text-sm font-semibold">{displayName}</p>
                      <p className="text-xs text-muted-foreground">{ROLE_LABEL[role]}</p>
                    </div>
                    <div className="my-1 h-px bg-border" />
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        openProfile();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"
                    >
                      <UserIcon className="h-4 w-4" /> Profile
                    </button>
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        openSettings();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"
                    >
                      <Settings className="h-4 w-4" /> Settings
                    </button>
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        openHelp();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"
                    >
                      <LifeBuoy className="h-4 w-4" /> Help &amp; FAQ
                    </button>
                    <button
                      onClick={onLogout}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="p-4 sm:p-6" onClick={() => { setProfileOpen(false); setNotifOpen(false); }}>
          {loading ? (
            <Skeleton />
          ) : (
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {!navKeys.includes(active) ? (
                <AccessDenied onBack={() => setActive('home')} />
              ) : (
                <>
                  {active === 'home' && (
                    role === 'operator' ? (
                      <GrowerUserHome openSensor={openSensor} />
                    ) : (
                      <TechnicalAdminHome
                        openSensor={openSensor}
                        openBatch={openBatch}
                        goAlerts={() => setActive('alerts')}
                      />
                    )
                  )}

                  {active === 'batches' && (
                    <HybridBatchesView
                      role={role}
                      liveBatches={liveBatches}
                      onBatchCreated={(b) => setLiveBatches((prev) => [b, ...prev])}
                      setModal={setModal}
                    />
                  )}

                  {active === 'water' && <WateringView role={role} />}
                  {active === 'alerts' && <AlertsTabView role={role} />}
                  {active === 'support' && <SupportAdminView role={role} setModal={setModal} />}
                  {active === 'reports' && <ReportsView />}
                  {active === 'evidence' && <Evidence />}
                  {active === 'maintenance' && <MaintenanceView openDevice={openDevice} />}
                </>
              )}
            </motion.div>
          )}
        </main>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.title ?? ''}>
        {modal?.body}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview: GrowerUserHome (for Operators)                           */
/* ------------------------------------------------------------------ */

function GrowerUserHome({ openSensor }: { openSensor: (s: SensorItem) => void }) {
  const activeBatch = FIXED_BATCHES[0];
  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-green-700 p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-emerald-100">Batch progress overview</p>
            <h2 className="mt-1 text-2xl font-extrabold">Trays 1–3 on the growing protocol</h2>
            <p className="mt-1 text-sm text-emerald-50">
              Next scheduled rinse in <b>~1h 20m</b>.
            </p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-extrabold">{activeBatch.pct}%</p>
            <p className="text-xs text-emerald-100">
              Batch {activeBatch.id} · Day {activeBatch.day}/{activeBatch.total}
            </p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 font-bold">Farm conditions</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SENSORS.map((s) => (
            <Card key={s.key} onClick={() => openSensor(s)}>
              <div className="flex items-center justify-between">
                <span
                  className="grid h-10 w-10 place-items-center rounded-xl"
                  style={{ backgroundColor: `${s.color}15`, color: s.color }}
                >
                  <s.icon className="h-5 w-5" />
                </span>
                <Badge tone={s.tone}>{s.simple}</Badge>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{s.name}</p>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-lg font-bold">{s.value}</p>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col items-center lg:col-span-1">
          <h3 className="mb-2 self-start font-bold">Growth progress</h3>
          <Ring value={activeBatch.pct} label={`Day ${activeBatch.day} of ${activeBatch.total}`} sub="ready" />
          <p className="mt-3 text-center text-sm text-muted-foreground">{activeBatch.note}</p>
        </Card>
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h3 className="font-bold">What to do next</h3>
          </div>
          <ul className="mt-4 space-y-3">
            {[
              { t: 'Refill the water tank soon', d: "It's getting low (34%). A full tank keeps watering on schedule.", done: false },
              { t: 'Inspect MB-2408 today', d: 'It has finished its scheduled growing time — check it and record the harvest.', done: false },
              { t: 'Watering running normally', d: 'Automatic rinse cycles are on track.', done: true },
            ].map((task, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl border border-border p-3">
                {task.done ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <CircleDot className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                )}
                <div>
                  <p className="text-sm font-semibold">{task.t}</p>
                  <p className="text-sm text-muted-foreground">{task.d}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Water used this week</h3>
            <Badge tone="green">{WATER_WEEK_TOTAL} L total</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Daily fresh-water consumption across all trays.</p>
          <div className="mt-4">
            <WaterUseChart data={WATER_WEEK} />
          </div>
        </Card>
        <Card className="flex flex-col justify-center">
          <h3 className="font-bold">Fresh-water tank</h3>
          <p className="mt-1 text-sm text-muted-foreground">Reservoir level remaining</p>
          <div className="mt-4 flex justify-center">
            <Ring value={34} label="34% left" sub="refill soon" tone="#F59E0B" />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview: TechnicalAdminHome (for Admin / Evaluator)               */
/* ------------------------------------------------------------------ */

function TechnicalAdminHome({
  openSensor,
  openBatch,
  goAlerts,
}: {
  openSensor: (s: SensorItem) => void;
  openBatch: (b: DemoBatch) => void;
  goAlerts: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-2 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <span className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Wifi className="h-4 w-4" /> Dashboard online
        </span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Cpu className="h-4 w-4" /> Controller: ESP32 &amp; Pi
        </span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <HardDrive className="h-4 w-4" /> Local logging: SD card
        </span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-primary" /> 0 records queued · sync active
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Demo trays" value={String(FIXED_BATCHES.length)} sub="3 physical trays" icon={Boxes} />
        <Stat
          label="Devices online"
          value={`${DEVICES_ONLINE} / ${DEVICES_TOTAL}`}
          sub={`${DEVICES_TOTAL - DEVICES_ONLINE} offline`}
          icon={Cpu}
          tone="amber"
        />
        <Stat label="Open tickets" value="2" sub="Needs review" icon={MessageSquare} tone="blue" />
        <Stat label="Water today" value={`${WATER_TODAY} L`} sub="Sunday" icon={Droplets} />
      </div>

      <div>
        <h3 className="mb-3 font-bold">Live telemetry readings</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SENSORS.map((s) => (
            <Card key={s.key} onClick={() => openSensor(s)}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <s.icon className="h-4 w-4" style={{ color: s.color }} /> {s.name}
                </span>
                <Badge tone={s.tone}>{s.simple}</Badge>
              </div>
              <p className="mt-2 text-2xl font-bold">{s.value}</p>
              <p className="font-mono text-xs text-muted-foreground">Target {s.ideal}</p>
              <div className="mt-2">
                <Spark data={s.trend} color={s.color} />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="font-bold">Batch pipeline</h3>
          <div className="mt-4 space-y-3">
            {FIXED_BATCHES.map((b) => (
              <button
                key={b.id}
                onClick={() => openBatch(b)}
                className="w-full rounded-xl border border-border p-3 text-left transition hover:border-emerald-300 hover:bg-secondary active:scale-[0.99]"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">
                      {b.id} <span className="font-normal text-muted-foreground">· {b.tray}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Day {b.day} of {b.total}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={b.tone}>{b.status}</Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${b.pct}%` }}
                    transition={{ duration: 0.8 }}
                  />
                </div>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Recent alerts</h3>
            <button
              onClick={goAlerts}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              View all <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-4 space-y-1">
            {ALERTS.map((a) => (
              <button
                key={a.id}
                onClick={goAlerts}
                className="flex w-full gap-3 rounded-xl p-2 text-left transition hover:bg-secondary"
              >
                <a.icon
                  className={`mt-0.5 h-5 w-5 shrink-0 ${
                    a.tone === 'red'
                      ? 'text-red-500'
                      : a.tone === 'amber'
                      ? 'text-amber-500'
                      : 'text-primary'
                  }`}
                />
                <div>
                  <p className="text-sm font-semibold leading-tight">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.body}</p>
                </div>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Fresh-water used · 7 days</h3>
            <Badge tone="blue">{WATER_WEEK_TOTAL} L total</Badge>
          </div>
          <div className="mt-4">
            <WaterUseChart data={WATER_WEEK} />
          </div>
        </Card>
        <Card className="flex flex-col justify-center">
          <h3 className="font-bold">Batches by stage</h3>
          <p className="mt-1 text-sm text-muted-foreground">Demo trays distribution</p>
          <div className="mt-4">
            <Donut
              segments={[
                { label: 'Soaking', value: 1, color: '#F59E0B' },
                { label: 'Growing', value: 1, color: '#16A34A' },
                { label: 'Inspection due', value: 1, color: '#3B82F6' },
              ]}
              size={104}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Batches View: Hybrid Fixed Demo Trays + Main's "+ New batch" Modal  */
/* ------------------------------------------------------------------ */

function HybridBatchesView({
  role,
  liveBatches,
  onBatchCreated,
  setModal,
}: {
  role: Role;
  liveBatches: LiveBatch[];
  onBatchCreated: (b: LiveBatch) => void;
  setModal: (m: { title: string; body: React.ReactNode }) => void;
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const canCreate = can(role, 'runBatch');

  const upcoming = [
    { id: 'MB-2408', when: 'Inspection due', tone: 'blue' as Tone },
    { id: 'MB-2409', when: 'In ~2 days', tone: 'green' as Tone },
    { id: 'MB-2410', when: 'In ~4 days', tone: 'amber' as Tone },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header with + New batch action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Active Chamber Batches</h2>
          <p className="text-sm text-muted-foreground">
            3 fixed demonstration trays with real-time lifecycle tracking plus live database batches.
          </p>
        </div>
        {canCreate && (
          <Btn onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New batch
          </Btn>
        )}
      </div>

      {/* Live created batches (if any exist in Supabase/Postgres) */}
      {liveBatches.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Database Production Batches ({liveBatches.length})
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {liveBatches.map((b) => (
              <Card key={b.id} className="border-emerald-300/80 bg-emerald-50/20">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{b.code}</span>
                  <Badge tone="green">{b.stage}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{b.seed_type}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Status: {b.status}</span>
                  <span>{b.target_harvest_at ? `ETA: ${new Date(b.target_harvest_at).toLocaleDateString()}` : 'Live record'}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Prototype Fixed 3-Tray Demo Batches */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Chamber Physical Trays (Fixed Demo)
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FIXED_BATCHES.map((b) => (
            <Card
              key={b.id}
              onClick={() =>
                setModal({
                  title: `Batch ${b.id}`,
                  body: (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{b.tray}</span>
                        <Badge tone={b.tone}>{b.status}</Badge>
                      </div>
                      <div className="flex justify-center">
                        <Ring value={b.pct} label={`Day ${b.day} of ${b.total}`} sub="ready" />
                      </div>
                      <p className="text-center text-sm text-muted-foreground">{b.note}</p>
                      <div>
                        <p className="mb-3 text-sm font-semibold">Growth lifecycle</p>
                        <Lifecycle day={b.day} detailed />
                      </div>
                      <div className="font-mono grid grid-cols-2 gap-2 rounded-xl bg-secondary p-3 text-xs">
                        <span>Seed lot: MG-77</span>
                        <span>Rinses/day: {PROTOCOL.rinsesPerDay}</span>
                        <span>Protocol: {PROTOCOL.version}</span>
                        <span>Delivered water: 18.4 L</span>
                        <span className="col-span-2 text-muted-foreground">
                          Water per kg of yield is calculated once the harvest weight is recorded by the operator.
                        </span>
                      </div>
                    </div>
                  ),
                })
              }
            >
              <div className="flex items-center justify-between">
                <p className="font-bold">{b.id}</p>
                <Badge tone={b.tone}>{b.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{b.tray}</p>
              <div className="mt-4 flex justify-center">
                <Ring value={b.pct} label={`Day ${b.day} of ${b.total}`} sub="ready" />
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <h3 className="font-bold">Scheduled inspection windows</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Based on the {PROTOCOL.growingDays}-day protocol. Harvest is recorded by an operator upon manual inspection.
          </p>
          <div className="mt-4 space-y-2">
            {upcoming.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Sprout className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{u.id}</p>
                    <p className="text-xs text-muted-foreground">{u.when}</p>
                  </div>
                </div>
                <Badge tone={u.tone}>{u.when === 'Inspection due' ? 'Inspect' : 'Growing'}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col">
          <h3 className="font-bold">Batches by stage</h3>
          <p className="mt-1 text-sm text-muted-foreground">Where the demo batches are right now</p>
          <div className="mt-4">
            <Donut
              segments={[
                { label: 'Soaking', value: 1, color: '#F59E0B' },
                { label: 'Growing', value: 1, color: '#16A34A' },
                { label: 'Inspection due', value: 1, color: '#3B82F6' },
              ]}
              size={104}
            />
          </div>
        </Card>
      </div>

      {showCreateModal && (
        <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create a new batch">
          <CreateBatchModal
            onClose={() => setShowCreateModal(false)}
            onCreated={(batch) => {
              onBatchCreated(batch);
              setShowCreateModal(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Watering / Irrigation Tab View                                     */
/* ------------------------------------------------------------------ */

function WateringView({ role }: { role: Role }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <Droplets className="h-6 w-6 text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Next scheduled rinse</p>
          <p className="text-xl font-bold">In ~1h 20m</p>
        </Card>
        <Card>
          <Timer className="h-6 w-6 text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Rinse cycles today</p>
          <p className="text-xl font-bold">3 of 4 scheduled</p>
        </Card>
        <Card>
          <Waves className="h-6 w-6 text-amber-500" />
          <p className="mt-3 text-sm text-muted-foreground">Fresh-water level</p>
          <p className="text-xl font-bold text-amber-600">34% · refill soon</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold">Fresh-water used this week</h3>
            <Badge tone="blue">{WATER_WEEK_TOTAL} L total</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Litres delivered per day across all trays. Review water use alongside yield and adequate rinsing.
          </p>
          <div className="mt-4">
            <WaterUseChart data={WATER_WEEK} />
          </div>
        </Card>
        <Card className="flex flex-col justify-center">
          <h3 className="font-bold">Supplied vs collected</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Supplied fresh water vs. collected wastewater. No water-balance claim.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fresh water supplied</span>
                <span className="font-mono font-semibold">30.1 L</span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-blue-500" style={{ width: '100%' }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Wastewater collected</span>
                <span className="font-mono font-semibold">21.6 L</span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-sky-400" style={{ width: '72%' }} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Used water is collected for disposal — it is never reused.
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Today's rinsing schedule</h3>
          <Badge tone="gray">{PROTOCOL.version}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Sequential tray rinsing. Parameters read from the configured operating profile.
        </p>
        <div className="mt-4 space-y-2">
          {[
            { t: '06:00', s: 'Completed', tone: 'green' as Tone },
            { t: '11:00', s: 'Completed', tone: 'green' as Tone },
            { t: '15:00', s: 'Completed', tone: 'green' as Tone },
            { t: '20:00', s: 'Scheduled', tone: 'blue' as Tone },
          ].map((c) => (
            <div
              key={c.t}
              className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
            >
              <span className="font-mono text-sm font-medium">{c.t}</span>
              <span className="flex-1 text-sm text-muted-foreground">
                Rinse {TRAYS.join(' → ')}
                {role !== 'evaluator' && ' · pump + valves in sequence'}
              </span>
              <Badge tone={c.tone}>{c.s}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Alerts View Tab                                                    */
/* ------------------------------------------------------------------ */

function AlertsTabView({ role }: { role: Role }) {
  const [open, setOpen] = useState<number | null>(ALERTS[0].id);
  const [read, setRead] = useState<number[]>([]);
  const [acked, setAcked] = useState<number[]>([]);
  const markRead = (id: number) => setRead((r) => (r.includes(id) ? r : [...r, id]));
  const ack = (id: number) => {
    markRead(id);
    setAcked((a) => (a.includes(id) ? a : [...a, id]));
  };
  const unreadCount = ALERTS.filter((a) => !read.includes(a.id)).length;
  const activeFaults = ALERTS.filter((a) => a.tone === 'red').length;
  const canAck = can(role, 'ackAlert');

  const toggle = (id: number) => {
    setOpen((cur) => {
      const next = cur === id ? null : id;
      if (next !== null) markRead(next);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-100 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <p className="text-2xl font-bold">{activeFaults}</p>
            <p className="text-sm text-muted-foreground">Active faults</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600">
            <Bell className="h-5 w-5" />
          </span>
          <div>
            <p className="text-2xl font-bold">{unreadCount}</p>
            <p className="text-sm text-muted-foreground">Unread</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-600">
            <CheckCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-2xl font-bold">{acked.length}</p>
            <p className="text-sm text-muted-foreground">Acknowledged</p>
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="font-bold">Alert frequency this week</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Notifications per day. Interpret alongside device availability.
        </p>
        <div className="mt-4">
          <BarChart
            data={[3, 1, 2, 0, 1, 2, 1]}
            labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']}
            unit=""
            color="#F59E0B"
            highlightLast
          />
        </div>
      </Card>

      <div className="flex items-center justify-between px-1 pt-2">
        <p className="text-sm font-semibold">
          Notifications{' '}
          {unreadCount > 0 && <span className="font-normal text-muted-foreground">· {unreadCount} unread</span>}
        </p>
        {unreadCount > 0 && (
          <button
            onClick={() => setRead(ALERTS.map((a) => a.id))}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <CheckCheck className="h-4 w-4" /> Mark all as read
          </button>
        )}
      </div>

      {ALERTS.map((a) => {
        const expanded = open === a.id;
        const isRead = read.includes(a.id);
        return (
          <Card key={a.id} className={`p-0 overflow-hidden transition ${isRead ? 'opacity-75' : ''}`}>
            <button onClick={() => toggle(a.id)} className="flex w-full items-start gap-4 p-5 text-left">
              <span
                className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                  a.tone === 'red'
                    ? 'bg-red-100 text-red-600'
                    : a.tone === 'amber'
                    ? 'bg-amber-100 text-amber-600'
                    : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                <a.icon className="h-5 w-5" />
                {!isRead && (
                  <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                )}
              </span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={isRead ? 'font-medium' : 'font-bold'}>{a.title}</p>
                  <Badge tone={a.tone}>
                    {a.tone === 'red' ? 'Urgent' : a.tone === 'amber' ? 'Warning' : 'Info'}
                  </Badge>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{a.body}</p>
                {acked.includes(a.id) && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <CheckCheck className="h-3 w-3" /> Acknowledged
                  </p>
                )}
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> {a.time}
                </p>
              </div>
              <ChevronDown
                className={`mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
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
                  <div className="border-t border-border px-5 py-4">
                    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                      {a.tech.map(([k, v]) => (
                        <div
                          key={k}
                          className="flex justify-between gap-3 border-b border-border/50 py-1.5 text-sm sm:block sm:border-0 sm:py-0"
                        >
                          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                          <dd className="font-mono text-sm">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-4 rounded-xl bg-secondary p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Suggested response
                      </p>
                      <p className="mt-1 text-sm">{a.tip}</p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Btn
                        variant={isRead ? 'subtle' : 'outline'}
                        className="text-xs"
                        onClick={() => markRead(a.id)}
                      >
                        <Check className="h-3.5 w-3.5" /> {isRead ? 'Read' : 'Mark as read'}
                      </Btn>
                      {canAck ? (
                        <Btn
                          variant="outline"
                          className="text-xs"
                          onClick={() => ack(a.id)}
                          disabled={acked.includes(a.id)}
                        >
                          <CheckCheck className="h-3.5 w-3.5" />{' '}
                          {acked.includes(a.id) ? 'Acknowledged' : 'Acknowledge'}
                        </Btn>
                      ) : (
                        <span className="self-center text-xs text-muted-foreground">
                          Acknowledgement requires Operator or Administrator access.
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Operational Logs / Support Tickets Tab View                        */
/* ------------------------------------------------------------------ */

function SupportAdminView({
  role,
  setModal,
}: {
  role: Role;
  setModal: (m: { title: string; body: React.ReactNode }) => void;
}) {
  const [filter, setFilter] = useState('All');
  const [tab, setTab] = useState<'tickets' | 'logs'>('tickets');
  const filtered = useMemo(
    () => (filter === 'All' ? TICKETS : TICKETS.filter((t) => t.status === filter)),
    [filter]
  );
  const canReply = can(role, 'manageServices');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(['tickets', 'logs'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              tab === t
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-secondary'
            }`}
          >
            {t === 'tickets' ? 'Support tickets' : 'Operational logs'}
          </button>
        ))}
      </div>

      {tab === 'logs' ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <p className="border-b border-border bg-secondary px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent operational events
          </p>
          {OPS_LOGS.map((l, i) => (
            <div
              key={i}
              className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-3 ${
                i > 0 ? 'border-t border-border' : ''
              }`}
            >
              <span className="font-mono text-xs text-muted-foreground">{l.time}</span>
              <span className="text-sm font-semibold">{l.actor}</span>
              <span className="w-full text-sm text-muted-foreground sm:w-auto sm:flex-1">{l.action}</span>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {['All', 'Open', 'In progress', 'Resolved'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  filter === f
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-secondary'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {filtered.map((t, i) => (
              <button
                key={t.id}
                onClick={() =>
                  setModal({
                    title: `Ticket ${t.id}`,
                    body: (
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          <Badge tone={t.tone}>{t.type}</Badge>
                          <Badge tone={t.status === 'Resolved' ? 'green' : t.status === 'Open' ? 'red' : 'amber'}>
                            {t.status}
                          </Badge>
                          <Badge tone="gray">Priority: {t.pri}</Badge>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Reported by</p>
                          <p className="font-semibold">{t.user} · {t.time}</p>
                        </div>
                        <div className="rounded-xl bg-secondary p-4 text-sm">{t.topic}</div>
                        {canReply ? (
                          <div className="flex gap-2">
                            <Btn className="flex-1">Reply</Btn>
                            <Btn variant="outline" className="flex-1">Mark resolved</Btn>
                          </div>
                        ) : (
                          <p className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                            Read-only view — replying and resolving require service-management access.
                          </p>
                        )}
                      </div>
                    ),
                  })
                }
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-secondary ${
                  i > 0 ? 'border-t border-border' : ''
                }`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {t.user.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{t.topic}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {t.id} · {t.user} · {t.time}
                  </p>
                </div>
                <div className="hidden shrink-0 sm:block">
                  <Badge tone={t.tone}>{t.type}</Badge>
                </div>
                <Badge tone={t.status === 'Resolved' ? 'green' : t.status === 'Open' ? 'red' : 'amber'}>
                  {t.status}
                </Badge>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reports View Tab                                                   */
/* ------------------------------------------------------------------ */

function ReportsView() {
  const downloadCSV = () => {
    const rows = [['Day', 'Fresh water used (L)'], ...WATER_WEEK.map((d) => [d.day, d.L])];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sproutsync-weekly-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Fresh-water use · last 7 days</p>
        <div className="flex gap-2">
          <Btn variant="outline" onClick={downloadCSV} className="text-sm">
            <FileBarChart className="h-4 w-4" /> Export CSV
          </Btn>
          <Btn variant="subtle" onClick={() => window.print()} className="text-sm">
            <FileBarChart className="h-4 w-4" /> Export PDF
          </Btn>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Fresh water this week" value={`${WATER_WEEK_TOTAL} L`} sub="Across all trays" icon={Droplets} />
        <Stat label="Active batches" value={String(FIXED_BATCHES.length)} sub="Trays 1–3" icon={Sprout} />
        <Stat label="Rinses / day" value={String(PROTOCOL.rinsesPerDay)} sub="Growing protocol" icon={Clock} />
      </div>
      <Card>
        <h3 className="font-bold">Fresh-water use (L)</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Yield is recorded manually after harvest upon physical inspection.
        </p>
        <div className="mt-4">
          <WaterUseChart data={WATER_WEEK} />
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Maintenance View Tab                                               */
/* ------------------------------------------------------------------ */

function MaintenanceView({
  openDevice,
}: {
  openDevice: (d: {
    name: string;
    status: string;
    tone: Tone;
    last: string;
    tech: [string, string][];
  }) => void;
}) {
  const devices: {
    name: string;
    status: string;
    tone: Tone;
    last: string;
    tech: [string, string][];
  }[] = [
    {
      name: 'Air-temperature sensor',
      status: 'Within range',
      tone: 'green',
      last: 'Reading 2m ago',
      tech: [
        ['Reading', '24.6 °C'],
        ['Configured range', '21–27 °C'],
        ['Online', 'Yes'],
        ['Note', 'Reading only — not a health check'],
      ],
    },
    {
      name: 'Humidity sensor',
      status: 'Within range',
      tone: 'green',
      last: 'Reading 2m ago',
      tech: [
        ['Reading', '88%'],
        ['Configured range', '80–90 %'],
        ['Online', 'Yes'],
        ['Note', 'Reading only — not a health check'],
      ],
    },
    {
      name: 'Tray 1 valve',
      status: 'Responding',
      tone: 'green',
      last: 'Actuated 40m ago',
      tech: [
        ['Tray', 'Tray 1'],
        ['Cycles today', '3'],
        ['Last response', '40m ago'],
        ['Online', 'Yes'],
      ],
    },
    {
      name: 'Tray 2 valve',
      status: 'Not responding',
      tone: 'red',
      last: 'No response 3h',
      tech: [
        ['Tray', 'Tray 2'],
        ['Last response', '3h ago'],
        ['Observed', 'No acknowledgement'],
        ['Watering', 'Paused — valve offline'],
      ],
    },
    {
      name: 'Delivery pump',
      status: 'Responding',
      tone: 'green',
      last: 'Ran 1h ago',
      tech: [
        ['Cycles today', '3 of 4 scheduled'],
        ['Last response', '1h ago'],
        ['Note', 'Pump current alone cannot confirm per-tray delivery'],
        ['Online', 'Yes'],
      ],
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {devices.map((d) => (
          <Card key={d.name} onClick={() => openDevice(d)}>
            <div className="flex items-start justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-muted-foreground">
                <Cpu className="h-5 w-5" />
              </span>
              <Badge tone={d.tone}>{d.status}</Badge>
            </div>
            <p className="mt-3 flex items-center justify-between font-semibold">
              {d.name}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </p>
            <p className="text-xs text-muted-foreground">{d.last}</p>
          </Card>
        ))}
      </div>
      <Card>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Chamber design reference</h3>
          <Badge tone="blue">Reference design</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Component layout for the automated growing chamber — trays, reservoirs, and control module.
        </p>
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-slate-50">
          <img
            src={chamberViews}
            alt="SproutSync chamber multi-view design study"
            className="h-full w-full object-contain"
          />
        </div>
      </Card>
    </div>
  );
}
