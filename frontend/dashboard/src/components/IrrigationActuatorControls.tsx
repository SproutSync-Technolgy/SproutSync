import {Droplets, Power, Waves} from "lucide-react";
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
  const statesReported = typeof reading?.pump_active === "boolean" && typeof reading?.valve_active === "boolean";
  const canStart = !stale && device.status === "online" &&
    ["NONE","OK","NORMAL"].includes(reading?.sensor_status ?? "NONE") && reading?.sd_ok !== false;
  const relayState = (active: boolean | null | undefined) => active === true ? "On" : active === false ? "Off" : "Not reported";
  const commandStatus = reading?.actuator_command_state;
  const statusText = stale ? "Last packet is old" : device.status !== "online" ? "Device offline" :
    commandStatus === "REJECTED" ? "Command rejected" : commandStatus === "SAFE_OFF" ? "Safety shutoff" : "Ready";
  const statusTone = stale || device.status !== "online" ? "unavailable" : commandStatus === "REJECTED" || commandStatus === "SAFE_OFF" ? "warning" : "ready";

  return <section className="irrigation-actuator-controls" aria-label={`${device.name} pump and valve controls`}>
    <div className="irrigation-actuator-heading">
      <div><h4>Manual relay control</h4><p>Switch the pump and valve independently.</p></div>
      <span className={`irrigation-output-status ${statusTone}`} role="status" aria-live="polite"><span aria-hidden="true" />{statusText}</span>
    </div>
    <div className="irrigation-relay-states" aria-label="Pump and valve status">
      <div><span><Power size={14} aria-hidden="true" /> Pump</span><strong title={statesReported ? "Reported by the controller" : "This device sketch does not report relay state"}>{relayState(reading?.pump_active)}</strong></div>
      <div><span><Droplets size={14} aria-hidden="true" /> Valve</span><strong title={statesReported ? "Reported by the controller" : "This device sketch does not report relay state"}>{relayState(reading?.valve_active)}</strong></div>
    </div>
    <div className="irrigation-actuator-actions">
      <div className="irrigation-actuator-row">
        <strong>Pump</strong>
        <button type="button" className="irrigation-actuator-button primary" disabled={!canStart || pending || reading?.pump_active === true} title="Turn pump on" aria-label="Turn pump on" onClick={() => onAction(device.id,"pump_on")}><Power size={17} aria-hidden="true" /><span>On</span></button>
        <button type="button" className="irrigation-actuator-button secondary" disabled={pending || reading?.pump_active === false} title="Turn pump off" aria-label="Turn pump off" onClick={() => onAction(device.id,"pump_off")}><Power size={17} aria-hidden="true" /><span>Off</span></button>
      </div>
      <div className="irrigation-actuator-row">
        <strong>Valve</strong>
        <button type="button" className="irrigation-actuator-button primary" disabled={!canStart || pending || reading?.valve_active === true} title="Open valve" aria-label="Open valve" onClick={() => onAction(device.id,"valve_on")}><Droplets size={17} aria-hidden="true" /><span>On</span></button>
        <button type="button" className="irrigation-actuator-button secondary" disabled={pending || reading?.valve_active === false} title="Close valve" aria-label="Close valve" onClick={() => onAction(device.id,"valve_off")}><Droplets size={17} aria-hidden="true" /><span>Off</span></button>
      </div>
      <button type="button" className="irrigation-actuator-button stop irrigation-stop-all" disabled={pending} title="Turn pump and valve off" aria-label="Turn pump and valve off" onClick={() => onAction(device.id,"all_off")}><Power size={16} aria-hidden="true" /><span>Stop both</span></button>
    </div>
    <p className="irrigation-firmware-note"><Waves size={14} aria-hidden="true" /><span title="The controller publishes sensor readings, but not pump or valve feedback. No flow sensor is installed.">Relay commands only · No flow sensor or relay feedback</span></p>
  </section>;
}
