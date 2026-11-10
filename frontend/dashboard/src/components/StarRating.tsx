import { useState } from "react";
import { Star } from "lucide-react";

const labels = ["Poor", "Fair", "Good", "Very good", "Excellent"];

export function BatchRatingPicker({ batch, value = 0, onSelect }: {
  batch: string; value?: number; onSelect: (value: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  return <span className="batch-rating-picker" role="group" aria-label={`Rate ${batch}`} onMouseLeave={() => setHovered(0)}>
    {labels.map((label, index) => <button key={label} type="button"
      aria-label={`Rate ${batch} ${index + 1} out of 5`}
      title={`${index + 1} — ${label}`}
      onMouseEnter={() => setHovered(index + 1)}
      onFocus={() => setHovered(index + 1)} onBlur={() => setHovered(0)}
      onClick={() => onSelect(index + 1)}>
      <Star size={19} fill={index < (hovered || value) ? "currentColor" : "none"} aria-hidden="true" />
    </button>)}
  </span>;
}

export function StarRatingField({ name, initialValue = 0, required = true }: {
  name: string; initialValue?: number; required?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  return <>
    <div className="star-rating-field">
      {labels.map((label, index) => <label key={label} title={`${index + 1} — ${label}`}>
        <input type="radio" name={name} value={index + 1} aria-label={String(index + 1)}
          required={required} checked={value === index + 1} onChange={() => setValue(index + 1)} />
        <Star size={26} fill={index < value ? "currentColor" : "none"} aria-hidden="true" />
      </label>)}
    </div>
    <small className="text-muted-foreground" aria-live="polite">{value ? `${value} out of 5 · ${labels[value - 1]}` : "Choose a rating from 1 to 5 stars"}</small>
  </>;
}
