#include <WiFi.h>
#include <WiFiManager.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include <ESPmDNS.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <SPI.h>
#include <SD.h>
#include <Preferences.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_SHT4x.h>
#include <BH1750.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// Keep false so EMQX TLS (Port 8883) has plenty of free RAM and never lags!
#define ENABLE_BLE_TELEMETRY false

#if ENABLE_BLE_TELEMETRY
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#endif

// ==========================================
// 1. WIFI & EMQX CLOUD SERVERLESS CONFIG
// ==========================================
#if __has_include("discovery_secrets.h")
#include "discovery_secrets.h"
#elif __has_include("discovery_secret.h")
#include "discovery_secret.h"
#else
#define SPROUTSYNC_WIFI_SSID ""
#define SPROUTSYNC_WIFI_PASSWORD ""
#define SPROUTSYNC_MQTT_SERVER ""
#define SPROUTSYNC_MQTT_PORT 8883
#define SPROUTSYNC_MQTT_USERNAME ""
#define SPROUTSYNC_MQTT_PASSWORD ""
#define SPROUTSYNC_MQTT_CA_CERT ""
#endif

#ifndef SPROUTSYNC_MQTT_SERVER
#define SPROUTSYNC_MQTT_SERVER ""
#endif
#ifndef SPROUTSYNC_MQTT_PORT
#define SPROUTSYNC_MQTT_PORT 8883
#endif
#ifndef SPROUTSYNC_MQTT_USERNAME
#define SPROUTSYNC_MQTT_USERNAME ""
#endif
#ifndef SPROUTSYNC_MQTT_PASSWORD
#define SPROUTSYNC_MQTT_PASSWORD ""
#endif
#ifndef SPROUTSYNC_MQTT_CA_CERT
#define SPROUTSYNC_MQTT_CA_CERT ""
#endif

const char* WIFI_SSID     = SPROUTSYNC_WIFI_SSID;
const char* WIFI_PASSWORD = SPROUTSYNC_WIFI_PASSWORD;
const char* MQTT_SERVER   = SPROUTSYNC_MQTT_SERVER;
constexpr uint16_t MQTT_PORT = SPROUTSYNC_MQTT_PORT;
const char* MQTT_USERNAME = SPROUTSYNC_MQTT_USERNAME;
const char* MQTT_PASSWORD = SPROUTSYNC_MQTT_PASSWORD;

const char* GLOBAL_TOPIC_CALIB     = "sproutsync/calibrate";
const char* GLOBAL_TOPIC_AUTOCALIB = "sproutsync/autocalib";

// ==========================================
// 2. PIN DEFINITIONS (ESP32-WROOM-32)
// ==========================================
#define SD_CS_PIN          5
#define SD_SCK_PIN         18
#define SD_MISO_PIN        19
#define SD_MOSI_PIN        23
#define SD_SPI_FREQUENCY   1000000
#define ONE_WIRE_BUS       4
#define BUTTON_PIN         13   // Push button to GND
#define SENSOR_POWER_RELAY 16   // Controls Relay Ch3 & Ch4 [Active-LOW]
#define VOLTAGE_PIN        34   // ADC1 pin for 5V rail monitoring
#define BUZZER_PIN         25   // Active Buzzer (HIGH = ON)
#define LED_RED            14   // Fault / Shortage Indicator
#define LED_GREEN          27   // System Normal Indicator
#define LED_BLUE           26   // Online / MQTT Connected Indicator
#define RELAY_PUMP         32   // Active-LOW Relay Ch1
#define RELAY_VALVE        33   // Active-LOW Relay Ch2

#define ENABLE_VOLTAGE_SHUTDOWN false
#define MIN_SAFE_VOLTAGE 4.20

// ==========================================
// 3. OBJECTS & GLOBAL STATE
// ==========================================
Adafruit_SSD1306 display(128, 64, &Wire, -1);
Adafruit_SHT4x sht4 = Adafruit_SHT4x();
BH1750 lightMeter;
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature waterTemp(&oneWire);

WiFiClientSecure espClient;
PubSubClient mqtt(espClient);
Preferences prefs;
WiFiServer discoveryIdentityServer(45900);

String deviceSerial, deviceName, deviceHostname;
String topicPrefix, topicTelemetry, topicStatus;
String topicPower, topicCalib, topicAutoCalib, identityJson;

uint32_t bootNonce = 0;
uint32_t messageSequence = 0;
bool mqttConfigured = false;
bool hasCaCert = false;
bool mdnsStarted = false;
bool identityServerStarted = false;
bool ntpConfigured = false;

#if ENABLE_BLE_TELEMETRY
BLECharacteristic* bleIdentityCharacteristic = nullptr;
BLECharacteristic* bleTelemetryCharacteristic = nullptr;
class SproutSyncBleCallbacks : public BLEServerCallbacks {
  void onDisconnect(BLEServer*) override {
    BLEDevice::startAdvertising();
  }
};
SproutSyncBleCallbacks bleServerCallbacks;
#endif

// System Status Flags
bool systemPowerOn      = true;
bool pendingSystemBoot  = false;
bool shortageTripped    = false;
bool sdCardOK           = false;
bool sht4OK             = false;
bool bh1750OK           = false;
bool ds18b20OK          = false;
bool isOnline           = false;
bool autoCalibEnabled   = true;
String faultReason      = "NONE";
String lastLoggedFault  = "NONE"; // Tracks state changes for immediate SD logging

