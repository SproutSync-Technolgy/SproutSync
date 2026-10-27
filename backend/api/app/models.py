"""Database models for local identity and authenticated sessions."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class User(Base):
    """An operator or administrator authenticated through Google."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    google_subject: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(200))
    first_name: Mapped[str] = mapped_column(String(80), default="", server_default="")
    last_name: Mapped[str] = mapped_column(String(80), default="", server_default="")
    organization: Mapped[str] = mapped_column(String(160), default="", server_default="")
    phone: Mapped[str] = mapped_column(String(40), default="", server_default="")
    avatar_url: Mapped[str | None] = mapped_column(String(1000))
    role: Mapped[str] = mapped_column(String(32), default="evaluator", server_default="evaluator")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    profile_complete: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    registration_provider: Mapped[str] = mapped_column(String(32), default="email", server_default="email")
    onboarding_email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verification_code_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    verification_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verification_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    verification_last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verification_locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    sessions: Mapped[list["SessionRecord"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class SessionRecord(Base):
    """A hashed bearer token with an expiry timestamp."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    user: Mapped[User] = relationship(back_populates="sessions")


class Batch(Base):
    """A grower's production batch and its current lifecycle state."""

    __tablename__ = "batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    code: Mapped[str] = mapped_column(String(64), index=True)
    seed_type: Mapped[str] = mapped_column(String(120), default="Mung beans")
    seed_weight_grams: Mapped[float | None]
    stage: Mapped[str] = mapped_column(String(32), default="soaking")
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    started_at: Mapped[datetime]
    target_harvest_at: Mapped[datetime | None]
    notes: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    owner: Mapped[User] = relationship()


class Device(Base):
    """An IoT chamber controller device assigned to an operator."""

    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    serial_number: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", server_default="pending")
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    firmware_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    granted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    granted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    owner: Mapped[User] = relationship(foreign_keys=[owner_id])


class EvaluatorAccess(Base):
    """Explicit access grant from an operator workspace to an evaluator."""

    __tablename__ = "evaluator_access"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    evaluator_email: Mapped[str] = mapped_column(String(320), index=True)
    granted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    granted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ActivityLog(Base):
    """Immutable audit trail of actions taken in the workspace."""

    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    resource: Mapped[str] = mapped_column(String(255))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

