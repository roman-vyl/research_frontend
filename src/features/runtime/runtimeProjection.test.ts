import { describe, expect, it } from "vitest";

import type { JournalEvent } from "@/api/journal";
import type { ChartBar } from "@/api/types";
import { buildProjection } from "@/features/runtime/runtimeProjection";

const TF = 300;
const T0 = 1_760_000_000;

function candles(n: number): ChartBar[] {
  return Array.from({ length: n }, (_, i) => ({ time: T0 + i * TF, open: 1, high: 2, low: 0, close: 1 }));
}
const desired = (entry = "100", stop = "90", take = "120") => ({
  side: "long",
  planned_entry_price: entry,
  initial_stop_price: stop,
  initial_take_price: take,
});
function ev(i: number, de: unknown, occurred = "2026-10-17T12:00:00Z", id = `e${i}`): JournalEvent {
  return { event_id: id, occurred_at: occurred, bar_open_time_ms: (T0 + i * TF) * 1000, body: { payload: { desired_entry: de } } };
}
const known = T0 * 1000;
const values = (line: { value?: number }[]) => line.map((p) => p.value);

describe("buildProjection", () => {
  it("draws 3 and 12 consecutive signals as 3 and 12 points per line", () => {
    for (const n of [3, 12]) {
      const p = buildProjection(candles(n), Array.from({ length: n }, (_, i) => ev(i, desired())), known);
      for (const line of [p.entry, p.stop, p.take]) expect(line.filter((x) => x.value !== undefined)).toHaveLength(n);
      expect(p.signalCount).toBe(n);
    }
  });

  it("reads entry, stop and take from the matching fields as numbers", () => {
    const p = buildProjection(candles(1), [ev(0, desired("100.5", "99", "103.25"))], known);
    expect([p.entry[0]!.value, p.stop[0]!.value, p.take[0]!.value]).toEqual([100.5, 99, 103.25]);
  });

  it("null breaks all three lines and is not a missing record", () => {
    const p = buildProjection(candles(5), [0, 1, 2].map((i) => ev(i, desired())).concat(ev(3, null), ev(4, desired())), known);
    for (const [line, v] of [[p.entry, 100], [p.stop, 90], [p.take, 120]] as const) {
      expect(values(line)).toEqual([v, v, v, undefined, v]);
    }
    expect(p.noEvaluationTimes).toEqual([]);
  });

  it("a bar without an event inside the known history is listed and breaks the lines", () => {
    const p = buildProjection(candles(4), [ev(0, desired()), ev(1, desired()), ev(3, desired())], known);
    expect(values(p.entry)).toEqual([100, 100, undefined, 100]);
    expect(p.noEvaluationTimes).toEqual([T0 + 2 * TF]);
  });

  it("bars before the first known evaluation stay empty; later gaps are listed even when the window's first event is late", () => {
    const p = buildProjection(candles(5), [ev(3, desired()), ev(4, desired())], known + 1 * TF * 1000);
    expect(p.noEvaluationTimes).toEqual([T0 + 1 * TF, T0 + 2 * TF]);
    expect(values(p.entry)).toEqual([undefined, undefined, undefined, 100, 100]);
  });

  it("without a known history nothing is marked", () => {
    const p = buildProjection(candles(3), [], null);
    expect(p.noEvaluationTimes).toEqual([]);
    expect(p.signalCount).toBe(0);
  });

  it("counts unreadable events and breaks the lines", () => {
    const bad = { side: "long", planned_entry_price: "100", initial_stop_price: "90" };
    const p = buildProjection(candles(3), [ev(0, desired()), ev(1, bad), ev(2, "x")], known);
    expect(p.unreadableCount).toBe(2);
    expect(values(p.entry)).toEqual([100, undefined, undefined]);
  });

  it("uses the latest occurred_at for a bar evaluated twice, ties by event_id", () => {
    const early = ev(0, desired("100"), "2026-10-17T12:00:00Z", "a");
    const lateNull = ev(0, null, "2026-10-17T12:01:00Z", "b");
    expect(values(buildProjection(candles(1), [early, lateNull], known).entry)).toEqual([undefined]);
    const t1 = ev(0, desired("101"), "2026-10-17T12:00:00Z", "a");
    const t2 = ev(0, desired("102"), "2026-10-17T12:00:00Z", "b");
    expect(values(buildProjection(candles(1), [t2, t1], known).entry)).toEqual([102]);
  });

  it("keeps a single isolated signal", () => {
    const p = buildProjection(candles(3), [ev(0, null), ev(1, desired()), ev(2, null)], known);
    expect(values(p.entry)).toEqual([undefined, 100, undefined]);
  });

  it("flags the last point of every run so two runs are never joined", () => {
    const p = buildProjection(candles(7), [0, 1, 3, 5, 6].map((i) => ev(i, desired())).concat(ev(2, null), ev(4, null)), known);
    expect(p.entry.map((x) => x.breakAfter === true)).toEqual([false, true, false, true, false, false, true]);
    expect(p.stop.map((x) => x.breakAfter === true)).toEqual([false, true, false, true, false, false, true]);
  });
});
