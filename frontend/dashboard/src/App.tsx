import { useEffect, useState, type FormEvent } from 'react';

type DialogMode = 'signin' | 'signup' | null;

type Feature = {
  icon: FeatureIconName;
  title: string;
  description: string;
};

type FeatureIconName = 'water' | 'batch' | 'conditions' | 'offline' | 'usage' | 'alert';

const features: Feature[] = [
  {
    icon: 'water',
    title: 'Automatic watering',
    description:
      'Waters each tray one by one on a set schedule, checks it drains properly, then moves to the next — hands-free.',
  },
  {
    icon: 'batch',
    title: 'Track every batch',
    description:
      'See where each batch is in its journey — from soaking to harvest-ready — in a single, easy-to-read view.',
  },
  {
    icon: 'conditions',
    title: 'Live condition checks',
    description:
      'Keeps tabs on temperature, humidity, water levels, and more so your sprouts always have the right environment.',
  },
  {
    icon: 'offline',
    title: 'Works without internet',
    description:
      'If the connection drops, SproutSync keeps tracking everything on its own — and catches up the moment you are back online.',
  },
  {
    icon: 'usage',
    title: 'Water use tracking',
    description:
      'Logs how much water each tray uses so you can manage resources wisely and review water use alongside your yield.',
  },
  {
    icon: 'alert',
    title: 'Smart alerts',
    description:
      'Sends a heads-up the moment something needs attention — like a low water tank, a drainage issue, or an offline device.',
  },
];

/**
 * Renders the public product landing page and its lightweight onboarding actions.
 */
export function App() {
  const pathname = window.location.pathname;

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return <Workspace role="admin" />;
  }

  if (pathname === '/grower' || pathname.startsWith('/grower/')) {
    return <Workspace role="grower" />;
  }

  return <LandingPage />;
}

/**
 * Renders the public marketing page while keeping its state isolated from
 * authenticated workspaces.
 */
type WorkspaceRole = 'admin' | 'grower';

type WorkspaceConfig = {
  label: string;
  title: string;
  subtitle: string;
  nav: string[];
  accent: string;
};

const workspaceConfig: Record<WorkspaceRole, WorkspaceConfig> = {
  admin: {
    label: 'Admin workspace',
    title: 'System overview',
    subtitle: 'Keep every device, grower, and batch moving safely.',
    nav: ['Overview', 'Devices', 'Growers', 'Batches', 'Alerts', 'Settings'],
    accent: 'admin',
  },
  grower: {
    label: 'Grower workspace',
    title: 'Good morning, grower',
    subtitle: 'Here is everything happening in your growing chamber today.',
    nav: ['Overview', 'My batches', 'Watering', 'Conditions', 'Alerts'],
    accent: 'grower',
  },
};

/**
 * Renders a role-specific workspace with a separate login gate and navigation.
 */
function Workspace({ role }: { role: WorkspaceRole }) {
  const config = workspaceConfig[role];
  const [authenticated, setAuthenticated] = useState(false);
  const [activeNav, setActiveNav] = useState(config.nav[0]);

  if (!authenticated) {
    return <WorkspaceLogin role={role} onContinue={() => setAuthenticated(true)} />;
  }

  return (
    <div className={`workspace-shell workspace-${config.accent}`}>
      <aside className="workspace-sidebar">
        <a className="workspace-brand" href="/" aria-label="Return to SproutSync home">
          <SproutLogo />
          <span>SproutSync</span>
        </a>
        <div className="workspace-role">{config.label}</div>
        <nav className="workspace-nav" aria-label={`${role} navigation`}>
          {config.nav.map((item, index) => (
            <button className={activeNav === item ? 'active' : ''} key={item} onClick={() => setActiveNav(item)}>
              <WorkspaceNavIcon index={index} />
              {item}
            </button>
          ))}
        </nav>
        <button className="workspace-signout" onClick={() => setAuthenticated(false)}>
          <span>↪</span> Sign out
        </button>
      </aside>
      <main className="workspace-main">
        <header className="workspace-header">
          <div>
            <span className="workspace-breadcrumb">SproutSync / {config.label}</span>
            <h1>{config.title}</h1>
            <p>{config.subtitle}</p>
          </div>
          <div className="workspace-user">
            <span className="preview-pill">Preview data</span>
            <span className="user-avatar">{role === 'admin' ? 'AD' : 'GR'}</span>
            <span className="user-name">{role === 'admin' ? 'Admin user' : 'Grower user'}</span>
          </div>
        </header>
        {role === 'admin' ? <AdminOverview activeNav={activeNav} /> : <GrowerOverview activeNav={activeNav} />}
      </main>
    </div>
  );
}

/**
 * Displays the dedicated entry screen for each role before Google session
 * enforcement is enabled against the live `/auth/me` response.
 */
function WorkspaceLogin({ role, onContinue }: { role: WorkspaceRole; onContinue: () => void }) {
  const isAdmin = role === 'admin';
  /**
   * Starts the shared Google OAuth flow for the selected workspace.
   */
  function startWorkspaceAuth() {
    window.location.assign('/api/v1/auth/google');
  }

  return (
    <main className={`workspace-login workspace-${role}`}>
      <div className="workspace-login-card">
        <a className="workspace-brand centered" href="/" aria-label="Return to SproutSync home">
          <SproutLogo /><span>SproutSync</span>
        </a>
        <span className="workspace-login-kicker">{isAdmin ? 'Admin access' : 'Grower access'}</span>
        <h1>{isAdmin ? 'Welcome to command center' : 'Welcome back, grower'}</h1>
        <p>{isAdmin ? 'Manage devices, people, and system health from one secure workspace.' : 'Follow your batches, conditions, and watering schedule in one calm view.'}</p>
        <button className="google-login-button" onClick={startWorkspaceAuth}><GoogleIcon /> Continue with Google <ArrowIcon /></button>
        <button className="preview-login-button" onClick={onContinue}>Preview dashboard</button>
        <small>Google authentication is required for {isAdmin ? 'administrators' : 'growers'}.</small>
        <a className="back-home" href="/">← Back to SproutSync home</a>
      </div>
    </main>
  );
}

/**
 * Provides the admin overview cards and system monitoring panels.
 */
function AdminOverview({ activeNav }: { activeNav: string }) {
  if (activeNav !== 'Overview') return <WorkspacePlaceholder title={activeNav} role="admin" />;
  return (
    <div className="dashboard-content">
      <div className="dashboard-toolbar"><span className="live-status"><i /> All systems operational</span><button className="dashboard-action">+ Add device</button></div>
      <section className="metric-grid">
        <MetricCard label="Active devices" value="12" detail="+2 this month" icon="▣" tone="green" />
        <MetricCard label="Active growers" value="28" detail="+8% this month" icon="♧" tone="blue" />
        <MetricCard label="Batches growing" value="64" detail="Across 12 devices" icon="◌" tone="mint" />
        <MetricCard label="Open alerts" value="3" detail="2 need attention" icon="!" tone="orange" />
      </section>
      <section className="dashboard-columns">
        <div className="panel panel-wide"><PanelHeading title="Device health" action="View all" /><div className="device-list"><DeviceRow name="Chamber A-01" status="Healthy" detail="Last seen 2 min ago" value="4 trays" tone="healthy" /><DeviceRow name="Chamber A-02" status="Healthy" detail="Last seen 5 min ago" value="6 trays" tone="healthy" /><DeviceRow name="Chamber B-01" status="Needs attention" detail="Low water level" value="3 trays" tone="warning" /></div></div>
        <div className="panel"><PanelHeading title="Recent alerts" action="View alerts" /><AlertItem title="Low water level" detail="Chamber B-01 · 12 min ago" tone="warning" /><AlertItem title="Batch ready to harvest" detail="Tray A-01-03 · 1 hr ago" tone="success" /><AlertItem title="Device back online" detail="Chamber C-02 · 3 hrs ago" tone="info" /></div>
      </section>
    </div>
  );
}

/**
 * Provides the grower overview cards and batch monitoring panels.
 */
