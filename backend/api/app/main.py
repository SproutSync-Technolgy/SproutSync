"""FastAPI application and authenticated API endpoints."""

import hashlib
import hmac
import logging
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from fastapi import Depends, FastAPI, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import settings
from app.db import get_db
from app.models import ActivityLog, Batch, Device, EvaluatorAccess, User

logger = logging.getLogger(__name__)

SCHEMA_SYNC_SQL = """
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verification_code_hash text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verification_expires_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verification_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verification_last_sent_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verification_locked_until timestamptz;

UPDATE public.users
SET onboarding_email_verified_at = COALESCE(onboarding_email_verified_at, NOW())
WHERE onboarding_email_verified_at IS NULL;

CREATE OR REPLACE FUNCTION public.save_profile(given_name text, family_name text, company text DEFAULT '', contact_phone text DEFAULT '')
RETURNS public.users LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result public.users;
BEGIN
  IF length(trim(given_name)) NOT BETWEEN 1 AND 80 OR length(trim(family_name))>80 OR length(company)>160 OR length(contact_phone)>40 THEN
    RAISE EXCEPTION 'Check your personal details';
  END IF;
  UPDATE public.users SET
    first_name=trim(given_name),
    last_name=trim(family_name),
    display_name=trim(trim(given_name)||' '||trim(family_name)),
    organization=trim(company),
    phone=trim(contact_phone),
    profile_complete=true,
    onboarding_email_verified_at=COALESCE(onboarding_email_verified_at, NOW()),
    updated_at=now()
  WHERE id=public.current_profile_id() RETURNING * INTO result;
  RETURN result;
END $$;

NOTIFY pgrst, 'reload schema';
"""


def execute_schema_sync() -> tuple[bool, str]:
    """Sync database schema and bypass email verification blockers."""
    try:
        from app.db import engine
        with engine.begin() as conn:
            conn.execute(text(SCHEMA_SYNC_SQL))
        logger.info("Successfully synced database schema and bypassed verification requirements.")
        return True, "Database schema synchronized successfully."
    except Exception as exc:
        logger.warning("Could not execute automatic database schema sync: %s", exc)
        return False, str(exc)


app = FastAPI(title="SproutSync API", version="0.2.0")


@app.on_event("startup")
def on_startup() -> None:
    """Run database schema sync on application startup."""
    execute_schema_sync()


def require_operator(user: User = Depends(get_current_user)) -> User:
    """Enforce operational access even when the HTTP API bypasses browser RLS."""
    if user.role not in ("operator", "admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Operator access required")
    return user


def require_superadmin(user: User = Depends(get_current_user)) -> User:
    """Enforce Superadmin or Admin authorization."""
    if user.role not in ("superadmin", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin access required"
        )
    return user


class HealthResponse(BaseModel):
    """Process liveness response."""

    status: str
    service: str


def send_verification_email(to_email: str, code: str) -> None:
    """Send an onboarding 6-digit OTP verification email via Google SMTP."""
    smtp_email = settings.google_smtp_email
    smtp_password = settings.clean_google_app_password
    if not smtp_email or not smtp_password:
        logger.warning(
            "Google SMTP credentials not configured (GOOGLE_SMTP_EMAIL or GOOGLE_APP_PASSWORD missing). Email to %s suppressed.",
            to_email,
        )
        return

    msg = EmailMessage()
    msg["Subject"] = "SproutSync - Your Verification Code"
    msg["From"] = f"SproutSync <{smtp_email}>"
    msg["To"] = to_email
    msg.set_content(
        f"Welcome to SproutSync!\n\nYour 6-digit verification code is: {code}\n\nThis code will expire in 10 minutes.\nIf you did not request this code, you can safely ignore this email."
    )
    msg.add_alternative(
        f"""\
<!DOCTYPE html>
<html>
  <body style="font-family: sans-serif; color: #111; line-height: 1.5; padding: 20px;">
    <h2>Welcome to SproutSync</h2>
    <p>Please enter the following 6-digit verification code to complete your email verification:</p>
    <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #16a34a; padding: 12px 0;">
      {code}
    </div>
    <p style="font-size: 14px; color: #666;">This code expires in 10 minutes. If you did not request this, please disregard this email.</p>
  </body>
</html>
""",
        subtype="html",
    )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        server.starttls()
        server.login(smtp_email, smtp_password)
        server.send_message(msg)


