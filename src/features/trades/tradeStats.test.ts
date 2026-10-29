import { describe, expect, it } from "vitest";

import {
  EMPTY_FILTER,
  applyFilter,
  calendarCells,
  equityCurve,
  latestMonth,
  plannedExit,
  shortId,
  signed,
  sortForTable,
  strategyName,
  strategyNames,
  summarize,
} from "@/features/trades/tradeStats";
import { REAL_SHORT, trade, waiting } from "@/features/trades/tradeFixtures";

describe("tradeStats", () => {
  it("summarizes the real Demo short alone", () => {
    const s = summarize([REAL_SHORT]);
    expect(s.trades).toBe(1);
    expect(signed(s.net, 2)).toBe("−1,307.99");
    expect(signed(s.gross, 2)).toBe("−969.39");
    expect(s.winRatePct).toBe(0);
    expect(signed(s.averageR ?? 0, 2)).toBe("−1.38");
    expect(s.profitFactor).toBe(0);
    expect(summarize([trade("w", 50)]).profitFactor).toBeNull();
    expect(s.fees).toBeCloseTo(338.60068539, 8);
    expect(s.averageDurationMs).toBe(607591);
  });

  it("computes win rate and profit factor over complete rows only", () => {
    const s = summarize([trade("a", 200), trade("b", -100), waiting("w", 3, "abi_unavailable")]);
    expect(s.trades).toBe(2);
    expect(s.waiting).toBe(1);
    expect(s.net).toBe(100);
    expect(s.winRatePct).toBe(50);
    expect(s.profitFactor).toBe(2);
    expect(s.fees).toBe(20);
  });

  it("builds the cumulative curve from 0 in close order", () => {
    const points = equityCurve([trade("late", -50, {}, 2), trade("early", 200, {}, 0), waiting("w", 1, null)]);
    expect(points.map((p) => p.cumulative)).toEqual([0, 200, 150]);
  });

  it("puts net and count on the UTC day of the close", () => {
    const rows = [REAL_SHORT, trade("x", 100)];
    const month = latestMonth(rows);
    expect(month).toEqual({ year: 2026, month: 9 });
    const { lead, days } = calendarCells(rows, month!);
    expect(lead).toBe(3); // 2026-10-01 is a Thursday
    expect(days[24].count).toBe(2);
    expect(days[24].net).toBeCloseTo(-1207.99088539, 6);
    expect(days.filter((d) => d.count > 0)).toHaveLength(1);
  });

  it("filters by strategy, coin, status and inclusive UTC days", () => {
    const other = trade("eth", 10, { strategy_instance_id: "ema_pullback:eth00000", symbol: "ETHUSDT" }, 3);
    const rows = [REAL_SHORT, other, waiting("w", 1, null)];
    expect(applyFilter(rows, { ...EMPTY_FILTER, strategy: "ema_pullback:eth00000" })).toEqual([other]);
    expect(applyFilter(rows, { ...EMPTY_FILTER, coin: "BTCUSDT" })).toEqual([REAL_SHORT]);
    expect(applyFilter(rows, { ...EMPTY_FILTER, status: "incomplete" }).map((t) => t.trade_cycle_id)).toEqual(["w"]);
    expect(applyFilter(rows, { ...EMPTY_FILTER, fromDay: "2026-10-25", toDay: "2026-10-25" })).toEqual([REAL_SHORT]);
    expect(applyFilter(rows, { ...EMPTY_FILTER, fromDay: "2026-10-26" })).toEqual([other]);
  });

  it("sorts rows without a close time on top, then newest close first", () => {
    const rows = sortForTable([trade("old", 1, {}, 0), waiting("w", 1, null), trade("new", 1, {}, 1)]);
    expect(rows.map((t) => t.trade_cycle_id)).toEqual(["w", "new", "old"]);
  });

  it("names a strategy by its deployment file, else by a short id", () => {
    const names = strategyNames([
      {
        strategy_instance_id: REAL_SHORT.strategy_instance_id,
        strategy_id: "ema_pullback",
        instrument: "BTCUSDT.P",
        base_timeframe: "5m",
        enabled: true,
        source_path: "btc-ema200-w10.json",
      },
    ]);
    expect(strategyName(names, REAL_SHORT.strategy_instance_id)).toBe("btc-ema200-w10");
    expect(strategyName(names, "ema_pullback:abcdef0123456789")).toBe("abcdef01");
    expect(shortId("plain")).toBe("plain");
  });

  it("takes the planned exit from the close reason", () => {
    expect(plannedExit(REAL_SHORT)).toBe("80744.7");
    expect(plannedExit({ ...REAL_SHORT, close_reason: "take_profit" })).toBe("79571.3");
    expect(plannedExit({ ...REAL_SHORT, close_reason: "runtime_signal" })).toBeNull();
  });
});
