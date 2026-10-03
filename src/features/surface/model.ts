/**
 * Presentation-level operations over ready-made Experiment results (no trading metrics are
 * computed here): slicing, heatmap matrices, aggregates (median / counts / share passing),
 * difference to the baseline arm, AND-filters and ATR<->R readouts.
 */
import {
  metricId,
  type ExperimentDimension,
  type ExperimentMetric,
  type ExperimentResultSchema,
  type ExperimentResults,
  type ExperimentView,
} from "@/api/experiments";

export type Cell = number | string | null;
export type Row = Record<string, Cell>;
export const GRID_ID = "grid";
const EPS = 1e-9;

export function toRows(results: ExperimentResults): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < results.rows; i += 1) {
    const row: Row = {};
    results.columns.forEach((c, k) => {
      row[c] = results.data[k][i];
    });
    out.push(row);
  }
  return out;
}

export function dimById(schema: ExperimentResultSchema, id: string): ExperimentDimension | undefined {
  return schema.dimensions.find((d) => d.id === id);
}

export function metricById(schema: ExperimentResultSchema, id: string): ExperimentMetric | undefined {
  return schema.metrics.find((m) => metricId(m) === id);
}

/** Grid ids of the first multi-grid dimension (empty when the experiment has none). */
export function gridsOf(schema: ExperimentResultSchema): string[] {
  const dim = schema.dimensions.find((d) => d.grids);
  return dim?.grids ? Object.keys(dim.grids) : [];
}

/** Semantic result column that holds a dimension's value (per grid for multi-grid dimensions). */
export function dimColumn(dim: ExperimentDimension, grid: string | null): string {
  return dim.grids ? `${dim.id}.${grid ?? Object.keys(dim.grids)[0]}` : dim.id;
}

export function dimValue(schema: ExperimentResultSchema, row: Row, dimId: string, grid: string | null): number | null {
  const dim = dimById(schema, dimId);
  if (!dim) return null;
  const v = row[dimColumn(dim, grid)];
  return typeof v === "number" ? v : null;
}

const close = (a: number, b: number): boolean => Math.abs(a - b) <= EPS;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor((s.length - 1) / 2);
  return s.length % 2 === 1 ? s[m] : (s[m] + s[m + 1]) / 2;
}

export type ControlState = Record<string, string | number>;

export type ViewMode = "treatment" | "baseline" | "difference";

export type Condition = {
  id: string;
  metric: string;
  kind: "value" | "delta";
  op: ">=" | "<=";
  value: number;
};

export type ViewState = {
  viewId: string;
  metric: string;
  mode: ViewMode;
  controls: ControlState;
  filters: Condition[];
};

export function treatmentArms(schema: ExperimentResultSchema): string[] | null {
  const arms = schema.arms;
  if (!arms) return null;
  return Object.entries(arms.roles).filter(([, r]) => r === "treatment").map(([a]) => a);
}

function activeGrid(schema: ExperimentResultSchema, controls: ControlState): string | null {
  const g = controls[GRID_ID];
  return typeof g === "string" ? g : (gridsOf(schema)[0] ?? null);
}

/** Distinct sorted options of every control of a view, given the rows of the current SL slice. */
export function controlOptions(
  schema: ExperimentResultSchema,
  view: ExperimentView,
  rows: Row[],
  controls: ControlState,
): Record<string, (string | number)[]> {
  const out: Record<string, (string | number)[]> = {};
  const grid = activeGrid(schema, controls);
  const treat = treatmentArms(schema);
  const base = treat ? rows.filter((r) => treat.includes(String(r.arm))) : rows;
  for (const id of view.controls) {
    if (id === GRID_ID) {
      const present = new Set(base.map((r) => r[GRID_ID]));
      out[id] = gridsOf(schema).filter((g) => present.has(g));
      continue;
    }
    const dim = dimById(schema, id);
    if (!dim) continue;
    const pool = dim.grids ? base.filter((r) => r[GRID_ID] === grid) : base;
    const vals = new Set<number>();
    for (const r of pool) {
      const v = r[dimColumn(dim, grid)];
      if (typeof v === "number") vals.add(v);
    }
    out[id] = [...vals].sort((a, b) => a - b);
  }
  return out;
}

