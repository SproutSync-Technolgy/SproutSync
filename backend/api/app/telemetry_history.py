"""Persist only completed window averages and immediate connection/fault events."""

from datetime import UTC, datetime

from sqlalchemy import select

from app.config import settings
from app.models import Device, DeviceLiveState, TelemetryReading
from app.telemetry_windows import accumulate, flush_due, next_flush_time, signature


def binding_identity(device):
    requested = device.connection_requested_at
    if requested is not None and requested.tzinfo is None:
        requested = requested.replace(tzinfo=UTC)
    return [
        device.owner_id,
        device.mqtt_topic_prefix,
        requested.timestamp() if requested else None,
    ]


def save_summaries(db, device, summaries):
    for summary in summaries:
        values = dict(summary)
        for key in (
            "recorded_at",
            "received_at",
            "window_started_at",
            "window_ended_at",
        ):
            values[key] = datetime.fromisoformat(values[key])
        db.add(
            TelemetryReading(device_id=device.id, owner_id=device.owner_id, **values)
        )


def record_packet(db, device, state, reading, message_id):
    private = dict(state.history_state or {}) if state else {}
    binding = binding_identity(device)
    if private.get("binding") != binding:
        private = {}
    bootstrap = not private
    if bootstrap:
        previous = db.scalar(
            select(TelemetryReading)
            .where(TelemetryReading.device_id == device.id)
            .order_by(TelemetryReading.received_at.desc(), TelemetryReading.id.desc())
            .limit(1)
        )
        if previous is not None:
            private["signature"] = list(
                signature(
                    {"sensor_status": previous.sensor_status, "sd_ok": previous.sd_ok}
                )
            )
    private, completed, preview, transition = accumulate(private, reading, message_id)
    private["binding"] = binding
    save_summaries(db, device, completed)
    if transition:
        values = {key: value for key, value in reading.items() if key != "device_id"}
        values["recorded_at"] = datetime.fromisoformat(values["recorded_at"])
        values["received_at"] = datetime.fromisoformat(values["received_at"])
        values["aggregation"] = "event"
        db.add(
            TelemetryReading(
                device_id=device.id,
                owner_id=device.owner_id,
                message_id=message_id,
                metric_counts={
                    name: int(reading.get(name) is not None)
                    for name in preview["metric_counts"]
                },
                **values,
            )
        )
    if state is None:
        state = DeviceLiveState(device_id=device.id, owner_id=device.owner_id)
        db.add(state)
    state.owner_id = device.owner_id
    state.received_at = datetime.fromisoformat(reading["received_at"])
    state.stale_seconds = settings.mqtt_stale_seconds
    state.latest = dict(reading)
    state.minute_preview = {**preview, "device_id": device.id}
    state.history_state = private
    state.flush_at = next_flush_time(private)
    return transition, bool(completed), bootstrap


def flush_history_windows(db, now):
    pending = db.scalars(
        select(DeviceLiveState)
        .join(Device, Device.id == DeviceLiveState.device_id)
        .where(DeviceLiveState.flush_at <= now)
        .order_by(DeviceLiveState.flush_at, DeviceLiveState.device_id)
        .limit(256)
        .with_for_update(of=Device, skip_locked=True)
    ).all()
    for state in pending:
        device = db.get(Device, state.device_id)
        new_state, rows = flush_due(state.history_state, now)
        save_summaries(db, device, rows)
        state.history_state = new_state
        state.flush_at = next_flush_time(new_state)
