import { describe, expect, it } from "vitest";

import type { TradeRecord } from "@/api/types";
import {
  buildEntryPriceLineTitle,
  buildExitPriceLineTitle,
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
