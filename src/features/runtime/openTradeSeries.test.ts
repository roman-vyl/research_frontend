import { describe, expect, it } from "vitest";
import type { Time } from "lightweight-charts";

import { OpenTradeSeriesView, splitOpenTradeRuns } from "@/features/runtime/openTradeSeries";

describe("splitOpenTradeRuns", () => {
  it("joins consecutive bars of one segment only", () => {
    const runs = splitOpenTradeRuns([
      { x: 1, logicalIndex: 1, segment: 1, value: 10 },
      { x: 2, logicalIndex: 2, segment: 1, value: 11 },
      { x: 3, logicalIndex: 3, segment: 2, value: 12 },
      { x: 5, logicalIndex: 5, segment: 2, value: 13 },
    ]);
    expect(runs.map((r) => r.map((p) => p.value))).toEqual([[10, 11], [12], [13]]);
  });

  it("a null value (no Take point) breaks the line", () => {
    const runs = splitOpenTradeRuns([
      { x: 1, logicalIndex: 1, segment: 1, value: 10 },
      { x: 2, logicalIndex: 2, segment: 1, value: null },
      { x: 3, logicalIndex: 3, segment: 1, value: 12 },
    ]);
    expect(runs.map((r) => r.map((p) => p.value))).toEqual([[10], [12]]);
  });
});

describe("OpenTradeSeriesView", () => {
  it("the price scale covers stop and take, or the stop alone", () => {
    const view = new OpenTradeSeriesView();
    expect(view.priceValueBuilder({ time: 1 as Time, segment: 1, stop: 105, take: 93 })).toEqual([93, 105, 105]);
    expect(view.priceValueBuilder({ time: 1 as Time, segment: 1, stop: 105, take: null })).toEqual([105, 105, 105]);
  });
});
