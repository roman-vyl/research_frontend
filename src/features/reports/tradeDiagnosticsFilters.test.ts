import { describe, expect, it } from "vitest";

import type { TradeRecord } from "@/api/types";
import {
  DEFAULT_TRADE_DIAGNOSTICS_FILTERS,
  filterTrades,
  matchesTradeDiagnosticsFilters,
} from "@/features/reports/tradeDiagnosticsFilters";
import { makeTradeRecord } from "@/features/chart/testFixtures/tradeRecordFixtures";

function makeTrade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return makeTradeRecord({
    trade_id: "1",
    side: "long",
    entry_time_ms: 1,
    exit_time_ms: 2,
    entry_price: "100",
    exit_price: "101",
    net_pnl: "10",
    net_return_pct: "0.01",
    exit_reason: "stop_loss:atr_sl_far",
    exit_kind: "stop_loss",
    ...overrides,
  });
}

describe("tradeDiagnosticsFilters", () => {
  it("filters by direction", () => {
    const trades = [
      makeTrade({ trade_id: "1", side: "long" }),
      makeTrade({ trade_id: "2", side: "short" }),
    ];
    expect(
      filterTrades(trades, { ...DEFAULT_TRADE_DIAGNOSTICS_FILTERS, direction: "long" }),
    ).toHaveLength(1);
    expect(
      filterTrades(trades, { ...DEFAULT_TRADE_DIAGNOSTICS_FILTERS, direction: "short" }),
    ).toHaveLength(1);
  });

  it("filters by exit_reason prefix stop_loss", () => {
    const trades = [
      makeTrade({ exit_reason: "stop_loss:atr_sl_far" }),
      makeTrade({ trade_id: "2", exit_reason: "signal:rsi_exit_base", exit_kind: "signal" }),
    ];
    const filtered = filterTrades(trades, {
      ...DEFAULT_TRADE_DIAGNOSTICS_FILTERS,
      exitReason: "stop_loss",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].exit_reason).toBe("stop_loss:atr_sl_far");
  });

  it("filters winners and losers by net_pnl", () => {
    const trades = [
      makeTrade({ trade_id: "1", net_pnl: "50" }),
      makeTrade({ trade_id: "2", net_pnl: "-10" }),
    ];
    expect(
      filterTrades(trades, { ...DEFAULT_TRADE_DIAGNOSTICS_FILTERS, outcome: "winners" }),
    ).toHaveLength(1);
    expect(
      filterTrades(trades, { ...DEFAULT_TRADE_DIAGNOSTICS_FILTERS, outcome: "losers" }),
    ).toHaveLength(1);
  });

  it("matches exit_kind with exact stop_loss string", () => {
    const trade = makeTrade({ exit_kind: "stop_loss" });
    expect(
      matchesTradeDiagnosticsFilters(trade, {
        ...DEFAULT_TRADE_DIAGNOSTICS_FILTERS,
        exitKind: "stop_loss",
      }),
    ).toBe(true);
    expect(
      matchesTradeDiagnosticsFilters(trade, {
        ...DEFAULT_TRADE_DIAGNOSTICS_FILTERS,
        exitKind: "stop",
      }),
    ).toBe(false);
  });
});
