import { describe, expect, it } from "vitest";

import { RATIO_MANIFEST, RATIO_RESULTS, TRAILING_MANIFEST, TRAILING_RESULTS } from "@/features/surface/fixtures/experiments";
import { cellKey, defaultState, selectionRuns, toRows, type Row } from "@/features/surface/model";
import { MAX_CALCULATE_ROWS, NO_MATERIALIZE_HINT, calculateBlocked, canCalculate, planCounts } from "@/features/surface/RunCalculation";

const RUN = (c: string): string => `run_${c.repeat(32)}`;

describe("selectionRuns", () => {
  const schema = RATIO_MANIFEST.result_schema;
  const view = schema.view[0];

  it("counts distinct non-empty run ids, not cells with a run", () => {
    const rows: Row[] = toRows(RATIO_RESULTS).map((r) => (r.run_id === RUN("2") ? { ...r, run_id: RUN("1") } : r));
    const state = defaultState(schema, view.id, rows);
    // width 3: lookbacks 20, 30 (runs 1 and 1 after the rewrite); width 4, lookback 40 has no run
    const sel = new Set([cellKey(20, 3), cellKey(30, 3), cellKey(40, 4)]);
    const out = selectionRuns(schema, view, rows, state, sel);
    expect(out.cells).toBe(3);
    expect(out.runIds).toEqual([RUN("1")]);
    expect(out.withoutRun).toBe(1);
  });

  it("only replay cells give no run ids", () => {
    const rows = toRows(RATIO_RESULTS);
    const state = defaultState(schema, view.id, rows);
    const out = selectionRuns(schema, view, rows, state, new Set([cellKey(30, 4), cellKey(40, 4)]));
    expect(out.runIds).toEqual([]);
    expect(out.withoutRun).toBe(2);
  });

  it("includes matched comparison rows only when the comparison arm is shown", () => {
    const tschema = TRAILING_MANIFEST.result_schema;
    const tview = tschema.view.find((v) => !v.aggregate_over) ?? tschema.view[0];
    const rows = toRows(TRAILING_RESULTS).map((r) =>
      r.arm === "control_tp5r" && r.width === 3 && r.lookback === 20 ? { ...r, run_id: RUN("e") } : r,
    );
    const base = defaultState(tschema, tview.id, rows);
    const sel = new Set([cellKey(20, 3)]);
    const treatment = selectionRuns(tschema, tview, rows, { ...base, mode: "treatment" }, sel);
    const diff = selectionRuns(tschema, tview, rows, { ...base, mode: "difference" }, sel);
    expect(treatment.runIds).not.toContain(RUN("e"));
    expect(diff.runIds).toContain(RUN("e"));
  });
});

describe("Calculate rows of a selection", () => {
  const tschema = TRAILING_MANIFEST.result_schema;

  it("an aggregated cell sends one coords per addressable row, rows with a run included", () => {
    const view = tschema.view.find((v) => v.aggregate_over)!;
    const rows = toRows(TRAILING_RESULTS).map((r) => ({ ...r, be_trigger: 0 }));
    const state = defaultState(tschema, view.id, rows);
    const out = selectionRuns(tschema, view, rows, { ...state, controls: { ...state.controls, grid: "R" } }, new Set([cellKey(0.5, 6)]));
    // width 3..4 × lookback 20..30 behind the cell; the first of them has a run and is still sent
    expect(out.calcCoords).toHaveLength(4);
    expect(out.runIds).toEqual([RUN("t")]);
    expect(out.notAddressable).toBe(0);
    expect(out.calcCoords[0]).toEqual({ width: 3, lookback: 20, sl: 5, trigger: 6, distance: 0.5, be_trigger: 0, grid: "R", arm: "trailing_no_tp" });
  });

  it("a row without a value for a dimension is not addressable and not sent", () => {
    const view = tschema.view.find((v) => !v.aggregate_over)!;
    const rows = toRows(TRAILING_RESULTS); // be_trigger is empty: the optional dimension is off
    const state = defaultState(tschema, view.id, rows);
    const out = selectionRuns(tschema, view, rows, { ...state, mode: "treatment" }, new Set([cellKey(20, 3)]));
    expect(out.calcCoords).toEqual([]);
    expect(out.notAddressable).toBe(1);
  });

  it("availability: materialize present, N between 1 and the request limit", () => {
    expect(canCalculate(RATIO_MANIFEST)).toBe(false);
    expect(canCalculate({ ...RATIO_MANIFEST, materialize: {} })).toBe(true);
    expect(calculateBlocked(false, 3)).toBe(NO_MATERIALIZE_HINT);
    expect(calculateBlocked(true, 0)).not.toBeNull();
    expect(calculateBlocked(true, MAX_CALCULATE_ROWS)).toBeNull();
    expect(calculateBlocked(true, MAX_CALCULATE_ROWS + 1)).toMatch(/At most 2000 rows/);
  });

  it("plan counts come from the backend: has_run apart from other reasons", () => {
    const c = planCounts({
      calculable_count: 1,
      plan_token: "t",
      rows: [
        { position: 0, coords: {}, status: "calculable" },
        { position: 1, coords: {}, status: "skipped", reason: "has_run" },
        { position: 2, coords: {}, status: "skipped", reason: "has_run" },
        { position: 3, coords: {}, status: "skipped", reason: "row_not_found" },
      ],
    });
    expect([c.selected, c.calculable, c.hasRun]).toEqual([4, 1, 2]);
    expect([...c.other.entries()]).toEqual([["row_not_found", 1]]);
  });
});
