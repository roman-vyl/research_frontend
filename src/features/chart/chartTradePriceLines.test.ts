import { describe, expect, it } from "vitest";

import type { TradeRecord } from "@/api/types";
import {
  buildEntryPriceLineTitle,
  buildExitPriceLineTitle,
  buildTradeExitSegment,
  buildTradePriceLineSpecs,
} from "@/features/chart/chartTradePriceLines";
import { makeTradeRecord } from "@/features/chart/testFixtures/tradeRecordFixtures";

const closedLong: TradeRecord = makeTradeRecord({
  trade_id: "trade:position-7:1",
  side: "long",
  entry_time_ms: 1,
  exit_time_ms: 2,
  entry_price: "100",
  exit_price: "105",
  exit_reason: "stop_loss:atr_sl",
  exit_kind: "stop_loss",
  net_pnl: "5",
});

describe("buildTradePriceLineSpecs", () => {
  it("builds entry and exit lines for a closed trade", () => {
    const specs = buildTradePriceLineSpecs(closedLong);
    expect(specs).toHaveLength(2);
    expect(specs[0].kind).toBe("entry");
    expect(specs[0].options.price).toBe(100);
    expect(specs[1].kind).toBe("exit");
    expect(specs[1].options.price).toBe(105);
  });
});

describe("price line titles", () => {
  it("formats entry and exit labels", () => {
    expect(buildEntryPriceLineTitle(closedLong)).toBe(`Entry #${closedLong.trade_id}`);
    expect(buildExitPriceLineTitle(closedLong)).toBe(`Exit #${closedLong.trade_id} · stop_loss`);
  });
});

describe("buildTradeExitSegment", () => {
  it("spans from the entry bar to the exit bar at the exit price", () => {
    const trade = makeTradeRecord({
      ...closedLong,
      entry_time_ms: 60_000,
      exit_time_ms: 180_000,
    });
    const segment = buildTradeExitSegment(trade);
    expect(segment.points).toEqual([
      { timeSec: 60, price: 105 },
      { timeSec: 180, price: 105 },
    ]);
    expect(segment.title).toBe(`Exit #${trade.trade_id} · stop_loss`);
  });

  it("collapses to one point when entry and exit share a bar", () => {
    const trade = makeTradeRecord({ ...closedLong, entry_time_ms: 60_000, exit_time_ms: 60_000 });
    expect(buildTradeExitSegment(trade).points).toHaveLength(1);
  });
});
