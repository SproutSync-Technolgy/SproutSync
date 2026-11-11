"""The deployment checker must detect failures without invoking write routes."""

import importlib.util
import io
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from fastapi.testclient import TestClient

from app.main import app

spec = importlib.util.spec_from_file_location(
    "sproutsync_backend_checker",
    Path(__file__).resolve().parents[3] / "scripts/check_backend.py",
)
checker_module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = checker_module
spec.loader.exec_module(checker_module)


class LocalBackend:
    def __init__(self, *, ready=True, token=False):
        self.client = TestClient(app)
        self.paths = []
        self.ready = ready
        self.token = token

    def open(self, request, timeout):
        assert request.method == "GET", "The checker tried a write operation"
        path = urlsplit(request.full_url).path
        self.paths.append(path)
        if path == "/api/v1/ready":
            body = {
                "status": "ready" if self.ready else "not_ready",
                "checks": {
                    "database": {"status": "ok"},
                    "schema": {"status": "ok"},
                },
            }
            code = 200 if self.ready else 503
        elif self.token and request.get_header("Authorization"):
            if path == "/api/v1/auth/me":
                body = {"id": 1, "role": "operator"}
            elif path == "/api/v1/batches":
                body = []
            elif path == "/api/v1/devices/live":
                body = {
                    "devices": [],
                    "readings": [],
                    "latest_readings": [],
                    "mqtt": {"state": "disabled", "connected": False},
                }
            else:
                raise AssertionError("Unexpected authenticated request")
            code = 200
        else:
            response = self.client.get(path)
            result = io.BytesIO(response.content)
            result.code = response.status_code
            return result
        result = io.BytesIO(json.dumps(body).encode())
        result.code = code
        return result


@pytest.mark.parametrize("ready", [True, False])
def test_public_smoke_detects_readiness_failure_without_writes(ready):
    checker = checker_module.BackendChecker("http://localhost:8000")
    checker.opener = LocalBackend(ready=ready)
    results = checker.run()
    failures = [row.check for row in results if row.status == "FAIL"]
    assert failures == ([] if ready else ["Database/schema readiness"])
    assert "/api/v1/system/connections" in checker.opener.paths
    assert "/api/v1/batches" not in checker.opener.paths
    assert results[-1].status == "SKIP"


def test_operator_smoke_accepts_empty_authorized_lists_and_skips_admin():
    checker = checker_module.BackendChecker(
        "http://localhost:8000", "session-DO-NOT-ECHO"
    )
    checker.opener = LocalBackend(token=True)
    results = checker.run()
    assert not any(result.status == "FAIL" for result in results)
    assert "DO-NOT-ECHO" not in str(results)
    assert any(
        result.check == "MQTT bridge" and result.status == "SKIP" for result in results
    )
    assert results[-1].status == "SKIP"


@pytest.mark.parametrize(
    "url",
    [
        "file:///tmp/example",
        "https://user:password@example.test",
        "https://example.test?key=value",
        "https://example.test#fragment",
    ],
)
def test_checker_rejects_secret_bearing_or_non_http_urls(url):
    with pytest.raises(ValueError):
        checker_module.BackendChecker(url)


def test_token_requires_https_outside_localhost_and_redirects_are_not_followed():
    with pytest.raises(ValueError):
        checker_module.BackendChecker("http://example.test", "session")
    assert (
        checker_module.NoRedirect().redirect_request(
            None, None, 302, "", {}, "https://elsewhere.test"
        )
        is None
    )


def test_schema_from_an_unrelated_service_is_rejected():
    assert (
        checker_module.BackendChecker.valid_schema({"info": {"title": "Another API"}})
        is False
    )


@pytest.mark.parametrize(
    "body",
    [
        None,
        [],
        {"info": "not a schema"},
        {"info": {"title": "SproutSync API"}, "paths": [], "components": None},
    ],
)
def test_malformed_schema_is_a_failed_contract_check(body):
    assert checker_module.BackendChecker.valid_schema(body) is False


def test_readiness_payload_must_include_successful_database_and_schema_checks():
    assert checker_module.BackendChecker.valid_readiness({"status": "ready"}) is False
    assert (
        checker_module.BackendChecker.valid_readiness(
            {
                "status": "ready",
                "checks": {
                    "database": {"status": "ok"},
                    "schema": {"status": "out_of_date"},
                },
            }
        )
        is False
    )