enum class ActuatorTestTarget : uint8_t { None, Pump, Valve };
constexpr unsigned long ACTUATOR_TEST_DURATION_MS = 10000;
ActuatorTestTarget actuatorTestTarget = ActuatorTestTarget::None;
unsigned long actuatorTestStartedAt = 0;
String actuatorTestCommandId;
String actuatorTestState = "IDLE";

// 3-Beep Looping Alarm State
bool alarmLoopActive             = false;
int  beepsRemaining              = 0;
bool buzzerState                 = false;
unsigned long lastBeepMillis     = 0;
unsigned long lastBeepLoopMillis = 0;

// Live Readings & Calibration Offsets
float rAirTemp = 0, rAirHum = 0, rWatTemp = 0, rLux = 0, sysVoltage = 5.0;
float calAirTemp = 0.0, calAirHum = 0.0, calWatTemp = 0.0, calLux = 1.0;

const float TARGET_AIR_TEMP = 26.0;
const float TARGET_AIR_HUM  = 80.0;
const float TARGET_WAT_TEMP = 25.0;

// Non-blocking Timers
unsigned long lastSensorMillis          = 0;
unsigned long lastOledMillis            = 0;
unsigned long lastNetMillis             = 0;
unsigned long lastWifiRetryMillis       = 0;
unsigned long lastAutoCalibMillis       = 0;
unsigned long lastSdRetryMillis         = 0;
unsigned long lastSdLogMillis           = 0; // SD card logging timer
unsigned long buttonPressTime           = 0;
bool buttonHeld                         = false;
int  autoCalibCount                     = 0;
unsigned long lastMdnsAttempt           = 0;

const unsigned long SD_RETRY_INTERVAL   = 30000;
const unsigned long AUTO_CALIB_INTERVAL = 5000;
const unsigned long WIFI_RETRY_INTERVAL = 15000;
const unsigned long SD_LOG_INTERVAL     = 10000; // 5 minutes (300,000 ms)
const time_t MIN_VALID_EPOCH            = 1704067200;
const size_t   MAX_LOG_FILE_BYTES = 5UL * 1024UL * 1024UL;     // Rotate at 5 MB
const uint64_t MIN_SD_FREE_BYTES  = 50ULL * 1024ULL * 1024ULL; // Keep at least 50 MB free

// ==========================================
// 4. FUNCTION PROTOTYPES
// ==========================================
void setSensorPower(bool turnOn);
void startBeeps(int count);
void updateBuzzer();
void performAutoCalibration();
void runSystemCheck();
bool initializeSDCard();
void readVoltageAndCheckShortage();
void handlePushButton();
void maintainDiscovery();
void maintainConnectivity();
void startBluetoothTelemetry();
void updateBluetoothTelemetry();
String jsonNumber(float value, uint8_t precision);
void loadCalibration();
void saveCalibration(float t, float h, float w, float l);
void updateOLED();
void logToSDCard();
void publishMQTT();
void forceActuatorsOff();
bool validCommandId(const String& value);
void startActuatorTest(ActuatorTestTarget target, const String& commandId);
void stopActuatorTest(const char* state);
void updateActuatorTest();