function GrowerOverview({ activeNav }: { activeNav: string }) {
  if (activeNav !== 'Overview') return <WorkspacePlaceholder title={activeNav} role="grower" />;
  return (
    <div className="dashboard-content">
      <div className="dashboard-toolbar"><span className="live-status"><i /> Chamber A-01 is online</span><button className="dashboard-action">+ New batch</button></div>
      <section className="metric-grid">
        <MetricCard label="Growing batches" value="8" detail="3 ready this week" icon="◌" tone="green" />
        <MetricCard label="Water used today" value="18.4 L" detail="12% less than average" icon="♢" tone="blue" />
        <MetricCard label="Avg. temperature" value="24.6°" detail="Within ideal range" icon="°" tone="mint" />
        <MetricCard label="Your alerts" value="1" detail="Low water level" icon="!" tone="orange" />
      </section>
      <section className="dashboard-columns">
        <div className="panel panel-wide"><PanelHeading title="Your active batches" action="View all" /><div className="batch-list"><BatchRow code="B-2408" type="Mung beans" stage="Growing · Day 3" progress={68} eta="Harvest in 2 days" /><BatchRow code="B-2407" type="Mung beans" stage="Ready to harvest" progress={100} eta="Ready now" /><BatchRow code="B-2409" type="Mung beans" stage="Rinsing · Day 1" progress={24} eta="Harvest in 4 days" /></div></div>
        <div className="panel"><PanelHeading title="Today’s schedule" action="View schedule" /><ScheduleItem time="08:00" title="Morning watering" detail="3 trays · 1.8 L" done /><ScheduleItem time="12:00" title="Condition check" detail="Temperature and humidity" /><ScheduleItem time="18:00" title="Evening watering" detail="3 trays · 1.8 L" /></div>
      </section>
    </div>
  );
}

/** Shows a consistent empty state for workspace sections not yet connected. */
function WorkspacePlaceholder({ title, role }: { title: string; role: WorkspaceRole }) {
  return <div className="workspace-placeholder"><span className="placeholder-icon">◌</span><h2>{title}</h2><p>The {role} {title.toLowerCase()} workspace is ready for the next API slice.</p><button className="dashboard-action">Return to overview</button></div>;
}

/** Renders a compact summary metric used by both role dashboards. */
function MetricCard({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: string; tone: string }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>;
}

/** Renders a dashboard section title with a lightweight action link. */
function PanelHeading({ title, action }: { title: string; action: string }) {
  return <div className="panel-heading"><h2>{title}</h2><button>{action} →</button></div>;
}

/** Renders a device health row for the admin workspace. */
function DeviceRow({ name, status, detail, value, tone }: { name: string; status: string; detail: string; value: string; tone: string }) {
  return <div className="device-row"><span className={`device-status ${tone}`} /><div><strong>{name}</strong><small>{detail}</small></div><span className={`row-status ${tone}`}>{status}</span><b>{value}</b></div>;
}

/** Renders an alert row with severity styling. */
function AlertItem({ title, detail, tone }: { title: string; detail: string; tone: string }) {
  return <div className="alert-item"><span className={`alert-dot ${tone}`} /><div><strong>{title}</strong><small>{detail}</small></div></div>;
}

/** Renders a batch progress row for the grower workspace. */
function BatchRow({ code, type, stage, progress, eta }: { code: string; type: string; stage: string; progress: number; eta: string }) {
  return <div className="batch-row"><span className="batch-mark">♧</span><div className="batch-details"><strong>{code} · {type}</strong><small>{stage}</small><span className="progress-track"><i style={{ width: `${progress}%` }} /></span></div><b>{eta}</b></div>;
}

/** Renders a scheduled watering or inspection activity. */
function ScheduleItem({ time, title, detail, done = false }: { time: string; title: string; detail: string; done?: boolean }) {
  return <div className={`schedule-item ${done ? 'done' : ''}`}><time>{time}</time><span className="schedule-line" /><div><strong>{title}</strong><small>{detail}</small></div><span className="schedule-check">{done ? '✓' : '○'}</span></div>;
}

/** Draws the navigation symbol for a workspace menu item. */
function WorkspaceNavIcon({ index }: { index: number }) {
  return <span className="nav-icon" aria-hidden="true">{['⌂', '▣', '♧', '◌', '!', '⚙'][index] ?? '•'}</span>;
}

