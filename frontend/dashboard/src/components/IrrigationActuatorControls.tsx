import type {Device, Reading} from "../data/workspace";

type Action = "pump_test" | "valve_test" | "stop";

type Props = {
  device: Device;
  reading?: Reading | Omit<Reading,"id">;
  stale: boolean;
  pending: boolean;
  onAction: (deviceId: number, action: Action) => void;
};

export function IrrigationActuatorControls({device,reading,stale,pending,onAction}: Props) {
  const firmwareReady = typeof reading?.pump_active === "boolean" &&
    typeof reading?.valve_active === "boolean" && Boolean(reading?.actuator_test_state);
  const running = reading?.actuator_test_state === "RUNNING";
  const healthy = firmwareReady && !stale && device.status === "online" &&
    ["NONE","OK","NORMAL"].includes(reading?.sensor_status ?? "NONE") && reading?.sd_ok !== false;
  const relayState = (active: boolean | null | undefined) =>
    active === true ? "On" : active === false ? "Off" : "Waiting for firmware";
  const testStatus = !firmwareReady
    ? "Firmware update required"
    : running
      ? `Test running · up to ${reading?.actuator_test_seconds_remaining ?? 10}s remaining`
      : reading?.actuator_test_state === "COMPLETED"
        ? "Last test completed"
        : reading?.actuator_test_state === "INTERRUPTED"
          ? "Test stopped by a device safety state"
          : reading?.actuator_test_state === "REJECTED"
            ? "Device rejected the test"
            : reading?.actuator_test_state === "STOPPED"
              ? "Outputs stopped"
              : "Ready for a supervised test";

  return <section className="irrigation-actuator-controls" aria-label={`${device.name} pump and valve controls`}>
    <div className="irrigation-actuator-heading">
      <div><h4>Irrigation setup &amp; test controls</h4><p>Supervised 10-second output tests. The firmware turns both relays off on timeout or a safety fault.</p></div>
      <span className={`irrigation-test-status ${running ? "running" : firmwareReady ? "ready" : "unavailable"}`} role="status" aria-live="polite">{testStatus}</span>
    </div>
    <div className="irrigation-relay-states" aria-label="Controller-reported relay states">
      <div><span>Pump relay</span><strong>{relayState(reading?.pump_active)}</strong></div>
      <div><span>Valve relay</span><strong>{relayState(reading?.valve_active)}</strong></div>
    </div>
    {!firmwareReady && <p className="irrigation-firmware-note">Flash the supplied actuator firmware before enabling controls. The current packet does not report relay state.</p>}
    {firmwareReady && stale && <p className="irrigation-firmware-note">The chamber has no fresh packet. Starting a test is disabled; the local 10-second cutoff still applies to an active test.</p>}
    {firmwareReady && device.status === "fault" && <p className="irrigation-firmware-note">The chamber reports a fault. Resolve it before starting a test.</p>}
    <div className="irrigation-actuator-actions">
      <button type="button" className="irrigation-actuator-button primary" disabled={!healthy || running || pending} onClick={() => onAction(device.id,"pump_test")}>
        {pending ? "Sending…" : "Test pump · 10 sec"}
      </button>
      <button type="button" className="irrigation-actuator-button secondary" disabled={!healthy || running || pending} onClick={() => onAction(device.id,"valve_test")}>
        {pending ? "Sending…" : "Test valve · 10 sec"}
      </button>
      <button type="button" className="irrigation-actuator-button stop" disabled={!firmwareReady || pending} onClick={() => onAction(device.id,"stop")}>
        Stop outputs
      </button>
    </div>
    <p className="irrigation-firmware-note">The supplied ESP32 example uses active-low pump GPIO 32 and valve GPIO 33. Relay state is reported by firmware; no flow sensor confirms that water moved.</p>
  </section>;
}
