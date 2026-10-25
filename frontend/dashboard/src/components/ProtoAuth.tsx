import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, X, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { supabase } from '../supabase';
import { Logo, Btn, GoogleIcon } from './ProtoPrimitives';

export type AuthMode = 'login' | 'register';

export function ProtoAuth({
  initialMode = 'login',
  isModal = false,
  onClose,
  onSuccess,
}: {
  initialMode?: AuthMode;
  isModal?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (oauthError) {
        setError(oauthError.message);
        setSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect to Google SSO.');
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    const cleanEmail = email.trim();

    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (signInError) {
          setError(signInError.message);
          setSubmitting(false);
          return;
        }

        setSubmitting(false);
        onSuccess();
      } else {
        // Register mode: default new users as Evaluator
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: name.trim() || undefined,
            },
          },
        });

        setSubmitting(false);

        if (signUpError) {
          setError(signUpError.message);
          return;
        }

        if (data.session) {
          onSuccess();
        } else if (data.user) {
          setMessage('Account created! Please check your email for a confirmation link to complete sign in.');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
      setSubmitting(false);
    }
  }

  const formContent = (
    <div className="w-full max-w-sm">
      {/* Header controls */}
      <div className="mb-6 flex items-center justify-between">
        {!isModal ? (
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Back to home
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <Logo className="h-9 w-9" />
            <span className="text-base font-bold">SproutSync</span>
          </div>
        )}
        {isModal && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Mode Switcher Tabs */}
      <div className="mb-6 grid grid-cols-2 rounded-xl bg-secondary p-1">
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setError(null);
            setMessage(null);
          }}
          className={`rounded-lg py-2 text-sm font-semibold transition ${
            mode === 'login'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('register');
            setError(null);
            setMessage(null);
          }}
          className={`rounded-lg py-2 text-sm font-semibold transition ${
            mode === 'register'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Create account
        </button>
      </div>

      <h1 className="text-2xl font-extrabold tracking-tight">
        {mode === 'login' ? 'Welcome back' : 'Create your account'}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {mode === 'login'
          ? 'Sign in to access your SproutSync chamber dashboard.'
          : 'Sign up to monitor batches, water use, and environmental data.'}
      </p>

      {/* Google SSO Button */}
      <button
        type="button"
        disabled={submitting}
        onClick={handleGoogleSignIn}
        className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-card py-3 text-sm font-semibold transition hover:bg-secondary disabled:opacity-50"
      >
        <GoogleIcon /> Continue with Google
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or {mode === 'login' ? 'sign in' : 'sign up'} with email
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Evaluator Role Notice */}
      {mode === 'register' && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800/40">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          <p>
            New accounts start as <span className="font-semibold">Evaluator</span> (read-only telemetry &amp; evidence). Operational and admin controls are assigned by your system owner.
          </p>
        </div>
      )}

      {/* Inline Feedback Alerts */}
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-600 border border-red-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div
          role="status"
          className="mb-4 flex items-center gap-2 rounded-xl bg-green-50 p-3 text-xs text-green-700 border border-green-200"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Email / Password Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === 'register' && (
          <div>
            <label
              htmlFor="auth-fullname"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Full name
            </label>
            <input
              id="auth-fullname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Xierre Silver"
              className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        )}

        <div>
          <label
            htmlFor="auth-email"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Email address
          </label>
          <input
            id="auth-email"
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div>
          <label
            htmlFor="auth-password"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Password
          </label>
          <input
            id="auth-password"
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <Btn type="submit" disabled={submitting} className="mt-2 w-full py-3">
          {submitting
            ? mode === 'login'
              ? 'Signing in…'
              : 'Creating account…'
            : mode === 'login'
            ? 'Sign in'
            : 'Create account'}
        </Btn>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {mode === 'login' ? 'New to SproutSync? ' : 'Already have an account? '}
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
            setMessage(null);
          }}
          className="font-semibold text-primary hover:underline"
        >
          {mode === 'login' ? 'Create an account' : 'Sign in'}
        </button>
      </p>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          className="relative z-10 w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl sm:p-8"
        >
          {formContent}
        </motion.div>
      </div>
    );
  }

  // Full Split-Screen Layout
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand Side */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-emerald-700 to-green-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <button
          type="button"
          onClick={onClose}
          className="flex w-fit items-center gap-2 text-sm text-emerald-100 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" /> Back to home
        </button>
        <div>
          <Logo className="h-16 w-16" />
          <h2 className="mt-6 text-3xl font-extrabold leading-tight">
            Fresh sprouts,
            <br />
            zero guesswork.
          </h2>
          <p className="mt-3 max-w-sm text-emerald-50">
            Sign in to watch your batches grow and let SproutSync handle the automated watering.
          </p>
        </div>
        <p className="text-sm text-emerald-100">
          Automated mung bean sprout production, tray by tray.
        </p>
      </div>

      {/* Form Side */}
      <div className="flex items-center justify-center bg-background p-6">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          {formContent}
        </motion.div>
      </div>
    </div>
  );
}
