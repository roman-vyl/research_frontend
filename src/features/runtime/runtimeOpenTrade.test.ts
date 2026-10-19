import { describe, expect, it } from "vitest";

import type { JournalEvent } from "@/api/journal";
import type { ChartBar } from "@/api/types";
import { buildAppliedProtection, buildOpenTradeProjection } from "@/features/runtime/runtimeOpenTrade";

const TF = 300;
const T0 = Date.UTC(2026, 9, 19, 10, 0) / 1000;
const t = (i: number) => T0 + i * TF;

function candles(n: number): ChartBar[] {
  return Array.from({ length: n }, (_, i) => ({ time: t(i), open: 1, high: 2, low: 0, close: 1 }));
}
function ev(type: string, i: number, id: string, payload: Record<string, unknown>, occurred = "2026-10-19T10:00:50Z"): JournalEvent {
  return { event_id: id, event_type: type, occurred_at: occurred, bar_open_time_ms: t(i) * 1000, body: { payload } };
}
const open = (i: number, id: string, p: Record<string, unknown> = {}, occurred?: string) =>
  ev(
    "open_trade_evaluated",
    i,
    id,
    {
      trade_cycle_id: "A",
      side: "short",
      desired_protection: { stop_price: "105.150", take_price: "93.11" },
      close_signal: { active: false, reason: null, component_id: null, layer: null },
      ...p,
    },
    occurred,
  );
const prot = (i: number, id: string, confirmedTake: unknown = "93.11", p: Record<string, unknown> = {}) =>
  ev("protection_applied", i, id, {
    trade_cycle_id: "A",
    requested_protection: { stop_price: "105.15", take_price: confirmedTake },
    confirmed_protection: { stop_price: "105.15", take_price: confirmedTake },
    position_quantity: "1.5",
    stop_order: { order_id: "s", trigger_price: "105.2" },
    take_order: { order_id: "t", trigger_price: confirmedTake === null ? "155.0" : "93.1" },
    ...p,
  });

describe("buildOpenTradeProjection", () => {
  it("reads Engine's text by value, one point per bar, one segment for consecutive bars of a trade", () => {
    const out = buildOpenTradeProjection(candles(4), [open(1, "a"), open(2, "b")]);
    expect(out.points).toEqual([
      { time: t(1), segment: 1, stop: 105.15, take: 93.11 },
      { time: t(2), segment: 1, stop: 105.15, take: 93.11 },
    ]);
    expect(out).toMatchObject({ barCount: 2, unreadableCount: 0, closeTimes: [] });
  });

  it("one event per bar: latest occurred_at, then greater event_id", () => {
    const out = buildOpenTradeProjection(candles(2), [
      open(0, "b", { desired_protection: { stop_price: "101", take_price: null } }, "2026-10-19T10:00:51Z"),
      open(0, "a", { desired_protection: { stop_price: "102", take_price: null } }, "2026-10-19T10:00:52Z"),
      open(1, "a", { desired_protection: { stop_price: "103", take_price: null } }),
      open(1, "b", { desired_protection: { stop_price: "104", take_price: null } }),
    ]);
    expect(out.points.map((p) => p.stop)).toEqual([102, 104]);
    expect(out.barCount).toBe(2);
  });

  it("a null take gives no Take point", () => {
    const out = buildOpenTradeProjection(candles(1), [open(0, "a", { desired_protection: { stop_price: "105", take_price: null } })]);
    expect(out.points).toEqual([{ time: t(0), segment: 1, stop: 105, take: null }]);
    expect(out.unreadableCount).toBe(0);
  });

  it("lines break between bars without events", () => {
    const out = buildOpenTradeProjection(candles(4), [open(0, "a"), open(2, "b")]);
    expect(out.points.map((p) => p.segment)).toEqual([1, 2]);
  });

  it("lines break on a trade_cycle_id change on adjacent bars; the id is not in the output", () => {
    const out = buildOpenTradeProjection(candles(3), [open(0, "a"), open(1, "b", { trade_cycle_id: "B" }), open(2, "c", { trade_cycle_id: "B" })]);
    expect(out.points.map((p) => p.segment)).toEqual([1, 2, 2]);
    expect(JSON.stringify(out)).not.toContain('"B"');
  });

  it("an active close signal marks its candle", () => {
    const out = buildOpenTradeProjection(candles(2), [open(0, "a"), open(1, "b", { close_signal: { active: true, reason: "r", component_id: "c", layer: "l" } })]);
    expect(out.closeTimes).toEqual([t(1)]);
    expect(out.points).toHaveLength(2);
  });

  it("the close marker is kept when the stop is unreadable or missing; the event is unreadable", () => {
    const out = buildOpenTradeProjection(candles(2), [
      open(0, "a", { desired_protection: { stop_price: "abc", take_price: null }, close_signal: { active: true } }),
      open(1, "b", { desired_protection: undefined, close_signal: { active: true } }),
    ]);
    expect(out.closeTimes).toEqual([t(0), t(1)]);
    expect(out.points).toEqual([]);
    expect(out.unreadableCount).toBe(2);
  });

  it("a non-boolean close_signal.active is unreadable but its levels are drawn", () => {
    const out = buildOpenTradeProjection(candles(1), [open(0, "a", { close_signal: { active: "yes" } })]);
    expect(out.closeTimes).toEqual([]);
    expect(out.points).toHaveLength(1);
    expect(out.unreadableCount).toBe(1);
  });

  it("a non-decimal take is unreadable", () => {
    const out = buildOpenTradeProjection(candles(1), [open(0, "a", { desired_protection: { stop_price: "105", take_price: 93 } })]);
    expect(out.points).toEqual([]);
    expect(out.unreadableCount).toBe(1);
  });

  it("events outside the window are ignored", () => {
    const out = buildOpenTradeProjection(candles(1), [open(5, "a")]);
    expect(out).toMatchObject({ points: [], barCount: 0 });
  });
});

describe("buildAppliedProtection", () => {
  it("Stop and Take rings at the order trigger prices; every record counts", () => {
    const out = buildAppliedProtection(candles(2), [prot(1, "a"), prot(1, "b")]);
    expect(out.bars).toEqual([
      { time: t(1), rings: [{ entry: null, stop: 105.2, take: 93.1 }, { entry: null, stop: 105.2, take: 93.1 }] },
    ]);
    expect(out).toMatchObject({ appliedCount: 2, technicalTakeCount: 0, unreadableCount: 0 });
  });

  it("a technical take is not drawn and is counted", () => {
    const out = buildAppliedProtection(candles(1), [prot(0, "a", null)]);
    expect(out.bars).toEqual([{ time: t(0), rings: [{ entry: null, stop: 105.2, take: null }] }]);
    expect(out.technicalTakeCount).toBe(1);
  });

  it("an unreadable record draws nothing and is counted", () => {
    const out = buildAppliedProtection(candles(1), [
      prot(0, "a", "93.11", { stop_order: { order_id: "s", trigger_price: 105 } }),
      prot(0, "b", "93.11", { take_order: null }),
    ]);
    expect(out.bars).toEqual([]);
    expect(out).toMatchObject({ appliedCount: 2, unreadableCount: 2 });
  });

  it("records outside the window are neither drawn nor counted", () => {
    const out = buildAppliedProtection(candles(1), [prot(3, "a")]);
    expect(out).toMatchObject({ bars: [], appliedCount: 0 });
  });
});
