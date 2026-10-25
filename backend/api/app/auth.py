"""Supabase Auth verification and local user projection helpers."""

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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Supabase Auth is not configured")

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
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or invalid")
        response.raise_for_status()
        profile = response.json()
    except HTTPException:
        raise
    except httpx.HTTPError as auth_error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to verify Supabase session") from auth_error

    subject = profile.get("id")
    email = profile.get("email")
    if not subject or not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Supabase profile is incomplete")

    metadata = profile.get("user_metadata") or {}
    user = db.scalar(select(User).where(User.google_subject == subject))
    if user is None:
        user = User(
            google_subject=subject,
            email=email.lower(),
            display_name=metadata.get("full_name") or metadata.get("name") or email,
            avatar_url=metadata.get("avatar_url") or metadata.get("picture"),
        )
        db.add(user)
    else:
        user.email = email.lower()
        user.display_name = metadata.get("full_name") or metadata.get("name") or user.display_name
        user.avatar_url = metadata.get("avatar_url") or metadata.get("picture") or user.avatar_url
    db.commit()
    db.refresh(user)
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")
    return user
