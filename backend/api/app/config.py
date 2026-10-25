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
    """Runtime settings for database, sessions, and Google OAuth."""

    database_url: str = "sqlite+pysqlite:///:memory:"
    session_cookie_secure: bool = False
    session_cookie_name: str = "sproutsync_session"
    session_ttl_seconds: int = 60 * 60 * 24 * 7
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"
    frontend_url: str = "http://localhost:5173"
    google_userinfo_url: str = "https://openidconnect.googleapis.com/v1/userinfo"
    google_authorize_url: str = "https://accounts.google.com/o/oauth2/v2/auth"
    google_token_url: str = "https://oauth2.googleapis.com/token"

    model_config = SettingsConfigDict(env_file=REPOSITORY_ROOT / ".env", extra="ignore")


settings = Settings()