/** Keep valid control values; fall back to the first option when a value disappeared. */
export function reconcileControls(
  schema: ExperimentResultSchema,
  view: ExperimentView,
  rows: Row[],
  controls: ControlState,
): ControlState {
  const next: ControlState = {};
  // grid first: it decides the options of the dimensions that depend on it
  const order = [...view.controls].sort((a, b) => (a === GRID_ID ? -1 : b === GRID_ID ? 1 : 0));
  for (const id of order) {
    const opts = controlOptions(schema, view, rows, { ...controls, ...next })[id] ?? [];
    const cur = controls[id];
    const keep = opts.some((o) => (typeof o === "number" && typeof cur === "number" ? close(o, cur) : o === cur));
    if (keep && cur !== undefined) next[id] = cur;
    else if (opts.length > 0) next[id] = opts[0];
  }
  return next;
}

export function defaultState(
  schema: ExperimentResultSchema,
  viewId: string,
  rows: Row[],
): ViewState {
  const view = schema.view.find((v) => v.id === viewId) ?? schema.view[0];
  return {
    viewId: view.id,
    metric: view.default_metric,
    mode: "treatment",
    controls: reconcileControls(schema, view, rows, {}),
    filters: [],
  };
}

/** Rows of one arm (or all rows without arms) matching the fixed controls. */
export function sliceRows(
  schema: ExperimentResultSchema,
  view: ExperimentView,
  rows: Row[],
  controls: ControlState,
  arms: string[] | null,
): Row[] {
  const grid = activeGrid(schema, controls);
  const free = new Set([view.x, view.y, ...(view.aggregate_over ?? [])]);
  return rows.filter((r) => {
    if (arms && !arms.includes(String(r.arm))) return false;
    for (const id of view.controls) {
      if (free.has(id)) continue;
      const want = controls[id];
      if (want === undefined) continue;
      if (id === GRID_ID) {
        if (r[GRID_ID] !== want) return false;
        continue;
      }
      const dim = dimById(schema, id);
      if (!dim) continue;
      const v = r[dimColumn(dim, grid)];
      if (typeof v !== "number" || typeof want !== "number" || !close(v, want)) return false;
    }
    return true;
  });
}

/** Baseline arm lookup for a metric, keyed by the manifest's `match_on` dimensions. */
export function baselineIndex(schema: ExperimentResultSchema, rows: Row[], metric: string): Map<string, number> {
  const out = new Map<string, number>();
  const arms = schema.arms;
  if (!arms) return out;
  for (const r of rows) {
    if (r.arm !== arms.baseline) continue;
    const v = r[metric];
    if (typeof v === "number") out.set(matchKey(schema, r), v);
  }
  return out;
}

function matchKey(schema: ExperimentResultSchema, row: Row): string {
  const dims = schema.arms?.match_on ?? [];
  return dims.map((d) => String(dimValue(schema, row, d, null))).join("|");
}

export function baselineOf(schema: ExperimentResultSchema, row: Row, index: Map<string, number>): number | null {
  return index.get(matchKey(schema, row)) ?? null;
}

/** The displayed value of a row: metric, baseline metric, or their difference. */
export function displayValue(
  schema: ExperimentResultSchema,
  row: Row,
  metric: string,
  mode: ViewMode,
  index: Map<string, number>,
): number | null {
  const v = row[metric];
  const value = typeof v === "number" ? v : null;
  if (mode === "treatment" || !schema.arms) return value;
  const base = baselineOf(schema, row, index);
  if (mode === "baseline") return base;
  return value !== null && base !== null ? value - base : null;
}

export function passes(
  schema: ExperimentResultSchema,
  row: Row,
  filters: Condition[],
  indexByMetric: (metric: string) => Map<string, number>,
): boolean {
  for (const c of filters) {
    const v = row[c.metric];
    if (typeof v !== "number") return false;
    let x = v;
    if (c.kind === "delta") {
      const base = baselineOf(schema, row, indexByMetric(c.metric));
      if (base === null) return false;
      x = v - base;
    }
    if (c.op === ">=" ? !(x >= c.value) : !(x <= c.value)) return false;
  }
  return true;
}

