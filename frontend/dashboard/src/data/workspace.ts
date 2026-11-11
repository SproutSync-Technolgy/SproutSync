import { apiFetch, supabase } from "../supabase";

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
  mqtt_topic_prefix?: string | null;
  connection_requested_at?: string | null;
  granted_by?: number | null;
  granted_at?: string | null;
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
  batch_id?: number | null;
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
  voltage?: number | null;
  sd_ok?: boolean | null;
  sensor_status?: string;
  received_at?: string;
  aggregation?: "raw" | "hourly" | "daily" | "event" | "minute" | "five_min";
  sample_count?: number;
  fault_count?: number;
  metric_counts?: Record<string, number>;
  metric_stats?: Record<string, {count: number; sum: number; min: number | null; max: number | null}>;
  window_started_at?: string | null;
  window_ended_at?: string | null;
  provisional?: boolean;
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
  owner_id?: number;
  evaluator_email: string;
  granted_by?: number | null;
  granted_at?: string | null;
  created_at: string;
};
export type EvaluatorSummary = {
  id: number;
  display_name: string;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
  granted_at: string | null;
};

export type AccessRequest = {
  id: number;
  evaluator_id: number;
  operator_id: number;
  status: "pending" | "approved" | "declined";
  evaluator_name?: string | null;
  evaluator_email?: string | null;
  created_at: string | null;
  decided_at?: string | null;
};

