import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sprout,
  Gauge,
  Bell,
  Home,
  Bean,
  Droplets,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  CheckCheck,
  Check,
  ChevronDown,
  User,
  Settings,
  LifeBuoy,
  LogOut,
  Leaf,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react';
import { Logo, Btn, Card, Badge, Toggle, Lifecycle, FaqList } from './ProtoPrimitives';
import { BarChart, Ring, Donut } from './ProtoCharts';
import {
  SENSORS,
  BATCHES,
  ALERTS,
  WATER_WEEK,
  WATER_WEEK_TOTAL,
  PROTOCOL,
} from '../data/prototypeFixtures';

const SLIDES = [
  {
    icon: Sprout,
    t: 'Scheduled rinsing',
    d: 'SproutSync rinses each of the three trays on a schedule and checks drainage — no manual watering.',
  },
  {
    icon: Gauge,
    t: 'Clear at a glance',
    d: 'See batch progress and chamber readings in plain words, right from your phone.',
  },
  {
    icon: Bell,
    t: 'Rule-based alerts',
    d: 'Get notified about low water, drainage issues, or offline devices so you can act quickly.',
  },
];

type MobileNavItem = { key: string; label: string; icon: LucideIcon };

const MOBILE_TABS: MobileNavItem[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'batches', label: 'Batches', icon: Bean },
  { key: 'water', label: 'Water', icon: Droplets },
  { key: 'alerts', label: 'Alerts', icon: Bell },
];

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-900 to-emerald-950 p-3 sm:p-6">
      <div className="relative flex h-[92vh] max-h-[820px] w-full max-w-[390px] flex-col overflow-hidden rounded-[2.5rem] border-[6px] border-slate-800 bg-background shadow-2xl">
        <div className="absolute left-1/2 top-0 z-30 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-slate-800" />
        {children}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
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

