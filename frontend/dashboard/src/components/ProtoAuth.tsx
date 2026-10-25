import { useEffect, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff, ArrowLeft, X, Mail, LoaderCircle } from "lucide-react";
import { supabase } from "../supabase";
import { errorMessage } from "../data/workspace";
import { Logo, Btn, GoogleIcon } from "./ProtoPrimitives";
import { useDialog } from "./useDialog";

export type AuthMode =
  | "login"
  | "register"
  | "verify"
  | "reset"
  | "verify-recovery"
  | "new-password";
export function ProtoAuth({
  initialMode = "login",
  isModal = false,
  operatorOnly = false,
  onClose,
  onSuccess,
}: {
  initialMode?: AuthMode;
  isModal?: boolean;
  operatorOnly?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const ref = useDialog(isModal, () => {
    if (!busy) onClose();
  });
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((x) => x - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  const verification = mode === "verify" || mode === "verify-recovery";
  const title = {
    login: operatorOnly ? "Operator sign in" : "Welcome back",
    register: "Create your account",
    verify: "Check your email",
    reset: "Reset your password",
    "verify-recovery": "Check your email",
    "new-password": "Choose a new password",
  }[mode];
  function switchMode(next: AuthMode) {
    setMode(next);
    setError("");
    setNotice("");
    setPassword("");
    setConfirm("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const address = email.trim().toLowerCase();
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: address,
          password,
        });
        if (error) {
          if (error.code === "email_not_confirmed") {
            setMode("verify");
            setNotice(
              "Verify your email to continue. You can request a new code below.",
            );
            return;
          }
          throw error;
        }
        onSuccess();
      } else if (mode === "register") {
        if (password !== confirm) throw new Error("Passwords do not match.");
        const { data, error } = await supabase.auth.signUp({
          email: address,
          password,
          options: { emailRedirectTo: `${location.origin}/dashboard` },
        });
        if (error) throw error;
        if (data.user?.identities?.length === 0)
          throw new Error(
            "An account already exists. Sign in or reset your password.",
          );
        setPassword("");
        setConfirm("");
        setCooldown(60);
        if (data.session) onSuccess();
        else setMode("verify");
      } else if (verification) {
        const { error } = await supabase.auth.verifyOtp({
          email: address,
          token: code.trim(),
          type: mode === "verify" ? "signup" : "recovery",
        });
        if (error) throw error;
        if (mode === "verify") onSuccess();
        else setMode("new-password");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(address, {
          redirectTo: `${location.origin}/reset-password`,
        });
        if (error) throw error;
        setMode("verify-recovery");
        setCooldown(60);
      } else {
        if (password !== confirm) throw new Error("Passwords do not match.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setPassword("");
        setConfirm("");
        onSuccess();
      }
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "verify"
          ? await supabase.auth.resend({
              type: "signup",
              email: email.trim(),
              options: { emailRedirectTo: `${location.origin}/dashboard` },
            })
          : await supabase.auth.resetPasswordForEmail(email.trim(), {
              redirectTo: `${location.origin}/reset-password`,
            });
      if (result.error) throw result.error;
      setCooldown(60);
      setNotice("A new email is on its way.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}${operatorOnly ? "/operator" : "/dashboard"}`,
        },
      });
      if (error) throw error;
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  const content = (
    <>
      <div className="flex items-center justify-between">
        <a href="/" aria-label="SproutSync home">
          <Logo className="h-16 w-16" />
        </a>
        <button
          onClick={onClose}
          disabled={busy}
          className="icon-button"
          aria-label={isModal ? "Close sign in" : "Back to home"}
        >
          {isModal ? <X size={20} /> : <ArrowLeft size={20} />}
        </button>
      </div>
      <h1 id="auth-title" className="mt-4 text-3xl font-bold tracking-tight">
        {title}
      </h1>
      <p className="mt-2 mb-6 text-sm text-muted-foreground">
        {verification
          ? `Enter the verification code sent to ${email}. Check your spam folder too.`
          : mode === "register"
            ? "Start your SproutSync journey."
            : mode === "reset"
              ? "Enter your account email to receive a reset code."
              : mode === "new-password"
                ? "Use at least 8 characters for your new password."
                : "Sign in to your growing workspace."}
      </p>
      {verification && <Mail className="mb-5 h-9 w-9 text-primary" />}
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          {!verification && mode !== "new-password" && (
            <label className="field">
              Email address
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@gmail.com"
              />
            </label>
          )}
          {verification && (
            <label className="field">
              Verification code
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6,8}"
                minLength={6}
                maxLength={8}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="text-center text-2xl tracking-[.3em]"
              />
            </label>
          )}
          {["login", "register", "new-password"].includes(mode) && (
            <>
              <label className="field">
                Password
                <span className="relative block">
                  <input
                    className="pr-12"
                    type={visible ? "text" : "password"}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={mode === "login" ? 1 : 8}
                    maxLength={128}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1 icon-button"
                    aria-label={visible ? "Hide password" : "Show password"}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>
              {mode !== "login" && (
                <label className="field">
                  Confirm password
                  <input
                    type={visible ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </label>
              )}
            </>
          )}
          {mode === "login" && (
            <button
              type="button"
              onClick={() => switchMode("reset")}
              className="text-sm font-semibold text-primary"
            >
              Forgot password?
            </button>
          )}
          {error && (
            <p role="alert" className="feedback-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="feedback-success">
              {notice}
            </p>
          )}
          <Btn type="submit" disabled={busy} className="w-full">
            {busy && <LoaderCircle size={17} className="animate-spin" />}
            {busy
              ? "Please wait…"
              : verification
                ? "Verify email"
                : mode === "register"
                  ? "Create account"
                  : mode === "reset"
                    ? "Send reset code"
                    : mode === "new-password"
                      ? "Save password"
                      : "Sign in"}
          </Btn>
        </fieldset>
      </form>
      {verification && (
        <div className="mt-4 flex justify-between gap-3 text-sm">
          <button
            disabled={busy || cooldown > 0}
            onClick={resend}
            className="text-primary disabled:opacity-50"
          >
            {cooldown ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
          <button disabled={busy} onClick={() => switchMode("login")}>
            Back to sign in
          </button>
        </div>
      )}
      {["login", "register"].includes(mode) && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or continue with
            <span className="h-px flex-1 bg-border" />
          </div>
          <Btn
            variant="outline"
            disabled={busy}
            onClick={google}
            className="w-full"
          >
            <GoogleIcon />
            Google
          </Btn>
          {!operatorOnly && (
            <p className="mt-5 text-center text-sm text-muted-foreground">
              {mode === "login"
                ? "New to SproutSync?"
                : "Already have an account?"}{" "}
              <button
                disabled={busy}
                onClick={() =>
                  switchMode(mode === "login" ? "register" : "login")
                }
                className="font-semibold text-primary"
              >
                {mode === "login" ? "Create account" : "Sign in"}
              </button>
            </p>
          )}
        </>
      )}
      {mode === "reset" && (
        <button
          className="mt-4 text-sm text-primary"
          onClick={() => switchMode("login")}
        >
          Back to sign in
        </button>
      )}
    </>
  );
  if (!isModal)
    return (
      <main className="account-page">
        <div className="account-card">{content}</div>
      </main>
    );
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <motion.div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="account-card max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        {content}
      </motion.div>
    </div>
  );
}
