import React, { useRef } from "react";
import { Calendar, X } from "lucide-react";

interface CalendarDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function CalendarDatePicker({
  value,
  onChange,
  placeholder = "Filter date",
}: CalendarDatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (inputRef.current) {
      if (typeof inputRef.current.showPicker === "function") {
        inputRef.current.showPicker();
      } else {
        inputRef.current.focus();
      }
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  // Format date nicely if selected
  const formattedDisplay = value
    ? new Date(value + (value.length === 7 ? "-01" : "T00:00:00")).toLocaleDateString(
        [],
        value.length === 7
          ? { year: "numeric", month: "short" }
          : { month: "short", day: "numeric", year: "numeric" },
      )
    : placeholder;

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center gap-2 rounded-xl border border-border/80 px-3 py-2 text-xs font-medium transition-all hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
          value ? "bg-primary/10 text-primary border-primary/30" : "bg-card text-muted-foreground"
        }`}
        aria-label={`Filter by start date: ${value ? formattedDisplay : "None selected"}`}
        title="Pick date to filter batches"
      >
        <Calendar size={15} className={value ? "text-primary" : "text-muted-foreground"} aria-hidden="true" />
        <span>{formattedDisplay}</span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={handleClear}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onChange("");
              }
            }}
            className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 text-primary focus:outline-none"
            aria-label="Clear date filter"
            title="Clear date filter"
          >
            <X size={13} aria-hidden="true" />
          </span>
        )}
      </button>

      {/* Hidden native date input that triggers native OS / browser calendar picker */}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