export function ProtoMobileApp({ onExit }: { onExit: () => void }) {
  const [step, setStep] = useState<'onboarding' | 'login' | 'app'>('onboarding');
  const [slide, setSlide] = useState(0);
  const [tab, setTab] = useState('home');
  const [view, setView] = useState<null | { kind: 'sensor' | 'batch' | 'profile'; id: string }>(
    null
  );
  const [notify, setNotify] = useState({ alerts: true, harvest: true, tips: false });
  const [panel, setPanel] = useState<null | 'account' | 'prefs' | 'help'>(null);
  const [help, setHelp] = useState(false);
  const [helpType, setHelpType] = useState('Hardware');
  const [openAlert, setOpenAlert] = useState<number | null>(null);
  const [readAlerts, setReadAlerts] = useState<number[]>([]);

  const markAlertRead = (id: number) =>
    setReadAlerts((r) => (r.includes(id) ? r : [...r, id]));
  const toggleAlert = (id: number) =>
    setOpenAlert((cur) => {
      const next = cur === id ? null : id;
      if (next !== null) markAlertRead(next);
      return next;
    });

  const unreadAlerts = ALERTS.filter((a) => !readAlerts.includes(a.id)).length;
  const goTab = (k: string) => {
    setTab(k);
    setView(null);
    setPanel(null);
  };

  /* Onboarding */
  if (step === 'onboarding') {
    const S = SLIDES[slide];
    return (
      <PhoneFrame>
        <div className="flex h-full flex-col p-6 pt-12">
          <button
            onClick={() => setStep('login')}
            className="self-end text-sm font-medium text-muted-foreground"
          >
            Skip
          </button>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <motion.span
              key={slide}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="grid h-24 w-24 place-items-center rounded-3xl bg-primary/10 text-primary"
            >
              <S.icon className="h-11 w-11" />
            </motion.span>
            <motion.h2
              key={`t${slide}`}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="mt-8 text-2xl font-extrabold"
            >
              {S.t}
            </motion.h2>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">{S.d}</p>
          </div>
          <div className="mb-6 flex justify-center gap-2">
            {SLIDES.map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all ${
                  i === slide ? 'w-6 bg-primary' : 'w-2 bg-border'
                }`}
              />
            ))}
          </div>
          <Btn
            className="w-full py-3"
            onClick={() => (slide < SLIDES.length - 1 ? setSlide(slide + 1) : setStep('login'))}
          >
            {slide < SLIDES.length - 1 ? 'Next' : 'Get started'} <ArrowRight className="h-4 w-4" />
          </Btn>
        </div>
      </PhoneFrame>
    );
  }

  /* Login */
  if (step === 'login') {
    return (
      <PhoneFrame>
        <div className="flex h-full flex-col justify-center p-6">
          <div className="flex flex-col items-center">
            <Logo className="h-16 w-16 rounded-2xl" />
            <h1 className="mt-4 text-xl font-extrabold">Welcome to SproutSync</h1>
            <p className="text-sm text-muted-foreground">Sign in to check your sprouts</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStep('app');
            }}
            className="mt-8 space-y-3"
          >
            <input
              type="email"
              placeholder="Email address"
              required
              className="w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm outline-none focus:border-primary"
            />
            <input
              type="password"
              placeholder="Password"
              required
              className="w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm outline-none focus:border-primary"
            />
            <Btn type="submit" className="w-full py-3">
              Sign in
            </Btn>
          </form>
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>
          <button
            onClick={() => {
              window.location.assign('/api/v1/auth/google');
            }}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-border py-3 text-sm font-semibold hover:bg-secondary"
          >
            <GoogleIcon /> Continue with Google
          </button>
          <button
            onClick={onExit}
            className="mt-6 text-center text-xs text-muted-foreground hover:text-foreground"
          >
            ← Leave app demo
          </button>
        </div>
      </PhoneFrame>
    );
  }

  /* App with bottom nav */
  const sensor = view?.kind === 'sensor' ? SENSORS.find((s) => s.key === view.id) : null;
  const batch = view?.kind === 'batch' ? BATCHES.find((b) => b.id === view.id) : null;
  const panelTitle = {
    account: 'Account details',
    prefs: 'App preferences',
    help: 'Help & support',
  };
  const title = view
    ? view.kind === 'profile'
      ? panel
        ? panelTitle[panel]
        : 'Profile & Settings'
      : sensor?.name ?? `Batch ${batch?.id}`
    : MOBILE_TABS.find((t) => t.key === tab)?.label;

  return (
    <PhoneFrame>
      <header className="flex w-full items-center gap-3 border-b border-border px-4 pb-3 pt-9">
        {view ? (
          <button
            aria-label="Go back"
            onClick={() => {
              if (view.kind === 'profile' && panel) setPanel(null);
              else setView(null);
            }}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Logo className="h-8 w-8 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          {view && <p className="truncate text-base font-bold leading-tight">{title}</p>}
          {!view && tab === 'home' && (
            <p className="truncate text-sm font-semibold leading-tight">Hi Rosa 👋</p>
          )}
        </div>
        {!view && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              aria-label={
                unreadAlerts > 0 ? `Notifications, ${unreadAlerts} unread` : 'Notifications'
              }
              onClick={() => goTab('alerts')}
              className="relative grid h-11 w-11 place-items-center rounded-lg hover:bg-secondary"
            >
              <Bell className="h-5 w-5" />
              {unreadAlerts > 0 && (
                <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-red-500" />
              )}
            </button>
            <button
              aria-label="Profile and settings"
              onClick={() => {
                setView({ kind: 'profile', id: 'me' });
                setPanel(null);
              }}
              className="grid h-11 w-11 place-items-center"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                R
              </span>
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={view ? `${view.kind}-${view.id}` : tab}
            initial={{ opacity: 0, x: view ? 24 : 0, y: view ? 0 : 8 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            {sensor && (
              <div className="space-y-4">
                <div className="rounded-2xl bg-secondary p-5 text-center">
                  <span
                    className="mx-auto grid h-12 w-12 place-items-center rounded-2xl"
                    style={{ backgroundColor: `${sensor.color}20`, color: sensor.color }}
                  >
                    <sensor.icon className="h-6 w-6" />
                  </span>
                  <p className="mt-3 text-3xl font-extrabold">
                    {sensor.simple === 'Getting low' ? 'Low' : 'Good'}
                  </p>
                  <Badge tone={sensor.tone}>{sensor.simple}</Badge>
                </div>
                <Card>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {sensor.detail.split('.')[0]}. Shown against the configured reference range.
                  </p>
                </Card>
              </div>
            )}

            {batch && (
              <div className="space-y-4">
                <div className="flex flex-col items-center">
                  <Ring
                    value={batch.pct}
                    label={`Day ${batch.day} of ${batch.total}`}
                    sub="of protocol"
                  />
                </div>
                <Card>
                  <p className="text-sm text-muted-foreground">{batch.note}</p>
                </Card>
                <Card>
                  <p className="mb-3 text-sm font-semibold">Growth stages</p>
                  <Lifecycle day={batch.day} />
                </Card>
              </div>
            )}

            {view?.kind === 'profile' && !panel && (
              <div className="space-y-4">
                <div className="flex flex-col items-center rounded-2xl bg-secondary p-5 text-center">
                  <span className="grid h-16 w-16 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
                    R
                  </span>
                  <p className="mt-3 font-bold">Rosa Villanueva</p>
                  <p className="text-sm text-muted-foreground">rosa@sproutfarm.ph</p>
                  <Badge tone="green">
                    <Leaf className="h-3 w-3" /> Operator
                  </Badge>
                </div>
                <Card>
                  {[
                    { key: 'account', lbl: 'Account details', icon: User },
                    { key: 'prefs', lbl: 'App preferences', icon: Settings },
                    { key: 'help', lbl: 'Help & support', icon: LifeBuoy },
                  ].map(({ key, lbl, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setPanel(key as 'account' | 'prefs' | 'help')}
                      className="flex w-full items-center gap-3 border-b border-border/50 py-3 text-left text-sm last:border-0"
                    >
                      <Icon className="h-5 w-5 text-muted-foreground" />{' '}
                      <span className="flex-1">{lbl}</span>{' '}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </Card>
                <button
                  onClick={onExit}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-semibold text-red-600"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}

            {!view && tab === 'home' && (
              <div className="space-y-4">
                <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-green-700 p-5 text-white">
                  <p className="text-xs text-emerald-100">Batch progress</p>
                  <p className="mt-1 text-3xl font-extrabold">{BATCHES[0].pct}%</p>
                  <p className="text-sm text-emerald-50">
                    Batch {BATCHES[0].id} · Day {BATCHES[0].day}/{BATCHES[0].total}
                  </p>
                  <div className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-sm">
                    💧 Next rinse in ~1h 20m
                  </div>
                </div>
                <p className="text-sm font-bold">Chamber conditions</p>
                <div className="grid grid-cols-2 gap-3">
                  {SENSORS.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setView({ kind: 'sensor', id: s.key })}
                      className="rounded-2xl border border-border bg-card p-3 text-left transition active:scale-95"
                    >
                      <div className="flex items-center justify-between">
                        <s.icon className="h-5 w-5" style={{ color: s.color }} />
                        <Badge tone={s.tone}>{s.simple === 'Getting low' ? 'Low' : 'In range'}</Badge>
                      </div>
                      <p className="mt-2 text-sm font-semibold">{s.name}</p>
                    </button>
                  ))}
                </div>
                <Card>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Fresh water this week</p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Litres per day · {WATER_WEEK_TOTAL} L total
                  </p>
                  <div className="mt-3">
                    <BarChart
                      data={WATER_WEEK.map((d) => d.L)}
                      labels={['M', 'T', 'W', 'T', 'F', 'S', 'S']}
                      unit=""
                      color="#3B82F6"
                      height="h-28"
                      highlightLast
                    />
                  </div>
                </Card>
              </div>
            )}

            {!view && tab === 'batches' && (
              <div className="space-y-3">
                {BATCHES.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setView({ kind: 'batch', id: b.id })}
                    className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition active:scale-[0.98]"
                  >
                    <div className="relative grid h-14 w-14 shrink-0 place-items-center">
                      <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="#E5F3EB" strokeWidth="4" />
                        <circle
                          cx="18"
                          cy="18"
                          r="15"
                          fill="none"
                          stroke="#16A34A"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 15}
                          strokeDashoffset={2 * Math.PI * 15 * (1 - b.pct / 100)}
                        />
                      </svg>
                      <span className="absolute text-xs font-bold">{b.pct}%</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{b.id}</p>
                      <p className="text-xs text-muted-foreground">
                        Day {b.day} of {b.total}
                      </p>
                    </div>
                    <Badge tone={b.tone}>{b.status}</Badge>
                  </button>
                ))}
                <Card>
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold">Scheduled inspection</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between rounded-xl bg-secondary p-3">
                    <div>
                      <p className="text-sm font-semibold">{BATCHES[0].id}</p>
                      <p className="text-xs text-muted-foreground">Growing protocol · Trays 1–3</p>
                    </div>
                    <Badge tone="blue">Day {PROTOCOL.growingDays}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Yield is recorded manually after harvest.
                  </p>
                </Card>
                <Card>
                  <p className="text-sm font-semibold">Batches by stage</p>
                  <div className="mt-3">
                    <Donut
                      segments={[
                        { label: 'Soaking', value: 1, color: '#F59E0B' },
                        { label: 'Growing', value: 1, color: '#16A34A' },
                        { label: 'Almost ready', value: 1, color: '#3B82F6' },
                      ]}
                      size={96}
                    />
                  </div>
                </Card>
              </div>
            )}

            {!view && tab === 'water' && (
              <div className="space-y-3">
                <div className="rounded-2xl bg-primary/5 p-5 text-center">
                  <Droplets className="mx-auto h-8 w-8 text-primary" />
                  <p className="mt-2 text-2xl font-extrabold">~1h 20m</p>
                  <p className="text-sm text-muted-foreground">Next scheduled rinse</p>
                </div>
                <Card>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Fresh-water tank</span>
                    <Badge tone="amber">Refill soon</Badge>
                  </div>
                  <div className="mt-2 h-3 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: '34%' }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">34% left · refill soon</p>
                </Card>
                <Card>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Fresh water this week</p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Litres per day · {WATER_WEEK_TOTAL} L total
                  </p>
                  <div className="mt-3">
                    <BarChart
                      data={WATER_WEEK.map((d) => d.L)}
                      labels={['M', 'T', 'W', 'T', 'F', 'S', 'S']}
                      unit=""
                      color="#3B82F6"
                      height="h-28"
                      highlightLast
                    />
                  </div>
                </Card>
                <Card>
                  <p className="mb-2 text-sm font-semibold">
                    Today's rinses{' '}
                    <span className="font-normal text-muted-foreground">
                      (Tray 1 → Tray 2 → Tray 3)
                    </span>
                  </p>
                  {[
                    ['06:00', 'Completed'],
                    ['11:00', 'Completed'],
                    ['15:00', 'Completed'],
                    ['20:00', 'Scheduled'],
                  ].map(([t, s]) => (
                    <div key={t} className="flex items-center justify-between py-1.5 text-sm">
                      <span className="font-mono">{t}</span>
                      <Badge tone={s === 'Completed' ? 'green' : 'blue'}>{s}</Badge>
                    </div>
                  ))}
                </Card>
              </div>
            )}

            {!view && tab === 'alerts' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs text-muted-foreground">
                    {unreadAlerts > 0 ? `${unreadAlerts} unread` : 'All caught up 🎉'}
                  </p>
                  {unreadAlerts > 0 && (
                    <button
                      onClick={() => setReadAlerts(ALERTS.map((a) => a.id))}
                      className="flex items-center gap-1 text-xs font-medium text-primary"
                    >
                      <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                    </button>
                  )}
                </div>
                {ALERTS.map((a) => {
                  const expanded = openAlert === a.id;
                  const isRead = readAlerts.includes(a.id);
                  return (
                    <Card
                      key={a.id}
                      className={`p-0 overflow-hidden transition ${isRead ? 'opacity-75' : ''}`}
                    >
                      <button
                        onClick={() => toggleAlert(a.id)}
                        className="flex w-full gap-3 p-4 text-left"
                      >
                        <span
                          className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
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
                          <p className={`text-sm ${isRead ? 'font-medium' : 'font-semibold'}`}>
                            {a.title}
                          </p>
                          <p className="text-sm text-muted-foreground">{a.simple}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{a.time}</p>
                        </div>
                        <ChevronDown
                          className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
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
                            <div className="border-t border-border px-4 py-3">
                              <div className="rounded-xl bg-secondary p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  What to do
                                </p>
                                <p className="mt-1 text-sm">{a.tip}</p>
                              </div>
                              <Btn
                                variant={isRead ? 'subtle' : 'outline'}
                                className="mt-3 w-full text-xs"
                                onClick={() => markAlertRead(a.id)}
                              >
                                <Check className="h-3.5 w-3.5" /> {isRead ? 'Read' : 'Mark as read'}
                              </Btn>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  );
                })}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom navigation */}
      <nav className="flex border-t border-border bg-card px-2 pb-2 pt-1.5">
        {MOBILE_TABS.map((t) => {
          const on = !view && tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => goTab(t.key)}
              className="flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5"
            >
              <t.icon
                className={`h-[22px] w-[22px] transition ${
                  on ? 'text-primary' : 'text-muted-foreground'
                }`}
              />
              <span
                className={`text-[11px] font-medium ${
                  on ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </nav>
    </PhoneFrame>
  );
}