// ==========================================
// 5. SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  Wire.setClock(400000);

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(SENSOR_POWER_RELAY, OUTPUT);
  pinMode(VOLTAGE_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_BLUE, OUTPUT);
  digitalWrite(RELAY_PUMP, HIGH);
  digitalWrite(RELAY_VALVE, HIGH);
  pinMode(RELAY_PUMP, OUTPUT);
  pinMode(RELAY_VALVE, OUTPUT);

  forceActuatorsOff();
  setSensorPower(true);
  SPI.begin(SD_SCK_PIN, SD_MISO_PIN, SD_MOSI_PIN, SD_CS_PIN);
  digitalWrite(BUZZER_PIN, LOW);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED Init Failed");
  }
  display.clearDisplay();
  display.setTextColor(WHITE);
  display.setTextSize(1);

  loadCalibration();
  runSystemCheck();

  char chipId[13];
  snprintf(chipId, sizeof(chipId), "%012llX",
           static_cast<unsigned long long>(ESP.getEfuseMac()));
  deviceSerial   = String("ESP32-") + chipId;
  deviceName     = String("SproutSync ESP32 ") + String(chipId).substring(6);
  deviceHostname = String("sproutsync-") + chipId;
  deviceHostname.toLowerCase();

  topicPrefix    = String("sproutsync/") + deviceSerial;
  topicTelemetry = topicPrefix + "/telemetry";
  topicStatus    = topicPrefix + "/status";
  topicPower     = topicPrefix + "/power";
  topicCalib     = topicPrefix + "/calibrate";
  topicAutoCalib = topicPrefix + "/autocalib";

  identityJson = String("{\"protocol\":\"sproutsync-discovery-v1\",\"model\":\"ESP32\",\"serial_number\":\"") +
                 deviceSerial + "\",\"name\":\"" + deviceName +
                 "\",\"topic_prefix\":\"" + topicPrefix + "\"}";

  startBluetoothTelemetry();
  bootNonce = esp_random();
  Serial.printf("SproutSync serial: %s\n", deviceSerial.c_str());

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  WiFiManager wm;
  wm.setConnectTimeout(15);      // Try old Wi-Fi for 15s before opening phone portal
  wm.setConfigPortalTimeout(120); // Close portal after 2 min so Offline-First still runs

  // Hold GPIO 13 push button while powering on to force-switch Wi-Fi even if old router is nearby
  bool forceWifiPortal = (digitalRead(BUTTON_PIN) == LOW);

  display.clearDisplay();
  display.setCursor(0, 0);
  if (forceWifiPortal) {
    startBeeps(2);
    display.println("Wi-Fi Reset Triggered");
  } else {
    display.println("Connecting Wi-Fi...");
  }
  display.println("If new place, join:");
  display.println("SSID: SproutSync-Setup");
  display.println("URL : 192.168.4.1");
  display.display();

  bool wifiOk = forceWifiPortal
    ? wm.startConfigPortal("SproutSync-Setup")
    : wm.autoConnect("SproutSync-Setup");

  if (wifiOk) {
    Serial.printf("Wi-Fi connected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("No Wi-Fi set; continuing in Offline-First mode.");
  }

  mqttConfigured = strlen(MQTT_SERVER) && strlen(MQTT_USERNAME) && strlen(MQTT_PASSWORD);
  hasCaCert      = strlen(SPROUTSYNC_MQTT_CA_CERT) > 0;

  if (mqttConfigured) {
    espClient.setTimeout(3);
    if (hasCaCert) {
      espClient.setCACert(SPROUTSYNC_MQTT_CA_CERT);
    } else {
      espClient.setInsecure();
    }
    mqtt.setServer(MQTT_SERVER, MQTT_PORT);
    mqtt.setSocketTimeout(3);
    mqtt.setBufferSize(1024);

    mqtt.setCallback([](char* topic, byte* payload, unsigned int length) {
      String msg = "";
      for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
      msg.trim();
      String tStr = String(topic);
      Serial.printf("MQTT [%s]: %s\n", topic, msg.c_str());

      // Actuator commands are accepted only on this device's private topic.
      // Global power topics must never energize relays across the fleet.
      if (tStr == topicPower) {
        if (msg == "OFF") {
          systemPowerOn   = false;
          alarmLoopActive = false;
          beepsRemaining  = 0;
          digitalWrite(BUZZER_PIN, LOW);
          digitalWrite(LED_RED, LOW);
          digitalWrite(LED_GREEN, LOW);
          forceActuatorsOff();
          setSensorPower(false);
          faultReason = "SYSTEM OFF";
          startBeeps(1);
          updateOLED();
          updateBluetoothTelemetry();
          if (isOnline) publishMQTT();
        } else if (msg == "ON") {
          shortageTripped   = false;
          systemPowerOn     = true;
          alarmLoopActive   = false;
          pendingSystemBoot = true;
          startBeeps(1);
        } else if (msg.startsWith("PUMP_TEST:")) {
          startActuatorTest(ActuatorTestTarget::Pump, msg.substring(10));
        } else if (msg.startsWith("VALVE_TEST:")) {
          startActuatorTest(ActuatorTestTarget::Valve, msg.substring(11));
        } else if (msg.startsWith("STOP_TEST:")) {
          String commandId = msg.substring(10);
          if (validCommandId(commandId)) {
            actuatorTestCommandId = commandId;
            stopActuatorTest("STOPPED");
          }
        }
      }

      if (tStr == topicCalib || tStr == GLOBAL_TOPIC_CALIB) {
        float t, h, w, l;
        if (sscanf(msg.c_str(), "%f,%f,%f,%f", &t, &h, &w, &l) == 4) {
          saveCalibration(t, h, w, l);
          startBeeps(2);
        }
      }

      if (tStr == topicAutoCalib || tStr == GLOBAL_TOPIC_AUTOCALIB) {
        if (msg == "ON")  { autoCalibEnabled = true;  startBeeps(1); }
        if (msg == "OFF") { autoCalibEnabled = false; startBeeps(1); }
        if (msg == "NOW" && systemPowerOn) { performAutoCalibration(); startBeeps(2); }
      }
    });
  }
}

