"""Shared OpenAPI descriptions; schemas still come from the actual API routes."""

from copy import deepcopy

from fastapi import FastAPI

API_DESCRIPTION = """
SproutSync's authenticated HTTP API for accounts, production batches and ESP32
registration/telemetry recovery. Expand an endpoint to see its role requirements,
request fields, response schema and failure codes. Filter this page by a path or tag.

### Check a deployment
1. **GET /api/v1/health**: process liveness only; 200 does not prove database or IoT health.
2. **GET /api/v1/ready**: database connectivity and migration readiness; 503 means not ready.
3. Sign in to SproutSync and obtain your own **Supabase session access token**.
   Click **Authorize** and paste just that token (without `Bearer `).
   Never use the anon key, service-role key, database password or MQTT credentials here.
   Authorization is held in this page's memory; log out when finished.
4. **GET /api/v1/auth/me**: confirm authentication and your assigned role.
5. Superadmins: **GET /api/v1/system/connections** checks configured service connections.
   Operators/evaluators: **GET /api/v1/devices/live** checks your permitted chambers.

**Try it out sends a real request.** POST/PATCH/DELETE operations can change saved
records; verification-send can send email. Use an intended development account.
The automatic deployment checker only makes GET requests. Authentication may
create/update the signed-in user's local identity projection.

### Connections and live readings
ESP32 -> configured MQTT broker -> persistent FastAPI bridge -> Supabase PostgreSQL.
The web uses both this API and Supabase Auth/PostgREST/Realtime; native mobile
also reads authorized Supabase data. Supabase's /rest/v1/rpc/search_workspace is
a separate API, not a missing FastAPI route.

202 device registration means **accepted, awaiting a fresh matching packet**.
A connected MQTT broker does not prove that an ESP32 is online or its sensors
are healthy. Check chamber status, last_seen_at, received_at and sensor_status.
latest_readings are current in-memory packets; readings are sampled saved history.

Cloud Wi-Fi discovery scans the **backend server's LAN**, not a user's home LAN.
Bluetooth identity reads happen in a supported client browser; the server cannot
pair with the user's radio. A read identity is not cryptographic device attestation.
This API subscribes to sensor topics; it has no pump/valve command endpoint.

Dates use ISO 8601 (include a timezone in submitted timestamps). Missing/faulty
measurements are null, not invented zero readings. Handled HTTP errors use `detail`;
unexpected 500 failures may return plain text.
422 reports invalid request fields. 401 means missing/expired session; 403 means
verified-email, active-account or role requirements were not met. An empty 200
list can correctly mean that no records are granted to the current user.
"""

API_TAGS = [
    {
        "name": "health",
        "description": "Public liveness and database/schema readiness. Start here after deployment.",
    },
    {
        "name": "system",
        "description": "Superadmin-only service diagnostics. These checks do not operate hardware.",
    },
    {
        "name": "auth",
        "description": "Supabase bearer sessions, current profile and optional onboarding email verification.",
    },
    {
        "name": "devices",
        "description": "ESP32 discovery, registration, authorized live snapshots and issue reports.",
    },
    {
        "name": "batches",
        "description": "Production batch ownership, lifecycle updates and archival.",
    },
    {
        "name": "access",
        "description": "Request access to an operator's workspace; approval is a separate operation.",
    },
    {
        "name": "operator",
        "description": "Operator/elevated-role management of linked evaluators and incoming access requests.",
    },
    {
        "name": "superadmin",
        "description": "Administrative account, device serial and evaluator assignment operations.",
    },
]


def install_openapi_docs(app: FastAPI) -> None:
    """Add common auth failures to secured operations, including nested routers."""
    default_openapi = app.openapi

    def documented_openapi():
        schema = default_openapi()
        for item in schema["paths"].values():
            for method, operation in item.items():
                if method not in {
                    "get",
                    "post",
                    "patch",
                    "delete",
                    "put",
                    "head",
                    "options",
                }:
                    continue
                if not operation.get("security"):
                    continue
                for code, description in {
                    "401": "Missing, invalid or expired Supabase session access token.",
                    "403": "Verified email, active account, required role or resource access is missing.",
                    "503": "Supabase authentication is unconfigured or temporarily unreachable; retry later.",
                    "500": "Unexpected server/database failure. Inspect redacted server logs; do not assume a write completed.",
                }.items():
                    operation["responses"].setdefault(
                        code,
                        {
                            "description": description,
                            "content": {
                                (
                                    "text/plain"
                                    if code == "500"
                                    else "application/json"
                                ): {
                                    "schema": {"type": "string"}
                                    if code == "500"
                                    else deepcopy(ERROR_SCHEMA)
                                }
                            },
                        },
                    )
        return schema

    app.openapi = documented_openapi


ERROR_SCHEMA = {
    "type": "object",
    "required": ["detail"],
    "properties": {"detail": {"type": "string"}},
}
