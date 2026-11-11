import {useEffect, useState, type Dispatch, type SetStateAction} from "react";
import {apiFetch, supabase} from "../supabase";
import {apiUrl} from "../config";
import {errorMessage, type Alert, type Device, type Reading, type WorkspaceData} from "./workspace";

export type MQTTStatus = {
  state: string; connected: boolean; broker_url: string; stale_seconds: number;
  history_sample_seconds?: number; fault_history_seconds?: number; live_refresh_seconds?: number;
};
export type LatestReading = Omit<Reading, "id">;
type LiveSnapshot = {devices: Device[]; readings: Reading[]; latest_readings?: LatestReading[];
  minute_previews?: LatestReading[]; mqtt: MQTTStatus | null; stale_seconds?: number};

async function checkedJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.detail === "string" ? body.detail : "The backend API is unavailable. Check its deployed URL.");
  }
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) throw new Error("The backend returned a page instead of API data.");
  return response.json();
}

export async function connectDevice(values: {serial_number: string; name: string; topic_prefix: string}) {
  return checkedJson<Device>(await apiFetch("/api/v1/devices/connect", {
    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(values), signal: AbortSignal.timeout(10000),
  }));
}

export function mergeReadings(current: Reading[], incoming: Reading[]): Reading[] {
  const rows = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) rows.set(row.id, row);
  return [...rows.values()].sort((a,b) => Date.parse(b.recorded_at)-Date.parse(a.recorded_at) || b.id-a.id).slice(0,2000);
}

function snapshot(value: unknown): LiveSnapshot {
  const body = value as LiveSnapshot;
  if (!body || !Array.isArray(body.devices) || !Array.isArray(body.readings)) throw new Error("Live snapshots are unavailable. Update the collector and database migrations.");
  return body;
}

