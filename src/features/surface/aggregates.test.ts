import { describe, expect, it } from "vitest";

import { TRAILING_MANIFEST, TRAILING_RESULTS } from "@/features/surface/fixtures/experiments";
import { summaryCards } from "@/features/surface/aggregates";
import { defaultState, median, sliceRows, toRows, treatmentArms, type Condition } from "@/features/surface/model";

const T = TRAILING_MANIFEST.result_schema;
const rows = toRows(TRAILING_RESULTS);
const view = T.view.find((v) => v.id === "cells")!;

describe("summary cards", () => {
  it("are computed over the cells that pass the active filters", () => {
    const st = defaultState(T, "cells", rows);
    const sliced = sliceRows(T, view, rows, st.controls, treatmentArms(T));
    const pfs = sliced.map((r) => r.profit_factor as number).sort((a, b) => a - b);
    const cut = pfs[pfs.length - 2];
    const filter: Condition = { id: "f", metric: "profit_factor", kind: "value", op: ">=", value: cut };
    const card = (filters: Condition[], label: string) =>
      summaryCards(T, sliced, rows, { ...st, filters }, view.default_metric, "ctl").find((c) => c.label === label)?.value;
    const all = card([], "median PF");
    const passing = card([filter], "median PF");
    expect(all).toBe((median(pfs) as number).toFixed(2));
    expect(passing).toBe((median(pfs.filter((v) => v >= cut)) as number).toFixed(2));
    expect(card([filter], "cells passing filters · figures above are over these")).toBe(`2 / ${sliced.length}`);
  });
});
