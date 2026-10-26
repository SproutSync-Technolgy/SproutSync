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
    google_smtp_email: str = ""
    google_app_password: str = ""
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587

    model_config = SettingsConfigDict(
        env_file=REPOSITORY_ROOT / ".env",
        env_file_encoding="utf-8-sig",
        extra="ignore",
    )

    @property
    def clean_google_app_password(self) -> str:
        """Strip internal spaces and whitespace from the 16-character Google App Password."""
        return self.google_app_password.replace(" ", "").strip()


settings = Settings()
