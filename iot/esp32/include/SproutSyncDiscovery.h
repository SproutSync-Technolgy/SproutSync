#pragma once

#include <Arduino.h>
#include <atomic>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <ESPmDNS.h>
#include <WiFi.h>

// Read-only identity discovery. The caller owns Wi-Fi credentials and MQTT sensing.
// No GPIO, relays, calibration, or irrigation commands are configured here.
class SproutSyncDiscovery {
 public:
  bool begin(const char* mqttTopicPrefix = nullptr,
             const char* printedSerial = nullptr,
             const char* friendlyName = nullptr) {
    char chipId[13];
    snprintf(chipId, sizeof(chipId), "%012llX",
             static_cast<unsigned long long>(ESP.getEfuseMac()));
    serial_ = printedSerial && *printedSerial
                  ? String(printedSerial)
                  : String("ESP32-") + chipId;
    serial_.toUpperCase();
    name_ = friendlyName && *friendlyName
                ? String(friendlyName)
                : String("SproutSync ESP32 ") + String(chipId).substring(6);
    prefix_ = mqttTopicPrefix && *mqttTopicPrefix
                  ? String(mqttTopicPrefix)
                  : String("sproutsync/") + serial_;
    if (!mqttTopicPrefix || !*mqttTopicPrefix) prefix_.replace(':', '_');
    if (serial_.length() > 64 || name_.length() > 120 || prefix_.length() > 160 ||
        !validSerial(serial_) || !validPrefix(prefix_)) {
      return false;
    }
    hostname_ = String("sproutsync-") + chipId;
    hostname_.toLowerCase();
    identity_ = String("{\"protocol\":\"sproutsync-discovery-v1\",\"model\":\"ESP32\",\"serial_number\":\"") +
                escape(serial_) + "\",\"name\":\"" + escape(name_) +
                "\",\"topic_prefix\":\"" + escape(prefix_) + "\"}";
    if (identity_.length() > 512) return false;

    BLEDevice::init((String("SproutSync-") + String(chipId).substring(6)).c_str());
    BLEServer* server = BLEDevice::createServer();
    server->setCallbacks(&callbacks_);
    BLEService* service = server->createService("f7b20001-11f9-4c7c-9f23-74c367499f20");
    BLECharacteristic* characteristic = service->createCharacteristic(
        "f7b20002-11f9-4c7c-9f23-74c367499f20", BLECharacteristic::PROPERTY_READ);
    characteristic->setValue(identity_.c_str());
    service->start();
    BLEAdvertising* advertising = BLEDevice::getAdvertising();
    advertising->addServiceUUID(service->getUUID());
    advertising->setScanResponse(true);
    BLEDevice::startAdvertising();
    started_ = true;
    return true;
  }

  void loop() {
    if (!started_) return;
    if (restartAdvertising_.exchange(false)) {
      BLEDevice::startAdvertising();
    }
    if (WiFi.status() != WL_CONNECTED) {
      if (mdnsStarted_) MDNS.end();
      mdnsStarted_ = false;
      return;
    }
    if (!serverStarted_) {
      identityServer_.begin();
      serverStarted_ = true;
    }
    if (!mdnsStarted_ && MDNS.begin(hostname_.c_str())) {
      MDNS.addService("sproutsync", "tcp", kIdentityPort);
      MDNS.addServiceTxt("sproutsync", "tcp", "protocol", "sproutsync-discovery-v1");
      MDNS.addServiceTxt("sproutsync", "tcp", "model", "ESP32");
      MDNS.addServiceTxt("sproutsync", "tcp", "serial_number", serial_.c_str());
      MDNS.addServiceTxt("sproutsync", "tcp", "name", name_.c_str());
      MDNS.addServiceTxt("sproutsync", "tcp", "topic_prefix", prefix_.c_str());
      mdnsStarted_ = true;
    }
    // A small JSON greeting on the advertised TCP port; never wait for input.
    WiFiClient client = identityServer_.available();
    if (client) {
      client.println(identity_);
      client.stop();
    }
  }

  const String& serialNumber() const { return serial_; }
  const String& topicPrefix() const { return prefix_; }
  const String& identityJson() const { return identity_; }

 private:
  static constexpr uint16_t kIdentityPort = 45900;
  std::atomic_bool restartAdvertising_{false};
  class Callbacks : public BLEServerCallbacks {
   public:
    explicit Callbacks(std::atomic_bool& restart) : restart_(restart) {}
    void onDisconnect(BLEServer*) override { restart_ = true; }
   private:
    std::atomic_bool& restart_;
  } callbacks_{restartAdvertising_};
  WiFiServer identityServer_{kIdentityPort};
  String serial_, name_, prefix_, hostname_, identity_;
  bool started_ = false, mdnsStarted_ = false, serverStarted_ = false;

  static bool validSerial(const String& value) {
    if (!value.length() || !isalnum(static_cast<unsigned char>(value[0]))) return false;
    for (size_t i = 0; i < value.length(); ++i) {
      const char c = value[i];
      if (!isalnum(static_cast<unsigned char>(c)) && c != ':' && c != '_' && c != '-') return false;
    }
    return true;
  }
  static bool validPrefix(const String& value) {
    if (!value.length() || value[0] == '/' || value[value.length() - 1] == '/') return false;
    for (size_t i = 0; i < value.length(); ++i) {
      const char c = value[i];
      if (!isalnum(static_cast<unsigned char>(c)) && c != '_' && c != '-' && c != '/') return false;
      if (c == '/' && i && value[i - 1] == '/') return false;
    }
    return true;
  }
  static String escape(const String& value) {
    String result;
    for (size_t i = 0; i < value.length(); ++i) {
      const unsigned char c = value[i];
      if (c == '"' || c == '\\') { result += '\\'; result += static_cast<char>(c); }
      else if (c < 32) { char escaped[7]; snprintf(escaped, sizeof(escaped), "\\u%04x", c); result += escaped; }
      else result += static_cast<char>(c);
    }
    return result;
  }
};
