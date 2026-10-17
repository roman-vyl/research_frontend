import type { JournalEvent } from "@/api/journal";
import type { ChartBar } from "@/api/types";

export type LinePoint = { time: number; value?: number; breakAfter?: boolean };

export type Projection = {
  entry: LinePoint[];
  stop: LinePoint[];
  take: LinePoint[];
  /** Bar times (unix seconds) at or after the known history that have no journal event. */
  noEvaluationTimes: number[];
  /** Events whose `desired_entry` is neither `null` nor a three-price object. */
  unreadableCount: number;
  signalCount: number;
};

type BarState =
  | { kind: "signal"; entry: number; stop: number; take: number }
  | { kind: "no_signal" }
  | { kind: "unreadable" };

function price(value: unknown): number | null {
  if (typeof value !== "string" || !/^-?\d+(\.\d+)?$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readState(event: JournalEvent): BarState {
  const desired = event.body?.payload?.desired_entry;
  if (desired === null) return { kind: "no_signal" };
  if (typeof desired === "object" && desired !== undefined && !Array.isArray(desired)) {
    const d = desired as Record<string, unknown>;
    const entry = price(d.planned_entry_price);
    const stop = price(d.initial_stop_price);
    const take = price(d.initial_take_price);
    if (entry !== null && stop !== null && take !== null) return { kind: "signal", entry, stop, take };
  }
  return { kind: "unreadable" };
}

/** The evaluation that counts for a bar: latest `occurred_at`, equal times resolved by the greater `event_id`. */
function later(a: JournalEvent, b: JournalEvent): JournalEvent {
  if (a.occurred_at !== b.occurred_at) return a.occurred_at > b.occurred_at ? a : b;
  return a.event_id >= b.event_id ? a : b;
}

/**
 * One datum per candle bar for each line: a value for a signal, an empty datum for every other
 * state. The chart library joins points across empty data, so the last point of each run of
 * signals is flagged `breakAfter` and the chart hides the segment leaving it.
 *
 * - signal: three prices;
 * - no signal (`desired_entry = null`): evaluated, line broken;
 * - no evaluation recorded: the bar is at or after `firstKnownBarMs` (the strategy's
 *   `first_bar_open_time_ms` in the Journal) and has no event: line broken, bar listed;
 * - before known history (or `firstKnownBarMs` is null: the Journal knows no evaluation): empty.
 */
export function buildProjection(
  candles: readonly ChartBar[],
  events: readonly JournalEvent[],
  firstKnownBarMs: number | null,
): Projection {
  const byBar = new Map<number, JournalEvent>();
  for (const event of events) {
    const prev = byBar.get(event.bar_open_time_ms);
    byBar.set(event.bar_open_time_ms, prev === undefined ? event : later(prev, event));
  }
  const out: Projection = { entry: [], stop: [], take: [], noEvaluationTimes: [], unreadableCount: 0, signalCount: 0 };
  for (const bar of candles) {
    const event = byBar.get(bar.time * 1000);
    let state: BarState | null = null;
    if (event !== undefined) state = readState(event);
    else if (firstKnownBarMs !== null && bar.time * 1000 >= firstKnownBarMs) out.noEvaluationTimes.push(bar.time);
    if (state?.kind === "unreadable") out.unreadableCount += 1;
    if (state?.kind === "signal") {
      out.signalCount += 1;
      out.entry.push({ time: bar.time, value: state.entry });
      out.stop.push({ time: bar.time, value: state.stop });
      out.take.push({ time: bar.time, value: state.take });
    } else {
      out.entry.push({ time: bar.time });
      out.stop.push({ time: bar.time });
      out.take.push({ time: bar.time });
    }
  }
  // a run of signals ends where the next bar is not a signal: the segment leaving its last point must not be drawn
  for (const line of [out.entry, out.stop, out.take]) {
    line.forEach((point, i) => {
      if (point.value !== undefined && line[i + 1]?.value === undefined) point.breakAfter = true;
    });
  }
  return out;
}
