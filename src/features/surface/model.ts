/**
 * Presentation-level operations over ready-made Experiment results (no trading metrics are
 * computed here): slicing, heatmap matrices, aggregates (median / counts / share passing),
 * difference to the baseline arm, AND-filters and ATR<->R readouts.
 */
import {
  metricId,
  type ExperimentManifest,
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
  /** `top` / `bottom`: the best / worst `value` percent of the cells of the frame (higher is better). */
  op: ">=" | "<=" | "top" | "bottom";
  /** `null` until a threshold is typed: a condition without a value is inactive. */
  value: number | null;
};

export const activeConditions = (filters: Condition[]): Condition[] => filters.filter((c) => c.value !== null);

export type ViewState = {
  viewId: string;
  metric: string;
  mode: ViewMode;
  /** The comparison arm shown / subtracted in `baseline` and `difference` modes. */
  compare: string | null;
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

/**
 * Distinct sorted options of every control of a view, given the rows of the current SL slice.
 * A control's options depend on the controls listed before it (for example, the trail distances
 * that exist for the selected trigger).
 */
export function controlOptions(
  schema: ExperimentResultSchema,
  view: ExperimentView,
  rows: Row[],
  controls: ControlState,
): Record<string, (string | number)[]> {
  const out: Record<string, (string | number)[]> = {};
  const grid = activeGrid(schema, controls);
  const treat = treatmentArms(schema);
  // The pool narrows control by control, so later controls scan ever fewer rows.
  let pool = treat ? rows.filter((r) => treat.includes(String(r.arm))) : rows;
  for (const id of view.controls) {
    if (id === GRID_ID) {
      const present = new Set(pool.map((r) => r[GRID_ID]));
      out[id] = gridsOf(schema).filter((g) => present.has(g));
      if (typeof controls[id] === "string") pool = pool.filter((r) => r[GRID_ID] === controls[id]);
      continue;
    }
    const dim = dimById(schema, id);
    if (!dim) continue;
    const col = dimColumn(dim, grid);
    const sub = dim.grids ? pool.filter((r) => r[GRID_ID] === grid) : pool;
    const vals = new Set<number>();
    for (const r of sub) {
      const v = r[col];
      if (typeof v === "number") vals.add(v);
    }
    out[id] = [...vals].sort((a, b) => a - b);
    const want = controls[id];
    if (typeof want === "number") {
      pool = sub.filter((r) => {
        const v = r[col];
        return typeof v === "number" && close(v, want);
      });
    }
  }
  return out;
}

const nearest = (opts: number[], v: number): number =>
  opts.reduce((best, o) => (Math.abs(o - v) < Math.abs(best - v) ? o : best), opts[0]);

/** Keep valid control values; a vanished numeric value moves to the nearest option, others to the first. */
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
    if (dimById(schema, id)?.optional) {
      // optional controls exist only while switched on and while the current geometry has values for them
      if (cur !== undefined && opts.length > 0) {
        next[id] = typeof cur === "number" && opts.every((o) => typeof o === "number") && !opts.some((o) => close(o as number, cur)) ? nearest(opts as number[], cur) : cur;
      }
      continue;
    }
    const keep = opts.some((o) => (typeof o === "number" && typeof cur === "number" ? close(o, cur) : o === cur));
    if (keep && cur !== undefined) next[id] = cur;
    else if (opts.length > 0) {
      next[id] =
        typeof cur === "number" && opts.every((o) => typeof o === "number") ? nearest(opts as number[], cur) : opts[0];
    }
  }
  return next;
}

