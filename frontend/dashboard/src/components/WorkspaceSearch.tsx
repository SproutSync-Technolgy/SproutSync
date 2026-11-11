import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Search, X, LoaderCircle, Command, Sprout, Cpu, Bell, FileText, Wrench, Droplets, Users, Star, Plus } from "lucide-react";
import { supabase } from "../supabase";
import type { UserAccount } from "../data/workspace";

export type SearchResult = {
  kind: string; record_id: number; title: string; subtitle: string;
  destination: string; payload: Record<string, unknown>;
};
const labels: Record<string, string> = {page: "Pages", action: "Actions", batch: "Batches", device: "Chambers", alert: "Alerts", evidence: "Checks", maintenance: "Maintenance", schedule: "Irrigation plans", watering: "Watering history", evaluation: "Assessments", activity: "Activity", access: "Evaluator access", account: "Accounts"};
const icons: Record<string, typeof Search> = {page: Command, action: Plus, batch: Sprout, device: Cpu, alert: Bell, evidence: FileText, maintenance: Wrench, schedule: Droplets, watering: Droplets, evaluation: Star, activity: FileText, access: Users, account: Users};
const aliases: Record<string, string> = {home: "dashboard today overview", production: "batches crops seeds harvest assessment ratings stars", readings: "sensors temperature humidity light telemetry live history connection status devices export csv print report download", irrigation: "water schedules rinse plans pump controller", system: "devices chambers serial maintenance evaluators access equipment", evidence: "checks evidence assessments evaluations", accounts: "users operators administrators roles", audit: "activity history events", settings: "profile preferences account notifications email password organization phone personal details", alerts: "notifications issues faults"};

