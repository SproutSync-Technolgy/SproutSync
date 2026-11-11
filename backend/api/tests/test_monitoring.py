"""Monitoring must report failures honestly and avoid leaking configuration."""

from datetime import UTC, datetime
from unittest.mock import MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app import monitoring
from app.auth import get_current_user
from app.config import settings
from app.main import app
from app.models import User


@pytest.fixture
def client():
    old_overrides = app.dependency_overrides.copy()
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(old_overrides)


def ready_result():
    return monitoring.ReadinessResponse(
        status="ready",
        checked_at=datetime.now(UTC),
        checks={
            "database": monitoring.ConnectionCheck(
                status="ok", message="Read succeeded."
            ),
            "schema": monitoring.ConnectionCheck(status="ok", message="Current."),
        },
    )


def test_readiness_is_public_and_failure_is_503(client, monkeypatch):
    result = ready_result()
    monkeypatch.setattr(monitoring.readiness_probe, "check", lambda: result)
    response = client.get("/api/v1/ready")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    result.status = "not_ready"
    result.checks["database"].status = "unavailable"
    response = client.get("/api/v1/ready")
    assert response.status_code == 503
    assert response.json()["checks"]["database"]["status"] == "unavailable"
    assert client.get("/api/v1/health").json()["status"] == "ok"


@pytest.mark.parametrize(
    "stamp,expected",
    [
        (["release"], "ok"),
        (["older"], "out_of_date"),
        ([], "out_of_date"),
        (["release", "other"], "out_of_date"),
    ],
)
def test_database_probe_checks_stamp_in_read_only_transaction(
    monkeypatch, stamp, expected
):
    monkeypatch.setattr(
        settings, "database_url", "postgresql+psycopg://example.invalid/database"
    )
    connection = MagicMock()
    connection.scalars.return_value.all.return_value = stamp
    engine = MagicMock()
    engine.connect.return_value.__enter__.return_value = connection
    monkeypatch.setattr(monitoring, "probe_engine", lambda: engine)
    monkeypatch.setattr(monitoring, "expected_revision", lambda: "release")
    checks = monitoring.database_checks()
    assert checks["database"].status == "ok"
    assert checks["schema"].status == expected
    statements = [call.args[0] for call in connection.exec_driver_sql.call_args_list]
    assert statements == [
        "SET TRANSACTION READ ONLY",
        "SET LOCAL statement_timeout = '2000ms'",
    ]
    connection.commit.assert_not_called()


def test_database_failure_is_redacted(monkeypatch, caplog):
    monkeypatch.setattr(
        settings, "database_url", "postgresql+psycopg://example.invalid/database"
    )
    engine = MagicMock()
    engine.connect.side_effect = OperationalError(
        "SELECT secret", {}, Exception("password-DO-NOT-LOG")
    )
    monkeypatch.setattr(monitoring, "probe_engine", lambda: engine)
    checks = monitoring.database_checks()
    assert checks["database"].status == "unavailable"
    assert checks["schema"].status == "not_checked"
    assert "password-DO-NOT-LOG" not in str(checks) + caplog.text


def test_default_sqlite_configuration_is_not_a_supabase_readiness_success(monkeypatch):
    monkeypatch.setattr(settings, "database_url", "sqlite+pysqlite:///:memory:")
    assert monitoring.database_checks()["database"].status == "not_configured"


def test_readiness_cache_expires_and_cannot_be_mutated_by_callers(monkeypatch):
    now = [10.0]
    calls = []
    monkeypatch.setattr(monitoring.time, "monotonic", lambda: now[0])

    def check():
        calls.append(True)
        return ready_result().checks

    monkeypatch.setattr(monitoring, "database_checks", check)
    probe = monitoring.ReadinessProbe()
    first = probe.check()
    first.checks["database"].status = "unavailable"
    assert probe.check().checks["database"].status == "ok"
    assert len(calls) == 1
    now[0] = 21
    assert probe.check().status == "ready"
    assert len(calls) == 2


