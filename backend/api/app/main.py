"""FastAPI application and authenticated API endpoints."""

from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.auth import (
    get_current_user,
)
from app.db import get_db
from app.models import Batch, User

app = FastAPI(title="SproutSync API", version="0.2.0")


def require_operator(user: User = Depends(get_current_user)) -> User:
    """Enforce operational access even when the HTTP API bypasses browser RLS."""
    if user.role not in ("operator", "admin"):
        raise HTTPException(status_code=403, detail="Operator access required")
    return user


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
    query = select(Batch).order_by(Batch.started_at.desc())
    if user.role == "evaluator":
        owners = db.scalars(
            text(
                "SELECT owner_id FROM evaluator_access WHERE evaluator_email = :email"
            ),
            {"email": user.email.lower()},
        ).all()
        visible_owners = [user.id, *owners]
        has_records = db.scalar(
            select(Batch.id).where(Batch.owner_id.in_(visible_owners)).limit(1)
        )
        if has_records is None:
            demo_owner = db.scalar(
                select(User.id).where(
                    User.google_subject == "sproutsync-demo-workspace"
                )
            )
            if demo_owner is not None:
                visible_owners.append(demo_owner)
        query = query.where(Batch.owner_id.in_(visible_owners))
    else:
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
