import { lazy, Suspense, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { MotionConfig } from "motion/react";
import { supabase } from "./supabase";
import { ProtoLanding } from "./components/ProtoLanding";
import { ProtoAuth, type AuthMode } from "./components/ProtoAuth";
import { PersonalDetails } from "./components/PersonalDetails";
// import { GoogleVerification } from "./components/GoogleVerification"; // Archived in src/assets/archive/GoogleVerification.archived.tsx
import { MobileDownload } from "./components/MobileDownload";
import { Logo, Btn } from "./components/ProtoPrimitives";
import {
  errorMessage,
  isOperator,
  isSuperAdmin,
  isEvaluator,
  type Profile,
} from "./data/workspace";
const Workspace = lazy(() => import("./components/Workspace"));

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <SessionRouter />
    </MotionConfig>
  );
}
function SessionRouter() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [recovery, setRecovery] = useState(
    window.location.pathname === "/reset-password",
  );
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const superadminRoute =
    path === "/superadmin" || path.startsWith("/superadmin/");
  const operatorRoute =
    path === "/operator" ||
    path.startsWith("/operator/") ||
    superadminRoute;
  useEffect(() => {
    if (path === "/admin" || path.startsWith("/admin/"))
      window.location.replace("/superadmin");
  }, [path]);
  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!live) return;
      if (error) setError(error.message);
      setSession(data.session);
      setChecking(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, current) => {
      setSession(current);
      setChecking(false);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (!current) setProfile(null);
    });
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    let live = true;
    setError("");
    setProfile(null);
    supabase.rpc("ensure_profile").then(async ({ data, error }) => {
      if (!live) return;
      if (error) setError(error.message);
      else {
        if (isOperator(data as Profile)) {
          const { error: initError } = await supabase.rpc(
            "initialize_workspace",
          );
          if (!live) return;
          if (initError) {
            setError(initError.message);
            return;
          }
        }
        setProfile(data as Profile);
        setAuthMode(null);
      }
    });
    return () => {
      live = false;
    };
  }, [session?.access_token, attempt]);
  async function signOut() {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
    setProfile(null);
    setSession(null);
    window.location.assign(operatorRoute ? "/operator" : "/");
  }
  if (path === "/download") return <MobileDownload />;
  if (checking) return <Loading />;
  if (recovery)
    return (
      <ProtoAuth
        initialMode="new-password"
        onClose={() => {
          setRecovery(false);
          window.history.replaceState({}, "", "/");
        }}
        onSuccess={() => {
          setRecovery(false);
          window.history.replaceState({}, "", "/");
        }}
      />
    );
  if (error)
    return (
      <main className="account-page">
        <div className="account-card">
          <Logo />
          <h1>We couldn’t open your workspace</h1>
          <p role="alert">{error}</p>
          <Btn onClick={() => setAttempt((x) => x + 1)}>Try again</Btn>
          {session && (
            <Btn
              variant="outline"
              onClick={() =>
                void signOut().catch((e) => setError(errorMessage(e)))
              }
            >
              Sign out
            </Btn>
          )}
        </div>
      </main>
    );
  if (session && !profile) return <Loading />;
  if (profile && session) {
    if (superadminRoute && !isSuperAdmin(profile))
      return (
        <main className="account-page">
          <div className="account-card">
            <Logo />
            <h1>Superadmin access required</h1>
            <p>This account does not have Superadmin privileges.</p>
            <a
              className="action-link"
              href={isOperator(profile) ? "/operator" : "/dashboard"}
            >
              Open my workspace
            </a>
            <Btn
              variant="outline"
              onClick={() =>
                void signOut().catch((e) => setError(errorMessage(e)))
              }
            >
              Use another account
            </Btn>
          </div>
        </main>
      );
    if (operatorRoute && !superadminRoute && !isOperator(profile))
      return (
        <main className="account-page">
          <div className="account-card">
            <Logo />
            <h1>Operator access required</h1>
            <p>This account can open the evaluator workspace.</p>
            <a className="action-link" href="/dashboard">
              Open my dashboard
            </a>
            <Btn
              variant="outline"
              onClick={() =>
                void signOut().catch((e) => setError(errorMessage(e)))
              }
            >
              Use another account
            </Btn>
          </div>
        </main>
      );
    if (isSuperAdmin(profile) && !operatorRoute && path !== "/mobile") {
      window.location.replace("/superadmin");
      return <Loading />;
    }
    if (isOperator(profile) && !isSuperAdmin(profile) && !operatorRoute && path !== "/mobile") {
      window.location.replace("/operator");
      return <Loading />;
    }
    // Verification process removed/bypassed. Archived in src/assets/archive/verificationRouting.archived.tsx
    if (!profile.profile_complete)
      return (
        <PersonalDetails
          profile={profile}
          onSaved={setProfile}
          onSignOut={signOut}
        />
      );
    if (!operatorRoute && path === "/")
      window.history.replaceState({}, "", "/dashboard");
    return (
      <Suspense fallback={<Loading />}>
        <Workspace
          profile={profile}
          onProfile={setProfile}
          onSignOut={signOut}
        />
      </Suspense>
    );
  }
  if (operatorRoute || path === "/dashboard" || path === "/mobile")
    return (
      <ProtoAuth
        operatorOnly={operatorRoute}
        onClose={() => window.location.assign("/")}
        onSuccess={() => setAuthMode(null)}
      />
    );
  return (
    <>
      <ProtoLanding
        onSignIn={() => setAuthMode("login")}
        onSignUp={() => setAuthMode("register")}
        onDownload={() => window.location.assign("/download?start=1")}
      />
      {authMode && (
        <ProtoAuth
          isModal
          initialMode={authMode}
          onClose={() => setAuthMode(null)}
          onSuccess={() => setAuthMode(null)}
        />
      )}
    </>
  );
}
function Loading() {
  return (
    <main className="account-page" role="status">
      <div className="flex flex-col items-center gap-4">
        <Logo className="h-20 w-20" />
        <p>Opening SproutSync…</p>
      </div>
    </main>
  );
}
