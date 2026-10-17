import { describe, expect, it } from "vitest";

import type { JournalEvent } from "@/api/journal";
import type { ChartBar } from "@/api/types";
import { buildAppliedOrders } from "@/features/runtime/runtimeAppliedOrders";

const TF = 300;
const T0 = 1_760_000_000;

function candles(n: number): ChartBar[] {
  return Array.from({ length: n }, (_, i) => ({ time: T0 + i * TF, open: 1, high: 2, low: 0, close: 1 }));
}
function applied(i: number, id: string, values: Record<string, unknown> = {}): JournalEvent {
  return {
    event_id: id,
    event_type: "entry_package_applied",
    occurred_at: "2026-10-17T12:00:30Z",
    bar_open_time_ms: (T0 + i * TF) * 1000,
    body: {
      payload: {
        trade_cycle_id: `c-${id}`,
        trigger_price: "100.5",
        stop_loss: "99",
        take_profit: "103.25",
        quantity: "0.01",
        order_link_id: "link",
        order_id: "oid",
        ...values,
      },
    },
  };
}

describe("buildAppliedOrders", () => {
  it("draws the three prices on the bar of the record", () => {
    const out = buildAppliedOrders(candles(3), [applied(1, "a")]);
    expect(out.bars).toEqual([{ time: T0 + TF, rings: [{ entry: 100.5, stop: 99, take: 103.25 }] }]);
    expect(out.appliedCount).toBe(1);
    expect(out.unreadableCount).toBe(0);
  });

  it("a null price draws no ring for that price", () => {
    const out = buildAppliedOrders(candles(1), [applied(0, "a", { stop_loss: null, take_profit: null })]);
    expect(out.bars[0]!.rings).toEqual([{ entry: 100.5, stop: null, take: null }]);
  });

  it("keeps every record of one bar and counts all of them", () => {
    const out = buildAppliedOrders(candles(1), [applied(0, "a"), applied(0, "b", { trigger_price: "101" })]);
    expect(out.bars).toHaveLength(1);
    expect(out.bars[0]!.rings.map((r) => r.entry)).toEqual([100.5, 101]);
    expect(out.appliedCount).toBe(2);
  });

  it.each([
    [{ trigger_price: "abc" }],
    [{ stop_loss: 99 }],
    [{ take_profit: undefined }],
    [{ trigger_price: null, stop_loss: null, take_profit: null }],
  ])("counts an unreadable record and draws nothing: %j", (values) => {
    const out = buildAppliedOrders(candles(1), [applied(0, "a", values)]);
    expect(out.bars).toEqual([]);
    expect(out.appliedCount).toBe(1);
    expect(out.unreadableCount).toBe(1);
  });

  it("ignores records on bars outside the window", () => {
    const out = buildAppliedOrders(candles(2), [applied(5, "a"), applied(-1, "b")]);
    expect(out).toEqual({ bars: [], appliedCount: 0, unreadableCount: 0 });
  });

  it("returns bars in candle order", () => {
    const out = buildAppliedOrders(candles(3), [applied(2, "a"), applied(0, "b")]);
    expect(out.bars.map((b) => b.time)).toEqual([T0, T0 + 2 * TF]);
  });
});
