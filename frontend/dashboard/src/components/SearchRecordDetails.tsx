import type { SearchResult } from "./WorkspaceSearch";

const fields: Record<string, string> = {title: "Title", evaluator_email: "Evaluator email", notes: "Notes", comments: "Observations", result: "Result", category: "Category", rating: "Rating out of 5", duration_seconds: "Duration (seconds)", volume_ml: "Water delivered (ml)", next_run_at: "Planned time", occurred_at: "Event time", performed_at: "Performed", recorded_at: "Recorded", created_at: "Created", action: "Action", resource: "Record", enabled: "Plan enabled"};

export function SearchRecordDetails({result, chamber, batch}: {result: SearchResult; chamber?: string; batch?: string}) {
  return <div className="search-record-details">
    {result.payload.is_demo === true && <p className="reading-notice">Sample record. This does not represent executed hardware activity.</p>}
    <p className="form-description">Saved record found in your workspace.</p>
    <dl>{chamber && <div><dt>Chamber</dt><dd>{chamber}</dd></div>}{batch && <div><dt>Batch</dt><dd>{batch}</dd></div>}
      {Object.entries(fields).filter(([key]) => result.payload[key] != null && result.payload[key] !== "").map(([key, label]) => {
        const value = result.payload[key];
        const display = typeof value === "boolean" ? value ? "Yes" : "No" : key.endsWith("_at") && !Number.isNaN(Date.parse(String(value))) ? new Date(String(value)).toLocaleString() : String(value);
        return <div key={key}><dt>{label}</dt><dd>{display}</dd></div>;
      })}</dl>
    <p className="record-provenance">{result.kind.replaceAll("_", " ")} · Record #{result.record_id}</p>
  </div>;
}