export function WorkspaceSearch({pages, actions, accounts, onSelect, allowRecords}: {
  pages: {key: string; title: string}[]; accounts: UserAccount[];
  actions: {key: string; title: string; keywords: string}[];
  onSelect: (result: SearchResult) => void;
  allowRecords: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [active, setActive] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const term = query.trim().toLowerCase();
  const matches = (value: string) => term.split(/\s+/).every((word) => value.toLowerCase().includes(word));
  const pageResults: SearchResult[] = pages.filter((page) => !term || matches(`${page.title} ${aliases[page.key] ?? ""}`)).map((page) => ({kind: "page", record_id: 0, title: page.title, subtitle: "Open page", destination: page.key, payload: {}}));
  const actionResults: SearchResult[] = term ? actions.filter((action) => matches(`${action.title} ${action.keywords}`)).map((action) => ({kind: "action", record_id: 0, title: action.title, subtitle: "Open form", destination: action.key, payload: {}})) : [];
  const accountResults: SearchResult[] = term.length >= 2 ? accounts.filter((account) => matches(`${account.display_name} ${account.email} ${account.role} ${(account.serial_numbers ?? []).join(" ")}`)).slice(0, 5).map((account) => ({kind: "account", record_id: account.id, title: account.display_name || account.email, subtitle: `${account.email} · ${account.role}`, destination: "accounts", payload: account})) : [];
  const results = [...pageResults, ...actionResults, ...accountResults, ...(allowRecords ? remote : [])];
  const selected = Math.min(active, results.length - 1);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !target?.closest('[role="dialog"]')) {
        event.preventDefault(); input.current?.focus(); setOpen(true);
      }
    };
    const outside = (event: PointerEvent) => {if (!ref.current?.contains(event.target as Node)) setOpen(false);};
    document.addEventListener("keydown", shortcut);
    document.addEventListener("pointerdown", outside);
    return () => {document.removeEventListener("keydown", shortcut); document.removeEventListener("pointerdown", outside);};
  }, []);
  useEffect(() => {
    if (!open || term.length < 2 || !allowRecords) {setLoading(false); return;}
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(async () => {
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const {data, error: failure} = await supabase.rpc("search_workspace", {query_text: term}).abortSignal(controller.signal);
        if (!active) return;
        if (failure) throw failure;
        setRemote((data ?? []) as SearchResult[]); setError("");
      } catch {
        if (active) {setRemote([]); setError("Records could not be searched. Page shortcuts still work.");}
      } finally {clearTimeout(timeout); if (active) setLoading(false);}
    }, 250);
    return () => {active = false; clearTimeout(timer); controller.abort();};
  }, [term, open, retry, allowRecords]);
  function choose(result: SearchResult) {setOpen(false); setQuery(""); setRemote([]); input.current?.blur(); onSelect(result);}
  return <div className="workspace-search" ref={ref} onBlur={(event) => {if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);}}>
    <Search size={18} aria-hidden="true" className="workspace-search-icon" />
    <input ref={input} type="search" role="combobox" aria-label="Search workspace" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`} aria-activedescendant={open && results[selected] ? `${id}-${selected}` : undefined} autoComplete="off" maxLength={100} placeholder="Search your workspace..." value={query}
      onChange={(event) => {setQuery(event.target.value); setRemote([]); setError(""); setActive(-1); setLoading(event.target.value.trim().length >= 2 && allowRecords); setOpen(true);}}
      onFocus={() => {setOpen(true); if (term.length >= 2) setLoading(true);}}
      onKeyDown={(event) => {
        if (event.key === "Escape") {event.preventDefault(); setOpen(false);}
        if (["ArrowDown", "ArrowUp"].includes(event.key)) {event.preventDefault(); setOpen(true); const next = selected < 0 ? event.key === "ArrowDown" ? 0 : results.length - 1 : results.length ? (selected + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0; setActive(next); requestAnimationFrame(() => document.getElementById(`${id}-${next}`)?.scrollIntoView({block: "nearest"}));}
        if (event.key === "Enter") {event.preventDefault(); const result = results[selected] ?? results[0]; if (result) choose(result);}
      }} />
    {query ? <button type="button" className="workspace-search-clear" aria-label="Clear workspace search" onClick={() => {setQuery(""); setRemote([]); setError(""); setLoading(false); setActive(0); input.current?.focus();}}><X size={15} /></button> : <kbd aria-hidden="true">Ctrl K</kbd>}
    {open && <div className="workspace-search-panel">
      <div className="workspace-search-caption">{term ? "Search results" : "Jump to a page"}<small>Names, codes, notes and serial numbers</small></div>
      {loading && term.length >= 2 && <p className="workspace-search-feedback" role="status"><LoaderCircle size={15} className="animate-spin" /> Searching records...</p>}
      {error && <div className="workspace-search-feedback" role="alert"><span>{error}</span><button onClick={() => {setLoading(true); setRetry((value) => value + 1);}}>Retry</button></div>}
      {!loading && !error && term && <p className="sr-only" role="status">{results.length} search results</p>}
      <div id={`${id}-results`} role="listbox" aria-label="Workspace search results" className="workspace-search-results">
        {results.map((result, index) => {const Icon = icons[result.kind] ?? FileText; return <button key={`${result.kind}-${result.record_id}-${result.destination}`} id={`${id}-${index}`} type="button" role="option" aria-selected={selected === index} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => choose(result)}>
          <span className={`search-result-icon ${result.kind}`}><Icon size={17} /></span><span className="search-result-copy"><small>{labels[result.kind] ?? "Records"}</small><strong>{result.title}</strong><span>{result.subtitle}</span></span><ArrowUpRight size={15} aria-hidden="true" />
        </button>;})}
      </div>
      {!results.length && !loading && !error && <p className="workspace-search-empty">No matches. Try a batch code, chamber name, or a different word.</p>}
      {term.length === 1 && <p className="workspace-search-feedback">Type at least 2 characters to search saved records.</p>}
      <div className="workspace-search-footer">Only records available to your account are searched. Up to 5 matches per record type.</div>
    </div>}
  </div>;
}
