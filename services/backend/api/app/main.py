"""FastAPI application and authentication endpoints."""

import secrets

import httpx
from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import (
    create_session,
    exchange_google_code,
    get_current_user,
    google_authorization_url,
    remove_session,
    require_google_configuration,
    set_session_cookie,
)
from app.config import settings
from app.db import get_db
from app.models import User

app = FastAPI(title="SproutSync API", version="0.2.0")


class HealthResponse(BaseModel):
    """Process liveness response."""

    status: str
    service: str


class UserResponse(BaseModel):
    """Safe public representation of an authenticated user."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str
    avatar_url: str | None
    role: str


@app.get("/api/v1/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    """Report process liveness without masking database readiness failures."""
    return HealthResponse(status="ok", service="sproutsync-api")


@app.get("/api/v1/auth/google", tags=["auth"])
def google_login() -> RedirectResponse:
    """Start Google OAuth after validating that credentials are configured."""
    require_google_configuration()
    state = secrets.token_urlsafe(32)
    response = RedirectResponse(
        google_authorization_url(state),
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    )
    response.set_cookie(
        "sproutsync_oauth_state",
        state,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        max_age=600,
        path="/",
    )
    return response


@app.get("/api/v1/auth/google/callback", tags=["auth"])
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> Response:
    """Validate OAuth state, upsert the user, and issue a server session."""
    if error:
        raise HTTPException(status_code=400, detail=f"Google OAuth failed: {error}")
    expected_state = request.cookies.get("sproutsync_oauth_state", "")
    if not code or not state or not secrets.compare_digest(state, expected_state):
        raise HTTPException(status_code=400, detail="Invalid Google OAuth state or callback code")
    require_google_configuration()
    try:
        profile = await exchange_google_code(code)
    except (ValueError, httpx.HTTPError) as oauth_error:
        raise HTTPException(status_code=502, detail="Unable to verify Google identity") from oauth_error

    user = db.scalar(select(User).where(User.google_subject == profile["google_subject"]))
    if user is None:
        user = User(**profile)
        db.add(user)
    else:
        user.email = profile["email"]
        user.display_name = profile["display_name"]
        user.avatar_url = profile["avatar_url"]
    db.commit()
    db.refresh(user)
    token = create_session(db, user)
    response = RedirectResponse("/", status_code=status.HTTP_303_SEE_OTHER)
    set_session_cookie(response, token)
    response.delete_cookie("sproutsync_oauth_state", path="/")
    return response


@app.get("/api/v1/auth/me", response_model=UserResponse, tags=["auth"])
def auth_me(user: User = Depends(get_current_user)) -> UserResponse:
    """Return the current authenticated identity."""
    return UserResponse.model_validate(user)


@app.post("/api/v1/auth/logout", status_code=status.HTTP_204_NO_CONTENT, tags=["auth"])
def logout(
    response: Response,
    session_token: str | None = Cookie(default=None, alias=settings.session_cookie_name),
    db: Session = Depends(get_db),
) -> None:
    """Revoke the current server session and clear its browser cookie."""
    remove_session(db, session_token)
    response.delete_cookie(settings.session_cookie_name, path="/")