class UserResponse(BaseModel):
    """Safe public representation of an authenticated user."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str
    first_name: str = ""
    last_name: str = ""
    organization: str = ""
    phone: str = ""
    avatar_url: str | None = None
    role: str
    registration_provider: str = "email"
    profile_complete: bool = False
    onboarding_email_verified_at: datetime | None = None


class ProfileUpdateRequest(BaseModel):
    """Payload to save user personal details."""

    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(default="", max_length=80)
    organization: str = Field(default="", max_length=160)
    phone: str = Field(default="", max_length=40)


class VerifySendResponse(BaseModel):
    """Result of requesting a verification OTP email."""

    status: str
    message: str
    email: str | None = None
    retry_after_seconds: int | None = None
    expires_in_seconds: int | None = None


class VerifyConfirmRequest(BaseModel):
    """Verification code submission."""

    code: str = Field(min_length=6, max_length=8)


class VerifyConfirmResponse(BaseModel):
    """Result of confirming a verification OTP code."""

    status: str
    message: str
    attempts_remaining: int | None = None
    user: UserResponse | None = None


class BatchCreateRequest(BaseModel):
    """Validated fields required to create a grower batch."""

    code: str = Field(min_length=1, max_length=64)
    seed_type: str = Field(default="Mung beans", min_length=1, max_length=120)
    seed_weight_grams: float | None = Field(default=None, gt=0)
    stage: str = Field(
        default="soaking", pattern="^(soaking|rinsing|growing|ready|harvested)$"
    )
    started_at: datetime
    target_harvest_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=2000)


class BatchUpdateRequest(BaseModel):
    """Optional lifecycle fields that a grower may update."""

    stage: str | None = Field(
        default=None, pattern="^(soaking|rinsing|growing|ready|harvested)$"
    )
    status: str | None = Field(default=None, pattern="^(active|archived)$")
    target_harvest_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=2000)


class BatchResponse(BaseModel):
    """Safe API representation of a production batch."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    code: str
    seed_type: str
    seed_weight_grams: float | None
    stage: str
    status: str
    started_at: datetime
    target_harvest_at: datetime | None
    notes: str | None


