"""Read-only broker/telemetry check; never publishes device commands or writes data."""

import argparse
import re
import threading
from urllib.parse import urlsplit

import paho.mqtt.client as mqtt
from app.config import settings
from app.mqtt import SensorPacket

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--topic-prefix", default="sproutsync")
parser.add_argument("--wait-seconds", type=int, default=15)
args = parser.parse_args()
if not re.fullmatch(r"[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*", args.topic_prefix):
    parser.error("Use a concrete topic prefix without MQTT wildcards")
if not 1 <= args.wait_seconds <= 60:
    parser.error("wait-seconds must be between 1 and 60")
url = urlsplit(settings.mqtt_broker_url)
if url.scheme != "wss" or not url.hostname or url.username or url.password:
    parser.error("Configure a wss broker URL without embedded credentials")

detected = threading.Event()
connected = threading.Event()
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, transport="websockets")
client.ws_set_options(path=url.path or "/mqtt")
client.tls_set()
if settings.mqtt_username:
    client.username_pw_set(settings.mqtt_username, settings.mqtt_password)


def on_connect(client, userdata, flags, reason_code, properties):
    if not reason_code.is_failure:
        connected.set()
        client.subscribe(args.topic_prefix + "/telemetry", qos=0)


def on_message(client, userdata, message):
    if message.retain or len(message.payload) > 8192:
        return
    try:
        SensorPacket.model_validate_json(message.payload)
        detected.set()
    except ValueError:
        pass


client.on_connect = on_connect
client.on_message = on_message
client.connect_async(url.hostname, url.port or 443, keepalive=30)
client.loop_start()
try:
    detected.wait(args.wait_seconds)
finally:
    client.disconnect()
    client.loop_stop()
print("MQTT broker connected:", connected.is_set())
print("Valid non-retained telemetry received:", detected.is_set())
raise SystemExit(0 if detected.is_set() else 2)
