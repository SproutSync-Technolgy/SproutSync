import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Smartphone } from "lucide-react";
import { Logo } from "./ProtoPrimitives";
type Release = {
  available: boolean;
  version: string;
  url: string;
  size_bytes: number;
  sha256: string;
  channel: string;
  platform: string;
};

export function MobileDownload() {
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);
  const started = useRef(false);
  useEffect(() => {
    if (
      !release ||
      started.current ||
      new URLSearchParams(location.search).get("start") !== "1"
    )
      return;
    started.current = true;
    const link = document.createElement("a");
    link.href = release.url;
    link.download = "sproutsync-preview.apk";
    document.body.append(link);
    link.click();
    link.remove();
    history.replaceState({}, "", "/download");
  }, [release]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/downloads/mobile-release.json", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          if (data.available && data.url?.startsWith("/downloads/"))
            setRelease(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  return (
    <main className="account-page">
      <section className="account-card">
        <a href="/" className="table-link mb-6">
          <ArrowLeft size={16} />
          Back to SproutSync
        </a>
        <Logo className="h-20 w-20" />
        <h1 className="mt-5 text-3xl font-bold">SproutSync on the go.</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Monitor your batches, receive in-app alerts, scan your chamber’s QR
          code, and review growing records from your phone.
        </p>
        <div className="my-6 rounded-2xl bg-secondary p-5">
          <Smartphone className="mb-3 text-primary" size={30} />
          <h2 className="font-bold">Android app</h2>
          {loading ? (
            <p className="mt-2 text-sm" role="status">
              Checking the latest build…
            </p>
          ) : release ? (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                {release.channel} · v{release.version} ·{" "}
                {(release.size_bytes / 1024 / 1024).toFixed(1)} MB
              </p>
              <a
                href={release.url}
                download="sproutsync-preview.apk"
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white"
              >
                <Download size={17} />
                Download Android APK
              </a>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Android 7.0 or later on a 64-bit ARM phone. Open the APK on your
                phone and allow installation from your browser when Android
                asks.
              </p>
              <details className="mt-3 text-xs">
                <summary>Build verification</summary>
                <p className="mt-2 break-all">SHA-256: {release.sha256}</p>
              </details>
            </>
          ) : (
            <p className="mt-2 text-sm">
              An Android build is being prepared. You can use the mobile web
              workspace now.
            </p>
          )}
        </div>
        <a className="action-link text-center" href="/mobile">
          Open mobile web workspace
        </a>
        <p className="mt-3 text-xs text-muted-foreground">
          The same SproutSync account works on web and Android. iPhone users can
          use the mobile web workspace.
        </p>
      </section>
    </main>
  );
}
