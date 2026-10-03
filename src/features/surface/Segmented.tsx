type Props<T extends string> = {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
};

/** Pill-style single choice, as in the research HTML (`aria-pressed` marks the active option). */
export function Segmented<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <div className="sx-control-group">
      <span className="sx-control-label">{label}</span>
      <div className="sx-segmented" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
