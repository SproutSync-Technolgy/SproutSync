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
from app.models import ActivityLog, Device, EvaluatorAccess, TelemetryReading, User
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


class ConnectRequest(BaseModel):
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


@router.get("/discover")
def discover_devices(
    user: User = Depends(require_device_operator), db: Session = Depends(get_db)
):
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


@router.post("/nearby", response_model=DeviceResponse, status_code=202)
def register_nearby_device(
    payload: NearbyRequest,
    user: User = Depends(require_device_operator),
    db: Session = Depends(get_db),
):
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


@router.post("/connect", response_model=DeviceResponse, status_code=202)
def connect_device(
    payload: ConnectRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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


@router.get("/live")
def live_devices(
    after_id: int | None = Query(default=None, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
        TelemetryReading.device_id.in_([d.id for d in devices])
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
                not bridge.connected
                or device.last_seen_at is None
                or (now - utc(device.last_seen_at)).total_seconds()
                > settings.mqtt_stale_seconds
            )
        ):
            result.status = "offline"
        response_devices.append(result.model_dump(mode="json"))
    return {
        "devices": response_devices,
        "readings": [
            ReadingResponse.model_validate(r).model_dump(mode="json") for r in readings
        ],
        "mqtt": bridge.snapshot(),
    }