export type Matrix = {
  xs: number[];
  ys: number[];
  /** `cells[yi][xi]` is the matching row, or null when the combination is absent. */
  cells: (Row | null)[][];
};

export function buildMatrix(schema: ExperimentResultSchema, view: ExperimentView, rows: Row[], controls: ControlState): Matrix {
  const grid = activeGrid(schema, controls);
  const xd = dimById(schema, view.x);
  const yd = dimById(schema, view.y);
  const xs = new Set<number>();
  const ys = new Set<number>();
  const keyed = new Map<string, Row>();
  if (xd && yd) {
    for (const r of rows) {
      const x = r[dimColumn(xd, grid)];
      const y = r[dimColumn(yd, grid)];
      if (typeof x !== "number" || typeof y !== "number") continue;
      xs.add(x);
      ys.add(y);
      keyed.set(`${x}|${y}`, r);
    }
  }
  const xa = [...xs].sort((a, b) => a - b);
  const ya = [...ys].sort((a, b) => a - b);
  return { xs: xa, ys: ya, cells: ya.map((y) => xa.map((x) => keyed.get(`${x}|${y}`) ?? null)) };
}

export type AggregateCell = { x: number; y: number; value: number | null; count: number; passing: number };

/** Median of the displayed value per (x, y) over `aggregate_over`, plus the share passing filters. */
export function aggregateMap(
  schema: ExperimentResultSchema,
  view: ExperimentView,
  allRows: Row[],
  state: ViewState,
): AggregateCell[] {
  const grid = activeGrid(schema, state.controls);
  const arms = treatmentArms(schema);
  const rows = sliceRows(schema, view, allRows, state.controls, arms);
  const xd = dimById(schema, view.x);
  const yd = dimById(schema, view.y);
  if (!xd || !yd) return [];
  const cache = new Map<string, Map<string, number>>();
  const idx = (m: string): Map<string, number> => {
    let v = cache.get(m);
    if (!v) cache.set(m, (v = baselineIndex(schema, allRows, m)));
    return v;
  };
  const groups = new Map<string, { x: number; y: number; vals: number[]; count: number; passing: number }>();
  for (const r of rows) {
    const x = r[dimColumn(xd, grid)];
    const y = r[dimColumn(yd, grid)];
    if (typeof x !== "number" || typeof y !== "number") continue;
    const key = `${x}|${y}`;
    const g = groups.get(key) ?? { x, y, vals: [], count: 0, passing: 0 };
    const v = displayValue(schema, r, state.metric, state.mode, idx(state.metric));
    if (v !== null) g.vals.push(v);
    g.count += 1;
    if (passes(schema, r, state.filters, idx)) g.passing += 1;
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ x: g.x, y: g.y, value: median(g.vals), count: g.count, passing: g.passing }));
}

export function formatMetric(metric: ExperimentMetric, value: number | null): string {
  if (value === null) return "—";
  if (metric.format === "fraction") return `${(value * 100).toFixed(1)}%`;
  if (metric.format === "integer") return String(Math.round(value));
  return Math.abs(value) >= 1000 ? Math.round(value).toLocaleString("en-US") : value.toFixed(2);
}

/** Unit readout; for multi-grid dimensions also the conversion at the selected SL (`ATR = R × SL`). */
export function unitText(
  schema: ExperimentResultSchema,
  dimId: string,
  value: number,
  grid: string | null,
  sl: number | null,
): string {
  const dim = dimById(schema, dimId);
  if (!dim) return String(value);
  if (!dim.grids) return `${value}${dim.unit ? ` ${dim.unit}` : ""}`;
  const unit = dim.grids[grid ?? Object.keys(dim.grids)[0]]?.unit ?? "";
  const text = `${value}${unit}`;
  if (sl === null || sl <= 0) return text;
  if (unit === "R") return `${text} = ${round(value * sl)} ATR at SL ${sl}`;
  if (unit === "ATR") return `${text} = ${round(value / sl)}R at SL ${sl}`;
  return text;
}

const round = (v: number): number => Math.round(v * 1e6) / 1e6;