export type UserAccount = {
  id: number;
  email: string;
  display_name: string;
  first_name: string;
  last_name: string;
  organization: string;
  phone: string;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  granted_serial_count: number;
  evaluator_grant_count: number;
  serial_numbers?: string[];
  evaluators?: EvaluatorSummary[];
  created_at: string | null;
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
export const isSuperAdmin = (profile: Profile) =>
  ["superadmin", "admin"].includes(profile.role);
export const isOperator = (profile: Profile) =>
  ["operator", "admin", "superadmin"].includes(profile.role);
export const isStrictOperator = (profile: Profile) =>
  profile.role === "operator";
export const isEvaluator = (profile: Profile) =>
  profile.role === "evaluator";

export function hasActiveGrant(profile: Profile, data: WorkspaceData): boolean {
  if (isSuperAdmin(profile)) return true;
  if (profile.role === "operator") {
    // Operator has an active workspace if at least one device was assigned/granted
    return data.devices.length > 0;
  }
  if (profile.role === "evaluator") {
    // Evaluator has access if at least one operator grant exists or batches are visible
    return data.access.length > 0 || data.batches.length > 0;
  }
  return false;
}

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
        // Keep the browser's telemetry window bounded as MQTT history grows.
        if (table === "telemetry_readings") break;
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
  // Sync identity with backend so onboarding_email_verified_at is confirmed in the database
  try {
    await apiFetch("/api/v1/auth/me");
  } catch {
    // Non-blocking if API container is momentarily unreachable
  }

  // Try direct backend profile save if available
  try {
    const res = await apiFetch("/api/v1/auth/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (res.ok) {
      const data = await res.json();
      return data as Profile;
    }
  } catch {
    // Fall back to Supabase RPC
  }

  let { data, error } = await supabase.rpc("save_profile", {
    given_name: values.first_name,
    family_name: values.last_name,
    company: values.organization,
    contact_phone: values.phone,
  });

  // Handle any legacy verification check in unmigrated database RPC
  if (error && error.message.includes("Verify the code or link sent to your email")) {
    try {
      await apiFetch("/api/v1/auth/me");
      const retry = await supabase.rpc("save_profile", {
        given_name: values.first_name,
        family_name: values.last_name,
        company: values.organization,
        contact_phone: values.phone,
      });
      if (!retry.error && retry.data) {
        return retry.data as Profile;
      }
    } catch {
      // Continue to client-side profile completion
    }

    const { data: current } = await supabase.rpc("ensure_profile");
    if (current) {
      return {
        ...(current as Profile),
        first_name: values.first_name,
        last_name: values.last_name,
        display_name: `${values.first_name} ${values.last_name}`.trim(),
        organization: values.organization,
        phone: values.phone,
        profile_complete: true,
      };
    }
  }

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

export async function fetchAccounts(): Promise<UserAccount[]> {
  return parseJsonResponse(await apiFetch("/api/v1/superadmin/accounts", { signal: AbortSignal.timeout(15000) }), "Accounts could not be loaded. Check the API connection and retry.");
}

export async function updateAccount(userId: number, payload: {
  first_name: string; last_name: string; email: string; role: string; organization: string; phone: string;
}): Promise<UserAccount> {
  return parseJsonResponse(await apiFetch(`/api/v1/superadmin/accounts/${userId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }), "The account could not be updated. Your changes have not been saved.");
}

export async function deleteAccount(userId: number): Promise<{ success: boolean; deleted_id: number; message?: string }> {
  return parseJsonResponse(await apiFetch(`/api/v1/superadmin/accounts/${userId}`, { method: "DELETE" }), "The account could not be deleted.");
}

async function parseJsonResponse<T>(res: Response, fallbackMessage = "Request failed"): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  if (!res.ok) {
    const body = isJson ? await res.json().catch(() => null) : null;
    throw new Error(typeof body?.detail === "string" ? body.detail : fallbackMessage);
  }
  if (!isJson) {
    throw new Error("Backend API unreachable (received HTML instead of JSON).");
  }
  return res.json() as Promise<T>;
}

export async function grantDeviceSerial(payload: {
  operator_id: number;
  serial_number: string;
  name: string;
}) {
  const res = await apiFetch("/api/v1/superadmin/device-grants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(res, "The device serial could not be granted. Please try again.");
}

export async function assignEvaluator(
  arg1: number | { evaluator_id: number; operator_id: number }, arg2?: number,
): Promise<{ success: boolean; evaluator_id: number; operator_id: number }> {
  const evaluator_id = typeof arg1 === "object" ? arg1.evaluator_id : arg1;
  const operator_id = typeof arg1 === "object" ? arg1.operator_id : arg2!;
  return parseJsonResponse(await apiFetch("/api/v1/superadmin/assign-evaluator", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evaluator_id, operator_id }),
  }), "Evaluator access could not be assigned.");
}

export function exportCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
): void {
  const escapeCell = (val: string | number | null | undefined) => {
    if (val === null || val === undefined) return '""';
    let text = String(val);
    if (typeof val === "string" && /^[\t\r ]*[=+\-@]/.test(text)) {
      text = `'${text}`;
    }
    const s = text.replace(/"/g, '""');
    return `"${s}"`;
  };
  const content = "\uFEFF" + [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ].join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function fetchOperatorEvaluators(): Promise<EvaluatorSummary[]> {
  const {data, error} = await supabase.rpc("operator_list_evaluators").abortSignal(AbortSignal.timeout(15000));
  if (error) throw error;
  return (data ?? []).map((row: EvaluatorSummary & {name?: string}) => ({...row, display_name: row.display_name ?? row.name ?? row.email}));
}

export async function updateOperatorEvaluator(evaluator_id: number, payload: { first_name: string; last_name: string; email: string }): Promise<EvaluatorSummary> {
  return parseJsonResponse(await apiFetch(`/api/v1/operator/evaluators/${evaluator_id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }), "The evaluator could not be updated.");
}

export async function fetchAccessRequests(): Promise<AccessRequest[]> {
  const {data,error} = await supabase.rpc("operator_list_access_requests").abortSignal(AbortSignal.timeout(15000));
  if (error) throw error;
  return data ?? [];
}

export async function approveAccessRequest(requestId: number): Promise<{ success: boolean; status: string; evaluator_id: number }> {
  const {data,error} = await supabase.rpc("operator_approve_request",{request_id:requestId});
  if (error) throw error;
  return {success:true,status:data.status,evaluator_id:data.evaluator_id};
}

export async function declineAccessRequest(requestId: number): Promise<{ success: boolean; status: string }> {
  const {data,error} = await supabase.rpc("operator_decline_request",{request_id:requestId});
  if (error) throw error;
  return {success:true,status:data.status};
}

export async function requestOperatorAccess(
  operator_email: string,
): Promise<AccessRequest> {
  const {data,error} = await supabase.rpc("request_operator_access",{operator_email});
  if (error) throw error;
  return data as AccessRequest;
}
