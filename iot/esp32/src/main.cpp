#include <Arduino.h>

// No GPIO or actuator configuration until wiring is validated.
void setup() {
  Serial.begin(115200);
  Serial.println("SproutSync starter: actuator control is not implemented.");
}

void loop() {
  delay(1000);
}
