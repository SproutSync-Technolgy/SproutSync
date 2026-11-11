"""Authorized device binding and recovery snapshots for realtime clients."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from zeroconf import Error as ZeroconfError

from app.auth import get_current_user
from app.config import settings
from app.db import get_db
from app.models import (
    ActivityLog,
    Alert,
    Batch,
    Device,
    DeviceLiveState,
    EvaluatorAccess,
    TelemetryReading,
    User,
)
from typing import Literal
from uuid import UUID
from app.mqtt import bridge, utc
from app.discovery import DeviceIdentity, discovery

router = APIRouter(prefix="/api/v1/devices", tags=["devices"])


class DeviceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    name: str
    serial_number: str
    status: str
    is_demo: bool
    last_seen_at: datetime | None
    mqtt_topic_prefix: str | None
    connection_requested_at: datetime | None


class ReadingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: int
    temperature_c: float | None
    humidity_percent: float | None
    water_temperature_c: float | None
    light_lux: float | None
    water_level_percent: float | None
    wastewater_level_percent: float | None
    voltage: float | None
    sd_ok: bool | None
    sensor_status: str
    recorded_at: datetime
    received_at: datetime
    aggregation: str
    sample_count: int
    fault_count: int
    metric_counts: dict[str, int] = Field(default_factory=dict)
    metric_stats: dict = Field(default_factory=dict)
    window_started_at: datetime | None = None
    window_ended_at: datetime | None = None


class ConnectRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "serial_number": "ESP32-EXAMPLE01",
                    "name": "Growing chamber 1",
                    "topic_prefix": "sproutsync/example01",
                }
            ]
        }
    )
    serial_number: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    topic_prefix: str = Field(
        min_length=1, max_length=160, pattern=r"^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$"
    )

    @field_validator("serial_number", "name", "topic_prefix", mode="before")
    @classmethod
    def trim(cls, value):
        return value.strip() if isinstance(value, str) else value


def require_device_operator(user: User = Depends(get_current_user)):
    if user.role not in ("operator", "admin", "superadmin") or not user.is_active:
        raise HTTPException(403, "Operator access required")
    return user


class DiscoveredDevice(DeviceIdentity):
    addresses: list[str]
    transport: Literal["wifi"]
    discovery_id: str
    available: bool


class DiscoveryResponse(BaseModel):
    devices: list[DiscoveredDevice]


@router.get(
    "/discover",
    response_model=DiscoveryResponse,
    responses={
        503: {"description": "API host cannot perform local multicast discovery."}
    },
)
def discover_devices(
    user: User = Depends(require_device_operator), db: Session = Depends(get_db)
):
    """Search the API host's local Wi-Fi/LAN (operator/admin/superadmin).

    Scans explicitly advertised SproutSync mDNS identities, not arbitrary ESP32s.
    Returns at most 50 identities; empty devices is a valid result. A cloud host
    cannot discover devices on the user's home network. Select an available
    result and submit its discovery_id to /devices/nearby within 120 seconds.
    This GET performs discovery only; it does not register or connect a device.
    503 means multicast/local networking is unavailable on the API host.
    """
    try:
        found = discovery.scan()
    except (OSError, ZeroconfError) as error:
        raise HTTPException(
            503,
            "Wi-Fi discovery is unavailable. Allow local network/multicast access for the API, then search again.",
        ) from error
    serials = [entry.identity.serial_number.upper() for entry in found]
    registered = {
        d.serial_number.upper(): d
        for d in db.scalars(
            select(Device).where(func.upper(Device.serial_number).in_(serials))
        ).all()
    }
    return {
        "devices": [
            {
                **entry.response(),
                "available": entry.identity.serial_number.upper() not in registered
                or (
                    registered[entry.identity.serial_number.upper()].owner_id == user.id
                    and not registered[entry.identity.serial_number.upper()].is_demo
                ),
            }
            for entry in found
        ]
    }


class NearbyRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "transport": "wifi",
                    "discovery_id": "REPLACE_WITH_CURRENT_DISCOVERY_ID",
                    "name": "Growing chamber 1",
                }
            ]
        }
    )
    transport: str = Field(pattern=r"^(wifi|bluetooth)$")
    discovery_id: str | None = Field(default=None, min_length=1, max_length=128)
    identity: DeviceIdentity | None = None
    name: str = Field(min_length=1, max_length=120)

    @model_validator(mode="after")
    def require_identity(self):
        if self.transport == "wifi" and not self.discovery_id:
            raise ValueError("Select a device from the Wi-Fi search")
        if self.transport == "bluetooth" and self.identity is None:
            raise ValueError("Read the device identity over Bluetooth first")
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("Device name cannot be blank")
        return self


@router.post(
    "/nearby",
    response_model=DeviceResponse,
    status_code=202,
    responses={
        409: {"description": "Serial or topic belongs to another device/workspace."},
        410: {"description": "Wi-Fi discovery selection expired; search again."},
        503: {
            "description": "MQTT disabled/misconfigured, or Supabase authentication unavailable."
        },
    },
)
def register_nearby_device(
    payload: NearbyRequest,
    user: User = Depends(require_device_operator),
    db: Session = Depends(get_db),
):
    """Register a discovered ESP32 and await telemetry (operator/admin/superadmin).

    Wi-Fi requires a current discovery_id from this backend's discover endpoint;
    Bluetooth requires identity read by the client using the documented GATT
    contract. This changes the caller's saved device registration and MQTT topic
    binding; it is not proof of physical pairing or live sensor data. A 202 leaves
    the device pending until a fresh packet with its matching serial arrives.
    409 means serial/topic ownership conflict; 410 means expired Wi-Fi selection;
    503 means MQTT disabled or misconfigured. Does not publish hardware commands.
    """
    if not settings.mqtt_enabled or bridge.state == "configuration_error":
        raise HTTPException(
            503,
            "MQTT is disabled or misconfigured on the server. Contact your administrator.",
        )
    if payload.transport == "wifi":
        entry = discovery.lookup(payload.discovery_id)
        if entry is None:
            raise HTTPException(
                410,
                "This discovery result expired. Search Wi-Fi again and select the device.",
            )
        identity = entry.identity
    else:
        # Bluetooth permission/GATT happen in the operator's browser. This is
        # self-registration, never a grant to take over an existing serial.
        identity = payload.identity
    serial = identity.serial_number.upper()
    device = db.scalar(
        select(Device)
        .where(func.upper(Device.serial_number) == serial)
        .with_for_update()
    )
    if device is not None and (device.owner_id != user.id or device.is_demo):
        raise HTTPException(
            409,
            "This device is already registered to another workspace. Ask its administrator to review the assignment.",
        )
    if device is None:
        device = Device(
            owner_id=user.id, serial_number=serial, name=payload.name, is_demo=False
        )
        db.add(device)
    device.name = payload.name
    device.mqtt_topic_prefix = identity.topic_prefix
    device.connection_requested_at = datetime.now(timezone.utc)
    device.status = "pending"
    device.requires_serial_number = True
    db.add(
        ActivityLog(
            owner_id=user.id,
            actor_id=user.id,
            action="register_nearby_device",
            resource=f"devices:{serial}:{payload.transport}",
        )
    )
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            409,
            "This serial or MQTT topic is already registered. Search again or review the existing device.",
        ) from error
    db.refresh(device)
    return device


@router.post(
    "/connect",
    response_model=DeviceResponse,
    status_code=202,
    responses={
        404: {"description": "Serial is not assigned or not visible to this operator."},
        409: {"description": "MQTT topic is already bound to another device."},
        503: {
            "description": "MQTT disabled/misconfigured, or Supabase authentication unavailable."
        },
    },
)
def connect_device(
    payload: ConnectRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bind an assigned serial to its MQTT topic (operator/admin/superadmin).

    Use the exact serial and topic prefix configured in the sensor firmware.
    Operators can bind only their assigned non-demo devices; elevated admins may
    bind other assigned devices. Changes saved name/topic and resets status to
    pending. 202 accepts the binding; verify fresh packets using devices/live.
    404 means serial not assigned/visible; 409 means duplicate topic; 503 means
    MQTT disabled/misconfigured. This does not provision Wi-Fi or command a pump.
    """
    if user.role not in ("operator", "admin", "superadmin") or not user.is_active:
        raise HTTPException(403, "Operator access required")
    if not settings.mqtt_enabled or bridge.state == "configuration_error":
        raise HTTPException(
            503,
            "MQTT is disabled or misconfigured on the server. Contact your administrator.",
        )
    query = select(Device).where(
        func.upper(Device.serial_number) == payload.serial_number.upper(),
        Device.is_demo.is_(False),
    )
    if user.role == "operator":
        query = query.where(Device.owner_id == user.id)
    device = db.scalar(query.with_for_update())
    if device is None:
        raise HTTPException(
            404,
            "Serial not assigned to your account. Ask your administrator to grant this device first.",
        )
    device.name = payload.name
    device.mqtt_topic_prefix = payload.topic_prefix
    device.connection_requested_at = datetime.now(timezone.utc)
    device.status = "pending"
    db.add(
        ActivityLog(
            owner_id=device.owner_id,
            actor_id=user.id,
            action="connect_device",
            resource=f"devices:{device.id}",
        )
    )
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            409,
            "This MQTT topic prefix is already connected to another device. Use a unique prefix.",
        ) from error
    db.refresh(device)
    return device


