import { supabase } from "../supabase";

export type Profile = {
  id: number;
  email: string;
  role: string;
  display_name: string;
  first_name: string;
  last_name: string;
  organization: string;
  phone: string;
  profile_complete: boolean;
  avatar_url: string | null;
  registration_provider: string;
  onboarding_email_verified_at: string | null;
};
export type Batch = {
  id: number;
  owner_id: number;
  code: string;
  seed_type: string;
  stage: string;
  is_demo: boolean;
  status: string;
  started_at: string;
  target_harvest_at: string | null;
  notes: string | null;
};
export type Device = {
  id: number;
  owner_id: number;
  name: string;
  serial_number: string;
  is_demo: boolean;
  status: string;
  last_seen_at: string | null;
};
export type Alert = {
  id: number;
  owner_id: number;
  title: string;
  message: string;
  recommended_action: string;
  severity: string;
  status: string;
  category: string;
  created_at: string;
};
export type Reading = {
  id: number;
  device_id: number;
  temperature_c: number | null;
  humidity_percent: number | null;
  water_level_percent: number | null;
  recorded_at: string;
  water_temperature_c: number | null;
  light_lux: number | null;
  wastewater_level_percent: number | null;
};
export type Watering = {
  id: number;
  device_id: number;
  batch_id: number | null;
  volume_ml: number;
  duration_seconds: number;
  occurred_at: string;
};
export type Schedule = {
  id: number;
  device_id: number;
  next_run_at: string;
  duration_seconds: number;
  enabled: boolean;
};
export type Evidence = {
  id: number;
  batch_id: number | null;
  category: string;
  title: string;
  result: string;
  notes: string;
  recorded_at: string;
};
export type Evaluation = {
  id: number;
  batch_id: number;
  rating: number;
  comments: string;
  created_at: string;
};
export type Maintenance = {
  id: number;
  device_id: number;
  notes: string;
  performed_at: string;
};
export type Activity = {
  id: number;
  action: string;
  resource: string;
  created_at: string;
};
export type Access = {
  id: number;
  evaluator_email: string;
  created_at: string;
};
export type Tray = {
  id: number;
  device_id: number;
  position: number;
  status: string;
};
export type WorkspaceData = {
  batches: Batch[];
  devices: Device[];
  alerts: Alert[];
  readings: Reading[];
  watering: Watering[];
  schedules: Schedule[];
  evidence: Evidence[];
  evaluations: Evaluation[];
  maintenance: Maintenance[];
  activity: Activity[];
  access: Access[];
  trays: Tray[];
};
export const emptyWorkspace: WorkspaceData = {
  batches: [],
  devices: [],
  alerts: [],
  readings: [],
  watering: [],
  schedules: [],
  evidence: [],
  evaluations: [],
  maintenance: [],
  activity: [],
  access: [],
  trays: [],
};
export const isOperator = (profile: Profile) =>
  ["operator", "admin"].includes(profile.role);
export const errorMessage = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Something went wrong. Please try again.";

export async function loadWorkspace(
  signal: AbortSignal,
): Promise<WorkspaceData> {
  const sources = [
    ["batches", "batches", "started_at"],
    ["devices", "devices", "created_at"],
    ["alerts", "alerts", "created_at"],
    ["readings", "telemetry_readings", "recorded_at"],
    ["watering", "watering_events", "occurred_at"],
    ["schedules", "irrigation_schedules", "next_run_at"],
    ["evidence", "evidence_records", "recorded_at"],
    ["evaluations", "evaluations", "created_at"],
    ["maintenance", "maintenance_records", "performed_at"],
    ["activity", "activity_logs", "created_at"],
    ["access", "evaluator_access", "created_at"],
    ["trays", "trays", "id"],
  ];
  const results = await Promise.all(
    sources.map(async ([key, table, column]) => {
      const rows: unknown[] = [];
      for (let offset = 0; ; offset += 1000) {
        let query = supabase
          .from(table)
          .select("*")
          .order(column, { ascending: false });
        if (column !== "id") query = query.order("id");
        const { data, error } = await query
          .range(offset, offset + 999)
          .abortSignal(signal);
        if (error)
          throw new Error(
            `Unable to load ${table.replaceAll("_", " ")}: ${error.message}`,
          );
        rows.push(...data);
        if (data.length < 1000) break;
      }
      return [key, rows];
    }),
  );
  const workspace = Object.fromEntries(results) as WorkspaceData;
  return workspace;
}
export async function saveProfile(values: {
  first_name: string;
  last_name: string;
  organization: string;
  phone: string;
}): Promise<Profile> {
  const { data, error } = await supabase.rpc("save_profile", {
    given_name: values.first_name,
    family_name: values.last_name,
    company: values.organization,
    contact_phone: values.phone,
  });
  if (error) throw error;
  return data as Profile;
}
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: unknown[][],
) {
  const escape = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = [headers, ...rows]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
