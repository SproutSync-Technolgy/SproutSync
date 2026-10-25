import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell,
  Sprout,
  LayoutDashboard,
  BarChart3,
  MoreHorizontal,
  Droplets,
  Cpu,
  ClipboardCheck,
  Settings,
  Users,
  Wrench,
  LogOut,
  RefreshCw,
  Plus,
  Download,
  Search,
  ChevronRight,
  CheckCircle2,
  X,
  Activity,
  Menu,
  ShieldCheck,
  UserCircle,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import { supabase } from "../supabase";
import {
  emptyWorkspace,
  loadWorkspace,
  isOperator,
  errorMessage,
  downloadCsv,
  type Profile,
  type WorkspaceData,
  type Batch,
  type Alert,
} from "../data/workspace";
import { Logo, Btn, Modal } from "./ProtoPrimitives";
import { PersonalDetails } from "./PersonalDetails";
import { WaterUseChart } from "./ProtoCharts";

const pages = [
  { key: "home", title: "Overview", icon: LayoutDashboard },
  { key: "batches", title: "Batches", icon: Sprout },
  { key: "alerts", title: "Alerts", icon: Bell },
  { key: "reports", title: "Reports", icon: BarChart3 },
  { key: "irrigation", title: "Irrigation", icon: Droplets },
  { key: "devices", title: "Devices", icon: Cpu },
  { key: "evidence", title: "Evaluation evidence", icon: ShieldCheck },
  { key: "evaluations", title: "Evaluations", icon: ClipboardCheck },
  { key: "maintenance", title: "Maintenance", icon: Wrench, operator: true },
  { key: "activity", title: "Activity log", icon: Activity },
  { key: "access", title: "Evaluator access", icon: Users, operator: true },
];
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not set";
const stages = ["soaking", "rinsing", "growing", "ready", "harvested"];
type Dialog = { kind: string; batch?: Batch; alert?: Alert } | null;

