import { apiFetch } from "../supabase";
import type { Device } from "./workspace";

export const DISCOVERY_SERVICE_UUID = "f7b20001-11f9-4c7c-9f23-74c367499f20";
const IDENTITY_CHARACTERISTIC_UUID = "f7b20002-11f9-4c7c-9f23-74c367499f20";
export type DeviceIdentity = { protocol: "sproutsync-discovery-v1"; model: "ESP32"; serial_number: string; name: string; topic_prefix: string };
export type NearbyDevice = DeviceIdentity & { transport: "wifi" | "bluetooth"; discovery_id?: string; addresses: string[]; available: boolean };

type BluetoothDevice = {
  gatt?: { connect: () => Promise<{ getPrimaryService: (uuid: string) => Promise<{ getCharacteristic: (uuid: string) => Promise<{ readValue: () => Promise<DataView> }> }> }>; disconnect: () => void };
};
type BluetoothNavigator = Navigator & { bluetooth?: { requestDevice: (options: { filters: { services: string[] }[] }) => Promise<BluetoothDevice> } };

async function checkedJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.detail === "string" ? body.detail : "Device discovery is unavailable. Check the API and try again.");
  }
  return response.json() as Promise<T>;
}

export async function scanWifi(signal: AbortSignal): Promise<NearbyDevice[]> {
  const body = await checkedJson<{ devices: NearbyDevice[] }>(await apiFetch("/api/v1/devices/discover", { signal }));
  if (!Array.isArray(body.devices)) throw new Error("The discovery service returned an invalid response.");
  return body.devices.slice(0, 50).map((device) => {
    const identity = parseDeviceIdentity(device);
    if (device.transport !== "wifi" || typeof device.discovery_id !== "string" || !device.discovery_id || device.discovery_id.length > 128 ||
      typeof device.available !== "boolean" || !Array.isArray(device.addresses) || !device.addresses.every((value) => typeof value === "string" && value.length <= 64)) {
      throw new Error("The discovery service returned an invalid device.");
    }
    return { ...identity, transport: "wifi", discovery_id: device.discovery_id, available: device.available, addresses: device.addresses };
  });
}

export function bluetoothSupported() {
  return window.isSecureContext && Boolean((navigator as BluetoothNavigator).bluetooth);
}

export function parseDeviceIdentity(value: unknown): DeviceIdentity {
  if (!value || typeof value !== "object") throw new Error("The selected device did not provide a SproutSync identity.");
  const row = value as Record<string, unknown>;
  if (row.protocol !== "sproutsync-discovery-v1" || row.model !== "ESP32" ||
    typeof row.serial_number !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/.test(row.serial_number) ||
    typeof row.name !== "string" || !row.name.trim() || row.name.length > 120 ||
    typeof row.topic_prefix !== "string" || row.topic_prefix.length > 160 || !/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/.test(row.topic_prefix)) {
    throw new Error("The selected device has an invalid SproutSync identity. Check its firmware.");
  }
  return { protocol: "sproutsync-discovery-v1", model: "ESP32", serial_number: row.serial_number.toUpperCase(), name: row.name.trim(), topic_prefix: row.topic_prefix };
}

export async function scanBluetooth(signal: AbortSignal): Promise<NearbyDevice> {
  const bluetooth = (navigator as BluetoothNavigator).bluetooth;
  if (!bluetoothSupported() || !bluetooth) throw new Error("Use Chrome or Edge on localhost or HTTPS to search Bluetooth devices.");
  // Keep the chooser directly in the click gesture; browsers forbid silent scans.
  const device = await bluetooth.requestDevice({ filters: [{ services: [DISCOVERY_SERVICE_UUID] }] });
  if (signal.aborted) throw new DOMException("Search cancelled", "AbortError");
  if (!device.gatt) throw new Error("The selected device does not support Bluetooth LE.");
  const gatt = device.gatt;
  const disconnect = () => device.gatt?.disconnect();
  signal.addEventListener("abort", disconnect, { once: true });
  let finished = false;
  const requireActive = () => {
    if (finished || signal.aborted) {
      disconnect();
      throw new DOMException("Search cancelled", "AbortError");
    }
  };
  let timer: ReturnType<typeof setTimeout>;
  try {
    const readIdentity = async (): Promise<NearbyDevice> => {
      const server = await gatt.connect();
      requireActive();
      const service = await server.getPrimaryService(DISCOVERY_SERVICE_UUID);
      requireActive();
      const characteristic = await service.getCharacteristic(IDENTITY_CHARACTERISTIC_UUID);
      requireActive();
      const value = await characteristic.readValue();
      requireActive();
      if (value.byteLength > 2048) throw new Error("Device identity is too large.");
      const identity = parseDeviceIdentity(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value)));
      return { ...identity, transport: "bluetooth", addresses: [], available: true };
    };
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Bluetooth connection timed out. Move closer to the ESP32 and try again.")), 10000);
    });
    return await Promise.race([readIdentity(), timeout]);
  } finally {
    finished = true;
    clearTimeout(timer!);
    signal.removeEventListener("abort", disconnect);
    disconnect();
  }
}

export async function registerNearby(device: NearbyDevice, name: string): Promise<Device> {
  return checkedJson<Device>(await apiFetch("/api/v1/devices/nearby", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transport: device.transport, discovery_id: device.discovery_id, identity: device, name }),
    signal: AbortSignal.timeout(10000),
  }));
}
