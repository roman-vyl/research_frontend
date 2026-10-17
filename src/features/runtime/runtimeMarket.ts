import { fetchCandlesWindow, fetchMarketBounds } from "@/api/client";
import type { ChartBar, MarketBounds } from "@/api/types";
import {
  buildCandlesCacheKey,
  getCandles,
  getMarketCandlesCache,
  mergeCandlesWindowBundle,
  type MarketTimeBoundsMs,
} from "@/features/chart/marketResourceCache";
import { resolveChartTimeframeMs } from "@/features/chart/chartTimeframeMs";

/** Runtime shares the Research candle store at token 0 and never resets or clears it. */
export const RUNTIME_CHART_RELOAD_TOKEN = 0;
export const RUNTIME_CHART_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type RuntimeMarket = { symbol: string; timeframe: string };

export type RuntimeChartErrorKind = "unsupported_timeframe" | "bounds" | "candles";

export class RuntimeChartError extends Error {
  readonly kind: RuntimeChartErrorKind;
  constructor(kind: RuntimeChartErrorKind) {
    super(kind);
    this.name = "RuntimeChartError";
    this.kind = kind;
  }
}

/** The chart depends on the market only, never on the selected strategy. */
export function marketKey(market: RuntimeMarket): string {
  return `${market.symbol}\u001e${market.timeframe}`;
}

/** Half-open `[fromMs, toMs)` window of the last 30 days ending with the latest committed bar. */
export function initialWindow(bounds: MarketBounds, tfMs: number): MarketTimeBoundsMs {
  const toMs = bounds.latest_open_time_ms + tfMs;
  return { fromMs: Math.max(bounds.earliest_open_time_ms, toMs - RUNTIME_CHART_WINDOW_MS), toMs };
}

/**
 * Cache ranges are half-open `[fromMs, toMs)`; `fetchCandlesWindow` takes the inclusive
 * `toOpenTimeMs`. The exclusive boundary is never passed as `toOpenTimeMs`.
 */
export function candlesRequestForMissing(
  missing: MarketTimeBoundsMs,
  tfMs: number,
): { fromMs: number; toOpenTimeMs: number } {
  return { fromMs: missing.fromMs, toOpenTimeMs: missing.toMs - tfMs };
}

export type RuntimeMarketData = { bounds: MarketBounds; candles: ChartBar[] };

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/**
 * Always asks for the bounds, then requests candles only for the part of the window the shared
 * cache does not cover. An abort is rethrown as is; other failures become `RuntimeChartError`.
 */
export async function loadRuntimeMarket(
  market: RuntimeMarket,
  signal: AbortSignal,
): Promise<RuntimeMarketData> {
  let tfMs: number;
  try {
    tfMs = resolveChartTimeframeMs(market.timeframe);
  } catch {
    throw new RuntimeChartError("unsupported_timeframe");
  }
  let bounds: MarketBounds;
  try {
    bounds = await fetchMarketBounds({ ...market, signal });
  } catch (err) {
    if (isAbort(err) || signal.aborted) throw err;
    throw new RuntimeChartError("bounds");
  }
  if (signal.aborted) throw new DOMException("aborted", "AbortError"); // no candles request for a market that is no longer shown
  const window = initialWindow(bounds, tfMs);
  const key = buildCandlesCacheKey({ ...market, reloadToken: RUNTIME_CHART_RELOAD_TOKEN });
  const missing = getMarketCandlesCache(key).missingRange(window.fromMs, window.toMs);
  if (missing !== null) {
    const request = candlesRequestForMissing(missing, tfMs);
    try {
      mergeCandlesWindowBundle(key, await fetchCandlesWindow({ ...market, ...request, signal }));
    } catch (err) {
      if (isAbort(err) || signal.aborted) throw err;
      throw new RuntimeChartError("candles");
    }
  }
  return { bounds, candles: getCandles(key, window.fromMs, window.toMs) ?? [] };
}