// ==========================================
// 6. MAIN LOOP
// ==========================================
void loop() {
  maintainDiscovery();
  maintainConnectivity();
  updateActuatorTest();
  updateBuzzer();
  handlePushButton();
  readVoltageAndCheckShortage();

  // 1. Wake up sensors if turned ON remotely
  if (pendingSystemBoot) {
    pendingSystemBoot = false;
    setSensorPower(true);
    runSystemCheck();
    updateBluetoothTelemetry();
    if (isOnline) publishMQTT();
  }

  // 2. Fast OLED Refresh every 250ms
  if (millis() - lastOledMillis >= 250) {
    lastOledMillis = millis();
    updateOLED();
  }

  // 3. Standby Mode when OFF or Shortage Tripped
  if (!systemPowerOn || shortageTripped) {
    forceActuatorsOff();
    setSensorPower(false);
    digitalWrite(LED_GREEN, LOW);
    if (!shortageTripped) digitalWrite(LED_RED, LOW);
    alarmLoopActive = shortageTripped;

    if (millis() - lastSensorMillis >= 2000) {
      lastSensorMillis = millis();
      rAirTemp = 0; rAirHum = 0; rWatTemp = 0; rLux = 0;
      faultReason = shortageTripped ? "SHORTAGE / LOW V!" : "SYSTEM OFF";

      updateBluetoothTelemetry();
      if (isOnline) publishMQTT();

      if (faultReason != lastLoggedFault) {
        logToSDCard();
        lastLoggedFault = faultReason;
      }
    }
    return;
  }

  // 4. Every 2 Seconds: Read Sensors & Publish Data
  if (millis() - lastSensorMillis >= 2000) {
    lastSensorMillis = millis();
    bool faultDetected = false;
    faultReason = "NONE";

    // READ SHT40
    if (sht4OK) {
      sensors_event_t humidity, temp;
      if (sht4.getEvent(&humidity, &temp)) {
        rAirTemp = temp.temperature + calAirTemp;
        rAirHum  = humidity.relative_humidity + calAirHum;
      } else {
        sht4OK = false;
        faultDetected = true; faultReason = "SHT4x READ ERR";
      }
    } else {
      faultDetected = true; faultReason = "SHT4x MISSING";
    }

    // READ DS18B20
    float rawWat = waterTemp.getTempCByIndex(0);
    waterTemp.requestTemperatures();
    if (rawWat <= -127.0 || rawWat >= 85.0) {
      ds18b20OK = false;
      faultDetected = true; faultReason = "DS18B20 ERR";
    } else {
      ds18b20OK = true;
      rWatTemp = rawWat + calWatTemp;
    }

    // READ BH1750
    if (bh1750OK) {
      rLux = lightMeter.readLightLevel() * calLux;
    } else {
      faultDetected = true; faultReason = "BH1750 MISSING";
    }

    // FAULT ALERTS
    if (faultDetected || !sdCardOK) {
      if (!sdCardOK && faultReason == "NONE") faultReason = "SD CARD ERR";
      digitalWrite(LED_GREEN, LOW);
      digitalWrite(LED_RED, HIGH);
      if (faultDetected) {
        forceActuatorsOff(); // Only cut pump/valve on real sensor faults
      }

      if (!alarmLoopActive) {
        alarmLoopActive = true;
        startBeeps(3);
        lastAutoCalibMillis = millis();
      }
    } else {
      digitalWrite(LED_RED, LOW);
      digitalWrite(LED_GREEN, HIGH);
      if (alarmLoopActive) {
        alarmLoopActive = false;
        beepsRemaining = 0;
        digitalWrite(BUZZER_PIN, LOW);
      }
      autoCalibCount = 0;
    }

    // ----------------------------------------------------
    // 4a. LIVE DATA: Publish to EMQX & Bluetooth EVERY 2 SECONDS
    // ----------------------------------------------------
    updateBluetoothTelemetry();
    if (isOnline) publishMQTT();

    // ----------------------------------------------------
    // 4b. OFFLINE BACKUP: Log to SD Card EVERY 5 MINUTES
    // ----------------------------------------------------
    // Log if 5 minutes have passed, OR if the system state suddenly changes to a fault
    if (millis() - lastSdLogMillis >= SD_LOG_INTERVAL || faultReason != lastLoggedFault) {
      lastSdLogMillis = millis();
      logToSDCard();
      lastLoggedFault = faultReason;
    }
  }

  // 5. Run 5-Second Auto-Calibration on fault
  if (systemPowerOn && !shortageTripped && alarmLoopActive &&
      autoCalibEnabled && millis() - lastAutoCalibMillis >= AUTO_CALIB_INTERVAL) {
    lastAutoCalibMillis = millis();
    performAutoCalibration();
  }
}

// ==========================================
// 7. HELPER FUNCTIONS
// ==========================================
void setSensorPower(bool turnOn) {
  if (!turnOn) {
    if (sdCardOK) {
      SD.end();
      sdCardOK = false;
    }
    SPI.end();
    // Release SPI pins to High-Z so they do not back-power the SD module
    pinMode(SD_CS_PIN, INPUT);
    pinMode(SD_SCK_PIN, INPUT);
    pinMode(SD_MOSI_PIN, INPUT);
    pinMode(SD_MISO_PIN, INPUT);
  }
  digitalWrite(SENSOR_POWER_RELAY, turnOn ? LOW : HIGH);
}

void startBeeps(int count) {
  beepsRemaining = count * 2;
  buzzerState = true;
  digitalWrite(BUZZER_PIN, HIGH);
  lastBeepMillis = millis();
  lastBeepLoopMillis = millis();
}

void updateBuzzer() {
  if (beepsRemaining > 0) {
    if (millis() - lastBeepMillis >= 150) {
      lastBeepMillis = millis();
      beepsRemaining--;
      if (beepsRemaining > 0) {
        buzzerState = !buzzerState;
        digitalWrite(BUZZER_PIN, buzzerState ? HIGH : LOW);
      } else {
        buzzerState = false;
        digitalWrite(BUZZER_PIN, LOW);
        lastBeepLoopMillis = millis();
      }
    }
  }
  else if (alarmLoopActive) {
    if (millis() - lastBeepLoopMillis >= 3000) {
      startBeeps(3);
    }
  }
}

