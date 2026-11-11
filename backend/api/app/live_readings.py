"""Bounded, process-local live snapshots, separate from persisted history."""

from collections import OrderedDict
from copy import deepcopy
from datetime import datetime, timezone
from threading import Lock

from app.models import Device


class LiveReadings:
    """One current packet per device; no invented database row IDs."""

    def __init__(self, capacity: int = 256):
        self.capacity = capacity
        self._lock = Lock()
        self._rows = OrderedDict()

    def put(self, device: Device, reading: dict, message_id: str | None = None) -> None:
        with self._lock:
            previous = self._rows.get(device.id)
            requested = device.connection_requested_at
            if requested is not None and requested.tzinfo is None:
                requested = requested.replace(tzinfo=timezone.utc)
            if (
                previous
                and requested
                and requested.timestamp()
                > datetime.fromisoformat(previous["reading"]["received_at"]).timestamp()
            ):
                previous = None
            message_ids = (
                previous["message_ids"]
                if previous
                and previous["owner_id"] == device.owner_id
                and previous["topic"] == device.mqtt_topic_prefix
                else OrderedDict()
            )
            if message_id:
                message_ids[message_id] = None
                while len(message_ids) > 128:
                    message_ids.popitem(last=False)
            self._rows[device.id] = {
                "owner_id": device.owner_id,
                "topic": device.mqtt_topic_prefix,
                "reading": deepcopy(reading),
                "message_ids": message_ids,
            }
            self._rows.move_to_end(device.id)
            while len(self._rows) > self.capacity:
                self._rows.popitem(last=False)

    def for_device(self, device: Device) -> dict | None:
        with self._lock:
            entry = self._rows.get(device.id)
            if (
                entry is None
                or entry["owner_id"] != device.owner_id
                or entry["topic"] != device.mqtt_topic_prefix
            ):
                return None
            reading = entry["reading"]
            requested = device.connection_requested_at
            if requested is not None and requested.tzinfo is None:
                requested = requested.replace(tzinfo=timezone.utc)
            if (
                requested
                and requested.timestamp()
                > datetime.fromisoformat(reading["received_at"]).timestamp()
            ):
                return None
            return deepcopy(reading)

    def clear(self) -> None:
        with self._lock:
            self._rows.clear()

    def has_message(self, device: Device, message_id: str) -> bool:
        # Apply the same ownership, binding and reconnect checks as live reads.
        if self.for_device(device) is None:
            return False
        with self._lock:
            entry = self._rows.get(device.id)
            return bool(entry and message_id in entry["message_ids"])
