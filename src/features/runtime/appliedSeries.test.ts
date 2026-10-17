import { describe, expect, it } from "vitest";

import { AppliedSeriesView, ringPrices } from "@/features/runtime/appliedSeries";

describe("applied series", () => {
  it("takes every non-null price of every ring of a bar", () => {
    expect(ringPrices([{ entry: 100, stop: null, take: 103 }, { entry: 101, stop: 99, take: null }])).toEqual([100, 103, 101, 99]);
  });

  it("keeps the price scale covering all rings of a bar", () => {
    const view = new AppliedSeriesView();
    const row = { time: 1 as never, rings: [{ entry: 100, stop: 98, take: null }, { entry: 101, stop: null, take: 104 }] };
    expect(view.priceValueBuilder(row)).toEqual([98, 104, 100]);
  });
});
