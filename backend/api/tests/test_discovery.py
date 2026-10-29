"""Only explicit, well-formed local SproutSync advertisements are ESP32 candidates."""

import time
from types import SimpleNamespace

import pytest

import app.discovery as discovery_module
from app.discovery import (
    Advertisement,
    DeviceIdentity,
    LocalDiscovery,
    SERVICE_TYPE,
    parse_advertisement,
)


def identity(**updates):
    return {
        "protocol": "sproutsync-discovery-v1",
        "model": "ESP32",
        "serial_number": "ESP32-123456",
        "name": "My ESP32",
        "topic_prefix": "sproutsync/esp32-123456",
        **updates,
    }


def info(*, fields=None, addresses=None, type_=SERVICE_TYPE):
    return SimpleNamespace(
        type=type_,
        properties={
            key.encode(): value.encode()
            for key, value in (fields if fields is not None else identity()).items()
        },
        parsed_addresses=lambda _version: addresses or ["192.168.1.80"],
    )


def test_valid_private_network_advertisement_exposes_identity_and_address():
    device, addresses = parse_advertisement(info())
    assert device.serial_number == "ESP32-123456" and addresses == ["192.168.1.80"]


@pytest.mark.parametrize(
    "advertisement",
    [
        info(fields=identity(model="Other device")),
        info(fields=identity(protocol="unknown")),
        info(fields=identity(topic_prefix="sproutsync/#")),
        info(fields=identity(serial_number="")),
        info(fields={}),
        info(type_="_http._tcp.local."),
        info(addresses=["8.8.8.8"]),
        info(addresses=["127.0.0.1"]),
        info(addresses=["0.0.0.0"]),
        info(addresses=["224.0.0.251"]),
    ],
)
def test_unrelated_invalid_or_nonlocal_devices_are_not_detected(advertisement):
    assert parse_advertisement(advertisement) is None


def test_selection_token_expiration():
    scanner = LocalDiscovery()
    entry = Advertisement(
        DeviceIdentity.model_validate(identity()),
        ["192.168.1.80"],
        "token",
        time.monotonic() + 1,
    )
    scanner._entries["token"] = entry
    assert scanner.lookup("token") is entry
    entry.expires_at = time.monotonic() - 1
    assert scanner.lookup("token") is None
    assert scanner.lookup("forged-token") is None


def test_scan_reads_announcements_caches_results_and_closes_sockets(monkeypatch):
    opened = []
    closed = []

    class Network:
        def __init__(self, **_kwargs):
            opened.append(self)

        def get_service_info(self, *_args, **_kwargs):
            return info()

        def close(self):
            closed.append(self)

    class Browser:
        def __init__(self, network, type_, listener):
            listener.add_service(network, type_, "test." + type_)

        def cancel(self):
            pass

    monkeypatch.setattr(discovery_module, "Zeroconf", Network)
    monkeypatch.setattr(discovery_module, "ServiceBrowser", Browser)
    monkeypatch.setattr(discovery_module, "SCAN_SECONDS", 0)
    scanner = LocalDiscovery()
    first = scanner.scan()
    assert len(first) == 1 and first[0].identity.serial_number == "ESP32-123456"
    assert scanner.scan() == first and len(opened) == 1
    assert closed == opened
    scanner._last_scan -= 9
    second = scanner.scan()
    assert len(opened) == 2 and closed == opened
    assert second[0].discovery_id != first[0].discovery_id
    assert scanner.lookup(first[0].discovery_id) is first[0]


def test_failed_scan_closes_network_and_can_be_retried(monkeypatch):
    closed = []
    monkeypatch.setattr(
        discovery_module,
        "Zeroconf",
        lambda **_kwargs: SimpleNamespace(close=lambda: closed.append(True)),
    )

    def unavailable(*_args):
        raise OSError("Multicast unavailable")

    monkeypatch.setattr(discovery_module, "ServiceBrowser", unavailable)
    scanner = LocalDiscovery()
    for _ in range(2):
        with pytest.raises(OSError):
            scanner.scan()
    assert closed == [True, True]