/**
 * Closes the authentication dialog and clears its transient status message.
 */


function LandingPage() {
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [apiStatus, setApiStatus] = useState('Checking local system');
  const [notice, setNotice] = useState('');

  /**
   * Checks the local API without making the marketing page depend on backend availability.
   */
  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/v1/health', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Health check failed');
        const data = (await response.json()) as { status?: string };
        setApiStatus(data.status === 'ok' ? 'System ready' : 'System unavailable');
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setApiStatus('Local preview mode');
      });

    return () => controller.abort();
  }, []);

  /**
   * Opens the selected authentication dialog and moves keyboard focus to its form.
   */
  function openDialog(mode: Exclude<DialogMode, null>) {
    setDialogMode(mode);
    setNotice('');
  }

  function closeDialog() {
    setDialogMode(null);
    setNotice('');
  }

  /**
   * Presents the next-step message for the mobile application call to action.
   */
  function showMobileNotice() {
    setNotice('The mobile app download will be available when the first device build is released.');
  }

  /**
   * Handles the prototype authentication form without pretending an account was created.
   */
  function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('Account services are being connected in the next development slice.');
  }

  /**
   * Starts the configured Google OAuth flow through the backend.
   */
  function startGoogleAuth() {
    window.location.assign('/api/v1/auth/google');
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="SproutSync home">
          <SproutLogo />
          <span>SproutSync</span>
        </a>
        <nav className="header-actions" aria-label="Account actions">
          <button className="text-button" onClick={() => openDialog('signin')}>
            Sign in
          </button>
          <button className="primary-button compact" onClick={() => openDialog('signup')}>
            Sign up <ArrowIcon />
          </button>
        </nav>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-copy">
            <span className="eyebrow"><LeafIcon /> Smart Mung Bean Sprout System</span>
            <h1>
              Grow fresh sprouts <span>without the guesswork.</span>
            </h1>
            <p className="hero-description">
              SproutSync automatically waters your mung bean sprouts on a set schedule, keeps an eye on
              growing conditions, and gives you a clear record of every batch — so you can focus on
              growing, not constant monitoring.
            </p>
            <div className="hero-actions">
              <button className="primary-button" onClick={() => openDialog('signup')}>
                Get started <ArrowIcon />
              </button>
              <button className="secondary-button" onClick={showMobileNotice}>
                <PhoneIcon /> Download mobile app
              </button>
            </div>
            <div className="trust-points">
              <span><WifiIcon /> Works without internet</span>
              <span><DropIcon /> Tracks every drop</span>
            </div>
          </div>
          <SproutChamber />
        </section>

        <section className="feature-grid" aria-label="SproutSync features">
          {features.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <span className="feature-icon" aria-hidden="true"><FeatureIcon name={feature.icon} /></span>
              <h2>{feature.title}</h2>
              <p>{feature.description}</p>
            </article>
          ))}
        </section>

        <section className="closing-section">
          <div>
            <h2>Check on your sprouts from anywhere.</h2>
            <p>
              The SproutSync app keeps you in the loop — see how your batches are doing, get alerts, and
              follow your watering schedule right from your phone.
            </p>
            <button className="secondary-button light" onClick={showMobileNotice}>
              <PhoneIcon /> Download mobile app
            </button>
          </div>
          <div className="closing-mark"><SproutLogo /> <strong>SproutSync</strong></div>
        </section>
      </main>

      <footer className="site-footer">
        <span>© 2026 SproutSync · Automated Mung Bean Sprout Production</span>
        <span className="api-indicator"><span className="status-dot" /> {apiStatus}</span>
      </footer>

      {notice && !dialogMode && (
        <div className="notice" role="status">
          {notice}
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button>
        </div>
      )}

      {dialogMode && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeDialog}>
          <div className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="close-button" aria-label="Close dialog" onClick={closeDialog}>×</button>
            <SproutLogo />
            <h2 id="auth-title">{dialogMode === 'signup' ? 'Start growing smarter' : 'Welcome back'}</h2>
            <p>{dialogMode === 'signup' ? 'Create your SproutSync workspace.' : 'Sign in to your SproutSync workspace.'}</p>
            <form onSubmit={handleAuthSubmit}>
              <label htmlFor="email">Email address</label>
              <input id="email" type="email" placeholder="you@example.com" required />
              <label htmlFor="password">Password</label>
              <input id="password" type="password" placeholder="••••••••" minLength={8} required />
              <button className="primary-button full-width" type="submit">
                {dialogMode === 'signup' ? 'Create account' : 'Sign in'} <ArrowIcon />
              </button>
            </form>
            <div className="auth-divider"><span>or</span></div>
            <button className="google-button" type="button" onClick={startGoogleAuth}>
              <GoogleIcon /> Continue with Google
            </button>
            {notice && <p className="dialog-notice" role="status">{notice}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Draws the reusable SproutSync mark without introducing an image dependency. */
function SproutLogo() {
  return <span className="sprout-logo" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M16 25V13M16 17c-4-5-8-5-10-4 1 5 4 7 10 7M16 14c2-6 6-8 10-8 0 6-3 10-10 11" /></svg></span>;
}

/** Draws the arrow used by primary calls to action. */
function ArrowIcon() {
  return <span aria-hidden="true">→</span>;
}

/** Draws the small leaf mark used in the product descriptor. */
function LeafIcon() {
  return <svg className="inline-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M16 4C9 4 4 8 4 15c5 1 11-3 12-11ZM4 15l5-5" /></svg>;
}

/** Draws the phone glyph used for the future mobile app action. */
function PhoneIcon() {
  return <svg className="inline-icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="2.5" width="8" height="15" rx="1.5" /><path d="M9 15h2" /></svg>;
}

/** Draws the offline capability glyph. */
function WifiIcon() {
  return <svg className="inline-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8a10 10 0 0 1 14 0M6 11a6 6 0 0 1 8 0M9 14a2 2 0 0 1 2 0" /></svg>;
}

/** Draws the water-use glyph. */
function DropIcon() {
  return <svg className="inline-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3C8 6 5 9 5 12a5 5 0 0 0 10 0c0-3-3-6-5-9Z" /></svg>;
}

/** Draws the Google brand mark for the OAuth action. */
function GoogleIcon() {
  return <span className="google-icon" aria-hidden="true">G</span>;
}

/** Renders a consistent line icon for each product capability card. */
function FeatureIcon({ name }: { name: FeatureIconName }) {
  const paths = {
    water: <><path d="M10 2C8 5 5 8 5 12a5 5 0 0 0 10 0c0-4-3-7-5-10Z" /><path d="M8 13c.5 1 1 1.5 2 1.5" /></>,
    batch: <><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M3 8h14M7 4v4M13 4v4M7 12h6" /></>,
    conditions: <><circle cx="10" cy="10" r="6.5" /><path d="M10 6v4l3 2M10 2v1M18 10h-1M10 18v-1M2 10h1" /></>,
    offline: <><path d="M3 8a10 10 0 0 1 14 0M6 11a6 6 0 0 1 8 0M9 14a2 2 0 0 1 2 0" /><path d="m3 3 14 14" /></>,
    usage: <><path d="M5 4h10M5 8h10M5 12h6M5 16h5" /><path d="m14 12 3 3-3 3M17 15h-7" /></>,
    alert: <><path d="M10 3 18 17H2L10 3Z" /><path d="M10 8v4M10 14v.5" /></>,
  }[name];
  return <svg viewBox="0 0 20 20">{paths}</svg>;
}

/** Renders the illustrative chamber used in the hero section. */
function SproutChamber() {
  return (
    <div className="chamber-art" role="img" aria-label="Illustration of an automated sprout growing chamber">
      <div className="chamber-top" />
      <div className="chamber-body">
        <div className="tray tray-top"><i /><i /><i /></div>
        <div className="tray tray-middle"><i /><i /><i /></div>
        <div className="tray tray-bottom"><i /><i /><i /></div>
      </div>
      <div className="chamber-controls"><span /><span /><span /></div>
    </div>
  );
}
