"""Google OAuth and secure server-side session helpers."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import SessionRecord, User


def _hash_token(token: str) -> str:
    """Hash a session token before it is stored in PostgreSQL."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _google_configured() -> bool:
    """Return whether both required Google OAuth credentials are available."""
    return bool(settings.google_client_id and settings.google_client_secret)


def google_authorization_url(state: str) -> str:
    """Build a Google authorization URL with the minimum required scopes."""
    query = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": settings.google_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "offline",
            "prompt": "select_account",
        }
    )
    return f"{settings.google_authorize_url}?{query}"


async def exchange_google_code(code: str) -> dict[str, str]:
    """Exchange an authorization code and retrieve the verified Google profile."""
    async with httpx.AsyncClient(timeout=10) as client:
        token_response = await client.post(
            settings.google_token_url,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        token_response.raise_for_status()
        access_token = token_response.json().get("access_token")
        if not access_token:
            raise ValueError("Google did not return an access token")
        profile_response = await client.get(
            settings.google_userinfo_url,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        profile_response.raise_for_status()
        profile = profile_response.json()

    subject = profile.get("sub")
    email = profile.get("email")
    if not subject or not email or profile.get("email_verified") is not True:
        raise ValueError("Google profile is missing a verified identity")
    return {
        "google_subject": subject,
        "email": email.lower(),
        "display_name": profile.get("name") or email,
        "avatar_url": profile.get("picture"),
    }


def create_session(db: Session, user: User) -> str:
    """Create a random session token while persisting only its hash."""
    raw_token = secrets.token_urlsafe(32)
    db.add(
        SessionRecord(
            token_hash=_hash_token(raw_token),
            user_id=user.id,
            expires_at=datetime.now(UTC) + timedelta(seconds=settings.session_ttl_seconds),
        )
    )
    db.commit()
    return raw_token


def get_current_user(
    session_token: str | None = Cookie(default=None, alias=settings.session_cookie_name),
    db: Session = Depends(get_db),
) -> User:
    """Resolve and validate the current user from the HTTP-only session cookie."""
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    record = db.scalar(
        select(SessionRecord).where(
            SessionRecord.token_hash == _hash_token(session_token),
            SessionRecord.expires_at > datetime.now(UTC),
        )
    )
    if not record or not record.user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or invalid")
    return record.user


def remove_session(db: Session, raw_token: str | None) -> None:
    """Delete the server-side session matching a cookie token."""
    if raw_token:
        db.execute(delete(SessionRecord).where(SessionRecord.token_hash == _hash_token(raw_token)))
        db.commit()


def set_session_cookie(response: object, token: str) -> None:
    """Set a restrictive session cookie on a FastAPI response."""
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        max_age=settings.session_ttl_seconds,
        path="/",
    )


def require_google_configuration() -> None:
    """Raise an explicit configuration error when OAuth credentials are absent."""
    if not _google_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )
