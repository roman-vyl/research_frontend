import { describe, expect, it } from "vitest";

import { RATIO_MANIFEST, RATIO_RESULTS, TRAILING_MANIFEST, TRAILING_RESULTS } from "@/features/surface/fixtures/experiments";
import { cellKey, defaultState, selectionRuns, toRows, type Row } from "@/features/surface/model";

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
