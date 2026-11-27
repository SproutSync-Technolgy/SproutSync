import type {Device, Reading} from "../data/workspace";

type Action = "pump_on" | "pump_off" | "valve_on" | "valve_off" | "all_off";

type Props = {
  device: Device;
  reading?: Reading | Omit<Reading,"id">;
  stale: boolean;
  pending: boolean;
  onAction: (deviceId: number, action: Action) => void;
};

export function IrrigationActuatorControls({device,reading,stale,pending,onAction}: Props) {
  const firmwareReady = typeof reading?.pump_active === "boolean" &&
    typeof reading?.valve_active === "boolean";
  const canStart = firmwareReady && !stale && device.status === "online" &&
    ["NONE","OK","NORMAL"].includes(reading?.sensor_status ?? "NONE") && reading?.sd_ok !== false;
  const relayState = (active: boolean | null | undefined) =>
    active === true ? "On" : active === false ? "Off" : "Waiting for firmware";
  const commandStatus = reading?.actuator_command_state;
  const statusText = !firmwareReady
    ? "Firmware update required"
    : stale
      ? "Device connection is stale"
      : commandStatus === "REJECTED"
        ? "Controller rejected the last start"
        : commandStatus === "SAFE_OFF"
          ? "Controller safety shutdown"
          : "Relay state reported by controller";

  return <section className="irrigation-actuator-controls" aria-label={`${device.name} pump and valve controls`}>
    <div className="irrigation-actuator-heading">
      <div><h4>Irrigation pump and valve</h4><p>Outputs stay on until switched off or the controller shuts them down for a fault.</p></div>
      <span className={`irrigation-output-status ${!firmwareReady || stale ? "unavailable" : commandStatus === "REJECTED" || commandStatus === "SAFE_OFF" ? "warning" : "ready"}`} role="status" aria-live="polite">{statusText}</span>
    </div>
    <div className="irrigation-relay-states" aria-label="Controller-reported relay states">
      <div><span>Pump relay</span><strong>{relayState(reading?.pump_active)}</strong></div>
      <div><span>Valve relay</span><strong>{relayState(reading?.valve_active)}</strong></div>
    </div>
    {!firmwareReady && <p className="irrigation-firmware-note">Flash the updated ESP32 firmware to enable pump and valve controls.</p>}
    {firmwareReady && stale && <p className="irrigation-firmware-note">The device has no fresh packet. Starting outputs is disabled. Off commands can still be sent, but the device must receive them.</p>}
    {firmwareReady && device.status === "fault" && <p className="irrigation-firmware-note">The controller reports a fault. Starting outputs is disabled until it recovers.</p>}
    <div className="irrigation-actuator-actions">
      <div className="irrigation-actuator-row">
        <strong>Pump</strong>
        <button type="button" className="irrigation-actuator-button primary" disabled={!canStart || reading?.pump_active === true || pending} onClick={() => onAction(device.id,"pump_on")}>Turn on</button>
        <button type="button" className="irrigation-actuator-button secondary" disabled={!firmwareReady || reading?.pump_active === false || pending} onClick={() => onAction(device.id,"pump_off")}>Turn off</button>
      </div>
      <div className="irrigation-actuator-row">
        <strong>Valve</strong>
        <button type="button" className="irrigation-actuator-button primary" disabled={!canStart || reading?.valve_active === true || pending} onClick={() => onAction(device.id,"valve_on")}>Turn on</button>
        <button type="button" className="irrigation-actuator-button secondary" disabled={!firmwareReady || reading?.valve_active === false || pending} onClick={() => onAction(device.id,"valve_off")}>Turn off</button>
      </div>
      <button type="button" className="irrigation-actuator-button stop" disabled={!firmwareReady || pending || (!stale && reading?.pump_active === false && reading?.valve_active === false)} onClick={() => onAction(device.id,"all_off")}>Turn both off</button>
    </div>
    <p className="irrigation-firmware-note">Turn-on requires a healthy, online controller. No flow sensor is installed, so these indicators confirm relay state only and cannot verify water movement. Keep the pump primed and water path clear.</p>
  </section>;
}
