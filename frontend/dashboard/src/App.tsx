import { useEffect, useState, type FormEvent } from 'react';

type DialogMode = 'signin' | 'signup' | null;

type Feature = {
  icon: string;
  title: string;
  description: string;
};

const features: Feature[] = [
  {
    icon: '💧',
    title: 'Automatic watering',
    description:
      'Waters each tray one by one on a set schedule, checks it drains properly, then moves to the next — hands-free.',
  },
  {
    icon: '▣',
    title: 'Track every batch',
    description:
      'See where each batch is in its journey — from soaking to harvest-ready — in a single, easy-to-read view.',
  },
  {
    icon: '◌',
    title: 'Live condition checks',
    description:
      'Keeps tabs on temperature, humidity, water levels, and more so your sprouts always have the right environment.',
  },
  {
    icon: '⌁',
    title: 'Works without internet',
    description:
      'If the connection drops, SproutSync keeps tracking everything on its own — and catches up the moment you are back online.',
  },
  {
    icon: '◒',
    title: 'Water use tracking',
    description:
      'Logs how much water each tray uses so you can manage resources wisely and review water use alongside your yield.',
  },
  {
    icon: '!',
    title: 'Smart alerts',
    description:
      'Sends a heads-up the moment something needs attention — like a low water tank, a drainage issue, or an offline device.',
  },
];

/**
 * Renders the public product landing page and its lightweight onboarding actions.
 */
export function App() {
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

  /**
   * Closes the authentication dialog and clears its transient status message.
   */
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
              <span className="feature-icon" aria-hidden="true">{feature.icon}</span>
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
  return <span className="sprout-logo" aria-hidden="true"><span>✦</span></span>;
}

/** Draws the arrow used by primary calls to action. */
function ArrowIcon() {
  return <span aria-hidden="true">→</span>;
}

/** Draws the small leaf mark used in the product descriptor. */
function LeafIcon() {
  return <span aria-hidden="true">♧</span>;
}

/** Draws the phone glyph used for the future mobile app action. */
function PhoneIcon() {
  return <span aria-hidden="true">▯</span>;
}

/** Draws the offline capability glyph. */
function WifiIcon() {
  return <span aria-hidden="true">⌁</span>;
}

/** Draws the water-use glyph. */
function DropIcon() {
  return <span aria-hidden="true">♢</span>;
}

/** Draws the Google brand mark for the OAuth action. */
function GoogleIcon() {
  return <span className="google-icon" aria-hidden="true">G</span>;
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
