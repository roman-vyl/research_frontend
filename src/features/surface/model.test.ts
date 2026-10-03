import { describe, expect, it } from "vitest";

import { metricId } from "@/api/experiments";
import {
  RATIO_MANIFEST,
  RATIO_RESULTS,
  TRAILING_MANIFEST,
  TRAILING_RESULTS,
} from "@/features/surface/fixtures/experiments";
import {
  baselineIndex,
  buildMatrix,
  controlOptions,
  controlReadout,
  convertGrid,
  defaultState,
  displayValue,
  formatMetric,
  gridsOf,
  metricById,
  passes,
  reconcileControls,
  sliceRows,
  toRows,
  treatmentArms,
  unitText,
  type Condition,
} from "@/features/surface/model";

const T = TRAILING_MANIFEST.result_schema;
const R = RATIO_MANIFEST.result_schema;
const trailingRows = toRows(TRAILING_RESULTS);
const ratioRows = toRows(RATIO_RESULTS);
const cellsView = T.view.find((v) => v.id === "cells")!;

describe("surface model", () => {
  it("turns columnar results into rows", () => {
    expect(trailingRows).toHaveLength(TRAILING_RESULTS.rows);
    expect(trailingRows[1]["trigger.R"]).toBe(6);
    expect(trailingRows[0].arm).toBe("control_tp5r");
  });

  it("derives default controls and options from the data (trailing, R grid)", () => {
    const st = defaultState(T, "cells", trailingRows);
    expect(st.controls).toEqual({ sl: 5, grid: "R", trigger: 6, distance: 0.5 });
    expect(gridsOf(T)).toEqual(["ATR", "R"]);
    expect(controlOptions(T, cellsView, trailingRows, st.controls).grid).toEqual(["R"]); // only grids with data
    const opts = controlOptions(T, cellsView, trailingRows, st.controls);
    expect(opts.trigger).toEqual([6, 7]);
    expect(opts.distance).toEqual([0.5, 1]);
    expect(treatmentArms(T)).toEqual(["trailing_no_tp"]);
  });

  it("drops controls whose value disappears when the grid changes", () => {
    const next = reconcileControls(T, cellsView, trailingRows, { sl: 5, grid: "ATR", trigger: 6, distance: 0.5 });
    expect(next).toEqual({ sl: 5, grid: "R", trigger: 6, distance: 0.5 }); // only the R grid has rows
  });

  it("builds the width x lookback matrix of one geometry", () => {
    const st = defaultState(T, "cells", trailingRows);
    const rows = sliceRows(T, cellsView, trailingRows, st.controls, treatmentArms(T));
    expect(rows).toHaveLength(4);
    const m = buildMatrix(T, cellsView, rows, st.controls);
    expect(m.xs).toEqual([20, 30]);
    expect(m.ys).toEqual([3, 4]);
    expect(m.cells[0][0]?.net_pnl).toBe(2100);
  });

  it("computes the difference to the baseline arm on match_on dimensions", () => {
    const st = defaultState(T, "cells", trailingRows);
    const idx = baselineIndex(T, trailingRows, "net_pnl");
    const row = sliceRows(T, cellsView, trailingRows, st.controls, treatmentArms(T))[0];
    expect(displayValue(T, row, "net_pnl", "treatment", idx)).toBe(2100);
    expect(displayValue(T, row, "net_pnl", "baseline", idx)).toBe(1030);
    expect(displayValue(T, row, "net_pnl", "difference", idx)).toBe(1070);
  });

  it("applies AND filters on values and on differences", () => {
    const rows = sliceRows(T, cellsView, trailingRows, defaultState(T, "cells", trailingRows).controls, treatmentArms(T));
    const cache = new Map<string, Map<string, number>>();
    const idx = (m: string): Map<string, number> => {
      if (!cache.has(m)) cache.set(m, baselineIndex(T, trailingRows, m));
      return cache.get(m)!;
    };
    const f = (...c: Condition[]): number => rows.filter((r) => passes(T, r, c, idx)).length;
    const pf: Condition = { id: "a", metric: "profit_factor", kind: "value", op: ">=", value: 1.2 };
    const dnet: Condition = { id: "b", metric: "net_pnl", kind: "delta", op: ">=", value: 1100 };
    expect(f()).toBe(4);
    expect(f(pf)).toBe(4);
    expect(f(pf, dnet)).toBe(3); // deltas are 1070, 1470, 1860, 2260; three reach 1100
    expect(f({ ...pf, value: 5 })).toBe(0);
  });

  it("starts the comparison on the baseline arm and indexes any comparison arm", () => {
    expect(defaultState(T, "cells", trailingRows).compare).toBe("control_tp5r");
    expect(baselineIndex(T, trailingRows, "net_pnl", "control_tp5r").size).toBeGreaterThan(0);
  });

  it("converts geometry between grids by the stop size and reads units off the slider", () => {
    const next = convertGrid(T, { sl: 5, grid: "R", trigger: 7, distance: 1 }, "ATR");
    expect(next).toEqual({ sl: 5, grid: "ATR", trigger: 35, distance: 5 });
    expect(convertGrid(T, next, "R")).toEqual({ sl: 5, grid: "R", trigger: 7, distance: 1 });
    expect(controlReadout(T, "trigger", 7, "R", 5)).toEqual({ main: "7R", alt: "= 35 ATR at SL 5" });
    expect(controlReadout(T, "trigger", 35, "ATR", 5)).toEqual({ main: "35 ATR", alt: "= 7R at SL 5" });
    expect(controlReadout(T, "sl", 5, null, 5)).toEqual({ main: "5 ATR", alt: "1R = 5 ATR" });
  });

  it("works for an experiment without arms or grids (ratio)", () => {
    const st = defaultState(R, "main", ratioRows);
    expect(st.controls).toEqual({ sl: 5, tp_ratio: 5 });
    const view = R.view[0];
    const m = buildMatrix(R, view, sliceRows(R, view, ratioRows, st.controls, treatmentArms(R)), st.controls);
    expect(m.xs).toEqual([20, 30, 40]);
    expect(m.ys).toEqual([3, 4]);
    expect(displayValue(R, ratioRows[0], "return_pct", "difference", new Map())).toBe(ratioRows[0].return_pct);
  });

  it("formats metrics and unit readouts without guessing from names", () => {
    expect(formatMetric(metricById(R, "return_pct")!, 0.256)).toBe("25.6%");
    expect(formatMetric(metricById(R, "realised_trade_count")!, 100.4)).toBe("100");
    expect(formatMetric(metricById(T, "net_pnl")!, 12345.6)).toBe("12,346");
    expect(formatMetric(metricById(T, "profit_factor")!, null)).toBe("—");
    expect(T.metrics.map(metricId)).toContain("short_net_pnl");
    expect(unitText(T, "trigger", 7, "R", 5)).toBe("7R = 35 ATR at SL 5");
    expect(unitText(T, "trigger", 35, "ATR", 5)).toBe("35ATR = 7R at SL 5");
    expect(unitText(T, "width", 4, null, 5)).toBe("4 ATR");
  });
});
