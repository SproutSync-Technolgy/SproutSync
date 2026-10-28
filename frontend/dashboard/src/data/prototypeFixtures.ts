import {
  Thermometer,
  Droplet,
  Waves,
  FlaskConical,
  Moon,
  CheckCircle2,
  AlertTriangle,
  Clock,
  type LucideIcon,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Visual Tones                                                       */
/* ------------------------------------------------------------------ */

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'gray';

export const toneMap: Record<Tone, string> = {
  green: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  gray: 'bg-slate-100 text-slate-600 border-slate-200',
};

/* ------------------------------------------------------------------ */
/* Shared protocol and inventory configuration                        */
/* ------------------------------------------------------------------ */

export const PROTOCOL = {
  version: 'v1.0',
  growingDays: 4,
  turnaroundDays: 1,
  label: 'Growing protocol',
  rinsesPerDay: 4,
};

export const TRAYS = ['Tray 1', 'Tray 2', 'Tray 3'] as const;

export type TrayName = (typeof TRAYS)[number];

export const DEVICES_INVENTORY = [
  { id: 'temp-sensor', name: 'Air-temperature sensor', online: true },
  { id: 'humid-sensor', name: 'Humidity sensor', online: true },
  { id: 'watertemp-sensor', name: 'Water-temperature sensor', online: true },
  { id: 'light-sensor', name: 'Light sensor', online: true },
  { id: 'fresh-level', name: 'Fresh-water level sensor', online: true },
  { id: 'waste-level', name: 'Wastewater level sensor', online: true },
  { id: 'pump', name: 'Delivery pump', online: true },
  { id: 'valve-1', name: 'Tray 1 valve', online: true },
  { id: 'valve-2', name: 'Tray 2 valve', online: false },
  { id: 'valve-3', name: 'Tray 3 valve', online: true },
] as const;

export const DEVICES_TOTAL = DEVICES_INVENTORY.length;
export const DEVICES_ONLINE = DEVICES_INVENTORY.filter((d) => d.online).length;

/* ------------------------------------------------------------------ */
/* Water telemetry datasets (Weekly total = 30.1 L)                   */
/* ------------------------------------------------------------------ */

export const WATER_WEEK = [
  { day: 'Mon', L: 4.1 },
  { day: 'Tue', L: 4.4 },
  { day: 'Wed', L: 4.0 },
  { day: 'Thu', L: 4.6 },
  { day: 'Fri', L: 4.3 },
  { day: 'Sat', L: 4.5 },
  { day: 'Sun', L: 4.2 },
];

export const WATER_WEEK_TOTAL = +WATER_WEEK.reduce((s, d) => s + d.L, 0).toFixed(1); // 30.1 L
export const WATER_TODAY = WATER_WEEK[WATER_WEEK.length - 1].L; // 4.2 L

/* ------------------------------------------------------------------ */
/* Account-driven role & capability resolution                        */
/* ------------------------------------------------------------------ */

export type Role = 'admin' | 'superadmin' | 'operator' | 'evaluator' | 'pending';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Superadmin',
  superadmin: 'Superadmin',
  operator: 'Operator',
  evaluator: 'Evaluator',
  pending: 'Pending Access',
};

export type Capability =
  | 'runBatch'
  | 'ackAlert'
  | 'recordMaintenance'
  | 'manageAccounts'
  | 'manageProfiles'
  | 'manageServices'
  | 'reviewEvidence'
  | 'editOwnProfile';

export const PERMISSIONS: Record<Role, Record<Capability, boolean>> = {
  admin: {
    runBatch: false,
    ackAlert: false,
    recordMaintenance: false,
    manageAccounts: true,
    manageProfiles: true,
    manageServices: true,
    reviewEvidence: true,
    editOwnProfile: true,
  },
  superadmin: {
    runBatch: false,
    ackAlert: false,
    recordMaintenance: false,
    manageAccounts: true,
    manageProfiles: true,
    manageServices: true,
    reviewEvidence: true,
    editOwnProfile: true,
  },
  operator: {
    runBatch: true,
    ackAlert: true,
    recordMaintenance: true,
    manageAccounts: false,
    manageProfiles: false,
    manageServices: true,
    reviewEvidence: true,
    editOwnProfile: true,
  },
  evaluator: {
    runBatch: false,
    ackAlert: false,
    recordMaintenance: false,
    manageAccounts: false,
    manageProfiles: false,
    manageServices: false,
    reviewEvidence: true,
    editOwnProfile: true,
  },
  pending: {
    runBatch: false,
    ackAlert: false,
    recordMaintenance: false,
    manageAccounts: false,
    manageProfiles: false,
    manageServices: false,
    reviewEvidence: false,
    editOwnProfile: true,
  },
};

