/**
 * "All settings" filter scope: the Surface conditions evaluated on every treatment row of an Experiment
 * (every outer slice value, grid, control value and optional dimension), not only on the displayed grid.
 *
 * The rows come from one columnar snapshot of the result table (`GET .../results` without filters and with
 * only the needed columns). Columns of separate responses are never joined by row index: the response has
 * no table version, and run deletion / Calculate rewrite the table in place. Rows are visited through one
 * reused object only where a comparison-row lookup needs one; plain conditions read the columns directly.
 */
import { metricId, type ExperimentResultSchema, type ExperimentResults, type ExperimentView } from "@/api/experiments";
import {
  GRID_ID,
  activeConditions,
  cellKey,
  dimColumn,
  baselineOf,
  displayValue,
  gridsOf,
  makeIndexer,
  metricById,
  treatmentArms,
  type Condition,
  type Row,
  type ViewMode,
} from "@/features/surface/model";

export type FilterScope = "view" | "all";

/** Cap of the "Top matches" table. */
export const TOP_MATCHES = 50;

/**
 * The column ids of one snapshot: arm, grid, every dimension (all grids of multi-grid ones, so that a
 * matching row can be reopened on the displayed grid) and the given metrics. `schema` is the manifest
 * schema as stored: a metric it lacks (the derived Net PnL) is read from `return_pct`.
 */
export function snapshotColumns(schema: ExperimentResultSchema, metrics: string[]): string[] {
  const out = new Set<string>();
  if (schema.arms) out.add("arm");
  if (gridsOf(schema).length > 0) out.add(GRID_ID);
  for (const dim of schema.dimensions) {
    if (dim.grids) for (const g of Object.keys(dim.grids)) out.add(`${dim.id}.${g}`);
    else out.add(dim.id);
  }
  for (const m of metrics) {
    if (metricById(schema, m)) out.add(m);
    else if (m === "net_pnl" && metricById(schema, "return_pct")) out.add("return_pct");
  }
  return [...out].sort();
}

/** Whether a loaded snapshot already holds every needed column. */
export const covers = (loaded: readonly string[], needed: readonly string[]): boolean =>
  needed.every((c) => loaded.includes(c));

/** One snapshot row as a fresh object (Net PnL derived as on the displayed grid). */
export function snapshotRow(snap: ExperimentResults, i: number, equity: number | null): Row {
  const row: Row = {};
  fill(snap, i, equity, row);
  return row;
}

function fill(snap: ExperimentResults, i: number, equity: number | null, row: Row): void {
  for (let k = 0; k < snap.columns.length; k += 1) row[snap.columns[k]] = snap.data[k][i];
  if (equity !== null && typeof row.return_pct === "number" && !snap.columns.includes("net_pnl")) {
    row.net_pnl = row.return_pct * equity;
  }
}

/** Iterates the snapshot through one reused row object. */
function* visit(snap: ExperimentResults, equity: number | null): Generator<Row> {
  const row: Row = {};
  for (let i = 0; i < snap.rows; i += 1) {
    fill(snap, i, equity, row);
    yield row;
  }
}

export type AllCell = {
  /** Row index (in the snapshot) of the best matching setting. */
  best: number;
  /** Displayed value of that setting (`null` when it has none). */
  value: number | null;
  /** Matching settings in this cell. */
  count: number;
};

export type AllSettingsResult = {
  xs: number[];
  ys: number[];
  /** Cells with at least one matching setting, by `cellKey`. */
  cells: Map<string, AllCell>;
  /** Cells (x × y) that have any treatment row. */
  cellTotal: number;
  /** Treatment rows (settings) evaluated, and how many of them match. */
  total: number;
  matched: number;
  /** Best matches by the displayed value, at most `TOP_MATCHES`, best first. */
  top: { index: number; value: number | null }[];
};

/**
 * Conditions on every treatment row. Top / bottom % rank ALL treatment rows of the snapshot (one global
 * cut-off), never the rows of one cell. Δ conditions and the baseline / difference display use the matched
 * comparison row, looked up over the whole snapshot. Higher displayed values are better for every metric.
 */
