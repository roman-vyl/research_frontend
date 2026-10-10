import { describe, expect, it } from "vitest";

import type { ExperimentResultSchema, ExperimentResults } from "@/api/experiments";
import {
  allSettingsEquityFrame,
  allSettingsSelection,
  evaluateAllSettings,
  neededMetrics,
  snapshotColumns,
} from "@/features/surface/allSettings";
import { RATIO_MANIFEST, TRAILING_MANIFEST, TRAILING_RESULTS } from "@/features/surface/fixtures/experiments";
import { cellKey, makeIndexer, makePasses, toRows, treatmentArms, withNetPnl, type Condition } from "@/features/surface/model";

const SCHEMA: ExperimentResultSchema = {
  contract_version: "research_experiment_result_schema.v1",
  table: "runs.csv",
  run_id_column: "run_id",
  provenance: { value: "replay" },
  dimensions: [
    { id: "width", label: "Stack width", column: "w", unit: "ATR" },
    { id: "lookback", label: "Untouched lookback", column: "lb", unit: "bars" },
    { id: "sl", label: "Initial SL", column: "sl", unit: "ATR" },
  ],
  metrics: [
    { column: "net_pnl", label: "Net PnL", format: "number", unit: "USDT" },
    { column: "trades", label: "Trades", format: "integer" },
  ],
  view: [{ id: "cells", x: "lookback", y: "width", controls: ["sl"], default_metric: "net_pnl" }],
};
const VIEW = SCHEMA.view[0];

/** Cell A = width 3 / lookback 20 with Net PnL 1..5, cell B = width 3 / lookback 30 with 6..10; one SL per setting. */
const TWO_CELLS: ExperimentResults = (() => {
  const rows: number[][] = [];
  for (let s = 1; s <= 5; s += 1) rows.push([3, 20, s, s, 100]);
  for (let s = 1; s <= 5; s += 1) rows.push([3, 30, s, s + 5, 100]);
  const columns = ["width", "lookback", "sl", "net_pnl", "trades"];
  return { columns, rows: rows.length, data: columns.map((_, k) => rows.map((r) => r[k])) };
})();

const A = cellKey(20, 3);
const B = cellKey(30, 3);
const cond = (op: Condition["op"], value: number, metric = "net_pnl", kind: Condition["kind"] = "value"): Condition => ({
  id: "c1",
  metric,
  kind,
  op,
  value,
});
const run = (filters: Condition[], schema = SCHEMA, snap = TWO_CELLS, view = VIEW) =>
  evaluateAllSettings(schema, view, snap, { filters, metric: "net_pnl", mode: "treatment", compare: null, equity: null });

describe("All settings evaluation", () => {
  it("top / bottom % is global over all settings, not per cell", () => {
    // top 20 % of 10 rows: k = ceil(10 × 0.2) = 2, cut-off 9 → only B/9 and B/10; A has no match
    const top = run([cond("top", 20)]);
    expect(top.matched).toBe(2);
    expect(top.cells.get(A)).toBeUndefined();
    expect(top.cells.get(B)).toMatchObject({ count: 2, value: 10 });
    // a per-cell ranking would have kept A/5 as well
    expect(top.top.map((t) => t.value)).toEqual([10, 9]);

    const bottom = run([cond("bottom", 20)]);
    expect(bottom.matched).toBe(2);
    expect(bottom.cells.get(B)).toBeUndefined();
    expect(bottom.cells.get(A)).toMatchObject({ count: 2, value: 2 });
  });

  it("counts matches of every slice value and shows the best setting per cell", () => {
    const r = run([cond(">=", 4)]);
    expect(r.total).toBe(10);
    expect(r.matched).toBe(7);
    expect(r.cellTotal).toBe(2);
    expect(r.cells.get(A)).toMatchObject({ count: 2, value: 5, best: 4 });
    expect(r.cells.get(B)).toMatchObject({ count: 5, value: 10, best: 9 });
  });

  it("with no active condition every setting matches", () => {
    const r = run([{ ...cond(">=", 0), value: null }]);
    expect(r.matched).toBe(10);
    expect(r.cells.size).toBe(2);
  });

  it("Δ conditions use the matched comparison row of the whole snapshot", () => {
    const r = run([cond(">=", 2400, "net_pnl", "delta")], TRAILING_MANIFEST.result_schema, TRAILING_RESULTS, TRAILING_MANIFEST.result_schema.view[0]);
    expect(r.total).toBe(18); // treatment rows only
    expect(r.matched).toBe(4);
    expect(r.cells.get(cellKey(20, 3))?.count).toBe(2); // the two breakeven settings
    expect(r.cells.get(cellKey(30, 4))?.count).toBe(2);
  });
});