void performAutoCalibration() {
  autoCalibCount++;
  if (!sdCardOK && (autoCalibCount % 2 == 1)) {
    sdCardOK = initializeSDCard();
  }
  if (!sht4OK) {
    sht4OK = sht4.begin();
    if (sht4OK) { sht4.setPrecision(SHT4X_HIGH_PRECISION); sht4.setHeater(SHT4X_NO_HEATER); }
  }
  if (!bh1750OK) bh1750OK = lightMeter.begin();
  if (!ds18b20OK) {
    waterTemp.begin();
    waterTemp.setWaitForConversion(false);
    waterTemp.requestTemperatures();
  }

  float newCalT = calAirTemp, newCalH = calAirHum, newCalW = calWatTemp, newCalL = (calLux <= 0.0) ? 1.0 : calLux;

  if (sht4OK) {
    sensors_event_t humidity, temp;
    if (sht4.getEvent(&humidity, &temp)) {
      if ((temp.temperature + newCalT) < -10 || (temp.temperature + newCalT) > 80) {
        newCalT = TARGET_AIR_TEMP - temp.temperature;
      }
      if ((humidity.relative_humidity + newCalH) < 0 || (humidity.relative_humidity + newCalH) > 100) {
        newCalH = constrain(TARGET_AIR_HUM - humidity.relative_humidity, -20.0, 20.0);
      }
    }
  }

  float rawW = waterTemp.getTempCByIndex(0);
  if (rawW > -127.0 && rawW < 85.0) {
    ds18b20OK = true;
    if ((rawW + newCalW) < 0 || (rawW + newCalW) > 60) {
      newCalW = TARGET_WAT_TEMP - rawW;
    }
  }

  saveCalibration(newCalT, newCalH, newCalW, newCalL);

  if (isOnline) {
    mqtt.publish(topicStatus.c_str(), "AUTO_CALIBRATED");
  }
}

