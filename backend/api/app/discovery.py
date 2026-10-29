"""Bounded discovery of explicitly advertised SproutSync devices on the API host's LAN."""

import ipaddress
import secrets
import threading
import time
from dataclasses import dataclass

from pydantic import BaseModel, Field, ValidationError, field_validator
from zeroconf import IPVersion, ServiceBrowser, Zeroconf

SERVICE_TYPE = "_sproutsync._tcp.local."
PROTOCOL = "sproutsync-discovery-v1"
SCAN_SECONDS = 4


class DeviceIdentity(BaseModel):
    protocol: str = Field(pattern=r"^sproutsync-discovery-v1$")
    model: str = Field(pattern=r"^ESP32$")
    serial_number: str = Field(
        min_length=1, max_length=64, pattern=r"^[A-Za-z0-9][A-Za-z0-9:_-]*$"
    )
    name: str = Field(min_length=1, max_length=120)
    topic_prefix: str = Field(
        min_length=1, max_length=160, pattern=r"^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$"
    )

    @field_validator("serial_number", "name", "topic_prefix", mode="before")
    @classmethod
    def trim(cls, value):
        return value.strip() if isinstance(value, str) else value


@dataclass
class Advertisement:
    identity: DeviceIdentity
    addresses: list[str]
    discovery_id: str
    expires_at: float

    def response(self):
        return {
            **self.identity.model_dump(),
            "addresses": self.addresses,
            "transport": "wifi",
            "discovery_id": self.discovery_id,
        }


def parse_advertisement(info) -> tuple[DeviceIdentity, list[str]] | None:
    if info is None or info.type != SERVICE_TYPE:
        return None
    try:
        properties = {
            key.decode("utf-8"): value.decode("utf-8")
            for key, value in info.properties.items()
            if isinstance(key, bytes) and isinstance(value, bytes)
        }
        identity = DeviceIdentity.model_validate(properties)
        addresses = []
        for raw in info.parsed_addresses(IPVersion.V4Only):
            address = ipaddress.ip_address(raw)
            if (address.is_private or address.is_link_local) and not (
                address.is_loopback
                or address.is_multicast
                or address.is_unspecified
                or address.is_reserved
            ):
                addresses.append(str(address))
        return (identity, addresses) if addresses else None
    except (ValueError, UnicodeError, ValidationError):
        return None


class LocalDiscovery:
    def __init__(self):
        self._lock = threading.Lock()
        self._entries: dict[str, Advertisement] = {}
        self._last_scan = 0.0
        self._last_results: list[Advertisement] = []

    def scan(self) -> list[Advertisement]:
        # Concurrent requests share a scan; only this service type is queried.
        with self._lock:
            now = time.monotonic()
            if now - self._last_scan < 8:
                return [entry for entry in self._last_results if entry.expires_at > now]
            found = {}
            found_lock = threading.Lock()

            class Listener:
                def add_service(self, zc, type_, name):
                    with found_lock:
                        if len(found) >= 50:
                            return
                    parsed = parse_advertisement(
                        zc.get_service_info(type_, name, timeout=500)
                    )
                    if parsed:
                        identity, addresses = parsed
                        with found_lock:
                            found[name] = Advertisement(
                                identity,
                                addresses,
                                secrets.token_urlsafe(24),
                                time.monotonic() + 120,
                            )

                def update_service(self, zc, type_, name):
                    self.add_service(zc, type_, name)

                def remove_service(self, zc, type_, name):
                    with found_lock:
                        found.pop(name, None)

            zc = Zeroconf(ip_version=IPVersion.V4Only)
            browser = None
            try:
                browser = ServiceBrowser(zc, SERVICE_TYPE, Listener())
                threading.Event().wait(SCAN_SECONDS)
            finally:
                if browser:
                    browser.cancel()
                zc.close()
            with found_lock:
                # One physical identity appears once even with several interfaces.
                unique = {
                    item.identity.serial_number.upper(): item for item in found.values()
                }
            fresh = list(unique.values())[:50]
            # Keep prior selection tokens valid briefly while a user fills the form.
            self._entries = {
                key: entry
                for key, entry in self._entries.items()
                if entry.expires_at > time.monotonic()
            }
            for entry in fresh:
                self._entries[entry.discovery_id] = entry
            self._entries = dict(list(self._entries.items())[-100:])
            self._last_scan = time.monotonic()
            self._last_results = fresh
            return fresh

    def lookup(self, token: str) -> Advertisement | None:
        with self._lock:
            entry = self._entries.get(token)
            return entry if entry and entry.expires_at > time.monotonic() else None


discovery = LocalDiscovery()
