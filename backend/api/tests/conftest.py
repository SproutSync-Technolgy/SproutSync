"""Isolated tests never connect to the public MQTT broker."""

import pytest

from app.config import settings


@pytest.fixture(autouse=True)
def disable_mqtt_network(monkeypatch):
    monkeypatch.setattr(settings, "mqtt_enabled", False)
