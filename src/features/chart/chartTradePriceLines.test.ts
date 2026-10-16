import { describe, expect, it } from "vitest";

import type { TradeRecord } from "@/api/types";
import {
  buildEntryPriceLineTitle,
  buildExitPriceLineTitle,
  buildTradeExitLineSegment,
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
  it("builds only the entry price line for a closed trade", () => {
    const specs = buildTradePriceLineSpecs(closedLong);
    expect(specs).toHaveLength(1);
    expect(specs[0].kind).toBe("entry");
    expect(specs[0].options.price).toBe(100);
  });
});

describe("buildTradeExitLineSegment", () => {
  it("spans from the entry to the exit, never before the entry", () => {
    const trade = makeTradeRecord({ ...closedLong, entry_time_ms: 600_000, exit_time_ms: 1_200_000 });
    const segment = buildTradeExitLineSegment(trade, 300_000);
    expect(segment).toMatchObject({ fromTimeSec: 600, toTimeSec: 1200, price: 105, color: "#fbbf24" });
  });

  it("stretches a same-bar trade to one chart bar", () => {
    const trade = makeTradeRecord({ ...closedLong, entry_time_ms: 600_000, exit_time_ms: 600_000 });
    expect(buildTradeExitLineSegment(trade, 300_000)).toMatchObject({ fromTimeSec: 600, toTimeSec: 900 });
  });
});

describe("price line titles", () => {
  it("formats entry and exit labels", () => {
    expect(buildEntryPriceLineTitle(closedLong)).toBe(`Entry #${closedLong.trade_id}`);
    expect(buildExitPriceLineTitle(closedLong)).toBe(`Exit #${closedLong.trade_id} · stop_loss`);
  });
});