void runSystemCheck() {
  setSensorPower(true);
  delay(250);

  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.setTextColor(WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("=== SYSTEM CHECK ===");
  display.display();

  if (sdCardOK) { SD.end(); sdCardOK = false; }
  sdCardOK = initializeSDCard();
  lastSdRetryMillis = millis();
  display.print("SD Card: "); display.println(sdCardOK ? "OK" : "FAIL");

  sht4OK = sht4.begin();
  if (sht4OK) { sht4.setPrecision(SHT4X_HIGH_PRECISION); sht4.setHeater(SHT4X_NO_HEATER); }
  display.print("SHT4x  : "); display.println(sht4OK ? "OK" : "FAIL");

  bh1750OK = lightMeter.begin();
  display.print("BH1750 : "); display.println(bh1750OK ? "OK" : "FAIL");

  waterTemp.begin();
  waterTemp.setWaitForConversion(true);
  waterTemp.requestTemperatures();
  ds18b20OK = (waterTemp.getTempCByIndex(0) > -127.0);
  waterTemp.setWaitForConversion(false);
  waterTemp.requestTemperatures();
  display.print("DS18B20: "); display.println(ds18b20OK ? "OK" : "FAIL");

  display.display();
  delay(1000);
}

void readVoltageAndCheckShortage() {
  int adcVal = analogRead(VOLTAGE_PIN);
  sysVoltage = (adcVal / 4095.0) * 3.3 * 2.0;

  if (ENABLE_VOLTAGE_SHUTDOWN && systemPowerOn && !shortageTripped) {
    if (sysVoltage < MIN_SAFE_VOLTAGE) {
      shortageTripped = true;
      systemPowerOn   = false;
      faultReason     = "SHORTAGE / LOW V!";
      forceActuatorsOff();
      setSensorPower(false);

      digitalWrite(LED_RED, HIGH);
      digitalWrite(LED_GREEN, LOW);
      alarmLoopActive = true;
      startBeeps(3);
    }
  }
}

void handlePushButton() {
  bool btnState = (digitalRead(BUTTON_PIN) == LOW);

  if (btnState && buttonPressTime == 0) {
    buttonPressTime = millis();
    buttonHeld = false;
  }
  else if (btnState && !buttonHeld && (millis() - buttonPressTime > 3000)) {
    buttonHeld = true;
    startBeeps(2);
    saveCalibration(0.0, 0.0, 0.0, 1.0);
    runSystemCheck();
  }
  else if (!btnState && buttonPressTime > 0) {
    if (!buttonHeld && (millis() - buttonPressTime > 50)) {
      if (shortageTripped) {
        shortageTripped = false;
        systemPowerOn   = true;
        alarmLoopActive = false;
        startBeeps(1);
        runSystemCheck();
      } else {
        systemPowerOn = !systemPowerOn;
        alarmLoopActive = false;
        beepsRemaining = 0;
        digitalWrite(BUZZER_PIN, LOW);
        startBeeps(1);
        if (systemPowerOn) {
          runSystemCheck();
        } else {
          setSensorPower(false);
        }
      }
    }
    buttonPressTime = 0;
  }
}

void maintainDiscovery() {
  if (WiFi.status() != WL_CONNECTED) {
    if (mdnsStarted) MDNS.end();
    if (identityServerStarted) discoveryIdentityServer.stop();
    mdnsStarted = false;
    identityServerStarted = false;
    return;
  }

  if (!mdnsStarted && millis() - lastMdnsAttempt >= 5000) {
    lastMdnsAttempt = millis();
    if (MDNS.begin(deviceHostname.c_str())) {
      MDNS.addService("sproutsync", "tcp", 45900);
      MDNS.addServiceTxt("sproutsync", "tcp", "protocol", "sproutsync-discovery-v1");
      MDNS.addServiceTxt("sproutsync", "tcp", "model", "ESP32");
      MDNS.addServiceTxt("sproutsync", "tcp", "serial_number", deviceSerial.c_str());
      MDNS.addServiceTxt("sproutsync", "tcp", "name", deviceName.c_str());
      MDNS.addServiceTxt("sproutsync", "tcp", "topic_prefix", topicPrefix.c_str());
      mdnsStarted = true;
    }
  }

  if (!identityServerStarted) {
    discoveryIdentityServer.begin();
    identityServerStarted = true;
  }
  WiFiClient client = discoveryIdentityServer.available();
  if (client) {
    client.println(identityJson);
    client.stop();
  }
}

void startBluetoothTelemetry() {
#if ENABLE_BLE_TELEMETRY
  BLEDevice::init(deviceName.c_str());
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(&bleServerCallbacks);
  BLEService* service =
      server->createService("f7b20001-11f9-4c7c-9f23-74c367499f20");
  bleIdentityCharacteristic = service->createCharacteristic(
      "f7b20002-11f9-4c7c-9f23-74c367499f20",
      BLECharacteristic::PROPERTY_READ);
  bleIdentityCharacteristic->setValue(identityJson.c_str());
  bleTelemetryCharacteristic = service->createCharacteristic(
      "f7b20003-11f9-4c7c-9f23-74c367499f20",
      BLECharacteristic::PROPERTY_READ);
  service->start();

  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(service->getUUID());
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
  updateBluetoothTelemetry();
#endif
}

void updateBluetoothTelemetry() {
#if ENABLE_BLE_TELEMETRY
  if (!bleTelemetryCharacteristic) return;
  String messageId = deviceSerial + "-" + String(bootNonce, HEX) + "-" + String(++messageSequence);
  String payload = "{\"serialNumber\":\"" + deviceSerial +
      "\",\"messageId\":\"" + messageId +
      "\",\"airTemp\":" + jsonNumber(rAirTemp, 2) +
      ",\"airHum\":" + jsonNumber(rAirHum, 2) +
      ",\"waterTemp\":" + jsonNumber(rWatTemp, 2) +
      ",\"lux\":" + jsonNumber(rLux, 1) +
      ",\"waterLevel\":null,\"wastewaterLevel\":null" +
      ",\"voltage\":" + jsonNumber(sysVoltage, 2) +
      ",\"sdOK\":" + String(sdCardOK ? "true" : "false") +
      ",\"status\":\"" + faultReason + "\"}";
  bleTelemetryCharacteristic->setValue(payload.c_str());
#endif
}

String jsonNumber(float value, uint8_t precision) {
  return isfinite(value) ? String(value, static_cast<unsigned int>(precision)) : String("null");
}

void maintainConnectivity() {
  const bool wifiConnected = (WiFi.status() == WL_CONNECTED);
  if (wifiConnected && !ntpConfigured) {
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    ntpConfigured = true;
  }
  const bool clockReady = (!hasCaCert) || (time(nullptr) >= MIN_VALID_EPOCH);

  if (wifiConnected && mqttConfigured && clockReady) {
    if (!mqtt.connected()) {
      isOnline = false;
      digitalWrite(LED_BLUE, LOW);
      if (millis() - lastNetMillis > 8000) {
        lastNetMillis = millis();
        String clientId = deviceSerial + "_" + String(bootNonce, HEX);
        if (mqtt.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD, topicStatus.c_str(), 1, true, "OFFLINE")) {
          isOnline = true;
          digitalWrite(LED_BLUE, HIGH);
          mqtt.subscribe(topicPower.c_str());
          mqtt.subscribe(topicCalib.c_str());
          mqtt.subscribe(topicAutoCalib.c_str());
          mqtt.subscribe(GLOBAL_TOPIC_CALIB);
          mqtt.subscribe(GLOBAL_TOPIC_AUTOCALIB);
          mqtt.publish(topicStatus.c_str(), "ONLINE", true);
        }
      }
    } else {
      isOnline = true;
      digitalWrite(LED_BLUE, HIGH);
      mqtt.loop();
    }
  } else {
    isOnline = false;
    digitalWrite(LED_BLUE, LOW);
   if (!wifiConnected && millis() - lastWifiRetryMillis >= WIFI_RETRY_INTERVAL) {
      lastWifiRetryMillis = millis();
      WiFi.reconnect();
    }
  }
}

