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
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.orm import Session

from app.auth import get_current_user, sync_supabase_user_email
from app.config import settings
from app.db import get_db
from app.models import AccessRequest, ActivityLog, Batch, Device, EvaluatorAccess, User

logger = logging.getLogger(__name__)

app = FastAPI(title="SproutSync API", version="0.2.0")


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
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Verification email delivery is not configured. Set GOOGLE_SMTP_EMAIL and GOOGLE_APP_PASSWORD on the server.",
        )

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
                "SELECT owner_id FROM evaluator_access WHERE evaluator_id = :uid OR evaluator_email = :email"
            ),
            {"uid": user.id, "email": user.email.lower()},
        ).all()
        # Strictly visible owners from grants only - zero grants means zero batches returned
        if not owners:
            return []
        query = query.where(Batch.owner_id.in_(owners))
    elif user.role == "operator":
        # Operator sees own batches
        query = query.where(Batch.owner_id == user.id)
    else:
        # Pending users or unknown roles see zero batches
        return []
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

    try:
        send_verification_email(user.email, code)
    except HTTPException:
        db.rollback()
        raise
    except (smtplib.SMTPException, OSError) as err:
        db.rollback()
        logger.warning("Verification email delivery failed (%s)", type(err).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to send verification email. Please verify SMTP settings.",
        ) from err
    db.commit()

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


class EvaluatorSummary(BaseModel):
    """Summary of a linked evaluator account."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    display_name: str
    first_name: str = ""
    last_name: str = ""
    email: str
    is_active: bool = True
    granted_at: datetime | None = None


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
    serial_numbers: list[str] = Field(default_factory=list)
    evaluators: list[EvaluatorSummary] = Field(default_factory=list)
    created_at: datetime | None = None


class AccountUpdateRequest(BaseModel):
    """Payload for Superadmin to update user role, name, and email."""

    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(default="", max_length=80)
    email: str = Field(min_length=3, max_length=320)
    role: str = Field(pattern="^(superadmin|admin|operator|evaluator|pending)$")
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


class AssignEvaluatorRequest(BaseModel):
    """Payload to assign or reassign an evaluator to an operator."""

    evaluator_id: int
    operator_id: int


class UpdateEvaluatorRequest(BaseModel):
    """Payload for an operator to update their linked evaluator's details."""

    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(default="", max_length=80)
    email: str = Field(min_length=3, max_length=320)


class CreateAccessRequest(BaseModel):
    """Payload for a pending user to request access to an operator."""

    operator_email: str = Field(min_length=3, max_length=320)


class AccessRequestResponse(BaseModel):
    """Response representing an access request."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    evaluator_id: int
    operator_id: int
    status: str
    evaluator_name: str | None = None
    evaluator_email: str | None = None
    created_at: datetime | None = None
    decided_at: datetime | None = None


@app.get(
    "/api/v1/superadmin/accounts",
    response_model=list[AccountResponse],
    tags=["superadmin"],
)
@app.get(
    "/superadmin/accounts",
    response_model=list[AccountResponse],
    include_in_schema=False,
)
def list_accounts(
    _admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> list[AccountResponse]:
    """List all accounts across the fleet with serial numbers, linked evaluators, and pending users."""
    users = db.scalars(select(User).order_by(User.id.asc())).all()
    accounts: list[AccountResponse] = []
    for u in users:
        devices = db.scalars(select(Device).where(Device.owner_id == u.id)).all()
        serial_numbers = [d.serial_number for d in devices]

        linked_evaluators: list[EvaluatorSummary] = []
        grants = db.scalars(select(EvaluatorAccess).where(EvaluatorAccess.owner_id == u.id)).all()
        for g in grants:
            eval_user = None
            if g.evaluator_id:
                eval_user = db.scalar(select(User).where(User.id == g.evaluator_id))
            if eval_user is None and g.evaluator_email:
                eval_user = db.scalar(select(User).where(func.lower(User.email) == g.evaluator_email.lower().strip()))
            if eval_user:
                linked_evaluators.append(
                    EvaluatorSummary(
                        id=eval_user.id,
                        display_name=eval_user.display_name or f"{eval_user.first_name} {eval_user.last_name}".strip() or eval_user.email,
                        first_name=eval_user.first_name,
                        last_name=eval_user.last_name,
                        email=eval_user.email,
                        is_active=eval_user.is_active,
                        granted_at=g.granted_at or g.created_at,
                    )
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
                granted_serial_count=len(serial_numbers),
                evaluator_grant_count=len(linked_evaluators),
                serial_numbers=serial_numbers,
                evaluators=linked_evaluators,
                created_at=u.created_at,
            )
        )
    return accounts


@app.patch(
    "/api/v1/superadmin/accounts/{user_id}",
    response_model=AccountResponse,
    tags=["superadmin"],
)
@app.patch(
    "/superadmin/accounts/{user_id}",
    response_model=AccountResponse,
    include_in_schema=False,
)
async def update_account(
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

    # Block demoting the last superadmin
    if target.role in ("superadmin", "admin") and payload.role not in ("superadmin", "admin"):
        admin_count = (
            db.scalar(
                select(func.count(User.id)).where(
                    User.role.in_(["superadmin", "admin"]), User.is_active.is_(True)
                )
            )
            or 0
        )
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote the last superadmin",
            )

    new_email = payload.email.lower().strip()
    target.first_name = payload.first_name.strip()
    target.last_name = payload.last_name.strip()
    target.display_name = f"{target.first_name} {target.last_name}".strip()
    target.email = new_email
    target.role = payload.role
    target.organization = payload.organization.strip()
    target.phone = payload.phone.strip()

    # Keep evaluator_access synced if this user is linked as an evaluator
    db.execute(
        update(EvaluatorAccess)
        .where(EvaluatorAccess.evaluator_id == target.id)
        .values(evaluator_email=new_email)
    )

    audit = ActivityLog(
        owner_id=target.id,
        actor_id=admin.id,
        action="superadmin_account_update",
        resource=f"users:{target.id}:{payload.role}",
    )
    db.add(audit)
    db.commit()
    db.refresh(target)

    # Sync Supabase Auth admin API if service role key is present
    await sync_supabase_user_email(target.google_subject, new_email)

    devices = db.scalars(select(Device).where(Device.owner_id == target.id)).all()
    serial_numbers = [d.serial_number for d in devices]
    grants = db.scalars(select(EvaluatorAccess).where(EvaluatorAccess.owner_id == target.id)).all()

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
        granted_serial_count=len(serial_numbers),
        evaluator_grant_count=len(grants),
        serial_numbers=serial_numbers,
        evaluators=[],
        created_at=target.created_at,
    )


@app.delete(
    "/api/v1/superadmin/accounts/{user_id}",
    tags=["superadmin"],
)
@app.delete(
    "/superadmin/accounts/{user_id}",
    include_in_schema=False,
)
def delete_account(
    user_id: int,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> dict[str, bool | int]:
    """Permanently delete a user account and unbind related associations."""
    target = db.scalar(select(User).where(User.id == user_id))
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    if target.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own active superadmin account",
        )
    if target.role in ("superadmin", "admin"):
        remaining_superadmins = db.scalar(
            select(func.count(User.id)).where(
                User.role.in_(("superadmin", "admin")),
                User.is_active.is_(True),
                User.id != target.id,
            )
        )
        if not remaining_superadmins or remaining_superadmins <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last active superadmin",
            )

    # Clear associated evaluator_access
    db.execute(
        delete(EvaluatorAccess).where(
            (EvaluatorAccess.owner_id == target.id)
            | (EvaluatorAccess.evaluator_id == target.id)
        )
    )

    # Clear associated access_requests
    db.execute(
        delete(AccessRequest).where(
            (AccessRequest.operator_id == target.id)
            | (AccessRequest.evaluator_id == target.id)
        )
    )

    # Unbind devices
    devices = db.scalars(select(Device).where(Device.owner_id == target.id)).all()
    for d in devices:
        d.owner_id = None

    # Audit log
    audit = ActivityLog(
        owner_id=admin.id,
        actor_id=admin.id,
        action="superadmin_account_delete",
        resource=f"users:{target.id}:{target.role}:{target.email}",
    )
    db.add(audit)

    # Delete target user
    db.delete(target)
    db.commit()

    return {"success": True, "deleted_id": user_id}


@app.post(
    "/api/v1/superadmin/device-grants",
    response_model=DeviceGrantResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["superadmin"],
)
@app.post(
    "/superadmin/device-grants",
    response_model=DeviceGrantResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
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


@app.post(
    "/api/v1/superadmin/assign-evaluator",
    tags=["superadmin"],
)
@app.post(
    "/superadmin/assign-evaluator",
    tags=["superadmin"],
    include_in_schema=False,
)
def assign_evaluator(
    payload: AssignEvaluatorRequest,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> dict:
    """Superadmin assigns or reassigns an evaluator to a specific operator (1-to-1)."""
    operator = db.scalar(select(User).where(User.id == payload.operator_id))
    if operator is None or operator.role not in ("operator", "admin", "superadmin"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Operator not found"
        )
    evaluator = db.scalar(select(User).where(User.id == payload.evaluator_id))
    if evaluator is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Evaluator not found"
        )

    evaluator.role = "evaluator"
    now = datetime.now(timezone.utc)

    grant = db.scalar(select(EvaluatorAccess).where(EvaluatorAccess.evaluator_id == evaluator.id))
    if grant is None:
        grant = EvaluatorAccess(
            owner_id=operator.id,
            evaluator_id=evaluator.id,
            evaluator_email=evaluator.email,
            granted_by=admin.id,
            granted_at=now,
        )
        db.add(grant)
    else:
        grant.owner_id = operator.id
        grant.evaluator_email = evaluator.email
        grant.granted_by = admin.id
        grant.granted_at = now

    audit = ActivityLog(
        owner_id=operator.id,
        actor_id=admin.id,
        action="superadmin_assign_evaluator",
        resource=f"evaluator:{evaluator.id}->operator:{operator.id}",
    )
    db.add(audit)
    db.commit()
    return {"success": True, "evaluator_id": evaluator.id, "operator_id": operator.id}


@app.get(
    "/api/v1/operator/evaluators",
    response_model=list[EvaluatorSummary],
    tags=["operator"],
)
@app.get(
    "/operator/evaluators",
    response_model=list[EvaluatorSummary],
    include_in_schema=False,
)
def list_operator_evaluators(
    operator: User = Depends(require_operator),
    db: Session = Depends(get_db),
) -> list[EvaluatorSummary]:
    """List all Evaluators linked directly to this Operator's chambers."""
    grants = db.scalars(select(EvaluatorAccess).where(EvaluatorAccess.owner_id == operator.id)).all()
    evaluators: list[EvaluatorSummary] = []
    for g in grants:
        eval_user = None
        if g.evaluator_id:
            eval_user = db.scalar(select(User).where(User.id == g.evaluator_id))
        if eval_user is None and g.evaluator_email:
            eval_user = db.scalar(select(User).where(func.lower(User.email) == g.evaluator_email.lower().strip()))
        if eval_user:
            evaluators.append(
                EvaluatorSummary(
                    id=eval_user.id,
                    display_name=eval_user.display_name or f"{eval_user.first_name} {eval_user.last_name}".strip() or eval_user.email,
                    first_name=eval_user.first_name,
                    last_name=eval_user.last_name,
                    email=eval_user.email,
                    is_active=eval_user.is_active,
                    granted_at=g.granted_at or g.created_at,
                )
            )
    return evaluators


