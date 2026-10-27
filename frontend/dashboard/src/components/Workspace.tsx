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
  MoreHorizontal,
  Droplets,
  Cpu,
  ClipboardCheck,
  Settings,
  LogOut,
  RefreshCw,
  Plus,
  Printer,
  Search,
  ChevronRight,
  CheckCircle2,
  X,
  Activity,
  Menu,
  ShieldCheck,
  HelpCircle,
  ChevronDown,
  Star,
  LifeBuoy,
} from "lucide-react";
import { supabase } from "../supabase";
import {
  emptyWorkspace,
  loadWorkspace,
  isOperator,
  errorMessage,
  type Profile,
  type WorkspaceData,
  type Batch,
  type Alert,
  type Evaluation,
} from "../data/workspace";
import { Logo, Btn, Modal } from "./ProtoPrimitives";
import { PersonalDetails } from "./PersonalDetails";
import { WaterUseChart } from "./ProtoCharts";

const pages = [
  { key: "home", title: "Overview", icon: LayoutDashboard },
  { key: "production", title: "Production", icon: Sprout },
  { key: "alerts", title: "Alerts", icon: Bell },
  { key: "review", title: "Review", icon: ClipboardCheck },
  { key: "system", title: "System", icon: Settings },
];
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not set";
const stages = ["soaking", "rinsing", "growing", "ready", "harvested"];
type Dialog = {
  kind: string;
  batch?: Batch;
  alert?: Alert;
  evaluation?: Evaluation;
} | null;

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
  const roleLabel =
    profile.role === "admin" ? "Admin IT" : operator ? "Operator" : "Evaluator";
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
  const [showWelcome, setShowWelcome] = useState(
    () => sessionStorage.getItem(`sproutsync-welcome-${profile.id}`) !== "seen",
  );
  const [query, setQuery] = useState("");
  const [batchFilter, setBatchFilter] = useState("all");
  const [batchMonth, setBatchMonth] = useState("");
  const [evaluationQuery, setEvaluationQuery] = useState("");
  const [evaluationBatch, setEvaluationBatch] = useState("all");
  const [selectedDevice, setSelectedDevice] = useState("all");
  const [preferences, setPreferences] = useState({
    alerts_enabled: true,
    harvest_enabled: true,
  });
  useEffect(() => {
    if (showWelcome) {
      sessionStorage.setItem(`sproutsync-welcome-${profile.id}`, "seen");
    }
  }, [profile.id, showWelcome]);
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
  const nav = pages;
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
      (!batchMonth || b.started_at.slice(0, 7) === batchMonth) &&
      `${b.code} ${b.seed_type} ${b.stage}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const deviceName = (id: number) =>
    data.devices.find((d) => d.id === id)?.name ?? `Device ${id}`;
  const batchName = (id: number | null) =>
    data.batches.find((b) => b.id === id)?.code ?? "All batches";
  const evaluationRows = data.evaluations.filter((evaluation) => {
    const code = batchName(evaluation.batch_id);
    return (
      (evaluationBatch === "all" ||
        evaluation.batch_id === Number(evaluationBatch)) &&
      `${code} ${evaluation.comments}`
        .toLowerCase()
        .includes(evaluationQuery.toLowerCase())
    );
  });
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
      [
        "Batch",
        "Owner",
        "Crop",
        "Stage",
        "Status",
        "Target harvest",
        "Details",
      ],
      rows.map((b) => [
        <strong>{b.code}</strong>,
        `Operator #${b.owner_id}`,
        b.seed_type,
        <button
          className="table-link"
          onClick={() => open({ kind: "batch-details", batch: b })}
          aria-label={`${operator ? "Update" : "View"} ${b.code} stage: ${b.stage}`}
        >
          <Status value={b.stage} />
        </button>,
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
          {roleLabel} workspace
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
            <small>{roleLabel}</small>
          </div>
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
                  <small>{roleLabel}</small>
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
                        {roleLabel} account
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
                    <Settings size={17} />
                    Profile & settings
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
                  {showWelcome && (
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
                    <button
                      className="welcome-dismiss"
                      aria-label="Dismiss welcome"
                      onClick={() => setShowWelcome(false)}
                    >
                      <X size={17} />
                    </button>
                  </section>
                  )}
                  <section className="role-brief" aria-labelledby="role-scope-title">
                    <span className="role-brief-icon" aria-hidden="true">
                      <ShieldCheck size={22} />
                    </span>
                    <div>
                      <p className="role-kicker">
                        {profile.role === "admin"
                          ? "Admin IT scope"
                          : operator
                            ? "Operator scope"
                            : "Evaluator scope"}
                      </p>
                      <h2 id="role-scope-title">
                        {profile.role === "admin"
                          ? "Provision access and equipment; preserve audit boundaries"
                          : operator
                            ? "Run production; keep machine evidence intact"
                            : "Review evidence independently; never rewrite machine data"}
                      </h2>
                      <p>
                        {profile.role === "admin"
                          ? "Register equipment, provision operators, and oversee access. Admin tools do not replace operator production decisions or evaluator judgment."
                          : operator
                            ? "Create and update batches, schedules, alerts, maintenance, and reviewer access. The chamber controller remains responsible for live sensing and safety interlocks."
                            : "Inspect only the batches shared with you and submit a separate human assessment. If your observation conflicts with a sensor reading, document the discrepancy and request a recheck—the original reading remains traceable."}
                      </p>
                    </div>
                  </section>
                  <section className="surface">
                    <SectionTitle
                      title="How a record is tracked"
                      subtitle="One traceable path from production through review—without overwriting the source record."
                    />
                    <ol className="tracking-map">
                      {[
                        ["1", "Batch", "Owner, crop, dates and stage"],
                        ["2", "Sensors & alerts", "Machine readings and current problems"],
                        ["3", "Evidence", "Checks, notes and maintenance"],
                        ["4", "Evaluation", "Independent human rating"],
                        ["5", "Activity log", "Who changed what and when"],
                      ].map(([step, name, detail], index, items) => (
                        <li key={step}>
                          <span>{step}</span>
                          <div>
                            <strong>{name}</strong>
                            <small>{detail}</small>
                          </div>
                          {index < items.length - 1 && (
                            <ChevronRight size={18} aria-hidden="true" />
                          )}
                        </li>
                      ))}
                    </ol>
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
                        onClick={() => navigate("production")}
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
                          onClick={() => navigate("production")}
                        >
                          View all
                        </Btn>
                      }
                    />
                    {batchTable(data.batches.slice(0, 5))}
                  </section>
                </>
              )}
              {page === "production" && (
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
                    <label className="month-filter">
                      <span>Start month</span>
                      <input
                        type="month"
                        aria-label="Batch start month"
                        value={batchMonth}
                        onChange={(event) => setBatchMonth(event.target.value)}
                      />
                    </label>
                  </div>
                  {(query || batchFilter !== "all" || batchMonth) && (
                    <div className="filter-summary" role="status">
                      <span>
                        {batches.length} matching batch
                        {batches.length === 1 ? "" : "es"}
                      </span>
                      <button
                        className="table-link"
                        onClick={() => {
                          setQuery("");
                          setBatchFilter("all");
                          setBatchMonth("");
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                  {batchTable(batches)}
                </section>
              )}
              {page === "alerts" && (
                <section className="surface">
                  <SectionTitle
                    title="Alerts & history"
                    subtitle={`${activeAlerts.length} active alerts`}
                    action={
                      operator && (
                        <Btn onClick={() => open({ kind: "incident-report" })}>
                          <Plus size={16} />
                          Report current situation
                        </Btn>
                      )
                    }
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
                            <small>
                              {alert.batch_id
                                ? `Batch ${batchName(alert.batch_id)} · `
                                : "No batch linked · "}
                              {date(alert.created_at)}
                            </small>
                          </span>
                          <Status value={alert.status} />
                          <ChevronRight size={16} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Empty text="No alerts have been recorded." />
                  )}
                  <div className="mt-6 border-t border-border pt-5">
                    <SectionTitle
                      title="Risk & incident categories"
                      subtitle="Use the alert message to state the current problem, location, and recommended response."
                    />
                    <div className="sensor-scope-grid">
                      {[
                        ["Pests or external contamination", "Record the affected room or tray"],
                        ["Water contamination", "Identify the batch and water source"],
                        ["Compliance risk", "State the failed check or missing evidence"],
                        ["Light leak", "Specify the chamber, door, or seal location"],
                      ].map(([name, purpose]) => (
                        <div key={name}>
                          <span className="summary-icon"><Bell size={18} /></span>
                          <strong>{name}</strong>
                          <small>{purpose}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}
              {page === "production" && (
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
              {page === "review" && (
                <>
                  <section className="review-boundary" aria-labelledby="review-boundary-title">
                    <ShieldCheck size={22} aria-hidden="true" />
                    <div>
                      <h2 id="review-boundary-title">Machine evidence and human judgment stay separate</h2>
                      <p>
                        Sensor readings and recorded tests are source evidence. An evaluator adds an independent assessment; a disagreement is recorded for follow-up and does not replace the machine record.
                      </p>
                    </div>
                  </section>
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
                          disabled={!data.batches.length}
                          onClick={() => window.print()}
                        >
                          <Printer size={16} />
                          Print report
                        </Btn>
                      }
                    />
                    <div className="report-goal">
                      <strong>Report goal</strong>
                      <p>
                        Trace water use back to each production batch so an
                        operator or evaluator can review exceptions with source
                        records intact.
                      </p>
                      <small>
                        Use the browser print dialog to create a paginated PDF;
                        enable its headers and footers when page numbers are required.
                      </small>
                    </div>
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
                    <p className="mt-4 text-xs text-muted-foreground">
                      Printable views keep the report readable without creating
                      an uncontrolled data export.
                    </p>
                  </section>
                </>
              )}
              {page === "system" && (
                <>
                  <section className="surface">
                    <SectionTitle
                      title="Sensors & chamber equipment"
                      subtitle="Identify every chamber by its printed serial number and latest heartbeat."
                      action={
                        profile.role === "admin" && (
                          <Btn onClick={() => open({ kind: "device" })}>
                            <Plus size={16} />
                            Register equipment
                          </Btn>
                        )
                      }
                    />
                    {table(
                      ["Equipment", "Serial number", "Connection", "Last seen"],
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
                      "No equipment linked yet.",
                    )}
                    <p className="mt-4 text-sm text-muted-foreground">
                      Registration is handled by Admin IT. Equipment stays
                      pending until its controller sends a heartbeat.
                    </p>
                  </section>
                  <section className="surface">
                    <SectionTitle
                      title="Monitoring coverage"
                      subtitle="A value appears only after the matching sensor reports it."
                    />
                    <div className="sensor-scope-grid">
                      {[
                        ["Water level", "Reservoir availability"],
                        ["Light", "Unexpected chamber light"],
                        ["Temperature & humidity", "Growing conditions"],
                        ["Water flow", "Irrigation delivery"],
                        ["Pump", "Pump operating state"],
                        ["Room", "Ambient environment"],
                        ["Trays", "Tray position and condition"],
                        ["Local display", "On-device status and warning message"],
                      ].map(([name, purpose]) => (
                        <div key={name}>
                          <span className="summary-icon"><Cpu size={18} /></span>
                          <strong>{name}</strong>
                          <small>{purpose}</small>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
              {page === "review" && (
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
              {page === "system" && profile.role === "admin" && (
                <section className="surface">
                  <SectionTitle
                    title="Admin IT setup"
                    subtitle="Admin IT registers equipment and provisions operator access."
                  />
                  <div className="unavailable-action">
                    <span>
                      <strong>Register an operator</strong>
                      <small>
                        Account provisioning is not connected yet. This action
                        will require an invitation, role assignment, and an
                        auditable acceptance step.
                      </small>
                    </span>
                    <Btn variant="outline" disabled>
                      Register operator
                    </Btn>
                  </div>
                </section>
              )}
              {page === "review" && (
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
                  <div className="evaluation-guide">
                    <div>
                      <p className="role-kicker">Rating basis</p>
                      <h3>Use the same five-point rubric for every batch</h3>
                      <div
                        className="rating-rubric"
                        aria-label="Evaluation rating guide"
                      >
                        {[
                          [1, "Poor"],
                          [2, "Fair"],
                          [3, "Good"],
                          [4, "Very good"],
                          [5, "Excellent"],
                        ].map(([value, label]) => (
                          <span key={value}>
                            <strong>{value}</strong>
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="credential-note">
                      <ShieldCheck size={20} />
                      <div>
                        <strong>Evaluator qualification</strong>
                        <p>
                          Credential verification is not recorded yet.
                          Certification requirements must be approved before
                          this can be treated as verified.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="table-toolbar">
                    <label className="search-field">
                      <Search size={17} />
                      <input
                        aria-label="Search evaluations"
                        placeholder="Search batch or observation…"
                        value={evaluationQuery}
                        onChange={(event) =>
                          setEvaluationQuery(event.target.value)
                        }
                      />
                    </label>
                    <select
                      className="filter-select"
                      aria-label="Evaluation batch filter"
                      value={evaluationBatch}
                      onChange={(event) =>
                        setEvaluationBatch(event.target.value)
                      }
                    >
                      <option value="all">All operators & batches</option>
                      {data.batches.map((batch) => (
                        <option key={batch.id} value={batch.id}>
                          Operator #{batch.owner_id} · {batch.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  {table(
                    [
                      "Owner",
                      "Batch",
                      "Rating",
                      "Comments",
                      "Submitted",
                      "Details",
                    ],
                    evaluationRows.map((evaluation) => {
                      const batch = data.batches.find(
                        (item) => item.id === evaluation.batch_id,
                      );
                      return [
                        batch
                          ? `Operator #${batch.owner_id}`
                          : "Unknown operator",
                        <button
                          className="table-link"
                          onClick={() =>
                            batch && open({ kind: "batch-details", batch })
                          }
                        >
                          {batchName(evaluation.batch_id)}
                        </button>,
                        <Rating value={evaluation.rating} />,
                        evaluation.comments,
                        date(evaluation.created_at),
                        <button
                          className="table-link"
                          onClick={() =>
                            open({
                              kind: "evaluation-details",
                              evaluation,
                            })
                          }
                        >
                          View <ChevronRight size={14} />
                        </button>,
                      ];
                    }),
                    "No evaluations submitted yet.",
                  )}
                </section>
              )}
              {page === "system" && operator && (
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
              {page === "system" && (
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
              {page === "system" && operator && (
                <section className="surface">
                  <SectionTitle
                    title="Evaluator access & invitations"
                    subtitle="Current grants require an existing account. Pre-account invitation delivery is not connected yet."
                    action={
                      <Btn onClick={() => open({ kind: "access" })}>
                        <Plus size={16} />
                        Grant existing account
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
                  <div className="unavailable-action mt-4">
                    <span>
                      <strong>Invite before account creation</strong>
                      <small>
                        This will become available after invitation delivery and
                        acceptance tracking are implemented.
                      </small>
                    </span>
                    <Btn variant="outline" disabled>
                      Send invitation
                    </Btn>
                  </div>
                </section>
              )}
              {page === "settings" && (
                <div className="grid gap-5 xl:grid-cols-2">
                  <section className="surface">
                    <PersonalDetails
                      editing
                      identityLocked
                      profile={profile}
                      onRequestSupport={() => open({ kind: "support" })}
                      onSaved={(next) => {
                        onProfile(next);
                        setToast("Contact details saved.");
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
                  <section className="surface">
                    <SectionTitle
                      title="Help & support"
                      subtitle="Share the affected screen and what you were trying to do."
                    />
                    <Btn variant="outline" onClick={() => open({ kind: "support" })}>
                      <LifeBuoy size={16} />
                      Request support
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
          {nav.slice(4).map((item) => (
            <button
              key={item.key}
              className="more-nav-item"
              onClick={() => navigate(item.key)}
            >
              <item.icon size={19} />
              {item.title}
            </button>
          ))}
          <button
            className="more-nav-item"
            onClick={() => {
              setMenu(false);
              open({ kind: "help" });
            }}
          >
            <HelpCircle size={19} />
            Help & role guide
          </button>
        </div>
      </Modal>
      <Modal
        open={!!dialog}
        onClose={close}
        title={
          dialog?.kind === "signout"
            ? "Are you sure you want to sign out?"
            : dialog?.kind === "batch-details"
              ? dialog.batch!.code
              : dialog?.kind === "evaluation-details"
                ? `Evaluation · ${batchName(dialog.evaluation!.batch_id)}`
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
                    support: "Request support",
                    "incident-report": "Report current situation",
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
              Use the five goal-based areas to monitor today, run production,
              respond to alerts, review evidence, and manage the system.
            </p>
            <p>
              Operators manage production records and evaluator access.
              Evaluators independently review shared evidence and submit a
              human assessment without changing machine readings.
            </p>
            <p>For device or account access, contact your system operator. Sample records are labelled and saved in the workspace.</p>
          </div>
        )}
        {dialog?.kind === "support" && (
          <div className="space-y-4">
            <div className="unavailable-action">
              <LifeBuoy size={22} />
              <span>
                <strong>Support submission is not connected yet</strong>
                <small>
                  The request form will be enabled after an Admin IT support
                  destination and response process are configured.
                </small>
              </span>
            </div>
            <label className="field">
              Affected area
              <select disabled defaultValue="">
                <option value="">Select an area…</option>
                <option>Production</option>
                <option>Alerts</option>
                <option>Review</option>
                <option>Sensors & equipment</option>
                <option>Account access</option>
              </select>
            </label>
            <label className="field">
              What happened?
              <textarea disabled rows={4} placeholder="Describe the problem and expected result" />
            </label>
            <Btn disabled className="w-full">Send support request</Btn>
          </div>
        )}
        {dialog?.kind === "incident-report" && (
          <div className="space-y-5">
            <div className="unavailable-action">
              <ShieldCheck size={22} />
              <span>
                <strong>UI draft only</strong>
                <small>
                  Incident submission is not connected yet. You can review the
                  required information, but no report will be saved.
                </small>
              </span>
            </div>
            <ol className="sop-steps" aria-label="Incident response SOP">
              <li><strong>1. Describe</strong><span>State the current problem.</span></li>
              <li><strong>2. Locate</strong><span>Specify the chamber, fan, seal, tray, or water source.</span></li>
              <li><strong>3. Link</strong><span>Connect the affected batch and equipment serial number.</span></li>
              <li><strong>4. Escalate</strong><span>Record the safe response and notify the responsible role.</span></li>
            </ol>
            <label className="field">
              Current situation
              <textarea rows={3} placeholder="What is happening now?" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field">
                Affected location or component
                <input
                  list="incident-components"
                  placeholder="Type or select, for example 3D fan"
                />
                <datalist id="incident-components">
                  <option value="3D fan" />
                  <option value="Chamber door or seal" />
                  <option value="Water reservoir" />
                  <option value="Pump" />
                  <option value="Room" />
                  <option value="Tray" />
                </datalist>
              </label>
              <label className="field">
                Affected batch
                <input
                  list="incident-batches"
                  placeholder="Type a batch code or leave unlinked"
                />
                <datalist id="incident-batches">
                  {data.batches.map((batch) => (
                    <option key={batch.id} value={batch.code} />
                  ))}
                </datalist>
              </label>
            </div>
            <label className="field">
              Risk category
              <select defaultValue="">
                <option value="" disabled>Select a risk…</option>
                <option>Pests or external contamination</option>
                <option>Water contamination</option>
                <option>Compliance risk</option>
                <option>Light leak</option>
                <option>Equipment problem</option>
              </select>
            </label>
            <label className="field">
              Screen or LCD message
              <input placeholder="Copy the exact message, or write None" />
            </label>
            <label className="field">
              Immediate safe action taken
              <textarea rows={3} placeholder="What was checked, isolated, or escalated?" />
            </label>
            <Btn disabled className="w-full">Submit incident report</Btn>
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
            <p className="text-sm font-semibold">
              {dialog.alert!.batch_id
                ? `Batch ${batchName(dialog.alert!.batch_id)}`
                : "No batch is linked to this alert"}
            </p>
            <dl className="detail-grid">
              <div>
                <dt>Category</dt>
                <dd>{dialog.alert!.category.replaceAll("_", " ")}</dd>
              </div>
              <div>
                <dt>Severity</dt>
                <dd>{dialog.alert!.severity}</dd>
              </div>
            </dl>
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
        {dialog?.kind === "evaluation-details" && (
          <div className="space-y-5">
            <dl className="detail-grid">
              <div>
                <dt>Batch</dt>
                <dd>{batchName(dialog.evaluation!.batch_id)}</dd>
              </div>
              <div>
                <dt>Human assessment</dt>
                <dd><Rating value={dialog.evaluation!.rating} /></dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{date(dialog.evaluation!.created_at)}</dd>
              </div>
              <div>
                <dt>Evaluator qualification</dt>
                <dd>Not yet verified</dd>
              </div>
            </dl>
            <section className="rounded-xl bg-secondary p-4">
              <h3 className="font-semibold">Observations</h3>
              <p className="mt-1 text-sm">
                {dialog.evaluation!.comments || "No observations provided."}
              </p>
            </section>
            <div className="unavailable-action">
              <span>
                <strong>Edit or delete evaluation</strong>
                <small>
                  These actions remain unavailable until audit-history and
                  correction rules are implemented.
                </small>
              </span>
              <div className="flex gap-2">
                <Btn variant="outline" disabled>Edit</Btn>
                <Btn variant="outline" disabled>Delete</Btn>
              </div>
            </div>
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
                  const normalizedCode = values.code.trim().toLowerCase();
                  if (
                    data.batches.some(
                      (batch) => batch.code.trim().toLowerCase() === normalizedCode,
                    )
                  ) {
                    setDialogError(
                      "That batch code already exists. Use a unique code before saving.",
                    );
                    return;
                  }
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
function Rating({ value }: { value: number }) {
  return (
    <span className="rating-display" aria-label={`${value} out of 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          size={15}
          fill={index < value ? "currentColor" : "none"}
          aria-hidden="true"
        />
      ))}
      <span>{value}/5</span>
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
  const pageSize = 6;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  if (!rows.length) return <Empty text={empty} />;
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);
  return (
    <>
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
            {visibleRows.map((row, index) => (
              <tr key={(page - 1) * pageSize + index}>
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
      {pageCount > 1 && (
        <nav className="table-pagination" aria-label="Table pages">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map(
            (number) => (
              <button
                key={number}
                aria-current={page === number ? "page" : undefined}
                onClick={() => setPage(number)}
              >
                {number}
              </button>
            ),
          )}
          <button
            disabled={page === pageCount}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </>
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
        {fields.map((f) =>
          f.type === "rating" ? (
            <fieldset className="field" key={f.name}>
              <legend>{f.label}</legend>
              <div className="rating-picker">
                {[1, 2, 3, 4, 5].map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name={f.name}
                      value={value}
                      required={f.required !== false}
                      defaultChecked={f.value === String(value)}
                    />
                    <Star size={21} aria-hidden="true" />
                    <span>{value}</span>
                  </label>
                ))}
              </div>
              <small className="text-muted-foreground">
                1 Poor · 2 Fair · 3 Good · 4 Very good · 5 Excellent
              </small>
            </fieldset>
          ) : (
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
          ),
        )}
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
            label: "Human assessment",
            type: "rating",
          },
          {
            name: "comments",
            label: "Observations or disagreement with machine data",
            type: "textarea",
          },
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
