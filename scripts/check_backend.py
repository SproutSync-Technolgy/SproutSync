"""Read-only HTTP deployment checks; no email, device or record-write requests.

Optional authentication comes from SPROUTSYNC_ACCESS_TOKEN, never a CLI token.
Responses and credentials are not logged. GET auth/me may sync the caller's
identity projection as part of normal backend authentication.
"""

import argparse
import json
import os
import time
from dataclasses import asdict, dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward an optional bearer token to a redirected host.
        return None


@dataclass
class Result:
    check: str
    status: str
    message: str
    http_status: int | None = None
    elapsed_ms: int | None = None


class BackendChecker:
    def __init__(self, base_url, token="", timeout=10):
        address = urlsplit(base_url)
        if (
            address.scheme not in ("http", "https")
            or not address.hostname
            or address.username
            or address.password
            or address.query
            or address.fragment
        ):
            raise ValueError(
                "Use an HTTP(S) backend URL without credentials, query or fragment."
            )
        if (
            token
            and address.scheme != "https"
            and address.hostname not in ("localhost", "127.0.0.1", "::1")
        ):
            raise ValueError(
                "Authenticated checks require HTTPS, except on loopback localhost."
            )
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self.opener = build_opener(NoRedirect())
        self.results = []

    def request(self, name, path, expected=200, *, authenticated=False, validate=None):
        headers = {"Accept": "application/json"}
        if authenticated:
            headers["Authorization"] = "Bearer " + self.token
        request = Request(self.base_url + path, headers=headers, method="GET")
        started = time.monotonic()
        try:
            try:
                response = self.opener.open(request, timeout=self.timeout)
            except HTTPError as error:
                response = error
            with response:
                code = response.code
                raw = response.read(1_048_577)
            elapsed = int((time.monotonic() - started) * 1000)
            if code != expected:
                self.results.append(
                    Result(
                        name,
                        "FAIL",
                        f"Expected HTTP {expected}; received {code}. Inspect Swagger/server logs.",
                        code,
                        elapsed,
                    )
                )
                return None
            if len(raw) > 1_048_576:
                self.results.append(
                    Result(
                        name,
                        "FAIL",
                        "Response exceeded the checker's 1 MiB limit.",
                        code,
                        elapsed,
                    )
                )
                return None
            try:
                body = json.loads(raw)
            except (ValueError, UnicodeError):
                body = raw.decode("utf-8", errors="replace")
            if validate is not None and not validate(body):
                self.results.append(
                    Result(
                        name,
                        "FAIL",
                        "Response did not match this API's documented contract.",
                        code,
                        elapsed,
                    )
                )
                return None
            self.results.append(
                Result(name, "PASS", "Expected response received.", code, elapsed)
            )
            return body
        except (URLError, OSError, ValueError):
            self.results.append(
                Result(
                    name,
                    "FAIL",
                    "Request failed. Check the URL, TLS, network and running backend.",
                    elapsed_ms=int((time.monotonic() - started) * 1000),
                )
            )
            return None

    def run(self):
        self.request(
            "API liveness",
            "/api/v1/health",
            validate=lambda body: (
                isinstance(body, dict)
                and body.get("status") == "ok"
                and body.get("service") == "sproutsync-api"
            ),
        )
        self.request(
            "Database/schema readiness",
            "/api/v1/ready",
            validate=self.valid_readiness,
        )
        self.request(
            "Swagger UI",
            "/docs",
            validate=lambda body: isinstance(body, str) and "SwaggerUIBundle" in body,
        )
        self.request("OpenAPI schema", "/openapi.json", validate=self.valid_schema)
        self.request("Anonymous session denied", "/api/v1/auth/me", expected=401)
        self.request(
            "Anonymous diagnostics denied", "/api/v1/system/connections", expected=401
        )
        if not self.token:
            self.results.append(
                Result(
                    "Authenticated endpoints",
                    "SKIP",
                    "Set SPROUTSYNC_ACCESS_TOKEN to your session access token to test permitted reads and connections.",
                )
            )
            return self.results
        profile = self.request(
            "Signed-in identity",
            "/api/v1/auth/me",
            authenticated=True,
            validate=lambda body: (
                isinstance(body, dict) and "role" in body and "id" in body
            ),
        )
        if profile is None:
            self.results.append(
                Result(
                    "Authorized records",
                    "SKIP",
                    "Authentication failed; renew the signed-in session token.",
                )
            )
            return self.results
        self.request(
            "Permitted batch list",
            "/api/v1/batches",
            authenticated=True,
            validate=lambda body: isinstance(body, list),
        )
        snapshot = self.request(
            "Permitted device snapshot",
            "/api/v1/devices/live",
            authenticated=True,
            validate=lambda body: (
                isinstance(body, dict)
                and isinstance(body.get("devices"), list)
                and isinstance(body.get("readings"), list)
                and isinstance(body.get("latest_readings"), list)
                and isinstance(body.get("mqtt"), dict)
            ),
        )
        if snapshot is not None:
            mqtt = snapshot["mqtt"]
            status = (
                "SKIP"
                if mqtt.get("state") == "disabled"
                else "PASS"
                if mqtt.get("connected") and mqtt.get("state") == "connected"
                else "FAIL"
            )
            self.results.append(
                Result(
                    "MQTT bridge",
                    status,
                    "Bridge state checked separately; device/sensor freshness still requires hardware validation.",
                )
            )
        if profile["role"] in ("superadmin", "admin"):
            diagnostics = self.request(
                "Protected service diagnostics",
                "/api/v1/system/connections",
                authenticated=True,
                validate=lambda body: (
                    isinstance(body, dict) and isinstance(body.get("checks"), dict)
                ),
            )
            if diagnostics is not None:
                for name, check in diagnostics["checks"].items():
                    status = (
                        "PASS"
                        if check.get("status") == "ok"
                        else "FAIL"
                        if check.get("required")
                        else "SKIP"
                    )
                    self.results.append(
                        Result(
                            "Connection: " + name,
                            status,
                            "Service reported " + str(check.get("status")) + ".",
                        )
                    )
        else:
            self.results.append(
                Result(
                    "Protected service diagnostics",
                    "SKIP",
                    "Superadmin/admin role required; your permitted device snapshot was checked.",
                )
            )
        return self.results

    @staticmethod
    def valid_readiness(body):
        if not isinstance(body, dict) or body.get("status") != "ready":
            return False
        checks = body.get("checks")
        return isinstance(checks, dict) and all(
            isinstance(checks.get(name), dict) and checks[name].get("status") == "ok"
            for name in ("database", "schema")
        )

    @staticmethod
    def valid_schema(body):
        if not isinstance(body, dict) or not isinstance(body.get("info"), dict):
            return False
        if body["info"].get("title") != "SproutSync API":
            return False
        required = {
            "/api/v1/health",
            "/api/v1/ready",
            "/api/v1/auth/me",
            "/api/v1/system/connections",
            "/api/v1/devices/live",
        }
        components = body.get("components")
        if not isinstance(body.get("paths"), dict) or not isinstance(components, dict):
            return False
        security = components.get("securitySchemes")
        session = (
            security.get("SupabaseSession") if isinstance(security, dict) else None
        )
        return (
            required.issubset(body["paths"])
            and isinstance(session, dict)
            and session.get("scheme") == "bearer"
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000",
        help="Backend origin, not the frontend or Supabase URL",
    )
    parser.add_argument("--timeout", type=float, default=10)
    parser.add_argument(
        "--json", action="store_true", help="Print a redacted machine-readable report"
    )
    args = parser.parse_args()
    if not 0 < args.timeout <= 60:
        parser.error("timeout must be between 0 and 60 seconds")
    try:
        checker = BackendChecker(
            args.base_url, os.environ.get("SPROUTSYNC_ACCESS_TOKEN", ""), args.timeout
        )
    except ValueError as error:
        parser.error(str(error))
    results = checker.run()
    if args.json:
        print(json.dumps([asdict(result) for result in results], indent=2))
    else:
        for result in results:
            print(f"[{result.status}] {result.check}: {result.message}")
        print(
            "GET checks only; write workflows, SMTP delivery, Realtime and physical sensors are not automatically certified."
        )
    return int(any(result.status == "FAIL" for result in results))


if __name__ == "__main__":
    raise SystemExit(main())