/** Switch the grid keeping each geometry's physical size (`ATR = R × SL`); reconcile picks the nearest point. */
export function convertGrid(schema: ExperimentResultSchema, controls: ControlState, nextGrid: string): ControlState {
  const from = activeGrid(schema, controls);
  const sl = typeof controls.sl === "number" ? controls.sl : null;
  const next: ControlState = { ...controls, [GRID_ID]: nextGrid };
  for (const dim of schema.dimensions) {
    const cur = controls[dim.id];
    if (!dim.grids || typeof cur !== "number" || sl === null || from === null) continue;
    const a = dim.grids[from]?.unit;
    const b = dim.grids[nextGrid]?.unit;
    if (a === "R" && b === "ATR") next[dim.id] = cur * sl;
    else if (a === "ATR" && b === "R") next[dim.id] = cur / sl;
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
    compare: schema.arms?.baseline ?? null,
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
      if (want === undefined) {
        // an optional dimension that is switched off selects the rows that have no value for it
        const off = dimById(schema, id);
        if (off?.optional && typeof r[dimColumn(off, grid)] === "number") return false;
        continue;
      }
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

/** Comparison-arm lookup for a metric (default: the baseline arm), keyed by the manifest's `match_on` dimensions. */
export function baselineIndex(
  schema: ExperimentResultSchema,
  rows: Row[],
  metric: string,
  arm?: string | null,
): Map<string, number> {
  const out = new Map<string, number>();
  const arms = schema.arms;
  if (!arms) return out;
  const want = arm ?? arms.baseline;
  for (const r of rows) {
    if (r.arm !== want) continue;
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

function conditionValue(
  schema: ExperimentResultSchema,
  row: Row,
  c: Condition,
  indexByMetric: (metric: string) => Map<string, number>,
): number | null {
  const v = row[c.metric];
  if (typeof v !== "number") return null;
  if (c.kind !== "delta") return v;
  const base = baselineOf(schema, row, indexByMetric(c.metric));
  return base === null ? null : v - base;
}

/**
 * Cut-off values of the `top` / `bottom` conditions over the rows of one frame (the cells shown together):
 * `top 10` keeps the best 10 percent (ties included), `bottom 10` the worst 10 percent. For metrics stored
 * as negative numbers (drawdown) "best" is the value closest to zero, as everywhere else.
 */
export function percentileThresholds(
  schema: ExperimentResultSchema,
  rows: Row[],
  filters: Condition[],
  indexByMetric: (metric: string) => Map<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of activeConditions(filters)) {
    if (c.op !== "top" && c.op !== "bottom") continue;
    const vals: number[] = [];
    for (const r of rows) {
      const x = conditionValue(schema, r, c, indexByMetric);
      if (x !== null) vals.push(x);
    }
    if (vals.length === 0) continue;
    vals.sort((a, b) => (c.op === "top" ? b - a : a - b));
    const percent = Math.min(100, Math.max(0, c.value as number));
    const k = Math.min(vals.length, Math.max(1, Math.ceil((vals.length * percent) / 100)));
    out.set(c.id, vals[k - 1]);
  }
  return out;
}

export function passes(
  schema: ExperimentResultSchema,
  row: Row,
  filters: Condition[],
  indexByMetric: (metric: string) => Map<string, number>,
  /** From `percentileThresholds` of the frame; a `top` / `bottom` condition without one does not restrict. */
  thresholds?: Map<string, number>,
): boolean {
  for (const c of activeConditions(filters)) {
    const x = conditionValue(schema, row, c, indexByMetric);
    if (x === null) return false;
    // Fraction metrics (win rate, return, drawdown, top-5 share) are shown and entered in percent / pp.
    const limit = metricById(schema, c.metric)?.format === "fraction" ? (c.value as number) / 100 : (c.value as number);
    if (c.op === ">=") {
      if (!(x >= limit)) return false;
    } else if (c.op === "<=") {
      if (!(x <= limit)) return false;
    } else {
      const t = thresholds?.get(c.id);
      if (t !== undefined && (c.op === "top" ? !(x >= t) : !(x <= t))) return false;
    }
  }
  return true;
}

/** `passes` bound to one frame: the percentile cut-offs are computed once over `rows`. */
export function makePasses(
  schema: ExperimentResultSchema,
  rows: Row[],
  filters: Condition[],
  indexByMetric: (metric: string) => Map<string, number>,
): (row: Row) => boolean {
  const thresholds = percentileThresholds(schema, rows, filters, indexByMetric);
  return (row) => passes(schema, row, filters, indexByMetric, thresholds);
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
  const labelled = dim.labels?.[String(value)];
  if (labelled !== undefined) return labelled;
  if (!dim.grids) return `${value}${dim.unit ? ` ${dim.unit}` : ""}`;
  const unit = dim.grids[grid ?? Object.keys(dim.grids)[0]]?.unit ?? "";
  const text = `${value}${unit}`;
  if (sl === null || sl <= 0) return text;
  if (unit === "R") return `${text} = ${round(value * sl)} ATR at SL ${sl}`;
  if (unit === "ATR") return `${text} = ${round(value / sl)}R at SL ${sl}`;
  return text;
}

const round = (v: number): number => Math.round(v * 1e6) / 1e6;
const round2 = (v: number): number => Math.round(v * 100) / 100;

export function comparisonArms(schema: ExperimentResultSchema): string[] {
  const arms = schema.arms;
  return arms ? Object.entries(arms.roles).filter(([, r]) => r === "comparison").map(([a]) => a) : [];
}

/** Readable arm name from the stored arm id (display only; ids are never parsed for meaning elsewhere). */
export function armLabel(arm: string): string {
  const control = /^control_tp(\d+(?:\.\d+)?)r$/.exec(arm);
  if (control) return `CONTROL · TP ${control[1]}R`;
  const fixed = /^fixed_tp_(\d+(?:\.\d+)?)r$/.exec(arm);
  if (fixed) return `TP ${fixed[1]}R`;
  const trail = /^trail_T(\d+(?:\.\d+)?)_D(\d+(?:\.\d+)?)$/.exec(arm);
  if (trail) return `Trailing T${trail[1]}R / D${trail[2]}R`;
  if (arm === "stop_only") return "Stop only";
  const text = arm.replace(/_no_tp$/, "").replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Comparison-arm lookups by metric for one set of rows (memoised per metric). */
export function makeIndexer(
  schema: ExperimentResultSchema,
  rows: Row[],
  arm: string | null,
): (metric: string) => Map<string, number> {
  const cache = new Map<string, Map<string, number>>();
  return (m) => {
    let v = cache.get(m);
    if (!v) cache.set(m, (v = baselineIndex(schema, rows, m, arm)));
    return v;
  };
}

/** Slider readout of a control value: the value in its own unit and, when known, its conversion. */
export function controlReadout(
  schema: ExperimentResultSchema,
  id: string,
  value: number,
  grid: string | null,
  sl: number | null,
): { main: string; alt: string | null } {
  const dim = dimById(schema, id);
  if (!dim) return { main: String(value), alt: null };
  const labelled = dim.labels?.[String(value)];
  if (labelled !== undefined) return { main: labelled, alt: null };
  const unit = dim.grids ? (dim.grids[grid ?? Object.keys(dim.grids)[0]]?.unit ?? "") : (dim.unit ?? "");
  const joined = unit === "R" ? `${value}R` : `${value}${unit ? ` ${unit}` : ""}`;
  if (id === "sl" && unit === "ATR") return { main: joined, alt: `1R = ${value} ATR` };
  if (sl === null || sl <= 0 || id === "sl") return { main: joined, alt: null };
  if (unit === "R") return { main: joined, alt: `= ${round2(value * sl)} ATR at SL ${sl}` };
  if (unit === "ATR" && dim.grids) return { main: joined, alt: `= ${round2(value / sl)}R at SL ${sl}` };
  return { main: joined, alt: null };
}

export type MetricStyle = {
  /** Value at which a diverging scale changes colour. */
  center: number;
  /** One-sided scale (more is simply more), as for trade counts. */
  seq: boolean;
  /** Higher is better but values are negative (drawdown). */
  goodHigh: boolean;
};

/** Presentation hints by metric id; unknown metrics diverge at 0. */
export function metricStyle(metric: string): MetricStyle {
  if (metric === "profit_factor") return { center: 1, seq: false, goodHigh: false };
  if (metric === "realised_trade_count") return { center: 0, seq: true, goodHigh: false };
  if (metric === "max_drawdown_pct") return { center: 0, seq: false, goodHigh: true };
  return { center: 0, seq: false, goodHigh: false };
}

const sign = (v: number): string => (v >= 0 ? "+" : "");

/** Short text of a heatmap cell or aggregate: absolute value, or a signed difference. */
export function formatCell(metric: ExperimentMetric, value: number | null, delta: boolean): string {
  if (value === null) return "—";
  if (metric.format === "fraction") return delta ? `${sign(value)}${(value * 100).toFixed(1)}` : `${(value * 100).toFixed(1)}%`;
  if (metric.format === "integer") return delta ? `${sign(value)}${Math.round(value)}` : Math.round(value).toLocaleString("en-US");
  if (metric.unit === "R") return `${sign(value)}${value.toFixed(0)}`;
  if (metric.unit) return `${sign(value)}${Math.round(value).toLocaleString("en-US")}`;
  return delta ? `${sign(value)}${value.toFixed(2)}` : value.toFixed(2);
}

/** A starting equity declared in `fixed_params` (positive number), if any. */
export function equityFromParams(fixed: unknown): number | null {
  const v = fixed && typeof fixed === "object" ? (fixed as Record<string, unknown>).initial_equity : undefined;
  return typeof v === "number" && v > 0 ? v : null;
}

/** Starting equity the manifest declares for its runs (`fixed_params.initial_equity`), if any. */
export function initialEquity(manifest: ExperimentManifest | null): number | null {
  return equityFromParams(manifest?.fixed_params);
}

/**
 * Tables that store only `return_pct` get a "Net PnL" metric: `return_pct × initial_equity`, the same
 * equity the manifest declares for every run. Tables that already carry `net_pnl` are left alone.
 */
export function withNetPnl(schema: ExperimentResultSchema, equity: number | null): ExperimentResultSchema {
  if (equity === null || metricById(schema, "net_pnl") || !metricById(schema, "return_pct")) return schema;
  return {
    ...schema,
    metrics: [{ column: "net_pnl", label: "Net PnL", format: "number", unit: "USDT" }, ...schema.metrics],
    view: schema.view.map((v) => (v.default_metric === "return_pct" ? { ...v, default_metric: "net_pnl" } : v)),
  };
}

export function addNetPnl(rows: Row[], equity: number | null): Row[] {
  if (equity === null) return rows;
  return rows.map((r) => (typeof r.return_pct === "number" && r.net_pnl === undefined ? { ...r, net_pnl: r.return_pct * equity } : r));
}

/** Key of a heat map cell: its x and y values. */
export const cellKey = (x: number, y: number): string => `${x}|${y}`;

export type SelectionRuns = {
  /** Selected cells present in the current matrix. */
  cells: number;
  /** Selected cells none of whose rows has a `run_id`. */
  withoutRun: number;
  /** Distinct non-empty `run_id` of all rows behind the selected cells. */
  runIds: string[];
};

const runIdOf = (r: Row): string | null => (typeof r.run_id === "string" && r.run_id !== "" ? r.run_id : null);

/**
 * Run ids behind selected cells of the current slice and controls: every treatment row of a cell and,
 * when the comparison arm is shown (baseline or difference), its matched comparison rows too.
 */
export function selectionRuns(
  schema: ExperimentResultSchema,
  view: ExperimentView,
  rows: Row[],
  state: Pick<ViewState, "controls" | "mode" | "compare">,
  selection: ReadonlySet<string>,
): SelectionRuns {
  const grid = activeGrid(schema, state.controls);
  const xd = dimById(schema, view.x);
  const yd = dimById(schema, view.y);
  if (!xd || !yd || selection.size === 0) return { cells: 0, withoutRun: 0, runIds: [] };
  const sliced = sliceRows(schema, view, rows, state.controls, treatmentArms(schema));
  const compareArm = schema.arms && state.mode !== "treatment" ? (state.compare ?? schema.arms.baseline) : null;
  const byMatch = new Map<string, Row[]>();
  if (compareArm !== null) {
    for (const r of rows) {
      if (r.arm !== compareArm) continue;
      const k = matchKey(schema, r);
      const list = byMatch.get(k);
      if (list) list.push(r);
      else byMatch.set(k, [r]);
    }
  }
  const perCell = new Map<string, Set<string>>();
  for (const r of sliced) {
    const x = r[dimColumn(xd, grid)];
    const y = r[dimColumn(yd, grid)];
    if (typeof x !== "number" || typeof y !== "number") continue;
    const key = cellKey(x, y);
    if (!selection.has(key)) continue;
    let ids = perCell.get(key);
    if (!ids) perCell.set(key, (ids = new Set()));
    const own = runIdOf(r);
    if (own) ids.add(own);
    if (compareArm !== null) {
      for (const b of byMatch.get(matchKey(schema, r)) ?? []) {
        const id = runIdOf(b);
        if (id) ids.add(id);
      }
    }
  }
  const all = new Set<string>();
  let withoutRun = 0;
  for (const ids of perCell.values()) {
    if (ids.size === 0) withoutRun += 1;
    for (const id of ids) all.add(id);
  }
  return { cells: perCell.size, withoutRun, runIds: [...all].sort() };
}

/** GB (10^9 bytes) with two decimals. */
export function formatGb(bytes: number): string {
  return `${(bytes / 1e9).toFixed(2)} GB`;
}