@app.patch(
    "/api/v1/operator/evaluators/{evaluator_id}",
    response_model=EvaluatorSummary,
    tags=["operator"],
)
@app.patch(
    "/operator/evaluators/{evaluator_id}",
    response_model=EvaluatorSummary,
    include_in_schema=False,
)
async def update_operator_evaluator(
    evaluator_id: int,
    payload: UpdateEvaluatorRequest,
    operator: User = Depends(require_operator),
    db: Session = Depends(get_db),
) -> EvaluatorSummary:
    """Operator updates name and email of an Evaluator linked to their chambers."""
    grant = db.scalar(
        select(EvaluatorAccess).where(
            EvaluatorAccess.evaluator_id == evaluator_id,
            EvaluatorAccess.owner_id == operator.id,
        )
    )
    if grant is None and operator.role not in ("superadmin", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this evaluator",
        )

    target = db.scalar(select(User).where(User.id == evaluator_id))
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Evaluator not found"
        )

    clean_email = payload.email.lower().strip()
    target.first_name = payload.first_name.strip()
    target.last_name = payload.last_name.strip()
    target.display_name = f"{target.first_name} {target.last_name}".strip()
    target.email = clean_email
    # Operators cannot change user role!

    if grant:
        grant.evaluator_email = clean_email

    audit = ActivityLog(
        owner_id=operator.id,
        actor_id=operator.id,
        action="operator_update_evaluator",
        resource=f"users:{target.id}:{clean_email}",
    )
    db.add(audit)
    db.commit()
    db.refresh(target)

    await sync_supabase_user_email(target.google_subject, clean_email)

    return EvaluatorSummary(
        id=target.id,
        display_name=target.display_name,
        first_name=target.first_name,
        last_name=target.last_name,
        email=target.email,
        is_active=target.is_active,
        granted_at=grant.granted_at if grant else None,
    )


@app.get(
    "/api/v1/operator/access-requests",
    response_model=list[AccessRequestResponse],
    tags=["operator"],
)
@app.get(
    "/operator/access-requests",
    response_model=list[AccessRequestResponse],
    include_in_schema=False,
)
def list_operator_access_requests(
    operator: User = Depends(require_operator),
    db: Session = Depends(get_db),
) -> list[AccessRequestResponse]:
    """List pending evaluator access requests submitted to this operator."""
    requests = db.scalars(
        select(AccessRequest)
        .where(
            AccessRequest.operator_id == operator.id,
            AccessRequest.status == "pending",
        )
        .order_by(AccessRequest.created_at.desc())
    ).all()

    items: list[AccessRequestResponse] = []
    for r in requests:
        eval_user = db.scalar(select(User).where(User.id == r.evaluator_id))
        items.append(
            AccessRequestResponse(
                id=r.id,
                evaluator_id=r.evaluator_id,
                operator_id=r.operator_id,
                status=r.status,
                evaluator_name=eval_user.display_name if eval_user else None,
                evaluator_email=eval_user.email if eval_user else None,
                created_at=r.created_at,
                decided_at=r.decided_at,
            )
        )
    return items