@pytest.mark.parametrize("role", [None, "pending", "evaluator", "operator"])
def test_diagnostics_rejects_unauthorized_users_before_probing(
    client, monkeypatch, role
):
    if role is not None:
        app.dependency_overrides[get_current_user] = lambda: User(
            id=1, role=role, is_active=True
        )

    async def must_not_probe(*args):
        raise AssertionError("Unauthorized diagnostics performed network checks")

    monkeypatch.setattr("app.main.connection_snapshot", must_not_probe)
    assert client.get("/api/v1/system/connections").status_code == (
        401 if role is None else 403
    )


@pytest.mark.parametrize(
    "rest_status,mqtt_enabled,mqtt_state,connected,overall",
    [
        (403, False, "disabled", False, "ok"),
        (401, False, "disabled", False, "degraded"),
        (403, True, "connected", True, "ok"),
        (403, True, "reconnecting", False, "degraded"),
        (403, True, "subscription_error", True, "degraded"),
        (200, False, "disabled", False, "degraded"),
        (503, False, "disabled", False, "degraded"),
    ],
)
def test_admin_diagnostics_report_actual_service_states(
    client, monkeypatch, rest_status, mqtt_enabled, mqtt_state, connected, overall
):
    app.dependency_overrides[get_current_user] = lambda: User(
        id=1, role="superadmin", is_active=True
    )
    app.dependency_overrides[monitoring.readiness_probe.check] = ready_result
    monkeypatch.setattr(settings, "supabase_url", "https://supabase.example.test")
    monkeypatch.setattr(settings, "supabase_anon_key", "public-key-DO-NOT-ECHO")
    monkeypatch.setattr(settings, "google_app_password", "smtp-secret-DO-NOT-ECHO")
    monkeypatch.setattr(settings, "mqtt_enabled", mqtt_enabled)
    monkeypatch.setattr(monitoring.bridge, "connected", connected)
    monkeypatch.setattr(monitoring.bridge, "state", mqtt_state)
    requests = []

    def handler(request):
        requests.append((request.method, request.url.path))
        assert request.headers["apikey"] == "public-key-DO-NOT-ECHO"
        if request.url.path == "/rest/v1/alembic_version":
            assert request.url.params["limit"] == "0"
            assert request.url.params["select"] == "version_num"
            return httpx.Response(
                rest_status,
                json={"code": "42501"}
                if rest_status == 403
                else {"message": "not a permission denial"},
            )
        return httpx.Response(200)

    original_client = httpx.AsyncClient
    monkeypatch.setattr(
        monitoring.httpx,
        "AsyncClient",
        lambda **kwargs: original_client(
            transport=httpx.MockTransport(handler), **kwargs
        ),
    )
    response = client.get("/api/v1/system/connections")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == overall
    assert set(requests) == {
        ("GET", "/auth/v1/health"),
        ("GET", "/rest/v1/alembic_version"),
    }
    assert body["checks"]["mqtt"]["required"] == mqtt_enabled
    assert body["checks"]["smtp"]["status"] in ("not_checked", "not_configured")
    assert "DO-NOT-ECHO" not in response.text
    assert response.headers["cache-control"] == "no-store"


def test_supabase_timeouts_report_unavailable_without_error_text(monkeypatch):
    import asyncio

    monkeypatch.setattr(settings, "supabase_url", "https://supabase.example.test")
    monkeypatch.setattr(settings, "supabase_anon_key", "public-key")

    def handler(request):
        raise httpx.ConnectTimeout("secret-in-error")

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await monitoring.supabase_check(client, "/auth/v1/health", "Auth")

    check = asyncio.run(run())
    assert check.status == "unavailable"
    assert "secret-in-error" not in check.message


@pytest.mark.parametrize(
    "url",
    [
        "not-a-url",
        "https://user:secret@example.test",
        "https://example.test:invalid",
        "https://example.test/auth/v1",
    ],
)
def test_bad_supabase_configuration_is_not_a_false_connection_success(monkeypatch, url):
    import asyncio

    monkeypatch.setattr(settings, "supabase_url", url)
    monkeypatch.setattr(settings, "supabase_anon_key", "public-key")

    def handler(request):
        raise AssertionError("Invalid configured URL should not be requested")

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await monitoring.supabase_check(client, "/auth/v1/health", "Auth")

    check = asyncio.run(run())
    assert check.status == "not_configured"
    assert "secret" not in check.message
