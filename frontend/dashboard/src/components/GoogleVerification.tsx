import { useEffect, useRef, useState, type FormEvent } from "react";
import { Mail, CheckCircle2 } from "lucide-react";
import { supabase } from "../supabase";
import { errorMessage, type Profile } from "../data/workspace";
import { Btn, Logo } from "./ProtoPrimitives";

export function GoogleVerification({
  profile,
  onVerified,
  onSignOut,
}: {
  profile: Profile;
  onVerified: () => void;
  onSignOut: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const started = useRef(false);
  const storageKey = `sproutsync-verification-${profile.id}`;
  async function send() {
    setBusy(true);
    setError("");
    sessionStorage.setItem(storageKey, String(Date.now()));
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: profile.email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${location.origin}/dashboard`,
        },
      });
      if (error) throw error;
      setSent(true);
      setCooldown(60);
    } catch (e) {
      setError(errorMessage(e));
      sessionStorage.removeItem(storageKey);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const remaining =
      60 -
      Math.floor(
        (Date.now() - Number(sessionStorage.getItem(storageKey) || 0)) / 1000,
      );
    if (remaining > 0) {
      setSent(true);
      setCooldown(remaining);
    } else void send();
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((x) => x - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: profile.email,
        token: code,
        type: "email",
      });
      if (error) throw error;
      sessionStorage.removeItem(storageKey);
      onVerified();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="account-page">
      <div className="account-card">
        <Logo className="h-16 w-16" />
        <p className="mt-5 flex items-center gap-2 text-sm text-primary">
          <CheckCircle2 size={16} />
          Google connected
        </p>
        <h1 className="mt-3 text-2xl font-bold">Verify your email</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {sent
            ? "We sent a code and verification link to"
            : "Send a verification email to"}{" "}
          <strong className="break-all">{profile.email}</strong>. Enter the code
          here or open the link, then review your personal details.
        </p>
        <Mail className="my-5 text-primary" size={30} />
        <form className="space-y-4" onSubmit={verify}>
          <label className="field">
            Verification code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,8}"
              minLength={6}
              maxLength={8}
              required
              disabled={busy}
            />
          </label>
          {error && (
            <p role="alert" className="feedback-error">
              {error}
            </p>
          )}
          <Btn type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : "Verify email"}
          </Btn>
        </form>
        <div className="mt-4 flex justify-between gap-3 text-sm">
          <button
            disabled={busy || cooldown > 0}
            onClick={send}
            className="text-primary disabled:opacity-50"
          >
            {cooldown ? `Resend in ${cooldown}s` : "Send verification email"}
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void onSignOut().catch((e) => setError(errorMessage(e)))
            }
          >
            Use another account
          </button>
        </div>
      </div>
    </main>
  );
}
