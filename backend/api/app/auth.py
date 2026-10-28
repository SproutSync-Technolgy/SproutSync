from datetime import datetime, timezone
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Session = Depends(get_db),
) -> User:
    """Verify a Supabase access token and project its identity into local users."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase Auth is not configured",
        )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                headers={
                    "apikey": settings.supabase_anon_key,
                    "Authorization": f"Bearer {credentials.credentials}",
                },
            )
        if response.status_code == 401:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired or invalid",
            )
        response.raise_for_status()
        profile = response.json()
    except HTTPException:
        raise
    except httpx.HTTPError as auth_error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to verify Supabase session",
        ) from auth_error

    subject = profile.get("id")
    email = profile.get("email")
    if not subject or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Supabase profile is incomplete",
        )
    if not profile.get("email_confirmed_at"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verify your email before continuing",
        )

    metadata = profile.get("user_metadata") or {}
    app_metadata = profile.get("app_metadata") or {}
    providers = app_metadata.get("providers") or []
    provider = app_metadata.get("provider") or ("google" if "google" in providers else "email")
    is_google = (provider == "google") or ("google" in providers)

    display_name = (
        metadata.get("full_name") or metadata.get("name") or email.split("@")[0]
    )
    normalized_email = email.lower().strip()
    # Match strictly by google_subject. Fall back to email only if user has never linked subject.
    user = db.scalar(select(User).where(User.google_subject == subject))
    if user is None:
        user = db.scalar(select(User).where(User.email == normalized_email))
        if user is not None:
            user.google_subject = subject

    now_utc = datetime.now(timezone.utc)
    if user is None:
        user = User(
            google_subject=subject,
            email=normalized_email,
            display_name=display_name,
            avatar_url=metadata.get("avatar_url") or metadata.get("picture"),
            role="pending",
            registration_provider="google" if is_google else "email",
            onboarding_email_verified_at=now_utc,
        )
        db.add(user)
    else:
        # Never overwrite user.email or user.display_name after link!
        if is_google and not user.registration_provider:
            user.registration_provider = "google"
        if user.onboarding_email_verified_at is None:
            user.onboarding_email_verified_at = now_utc

        if (metadata.get("avatar_url") or metadata.get("picture")) and not user.avatar_url:
            user.avatar_url = metadata.get("avatar_url") or metadata.get("picture")
    db.commit()
    db.refresh(user)
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive"
        )
    return user


async def sync_supabase_user_email(google_subject: str | None, new_email: str) -> bool:
    """Sync an email correction to Supabase Auth admin API if service-role key is configured."""
    if (
        not settings.supabase_url
        or not settings.supabase_service_role_key
        or not google_subject
    ):
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.put(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{google_subject}",
                headers={
                    "apikey": settings.supabase_service_role_key,
                    "Authorization": f"Bearer {settings.supabase_service_role_key}",
                },
                json={"email": new_email.lower().strip(), "email_confirm": True},
            )
            return res.is_success
    except Exception:
        return False