export const can = (role: Role, cap: Capability): boolean => PERMISSIONS[role][cap];

/**
 * Normalizes backend account role from /api/v1/auth/me into the dashboard roles.
 * Defaults new/unassigned users to 'pending' (zero-data tier awaiting operator grant).
 */
export function normalizeAccountRole(apiRole?: string | null): Role {
  if (!apiRole) return 'pending';
  const cleaned = apiRole.toLowerCase().trim();
  if (cleaned === 'admin' || cleaned === 'superadmin') return 'superadmin';
  if (cleaned === 'operator') return 'operator';
  if (cleaned === 'evaluator') return 'evaluator';
  return 'pending';
}

/* ------------------------------------------------------------------ */
/* Telemetry & Sensor Definitions                                     */
/* ------------------------------------------------------------------ */

export type SensorItem = {
  key: string;
  icon: LucideIcon;
  name: string;
  simple: string;
  value: string;
  pct: number;
  tone: Tone;
  ideal: string;
  trend: number[];
  detail: string;
  color: string;
};

export const SENSORS: SensorItem[] = [
  {
    key: 'temp',
    icon: Thermometer,
    name: 'Air Temperature',
    simple: 'Within range',
    value: '24.6 °C',
    pct: 92,
    tone: 'green',
    ideal: '21–27 °C',
    trend: [23, 24, 25, 24, 25, 24, 25],
    detail:
      'Ambient chamber temperature, read by the ESP32 controller. A reading within the configured reference range does not by itself establish crop health.',
    color: '#16A34A',
  },
  {
    key: 'humid',
    icon: Droplet,
    name: 'Humidity',
    simple: 'Within range',
    value: '88 %',
    pct: 88,
    tone: 'green',
    ideal: '80–90 %',
    trend: [80, 84, 86, 88, 87, 88, 88],
    detail:
      'Relative humidity in the chamber between rinse cycles, kept within the configured reference range.',
    color: '#3B82F6',
  },
  {
    key: 'water',
    icon: Waves,
    name: 'Fresh-Water Tank',
    simple: 'Getting low',
    value: '34 %',
    pct: 34,
    tone: 'amber',
    ideal: '> 40 %',
    trend: [70, 62, 55, 48, 42, 38, 34],
    detail:
      'The fresh-water tank supplies all tray rinse cycles. It is getting low — please refill it soon so scheduled watering can continue without interruption.',
    color: '#F59E0B',
  },
  {
    key: 'watertemp',
    icon: FlaskConical,
    name: 'Water Temperature',
    simple: 'Within range',
    value: '20.4 °C',
    pct: 96,
    tone: 'green',
    ideal: '18–22 °C',
    trend: [20.1, 20.3, 20.4, 20.2, 20.5, 20.4, 20.4],
    detail:
      'Irrigation-water temperature measured before delivery. Within the configured reference range.',
    color: '#8B5CF6',
  },
  {
    key: 'light',
    icon: Moon,
    name: 'Light Level',
    simple: 'Nice & dark',
    value: '0.3 lux',
    pct: 98,
    tone: 'green',
    ideal: '~0 lux',
    trend: [0.2, 0.3, 0.2, 0.4, 0.3, 0.2, 0.3],
    detail:
      'Sprouts grow best in darkness. A light sensor watches for any accidental light leaks into the chamber (target ~0 lux).',
    color: '#6366F1',
  },
  {
    key: 'wastewater',
    icon: Waves,
    name: 'Wastewater Tank',
    simple: 'Room available',
    value: '38 %',
    pct: 62,
    tone: 'green',
    ideal: '< 85 %',
    trend: [12, 18, 24, 28, 32, 35, 38],
    detail:
      'Used water from each rinse cycle drains into a separate wastewater tank for disposal — it is never reused. Watering will pause automatically if this tank gets too full.',
    color: '#0EA5E9',
  },
];

/* ------------------------------------------------------------------ */
/* Demo Batches (Fixed 3-tray demonstration dataset)                  */
/* ------------------------------------------------------------------ */

export type DemoBatch = {
  id: string;
  tray: string;
  day: number;
  total: number;
  status: string;
  tone: Tone;
  pct: number;
  note: string;
};

export const BATCHES: DemoBatch[] = [
  {
    id: 'MB-2409',
    tray: 'Tray 1',
    day: 2,
    total: PROTOCOL.growingDays,
    status: 'Growing',
    tone: 'green',
    pct: 57,
    note: 'Sprouts growing on schedule. Inspection window opens in 2 days.',
  },
  {
    id: 'MB-2408',
    tray: 'Tray 2',
    day: 4,
    total: PROTOCOL.growingDays,
    status: 'Inspection due',
    tone: 'blue',
    pct: 86,
    note: 'Scheduled growing duration nearly elapsed. Operator inspection and harvest entry required.',
  },
  {
    id: 'MB-2410',
    tray: 'Tray 3',
    day: 0,
    total: PROTOCOL.growingDays,
    status: 'Soaking',
    tone: 'amber',
    pct: 14,
    note: 'Seeds soaking. First scheduled rinse in ~2 hours.',
  },
];

/* ------------------------------------------------------------------ */
/* Alerts                                                             */
/* ------------------------------------------------------------------ */

export type AlertItemData = {
  id: number;
  tone: Tone;
  title: string;
  body: string;
  simple: string;
  tip: string;
  time: string;
  icon: LucideIcon;
  tech: [string, string][];
};

