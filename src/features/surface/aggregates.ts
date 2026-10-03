/**
 * Summary cards and the geometry map of the Surface view: medians, counts and shares over ready-made
 * result rows (presentation level; no trading metric is recomputed).
 */
import type { ExperimentMetric, ExperimentResultSchema, ExperimentView } from "@/api/experiments";
import {
  baselineOf,
  dimById,
  dimColumn,
  formatCell,
  GRID_ID,
  makeIndexer,
  median,
  metricById,
  passes,
  sliceRows,
  treatmentArms,
  type Row,
  type ViewState,
} from "@/features/surface/model";

const PF = "profit_factor";
const DD = "max_drawdown_pct";
const CUM = "cumulative_net_r";

const has = (schema: ExperimentResultSchema, id: string): boolean => metricById(schema, id) !== undefined;

/** The metrics a row must beat its comparison on to count as "better" (primary, PF and drawdown when present). */
export function betterMetrics(schema: ExperimentResultSchema, primary: string): string[] {
  return [primary, PF, DD].filter((m, i, a) => has(schema, m) && a.indexOf(m) === i);
}

export type GeoAggregate = {
  id: string;
  label: string;
  /** Delta / ratio / share aggregates need a comparison arm. */
  fmt: (v: number) => string;
  center: number;
  seq: boolean;
};

const need = (schema: ExperimentResultSchema, id: string): ExperimentMetric => metricById(schema, id) as ExperimentMetric;

