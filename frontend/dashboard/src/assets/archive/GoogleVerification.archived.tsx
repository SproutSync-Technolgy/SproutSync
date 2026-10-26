/**
 * ARCHIVED VERIFICATION PROCESS
 * Original location: frontend/dashboard/src/components/GoogleVerification.tsx
 * Archived on: 2026-10-26
 *
 * This file contains the complete multi-attempt OTP and cooldown verification flow
 * that was previously used for email verification. It has been removed from the active
 * user journey and preserved here for future reference or reactivation.
 */

/*
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Mail, CheckCircle2 } from "lucide-react";
import { apiFetch, supabase } from "../../supabase";
import { errorMessage, type Profile } from "../../data/workspace";
import { Btn, Logo } from "../../components/ProtoPrimitives";

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
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  const mountGuard = useRef(false);
  const sendingRef = useRef(false);
  const cooldownKey = `sproutsync_otp_cooldown_until:${profile.email}`;

  async function send() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setBusy(true);
    setError("");

    try {
      const response = await apiFetch("/api/v1/auth/verify/send", {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        if (data.status === "already_verified") {
          onVerified();
          return;
        }
        const waitSeconds = data.retry_after_seconds ?? 60;
        sessionStorage.setItem(cooldownKey, String(Date.now() + waitSeconds * 1000));
        setSent(true);
        setCooldown(waitSeconds);
      } else {
        if (response.status === 429) {
          const waitSeconds = data.retry_after_seconds ?? 60;
          sessionStorage.setItem(cooldownKey, String(Date.now() + waitSeconds * 1000));
          setCooldown(waitSeconds);
          setError(data.message || data.detail || "Rate limit reached. Please wait before requesting another code.");
        } else {
          throw new Error(data.detail || data.message || "Failed to send verification email");
        }
      }
    } catch (apiErr) {
      setError(
        "Verification service is unavailable. Please ensure the SproutSync backend API is running on port 8000."
      );
      sessionStorage.removeItem(cooldownKey);
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (mountGuard.current) return;
    mountGuard.current = true;

    const savedUntil = Number(sessionStorage.getItem(cooldownKey) || 0);
    const remaining = Math.max(0, Math.ceil((savedUntil - Date.now()) / 1000));
    if (remaining > 0) {
      setSent(true);
      setCooldown(remaining);
    } else {
      void send();
    }
  }, []);

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((x) => Math.max(0, x - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function verify(event: FormEvent) {
    event.preventDefault();
    const cleanCode = code.trim();
    if (!cleanCode || busy) return;

    setBusy(true);
    setError("");

    try {
      const response = await apiFetch("/api/v1/auth/verify/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: cleanCode }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        sessionStorage.removeItem(cooldownKey);
        onVerified();
        return;
      }

      if (response.status === 429) {
        setAttemptsRemaining(0);
        setError(data.detail || "Too many failed attempts. Verification locked for 60 seconds.");
      } else {
        const detailMsg = data.detail || "Invalid verification code.";
        setError(detailMsg);
        const match = detailMsg.match(/(\\d+)\\s+attempt/i);
        if (match) {
          setAttemptsRemaining(Number(match[1]));
        }
      }
    } catch {
      setError("Unable to reach verification service. Please verify the backend API is running.");
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
            ? "We sent a 6-digit code to"
            : "Send a verification email to"}{" "}
          <strong className="break-all">{profile.email}</strong>. Enter the code
          here to confirm your account and continue.
        </p>
        <Mail className="my-5 text-primary" size={30} />
        <form className="space-y-4" onSubmit={verify}>
          <label className="field">
            Verification code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\\D/g, ""))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,8}"
              minLength={6}
              maxLength={8}
              placeholder="123456"
              required
              disabled={busy}
            />
          </label>
          {error && (
            <p role="alert" className="feedback-error">
              {error}
            </p>
          )}
          {attemptsRemaining !== null && attemptsRemaining > 0 && (
            <p className="text-xs text-muted-foreground">
              Attempts remaining: <strong>{attemptsRemaining} of 5</strong>
            </p>
          )}
          <Btn type="submit" className="w-full" disabled={busy || code.length < 6}>
            {busy ? "Please wait…" : "Verify email"}
          </Btn>
        </form>
        <div className="mt-4 flex justify-between gap-3 text-sm">
          <button
            type="button"
            disabled={busy || cooldown > 0}
            onClick={send}
            className="text-primary disabled:opacity-50"
          >
            {cooldown ? `Resend in ${cooldown}s` : "Send verification email"}
          </button>
          <button
            type="button"
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
*/
