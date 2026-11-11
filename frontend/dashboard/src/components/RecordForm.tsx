import { useId, useRef, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { errorMessage } from "../data/workspace";
import { StarRatingField } from "./StarRating";

export type Field = {
  name: string; label: string; type?: string; required?: boolean;
  options?: string[][]; value?: string; placeholder?: string;
  min?: number | string; max?: number | string; help?: string; maxLength?: number; minLength?: number;
};

export function localDateTime(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function RecordForm({ fields, busy, onSubmit, submitLabel = "Save record", onCancel, description }: {
  fields: Field[]; busy: boolean; onSubmit: (values: Record<string, string>) => Promise<void>;
  submitLabel?: string; onCancel?: () => void; description?: string;
}) {
  const id = useId();
  const summary = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const disabled = busy || saving;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || busy) return;
    const form = event.currentTarget;
    const values = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])) as Record<string, string>;
    const invalid: Record<string, string> = {};
    for (const field of fields) {
      const input = form.elements.namedItem(field.name) as HTMLInputElement | null;
      const value = values[field.name] ?? "";
      if (field.required !== false && !value) invalid[field.name] = `${field.options || field.type === "rating" ? "Choose" : "Enter"} ${field.label.toLowerCase()}.`;
      else if (value && field.minLength && value.length < field.minLength) invalid[field.name] = `Use at least ${field.minLength} characters for ${field.label.toLowerCase()}.`;
      else if (input?.validity && !input.validity.valid) invalid[field.name] = field.type === "number" && (input.validity.rangeUnderflow || input.validity.rangeOverflow)
        ? `Enter ${field.label.toLowerCase()} between ${field.min} and ${field.max}.`
        : `${field.label}: ${input.validationMessage}`;
    }
    if (values.target_harvest_at && values.started_at && values.target_harvest_at < values.started_at) invalid.target_harvest_at = "Choose a harvest date after the batch starts.";
    if (values.next_run_at && new Date(values.next_run_at).getTime() <= Date.now()) invalid.next_run_at = "Choose a future date and time.";
    setErrors(invalid); setError("");
    if (Object.keys(invalid).length) { requestAnimationFrame(() => summary.current?.focus()); return; }
    pending.current = true; setSaving(true);
    try { await onSubmit(values); }
    catch (err) { setError(errorMessage(err)); requestAnimationFrame(() => summary.current?.focus()); }
    finally { pending.current = false; setSaving(false); }
  }
  return <form className="record-form" onSubmit={submit} noValidate aria-busy={disabled}>
    <p className="form-description">{description ?? "Check the details below before saving."} Fields marked optional can be left blank.</p>
    {(error || Object.keys(errors).length > 0) && <div ref={summary} tabIndex={-1} className="form-error-summary" role="alert">
      <strong>{error || "Check the highlighted fields"}</strong>
      {Object.entries(errors).map(([name, message]) => <a key={name} href={`#${id}-${name}`} onClick={(event) => {event.preventDefault(); document.getElementById(`${id}-${name}`)?.focus();}}>{message}</a>)}
    </div>}
    <fieldset disabled={disabled} className="form-fields">
      {fields.map((field) => {
        const fieldId = `${id}-${field.name}`;
        if (field.type === "hidden") return <input key={field.name} type="hidden" name={field.name} value={field.value ?? ""} />;
        if (field.type === "rating") return <fieldset id={fieldId} tabIndex={-1} className="field" key={field.name}><legend>{field.label}</legend><StarRatingField name={field.name} initialValue={Number(field.value ?? 0)} required={field.required !== false} />{errors[field.name] && <small className="field-error">{errors[field.name]}</small>}</fieldset>;
        const props = { id: fieldId, name: field.name, required: field.required !== false, defaultValue: field.value ?? "", "aria-invalid": Boolean(errors[field.name]), "aria-describedby": `${fieldId}-help${errors[field.name] ? ` ${fieldId}-error` : ""}` };
        return <div className="field" key={field.name}>
          <label htmlFor={fieldId}>{field.label}{field.required === false && !field.label.includes("optional") && <span className="field-optional"> (optional)</span>}</label>
          {field.options ? <select {...props}><option value="">{field.required === false ? "None selected" : `Choose ${field.label.toLowerCase()}`}</option>{field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            : field.type === "textarea" ? <textarea {...props} rows={3} minLength={field.minLength} maxLength={field.maxLength ?? 2000} placeholder={field.placeholder} />
            : <input {...props} type={field.type ?? "text"} placeholder={field.placeholder} min={field.min} max={field.max} minLength={field.minLength} maxLength={field.maxLength ?? (field.name === "code" ? 64 : 120)} />}
          <small id={`${fieldId}-help`} className="field-help">{field.help ?? ""}</small>
          {errors[field.name] && <small id={`${fieldId}-error`} className="field-error">{errors[field.name]}</small>}
        </div>;
      })}
    </fieldset>
    <div className="form-actions">
      {onCancel && <button className="form-cancel" type="button" disabled={disabled} onClick={onCancel}>Cancel</button>}
      <button className="form-submit" type="submit" disabled={disabled}>{disabled && <LoaderCircle size={17} className="animate-spin" />}{disabled ? "Saving..." : submitLabel}</button>
    </div>
  </form>;
}