class IssueRequest(BaseModel):
    """A human observation, kept separately from machine telemetry."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "request_id": "75c22829-c460-49d8-b1c8-13cf99d44eab",
                    "situation": "Water was observed around the chamber door seal.",
                    "component": "Door seal",
                    "risk": "equipment",
                    "display_message": "Not reported",
                    "safe_action": "Operator notified.",
                }
            ]
        }
    )

    request_id: UUID
    batch_id: int | None = Field(default=None, gt=0)
    situation: str = Field(min_length=10, max_length=1000)
    component: str = Field(min_length=2, max_length=120)
    risk: Literal["pests", "water", "compliance", "light", "equipment"]
    display_message: str = Field(default="", max_length=200)
    safe_action: str = Field(min_length=2, max_length=400)

    @field_validator(
        "situation", "component", "display_message", "safe_action", mode="before"
    )
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class IssueResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    owner_id: int
    device_id: int | None
    batch_id: int | None
    title: str
    message: str
    recommended_action: str
    severity: str
    status: str
    category: str
    created_at: datetime


@router.post(
    "/{device_id}/issues",
    response_model=IssueResponse,
    status_code=201,
    responses={
        404: {"description": "Chamber not found in the caller's workspace."},
        409: {"description": "Report UUID was previously used for different details."},
    },
)
def report_issue(
    device_id: int,
    payload: IssueRequest,
    user: User = Depends(require_device_operator),
    db: Session = Depends(get_db),
):
    """Save a chamber inspection report (operator/admin/superadmin).

    Creates a persistent device alert and audit entry, not a sensor packet.
    Choose a device in scope and, optionally, a batch owned by that device's
    operator. Generate a new request_id UUID per new report; reuse it unchanged
    when retrying the same report to prevent duplicates. The example UUID must
    be replaced for a new report. A repeated identical request returns the saved
    report with 201; changed details under the same UUID return 409. Missing or
    unauthorized chamber returns 404; wrong batch owner returns 422. This records
    the safe action already taken and never operates equipment.
    """
    device = db.scalar(select(Device).where(Device.id == device_id).with_for_update())
    if device is None or (user.role == "operator" and device.owner_id != user.id):
        raise HTTPException(404, "Chamber not available in your workspace.")
    if (
        payload.batch_id is not None
        and db.scalar(
            select(Batch.id).where(
                Batch.id == payload.batch_id, Batch.owner_id == device.owner_id
            )
        )
        is None
    ):
        raise HTTPException(422, "Choose a batch belonging to this chamber's operator.")
    title = f"Inspection needed: {payload.component}"
    message = (
        f"Risk: {payload.risk.replace('_', ' ')}\n"
        f"Situation: {payload.situation}\n"
        f"Display message: {payload.display_message or 'Not reported'}\n"
        f"Action already taken: {payload.safe_action}"
    )
    recommendation = (
        "Review the reported issue and record its resolution after inspection."
    )
    existing = db.scalar(
        select(Alert).where(
            Alert.owner_id == device.owner_id, Alert.report_key == payload.request_id
        )
    )
    if existing is not None:
        if (
            existing.device_id,
            existing.batch_id,
            existing.message,
            existing.recommended_action,
            existing.title,
        ) != (device.id, payload.batch_id, message, recommendation, title):
            raise HTTPException(
                409,
                "This report was already saved with different details. Review Alerts before starting a new report.",
            )
        return existing
    alert = Alert(
        owner_id=device.owner_id,
        device_id=device.id,
        batch_id=payload.batch_id,
        title=title,
        message=message,
        recommended_action=recommendation,
        severity="warning",
        status="open",
        category="device",
        report_key=payload.request_id,
    )
    db.add(alert)
    db.add(
        ActivityLog(
            owner_id=device.owner_id,
            actor_id=user.id,
            action="report_issue",
            resource=f"devices:{device.id}",
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409,
            "This report could not be saved because its identifier was already used. Review Alerts before retrying.",
        ) from None
    db.refresh(alert)
    return alert


class LatestReadingResponse(BaseModel):
    """Cached packet, without an invented persisted row ID."""

    device_id: int
    temperature_c: float | None
    humidity_percent: float | None
    water_temperature_c: float | None
    light_lux: float | None
    water_level_percent: float | None
    wastewater_level_percent: float | None
    voltage: float | None
    sd_ok: bool | None
    sensor_status: str
    recorded_at: datetime
    received_at: datetime
    aggregation: str
    sample_count: int
    fault_count: int


class BrokerResponse(BaseModel):
    state: str
    connected: bool
    broker_url: str
    stale_seconds: int
    history_sample_seconds: int
    fault_history_seconds: int = 60
    live_refresh_seconds: int = 2


class MinutePreview(LatestReadingResponse):
    provisional: bool = True
    window_started_at: datetime
    window_ended_at: datetime
    metric_counts: dict[str, int]
    metric_stats: dict


class LiveResponse(BaseModel):
    devices: list[DeviceResponse]
    readings: list[ReadingResponse]
    mqtt: BrokerResponse
    latest_readings: list[LatestReadingResponse]
    minute_previews: list[MinutePreview] = Field(default_factory=list)
    stale_seconds: int = 30


@router.get("/live", response_model=LiveResponse)
def live_devices(
    after_id: int | None = Query(
        default=None,
        ge=0,
        description="Saved history cursor. Omit for the newest 1,000 rows; supply the largest processed ID for up to 1,000 later rows in ascending order. Does not filter latest_readings or minute_previews.",
    ),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Read permitted chamber status and telemetry (any active signed-in user).

    Operators see their own devices; evaluators see granted operators' devices;
    admins/superadmins see the fleet; pending users receive empty lists. Returns
    devices, this process's MQTT connection state, up to 1,000 saved history rows,
    current packets as latest_readings, and provisional minute_previews. History
    includes legacy raw samples, state-change events, and minute/five-minute
    averages. Without after_id, saved rows are newest
    first; with it, rows are ascending so clients can advance their cursor.
    Current packets have no history row ID; a durable state row survives restart.
    Device online/fault status becomes offline when last_seen_at is stale.
    Inspect freshness and sensor_status even with HTTP 200.
    Broker connectivity alone does not establish device or sensor health.
    """
    query = select(Device).order_by(Device.id)
    if not user.is_active:
        raise HTTPException(403, "User account is inactive")
    if user.role == "operator":
        query = query.where(Device.owner_id == user.id)
    elif user.role == "evaluator":
        owners = select(EvaluatorAccess.owner_id).where(
            or_(
                EvaluatorAccess.evaluator_id == user.id,
                EvaluatorAccess.evaluator_email == user.email.lower(),
            )
        )
        query = query.where(Device.owner_id.in_(owners))
    elif user.role not in ("admin", "superadmin"):
        query = query.where(Device.id == -1)
    devices = db.scalars(query).all()
    readings_query = select(TelemetryReading).where(
        TelemetryReading.device_id.in_([d.id for d in devices]),
        # Averages remain labelled history, separate from current packets.
        TelemetryReading.aggregation.in_(
            ("raw", "event", "minute", "five_min", "five_minute")
        ),
    )
    if after_id is None:
        readings_query = readings_query.order_by(TelemetryReading.id.desc())
    else:
        readings_query = readings_query.where(TelemetryReading.id > after_id).order_by(
            TelemetryReading.id
        )
    readings = db.scalars(readings_query.limit(1000)).all()
    now = datetime.now(timezone.utc)
    response_devices = []
    for device in devices:
        result = DeviceResponse.model_validate(device)
        if (
            device.mqtt_topic_prefix
            and device.status in ("online", "fault")
            and (
                device.last_seen_at is None
                or (now - utc(device.last_seen_at)).total_seconds()
                > settings.mqtt_stale_seconds
            )
        ):
            result.status = "offline"
        response_devices.append(result.model_dump(mode="json"))
    cached = {
        row.device_id: row
        for row in db.scalars(
            select(DeviceLiveState).where(
                DeviceLiveState.device_id.in_([d.id for d in devices])
            )
        ).all()
    }

    def current_state(device):
        row = cached.get(device.id)
        if (
            row is None
            or row.owner_id != device.owner_id
            or (
                device.connection_requested_at
                and utc(row.received_at) < utc(device.connection_requested_at)
            )
        ):
            return None
        return row

    return {
        "devices": response_devices,
        "readings": [
            ReadingResponse.model_validate(r).model_dump(mode="json") for r in readings
        ],
        "mqtt": bridge.snapshot(),
        "latest_readings": [
            reading
            for device in devices
            if (
                reading := (
                    current_state(device).latest if current_state(device) else None
                )
                or bridge.latest.for_device(device)
            )
            is not None
        ],
        "minute_previews": [
            row.minute_preview
            for device in devices
            if (row := current_state(device)) is not None
            and utc(row.received_at) >= now.replace(second=0, microsecond=0)
            and (now - utc(row.received_at)).total_seconds()
            <= settings.mqtt_stale_seconds
        ],
        "stale_seconds": settings.mqtt_stale_seconds,
    }