void updateOLED() {
  display.clearDisplay();
  display.setCursor(0, 0);

  if (isOnline) display.print("ONL ");
  else if (WiFi.status() == WL_CONNECTED) display.print("W:OK ");
  else display.print("OFL ");

  display.print(sdCardOK ? "SD:OK " : "SD:ER ");
  display.print(sysVoltage, 1); display.println("V");
  display.println("---------------------");

  if (shortageTripped) {
    display.println("!! AUTO SHUTDOWN !!");
    display.println("SHORTAGE / LOW VOLT");
    display.print("Measured: "); display.print(sysVoltage); display.println("V");
    display.println("Sensors 3V3/5V: CUT");
    display.display();
    return;
  }

  if (!systemPowerOn) {
    display.println("   [ SYSTEM OFF ]   ");
    display.println("Sensors 3V3/5V: OFF");
    display.println("ESP32 Wi-Fi  : AWAKE");
    display.println("Waiting Web/Btn ON...");
    display.display();
    return;
  }

  display.print("Air : "); display.print(rAirTemp, 1); display.print("C | ");
  display.print(rAirHum, 0); display.println("%");
  display.print("Wat : "); display.print(rWatTemp, 1); display.println("C");
  display.print("Lux : "); display.print(rLux, 0); display.println(" lx");
  display.println("---------------------");

  if (faultReason == "NONE") {
    display.println("STS : SYSTEM NORMAL");
  } else {
    display.print("FLT : "); display.println(faultReason);
    if (autoCalibEnabled) {
      unsigned long elapsed = millis() - lastAutoCalibMillis;
      unsigned long remaining = elapsed >= AUTO_CALIB_INTERVAL ? 0 : AUTO_CALIB_INTERVAL - elapsed;
      display.print("AutoCalib #"); display.print(autoCalibCount);
      display.print(" in "); display.print((remaining + 999) / 1000); display.println("s");
    }
  }
  display.display();
}
void maintainSDStorage() {
  if (!sdCardOK) return;

  uint64_t total = SD.totalBytes();
  uint64_t used  = SD.usedBytes();
  uint64_t freeBytes = (total > used) ? (total - used) : 0;

  size_t currentSize = 0;
  if (SD.exists("/data.csv")) {
    File f = SD.open("/data.csv", FILE_READ);
    if (f) {
      currentSize = f.size();
      f.close();
    }
  }

  bool fileTooBig = (currentSize >= MAX_LOG_FILE_BYTES);
  bool diskLow    = (total > 0 && freeBytes < MIN_SD_FREE_BYTES);

  if (fileTooBig || diskLow) {
    if (SD.exists("/data_old.csv")) {
      SD.remove("/data_old.csv"); // Delete the oldest archive first
    }
    if (currentSize > 0 && SD.exists("/data.csv")) {
      SD.rename("/data.csv", "/data_old.csv"); // Move current file to archive
    }
    File fresh = SD.open("/data.csv", FILE_WRITE);
    if (fresh) {
      fresh.println("Millis,AirTemp,AirHum,WaterTemp,Lux,Voltage,Online,Status");
      fresh.close();
    }
    Serial.println("SD Log rotated: oldest data removed.");
  }
}
void logToSDCard() {
  if (!sdCardOK) {
    Serial.println("[SD ERR] Skipped log: sdCardOK is already false.");
    return;
  }

  uint8_t cardType = SD.cardType();
  if (cardType == CARD_NONE) {
    Serial.println("[SD ERR] Card lost before open (CARD_NONE) -> check 5V power/loose pins.");
    SD.end();
    sdCardOK = false;
    lastSdRetryMillis = millis();
    return;
  }

  File dataFile = SD.open("/data.csv", FILE_APPEND);
  if (!dataFile) {
    Serial.println("[SD ERR] SD.open(/data.csv) failed -> mount lost or FAT32 error.");
    SD.end();
    sdCardOK = false;
    lastSdRetryMillis = millis();
    return;
  }

  char row[192];
  int rowLength = snprintf(
    row, sizeof(row), "%lu,%.2f,%.2f,%.2f,%.1f,%.2f,%s,%s\n",
    millis() / 1000, rAirTemp, rAirHum, rWatTemp, rLux, sysVoltage,
    isOnline ? "ONLINE" : "OFFLINE", faultReason.c_str()
  );

  size_t written = (rowLength > 0 && rowLength < (int)sizeof(row))
    ? dataFile.write(reinterpret_cast<const uint8_t*>(row), rowLength) : 0;
  int writeErr = dataFile.getWriteError();
  dataFile.flush();
  dataFile.close();

  if (written != (size_t)rowLength || writeErr != 0) {
    Serial.printf("[SD ERR] Write failed! wrote=%u/%d, writeErr=%d -> power sag or SPI noise.\n",
                  (unsigned)written, rowLength, writeErr);
    SD.end();
    sdCardOK = false;
    lastSdRetryMillis = millis();
  } else {
    Serial.printf("[SD OK] Logged %u bytes at %lus.\n", (unsigned)written, millis() / 1000);
  }
}
// Add this helper before initializeSDCard() ONLY if MicroSD VCC is wired through Relay Ch4:
void powerCycleSDModule() {
  SD.end();
  SPI.end();
  pinMode(SD_CS_PIN, INPUT);
  pinMode(SD_SCK_PIN, INPUT);
  pinMode(SD_MOSI_PIN, INPUT);
  pinMode(SD_MISO_PIN, INPUT);
  digitalWrite(SENSOR_POWER_RELAY, HIGH); // Cut Relay Ch3 & Ch4 power
  delay(350);                             // Let SD card fully discharge
  digitalWrite(SENSOR_POWER_RELAY, LOW);  // Restore power
  delay(250);                             // Wait for card boot
}

bool initializeSDCard() {
  SD.end();
  SPI.end();
  delay(50);

  // Pull-up on MISO prevents floating reads during sdSelectCard()
  pinMode(SD_CS_PIN, OUTPUT);
  digitalWrite(SD_CS_PIN, HIGH);
  pinMode(SD_MISO_PIN, INPUT_PULLUP);

  SPI.begin(SD_SCK_PIN, SD_MISO_PIN, SD_MOSI_PIN, SD_CS_PIN);
  delay(50);

  if (!SD.begin(SD_CS_PIN, SPI, SD_SPI_FREQUENCY)) {
    return false;
  }
  if (SD.cardType() == CARD_NONE) {
    SD.end();
    return false;
  }
  File file = SD.open("/data.csv", FILE_APPEND);
  if (!file) {
    SD.end();
    return false;
  }
  if (file.size() == 0) {
    file.println("Millis,AirTemp,AirHum,WaterTemp,Lux,Voltage,Online,Status");
  }
  file.close();
  return true;
}

