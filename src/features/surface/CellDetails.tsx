import type { ExperimentResultSchema } from "@/api/experiments";
import { metricId } from "@/api/experiments";
import {
  GRID_ID,
  baselineOf,
  formatMetric,
  gridsOf,
  makeIndexer,
  unitText,
  type Row,
  type ViewState,
} from "@/features/surface/model";

type Props = {
  schema: ExperimentResultSchema;
  row: Row;
  allRows: Row[];
  state: ViewState;
  provenance: string | null;
  onOpenRun: (runId: string) => void;
};

export function CellDetails({ schema, row, allRows, state, provenance, onOpenRun }: Props) {
  const grid = typeof row[GRID_ID] === "string" ? (row[GRID_ID] as string) : (gridsOf(schema)[0] ?? null);
  const sl = typeof row.sl === "number" ? row.sl : null;
  const runId = typeof row.run_id === "string" && row.run_id !== "" ? row.run_id : null;
  const origin = typeof row.provenance === "string" ? row.provenance : provenance;
  const idx = makeIndexer(schema, allRows, state.compare);
  return (
    <aside className="sx-panel sx-details" aria-label="Point details">
      <h3>Point</h3>
      <dl>
        {schema.dimensions.map((d) => {
          const col = d.grids ? `${d.id}.${grid}` : d.id;
          const v = row[col];
          return typeof v === "number" ? (
            <div key={d.id}><dt>{d.label ?? d.id}</dt><dd>{unitText(schema, d.id, v, grid, sl)}</dd></div>
          ) : null;
        })}
        {schema.arms && <div><dt>Arm</dt><dd>{String(row.arm)}</dd></div>}
        {schema.metrics.map((m) => {
          const v = row[metricId(m)];
          const base = schema.arms && row.arm !== state.compare ? baselineOf(schema, row, idx(metricId(m))) : null;
          return (
            <div key={metricId(m)}>
              <dt>{m.label}</dt>
              <dd>
                {formatMetric(m, typeof v === "number" ? v : null)}
                {base !== null && typeof v === "number" && <small> (comparison {formatMetric(m, base)}, Δ {formatMetric(m, v - base)})</small>}
              </dd>
            </div>
          );
        })}
        <div><dt>Provenance</dt><dd>{origin ?? "—"}</dd></div>
        <div><dt>Run</dt><dd>{runId ?? "—"}</dd></div>
      </dl>
      {runId ? (
        <button type="button" className="sx-fbtn sx-open" onClick={() => onOpenRun(runId)}>Open run</button>
      ) : (
        <p className="sx-note">Engine run not available for this point; its metrics are shown above.</p>
      )}
    </aside>
  );
}
