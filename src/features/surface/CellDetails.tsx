import { useState } from "react";

import { ApiError } from "@/api/client";
import type { ExperimentResultSchema } from "@/api/experiments";
import { metricId } from "@/api/experiments";
import { coordsMatch, rowCoords } from "@/features/candidates/coords";
import { starPoint, unstarPoint, useCandidates } from "@/features/candidates/store";
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
  experimentId: string;
  row: Row;
  allRows: Row[];
  state: ViewState;
  provenance: string | null;
  /** The point is greyed out by the active filters (it is still shown here). */
  hiddenByFilters?: boolean;
  onOpenRun: (runId: string) => void;
};

const errorText = (e: unknown): string =>
  e instanceof ApiError ? e.detail : e instanceof Error ? e.message : "Request failed.";

export function CellDetails({ schema, experimentId, row, allRows, state, provenance, hiddenByFilters, onOpenRun }: Props) {
  const { candidates } = useCandidates();
  const [busy, setBusy] = useState(false);
  const [starError, setStarError] = useState<string | null>(null);
  const grid = typeof row[GRID_ID] === "string" ? (row[GRID_ID] as string) : (gridsOf(schema)[0] ?? null);
  const sl = typeof row.sl === "number" ? row.sl : null;
  const runId = typeof row.run_id === "string" && row.run_id !== "" ? row.run_id : null;
  const origin = typeof row.provenance === "string" ? row.provenance : provenance;
  const idx = makeIndexer(schema, allRows, state.compare);
  const coords = rowCoords(schema, row);
  const starred = candidates.find((c) => c.experiment_id === experimentId && coordsMatch(c.coords, coords)) ?? null;
  // Star sends the coordinates only; unstar uses the id the service returned for the record.
  const toggleStar = async () => {
    setBusy(true);
    setStarError(null);
    try {
      if (starred) await unstarPoint(starred.candidate_id);
      else await starPoint(experimentId, coords);
    } catch (e) {
      setStarError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="sx-panel sx-details" aria-label="Point details">
      <h3>
        Point{" "}
        <button
          type="button"
          className={`sx-fbtn sx-starbtn${starred ? " sx-starred" : ""}`}
          aria-pressed={starred !== null}
          aria-label={starred ? "Unstar point" : "Star point"}
          disabled={busy}
          onClick={toggleStar}
        >
          {starred ? "★ Starred" : "☆ Star"}
        </button>
      </h3>
      {starError && <p role="alert" className="sx-error">{starError}</p>}
      {hiddenByFilters && <p className="sx-note">This point is hidden by the active filters.</p>}
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
        <p className="sx-note">No full run: Engine run not available for this point; its metrics are shown above.</p>
      )}
    </aside>
  );
}