void publishMQTT() {
  char payload[768];
  String messageId = deviceSerial + "-" + String(bootNonce, HEX) + "-" + String(++messageSequence);
  const unsigned long elapsed = actuatorTestTarget == ActuatorTestTarget::None
    ? ACTUATOR_TEST_DURATION_MS
    : millis() - actuatorTestStartedAt;
  const unsigned long remainingSeconds = elapsed >= ACTUATOR_TEST_DURATION_MS
    ? 0
    : (ACTUATOR_TEST_DURATION_MS - elapsed + 999) / 1000;
  snprintf(payload, sizeof(payload),
    "{\"serialNumber\":\"%s\",\"messageId\":\"%s\",\"airTemp\":%.2f,\"airHum\":%.2f,\"waterTemp\":%.2f,\"lux\":%.1f,\"voltage\":%.2f,\"sdOK\":%s,\"autoCalib\":%s,\"autoCalibCount\":%d,\"calT\":%.2f,\"calH\":%.2f,\"calW\":%.2f,\"calL\":%.2f,\"pumpActive\":%s,\"valveActive\":%s,\"actuatorTestId\":\"%s\",\"actuatorTestState\":\"%s\",\"actuatorTestSecondsRemaining\":%lu,\"status\":\"%s\"}",
    deviceSerial.c_str(), messageId.c_str(), rAirTemp, rAirHum, rWatTemp,
    rLux, sysVoltage, sdCardOK ? "true" : "false", autoCalibEnabled ? "true" : "false",
    autoCalibCount, calAirTemp, calAirHum, calWatTemp, calLux,
    actuatorTestTarget == ActuatorTestTarget::Pump ? "true" : "false",
    actuatorTestTarget == ActuatorTestTarget::Valve ? "true" : "false",
    actuatorTestCommandId.c_str(), actuatorTestState.c_str(), remainingSeconds,
    faultReason.c_str()
  );
  mqtt.publish(topicTelemetry.c_str(), payload);
}

bool validCommandId(const String& value) {
  if (value.length() != 36) return false;
  for (size_t index = 0; index < value.length(); ++index) {
    const char character = value[index];
    const bool separator = index == 8 || index == 13 || index == 18 || index == 23;
    if (separator) {
      if (character != '-') return false;
    } else if (!((character >= '0' && character <= '9') ||
                 (character >= 'a' && character <= 'f') ||
                 (character >= 'A' && character <= 'F'))) {
      return false;
    }
  }
  return true;
}

void startActuatorTest(ActuatorTestTarget target, const String& commandId) {
  if (!validCommandId(commandId) || commandId == actuatorTestCommandId) return;
  if (actuatorTestTarget != ActuatorTestTarget::None) {
    if (isOnline) publishMQTT();
    return;
  }
  actuatorTestCommandId = commandId;
  const bool safeToStart = systemPowerOn && !shortageTripped && !alarmLoopActive &&
    faultReason == "NONE" && sdCardOK && sht4OK && bh1750OK && ds18b20OK;
  if (!safeToStart) {
    actuatorTestState = "REJECTED";
    if (isOnline) publishMQTT();
    return;
  }

  actuatorTestTarget = target;
  actuatorTestStartedAt = millis();
  actuatorTestState = "RUNNING";
  digitalWrite(target == ActuatorTestTarget::Pump ? RELAY_PUMP : RELAY_VALVE, LOW);
  if (isOnline) publishMQTT();
}

void stopActuatorTest(const char* state) {
  digitalWrite(RELAY_PUMP, HIGH);
  digitalWrite(RELAY_VALVE, HIGH);
  actuatorTestTarget = ActuatorTestTarget::None;
  actuatorTestState = state;
}

void updateActuatorTest() {
  if (actuatorTestTarget != ActuatorTestTarget::None &&
      millis() - actuatorTestStartedAt >= ACTUATOR_TEST_DURATION_MS) {
    stopActuatorTest("COMPLETED");
    if (isOnline) publishMQTT();
  }
}

void loadCalibration() {
  prefs.begin("calib", true);
  calAirTemp = prefs.getFloat("t", 0.0);
  calAirHum  = prefs.getFloat("h", 0.0);
  calWatTemp = prefs.getFloat("w", 0.0);
  calLux     = prefs.getFloat("l", 1.0);
  prefs.end();
}

void saveCalibration(float t, float h, float w, float l) {
  prefs.begin("calib", false);
  prefs.putFloat("t", t); prefs.putFloat("h", h);
  prefs.putFloat("w", w); prefs.putFloat("l", l);
  prefs.end();
  calAirTemp = t; calAirHum = h; calWatTemp = w; calLux = l;
}

void forceActuatorsOff() {
  if (actuatorTestTarget != ActuatorTestTarget::None) {
    stopActuatorTest("INTERRUPTED");
  } else {
    digitalWrite(RELAY_PUMP, HIGH);
    digitalWrite(RELAY_VALVE, HIGH);
  }
}