export function evaluateAllSettings(
  schema: ExperimentResultSchema,
  view: ExperimentView,
  snap: ExperimentResults,
  opts: { filters: Condition[]; metric: string; mode: ViewMode; compare: string | null; equity: number | null },
): AllSettingsResult {
  const byId = new Map(snap.columns.map((c, k) => [c, snap.data[k]]));
  const col = (id: string): (number | string | null)[] | null => byId.get(id) ?? null;
  const arms = treatmentArms(schema);
  const armCol = col("arm");
  const isTreatment = (i: number): boolean => !arms || (armCol !== null && arms.includes(String(armCol[i])));
  const gridCol = col(GRID_ID);
  const xd = schema.dimensions.find((d) => d.id === view.x);
  const yd = schema.dimensions.find((d) => d.id === view.y);
  const empty: AllSettingsResult = { xs: [], ys: [], cells: new Map(), cellTotal: 0, total: 0, matched: 0, top: [] };
  if (!xd || !yd) return empty;
  // a multi-grid axis is read in the row's own grid
  const axis = (dim: typeof xd, i: number): number | null => {
    const c = dim.grids ? col(dimColumn(dim, gridCol && typeof gridCol[i] === "string" ? (gridCol[i] as string) : null)) : col(dim.id);
    const v = c ? c[i] : null;
    return typeof v === "number" ? v : null;
  };

  const compare = opts.compare ?? schema.arms?.baseline ?? null;
  // comparison-arm lookups only when a Δ condition or the baseline / difference display needs them
  const idx = makeIndexer(schema, { [Symbol.iterator]: () => visit(snap, opts.equity) }, compare);
  const row: Row = {};
  const rowAt = (i: number): Row => {
    fill(snap, i, opts.equity, row);
    return row;
  };
  // a metric value of row i, read straight from its column (Net PnL derived from return_pct when absent)
  const valueOf = (metric: string): ((i: number) => number | null) => {
    const c = col(metric);
    if (c) return (i) => (typeof c[i] === "number" ? (c[i] as number) : null);
    const ret = col("return_pct");
    const eq = opts.equity;
    if (metric === "net_pnl" && ret && eq !== null) return (i) => (typeof ret[i] === "number" ? (ret[i] as number) * eq : null);
    return () => null;
  };
  const getter = (c: Condition): ((i: number) => number | null) => {
    const own = valueOf(c.metric);
    if (c.kind !== "delta") return own;
    return (i) => {
      const v = own(i);
      if (v === null) return null;
      const base = baselineOf(schema, rowAt(i), idx(c.metric));
      return base === null ? null : v - base;
    };
  };

  // Conditions compiled once. Top / bottom % take one cut-off over ALL treatment rows (as `percentileThresholds`).
  const tests: ((i: number) => boolean)[] = [];
  for (const c of activeConditions(opts.filters)) {
    const g = getter(c);
    const v = c.value as number;
    if (c.op === ">=" || c.op === "<=") {
      // fraction metrics are entered in percent / pp
      const limit = metricById(schema, c.metric)?.format === "fraction" ? v / 100 : v;
      tests.push(c.op === ">=" ? (i) => { const x = g(i); return x !== null && x >= limit; } : (i) => { const x = g(i); return x !== null && x <= limit; });
      continue;
    }
    const vals: number[] = [];
    for (let i = 0; i < snap.rows; i += 1) {
      if (!isTreatment(i)) continue;
      const x = g(i);
      if (x !== null) vals.push(x);
    }
    if (vals.length === 0) {
      tests.push((i) => g(i) !== null);
      continue;
    }
    const sorted = Float64Array.from(vals).sort();
    const k = Math.min(sorted.length, Math.max(1, Math.ceil((sorted.length * Math.min(100, Math.max(0, v))) / 100)));
    const cut = c.op === "top" ? sorted[sorted.length - k] : sorted[k - 1];
    tests.push(c.op === "top" ? (i) => { const x = g(i); return x !== null && x >= cut; } : (i) => { const x = g(i); return x !== null && x <= cut; });
  }
  const shown =
    schema.arms && opts.mode !== "treatment"
      ? (i: number) => displayValue(schema, rowAt(i), opts.metric, opts.mode, idx(opts.metric))
      : valueOf(opts.metric);

  // cells keyed by axis position (number keys: no string per row); turned into `cellKey` at the end
  const xPos = new Map<number, number>();
  const yPos = new Map<number, number>();
  const pos = (m: Map<number, number>, v: number): number => {
    let p = m.get(v);
    if (p === undefined) m.set(v, (p = m.size));
    return p;
  };
  const byPos = new Map<number, AllCell & { x: number; y: number }>();
  const present = new Set<number>();
  const top: { index: number; value: number | null }[] = [];
  const rank = (v: number | null): number => (v === null ? -Infinity : v);
  let total = 0;
  let matched = 0;
  rows: for (let i = 0; i < snap.rows; i += 1) {
    if (!isTreatment(i)) continue;
    const x = axis(xd, i);
    const y = axis(yd, i);
    if (x === null || y === null) continue;
    total += 1;
    const key = pos(xPos, x) * 1_000_000 + pos(yPos, y);
    present.add(key);
    for (const t of tests) if (!t(i)) continue rows;
    matched += 1;
    const value = shown(i);
    const cell = byPos.get(key);
    if (!cell) byPos.set(key, { best: i, value, count: 1, x, y });
    else {
      cell.count += 1;
      if (rank(value) > rank(cell.value)) {
        cell.best = i;
        cell.value = value;
      }
    }
    if (top.length < TOP_MATCHES || rank(value) > rank(top[top.length - 1].value)) {
      let at = top.length;
      while (at > 0 && rank(top[at - 1].value) < rank(value)) at -= 1;
      top.splice(at, 0, { index: i, value });
      if (top.length > TOP_MATCHES) top.pop();
    }
  }
  const cells = new Map<string, AllCell>();
  for (const c of byPos.values()) cells.set(cellKey(c.x, c.y), { best: c.best, value: c.value, count: c.count });
  return {
    xs: [...xPos.keys()].sort((a, b) => a - b),
    ys: [...yPos.keys()].sort((a, b) => a - b),
    cells,
    cellTotal: present.size,
    total,
    matched,
    top,
  };
}

/** The metrics an "All settings" snapshot needs: the displayed one, the conditions' and the table's columns. */
export function neededMetrics(schema: ExperimentResultSchema, metric: string, filters: Condition[]): string[] {
  const out = new Set<string>([metric, ...activeConditions(filters).map((c) => c.metric)]);
  for (const m of tableMetrics(schema)) out.add(m);
  return [...out];
}

/** Extra metrics of the matches table: Net PnL when the Experiment has it, and the first count metric. */
export function tableMetrics(schema: ExperimentResultSchema): string[] {
  const out: string[] = [];
  if (metricById(schema, "net_pnl")) out.push("net_pnl");
  const count = schema.metrics.find((m) => m.format === "integer");
  if (count) out.push(metricId(count));
  return out;
}
