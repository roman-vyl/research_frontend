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
/** Per candle bar: the projected value of a line at that bar, or undefined where there is no point. */
function perBar(p: ReturnType<typeof buildProjection>, line: "entry" | "stop" | "take", n: number): (number | undefined)[] {
  const byTime = new Map(p.points.map((x) => [x.time, x[line]]));
  return Array.from({ length: n }, (_, i) => byTime.get(T0 + i * TF));
}
/** Lengths of the runs of consecutive bars among the points. */
function runLengths(p: ReturnType<typeof buildProjection>): number[] {
  const lengths: number[] = [];
  let prev: number | null = null;
  for (const x of p.points) {
    if (prev !== null && x.time === prev + TF) lengths[lengths.length - 1]! += 1;
    else lengths.push(1);
    prev = x.time;
  }
  return lengths;
}

describe("buildProjection", () => {
  it("draws 3 and 12 consecutive signals as 3 and 12 points per line", () => {
    for (const n of [3, 12]) {
      const p = buildProjection(candles(n), Array.from({ length: n }, (_, i) => ev(i, desired())), known);
      expect(runLengths(p)).toEqual([n]);
      expect(p.points).toHaveLength(n);
      expect(p.signalCount).toBe(n);
    }
  });

  it("reads entry, stop and take from the matching fields as numbers", () => {
    const p = buildProjection(candles(1), [ev(0, desired("100.5", "99", "103.25"))], known);
    expect(p.points).toEqual([{ time: T0, entry: 100.5, stop: 99, take: 103.25 }]);
  });

  it("null breaks all three lines and is not a missing record", () => {
    const p = buildProjection(candles(5), [0, 1, 2].map((i) => ev(i, desired())).concat(ev(3, null), ev(4, desired())), known);
    for (const [line, v] of [["entry", 100], ["stop", 90], ["take", 120]] as const) {
      expect(perBar(p, line, 5)).toEqual([v, v, v, undefined, v]);
    }
    expect(runLengths(p)).toEqual([3, 1]);
    expect(p.noEvaluationTimes).toEqual([]);
  });

  it("a bar without an event inside the known history is listed and breaks the lines", () => {
    const p = buildProjection(candles(4), [ev(0, desired()), ev(1, desired()), ev(3, desired())], known);
    expect(perBar(p, "entry", 4)).toEqual([100, 100, undefined, 100]);
    expect(p.noEvaluationTimes).toEqual([T0 + 2 * TF]);
  });

  it("bars before the first known evaluation stay empty; later gaps are listed even when the window's first event is late", () => {
    const p = buildProjection(candles(5), [ev(3, desired()), ev(4, desired())], known + 1 * TF * 1000);
    expect(p.noEvaluationTimes).toEqual([T0 + 1 * TF, T0 + 2 * TF]);
    expect(perBar(p, "entry", 5)).toEqual([undefined, undefined, undefined, 100, 100]);
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
    expect(perBar(p, "entry", 3)).toEqual([100, undefined, undefined]);
  });

  it("uses the latest occurred_at for a bar evaluated twice, ties by event_id", () => {
    const early = ev(0, desired("100"), "2026-10-17T12:00:00Z", "a");
    const lateNull = ev(0, null, "2026-10-17T12:01:00Z", "b");
    expect(perBar(buildProjection(candles(1), [early, lateNull], known), "entry", 1)).toEqual([undefined]);
    const t1 = ev(0, desired("101"), "2026-10-17T12:00:00Z", "a");
    const t2 = ev(0, desired("102"), "2026-10-17T12:00:00Z", "b");
    expect(perBar(buildProjection(candles(1), [t2, t1], known), "entry", 1)).toEqual([102]);
  });

  it("keeps a single isolated signal", () => {
    const p = buildProjection(candles(3), [ev(0, null), ev(1, desired()), ev(2, null)], known);
    expect(perBar(p, "entry", 3)).toEqual([undefined, 100, undefined]);
  });

  it("splits runs of consecutive signals so two runs are never one line", () => {
    const p = buildProjection(candles(7), [0, 1, 3, 5, 6].map((i) => ev(i, desired())).concat(ev(2, null), ev(4, null)), known);
    expect(runLengths(p)).toEqual([2, 1, 2]);
  });
});