describe("All settings parity with the displayed-grid filter code", () => {
  it("matches the same rows as makePasses over all treatment rows, for value, Δ and percentile conditions", () => {
    const schema = TRAILING_MANIFEST.result_schema;
    const all = toRows(TRAILING_RESULTS);
    const treat = all.filter((r) => treatmentArms(schema)!.includes(String(r.arm)));
    const sets: Condition[][] = [
      [cond("top", 30)],
      [cond("bottom", 25, "net_pnl", "delta")],
      [{ ...cond(">=", -16, "max_drawdown_pct"), id: "a" }, { ...cond("top", 50, "profit_factor"), id: "b" }],
    ];
    for (const filters of sets) {
      const pass = makePasses(schema, treat, filters, makeIndexer(schema, all, schema.arms!.baseline));
      const r = run(filters, schema, TRAILING_RESULTS, schema.view[0]);
      expect(r.matched).toBe(treat.filter(pass).length);
    }
  });
});

describe("All settings snapshot columns", () => {
  it("asks for dimensions, arm, grid and only the needed metrics; derived Net PnL reads return_pct", () => {
    const shown = withNetPnl(RATIO_MANIFEST.result_schema, 10000);
    const metrics = neededMetrics(shown, "net_pnl", [cond("<=", 25, "max_drawdown_pct")]);
    expect(snapshotColumns(RATIO_MANIFEST.result_schema, metrics)).toEqual([
      "lookback",
      "max_drawdown_pct",
      "realised_trade_count",
      "return_pct",
      "run_id",
      "sl",
      "tp_ratio",
      "width",
    ]);
    const trailing = snapshotColumns(TRAILING_MANIFEST.result_schema, ["net_pnl"]);
    expect(trailing).toEqual(expect.arrayContaining(["arm", "grid", "trigger.R", "trigger.ATR", "distance.R", "be_trigger"]));
    expect(trailing).not.toContain("profit_factor");
  });
});

describe("All settings selection and equity frame", () => {
  // TWO_CELLS with a run on settings 2, 4, 7 and 9
  const WITH_RUNS: ExperimentResults = {
    columns: [...TWO_CELLS.columns, "run_id"],
    rows: TWO_CELLS.rows,
    data: [...TWO_CELLS.data, Array.from({ length: TWO_CELLS.rows }, (_, i) => ([1, 3, 6, 8].includes(i) ? `r${i + 1}` : ""))],
  };
  const res = evaluateAllSettings(SCHEMA, VIEW, WITH_RUNS, { filters: [cond(">=", 4)], metric: "net_pnl", mode: "treatment", compare: null, equity: null });

  it("a picked cell takes its matching settings of every slice, or the rest", () => {
    const m = allSettingsSelection(SCHEMA, WITH_RUNS, res, { picked: new Set([A]), side: "matching", mode: "treatment", compare: null });
    // cell A matches Net PnL 4 and 5 (SL 4, 5); run on SL 4 only
    expect(m).toMatchObject({ cells: 1, settings: 2, runIds: ["r4"], withoutRun: 0, notAddressable: 0 });
    expect(m.calcCoords).toEqual([{ width: 3, lookback: 20, sl: 4 }, { width: 3, lookback: 20, sl: 5 }]);
    const o = allSettingsSelection(SCHEMA, WITH_RUNS, res, { picked: new Set([A, B]), side: "other", mode: "treatment", compare: null });
    // B has no failing setting, so only A counts
    expect(o).toMatchObject({ cells: 1, settings: 3, runIds: ["r2"] });
  });

  it("the equity frame lists matching settings with a run, best first", () => {
    const f = allSettingsEquityFrame(WITH_RUNS, res, "net_pnl", null, 60);
    expect(f.rows.map((r) => r.run_id)).toEqual(["r9", "r7", "r4"]);
    expect(f).toMatchObject({ withRun: 3, pass: 7, total: 10 });
    expect(allSettingsEquityFrame(WITH_RUNS, res, "net_pnl", null, 1).rows).toHaveLength(1);
  });
});
