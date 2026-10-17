import type { JournalEvent } from "@/api/journal";
import type { ChartBar } from "@/api/types";

/** One bar with a signal: the three projected prices. */
export type ProjectionPoint = { time: number; entry: number; stop: number; take: number };

export type Projection = {
  /** Signal bars only, in candle order; the chart breaks the lines where bars are not consecutive. */
  points: ProjectionPoint[];
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
 * The signal bars as points; every other state produces no point, so the chart's own gap handling
 * (non-consecutive bars) breaks the lines.
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
  const out: Projection = { points: [], noEvaluationTimes: [], unreadableCount: 0, signalCount: 0 };
  for (const bar of candles) {
    const event = byBar.get(bar.time * 1000);
    let state: BarState | null = null;
    if (event !== undefined) state = readState(event);
    else if (firstKnownBarMs !== null && bar.time * 1000 >= firstKnownBarMs) out.noEvaluationTimes.push(bar.time);
    if (state?.kind === "unreadable") out.unreadableCount += 1;
    if (state?.kind === "signal") {
      out.signalCount += 1;
      out.points.push({ time: bar.time, entry: state.entry, stop: state.stop, take: state.take });
    }
  }
  return out;
}
