import { describe, expect, it } from "vitest";

import type { TradeRecord } from "@/api/types";
import {
  defaultClosedTradeSelection,
  findLastClosedTradeId,
  findTradeById,
  formatTradeDisplayNumber,
  getAdjacentTradeId,
  isKnownTrade,
  parseManualTradeIdInput,
  resolveTradeIdByDisplayNumber,
  tradeDisplayNumber,
  resolveSelectedTradeEntryTimeMs,
  resolveTradeEntryTimeMs,
  tradeIdsEqual,
} from "@/features/chart/tradeLookup";
import { makeTradeRecord } from "@/features/chart/testFixtures/tradeRecordFixtures";

function makeTrade(tradeId: number | string, entryTimeMs: number): TradeRecord {
  return makeTradeRecord({
    trade_id: String(tradeId),
    entry_time_ms: entryTimeMs,
    exit_time_ms: entryTimeMs + 60_000,
    exit_reason: "signal:exit",
  });
}

describe("tradeIdsEqual", () => {
  it("matches number and string ids", () => {
    expect(tradeIdsEqual(42, "42")).toBe(true);
    expect(tradeIdsEqual(42, 42)).toBe(true);
    expect(tradeIdsEqual(42, 43)).toBe(false);
  });
});

describe("isKnownTrade", () => {
  const trades = [makeTrade(1, 1_000), makeTrade(2, 2_000)];

  it("returns true when trade exists", () => {
    expect(isKnownTrade(trades, 2)).toBe(true);
  });

  it("returns false when trade is missing", () => {
    expect(isKnownTrade(trades, 99)).toBe(false);
  });
});

describe("findTradeById", () => {
  const trades = [makeTrade(1, 1_000), makeTrade("2", 2_000)];

  it("finds by numeric id", () => {
    expect(findTradeById(trades, 1)?.entry_time_ms).toBe(1_000);
  });

  it("finds by string id when record id is string", () => {
    expect(findTradeById(trades, 2)?.entry_time_ms).toBe(2_000);
    expect(findTradeById(trades, "2")?.entry_time_ms).toBe(2_000);
  });
});

describe("resolveTradeEntryTimeMs", () => {
  it("returns canonical entry_time_ms", () => {
    expect(resolveTradeEntryTimeMs(makeTrade(1, 1_710_000_000_000))).toBe(1_710_000_000_000);
  });

  it("rejects invalid entry times", () => {
    expect(resolveTradeEntryTimeMs(undefined)).toBeNull();
    expect(resolveTradeEntryTimeMs({ ...makeTrade(1, 0), entry_time_ms: 0 })).toBeNull();
    expect(
      resolveTradeEntryTimeMs({ ...makeTrade(1, 0), entry_time_ms: Number.NaN }),
    ).toBeNull();
  });
});

describe("resolveSelectedTradeEntryTimeMs", () => {
  const trades = [makeTrade(10, 5_000_000)];

  it("resolves entry for string selected id", () => {
    const { trade, entryTimeMs } = resolveSelectedTradeEntryTimeMs(trades, "10");
    expect(trade?.trade_id).toBe("10");
    expect(entryTimeMs).toBe(5_000_000);
  });
});

describe("findLastClosedTradeId", () => {
  it("returns last closed trade in report order", () => {
    const trades = [makeTrade(1, 1_000), makeTrade(2, 2_000), makeTrade(3, 3_000)];
    expect(findLastClosedTradeId(trades)).toBe("3");
  });

  it("returns null for an empty trade list", () => {
    expect(findLastClosedTradeId([])).toBeNull();
  });

  it("returns last closed string trade id without numeric normalization", () => {
    const trades = [
      makeTrade("long:100", 1_000_000),
      makeTrade("short:200", 2_000_000),
      makeTrade("short:979", 3_000_000),
    ];
    expect(findLastClosedTradeId(trades)).toBe("short:979");
  });
});

