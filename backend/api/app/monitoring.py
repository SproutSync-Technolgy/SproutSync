"""Read-only, redacted service checks. No device commands or repair operations."""

import asyncio
import logging
import time
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from threading import Lock
from typing import Literal
from urllib.parse import urlsplit

import httpx
from alembic.config import Config
from alembic.script import ScriptDirectory
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool

from app.config import settings
from app.mqtt import bridge

logger = logging.getLogger(__name__)


class ConnectionCheck(BaseModel):
    status: Literal[
        "ok",
        "unavailable",
        "not_configured",
        "out_of_date",
        "disabled",
        "connecting",
        "not_checked",
    ]
    message: str
    required: bool = True


class ReadinessResponse(BaseModel):
    status: Literal["ready", "not_ready"]
    service: str = "sproutsync-api"
    checked_at: datetime
    checks: dict[str, ConnectionCheck]


class ConnectionsResponse(BaseModel):
    status: Literal["ok", "degraded"]
    checked_at: datetime
    checks: dict[str, ConnectionCheck]


@lru_cache(maxsize=1)
def expected_revision() -> str:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    revision = ScriptDirectory.from_config(config).get_current_head()
    if revision is None:
        raise ValueError("Migration head is missing")
    return revision


@lru_cache(maxsize=1)
def probe_engine():
    # A separate, nonpooled connection avoids waiting on a busy API request pool.
    # Closing the probe also rolls back its local timeout and read-only settings.
    return create_engine(
        settings.database_url, poolclass=NullPool, connect_args={"connect_timeout": 3}
    )


def database_checks() -> dict[str, ConnectionCheck]:
    if not settings.database_url.startswith("postgresql+psycopg://"):
        return {
            "database": ConnectionCheck(
                status="not_configured",
                message="Configure the matching Supabase PostgreSQL DATABASE_URL.",
            ),
            "schema": ConnectionCheck(
                status="not_checked",
                message="Database configuration is required first.",
            ),
        }
    database = ConnectionCheck(
        status="unavailable",
        message="Database connection failed; check server configuration and logs.",
    )
    schema = ConnectionCheck(
        status="not_checked", message="Database connectivity is required first."
    )
    try:
        with probe_engine().connect() as connection:
            connection.exec_driver_sql("SET TRANSACTION READ ONLY")
            connection.exec_driver_sql("SET LOCAL statement_timeout = '2000ms'")
            connection.execute(text("SELECT 1"))
            database = ConnectionCheck(
                status="ok", message="Read-only database query succeeded."
            )
            schema = ConnectionCheck(
                status="out_of_date",
                message="Schema check failed; review Alembic migrations in server logs.",
            )
            revisions = connection.scalars(
                text("SELECT version_num FROM public.alembic_version")
            ).all()
            if revisions == [expected_revision()]:
                schema = ConnectionCheck(
                    status="ok",
                    message="Database migration stamp matches this backend release.",
                )
    except (SQLAlchemyError, OSError, ValueError) as error:
        # Deliberately omit exception text, SQL and connection details.
        logger.warning("Database readiness check failed (%s)", type(error).__name__)
    return {"database": database, "schema": schema}


class ReadinessProbe:
    """Share one short probe across public health requests for ten seconds."""

    def __init__(self):
        self._lock = Lock()
        self._until = 0.0
        self._result: ReadinessResponse | None = None

    def check(self) -> ReadinessResponse:
        with self._lock:
            if self._result is None or time.monotonic() >= self._until:
                checks = database_checks()
                self._result = ReadinessResponse(
                    status="ready"
                    if all(check.status == "ok" for check in checks.values())
                    else "not_ready",
                    checked_at=datetime.now(UTC),
                    checks=checks,
                )
                self._until = time.monotonic() + 10
            return self._result.model_copy(deep=True)


readiness_probe = ReadinessProbe()


async def supabase_check(
    client: httpx.AsyncClient, path: str, label: str, *, expect_permission_denial=False
) -> ConnectionCheck:
    if not settings.supabase_url or not settings.supabase_anon_key:
        return ConnectionCheck(
            status="not_configured",
            message="Set the server Supabase URL and public client key.",
        )
    try:
        address = urlsplit(settings.supabase_url)
        if (
            address.scheme not in ("http", "https")
            or not address.hostname
            or address.username
            or address.password
            or address.query
            or address.fragment
            or address.path not in ("", "/")
        ):
            raise ValueError("Invalid base URL")
        address.port
    except ValueError:
        return ConnectionCheck(
            status="not_configured",
            message="Supabase URL must be an HTTP(S) origin without embedded credentials or extra paths.",
        )
    try:
        response = await client.request(
            "GET",
            settings.supabase_url.rstrip("/") + path,
            headers={"apikey": settings.supabase_anon_key},
        )
        if expect_permission_denial:
            try:
                body = response.json()
            except ValueError:
                body = None
            if (
                response.status_code in (401, 403)
                and isinstance(body, dict)
                and body.get("code") == "42501"
            ):
                return ConnectionCheck(
                    status="ok",
                    message="Data API responded with the expected protected-metadata permission denial on a zero-row request; no records were read.",
                )
        elif response.status_code == 200:
            return ConnectionCheck(
                status="ok",
                message=f"{label} HTTP endpoint responded successfully; user permissions are checked separately.",
            )
    except (httpx.HTTPError, httpx.InvalidURL):
        pass
    return ConnectionCheck(
        status="unavailable",
        message=f"{label} check failed; verify project configuration and service availability.",
    )


async def connection_snapshot(readiness: ReadinessResponse) -> ConnectionsResponse:
    async with httpx.AsyncClient(timeout=3, follow_redirects=False) as client:
        auth, rest = await asyncio.gather(
            supabase_check(client, "/auth/v1/health", "Supabase Auth"),
            supabase_check(
                client,
                "/rest/v1/alembic_version?select=version_num&limit=0",
                "Supabase Data API",
                expect_permission_denial=True,
            ),
        )
    checks = {**readiness.checks, "supabase_auth": auth, "supabase_rest": rest}
    if not settings.mqtt_enabled:
        mqtt = ConnectionCheck(
            status="disabled",
            message="MQTT ingestion is disabled in server configuration.",
            required=False,
        )
    elif bridge.connected and bridge.state == "connected":
        mqtt = ConnectionCheck(
            status="ok",
            message="Broker connected. Check devices/live for device freshness and sensor faults.",
        )
    elif bridge.state in ("connecting", "reconnecting"):
        mqtt = ConnectionCheck(
            status="connecting",
            message="MQTT bridge is connecting or retrying its broker connection.",
        )
    else:
        mqtt = ConnectionCheck(
            status="unavailable",
            message="MQTT bridge is not ready; review broker configuration, subscriptions and server logs.",
        )
    checks["mqtt"] = mqtt
    checks["smtp"] = ConnectionCheck(
        status="not_checked"
        if settings.google_smtp_email and settings.clean_google_app_password
        else "not_configured",
        message="Optional email delivery is configuration-only here; no email was sent and SMTP delivery was not verified.",
        required=False,
    )
    return ConnectionsResponse(
        status="ok"
        if all(not check.required or check.status == "ok" for check in checks.values())
        else "degraded",
        checked_at=datetime.now(UTC),
        checks=checks,
    )
