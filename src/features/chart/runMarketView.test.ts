import { beforeEach, describe, expect, it } from "vitest";

import type { RunDetail } from "@/api/types";
import { clearMarketResourceCache, mergeCandlesWindowBundle } from "@/features/chart/marketResourceCache";
import {
  buildMarketFetchKey,
  composeDisplayMarketWindowBundle,
  composePartialRunMarketBundle,
  composePartialRunMarketWindowBundle,
  composeRunMarketBundle,
  composeRunMarketWindowBundle,
  getMissingMarketResources,
  getMissingMarketWindowResources,
  isRunMarketViewReady,
  isRunMarketWindowReady,
  resolveRunMarketView,
  seedChartBundleIntoResourceCaches,
} from "@/features/chart/runMarketView";

function makeReport(strategySpec: Record<string, unknown>, runId = "run-a"): RunDetail {
  return {
    contract_version: "1.0.0",
    manifest: {
      contract_version: "1.0.0",
      run_id: runId,
      instance_id: `${runId}-instance`,
      created_at_utc: "2026-01-01T00:00:00Z",
      market_data_hash: null,
    },
    result: {
      contract_version: "1.0.0",
      run_id: runId,
      instance_id: `${runId}-instance`,
      strategy_evaluation: {
        contract_version: "1.0.0",
        strategy_id: "ema_pullback",
        strategy_version: "1",
        instance_id: `${runId}-instance`,
        market: {
          ticker: "BTCUSDT",
          timeframe: "5m",
          from_ms: 1_000_000,
          to_ms: 1_900_000,
        },
        bar_count: 100,
        market_data_hash: "hash",
      },
    },
    strategy_spec: strategySpec,
  };
}

const specA = {
  anchor_stack: {
    fast: { period: 200 },
    anchor: { period: 500 },
    slow: { period: 1000 },
  },
};

const specB = {
  anchor_stack: {
    fast: { period: 100 },
    anchor: { period: 300 },
    slow: { period: 600 },
  },
};

const bundle = {
  candles: [
    { time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 },
    { time: 1300, open: 1, high: 2, low: 0.5, close: 1.5 },
    { time: 1600, open: 1, high: 2, low: 0.5, close: 1.5 },
  ],
  ema_overlays: [
    {
      role: "fast" as const,
      period: 200,
      points: [
        { time: 1000, value: 1, kind: "chart_overlay_ema" as const },
        { time: 1300, value: 1, kind: "chart_overlay_ema" as const },
        { time: 1600, value: 1, kind: "chart_overlay_ema" as const },
      ],
    },
    {
      role: "anchor" as const,
      period: 500,
      points: [
        { time: 1000, value: 2, kind: "chart_overlay_ema" as const },
        { time: 1300, value: 2, kind: "chart_overlay_ema" as const },
        { time: 1600, value: 2, kind: "chart_overlay_ema" as const },
      ],
    },
    {
      role: "slow" as const,
      period: 1000,
      points: [
        { time: 1000, value: 3, kind: "chart_overlay_ema" as const },
        { time: 1300, value: 3, kind: "chart_overlay_ema" as const },
        { time: 1600, value: 3, kind: "chart_overlay_ema" as const },
      ],
    },
  ],
};

