/** Mock Experiment API responses in the Research Service format (test fixtures only). */
import type {
  ExperimentManifest,
  ExperimentRegistry,
  ExperimentResults,
} from "@/api/experiments";

export const REGISTRY: ExperimentRegistry = {
  registry_version: 1,
  experiments: [
    {
      experiment_id: "btcusdt_p.ema500.ratio_4d",
      title: "EMA500 · fixed SL × TP ratio",
      ticker: "BTCUSDT.P",
      anchor: "EMA500",
      manifest: "BTCUSDT.P/ema500/width_x_untouched_x_stop_x_ratio_4d/manifest.json",
    },
    {
      experiment_id: "btcusdt_p.ema500.trailing_geometry_4d",
      title: "EMA500 · trailing geometry (no TP)",
      ticker: "BTCUSDT.P",
      anchor: "EMA500",
      manifest: "BTCUSDT.P/ema500/width_x_untouched_x_stop_x_trailing_geometry_4d/manifest.json",
    },
  ],
};

export const RATIO_MANIFEST: ExperimentManifest = {
  experiment_id: "btcusdt_p.ema500.ratio_4d",
  fixed_params: { initial_equity: 10000 },
  result_schema: {
    contract_version: "research_experiment_result_schema.v1",
    table: "runs.csv",
    run_id_column: "run_id",
    provenance: { value: "engine" },
    row_columns: { market_data_hash: "market_data_hash" },
    dimensions: [
      { id: "width", label: "Stack width", column: "min_current_width_atr", unit: "ATR" },
      { id: "lookback", label: "Untouched lookback", column: "untouched_lookback", unit: "bars" },
      { id: "sl", label: "Initial SL", column: "sl_atr_multiplier", unit: "ATR" },
      { id: "tp_ratio", label: "TP / SL", column: "tp_sl_ratio", unit: "R" },
    ],
    metrics: [
      { column: "return_pct", label: "Return", format: "fraction" },
      { column: "profit_factor", label: "PF", format: "number" },
      { column: "max_drawdown_pct", label: "Max DD", format: "fraction" },
      { column: "realised_trade_count", label: "Trades", format: "integer" },
    ],
    view: [
      {
        id: "main",
        x: "lookback",
        y: "width",
        controls: ["sl", "tp_ratio"],
        default_metric: "return_pct",
      },
    ],
  },
};

export const TRAILING_MANIFEST: ExperimentManifest = {
  experiment_id: "btcusdt_p.ema500.trailing_geometry_4d",
  result_schema: {
    contract_version: "research_experiment_result_schema.v1",
    table: "runs.csv",
    run_id_column: "run_id",
    provenance: { value: "replay" },
    dimensions: [
      { id: "width", label: "Stack width", column: "min_current_width_atr", unit: "ATR" },
      { id: "lookback", label: "Untouched lookback", column: "untouched_lookback", unit: "bars" },
      { id: "sl", label: "Initial SL", column: "sl_atr_multiplier", unit: "ATR" },
      {
        id: "trigger",
        label: "Trigger T",
        grid_column: "geometry_grid_unit",
        grids: {
          ATR: { column: "trail_trigger_atr", unit: "ATR" },
          R: { column: "trigger_r", unit: "R" },
        },
      },
      {
        id: "distance",
        label: "Trail D",
        grid_column: "geometry_grid_unit",
        grids: {
          ATR: { column: "trail_distance_atr", unit: "ATR" },
          R: { column: "trail_distance_r", unit: "R" },
        },
      },
    ],
    arms: {
      column: "arm",
      roles: { trailing_no_tp: "treatment", control_tp5r: "comparison" },
      baseline: "control_tp5r",
      match_on: ["width", "lookback", "sl"],
    },
    metrics: [
      { column: "net_pnl", label: "Net PnL", format: "number", unit: "USDT" },
      { column: "profit_factor", label: "PF", format: "number" },
      { column: "max_drawdown_pct", label: "Max DD", format: "fraction" },
      { column: "short_net_pnl", label: "Short net", format: "number", unit: "USDT" },
    ],
    view: [
      {
        id: "cells",
        x: "lookback",
        y: "width",
        controls: ["sl", "grid", "trigger", "distance"],
        default_metric: "net_pnl",
        filmstrip: "trigger",
      },
      {
        id: "geometry",
        x: "distance",
        y: "trigger",
        controls: ["sl", "grid"],
        aggregate_over: ["width", "lookback"],
        default_metric: "net_pnl",
      },
    ],
  },
};

const RUN = (c: string): string => `run_${c.repeat(32)}`;

/** Ratio results for SL 5: widths 3..4 × lookbacks 20..40, TP ratio 5; two rows without a run. */
export const RATIO_RESULTS: ExperimentResults = (() => {
  const widths = [3, 4];
  const lookbacks = [20, 30, 40];
  const rows: (number | string | null)[][] = [];
  let k = 0;
  for (const w of widths) {
    for (const lb of lookbacks) {
      k += 1;
      rows.push([w, lb, 5, 5, k / 10 - 0.2, 1 + k / 10, -0.1 - k / 100, 100 + k, k <= 4 ? RUN(String(k)) : null, "h1"]);
    }
  }
  const cols = ["width", "lookback", "sl", "tp_ratio", "return_pct", "profit_factor",
    "max_drawdown_pct", "realised_trade_count", "run_id", "market_data_hash"];
  return {
    columns: cols,
    rows: rows.length,
    data: cols.map((_, i) => rows.map((r) => r[i])),
    provenance: { value: "engine" },
  };
})();

/**
 * Trailing results for SL 5: width 3..4 × lookback 20..30, R grid T∈{6,7} × D∈{0.5,1}
 * for the treatment arm plus the control arm per cell; the first trailing row has a run.
 */
export const TRAILING_RESULTS: ExperimentResults = (() => {
  const cols = ["width", "lookback", "sl", "grid", "trigger.ATR", "trigger.R", "distance.ATR",
    "distance.R", "arm", "net_pnl", "profit_factor", "max_drawdown_pct", "short_net_pnl", "run_id"];
  const rows: (number | string | null)[][] = [];
  let k = 0;
  for (const w of [3, 4]) {
    for (const lb of [20, 30]) {
      rows.push([w, lb, 5, null, null, null, null, null, "control_tp5r", 1000 + w * 10, 1.1, -0.2, -50, null]);
      for (const t of [6, 7]) {
        for (const d of [0.5, 1]) {
          k += 1;
          rows.push([w, lb, 5, "R", t * 5, t, d * 5, d, "trailing_no_tp",
            2000 + k * 100, 1.2 + k / 100, -0.15, k % 2 === 0 ? 30 : -30, k === 1 ? RUN("t") : null]);
        }
      }
    }
  }
  return {
    columns: cols,
    rows: rows.length,
    data: cols.map((_, i) => rows.map((r) => r[i])),
    provenance: { value: "replay" },
  };
})();
