import { describe, expect, it } from "vitest";

import type { JournalEvent } from "@/api/journal";
import type { ChartBar } from "@/api/types";
import { buildTradeCycles, closeLabel, closePosition } from "@/features/runtime/runtimeTradeCycles";

const TF = 300;
// 2026-10-18 21:55Z, the bar of the SOL apply; candles run to 02:10Z.
const T0 = Date.UTC(2026, 9, 18, 21, 55) / 1000;
const at = (hh: number, mm: number) => Date.UTC(2026, 9, hh < 12 ? 19 : 18, hh, mm) / 1000;

function candles(n: number): ChartBar[] {
  return Array.from({ length: n }, (_, i) => ({ time: T0 + i * TF, open: 1, high: 2, low: 0, close: 1 }));
}
function ev(type: string, time: number, id: string, payload: Record<string, unknown>, occurred = "2026-10-18T22:00:00Z"): JournalEvent {
  return { event_id: id, event_type: type, occurred_at: occurred, bar_open_time_ms: time * 1000, body: { payload } };
}
const CYCLE = "e8fc6911-7268-4e60-9438-643c8b6e0769";
const applied = (time: number, id: string, p: Record<string, unknown> = {}, occurred?: string) =>
  ev("entry_package_applied", time, id, { trade_cycle_id: CYCLE, trigger_price: "103.30", stop_loss: "105.15", take_profit: "93.11", ...p }, occurred);
const opened = (time: number, id: string, p: Record<string, unknown> = {}) =>
  ev("trade_cycle_opened", time, id, { trade_cycle_id: CYCLE, average_entry_price: "103.32", first_fill_at_ms: 1792360911112, ...p });
const closed = (time: number, id: string, p: Record<string, unknown> = {}) =>
  ev("trade_cycle_closed", time, id, { trade_cycle_id: CYCLE, reason: "stop_loss", ...p });

const WINDOW = candles(52); // 21:55Z .. 02:10Z

describe("buildTradeCycles", () => {
  it("SOL short: down arrow at the fill, SL above the close candle, period with stop and take", () => {
    const out = buildTradeCycles(WINDOW, [opened(at(22, 0), "o"), closed(at(2, 5), "c")], [applied(at(21, 55), "a")]);
    expect(out.opens).toEqual([{ time: at(22, 0), price: 103.32, side: "short" }]);
    expect(out.closes).toEqual([{ time: at(2, 5), reason: "stop_loss", side: "short" }]);
    expect(closePosition(out.closes[0]!)).toBe("aboveBar");
    expect(closeLabel("stop_loss")).toBe("SL");
    expect(out.periods).toEqual([{ fromTime: at(22, 0), toTime: at(2, 5), entry: 103.32, stop: 105.15, take: 93.11 }]);
    expect(out).toMatchObject({ openedCount: 1, closedCount: 1, closedStopLoss: 1, closedTakeProfit: 0, closedOther: 0, unreadableCount: 0 });
  });

  it("long closed by take: TP above the candle", () => {
    const out = buildTradeCycles(
      WINDOW,
      [opened(at(22, 0), "o", { average_entry_price: "100" }), closed(at(23, 0), "c", { reason: "take_profit" })],
      [applied(at(21, 55), "a", { trigger_price: "100", stop_loss: "99", take_profit: "105" })],
    );
    expect(out.opens[0]!.side).toBe("long");
    expect(closePosition(out.closes[0]!)).toBe("aboveBar");
    expect(closeLabel("take_profit")).toBe("TP");
    expect(out.closedTakeProfit).toBe(1);
  });

  it("long stop and short take go below the candle; other reasons keep their text", () => {
    expect(closePosition({ time: 0, reason: "stop_loss", side: "long" })).toBe("belowBar");
    expect(closePosition({ time: 0, reason: "take_profit", side: "short" })).toBe("belowBar");
    expect(closePosition({ time: 0, reason: "runtime_signal", side: null })).toBe("aboveBar");
    expect(closeLabel("runtime_signal")).toBe("runtime_signal");
  });

  it("side comes from the cycle's last applied order", () => {
    const out = buildTradeCycles(
      WINDOW,
      [opened(at(22, 0), "o")],
      [
        applied(at(21, 55), "a1", { stop_loss: "99" }, "2026-10-18T21:55:10Z"),
        applied(at(21, 55), "a2", {}, "2026-10-18T21:55:20Z"),
      ],
    );
    expect(out.opens[0]!.side).toBe("short");
  });

  it("an open position runs to the last candle", () => {
    const out = buildTradeCycles(WINDOW, [opened(at(22, 0), "o")], [applied(at(21, 55), "a")]);
    expect(out.periods[0]!.toTime).toBe(WINDOW[WINDOW.length - 1]!.time);
  });

  it("a close without its open in the window draws only the label", () => {
    const out = buildTradeCycles(WINDOW, [closed(at(2, 5), "c")], []);
    expect(out.opens).toEqual([]);
    expect(out.periods).toEqual([]);
    expect(out.closes).toEqual([{ time: at(2, 5), reason: "stop_loss", side: null }]);
  });

  it.each([
    [{ trigger_price: null }],
    [{ stop_loss: "103.30" }],
    [{ trade_cycle_id: "other" }],
  ])("unknown side without a readable applied order: %j", (p) => {
    const out = buildTradeCycles(WINDOW, [opened(at(22, 0), "o"), closed(at(2, 5), "c")], [applied(at(21, 55), "a", p)]);
    expect(out.opens[0]!.side).toBeNull();
    expect(closePosition(out.closes[0]!)).toBe("aboveBar");
  });

  it.each([
    [opened(at(22, 0), "o", { average_entry_price: "abc" })],
    [opened(at(22, 0), "o", { trade_cycle_id: null })],
    [closed(at(2, 5), "c", { reason: "" })],
    [closed(at(2, 5), "c", { trade_cycle_id: 7 })],
  ])("an unreadable cycle event draws nothing and is counted", (event) => {
    const out = buildTradeCycles(WINDOW, [event], [applied(at(21, 55), "a")]);
    expect(out.opens).toEqual([]);
    expect(out.closes).toEqual([]);
    expect(out.periods).toEqual([]);
    expect(out.unreadableCount).toBe(1);
  });

  it("ignores events outside the window and other types", () => {
    const out = buildTradeCycles(
      candles(3),
      [opened(at(22, 0) + 100 * TF, "o"), closed(T0 - TF, "c"), ev("live_entry_evaluated", T0, "x", {})],
      [],
    );
    expect(out).toMatchObject({ opens: [], closes: [], openedCount: 0, closedCount: 0, unreadableCount: 0 });
  });

  it("a period ends at the first close at or after its fill", () => {
    const out = buildTradeCycles(
      WINDOW,
      [closed(at(21, 55), "c0"), opened(at(22, 0), "o"), closed(at(23, 0), "c1"), closed(at(23, 30), "c2")],
      [applied(at(21, 55), "a")],
    );
    expect(out.periods[0]!.toTime).toBe(at(23, 0));
    expect(out.closedCount).toBe(3);
  });
});
