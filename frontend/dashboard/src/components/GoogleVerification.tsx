/**
 * VERIFICATION PROCESS REMOVED / COMMENTED OUT
 * Complete active copy archived in: frontend/dashboard/src/assets/archive/GoogleVerification.archived.tsx
 */

import { useEffect } from "react";
import type { Profile } from "../data/workspace";

export function GoogleVerification({
  onVerified,
}: {
  profile: Profile;
  onVerified: () => void;
  onSignOut: () => Promise<void>;
}) {
  // Verification is bypassed. Automatically notify parent as verified.
  useEffect(() => {
    onVerified();
  }, [onVerified]);

  return null;
}

/*
// ============================================================================
// COMMENTED OUT ORIGINAL IMPLEMENTATION (Archived in src/assets/archive/)
// ============================================================================

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Mail, CheckCircle2 } from "lucide-react";
import { apiFetch } from "../supabase";
import { errorMessage, type Profile } from "../data/workspace";
import { Btn, Logo } from "./ProtoPrimitives";

export function _ArchivedGoogleVerification({
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

  return null;
}
*/
