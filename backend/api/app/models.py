"""Database models for local identity and authenticated sessions."""

from datetime import datetime

from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint, Uuid, func, text
from uuid import UUID
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
    role: Mapped[str] = mapped_column(String(32), default="pending", server_default="pending")
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
    mqtt_topic_prefix: Mapped[str | None] = mapped_column(String(160), unique=True, nullable=True)
    connection_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    requires_serial_number: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    firmware_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    granted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    granted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    owner: Mapped[User] = relationship(foreign_keys=[owner_id])


class TelemetryReading(Base):
    """A raw telemetry packet or its hourly/daily summary."""

    __tablename__ = "telemetry_readings"
    __table_args__ = (
        UniqueConstraint(
            "device_id", "message_id", name="telemetry_device_message_unique"
        ),
        CheckConstraint(
            "aggregation in ('raw', 'hourly', 'daily')",
            name="telemetry_aggregation_check",
        ),
        CheckConstraint("sample_count > 0", name="telemetry_sample_count_check"),
        CheckConstraint(
            "fault_count >= 0 and fault_count <= sample_count",
            name="telemetry_fault_count_check",
        ),
        Index(
            "telemetry_rollup_bucket_unique",
            "device_id",
            "aggregation",
            "recorded_at",
            unique=True,
            postgresql_where=text("aggregation in ('hourly', 'daily')"),
            sqlite_where=text("aggregation in ('hourly', 'daily')"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    temperature_c: Mapped[float | None] = mapped_column(Float)
    humidity_percent: Mapped[float | None] = mapped_column(Float)
    water_temperature_c: Mapped[float | None] = mapped_column(Float)
    light_lux: Mapped[float | None] = mapped_column(Float)
    water_level_percent: Mapped[float | None] = mapped_column(Float)
    wastewater_level_percent: Mapped[float | None] = mapped_column(Float)
    voltage: Mapped[float | None] = mapped_column(Float)
    sd_ok: Mapped[bool | None] = mapped_column(Boolean)
    sensor_status: Mapped[str] = mapped_column(String(120), default="NONE", server_default="NONE")
    message_id: Mapped[str | None] = mapped_column(String(128))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    aggregation: Mapped[str] = mapped_column(
        String(8), default="raw", server_default="raw"
    )
    sample_count: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    fault_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    metric_counts: Mapped[dict[str, int]] = mapped_column(
        JSON, default=dict, server_default="{}"
    )


class Alert(Base):
    """A chamber issue or device alert with an optional idempotent report key."""

    __tablename__ = "alerts"
    __table_args__ = (UniqueConstraint("owner_id", "report_key", name="alerts_report_key_unique"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    device_id: Mapped[int | None] = mapped_column(ForeignKey("devices.id"))
    batch_id: Mapped[int | None] = mapped_column(ForeignKey("batches.id"))
    title: Mapped[str] = mapped_column(String)
    message: Mapped[str] = mapped_column(String)
    recommended_action: Mapped[str] = mapped_column(String, default="")
    severity: Mapped[str] = mapped_column(String, default="warning")
    status: Mapped[str] = mapped_column(String, default="open")
    category: Mapped[str] = mapped_column(String, default="device")
    report_key: Mapped[UUID | None] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EvaluatorAccess(Base):
    """Explicit access grant from an operator workspace to an evaluator."""

    __tablename__ = "evaluator_access"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    evaluator_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=True)
    evaluator_email: Mapped[str] = mapped_column(String(320), index=True)
    granted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    granted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AccessRequest(Base):
    """Request from a pending user to join an operator's workspace."""

    __tablename__ = "access_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    evaluator_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    operator_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", server_default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


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

