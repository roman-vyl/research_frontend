/**
 * Summary cards and the geometry map of the Surface view: medians, counts and shares over ready-made
 * result rows (presentation level; no trading metric is recomputed).
 */
import type { ExperimentResultSchema } from "@/api/experiments";
import {
  baselineOf,
  formatCell,
  makeIndexer,
  makePasses,
  median,
  metricById,
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

const need = (schema: ExperimentResultSchema, id: string) => metricById(schema, id)!;

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
      value: `${sliced.filter(makePasses(schema, sliced, state.filters, idx)).length} / ${sliced.length}`,
    });
  }
  return cards;
}
