/**
 * Coordinates of a Surface row as the candidate API names them: every dimension id of the manifest schema,
 * plus `grid` when a dimension has grids and `arm` when the schema has arms. An empty row cell is `null`.
 */
import type { ExperimentResultSchema, ExperimentView } from "@/api/experiments";
import type { CandidateCoords, CandidateCoordsRequest } from "@/api/candidates";
import { GRID_ID, dimById, gridsOf, type ControlState, type Row } from "@/features/surface/model";

const EPS = 1e-9;

export function rowCoords(schema: ExperimentResultSchema, row: Row): CandidateCoordsRequest {
  const grid = typeof row[GRID_ID] === "string" && row[GRID_ID] !== "" ? (row[GRID_ID] as string) : null;
  const out: CandidateCoordsRequest = {};
  for (const dim of schema.dimensions) {
    // a multi-grid dimension takes the value of the row's own grid; rows without a grid have none
    const v = dim.grids ? (grid === null ? null : row[`${dim.id}.${grid}`]) : row[dim.id];
    out[dim.id] = typeof v === "number" || (typeof v === "string" && v !== "") ? v : null;
  }
  if (gridsOf(schema).length > 0) out[GRID_ID] = grid;
  if (schema.arms) out.arm = typeof row.arm === "string" && row.arm !== "" ? row.arm : null;
  return out;
}

/** A stored coordinate as a number, or null when it is empty or not numeric. */
export function coordNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Numbers compare within 1e-9, text exactly, an empty value only matches an empty / absent one. */
export function coordsMatch(stored: CandidateCoords, row: CandidateCoordsRequest): boolean {
  return Object.entries(row).every(([id, want]) => {
    const have = stored[id] ?? null;
    if (want === null) return have === null;
    if (have === null) return false;
    if (typeof want === "number") {
      const n = coordNumber(have);
      return n !== null && Math.abs(n - want) <= EPS;
    }
    return have === want;
  });
}

/**
 * The view controls (grid, arm-independent dimensions) a candidate's coordinates ask for, over the current ones.
 * The outer slice dimension is left to the caller; an empty value leaves the control as is, except for an
 * optional dimension, which switches off.
 */
export function focusControls(
  schema: ExperimentResultSchema,
  view: ExperimentView,
  outerId: string,
  coords: CandidateCoords,
  controls: ControlState,
): ControlState {
  const next: ControlState = { ...controls };
  for (const id of view.controls) {
    if (id === outerId) continue;
    if (id === GRID_ID) {
      const g = coords[GRID_ID];
      if (typeof g === "string" && g !== "") next[id] = g;
      continue;
    }
    const n = coordNumber(coords[id]);
    if (n !== null) next[id] = n;
    else if (dimById(schema, id)?.optional) delete next[id];
  }
  return next;
}
