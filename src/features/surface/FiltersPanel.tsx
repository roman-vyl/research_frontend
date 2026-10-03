import type { ExperimentResultSchema } from "@/api/experiments";
import { metricId } from "@/api/experiments";
import type { Condition } from "@/features/surface/model";

type Props = {
  schema: ExperimentResultSchema;
  filters: Condition[];
  passing: number;
  total: number;
  onChange: (next: Condition[]) => void;
};

let counter = 0;

export function FiltersPanel({ schema, filters, passing, total, onChange }: Props) {
  const metrics = schema.metrics;
  const set = (id: string, patch: Partial<Condition>) =>
    onChange(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  return (
    <div className="surface-filters" aria-label="Filters">
      <div className="surface-filters__title">
        Filters (all conditions must hold) · {filters.length > 0 ? `${passing} / ${total} points pass` : "none active"}
      </div>
      {filters.map((f) => (
        <div className="surface-filters__row" key={f.id}>
          <select aria-label="metric" value={f.metric} onChange={(e) => set(f.id, { metric: e.target.value })}>
            {metrics.map((m) => <option key={metricId(m)} value={metricId(m)}>{m.label}</option>)}
          </select>
          {schema.arms && (
            <select aria-label="kind" value={f.kind} onChange={(e) => set(f.id, { kind: e.target.value as Condition["kind"] })}>
              <option value="value">value</option>
              <option value="delta">Δ vs baseline</option>
            </select>
          )}
          <select aria-label="operator" value={f.op} onChange={(e) => set(f.id, { op: e.target.value as Condition["op"] })}>
            <option value=">=">≥</option>
            <option value="<=">≤</option>
          </select>
          <input
            aria-label="threshold"
            inputMode="decimal"
            defaultValue={f.value}
            onChange={(e) => {
              const v = parseFloat(e.target.value.replace(",", "."));
              if (Number.isFinite(v)) set(f.id, { value: v });
            }}
          />
          <button type="button" aria-label="remove condition" onClick={() => onChange(filters.filter((x) => x.id !== f.id))}>×</button>
        </div>
      ))}
      <div className="surface-filters__row">
        <button
          type="button"
          onClick={() => onChange([...filters, { id: `c${(counter += 1)}`, metric: metricId(metrics[0]), kind: "value", op: ">=", value: 0 }])}
        >
          + add condition
        </button>
        {filters.length > 0 && <button type="button" onClick={() => onChange([])}>clear all</button>}
      </div>
    </div>
  );
}
