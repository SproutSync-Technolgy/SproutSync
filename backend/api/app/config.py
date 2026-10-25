"""Application configuration loaded from environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

def _find_repo_root() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / ".git").exists() or (parent / "compose.yaml").exists():
            return parent
    return current.parent.parent


REPOSITORY_ROOT = _find_repo_root()


class Settings(BaseSettings):
    """Runtime settings for database, Supabase Auth, and the frontend."""

    database_url: str = "sqlite+pysqlite:///:memory:"
    supabase_url: str = ""
    supabase_anon_key: str = ""
    frontend_url: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=REPOSITORY_ROOT / ".env", extra="ignore")


settings = Settings()
