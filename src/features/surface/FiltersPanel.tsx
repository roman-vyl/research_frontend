import type { ExperimentResultSchema } from "@/api/experiments";
import { metricId } from "@/api/experiments";
import { armLabel, type Condition } from "@/features/surface/model";

type Props = {
  schema: ExperimentResultSchema;
  filters: Condition[];
  compare: string | null;
  summary: string;
  onChange: (next: Condition[]) => void;
};

let counter = 0;

export function FiltersPanel({ schema, filters, compare, summary, onChange }: Props) {
  const metrics = schema.metrics;
  const cmp = armLabel(compare ?? schema.arms?.baseline ?? "");
  const set = (id: string, patch: Partial<Condition>) =>
    onChange(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  return (
    <div className="sx-panel sx-controls sx-filters" aria-label="Filters">
      <span className="sx-control-label">Filters · all conditions must hold (AND) · cells that fail turn grey · top / bottom % = best / worst share of the cells shown</span>
      <div className="sx-filters">
        {filters.map((f) => (
          <div className="sx-frow" key={f.id}>
            <select aria-label="metric" value={f.metric} onChange={(e) => set(f.id, { metric: e.target.value })}>
              {metrics.map((m) => <option key={metricId(m)} value={metricId(m)}>{m.label}</option>)}
            </select>
            {schema.arms && (
              <select aria-label="kind" value={f.kind} onChange={(e) => set(f.id, { kind: e.target.value as Condition["kind"] })}>
                <option value="value">value</option>
                <option value="delta">Δ vs {cmp}</option>
              </select>
            )}
            <select aria-label="operator" value={f.op} onChange={(e) => set(f.id, { op: e.target.value as Condition["op"] })}>
              <option value=">=">≥</option>
              <option value="<=">≤</option>
              <option value="top">top %</option>
              <option value="bottom">bottom %</option>
            </select>
            <input
              aria-label="threshold"
              type="text"
              inputMode="decimal"
              placeholder={f.op === "top" || f.op === "bottom" ? "percent, e.g. 10" : "value"}
              defaultValue={f.value ?? ""}
              onChange={(e) => {
                const v = parseFloat(e.target.value.replace(",", "."));
                set(f.id, { value: Number.isFinite(v) ? v : null });
              }}
            />
            <button type="button" className="sx-fbtn" aria-label="remove condition" onClick={() => onChange(filters.filter((x) => x.id !== f.id))}>×</button>
          </div>
        ))}
      </div>
      <div className="sx-frow">
        <button
          type="button"
          className="sx-fbtn"
          onClick={() => onChange([...filters, { id: `c${(counter += 1)}`, metric: metricId(metrics[0]), kind: "value", op: ">=", value: null }])}
        >
          + add condition
        </button>
        <button type="button" className="sx-fbtn" onClick={() => onChange([])}>clear all</button>
        <span className="sx-fsum">{summary}</span>
      </div>
    </div>
  );
}
