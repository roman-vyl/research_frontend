import { describe, expect, it } from "vitest";

import type { TradeCycles } from "@/features/runtime/runtimeTradeCycles";
import { tradeCycleData, TradeCycleSeriesView } from "@/features/runtime/tradeCycleSeries";

const base: TradeCycles = {
  opens: [],
  closes: [],
  periods: [],
  openedCount: 0,
  closedCount: 0,
  closedStopLoss: 0,
  closedTakeProfit: 0,
  closedOther: 0,
  unreadableCount: 0,
};

describe("tradeCycleData", () => {
  it("one datum per candle with an arrow or inside a period", () => {
    const cycles: TradeCycles = {
      ...base,
      opens: [{ time: 20, price: 103.32, side: "short" }],
      periods: [{ fromTime: 20, toTime: 30, entry: 103.32, stop: 105.15, take: null }],
    };
    const data = tradeCycleData([10, 20, 25, 30, 40], cycles);
    expect(data.map((d) => d.time)).toEqual([20, 25, 30]);
    expect(data[0]!.arrows).toEqual([{ price: 103.32, side: "short" }]);
    expect(data[1]!.arrows).toEqual([]);
    expect(data[2]!.levels).toEqual([{ period: 0, entry: 103.32, stop: 105.15, take: null }]);
  });

  it("the price scale covers the arrow, entry, stop and take", () => {
    const view = new TradeCycleSeriesView();
    const [datum] = tradeCycleData([20], {
      ...base,
      opens: [{ time: 20, price: 103.32, side: null }],
      periods: [{ fromTime: 20, toTime: 20, entry: 103.32, stop: 105.15, take: 93.11 }],
    });
    expect(view.priceValueBuilder(datum!)).toEqual([93.11, 105.15, 103.32]);
  });
});