export function useLiveTelemetry(profileId: number, setData: Dispatch<SetStateAction<WorkspaceData>>) {
  const [mqtt,setMqtt] = useState<MQTTStatus | null>(null);
  const [realtime,setRealtime] = useState(false);
  const [error,setError] = useState("");
  const [retry,setRetry] = useState(0);
  const [latestReadings,setLatestReadings] = useState<LatestReading[]>([]);
  const [minutePreviews,setMinutePreviews] = useState<LatestReading[]>([]);
  const [liveTrail,setLiveTrail] = useState<LatestReading[]>([]);
  const [staleSeconds,setStaleSeconds] = useState(30);
  const [transport,setTransport] = useState<"starting" | "api" | "database" | "unavailable">("starting");
  const [notificationError,setNotificationError] = useState("");
  const [,setClock] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    let cursor: number | undefined;
    let deviceIds: string | undefined;
    let lastAlertCheck = 0;
    let apiRetryAt = 0;
    const isLocal = ["localhost","127.0.0.1"].includes(window.location.hostname);
    const hasBackend = Boolean(apiUrl) || isLocal;

    const refresh = async () => {
      if (!active) return;
      const started = Date.now();
      if (document.visibilityState === "visible") {
        if (started-lastAlertCheck >= 30000) {
          lastAlertCheck = started;
          void supabase.from("alerts").select("*").order("created_at",{ascending:false}).limit(100).then(({data,error:failure}) => {
            if (!active) return;
            setNotificationError(failure ? "Notifications could not be refreshed. Your last saved alerts are shown." : "");
            if (!failure && data) setData((current) => ({...current,alerts:data as Alert[]}));
          });
        }
        const requestController = new AbortController();
        controller = requestController;
        const timeout = setTimeout(() => requestController.abort(),8000);
        try {
          let next: LiveSnapshot | undefined;
          let source: "api" | "database" = "database";
          if (hasBackend && started >= apiRetryAt) {
            const apiTimeout = setTimeout(() => requestController.abort(),3000);
            try {
              next = snapshot(await checkedJson(await apiFetch(`/api/v1/devices/live${cursor === undefined ? "" : `?after_id=${cursor}`}`,{signal:requestController.signal})));
              source = "api";
            } catch {
              apiRetryAt = Date.now()+30000;
              // A timed-out API gets a new bounded request for the hosted RPC.
              if (requestController.signal.aborted && active) {
                controller = new AbortController();
              }
            } finally {
              clearTimeout(apiTimeout);
            }
          }
          if (!next) {
            if (!active) return;
            const fallbackController = controller ?? requestController;
            const fallbackTimeout = setTimeout(() => fallbackController.abort(),5000);
            try {
              const {data,error:failure} = await supabase.rpc("workspace_live_snapshot",{after_id:cursor ?? null}).abortSignal(fallbackController.signal);
              if (failure) throw new Error("Live updates could not be refreshed. Check the collector and Supabase connection.");
              next = snapshot(data);
            } finally {clearTimeout(fallbackTimeout);}
          }
          if (!active) return;
          const allowed = new Set(next.devices.map((device) => device.id));
          const nextIds = [...allowed].sort((a,b) => a-b).join(",");
          cursor = deviceIds !== undefined && deviceIds !== nextIds ? undefined : Math.max(cursor ?? 0,...next.readings.map((row) => row.id));
          deviceIds = nextIds;
          const latest = (next.latest_readings ?? []).filter((row) => allowed.has(row.device_id));
          setMqtt(next.mqtt ?? null);
          setStaleSeconds(next.stale_seconds ?? next.mqtt?.stale_seconds ?? 30);
          setLatestReadings(latest);
          setMinutePreviews((next.minute_previews ?? []).filter((row) => allowed.has(row.device_id)));
          setLiveTrail((previous) => {
            const rows = new Map([...previous,...latest].map((row) => [`${row.device_id}:${row.received_at ?? row.recorded_at}`,row]));
            const counts = new Map<number,number>();
            return [...rows.values()].filter((row) => allowed.has(row.device_id)).sort((a,b) => Date.parse(b.received_at ?? b.recorded_at)-Date.parse(a.received_at ?? a.recorded_at)).filter((row) => {
              const count = (counts.get(row.device_id) ?? 0)+1; counts.set(row.device_id,count); return count <= 30;
            }).slice(0,512);
          });
          setTransport(source); setError("");
          setData((current) => ({...current,devices:next!.devices,readings:mergeReadings(current.readings,next!.readings).filter((row) => allowed.has(row.device_id))}));
        } catch (failure) {
          if (active) {setError(errorMessage(failure)); setTransport("unavailable"); setMqtt(null);}
        } finally {clearTimeout(timeout); if (active) setClock(Date.now());}
      }
      if (active) timer = setTimeout(refresh,Math.max(0,2000-(Date.now()-started)));
    };
    const channel = supabase.channel(`live-telemetry-${profileId}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"telemetry_readings"},({new:row}) => {
        if (active) setData((current) => current.devices.some((device) => device.id === row.device_id) ? {...current,readings:mergeReadings(current.readings,[row as Reading])} : current);
      })
      .on("postgres_changes",{event:"DELETE",schema:"public",table:"telemetry_readings"},({old:row}) => {
        if (active) setData((current) => ({...current,readings:current.readings.filter((reading) => reading.id !== Number(row.id))}));
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"alerts"},(event) => {
        if (!active) return;
        if (event.eventType === "DELETE") {setData((current) => ({...current,alerts:current.alerts.filter((alert) => alert.id !== Number(event.old.id))})); return;}
        const alert = event.new as Alert;
        if (!Number.isSafeInteger(alert.id)) return;
        setData((current) => alert.owner_id === profileId || current.devices.some((device) => device.owner_id === alert.owner_id) || current.batches.some((batch) => batch.owner_id === alert.owner_id)
          ? {...current,alerts:[alert,...current.alerts.filter((item) => item.id !== alert.id)].sort((a,b) => b.created_at.localeCompare(a.created_at))} : current);
      })
      .subscribe((status) => {if (active) setRealtime(status === "SUBSCRIBED");});
    void refresh();
    return () => {active=false; clearTimeout(timer); controller?.abort(); void supabase.removeChannel(channel);};
  },[profileId,retry,setData]);

  return {mqtt,realtime,latestReadings,minutePreviews,liveTrail,staleSeconds,transport,notificationError,error,liveError:error,retry:() => setRetry((value) => value+1)};
}