describe("defaultClosedTradeSelection", () => {
  it("includes entry bar time for last closed trade", () => {
    const trades = [makeTrade(5, 5_000_000)];
    expect(defaultClosedTradeSelection(trades)).toEqual({
      tradeId: "5",
      barTimeSec: 5_000,
    });
  });

  it("focuses last closed managed string trade id", () => {
    const trades = [makeTrade("short:979", 9_790_000)];
    expect(defaultClosedTradeSelection(trades)).toEqual({
      tradeId: "short:979",
      barTimeSec: 9_790,
    });
  });
});

describe("getAdjacentTradeId", () => {
  const trades = [makeTrade(1, 1_000), makeTrade(2, 2_000), makeTrade("3", 3_000)];

  it("returns null for empty list", () => {
    expect(getAdjacentTradeId([], 1, 1)).toBeNull();
  });

  it("returns null for unknown current id", () => {
    expect(getAdjacentTradeId(trades, 99, 1)).toBeNull();
  });

  it("returns null when navigating before first", () => {
    expect(getAdjacentTradeId(trades, 1, -1)).toBeNull();
  });

  it("returns null when navigating after last", () => {
    expect(getAdjacentTradeId(trades, 3, 1)).toBeNull();
  });

  it("returns next and previous ids in report order", () => {
    expect(getAdjacentTradeId(trades, 1, 1)).toBe("2");
    expect(getAdjacentTradeId(trades, 2, -1)).toBe("1");
    expect(getAdjacentTradeId(trades, 2, 1)).toBe("3");
  });

  it("matches string selected id to numeric record id", () => {
    expect(getAdjacentTradeId(trades, "2", -1)).toBe("1");
    expect(getAdjacentTradeId(trades, "2", 1)).toBe("3");
  });

  it("returns raw string id for adjacent string trade records", () => {
    const managedTrades = [
      makeTrade("long:10", 1_000),
      makeTrade("short:979", 2_000),
    ];
    expect(getAdjacentTradeId(managedTrades, "long:10", 1)).toBe("short:979");
  });
});

describe("tradeDisplayNumber", () => {
  const trades = [makeTrade("long:10", 1_000), makeTrade("short:979", 2_000)];

  it("maps internal id to 1-based report index", () => {
    expect(tradeDisplayNumber(trades, "long:10")).toBe(1);
    expect(tradeDisplayNumber(trades, "short:979")).toBe(2);
  });
});

describe("resolveTradeIdByDisplayNumber", () => {
  const trades = [makeTrade("long:10", 1_000), makeTrade("short:979", 2_000)];

  it("resolves display number to canonical trade_id", () => {
    expect(resolveTradeIdByDisplayNumber(trades, 1)).toBe("long:10");
    expect(resolveTradeIdByDisplayNumber(trades, 2)).toBe("short:979");
  });

  it("returns numeric id for out-of-range stale focus", () => {
    expect(resolveTradeIdByDisplayNumber(trades, 99)).toBe(99);
  });
});

describe("formatTradeDisplayNumber", () => {
  it("formats managed ids as sequential numbers", () => {
    const trades = [makeTrade("long:641890", 1_000)];
    expect(formatTradeDisplayNumber(trades, "long:641890")).toBe("1");
  });
});

describe("parseManualTradeIdInput", () => {
  it("accepts positive integer strings", () => {
    expect(parseManualTradeIdInput("259")).toBe(259);
    expect(parseManualTradeIdInput(" 12 ")).toBe(12);
  });

  it("rejects empty and non-digit input", () => {
    expect(parseManualTradeIdInput("")).toBeNull();
    expect(parseManualTradeIdInput("abc")).toBeNull();
    expect(parseManualTradeIdInput("12.5")).toBeNull();
    expect(parseManualTradeIdInput("0")).toBeNull();
  });

  it("rejects managed string ids (manual nav is numeric-only)", () => {
    expect(parseManualTradeIdInput("short:979")).toBeNull();
  });
});
