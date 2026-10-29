// Avoid adding setup()/loop() when this example is copied into a sensor project.
#ifdef SPROUTSYNC_DISCOVERY_EXAMPLE
#include <Arduino.h>
#include <WiFi.h>
#include "SproutSyncDiscovery.h"

#if __has_include("discovery_secrets.h")
#include "discovery_secrets.h"
#else
#define SPROUTSYNC_WIFI_SSID ""
#define SPROUTSYNC_WIFI_PASSWORD ""
#define SPROUTSYNC_MQTT_PREFIX ""
#endif

SproutSyncDiscovery discovery;

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  if (strlen(SPROUTSYNC_WIFI_SSID)) WiFi.begin(SPROUTSYNC_WIFI_SSID, SPROUTSYNC_WIFI_PASSWORD);
  if (!discovery.begin(SPROUTSYNC_MQTT_PREFIX)) {
    Serial.println("Discovery identity configuration is invalid.");
    return;
  }
  Serial.println(discovery.identityJson());
  Serial.println("Discovery example only: no sensors or actuators are configured.");
}

void loop() {
  discovery.loop();
  delay(5);
}
#endif