export function geoAggregates(schema: ExperimentResultSchema, primary: string): GeoAggregate[] {
  const out: GeoAggregate[] = [];
  const pm = need(schema, primary);
  const delta = (m: string, label?: string): GeoAggregate => ({
    id: `d:${m}`,
    label: label ?? `Median Δ ${need(schema, m).label}${need(schema, m).format === "fraction" ? " (pp)" : ""}`,
    fmt: (v) => formatCell(need(schema, m), v, true),
    center: 0,
    seq: false,
  });
  out.push(delta(primary));
  if (pm.format === "number") {
    out.push({
      id: "mult",
      label: `Median ${pm.label} ÷ comparison (profitable cells)`,
      fmt: (v) => `×${v.toFixed(2)}`,
      center: 1,
      seq: false,
    });
  }
  const better = betterMetrics(schema, primary);
  out.push({
    id: "all3",
    label: `% cells better: ${better.map((m) => need(schema, m).label).join(", ")}`,
    fmt: (v) => `${v.toFixed(0)}%`,
    center: 0,
    seq: true,
  });
  for (const m of [CUM, PF, DD]) if (has(schema, m) && m !== primary) out.push(delta(m));
  out.push({
    id: `m:${primary}`,
    label: `Median ${pm.label}`,
    fmt: (v) => (pm.format === "fraction" ? `${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString("en-US")),
    center: 0,
    seq: false,
  });
  out.push({ id: "fpass", label: "% cells passing filters", fmt: (v) => `${v.toFixed(0)}%`, center: 0, seq: true });
  return out;
}

export type GeoCell = { x: number; y: number; value: number | null; count: number };

/** One aggregate per (x, y) of the geometry view, over `aggregate_over` of the current SL slice. */
export function geometryMap(
  schema: ExperimentResultSchema,
  view: ExperimentView,
  rows: Row[],
  state: ViewState,
  aggId: string,
): GeoCell[] {
  const grid = typeof state.controls[GRID_ID] === "string" ? (state.controls[GRID_ID] as string) : null;
  const xd = dimById(schema, view.x);
  const yd = dimById(schema, view.y);
  if (!xd || !yd) return [];
  const sliced = sliceRows(schema, view, rows, state.controls, treatmentArms(schema));
  const idx = makeIndexer(schema, rows, state.compare);
  const better = betterMetrics(schema, view.default_metric);
  type G = { x: number; y: number; vals: number[]; n: number; hits: number };
  const groups = new Map<string, G>();
  for (const r of sliced) {
    const x = r[dimColumn(xd, grid)];
    const y = r[dimColumn(yd, grid)];
    if (typeof x !== "number" || typeof y !== "number") continue;
    const key = `${x}|${y}`;
    const g = groups.get(key) ?? { x, y, vals: [], n: 0, hits: 0 };
    g.n += 1;
    const delta = (m: string): number | null => {
      const v = r[m];
      const b = baselineOf(schema, r, idx(m));
      return typeof v === "number" && b !== null ? v - b : null;
    };
    if (aggId === "fpass") {
      if (passes(schema, r, state.filters, idx)) g.hits += 1;
    } else if (aggId === "all3") {
      const ds = better.map(delta);
      if (ds.every((d) => d !== null && d > 0)) g.hits += 1;
    } else if (aggId === "mult") {
      const v = r[view.default_metric];
      const b = baselineOf(schema, r, idx(view.default_metric));
      if (typeof v === "number" && b !== null && b > 0) g.vals.push(v / b);
    } else if (aggId.startsWith("d:")) {
      const d = delta(aggId.slice(2));
      if (d !== null) g.vals.push(d);
    } else if (aggId.startsWith("m:")) {
      const v = r[aggId.slice(2)];
      if (typeof v === "number") g.vals.push(v);
    }
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({
    x: g.x,
    y: g.y,
    count: g.n,
    value: aggId === "fpass" || aggId === "all3" ? (100 * g.hits) / g.n : median(g.vals),
  }));
}

export type SummaryCard = { label: string; value: string };

/** The row of figures above the heatmap (medians over the frame's cells, counts better than the comparison). */
export function summaryCards(
  schema: ExperimentResultSchema,
  sliced: Row[],
  rows: Row[],
  state: ViewState,
  primary: string,
  compareName: string,
): SummaryCard[] {
  const idx = makeIndexer(schema, rows, state.compare);
  const med = (m: string, kind: "value" | "delta" | "base"): number | null => {
    const xs: number[] = [];
    for (const r of sliced) {
      const v = r[m];
      if (typeof v !== "number") continue;
      if (kind === "value") xs.push(v);
      else {
        const b = baselineOf(schema, r, idx(m));
        if (b !== null) xs.push(kind === "base" ? b : v - b);
      }
    }
    return median(xs);
  };
  const cards: SummaryCard[] = [];
  const val = (m: string, kind: "value" | "delta" | "base", label: string) => {
    const metric = metricById(schema, m);
    if (!metric) return;
    const v = med(m, kind);
    cards.push({ label, value: v === null ? "—" : formatCell(metric, v, kind === "delta") });
  };
  const pm = metricById(schema, primary);
  if (!pm) return cards;
  val(primary, "value", `median ${pm.label}`);
  if (schema.arms) {
    val(primary, "base", `median ${pm.label}, ${compareName}`);
    val(primary, "delta", `median Δ ${pm.label}`);
  }
  for (const m of [PF, DD, CUM]) {
    const metric = metricById(schema, m);
    if (!metric || m === primary) continue;
    val(m, "value", `median ${metric.label}`);
    if (schema.arms && m !== CUM) val(m, "delta", `median Δ ${metric.label}${metric.format === "fraction" ? ", pp" : ""}`);
    if (schema.arms && m === CUM) val(m, "delta", `median Δ ${metric.label}`);
  }
  if (schema.arms) {
    const n = sliced.length;
    const beat = (ms: string[]): number =>
      sliced.filter((r) =>
        ms.every((m) => {
          const v = r[m];
          const b = baselineOf(schema, r, idx(m));
          return typeof v === "number" && b !== null && v > b;
        }),
      ).length;
    cards.push({ label: `cells better: ${pm.label}`, value: `${beat([primary])} / ${n}` });
    const b3 = betterMetrics(schema, primary);
    if (b3.length > 1) cards.push({ label: `better: ${b3.map((m) => need(schema, m).label).join("+")}`, value: `${beat(b3)} / ${n}` });
  }
  if (state.filters.length > 0) {
    cards.push({
      label: "cells passing filters",
      value: `${sliced.filter((r) => passes(schema, r, state.filters, idx)).length} / ${sliced.length}`,
    });
  }
  return cards;
}