describe("runMarketView", () => {
  it("reuses candles across runs with identical symbol/timeframe/range", () => {
    clearMarketResourceCache();
    const viewA = resolveRunMarketView({
      runDetail: makeReport(specA),
      chartTimeframe: "5m",
      reloadToken: 0,
    });
    seedChartBundleIntoResourceCaches(viewA, bundle);

    const viewB = resolveRunMarketView({
      runDetail: makeReport(specB),
      chartTimeframe: "5m",
      reloadToken: 0,
    });

    expect(viewA.candlesKey).toBe(viewB.candlesKey);
    const missingB = getMissingMarketResources(viewB);
    expect(missingB.candles).toBe(false);
    expect(missingB.overlays).toHaveLength(3);
    expect(composePartialRunMarketBundle(viewB)?.candles).toEqual(bundle.candles);
    expect(isRunMarketViewReady(viewB)).toBe(false);
  });

  it("seeds chart-bundle candles and overlays into split caches", () => {
    clearMarketResourceCache();
    const view = resolveRunMarketView({
      runDetail: makeReport(specA),
      chartTimeframe: "5m",
      reloadToken: 0,
    });
    seedChartBundleIntoResourceCaches(view, bundle);
    expect(isRunMarketViewReady(view)).toBe(true);
    expect(composeRunMarketBundle(view)).toEqual(bundle);
  });

  it("builds fetch key only for missing resources", () => {
    clearMarketResourceCache();
    const viewA = resolveRunMarketView({
      runDetail: makeReport(specA),
      chartTimeframe: "5m",
      reloadToken: 0,
    });
    seedChartBundleIntoResourceCaches(viewA, bundle);
    const viewB = resolveRunMarketView({
      runDetail: makeReport(specB),
      chartTimeframe: "5m",
      reloadToken: 0,
    });
    const missingB = getMissingMarketResources(viewB);
    const fetchKey = buildMarketFetchKey(viewB, missingB);
    expect(fetchKey).not.toContain(`c:${viewB.candlesKey}`);
    expect(missingB.overlays).toHaveLength(3);
    expect(fetchKey.split("|")).toHaveLength(3);
  });

  it("window-aware compose reads target display window, not full report range", () => {
    clearMarketResourceCache();
    const view = resolveRunMarketView({
      runDetail: makeReport(specA),
      chartTimeframe: "5m",
      reloadToken: 0,
    });
    const targetWindow = { fromMs: 1_000_000, toMs: 1_600_000 };

    mergeCandlesWindowBundle(view.candlesKey, {
      candles: [bundle.candles[0]!, bundle.candles[1]!],
      coverage: {
        requested_from_ms: targetWindow.fromMs,
        requested_to_ms: targetWindow.toMs,
        actual_from_ms: targetWindow.fromMs,
        actual_to_ms: targetWindow.toMs,
        truncated: false,
      },
    });

    expect(getMissingMarketWindowResources(view, targetWindow).candles).toBe(false);
    expect(getMissingMarketResources(view).candles).toBe(true);
    expect(isRunMarketWindowReady(view, targetWindow)).toBe(false);
    expect(isRunMarketViewReady(view)).toBe(false);
    expect(composePartialRunMarketWindowBundle(view, targetWindow)?.candles).toHaveLength(2);
    expect(composeRunMarketWindowBundle(view, targetWindow)).toBeNull();
    expect(composeRunMarketBundle(view)).toBeNull();
    expect(composePartialRunMarketBundle(view)).toBeNull();
  });
});

describe("composeDisplayMarketWindowBundle", () => {
  beforeEach(() => {
    clearMarketResourceCache();
  });

  it("falls back to focus window when coverage prefetch is not cached yet", () => {
    const view = resolveRunMarketView({
      runDetail: makeReport(specA),
      chartTimeframe: "5m",
      reloadToken: 0,
    });
    const focusWindow = { fromMs: 1_300_000, toMs: 1_900_000, toOpenTimeMs: 1_600_000 };
    const coverageWindow = { fromMs: 1_000_000, toMs: 1_900_000, toOpenTimeMs: 1_600_000 };
    mergeCandlesWindowBundle(view.candlesKey, {
      candles: [{ time: 1300, open: 1, high: 1, low: 1, close: 1 }],
      coverage: {
        requested_from_ms: focusWindow.fromMs,
        requested_to_ms: focusWindow.toMs,
        actual_from_ms: focusWindow.fromMs,
        actual_to_ms: focusWindow.toMs,
        truncated: false,
      },
    });

    expect(composePartialRunMarketWindowBundle(view, coverageWindow)).toBeNull();
    const composed = composeDisplayMarketWindowBundle(view, focusWindow, coverageWindow);
    expect(composed?.source).toBe("focus");
    expect(composed?.bundle.candles).toHaveLength(1);
  });
});
