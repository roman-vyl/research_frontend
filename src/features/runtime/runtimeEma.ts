/**
 * EMA lines of a Runtime strategy's stack (`runtime-dashboard-ema-episodes-v1`). Values come only from Research's
 * `GET /api/market/indicators/ema` (Engine computes them, with warm-up before the window); nothing is computed here.
 * Points are kept for the session per market and period as one half-open range `[fromMs, toMs)`, so that only a
 * missing tail is requested after a Refresh.
 */

import { fetchChartOverlayEma } from "@/api/client";
import type { RuntimeEmaStackEntry } from "@/api/runtime";
import type { ChartBar, IndicatorPoint } from "@/api/types";
import type { MarketTimeBoundsMs } from "@/features/chart/marketResourceCache";

export type EmaLineKey = { symbol: string; timeframe: string; period: number };

type StoredLine = { fromMs: number; toMs: number; points: IndicatorPoint[] };

const store = new Map<string, StoredLine>();

function storeKey(key: EmaLineKey): string {
  return `${key.symbol}\u001e${key.timeframe}\u001e${key.period}`;
}

/** The entries to draw: a close EMA on the strategy's base timeframe (`"base"`) or on the chart's own. */
export function splitStack(
  stack: readonly RuntimeEmaStackEntry[],
  chartTimeframe: string,
): { drawn: RuntimeEmaStackEntry[]; skipped: RuntimeEmaStackEntry[] } {
  const drawn: RuntimeEmaStackEntry[] = [];
  const skipped: RuntimeEmaStackEntry[] = [];
  for (const entry of stack) {
    const onChartTimeframe = entry.timeframe === "base" || entry.timeframe === chartTimeframe;
    (onChartTimeframe && entry.source === "close" ? drawn : skipped).push(entry);
  }
  return { drawn, skipped };
}

export function skippedText(entry: RuntimeEmaStackEntry): string {
  return `EMA ${entry.timeframe} ${entry.period} is not drawn (other timeframe or source)`;
}

/** The part of `window` the stored line does not cover; null when it is complete. */
export function missingEmaRange(key: EmaLineKey, window: MarketTimeBoundsMs): MarketTimeBoundsMs | null {
  const have = store.get(storeKey(key));
  if (have === undefined || have.fromMs > window.fromMs || have.toMs < window.fromMs) return window;
  if (have.toMs >= window.toMs) return null;
  return { fromMs: have.toMs, toMs: window.toMs };
}

/** Requests what is missing (never more) and stores it; resolves when the window is covered. */
export async function ensureEmaLine(
  key: EmaLineKey,
  window: MarketTimeBoundsMs,
  tfMs: number,
  signal: AbortSignal,
): Promise<void> {
  const missing = missingEmaRange(key, window);
  if (missing === null) return;
  const points = await fetchChartOverlayEma({
    symbol: key.symbol,
    timeframe: key.timeframe,
    period: key.period,
    fromMs: missing.fromMs,
    toOpenTimeMs: missing.toMs - tfMs,
    signal,
  });
  const id = storeKey(key);
  const have = store.get(id);
  if (have !== undefined && missing.fromMs === have.toMs) {
    const known = new Set(have.points.map((p) => p.time));
    store.set(id, {
      fromMs: have.fromMs,
      toMs: missing.toMs,
      points: [...have.points, ...points.filter((p) => !known.has(p.time))].sort((a, b) => a.time - b.time),
    });
  } else {
    store.set(id, { fromMs: missing.fromMs, toMs: missing.toMs, points: [...points].sort((a, b) => a.time - b.time) });
  }
}

/** The stored points of one line that lie inside the candle window (first to last candle time, inclusive). */
export function emaPointsInWindow(key: EmaLineKey, candles: readonly ChartBar[]): IndicatorPoint[] {
  const have = store.get(storeKey(key));
  if (have === undefined || candles.length === 0) return [];
  const first = candles[0]!.time;
  const last = candles[candles.length - 1]!.time;
  return have.points.filter((p) => p.time >= first && p.time <= last);
}

export function clearRuntimeEmaStoreForTests(): void {
  store.clear();
}
