import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { apiFetch, supabase } from "../supabase";
import { apiUrl } from "../config";
import { errorMessage, type Alert, type Device, type Reading, type WorkspaceData } from "./workspace";

export type MQTTStatus = {
  state: string;
  connected: boolean;
  broker_url: string;
  stale_seconds: number;
  history_sample_seconds?: number;
};
export type LatestReading = Omit<Reading, "id">;
type LiveSnapshot = { devices: Device[]; readings: Reading[]; latest_readings?: LatestReading[]; mqtt: MQTTStatus };

async function checkedJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    if (isJson) {
      const body = await response.json().catch(() => null);
      throw new Error(typeof body?.detail === "string" ? body.detail : "Live device service is unavailable. Check that the API is running.");
    }
    throw new Error(
      response.status === 404
        ? "Live telemetry requires the SproutSync backend API."
        : `Live device service returned HTTP ${response.status}.`
    );
  }

  if (!isJson) {
    throw new Error("Live device service is unavailable. Check that the API server is running and configured.");
  }

  return response.json() as Promise<T>;
}

export async function connectDevice(values: { serial_number: string; name: string; topic_prefix: string }) {
  return checkedJson<Device>(await apiFetch("/api/v1/devices/connect", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values), signal: AbortSignal.timeout(10000),
  }));
}

export function mergeReadings(current: Reading[], incoming: Reading[]): Reading[] {
  const rows = new Map(current.map((r) => [r.id, r]));
  for (const row of incoming) rows.set(row.id, row);
  return [...rows.values()].sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at) || b.id - a.id).slice(0, 2000);
}

export function useLiveTelemetry(profileId: number, setData: Dispatch<SetStateAction<WorkspaceData>>) {
  const [mqtt, setMqtt] = useState<MQTTStatus | null>(null);
  const [realtime, setRealtime] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const realtimeRef = useRef(false);
  const [latestReadings, setLatestReadings] = useState<LatestReading[]>([]);
  const [notificationError, setNotificationError] = useState("");

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    let cursor: number | undefined;
    let deviceIds: string | undefined;
    let lastAlertCheck = 0;

    const isLocal = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const hasBackendApi = Boolean(apiUrl) || isLocal;

    const refresh = async () => {
      if (!active) return;
      if (document.visibilityState === "visible") {
        if (Date.now() - lastAlertCheck >= 30000) {
          lastAlertCheck = Date.now();
          // Reconcile missed notifications even when the realtime socket drops.
          void supabase.from("alerts").select("*").order("created_at", {ascending: false}).limit(100).then(({data, error: alertError}) => {
            if (!active) return;
            setNotificationError(alertError ? "Notifications could not be refreshed. Your last saved alerts are shown." : "");
            if (!alertError && data) setData((current) => ({...current, alerts: data as Alert[]}));
          });
        }
        controller = new AbortController();
        const timeout = setTimeout(() => controller?.abort(), 8000);
        try {
          const next = await checkedJson<LiveSnapshot>(await apiFetch(`/api/v1/devices/live${cursor === undefined ? "" : `?after_id=${cursor}`}`, { signal: controller.signal }));
          if (!active) return;
          const nextIds = next.devices.map((d) => d.id).sort((a, b) => a - b).join(",");
          cursor = deviceIds !== undefined && deviceIds !== nextIds ? undefined : Math.max(cursor ?? 0, ...next.readings.map((r) => r.id));
          deviceIds = nextIds;
          setMqtt(next.mqtt);
          setLatestReadings((next.latest_readings ?? []).filter((r) => next.devices.some((d) => d.id === r.device_id)));
          setError("");
          setData((current) => ({
            ...current, devices: next.devices,
            liveReadings: mergeReadings(current.liveReadings, next.readings).filter((r) => next.devices.some((d) => d.id === r.device_id)),
          }));
        } catch (err) {
          if (!active) return;
          // Realtime delivers saved history; it cannot replace the live cache.
          setLatestReadings([]);
          setError(errorMessage(err));
        } finally {
          clearTimeout(timeout);
        }
      }
      if (active) timer = setTimeout(refresh, 2000);
    };

    // The authenticated API serves transient live packets; database push is only for saved averages.
    const channel = supabase.channel(`live-telemetry-${profileId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "telemetry_readings" }, ({ new: row }) => {
        if (!active) return;
        const reading = row as Reading;
        if (!reading.aggregation || reading.aggregation === "raw") return;
        setData((current) => current.devices.some((d) => d.id === reading.device_id)
          ? { ...current, readings: mergeReadings(current.readings, [reading]) } : current);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "telemetry_readings" }, ({ old: row }) => {
        if (!active) return;
        const id = Number(row.id);
        if (!Number.isFinite(id)) return;
        setData((current) => ({ ...current, readings: current.readings.filter((reading) => reading.id !== id) }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, (event) => {
        if (!active) return;
        if (event.eventType === "DELETE") {
          setData((current) => ({ ...current, alerts: current.alerts.filter((alert) => alert.id !== Number(event.old.id)) }));
          return;
        }
        const alert = event.new as Alert;
        if (!Number.isSafeInteger(alert.id)) return;
        setData((current) => alert.owner_id === profileId || current.devices.some((d) => d.owner_id === alert.owner_id) || current.batches.some((b) => b.owner_id === alert.owner_id)
          ? { ...current, alerts: [alert, ...current.alerts.filter((item) => item.id !== alert.id)].sort((a,b) => b.created_at.localeCompare(a.created_at)) }
          : current);
      })
      .subscribe((status) => {
        if (!active) return;
        if (status === "SUBSCRIBED") {
          realtimeRef.current = true;
          setRealtime(true);
          // Transport subscription alone does not prove fresh chamber data.
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          realtimeRef.current = false;
          setRealtime(false);
        }
      });

    // Only start HTTP polling if an API URL is configured or running on localhost
    if (hasBackendApi) {
      void refresh();
    }

    return () => {
      active = false;
      realtimeRef.current = false;
      clearTimeout(timer);
      controller?.abort();
      void supabase.removeChannel(channel);
    };
  }, [profileId, retry, setData]);

  return { mqtt, realtime, latestReadings, notificationError, error, liveError: error, retry: () => setRetry((value) => value + 1) };
}
