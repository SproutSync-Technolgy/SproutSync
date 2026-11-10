import { Activity, AlertTriangle, ArrowRight, Cpu, Key, ShieldCheck, Users } from "lucide-react";
import type { UserAccount, WorkspaceData } from "../data/workspace";
import { Btn } from "./ProtoPrimitives";

export function AdminOverview({ name, data, accounts, accountsError, onAccounts, onGrant, onNavigate }: {
  name: string; data: WorkspaceData; accounts: UserAccount[]; accountsError: string;
  onAccounts: (role?: string) => void; onGrant: () => void; onNavigate: (page: string) => void;
}) {
  const pending = accounts.filter((account) => account.role === "pending").length;
  const alerts = data.alerts.filter((alert) => alert.status !== "resolved");
  const realDevices = data.devices.filter((device) => !device.is_demo);
  const offline = realDevices.filter((device) => device.status !== "online").length;
  const stats = [
    { label: "Registered accounts", value: accountsError ? "Unavailable" : String(accounts.length), detail: "People and access", icon: Users, action: () => onAccounts() },
    { label: "Pending access", value: accountsError ? "Unavailable" : String(pending), detail: "Review account roles", icon: ShieldCheck, action: () => onAccounts("pending") },
    { label: "Registered chambers", value: String(realDevices.length), detail: `${data.devices.filter((device) => device.is_demo).length} sample chambers shown separately`, icon: Cpu, action: () => onNavigate("readings") },
    { label: "Unresolved alerts", value: String(alerts.length), detail: "Review and follow up", icon: AlertTriangle, action: () => onNavigate("alerts") },
  ];
  return <div className="admin-overview space-y-6">
    <section className="admin-hero">
      <div><p className="role-kicker">Administration</p><h2>Welcome back, {name || "there"}.</h2>
        <p>People, chamber access, and fleet health in one place.</p></div>
      <div className="admin-hero-actions"><Btn onClick={() => onAccounts()}><Users size={17} /> Manage accounts</Btn>
        <Btn variant="outline" onClick={onGrant}><Key size={17} /> Grant serial ID</Btn></div>
    </section>
    {accountsError && <div className="feedback-error" role="alert">{accountsError} Open Accounts and use Refresh to retry.</div>}
    <div className="admin-stat-grid">{stats.map((stat) => <button type="button" className="admin-stat" key={stat.label} onClick={stat.action}>
      <span className="admin-stat-icon"><stat.icon size={21} /></span><span className="admin-stat-label">{stat.label}</span>
      <strong>{stat.value}</strong><small>{stat.detail}</small><ArrowRight size={16} className="admin-stat-arrow" aria-hidden="true" />
    </button>)}</div>
    <div className="admin-panels">
      <section className="surface"><div className="admin-panel-heading"><h3>Needs attention</h3><AlertTriangle size={18} /></div>
        <button type="button" className="admin-action-row" onClick={() => onAccounts("pending")}><span><strong>Account access requests</strong><small>{accountsError ? "Account status could not be verified" : `${pending} accounts awaiting role assignment`}</small></span><ArrowRight size={17} /></button>
        <button type="button" className="admin-action-row" onClick={() => onNavigate("readings")}><span><strong>Chamber availability</strong><small>{offline} chambers offline, pending, or reporting a fault</small></span><ArrowRight size={17} /></button>
        <button type="button" className="admin-action-row" onClick={() => onNavigate("alerts")}><span><strong>Open alerts</strong><small>{alerts.length} records to review</small></span><ArrowRight size={17} /></button>
      </section>
      <section className="surface"><div className="admin-panel-heading"><h3>Roles and permissions</h3><ShieldCheck size={18} /></div>
        <p className="text-sm text-muted-foreground mb-4">Assign a role to each verified account. Evaluators receive access through an operator.</p>
        <div className="admin-role-links">{["operator", "evaluator", "superadmin"].map((role) => <button type="button" key={role} onClick={() => onAccounts(role)}><span>{role === "superadmin" ? "Superadmins" : `${role[0].toUpperCase()}${role.slice(1)}s`}</span><strong>{accountsError ? "—" : accounts.filter((account) => account.role === role || role === "superadmin" && account.role === "admin").length}</strong></button>)}</div>
      </section>
    </div>
    <section className="surface"><div className="admin-panel-heading"><h3>Recent activity</h3><Btn variant="ghost" onClick={() => onNavigate("audit")}><Activity size={16} /> View audit log</Btn></div>
      {data.activity.length ? <ul className="admin-activity">{data.activity.slice(0, 5).map((event) => <li key={event.id}><span><strong>{event.action.replaceAll("_", " ")}</strong><small>{event.resource}</small></span><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></li>)}</ul>
        : <p className="text-sm text-muted-foreground">No administrative activity recorded yet. Completed actions will appear here.</p>}
    </section>
  </div>;
}
