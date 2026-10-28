"""Regression coverage for clone and container startup failures."""

from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from app.check_setup import main, validate_settings
from app.config import Settings, _find_repo_root
from app.main import app


def test_shallow_container_layout_does_not_index_past_root(tmp_path):
    module = tmp_path / "app" / "app" / "config.py"
    assert _find_repo_root(module) == tmp_path / "app"
    # Also exercise the shallowest possible absolute path on this OS.
    shallow = Path(tmp_path.anchor) / "app" / "config.py"
    assert _find_repo_root(shallow) == Path(tmp_path.anchor)


def test_source_checkout_and_export_find_compose_marker(tmp_path):
    (tmp_path / "compose.yaml").touch()
    assert (
        _find_repo_root(tmp_path / "backend" / "api" / "app" / "config.py") == tmp_path
    )


def test_runtime_environment_overrides_root_dotenv(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\ufeffSUPABASE_URL=https://file.supabase.co\n", encoding="utf-8"
    )
    monkeypatch.setenv("SUPABASE_URL", "https://runtime.supabase.co")
    assert Settings(_env_file=env_file).supabase_url == "https://runtime.supabase.co"
    monkeypatch.delenv("SUPABASE_URL")
    assert Settings(_env_file=env_file).supabase_url == "https://file.supabase.co"


def test_startup_check_rejects_in_memory_database_for_runtime():
    config = Settings(
        _env_file=None, database_url="sqlite://", supabase_url="", supabase_anon_key=""
    )
    assert len(validate_settings(config)) == 2


def test_database_check_errors_do_not_print_credentials(capsys):
    config = Settings(
        _env_file=None,
        database_url="postgresql+psycopg://postgres:private-password@db.example.invalid/postgres",
        supabase_url="https://dev.supabase.co",
        supabase_anon_key="public-key",
    )
    with (
        patch("app.check_setup.settings", config),
        patch(
            "app.check_setup.check_database",
            side_effect=SQLAlchemyError(config.database_url),
        ),
    ):
        assert main() == 1
    output = capsys.readouterr().out
    assert "cannot connect" in output
    assert "private-password" not in output


def test_plain_postgres_is_rejected_before_migrations(capsys):
    config = Settings(
        _env_file=None,
        database_url="postgresql+psycopg://postgres:postgres@localhost/postgres",
        supabase_url="https://dev.supabase.co",
        supabase_anon_key="public-key",
    )
    with (
        patch("app.check_setup.settings", config),
        patch("app.check_setup.check_database", return_value=False),
    ):
        assert main() == 1
    assert "plain PostgreSQL alone is insufficient" in capsys.readouterr().out


def test_api_startup_does_not_mutate_schema_or_verification():
    with patch(
        "app.db.engine.connect",
        side_effect=AssertionError("Unexpected startup DB access"),
    ):
        with TestClient(app) as client:
            assert client.get("/api/v1/health").json()["status"] == "ok"
            assert client.get("/api/v1/auth/me").status_code == 401
            assert client.get("/api/v1/auth/sync-schema").status_code == 404