export const ALERTS: AlertItemData[] = [
  {
    id: 1,
    tone: 'amber',
    title: 'Fresh-water tank low',
    body: 'Level at 34% — refill recommended.',
    simple: 'Please refill the fresh-water tank soon so scheduled watering can continue.',
    tip: 'Top up the fresh-water tank so scheduled rinses can continue. Watering will pause automatically if the tank runs empty.',
    time: '8 min ago',
    icon: Waves,
    tech: [
      ['Component', 'Fresh-water reservoir · level sensor'],
      ['Reading', '34%'],
      ['Configured threshold', 'Warn < 40% · Interlock < 15%'],
      ['Recommended response', 'Refill fresh-water reservoir'],
    ],
  },
  {
    id: 2,
    tone: 'blue',
    title: 'Batch MB-2408 inspection due',
    body: 'Scheduled growing duration nearly elapsed.',
    simple:
      'Batch MB-2408 has nearly finished its scheduled growing time — please inspect and record the outcome.',
    tip: 'Inspect the batch and record the outcome. The timer alone does not mark sprouts as harvested — an operator must confirm and log the result.',
    time: '1 hr ago',
    icon: CheckCircle2,
    tech: [
      ['Batch', 'MB-2408 · Tray 2'],
      ['Stage', `Day ${PROTOCOL.growingDays} of ${PROTOCOL.growingDays} (scheduled)`],
      ['Protocol', PROTOCOL.version],
      ['Recommended response', 'Operator inspection + outcome entry'],
    ],
  },
  {
    id: 3,
    tone: 'red',
    title: 'Tray 2 valve not responding',
    body: 'No response from the Tray 2 valve.',
    simple: "One tray's water valve isn't responding. Watering to that tray is paused until it's checked.",
    tip: 'Check the Tray 2 valve and its wiring, then record a maintenance note. Watering to Tray 2 is paused until the valve comes back online.',
    time: '3 hr ago',
    icon: AlertTriangle,
    tech: [
      ['Component', 'Tray 2 valve'],
      ['Last response', '3h 12m ago'],
      ['Observed', 'No acknowledgement to control signal'],
      ['Configured threshold', 'No response > 60 s'],
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Production Lifecycle Stages                                        */
/* ------------------------------------------------------------------ */

export type LifecycleStage = {
  key: string;
  name: string;
  range: [number, number];
  sub: string;
  tech: string;
};

export const LIFECYCLE: LifecycleStage[] = [
  {
    key: 'soak',
    name: 'Soaking',
    range: [0, 0],
    sub: 'Before Day 1',
    tech: 'Seeds hydrate before the growing count begins (manual).',
  },
  {
    key: 'germ',
    name: 'Germination',
    range: [1, 1],
    sub: 'Day 1',
    tech: `Tiny root tips appear. ~${PROTOCOL.rinsesPerDay} rinses per day, chamber kept dark.`,
  },
  {
    key: 'early',
    name: 'Early Growth',
    range: [2, 2],
    sub: 'Day 2',
    tech: 'Sprout stems start to lengthen. Temperature and humidity kept within target ranges.',
  },
  {
    key: 'active',
    name: 'Active Growth',
    range: [3, 3],
    sub: 'Day 3',
    tech: 'Sprouts thicken. Scheduled rinsing continues.',
  },
  {
    key: 'pre',
    name: 'Inspection due',
    range: [4, 4],
    sub: 'Day 4 (scheduled)',
    tech: 'Scheduled growing duration elapsed. Operator inspection + outcome entry.',
  },
  {
    key: 'ready',
    name: 'Harvest recorded',
    range: [5, 99],
    sub: 'After operator entry',
    tech: 'Marketable mass recorded by operator, then cleaning/turnaround.',
  },
];

export function stageState(day: number, range: [number, number]): 'done' | 'current' | 'todo' {
  if (day > range[1]) return 'done';
  if (day >= range[0] && day <= range[1]) return 'current';
  return 'todo';
}

/* ------------------------------------------------------------------ */
/* FAQ, Support Tickets & Ops Logs                                    */
/* ------------------------------------------------------------------ */

export const FAQ = [
  {
    q: 'How does scheduled rinsing work?',
    a: 'The pump and each tray’s valve open in turn to deliver a measured volume of fresh water, then a drainage check runs before the next tray. Seed loading, cleaning, inspection and harvest remain manual.',
  },
  {
    q: 'Why is my fresh-water tank low?',
    a: 'The fresh-water tank empties as each tray gets watered. When it drops below 40%, you’ll get an alert to top it up. If it gets critically low, watering will pause automatically until you refill it.',
  },
  {
    q: 'When can I harvest my sprouts?',
    a: 'Sprouts follow a 4-day growing period, plus soaking beforehand. Timer completion does not mark sprouts harvested — an operator records the actual harvest.',
  },
  {
    q: 'Does it still work if the internet goes down?',
    a: 'Yes — the system keeps running scheduled rinses and saves all records locally on its SD card. Once the internet is back, everything syncs up automatically.',
  },
  {
    q: 'Is this a food-safety guarantee?',
    a: 'No. SproutSync records growing conditions and water use but does not test for bacteria. Records do not establish microbiological safety. Follow proper seed cleaning and sanitation practices.',
  },
];

export const TICKETS = [
  {
    id: 'T-1042',
    user: 'Rosa Villanueva',
    topic: "App won't show live temperature",
    type: 'Software',
    tone: 'blue' as Tone,
    status: 'Open',
    pri: 'High',
    time: '12 min ago',
  },
  {
    id: 'T-1041',
    user: 'Ken Dela Cruz',
    topic: 'Tray 2 valve not delivering water',
    type: 'Hardware',
    tone: 'amber' as Tone,
    status: 'In progress',
    pri: 'High',
    time: '2 hr ago',
  },
  {
    id: 'T-1039',
    user: 'Mira Santos',
    topic: 'How do I add a second tray?',
    type: 'Question',
    tone: 'gray' as Tone,
    status: 'Open',
    pri: 'Low',
    time: '5 hr ago',
  },
  {
    id: 'T-1035',
    user: 'Jon Reyes',
    topic: 'Water level reading seems stuck',
    type: 'Hardware',
    tone: 'amber' as Tone,
    status: 'Resolved',
    pri: 'Medium',
    time: '1 day ago',
  },
];

export const OPS_LOGS: { time: string; actor: string; action: string }[] = [
  { time: 'Today 06:00', actor: 'Scheduler', action: 'Rinse cycle started — Tray 1, Tray 2, Tray 3' },
  { time: 'Today 05:32', actor: 'Operator · M. Cruz', action: 'Acknowledged alert: Tray 2 valve not responding' },
  { time: 'Yesterday 18:10', actor: 'Scheduler', action: 'Rinse cycle completed — 3 trays' },
  { time: 'Yesterday 09:15', actor: 'Operator · M. Cruz', action: 'Recorded maintenance: pump inspection' },
];
