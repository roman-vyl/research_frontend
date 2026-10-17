import type { JournalEvent } from "@/api/journal";
import type { ChartBar } from "@/api/types";
import { price } from "@/features/runtime/runtimeProjection";

/** The prices of one applied entry order; a `null` price draws no ring. */
export type AppliedRing = { entry: number | null; stop: number | null; take: number | null };

/** Every readable applied order of one bar; several orders of a bar are all kept. */
export type AppliedBar = { time: number; rings: AppliedRing[] };

export type AppliedOrders = {
  /** Bars with at least one readable applied order, in candle order. */
  bars: AppliedBar[];
  /** Every applied record on a bar of the window, unreadable ones included. */
  appliedCount: number;
  unreadableCount: number;
};

/** A value that is neither `null` nor a decimal string makes the whole record unreadable. */
function readRing(event: JournalEvent): AppliedRing | null {
  const payload = event.body?.payload;
  if (typeof payload !== "object" || payload === null) return null;
  const values = [payload.trigger_price, payload.stop_loss, payload.take_profit];
  const prices = values.map((v) => (v === null ? null : price(v)));
  if (prices.some((p, i) => p === null && values[i] !== null)) return null;
  const [entry, stop, take] = prices;
  if (entry === null && stop === null && take === null) return null;
  return { entry: entry ?? null, stop: stop ?? null, take: take ?? null };
}

/**
 * The applied orders (`entry_package_applied` events) on the bars of the candle window. Every record
 * counts on its own: nothing is selected, merged or dropped within a bar. Records on bars outside the
 * window are neither drawn nor counted.
 */
export function buildAppliedOrders(candles: readonly ChartBar[], events: readonly JournalEvent[]): AppliedOrders {
  const inWindow = new Set(candles.map((bar) => bar.time * 1000));
  const byBar = new Map<number, AppliedRing[]>();
  const out: AppliedOrders = { bars: [], appliedCount: 0, unreadableCount: 0 };
  for (const event of events) {
    if (!inWindow.has(event.bar_open_time_ms)) continue;
    out.appliedCount += 1;
    const ring = readRing(event);
    if (ring === null) {
      out.unreadableCount += 1;
      continue;
    }
    const rings = byBar.get(event.bar_open_time_ms);
    if (rings === undefined) byBar.set(event.bar_open_time_ms, [ring]);
    else rings.push(ring);
  }
  for (const bar of candles) {
    const rings = byBar.get(bar.time * 1000);
    if (rings !== undefined) out.bars.push({ time: bar.time, rings });
  }
  return out;
}
