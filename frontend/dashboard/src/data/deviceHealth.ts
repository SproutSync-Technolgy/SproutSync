import type {Device} from "./workspace";

/** Fresh packet evidence is independent of the dashboard's MQTT/API transport. */
export function deviceIsConnected(device: Device, staleSeconds = 30, now = Date.now()) {
  const timestamp = Date.parse(device.last_seen_at ?? "");
  return !device.is_demo && ["online", "fault"].includes(device.status)
    && Number.isFinite(timestamp) && timestamp <= now + 5000
    && now - timestamp <= staleSeconds * 1000;
}

export function aggregationLabel(value?: string, provisional = false) {
  if (provisional) return "1-min average · in progress";
  return ({minute: "1-min average", five_min: "5-min average", five_minute: "5-min average", event: "State change", hourly: "Hourly average", daily: "Daily average"} as Record<string,string>)[value ?? ""] ?? "Raw sample";
}
