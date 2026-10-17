import { describe, expect, it } from "vitest";

import { splitRuns, type ProjectionBar } from "@/features/runtime/projectionSeries";

const bar = (logicalIndex: number): ProjectionBar => ({ x: logicalIndex * 6, logicalIndex, entry: 1, stop: 0, take: 2 });

describe("splitRuns", () => {
  it("keeps consecutive time-scale positions in one run", () => {
    expect(splitRuns([10, 11, 12].map(bar)).map((r) => r.length)).toEqual([3]);
  });

  it("starts a new run at every jump of the logical index, one-bar runs included", () => {
    expect(splitRuns([1, 2, 4, 7, 8, 9, 20].map(bar)).map((r) => r.map((b) => b.logicalIndex))).toEqual([
      [1, 2],
      [4],
      [7, 8, 9],
      [20],
    ]);
  });

  it("returns nothing for no bars", () => {
    expect(splitRuns([])).toEqual([]);
  });
});