export default function Workspace({
  profile,
  onProfile,
  onSignOut,
}: {
  profile: Profile;
  onProfile: (value: Profile) => void;
  onSignOut: () => Promise<void>;
}) {
  const operator = isOperator(profile);
  const [page, setPage] = useState("home");
  const [menu, setMenu] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const [data, setData] = useState<WorkspaceData>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [batchFilter, setBatchFilter] = useState("all");
  const [selectedDevice, setSelectedDevice] = useState("all");
  const [preferences, setPreferences] = useState({
    alerts_enabled: true,
    harvest_enabled: true,
  });
  useEffect(() => {
    let active = true;
    supabase
      .from("notification_preferences")
      .select("alerts_enabled,harvest_enabled")
      .eq("user_id", profile.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setToast("Notification preferences could not be loaded.");
        else if (data) setPreferences(data);
      });
    return () => {
      active = false;
    };
  }, [profile.id]);
  const pending = useRef<AbortController | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!accountMenu) return;
    const outside = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node))
        setAccountMenu(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountMenu(false);
        accountRef.current
          ?.querySelector<HTMLButtonElement>(".account-trigger")
          ?.focus();
      }
      const items = Array.from(
        accountRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]',
        ) ?? [],
      );
      if (
        !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) ||
        !items.length
      )
        return;
      event.preventDefault();
      const current = items.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const index =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (current + (event.key === "ArrowUp" ? -1 : 1) + items.length) %
              items.length;
      items[index].focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keyboard);
    };
  }, [accountMenu]);
  const nav = pages.filter((item) => !item.operator || operator);
  const reload = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setRefreshing(true);
    try {
      const next = await loadWorkspace(controller.signal);
      if (!controller.signal.aborted) {
        setData(next);
        setError("");
        setUpdated(new Date());
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 30000);
    const resume = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearInterval(timer);
      pending.current?.abort();
      document.removeEventListener("visibilitychange", resume);
    };
  }, [reload]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  function navigate(key: string) {
    setPage(key);
    setMenu(false);
    setQuery("");
  }
  function open(next: Dialog) {
    setDialogError("");
    setDialog(next);
  }
  function close() {
    if (!busy) {
      setDialog(null);
      setDialogError("");
    }
  }
  async function mutate(
    action: () => PromiseLike<{ error: unknown }>,
    success: string,
  ) {
    setBusy(true);
    setDialogError("");
    try {
      const { error } = await action();
      if (error) throw error;
      setDialog(null);
      setToast(success);
      await reload();
    } catch (error) {
      setDialogError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const activeAlerts = data.alerts.filter((a) => a.status !== "resolved");
  const notificationAlerts = activeAlerts.filter((a) =>
    a.category === "harvest"
      ? preferences.harvest_enabled
      : preferences.alerts_enabled,
  );
  const batches = data.batches.filter(
    (b) =>
      (batchFilter === "all" || b.status === batchFilter) &&
      `${b.code} ${b.seed_type} ${b.stage}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const deviceName = (id: number) =>
    data.devices.find((d) => d.id === id)?.name ?? `Device ${id}`;
  const batchName = (id: number | null) =>
    data.batches.find((b) => b.id === id)?.code ?? "All batches";
  const currentReading = data.readings.find(
    (r) => selectedDevice === "all" || r.device_id === Number(selectedDevice),
  );
  const initials = (profile.first_name || profile.display_name || profile.email)
    .trim()
    .split(/\s+/)
    .map((value) => value[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const nextSchedule = data.schedules
    .filter((s) => s.enabled && new Date(s.next_run_at) > new Date())
    .sort((a, b) => a.next_run_at.localeCompare(b.next_run_at))[0];
  const totalLitres =
    data.watering.reduce((total, event) => total + event.volume_ml, 0) / 1000;
  const title =
    nav.find((item) => item.key === page)?.title ??
    (page === "settings" ? "Profile & settings" : "Overview");
  const table = (headings: string[], rows: ReactNode[][], empty: string) => (
    <DataTable headings={headings} rows={rows} empty={empty} />
  );
  const batchTable = (rows: Batch[]) =>
    table(
      ["Batch", "Crop", "Stage", "Status", "Target harvest", "Details"],
      rows.map((b) => [
        <strong>{b.code}</strong>,
        b.seed_type,
        <Status value={b.stage} />,
        <Status value={b.status} />,
        date(b.target_harvest_at),
        <button
          className="table-link"
          onClick={() => open({ kind: "batch-details", batch: b })}
          aria-label={`View ${b.code}`}
        >
          View <ChevronRight size={14} />
        </button>,
      ]),
      operator
        ? "No batches yet. Create your first batch to start tracking."
        : "No batches have been shared with your account yet.",
    );

  return (
    <div className="app-workspace">
      <a href="#workspace-main" className="skip-link">
        Skip to content
      </a>
      <aside className="app-sidebar">
        <a href={operator ? "/operator" : "/dashboard"} className="app-brand">
          <Logo className="h-16 w-16" />
          <span>SproutSync</span>
        </a>
        <p className="sidebar-caption">
          {operator ? "Operator workspace" : "Evaluator workspace"}
        </p>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <button
              key={item.key}
              onClick={() => navigate(item.key)}
              aria-current={page === item.key ? "page" : undefined}
              className={page === item.key ? "selected" : ""}
            >
              <item.icon size={18} />
              {item.title}
              {item.key === "alerts" && activeAlerts.length > 0 && (
                <span className="nav-count">{activeAlerts.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-account">
          <span className="avatar">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              initials
            )}
          </span>
          <div>
            <strong>{profile.display_name || profile.email}</strong>
            <small>{operator ? "Operator" : "Evaluator"}</small>
          </div>
          <button
            aria-label="Sign out"
            className="icon-button"
            onClick={() => open({ kind: "signout" })}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="app-topbar">
          <button
            className="icon-button lg:hidden"
            onClick={() => setMenu(true)}
            aria-label="Open navigation"
          >
            <Menu size={22} />
          </button>
          <div>
            <p className="text-xs text-muted-foreground">Workspace / {title}</p>
            <h1 className="text-lg font-bold">{title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="icon-button relative"
              aria-label={`Notifications, ${notificationAlerts.length} active alerts`}
              onClick={() => open({ kind: "notifications" })}
            >
              <Bell size={20} />
              {notificationAlerts.length > 0 && (
                <span className="notification-dot" />
              )}
            </button>
            <div className="account-menu" ref={accountRef}>
              <button
                className="account-trigger"
                aria-label="Account menu"
                aria-expanded={accountMenu}
                aria-haspopup="menu"
                onClick={() => setAccountMenu((value) => !value)}
              >
                <span className="avatar">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </span>
                <span className="account-trigger-copy">
                  <strong>{profile.display_name || profile.email}</strong>
                  <small>{operator ? "Operator" : "Evaluator"}</small>
                </span>
                <ChevronDown size={16} />
              </button>
              {accountMenu && (
                <div className="account-dropdown" role="menu">
                  <div className="account-dropdown-heading">
                    <span className="avatar">
                      {profile.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        initials
                      )}
                    </span>
                    <div>
                      <strong>{profile.display_name || profile.email}</strong>
                      <small>
                        {operator ? "Operator account" : "Evaluator account"}
                      </small>
                    </div>
                  </div>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setAccountMenu(false);
                      navigate("settings");
                    }}
                  >
                    <UserCircle size={17} />
                    Profile
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setAccountMenu(false);
                      navigate("settings");
                    }}
                  >
                    <Settings size={17} />
                    Settings
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setAccountMenu(false);
                      open({ kind: "help" });
                    }}
                  >
                    <HelpCircle size={17} />
                    Help & FAQ
                  </button>
                  <div className="account-dropdown-divider" />
                  <button
                    role="menuitem"
                    className="danger"
                    onClick={() => {
                      setAccountMenu(false);
                      open({ kind: "signout" });
                    }}
                  >
                    <LogOut size={17} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="workspace-main" className="app-content" tabIndex={-1}>
          <div className="sync-bar">
            <span>
              {refreshing
                ? "Refreshing records…"
                : updated
                  ? `Updated ${updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "Connecting…"}
            </span>
            <button
              disabled={refreshing}
              onClick={() => void reload()}
              className="table-link"
            >
              <RefreshCw
                size={14}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>
          {error && (
            <div role="alert" className="feedback-error mb-5">
              {error}
              {updated && " Previously loaded records are shown below."}
            </div>
          )}
          {loading ? (
            <div
              role="status"
              aria-label="Loading workspace"
              className="grid gap-4 sm:grid-cols-2"
            >
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-36 animate-pulse rounded-2xl bg-secondary"
                />
              ))}
            </div>
          ) : (
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              {page === "home" && (
                <>
                  <section className="welcome-panel">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200">
                        {operator
                          ? "Your growing space"
                          : "Your evaluation space"}
                      </p>
                      <h2>Welcome back, {profile.first_name}.</h2>
                      <p>
                        {operator
                          ? "A clear view of your batches, chamber, and daily operations."
                          : "Review shared batches, inspect evidence, and submit your assessment."}
                      </p>
                      {data.batches.some((b) => b.is_demo) && (
                        <span className="preview-label">
                          Sample records · Saved in your workspace
                        </span>
                      )}
                    </div>
                    <Sprout className="welcome-leaf" size={88} />
                  </section>
                  <div className="summary-grid">
                    <Metric
                      icon={<Cpu />}
                      label="System status"
                      value={
                        data.devices.length
                          ? `${data.devices.filter((d) => d.status === "online" && (d.is_demo || (d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < 300000))).length} online`
                          : "No devices"
                      }
                      detail={`${data.devices.length} linked devices`}
                    />
                    <Metric
                      icon={<Sprout />}
                      label="Active batches"
                      value={String(
                        data.batches.filter((b) => b.status === "active")
                          .length,
                      )}
                      detail="Current production"
                    />
                    <Metric
                      icon={<Activity />}
                      label="Tray status"
                      value={`${data.trays.filter((t) => t.status === "active").length} / ${data.trays.length}`}
                      detail="Active / total trays"
                    />
                    <Metric
                      icon={<Bell />}
                      label="Open alerts"
                      value={String(activeAlerts.length)}
                      detail="Awaiting resolution"
                    />
                    <Metric
                      icon={<Droplets />}
                      label="Water usage"
                      value={`${totalLitres.toFixed(1)} L`}
                      detail="All recorded watering events"
                    />
                    <Metric
                      icon={<ClipboardCheck />}
                      label="Evidence"
                      value={String(data.evidence.length)}
                      detail={`${data.evaluations.length} evaluations submitted`}
                    />
                  </div>
                  <div className="grid gap-5 xl:grid-cols-2">
                    <section className="surface">
                      <SectionTitle
                        title="Current conditions"
                        action={
                          <Btn
                            variant="ghost"
                            onClick={() => open({ kind: "readings" })}
                          >
                            View readings
                          </Btn>
                        }
                      />
                      <label className="field mb-4">
                        <span className="sr-only">Select device</span>
                        <select
                          value={selectedDevice}
                          onChange={(e) => setSelectedDevice(e.target.value)}
                        >
                          <option value="all">Latest available reading</option>
                          {data.devices.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {currentReading ? (
                        <>
                          <div className="condition-grid">
                            <div>
                              <strong>
                                {currentReading.temperature_c ?? "—"}°C
                              </strong>
                              <span>Temperature</span>
                            </div>
                            <div>
                              <strong>
                                {currentReading.humidity_percent ?? "—"}%
                              </strong>
                              <span>Humidity</span>
                            </div>
                            <div>
                              <strong>
                                {currentReading.water_level_percent ?? "—"}%
                              </strong>
                              <span>Water level</span>
                            </div>
                            <div>
                              <strong>
                                {currentReading.water_temperature_c ?? "—"}°C
                              </strong>
                              <span>Water temperature</span>
                            </div>
                            <div>
                              <strong>
                                {currentReading.light_lux ?? "—"} lux
                              </strong>
                              <span>Light level</span>
                            </div>
                            <div>
                              <strong>
                                {currentReading.wastewater_level_percent ?? "—"}
                                %
                              </strong>
                              <span>Wastewater</span>
                            </div>
                          </div>
                          <p className="mt-4 text-xs text-muted-foreground">
                            {deviceName(currentReading.device_id)} ·{" "}
                            {date(currentReading.recorded_at)}
                            {Date.now() -
                              new Date(currentReading.recorded_at).getTime() >
                            300000
                              ? " · Reading is stale"
                              : ""}
                          </p>
                        </>
                      ) : (
                        <Empty text="Waiting for your first device reading." />
                      )}
                    </section>
                    <section className="surface">
                      <SectionTitle title="Next irrigation" />
                      <p className="text-2xl font-bold">
                        {nextSchedule
                          ? date(nextSchedule.next_run_at)
                          : "No upcoming run"}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {nextSchedule
                          ? `${deviceName(nextSchedule.device_id)} · ${nextSchedule.duration_seconds} seconds`
                          : "Your configured irrigation schedule will appear here."}
                      </p>
                      <button
                        className="table-link mt-5"
                        onClick={() => navigate("irrigation")}
                      >
                        View irrigation <ChevronRight size={15} />
                      </button>
                    </section>
                  </div>
                  <section className="surface">
                    <SectionTitle
                      title="Recent batches"
                      action={
                        <Btn
                          variant="ghost"
                          onClick={() => navigate("batches")}
                        >
                          View all
                        </Btn>
                      }
                    />
                    {batchTable(data.batches.slice(0, 5))}
                  </section>
                </>
              )}
              {page === "batches" && (
                <section className="surface">
                  <SectionTitle
                    title="Production batches"
                    subtitle="Track every batch from soaking to harvest."
                    action={
                      operator && (
                        <Btn onClick={() => open({ kind: "batch-create" })}>
                          <Plus size={16} />
                          New batch
                        </Btn>
                      )
                    }
                  />
                  <div className="table-toolbar">
                    <label className="search-field">
                      <Search size={17} />
                      <input
                        aria-label="Search batches"
                        placeholder="Search code, crop, stage…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <select
                      className="filter-select"
                      aria-label="Batch status filter"
                      value={batchFilter}
                      onChange={(e) => setBatchFilter(e.target.value)}
                    >
                      <option value="all">All batches</option>
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  {batchTable(batches)}
                </section>
              )}
              {page === "alerts" && (
                <section className="surface">
                  <SectionTitle
                    title="Alerts & history"
                    subtitle={`${activeAlerts.length} active alerts`}
                  />
                  {data.alerts.length ? (
                    <div className="space-y-3">
                      {data.alerts.map((alert) => (
                        <button
                          key={alert.id}
                          className="alert-row"
                          onClick={() => open({ kind: "alert", alert })}
                        >
                          <span className={`alert-symbol ${alert.severity}`}>
                            <Bell size={20} />
                          </span>
                          <span className="min-w-0 flex-1 text-left">
                            <strong>{alert.title}</strong>
                            <small>{date(alert.created_at)}</small>
                          </span>
                          <Status value={alert.status} />
                          <ChevronRight size={16} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Empty text="No alerts have been recorded." />
                  )}
                </section>
              )}
              {page === "irrigation" && (
                <>
                  <section className="surface">
                    <SectionTitle
                      title="Irrigation schedule"
                      action={
                        operator && (
                          <Btn
                            disabled={!data.devices.length}
                            onClick={() => open({ kind: "schedule" })}
                          >
                            <Plus size={16} />
                            Add schedule
                          </Btn>
                        )
                      }
                    />
                    {table(
                      ["Device", "Next run", "Duration", "Status"],
                      data.schedules.map((s) => [
                        deviceName(s.device_id),
                        date(s.next_run_at),
                        `${s.duration_seconds}s`,
                        s.enabled ? "Enabled" : "Paused",
                      ]),
                      "No irrigation schedules yet.",
                    )}
                  </section>
                  <section className="surface">
                    <SectionTitle title="Watering history" />
                    {table(
                      ["Device", "Batch", "Water", "Duration", "Time"],
                      data.watering.map((w) => [
                        deviceName(w.device_id),
                        batchName(w.batch_id),
                        `${(w.volume_ml / 1000).toFixed(2)} L`,
                        `${w.duration_seconds}s`,
                        date(w.occurred_at),
                      ]),
                      "No watering events have been received.",
                    )}
                  </section>
                </>
              )}
              {page === "reports" && (
                <>
                  <section className="surface">
                    <SectionTitle
                      title="Water use this week"
                      subtitle="Recorded water use over the last seven days."
                    />
                    <WaterUseChart
                      data={Array.from({ length: 7 }, (_, index) => {
                        const day = new Date();
                        day.setHours(0, 0, 0, 0);
                        day.setDate(day.getDate() - 6 + index);
                        const end = new Date(day);
                        end.setDate(end.getDate() + 1);
                        const litres =
                          data.watering
                            .filter(
                              (record) =>
                                new Date(record.occurred_at) >= day &&
                                new Date(record.occurred_at) < end,
                            )
                            .reduce(
                              (sum, record) => sum + record.volume_ml,
                              0,
                            ) / 1000;
                        return {
                          day: day.toLocaleDateString([], { weekday: "short" }),
                          L: Number(litres.toFixed(2)),
                        };
                      })}
                    />
                  </section>
                  <div className="summary-grid">
                    <Metric
                      icon={<Droplets />}
                      label="Total water"
                      value={`${totalLitres.toFixed(1)} L`}
                      detail={`${data.watering.length} recorded events`}
                    />
                    <Metric
                      icon={<Sprout />}
                      label="Harvested batches"
                      value={String(
                        data.batches.filter((b) => b.stage === "harvested")
                          .length,
                      )}
                      detail="Recorded harvest stage"
                    />
                    <Metric
                      icon={<CheckCircle2 />}
                      label="Passed checks"
                      value={String(
                        data.evidence.filter((e) => e.result === "passed")
                          .length,
                      )}
                      detail={`${data.evidence.length} evidence records`}
                    />
                  </div>
                  <section className="surface">
                    <SectionTitle
                      title="Water use by batch"
                      action={
                        <Btn
                          variant="outline"
                          disabled={!data.watering.length}
                          onClick={() =>
                            downloadCsv(
                              "sproutsync-water.csv",
                              [
                                "Event",
                                "Batch",
                                "Device",
                                "Volume (ml)",
                                "Duration (s)",
                                "Occurred at",
                              ],
                              data.watering.map((w) => [
                                w.id,
                                batchName(w.batch_id),
                                deviceName(w.device_id),
                                w.volume_ml,
                                w.duration_seconds,
                                w.occurred_at,
                              ]),
                            )
                          }
                        >
                          <Download size={16} />
                          Export water CSV
                        </Btn>
                      }
                    />
                    {table(
                      ["Batch", "Water used", "Events"],
                      data.batches.map((b) => {
                        const events = data.watering.filter(
                          (w) => w.batch_id === b.id,
                        );
                        return [
                          b.code,
                          `${(events.reduce((sum, w) => sum + w.volume_ml, 0) / 1000).toFixed(2)} L`,
                          events.length,
                        ];
                      }),
                      "No batch data to report.",
                    )}
                    <Btn
                      variant="outline"
                      className="mt-5"
                      disabled={!data.batches.length}
                      onClick={() =>
                        downloadCsv(
                          "sproutsync-batches.csv",
                          [
                            "Code",
                            "Crop",
                            "Stage",
                            "Status",
                            "Started",
                            "Target harvest",
                          ],
                          data.batches.map((b) => [
                            b.code,
                            b.seed_type,
                            b.stage,
                            b.status,
                            b.started_at,
                            b.target_harvest_at,
                          ]),
                        )
                      }
                    >
                      <Download size={16} />
                      Export batch CSV
                    </Btn>
                  </section>
                </>
              )}
              {page === "devices" && (
                <section className="surface">
                  <SectionTitle
                    title="Your devices"
                    subtitle="Register the serial number printed on your chamber."
                    action={
                      operator && (
                        <Btn onClick={() => open({ kind: "device" })}>
                          <Plus size={16} />
                          Add device
                        </Btn>
                      )
                    }
                  />
                  {table(
                    ["Device", "Serial number", "Connection", "Last seen"],
                    data.devices.map((d) => [
                      d.name,
                      d.serial_number,
                      <Status
                        value={
                          d.status === "online" &&
                          !d.is_demo &&
                          (!d.last_seen_at ||
                            Date.now() - new Date(d.last_seen_at).getTime() >
                              300000)
                            ? "offline"
                            : d.status
                        }
                      />,
                      date(d.last_seen_at),
                    ]),
                    "No devices linked yet.",
                  )}
                  <p className="mt-4 text-sm text-muted-foreground">
                    A registered device stays pending until its controller sends
                    a heartbeat. Connect it to Wi-Fi using the controller’s
                    setup interface.
                  </p>
                </section>
              )}
              {page === "evidence" && (
                <section className="surface">
                  <SectionTitle
                    title="Evaluation evidence"
                    action={
                      operator && (
                        <Btn onClick={() => open({ kind: "evidence" })}>
                          <Plus size={16} />
                          Record evidence
                        </Btn>
                      )
                    }
                  />
                  {table(
                    [
                      "Test",
                      "Category",
                      "Batch",
                      "Result",
                      "Notes",
                      "Recorded",
                    ],
                    data.evidence.map((e) => [
                      e.title,
                      e.category.replaceAll("_", " "),
                      batchName(e.batch_id),
                      <Status value={e.result} />,
                      e.notes,
                      date(e.recorded_at),
                    ]),
                    "No evidence has been recorded yet.",
                  )}
                </section>
              )}
              {page === "evaluations" && (
                <section className="surface">
                  <SectionTitle
                    title={
                      operator ? "Submitted evaluations" : "Your evaluations"
                    }
                    action={
                      !operator && (
                        <Btn
                          disabled={!data.batches.length}
                          onClick={() => open({ kind: "evaluation" })}
                        >
                          <Plus size={16} />
                          Evaluate a batch
                        </Btn>
                      )
                    }
                  />
                  {table(
                    ["Batch", "Rating", "Comments", "Submitted"],
                    data.evaluations.map((e) => [
                      batchName(e.batch_id),
                      `${e.rating} / 5`,
                      e.comments,
                      date(e.created_at),
                    ]),
                    "No evaluations submitted yet.",
                  )}
                </section>
              )}
              {page === "maintenance" && operator && (
                <section className="surface">
                  <SectionTitle
                    title="Maintenance records"
                    action={
                      <Btn
                        disabled={!data.devices.length}
                        onClick={() => open({ kind: "maintenance" })}
                      >
                        <Plus size={16} />
                        Record maintenance
                      </Btn>
                    }
                  />
                  {table(
                    ["Device", "Notes", "Performed"],
                    data.maintenance.map((m) => [
                      deviceName(m.device_id),
                      m.notes,
                      date(m.performed_at),
                    ]),
                    "No maintenance records yet.",
                  )}
                </section>
              )}
              {page === "activity" && (
                <section className="surface">
                  <SectionTitle title="Activity log" />
                  {table(
                    ["Action", "Record", "Time"],
                    data.activity.map((a) => [
                      a.action,
                      a.resource,
                      date(a.created_at),
                    ]),
                    "No activity has been recorded yet.",
                  )}
                </section>
              )}
              {page === "access" && operator && (
                <section className="surface">
                  <SectionTitle
                    title="Evaluator access"
                    subtitle="Grant an evaluator access to review your records using their account email."
                    action={
                      <Btn onClick={() => open({ kind: "access" })}>
                        <Plus size={16} />
                        Grant access
                      </Btn>
                    }
                  />
                  {table(
                    ["Evaluator email", "Granted"],
                    data.access.map((a) => [
                      a.evaluator_email,
                      date(a.created_at),
                    ]),
                    "No evaluator access has been granted.",
                  )}
                </section>
              )}
              {page === "settings" && (
                <div className="grid gap-5 xl:grid-cols-2">
                  <section className="surface">
                    <PersonalDetails
                      editing
                      profile={profile}
                      onSaved={(next) => {
                        onProfile(next);
                        setToast("Profile saved.");
                      }}
                    />
                  </section>
                  <section className="surface">
                    <SectionTitle title="Notifications & account" />
                    <Preferences
                      userId={profile.id}
                      onChange={setPreferences}
                    />
                    <div className="my-6 border-t border-border" />
                    <p className="mb-4 text-sm text-muted-foreground">
                      Signed in as {profile.email}
                    </p>
                    <Btn
                      variant="outline"
                      onClick={() => open({ kind: "signout" })}
                    >
                      <LogOut size={16} />
                      Sign out
                    </Btn>
                  </section>
                </div>
              )}
            </motion.div>
          )}
        </main>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {pages.slice(0, 4).map((item) => (
          <button
            key={item.key}
            aria-current={page === item.key ? "page" : undefined}
            onClick={() => navigate(item.key)}
          >
            <item.icon size={20} />
            <span>{item.title === "Overview" ? "Home" : item.title}</span>
          </button>
        ))}
        <button aria-expanded={menu} onClick={() => setMenu(true)}>
          <MoreHorizontal size={21} />
          <span>More</span>
        </button>
      </nav>
      <Modal
        open={menu}
        onClose={() => setMenu(false)}
        title="Explore SproutSync"
      >
        <div className="grid grid-cols-2 gap-2">
          {nav.map((item) => (
            <button
              key={item.key}
              className="more-nav-item"
              onClick={() => navigate(item.key)}
            >
              <item.icon size={19} />
              {item.title}
            </button>
          ))}
        </div>
        <Btn
          variant="outline"
          className="mt-5 w-full"
          onClick={() => {
            setMenu(false);
            open({ kind: "signout" });
          }}
        >
          Sign out
        </Btn>
      </Modal>
      <Modal
        open={!!dialog}
        onClose={close}
        title={
          dialog?.kind === "signout"
            ? "Are you sure you want to sign out?"
            : dialog?.kind === "batch-details"
              ? dialog.batch!.code
              : dialog?.kind === "alert"
                ? dialog.alert!.title
                : ({
                    "batch-create": "Create batch",
                    device: "Add device",
                    schedule: "Add irrigation schedule",
                    evidence: "Record evidence",
                    evaluation: "Evaluate batch",
                    maintenance: "Record maintenance",
                    access: "Grant evaluator access",
                    notifications: "Notifications",
                    help: "Help & FAQ",
                    readings: "Sensor history",
                  }[dialog?.kind ?? ""] ?? "")
        }
      >
        {dialogError && (
          <p role="alert" className="feedback-error mb-4">
            {dialogError}
          </p>
        )}
        {dialog?.kind === "signout" && (
          <div className="mt-6 flex justify-end gap-3">
            <Btn disabled={busy} variant="outline" onClick={close}>
              No
            </Btn>
            <Btn
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onSignOut();
                } catch (e) {
                  setDialogError(errorMessage(e));
                  setBusy(false);
                }
              }}
            >
              {busy ? "Signing out…" : "Yes"}
            </Btn>
          </div>
        )}
        {dialog?.kind === "readings" &&
          table(
            [
              "Device",
              "Air °C",
              "Humidity %",
              "Fresh water %",
              "Water °C",
              "Light lux",
              "Wastewater %",
              "Recorded",
            ],
            data.readings
              .filter(
                (reading) =>
                  selectedDevice === "all" ||
                  reading.device_id === Number(selectedDevice),
              )
              .map((reading) => [
                deviceName(reading.device_id),
                reading.temperature_c ?? "—",
                reading.humidity_percent ?? "—",
                reading.water_level_percent ?? "—",
                reading.water_temperature_c ?? "—",
                reading.light_lux ?? "—",
                reading.wastewater_level_percent ?? "—",
                date(reading.recorded_at),
              ]),
            "No sensor readings yet.",
          )}
        {dialog?.kind === "help" && (
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              Use the sidebar to review batches, conditions, alerts, and
              evaluation records.
            </p>
            <p>
              Operators manage production records and evaluator access.
              Evaluators can review batches shared with them and submit
              assessments.
            </p>
            <p>For device or account access, contact your system operator. Sample records are labelled and saved in the workspace.</p>
          </div>
        )}
        {dialog?.kind === "notifications" &&
          (notificationAlerts.length ? (
            <div className="space-y-3">
              {notificationAlerts.map((a) => (
                <button
                  key={a.id}
                  className="alert-row"
                  onClick={() => open({ kind: "alert", alert: a })}
                >
                  <Bell size={18} />
                  <span className="text-left">
                    <strong>{a.title}</strong>
                    <small>{date(a.created_at)}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <Empty text="You’re all caught up. No new notifications." />
          ))}
        {dialog?.kind === "alert" && (
          <div className="space-y-4">
            <Status value={dialog.alert!.status} />
            <p>{dialog.alert!.message}</p>
            <section className="rounded-xl bg-secondary p-4">
              <h3 className="font-semibold">Recommended action</h3>
              <p className="mt-1 text-sm">
                {dialog.alert!.recommended_action ||
                  "Inspect the device and review its latest readings."}
              </p>
            </section>
            <p className="text-xs text-muted-foreground">
              {date(dialog.alert!.created_at)}
            </p>
            {operator && dialog.alert!.status !== "resolved" && (
              <div className="flex gap-3">
                <Btn
                  disabled={busy || dialog.alert!.status === "acknowledged"}
                  variant="outline"
                  onClick={() =>
                    void mutate(
                      () =>
                        supabase
                          .from("alerts")
                          .update({ status: "acknowledged" })
                          .eq("id", dialog.alert!.id)
                          .select()
                          .single(),
                      "Alert acknowledged.",
                    )
                  }
                >
                  Acknowledge
                </Btn>
                <Btn
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      () =>
                        supabase
                          .from("alerts")
                          .update({ status: "resolved" })
                          .eq("id", dialog.alert!.id)
                          .select()
                          .single(),
                      "Alert resolved.",
                    )
                  }
                >
                  Resolve
                </Btn>
              </div>
            )}
          </div>
        )}
        {dialog?.kind === "batch-details" && (
          <div className="space-y-4">
            <dl className="detail-grid">
              {[
                ["Crop", dialog.batch!.seed_type],
                ["Stage", dialog.batch!.stage],
                ["Status", dialog.batch!.status],
                ["Started", date(dialog.batch!.started_at)],
                ["Target harvest", date(dialog.batch!.target_harvest_at)],
                ["Notes", dialog.batch!.notes || "No notes"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {operator && dialog.batch!.status === "active" && (
              <RecordForm
                busy={busy}
                submitLabel="Save batch"
                fields={[
                  {
                    name: "stage",
                    label: "Growth stage",
                    options: stages.map((s) => [s, s]),
                    value: dialog.batch!.stage,
                  },
                  {
                    name: "notes",
                    label: "Notes",
                    type: "textarea",
                    required: false,
                    value: dialog.batch!.notes ?? "",
                  },
                  {
                    name: "status",
                    label: "Status",
                    options: [
                      ["active", "Active"],
                      ["archived", "Archived"],
                    ],
                    value: dialog.batch!.status,
                  },
                ]}
                onSubmit={(values) =>
                  mutate(
                    () =>
                      supabase
                        .from("batches")
                        .update(values)
                        .eq("id", dialog.batch!.id)
                        .select()
                        .single(),
                    "Batch updated.",
                  )
                }
              />
            )}
          </div>
        )}
        {dialog &&
          [
            "batch-create",
            "device",
            "schedule",
            "evidence",
            "evaluation",
            "maintenance",
            "access",
          ].includes(dialog.kind) && (
            <RecordForm
              key={dialog.kind}
              busy={busy}
              fields={formFields(dialog.kind, data)}
              onSubmit={async (values) => {
                const payload: Record<string, unknown> = {
                  ...values,
                  owner_id: profile.id,
                };
                let table = "";
                if (dialog.kind === "batch-create") {
                  table = "batches";
                  payload.started_at = new Date(
                    values.started_at,
                  ).toISOString();
                  payload.target_harvest_at = values.target_harvest_at
                    ? new Date(values.target_harvest_at).toISOString()
                    : null;
                  if (
                    payload.target_harvest_at &&
                    String(payload.target_harvest_at) <
                      String(payload.started_at)
                  ) {
                    setDialogError(
                      "Harvest date must be after the start date.",
                    );
                    return;
                  }
                }
                if (dialog.kind === "device") table = "devices";
                if (dialog.kind === "access") {
                  table = "evaluator_access";
                  payload.evaluator_email = values.evaluator_email
                    .trim()
                    .toLowerCase();
                }
                if (dialog.kind === "maintenance") {
                  table = "maintenance_records";
                  payload.device_id = Number(values.device_id);
                }
                if (dialog.kind === "schedule") {
                  table = "irrigation_schedules";
                  payload.device_id = Number(values.device_id);
                  payload.duration_seconds = Number(values.duration_seconds);
                  payload.next_run_at = new Date(
                    values.next_run_at,
                  ).toISOString();
                }
                if (dialog.kind === "evidence") {
                  table = "evidence_records";
                  payload.batch_id = values.batch_id
                    ? Number(values.batch_id)
                    : null;
                }
                if (dialog.kind === "evaluation") {
                  table = "evaluations";
                  delete payload.owner_id;
                  payload.evaluator_id = profile.id;
                  payload.batch_id = Number(values.batch_id);
                  payload.rating = Number(values.rating);
                }
                await mutate(
                  () => supabase.from(table).insert(payload).select().single(),
                  "Record saved.",
                );
              }}
            />
          )}
      </Modal>
      <AnimatePresence>
        {toast && (
          <motion.div
            className="app-toast"
            role="status"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <CheckCircle2 size={19} />
            <span>{toast}</span>
            <button
              onClick={() => setToast("")}
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="summary-card">
      <span className="summary-icon">{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className={`record-status status-${value}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <Sprout size={30} />
      <p>{text}</p>
    </div>
  );
}
function DataTable({
  headings,
  rows,
  empty,
}: {
  headings: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  if (!rows.length) return <Empty text={empty} />;
  return (
    <div
      className="record-table-wrap"
      tabIndex={0}
      aria-label="Scrollable records"
    >
      <table className="record-table">
        <thead>
          <tr>
            {headings.map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, i) => (
                <td key={i} data-label={headings[i]}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: string[][];
  value?: string;
  min?: number;
  max?: number;
};
function RecordForm({
  fields,
  busy,
  onSubmit,
  submitLabel = "Save",
}: {
  fields: Field[];
  busy: boolean;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  submitLabel?: string;
}) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const values = Object.fromEntries(
      new FormData(event.currentTarget),
    ) as Record<string, string>;
    try {
      await onSubmit(values);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="space-y-4">
        {fields.map((f) => (
          <label className="field" key={f.name}>
            {f.label}
            {f.options ? (
              <select
                name={f.name}
                required={f.required !== false}
                defaultValue={f.value ?? ""}
              >
                <option value="" disabled={f.required !== false}>
                  Select…
                </option>
                {f.options.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                name={f.name}
                rows={3}
                maxLength={2000}
                required={f.required !== false}
                defaultValue={f.value}
              />
            ) : (
              <input
                name={f.name}
                type={f.type ?? "text"}
                required={f.required !== false}
                defaultValue={f.value}
                min={f.min}
                max={f.max}
                maxLength={f.name === "code" ? 64 : 120}
              />
            )}
          </label>
        ))}
        {error && (
          <p role="alert" className="feedback-error">
            {error}
          </p>
        )}
        <Btn className="w-full" disabled={busy} type="submit">
          {busy ? "Saving…" : submitLabel}
        </Btn>
      </fieldset>
    </form>
  );
}
function formFields(kind: string, data: WorkspaceData): Field[] {
  const device: Field = {
    name: "device_id",
    label: "Device",
    options: data.devices.map((d) => [String(d.id), d.name]),
  };
  const batch: Field = {
    name: "batch_id",
    label: "Batch",
    options: data.batches.map((b) => [String(b.id), b.code]),
  };
  const notes: Field = { name: "notes", label: "Notes", type: "textarea" };
  return (
    (
      {
        "batch-create": [
          { name: "code", label: "Batch code" },
          { name: "seed_type", label: "Crop", value: "Mung beans" },
          { name: "started_at", label: "Start date", type: "datetime-local" },
          {
            name: "target_harvest_at",
            label: "Target harvest (optional)",
            type: "datetime-local",
            required: false,
          },
          { ...notes, required: false },
        ],
        device: [
          { name: "name", label: "Device name" },
          { name: "serial_number", label: "Device serial number" },
        ],
        access: [
          {
            name: "evaluator_email",
            label: "Evaluator’s account email",
            type: "email",
          },
        ],
        maintenance: [device, notes],
        schedule: [
          device,
          { name: "next_run_at", label: "Next run", type: "datetime-local" },
          {
            name: "duration_seconds",
            label: "Duration (seconds)",
            type: "number",
            min: 1,
            max: 600,
          },
        ],
        evidence: [
          { ...batch, required: false },
          { name: "title", label: "Test title" },
          {
            name: "category",
            label: "Category",
            options: [
              ["calibration", "Calibration"],
              ["irrigation", "Irrigation"],
              ["safety", "Safety"],
              ["offline_sync", "Offline sync"],
            ],
          },
          {
            name: "result",
            label: "Result",
            options: [
              ["passed", "Passed"],
              ["failed", "Failed"],
              ["pending", "Pending"],
            ],
          },
          notes,
        ],
        evaluation: [
          batch,
          {
            name: "rating",
            label: "Rating",
            options: [
              ["1", "1 — Poor"],
              ["2", "2 — Fair"],
              ["3", "3 — Good"],
              ["4", "4 — Very good"],
              ["5", "5 — Excellent"],
            ],
          },
          { name: "comments", label: "Comments", type: "textarea" },
        ],
      } as Record<string, Field[]>
    )[kind] ?? []
  );
}
function Preferences({
  userId,
  onChange,
}: {
  userId: number;
  onChange: (values: {
    alerts_enabled: boolean;
    harvest_enabled: boolean;
  }) => void;
}) {
  const [values, setValues] = useState<{
    alerts_enabled: boolean;
    harvest_enabled: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    supabase
      .from("notification_preferences")
      .select("alerts_enabled,harvest_enabled")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        else setValues(data ?? { alerts_enabled: true, harvest_enabled: true });
      });
    return () => {
      active = false;
    };
  }, [userId]);
  async function toggle(key: "alerts_enabled" | "harvest_enabled") {
    if (!values) return;
    setBusy(true);
    setError("");
    const next = { ...values, [key]: !values[key] };
    const { error } = await supabase
      .from("notification_preferences")
      .upsert({ user_id: userId, ...next });
    if (error) setError(error.message);
    else {
      setValues(next);
      onChange(next);
    }
    setBusy(false);
  }
  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="feedback-error">
          {error}
        </p>
      )}
      {values
        ? (["alerts_enabled", "harvest_enabled"] as const).map((key) => (
            <label
              key={key}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span>
                {key === "alerts_enabled"
                  ? "In-app alert notifications"
                  : "Harvest notifications"}
              </span>
              <input
                type="checkbox"
                checked={values[key]}
                disabled={busy}
                onChange={() => void toggle(key)}
                className="h-5 w-5 accent-emerald-600"
              />
            </label>
          ))
        : !error && <p>Loading preferences…</p>}
      <p className="text-xs text-muted-foreground">
        Preferences are saved to your account. Alert history is always
        available.
      </p>
    </div>
  );
}
