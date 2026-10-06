/**
 * Candidate metrics as the tab shows them. A record carries metric ids only, so labels and formats of the
 * usual ones are listed here; other ids are shown as plain numbers.
 */
import type { ExperimentMetric, ExperimentResultSchema } from "@/api/experiments";
import type { Candidate, CandidateMeaning } from "@/api/candidates";
import { addNetPnl, equityFromParams, type Condition } from "@/features/surface/model";

const KNOWN: Record<string, Omit<ExperimentMetric, "column">> = {
  net_pnl: { label: "Net PnL", format: "number", unit: "USDT" },
  return_pct: { label: "Return", format: "fraction" },
  profit_factor: { label: "PF", format: "number" },
  max_drawdown_pct: { label: "Max DD", format: "fraction" },
  win_rate: { label: "Win rate", format: "fraction" },
  realised_trade_count: { label: "Trades", format: "integer" },
  cum_r: { label: "Cum R", format: "number", unit: "R" },
};
const ORDER = Object.keys(KNOWN);

export const MAX_DD = "max_drawdown_pct";

export function metricInfo(id: string): ExperimentMetric {
  const known = KNOWN[id];
  if (known) return { column: id, ...known };
  const text = id.replace(/_/g, " ");
  return { column: id, label: text.charAt(0).toUpperCase() + text.slice(1), format: "number" };
}

export type Metrics = Record<string, number | null>;

/** Net PnL as the Surface has it: the table's `net_pnl`, else `return_pct` × the manifest's initial equity. */
export function withNetPnl(metrics: Metrics, meaning: CandidateMeaning | null): Metrics {
  const row = addNetPnl([metrics], equityFromParams(meaning?.fixed_params))[0];
  return row as Metrics;
}

export type Shown = {
  /** Current metrics; the stored snapshot while the row is not found (`stale`). */
  metrics: Metrics;
  snapshot: Metrics;
  stale: boolean;
};

export function shownMetrics(c: Candidate): Shown {
  const meaning = c.current?.meaning ?? null;
  const current = c.current?.metrics ?? null;
  return {
    metrics: withNetPnl(current ?? c.snapshot.metrics, meaning),
    snapshot: withNetPnl(c.snapshot.metrics, meaning),
    stale: current === null,
  };
}

/** Metric ids present in any candidate: the usual ones in their order (Net PnL first), then the rest. */
export function metricIds(all: Shown[]): string[] {
  const present = new Set(all.flatMap((s) => Object.keys(s.metrics)));
  return [...ORDER.filter((id) => present.has(id)), ...[...present].filter((id) => !ORDER.includes(id)).sort()];
}

/** Stand-in schema so `FiltersPanel` and the Surface's condition rules apply to candidate metrics. */
export function filterSchema(ids: string[]): ExperimentResultSchema {
  return {
    contract_version: "candidates",
    table: "candidates",
    run_id_column: "run_id",
    provenance: {},
    dimensions: [],
    metrics: ids.map(metricInfo),
    view: [],
  };
}

/**
 * Max DD is compared by depth whatever its sign: the row holds |drawdown|, so "at most 20" hides deeper
 * ones; "top" / "bottom" then count the shallowest / deepest.
 */
export function depthRow(metrics: Metrics): Metrics {
  const dd = metrics[MAX_DD];
  return typeof dd === "number" ? { ...metrics, [MAX_DD]: Math.abs(dd) } : metrics;
}

export function depthConditions(filters: Condition[]): Condition[] {
  return filters.map((c) =>
    c.metric === MAX_DD && (c.op === "top" || c.op === "bottom") ? { ...c, op: c.op === "top" ? "bottom" : "top" } : c,
  );
}
