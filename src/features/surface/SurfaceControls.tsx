import type { ExperimentResultSchema, ExperimentView } from "@/api/experiments";
import { metricId } from "@/api/experiments";
import {
  GRID_ID,
  dimById,
  unitText,
  type ControlState,
  type ViewMode,
  type ViewState,
} from "@/features/surface/model";

type Props = {
  schema: ExperimentResultSchema;
  view: ExperimentView;
  state: ViewState;
  options: Record<string, (string | number)[]>;
  outer: { id: string; options: number[] } | null;
  onMetric: (m: string) => void;
  onMode: (m: ViewMode) => void;
  onControl: (id: string, value: string | number) => void;
  onView: (id: string) => void;
};

const MODES: { id: ViewMode; label: string }[] = [
  { id: "treatment", label: "Treatment" },
  { id: "baseline", label: "Baseline" },
  { id: "difference", label: "Δ vs baseline" },
];

export function SurfaceControls({ schema, view, state, options, outer, onMetric, onMode, onControl, onView }: Props) {
  const controls: ControlState = state.controls;
  const grid = typeof controls[GRID_ID] === "string" ? (controls[GRID_ID] as string) : null;
  const sl = typeof controls.sl === "number" ? controls.sl : null;
  const free = new Set([view.x, view.y, ...(view.aggregate_over ?? [])]);
  return (
    <div className="surface-controls">
      {schema.view.length > 1 && (
        <div className="surface-controls__group" role="group" aria-label="View">
          {schema.view.map((v) => (
            <button key={v.id} type="button" className={`chip${v.id === view.id ? " chip--active" : ""}`} onClick={() => onView(v.id)}>
              {v.id}
            </button>
          ))}
        </div>
      )}
      <label>
        Metric{" "}
        <select value={state.metric} onChange={(e) => onMetric(e.target.value)}>
          {schema.metrics.map((m) => (
            <option key={metricId(m)} value={metricId(m)}>{m.label}{m.unit ? ` (${m.unit})` : ""}</option>
          ))}
        </select>
      </label>
      {schema.arms && (
        <div className="surface-controls__group" role="group" aria-label="Arm view">
          {MODES.map((m) => (
            <button key={m.id} type="button" className={`chip${state.mode === m.id ? " chip--active" : ""}`} onClick={() => onMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      )}
      {view.controls.map((id) => {
        if (free.has(id)) return null;
        const opts = id === outer?.id ? outer.options : (options[id] ?? []);
        const dim = dimById(schema, id);
        const label = id === GRID_ID ? "Grid" : `${dim?.label ?? id} · ${dim?.grids ? (grid ?? "") : (dim?.unit ?? "")}`;
        const cur = controls[id];
        return (
          <label key={id}>
            {label}{" "}
            <select value={cur === undefined ? "" : String(cur)} onChange={(e) => {
              const o = opts.find((x) => String(x) === e.target.value);
              if (o !== undefined) onControl(id, o);
            }}>
              {opts.map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
            </select>
            {typeof cur === "number" && dim?.grids && (
              <small className="surface-controls__readout"> {unitText(schema, id, cur, grid, sl)}</small>
            )}
          </label>
        );
      })}
    </div>
  );
}