@app.post(
    "/api/v1/operator/access-requests/{request_id}/approve",
    tags=["operator"],
)
@app.post(
    "/operator/access-requests/{request_id}/approve",
    tags=["operator"],
    include_in_schema=False,
)
def approve_access_request(
    request_id: int,
    operator: User = Depends(require_operator),
    db: Session = Depends(get_db),
) -> dict:
    """Operator approves a pending evaluator request, elevating role and linking chambers."""
    req = db.scalar(select(AccessRequest).where(AccessRequest.id == request_id))
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.operator_id != operator.id and operator.role not in ("superadmin", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    eval_user = db.scalar(select(User).where(User.id == req.evaluator_id))
    if eval_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requester not found")

    now = datetime.now(timezone.utc)
    req.status = "approved"
    req.decided_at = now
    eval_user.role = "evaluator"

    grant = db.scalar(select(EvaluatorAccess).where(EvaluatorAccess.evaluator_id == eval_user.id))
    if grant is None:
        grant = EvaluatorAccess(
            owner_id=req.operator_id,
            evaluator_id=eval_user.id,
            evaluator_email=eval_user.email,
            granted_by=operator.id,
            granted_at=now,
        )
        db.add(grant)
    else:
        grant.owner_id = req.operator_id
        grant.evaluator_email = eval_user.email
        grant.granted_by = operator.id
        grant.granted_at = now

    audit = ActivityLog(
        owner_id=req.operator_id,
        actor_id=operator.id,
        action="approve_access_request",
        resource=f"access_requests:{req.id}->evaluator:{eval_user.id}",
    )
    db.add(audit)
    db.commit()
    return {"success": True, "status": "approved", "evaluator_id": eval_user.id}


@app.post(
    "/api/v1/operator/access-requests/{request_id}/decline",
    tags=["operator"],
)
@app.post(
    "/operator/access-requests/{request_id}/decline",
    tags=["operator"],
    include_in_schema=False,
)
def decline_access_request(
    request_id: int,
    operator: User = Depends(require_operator),
    db: Session = Depends(get_db),
) -> dict:
    """Operator declines a pending evaluator access request."""
    req = db.scalar(select(AccessRequest).where(AccessRequest.id == request_id))
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.operator_id != operator.id and operator.role not in ("superadmin", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    req.status = "declined"
    req.decided_at = datetime.now(timezone.utc)

    audit = ActivityLog(
        owner_id=req.operator_id,
        actor_id=operator.id,
        action="decline_access_request",
        resource=f"access_requests:{req.id}->evaluator:{req.evaluator_id}",
    )
    db.add(audit)
    db.commit()
    return {"success": True, "status": "declined"}


@app.post(
    "/api/v1/access-requests",
    response_model=AccessRequestResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["access"],
)
@app.post(
    "/access-requests",
    response_model=AccessRequestResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def create_access_request(
    payload: CreateAccessRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AccessRequestResponse:
    """Pending user requests access to an operator by providing the operator's email address."""
    clean_operator_email = payload.operator_email.lower().strip()
    operator = db.scalar(
        select(User).where(
            func.lower(User.email) == clean_operator_email,
            User.role.in_(["operator", "admin", "superadmin"]),
            User.is_active.is_(True),
        )
    )
    if operator is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active operator found with email {payload.operator_email}",
        )

    # Cancel previous pending requests from this user
    prior_pending = db.scalars(
        select(AccessRequest).where(
            AccessRequest.evaluator_id == user.id,
            AccessRequest.status == "pending",
        )
    ).all()
    now = datetime.now(timezone.utc)
    for p in prior_pending:
        p.status = "declined"
        p.decided_at = now

    req = AccessRequest(
        evaluator_id=user.id,
        operator_id=operator.id,
        status="pending",
        created_at=now,
    )
    db.add(req)
    db.flush()

    audit = ActivityLog(
        owner_id=operator.id,
        actor_id=user.id,
        action="request_operator_access",
        resource=f"access_requests:{req.id}->operator:{operator.id}",
    )
    db.add(audit)
    db.commit()
    db.refresh(req)

    return AccessRequestResponse(
        id=req.id,
        evaluator_id=req.evaluator_id,
        operator_id=req.operator_id,
        status=req.status,
        evaluator_name=user.display_name,
        evaluator_email=user.email,
        created_at=req.created_at,
        decided_at=req.decided_at,
    )