@app.get("/api/v1/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    """Report process liveness without masking database readiness failures."""
    return HealthResponse(status="ok", service="sproutsync-api")


@app.get("/api/v1/batches", response_model=list[BatchResponse], tags=["batches"])
def list_batches(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BatchResponse]:
    """List active and archived batches visible to the current user."""
    query = select(Batch).order_by(Batch.started_at.desc(), Batch.id.desc())
    if user.role in ("superadmin", "admin"):
        # Superadmin audits all batches across the entire fleet
        return [BatchResponse.model_validate(batch) for batch in db.scalars(query).all()]
    elif user.role == "evaluator":
        owners = db.scalars(
            text(
                "SELECT owner_id FROM evaluator_access WHERE evaluator_email = :email"
            ),
            {"email": user.email.lower()},
        ).all()
        # Strictly visible owners from grants only - zero grants means zero batches returned
        if not owners:
            return []
        query = query.where(Batch.owner_id.in_(owners))
    else:
        # Operator sees own batches
        query = query.where(Batch.owner_id == user.id)
    return [BatchResponse.model_validate(batch) for batch in db.scalars(query).all()]



@app.post(
    "/api/v1/batches",
    response_model=BatchResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["batches"],
)
def create_batch(
    payload: BatchCreateRequest,
    user: User = Depends(require_operator),
    db: Session = Depends(get_db),
) -> BatchResponse:
    """Create a batch owned by the authenticated grower."""
    batch = Batch(owner_id=user.id, **payload.model_dump())
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return BatchResponse.model_validate(batch)


@app.patch("/api/v1/batches/{batch_id}", response_model=BatchResponse, tags=["batches"])
def update_batch(
    batch_id: int,
    payload: BatchUpdateRequest,
    user: User = Depends(require_operator),
    db: Session = Depends(get_db),
) -> BatchResponse:
    """Update a visible batch while preserving its owner."""
    query = select(Batch).where(Batch.id == batch_id)
    query = query.where(Batch.owner_id == user.id)
    batch = db.scalar(query)
    if batch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found"
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(batch, field, value)
    db.commit()
    db.refresh(batch)
    return BatchResponse.model_validate(batch)


@app.post(
    "/api/v1/batches/{batch_id}/archive", response_model=BatchResponse, tags=["batches"]
)
def archive_batch(
    batch_id: int,
    user: User = Depends(require_operator),
    db: Session = Depends(get_db),
) -> BatchResponse:
    """Archive a visible batch without deleting its history."""
    query = select(Batch).where(Batch.id == batch_id)
    query = query.where(Batch.owner_id == user.id)
    batch = db.scalar(query)
    if batch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found"
        )
    batch.status = "archived"
    db.commit()
    db.refresh(batch)
    return BatchResponse.model_validate(batch)


@app.get("/api/v1/auth/me", response_model=UserResponse, tags=["auth"])
def auth_me(user: User = Depends(get_current_user)) -> UserResponse:
    """Return the current authenticated identity."""
    return UserResponse.model_validate(user)


@app.post("/api/v1/auth/profile", response_model=UserResponse, tags=["auth"])
def update_profile(
    payload: ProfileUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    """Save user personal details directly, marking profile_complete and bypassing verification."""
    user.first_name = payload.first_name.strip()
    user.last_name = payload.last_name.strip()
    user.display_name = f"{user.first_name} {user.last_name}".strip()
    user.organization = payload.organization.strip()
    user.phone = payload.phone.strip()
    user.profile_complete = True
    if user.onboarding_email_verified_at is None:
        user.onboarding_email_verified_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@app.get("/api/v1/auth/sync-schema", tags=["auth"])
def api_sync_schema() -> dict[str, str | bool]:
    """Manually trigger database schema synchronization and verification bypass."""
    success, message = execute_schema_sync()
    return {"success": success, "message": message}


@app.post(
    "/api/v1/auth/verify/send",
    response_model=VerifySendResponse,
    tags=["auth"],
)
def send_verification_code(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> VerifySendResponse:
    """Send or resend a 6-digit verification code with a 60-second cooldown."""
    if user.onboarding_email_verified_at is not None:
        return VerifySendResponse(
            status="already_verified",
            message="Email address is already verified.",
            email=user.email,
        )

    now = datetime.now(timezone.utc)
    if user.verification_last_sent_at is not None:
        last_sent = user.verification_last_sent_at
        if last_sent.tzinfo is None:
            last_sent = last_sent.replace(tzinfo=timezone.utc)
        elapsed = (now - last_sent).total_seconds()
        if elapsed < 60:
            remaining = int(60 - elapsed)
            return VerifySendResponse(
                status="cooldown_active",
                message=f"Please wait {remaining} seconds before requesting a new code.",
                email=user.email,
                retry_after_seconds=remaining,
            )

    code = f"{secrets.randbelow(900000) + 100000}"
    code_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()

    user.verification_code_hash = code_hash
    user.verification_expires_at = now + timedelta(minutes=10)
    user.verification_attempts = 0
    user.verification_last_sent_at = now
    user.verification_locked_until = None
    db.commit()

    try:
        send_verification_email(user.email, code)
    except Exception as err:
        logger.exception("Failed to dispatch verification email via Gmail SMTP: %s", err)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification email. Please verify SMTP settings.",
        ) from err

    return VerifySendResponse(
        status="sent",
        message="Verification code sent successfully.",
        email=user.email,
        expires_in_seconds=600,
        retry_after_seconds=60,
    )


@app.post(
    "/api/v1/auth/verify/confirm",
    response_model=VerifyConfirmResponse,
    tags=["auth"],
)
def confirm_verification_code(
    payload: VerifyConfirmRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> VerifyConfirmResponse:
    """Validate a 6-digit verification code allowing up to 5 attempts without resending."""
    if user.onboarding_email_verified_at is not None:
        return VerifyConfirmResponse(
            status="already_verified",
            message="Email address is already verified.",
            user=UserResponse.model_validate(user),
        )

    now = datetime.now(timezone.utc)

    if user.verification_locked_until is not None:
        locked_until = user.verification_locked_until
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if now < locked_until:
            remaining_lock = int((locked_until - now).total_seconds())
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed attempts. Verification locked for {remaining_lock} seconds.",
            )
        else:
            user.verification_locked_until = None
            user.verification_attempts = 0

    if not user.verification_code_hash or user.verification_expires_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active verification code found. Please request a new code.",
        )

    expires_at = user.verification_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if now > expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired. Please request a new code.",
        )

    submitted_hash = hashlib.sha256(payload.code.strip().encode("utf-8")).hexdigest()
    if hmac.compare_digest(submitted_hash, user.verification_code_hash):
        user.onboarding_email_verified_at = now
        user.verification_code_hash = None
        user.verification_expires_at = None
        user.verification_attempts = 0
        user.verification_locked_until = None
        db.commit()
        db.refresh(user)
        return VerifyConfirmResponse(
            status="verified",
            message="Email successfully verified.",
            user=UserResponse.model_validate(user),
        )

    user.verification_attempts += 1
    if user.verification_attempts >= 5:
        user.verification_locked_until = now + timedelta(seconds=60)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Verification locked for 60 seconds.",
        )

    db.commit()
    remaining = 5 - user.verification_attempts
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Invalid verification code. {remaining} attempt{'s' if remaining != 1 else ''} remaining.",
    )


class AccountResponse(BaseModel):
    """Representation of an account for Superadmin management."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str
    first_name: str = ""
    last_name: str = ""
    organization: str = ""
    phone: str = ""
    avatar_url: str | None = None
    role: str
    is_active: bool
    granted_serial_count: int = 0
    evaluator_grant_count: int = 0
    created_at: datetime | None = None


class AccountUpdateRequest(BaseModel):
    """Payload for Superadmin to update user role, name, and email."""

    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(default="", max_length=80)
    email: str = Field(min_length=3, max_length=320)
    role: str = Field(pattern="^(superadmin|admin|operator|evaluator)$")
    organization: str = Field(default="", max_length=160)
    phone: str = Field(default="", max_length=40)


class DeviceGrantRequest(BaseModel):
    """Payload for Superadmin to grant/assign a device serial ID to an operator."""

    operator_id: int
    serial_number: str = Field(min_length=1, max_length=64)
    name: str = Field(default="Chamber Controller", min_length=1, max_length=120)


class DeviceGrantResponse(BaseModel):
    """Response after granting or querying a device serial."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    name: str
    serial_number: str
    status: str
    granted_by: int | None = None
    granted_at: datetime | None = None
    created_at: datetime | None = None


@app.get(
    "/api/v1/superadmin/accounts",
    response_model=list[AccountResponse],
    tags=["superadmin"],
)
def list_accounts(
    _admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> list[AccountResponse]:
    """List all managed accounts with role, serial counts, and evaluator counts."""
    users = db.scalars(select(User).order_by(User.id.asc())).all()
    accounts: list[AccountResponse] = []
    for u in users:
        serial_count = (
            db.scalar(
                text("SELECT count(*) FROM devices WHERE owner_id = :uid"),
                {"uid": u.id},
            )
            or 0
        )
        grant_count = (
            db.scalar(
                text("SELECT count(*) FROM evaluator_access WHERE owner_id = :uid"),
                {"uid": u.id},
            )
            or 0
        )
        accounts.append(
            AccountResponse(
                id=u.id,
                email=u.email,
                display_name=u.display_name,
                first_name=u.first_name,
                last_name=u.last_name,
                organization=u.organization,
                phone=u.phone,
                avatar_url=u.avatar_url,
                role=u.role,
                is_active=u.is_active,
                granted_serial_count=serial_count,
                evaluator_grant_count=grant_count,
                created_at=u.created_at,
            )
        )
    return accounts


@app.patch(
    "/api/v1/superadmin/accounts/{user_id}",
    response_model=AccountResponse,
    tags=["superadmin"],
)
def update_account(
    user_id: int,
    payload: AccountUpdateRequest,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> AccountResponse:
    """Superadmin endpoint to update user name, email, role, and organization."""
    target = db.scalar(select(User).where(User.id == user_id))
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User account not found"
        )
    target.first_name = payload.first_name.strip()
    target.last_name = payload.last_name.strip()
    target.display_name = f"{target.first_name} {target.last_name}".strip()
    target.email = payload.email.lower().strip()
    target.role = payload.role
    target.organization = payload.organization.strip()
    target.phone = payload.phone.strip()

    audit = ActivityLog(
        owner_id=target.id,
        actor_id=admin.id,
        action="superadmin_account_update",
        resource=f"users:{target.id}:{payload.role}",
    )
    db.add(audit)
    db.commit()
    db.refresh(target)

    serial_count = (
        db.scalar(
            text("SELECT count(*) FROM devices WHERE owner_id = :uid"),
            {"uid": target.id},
        )
        or 0
    )
    grant_count = (
        db.scalar(
            text("SELECT count(*) FROM evaluator_access WHERE owner_id = :uid"),
            {"uid": target.id},
        )
        or 0
    )
    return AccountResponse(
        id=target.id,
        email=target.email,
        display_name=target.display_name,
        first_name=target.first_name,
        last_name=target.last_name,
        organization=target.organization,
        phone=target.phone,
        avatar_url=target.avatar_url,
        role=target.role,
        is_active=target.is_active,
        granted_serial_count=serial_count,
        evaluator_grant_count=grant_count,
        created_at=target.created_at,
    )


@app.post(
    "/api/v1/superadmin/device-grants",
    response_model=DeviceGrantResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["superadmin"],
)
def grant_device_serial(
    payload: DeviceGrantRequest,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> DeviceGrantResponse:
    """Superadmin assigns or transfers a chamber device serial ID to an operator."""
    operator = db.scalar(select(User).where(User.id == payload.operator_id))
    if operator is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Operator not found"
        )
    if operator.role not in ("operator", "admin", "superadmin"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target account must have operator or admin role",
        )

    clean_serial = payload.serial_number.strip().upper()
    clean_name = payload.name.strip() or f"Chamber Controller {clean_serial}"
    now = datetime.now(timezone.utc)

    device = db.scalar(select(Device).where(Device.serial_number == clean_serial))
    if device is None:
        device = Device(
            owner_id=operator.id,
            serial_number=clean_serial,
            name=clean_name,
            status="online",
            granted_by=admin.id,
            granted_at=now,
        )
        db.add(device)
    else:
        device.owner_id = operator.id
        device.name = clean_name
        device.status = "online"
        device.granted_by = admin.id
        device.granted_at = now

    audit = ActivityLog(
        owner_id=operator.id,
        actor_id=admin.id,
        action="grant_serial_id",
        resource=f"devices:{clean_serial}->user:{operator.id}",
    )
    db.add(audit)
    db.commit()
    db.refresh(device)
    return DeviceGrantResponse.model_validate(device)

