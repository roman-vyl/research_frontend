import { beforeEach, describe, expect, it } from "vitest";

import type { RunDetail, ChartMarketBundle } from "@/api/types";
import { candleRangeMs } from "@/features/chart/chartMarkers";
import { clearMarketResourceCache, mergeCandlesWindowBundle } from "@/features/chart/marketResourceCache";
import {
  composeDisplayMarketWindowBundle,
  resolveRunMarketView,
} from "@/features/chart/runMarketView";
import {
  buildMarketTargetWindowKey,
  marketCandlesReadyForTarget,
  type MarketDisplayWindowMs,
} from "@/features/chart/workbenchMarketLoad";

import { createChartRuntimeInput } from "./runtimeInputAdapter";
import { inactiveChartRuntimeOwnerFlags } from "./runtimeDebug";
import {
  resolveMarketBundleRuntime,
  resolveRenderWindowFoundationKey,
} from "./marketBundleRuntime";
import type { ChartRuntimeInput, RuntimeLoadStatus } from "./runtimeTypes";
import { createInitialChartRuntimeOutput } from "./useWorkbenchChartRuntime";

function makeReport(): RunDetail {
  return {
    contract_version: "1.0.0",
    manifest: {
      contract_version: "1.0.0",
      run_id: "run-a",
      instance_id: "instance_1",
      created_at_utc: "2026-01-01T00:00:00Z",
      market_data_hash: null,
    },
    result: {
      contract_version: "1.0.0",
      run_id: "run-a",
      instance_id: "instance_1",
      strategy_evaluation: {
        contract_version: "1.0.0",
        strategy_id: "ema_pullback",
        strategy_version: "1",
        instance_id: "instance_1",
        market: { ticker: "BTCUSDT", timeframe: "5m", from_ms: 1_000_000, to_ms: 1_900_000 },
        bar_count: 100,
        market_data_hash: "hash",
      },
    },
    strategy_spec: {
      anchor_stack: {
        fast: { period: 200 },
        anchor: { period: 500 },
        slow: { period: 1000 },
      },
    },
  };
}

const FOCUS_WINDOW: MarketDisplayWindowMs = {
  fromMs: 1_300_000,
  toMs: 1_900_000,
  toOpenTimeMs: 1_600_000,
};
const COVERAGE_WINDOW: MarketDisplayWindowMs = {
  fromMs: 1_000_000,
  toMs: 1_900_000,
  toOpenTimeMs: 1_600_000,
};

function makeInput(overrides: Partial<ChartRuntimeInput> = {}): ChartRuntimeInput {
  const runDetail = overrides.runDetail ?? makeReport();
  return createChartRuntimeInput({
    reportLoadStatus: "ready",
    runDetail,
    runTrades: [],
    managedPolicyEvents: [],
    selectedRunId: runDetail?.manifest.run_id ?? null,
    reloadToken: 0,
    selectedTradeId: null,
    selectedTradeEntryTimeMs: null,
    chartTradeFocusWarning: null,
    selectedBarTimeSec: null,
    chartTimeframe: "5m",
    chartHeavyIoEnabled: true,
    contextOverlayRef: null,
    effectiveContextOverlayRef: null,
    contextOverlayRefOptions: [],
    chartFocusIntent: { type: "none" },
    ...overrides,
  });
}

function seedFocusCandles(
  candlesKey: string,
  focusWindow: MarketDisplayWindowMs,
  times: number[],
): void {
  mergeCandlesWindowBundle(candlesKey, {
    candles: times.map((time) => ({ time, open: 1, high: 1, low: 1, close: 1 })),
    coverage: {
      requested_from_ms: focusWindow.fromMs,
      requested_to_ms: focusWindow.toMs,
      actual_from_ms: focusWindow.fromMs,
      actual_to_ms: focusWindow.toMs,
      truncated: false,
    },
  });
}

function seedCoverageCandles(
  candlesKey: string,
  coverageWindow: MarketDisplayWindowMs,
  times: number[],
): void {
  mergeCandlesWindowBundle(candlesKey, {
    candles: times.map((time) => ({ time, open: 1, high: 1, low: 1, close: 1 })),
    coverage: {
      requested_from_ms: coverageWindow.fromMs,
      requested_to_ms: coverageWindow.toMs,
      actual_from_ms: coverageWindow.fromMs,
      actual_to_ms: coverageWindow.toMs,
      truncated: false,
    },
  });
}

/** Mirrors WorkbenchContext cachedBundle + market count/range/source + foundation key. */
function resolveLegacyMarketBundleSnapshot(input: {
  view: ReturnType<typeof resolveRunMarketView>;
  focusWindow: MarketDisplayWindowMs;
  coverageWindow: MarketDisplayWindowMs;
  focusWindowKey: string;
  marketLoadStatus: RuntimeLoadStatus;
  marketLoadError?: string | null;
}) {
  const marketLoadError = input.marketLoadError ?? null;
  let cachedBundle: ChartMarketBundle | undefined;
  let composeSource: "coverage" | "focus" | null = null;

  if (
    input.marketLoadStatus !== "error" &&
    marketCandlesReadyForTarget(input.view, input.focusWindow)
  ) {
    const composed = composeDisplayMarketWindowBundle(
      input.view,
      input.focusWindow,
      input.coverageWindow,
    );
    composeSource = composed?.source ?? null;
    cachedBundle = composed?.bundle;
  }

  const fullCandleRange = cachedBundle ? candleRangeMs(cachedBundle.candles) : null;
  const marketCandlesCount = cachedBundle?.candles.length ?? 0;
  const candlesSource =
    cachedBundle !== undefined && input.marketLoadStatus !== "error" ? "market" : "unavailable";

  const foundationKey = resolveRenderWindowFoundationKey({
    view: input.view,
    focusWindow: input.focusWindow,
    focusWindowKey: input.focusWindowKey,
    marketLoadStatus: input.marketLoadStatus,
  });

  return {
    cachedBundle,
    composeSource,
    fullCandleRange,
    marketCandlesCount,
    candlesSource,
    foundationKey,
    marketLoadStatus: input.marketLoadStatus,
    marketLoadError,
  };
}

describe("Phase 3C market bundle parity", () => {
  beforeEach(() => {
    clearMarketResourceCache();
  });

  function resolveBundleHarness() {
    const report = makeReport();
    const view = resolveRunMarketView({
      runDetail: report,
      chartTimeframe: "5m",
      reloadToken: 0,
    });
    const viewIdentity = `${report.manifest.run_id}:${report.manifest.instance_id}:5m:0`;
    const focusWindowKey = buildMarketTargetWindowKey(viewIdentity, FOCUS_WINDOW);
    const coverageWindowKey = buildMarketTargetWindowKey(viewIdentity, COVERAGE_WINDOW);
    return {
      view,
      focusWindow: FOCUS_WINDOW,
      coverageWindow: COVERAGE_WINDOW,
      focusWindowKey,
      coverageWindowKey,
      viewIdentity,
    };
  }

  it("matches legacy bundle when focus candles are ready", () => {
    const { view, focusWindow, coverageWindow, focusWindowKey } = resolveBundleHarness();
    seedFocusCandles(view.candlesKey, focusWindow, [1300, 1600]);

    const legacy = resolveLegacyMarketBundleSnapshot({
      view,
      focusWindow,
      coverageWindow,
      focusWindowKey,
      marketLoadStatus: "ready",
    });
    const runtime = resolveMarketBundleRuntime({
      view,
      focusWindow,
      coverageWindow,
      focusWindowKey,
      marketLoadStatus: "ready",
    });

    expect(runtime.composeSource).toBe(legacy.composeSource);
    expect(runtime.market.candlesCount).toBe(legacy.marketCandlesCount);
    expect(runtime.market.fullCandleRange).toEqual(legacy.fullCandleRange);
    expect(runtime.market.candlesSource).toBe(legacy.candlesSource);
    expect(runtime.foundationKey).toBe(legacy.foundationKey);
    expect(runtime.debug.displayBundle.source).toBe(legacy.composeSource);
    expect(runtime.debug.displayBundle.count).toBe(legacy.marketCandlesCount);
  });

  it("uses coverage source when coverage candles are fully cached", () => {
    const { view, focusWindow, coverageWindow, focusWindowKey } = resolveBundleHarness();
    seedFocusCandles(view.candlesKey, focusWindow, [1300]);
    seedCoverageCandles(view.candlesKey, coverageWindow, [1000, 1300, 1600]);

    const runtime = resolveMarketBundleRuntime({
      view,
      focusWindow,
      coverageWindow,
      focusWindowKey,
      marketLoadStatus: "ready",
    });

    expect(runtime.composeSource).toBe("coverage");
    expect(runtime.debug.displayBundle.source).toBe("coverage");
    expect(runtime.bundle?.candles).toHaveLength(3);
    expect(runtime.market.candlesSource).toBe("market");
    expect(runtime.market.candlesCount).toBe(3);
  });

  it("falls back to focus window while coverage prefetch is incomplete", () => {
    const { view, focusWindow, coverageWindow, focusWindowKey } = resolveBundleHarness();
    seedFocusCandles(view.candlesKey, focusWindow, [1300]);

    const runtime = resolveMarketBundleRuntime({
      view,
      focusWindow,
      coverageWindow,
      focusWindowKey,
      marketLoadStatus: "loading",
    });

    expect(runtime.composeSource).toBe("focus");
    expect(runtime.debug.displayBundle.source).toBe("focus");
    expect(runtime.bundle?.candles).toHaveLength(1);
    expect(runtime.market.candlesSource).toBe("market");
    expect(runtime.debug.cachedCandles.count).toBe(0);
    expect(runtime.debug.fetchedCandles.count).toBe(1);
  });

  it("does not expose a ready market bundle on error status", () => {
    const { view, focusWindow, coverageWindow, focusWindowKey } = resolveBundleHarness();
    seedFocusCandles(view.candlesKey, focusWindow, [1300, 1600]);

    const runtime = resolveMarketBundleRuntime({
      view,
      focusWindow,
      coverageWindow,
      focusWindowKey,
      marketLoadStatus: "error",
      marketLoadError: "Market load failed",
    });

    expect(runtime.bundle).toBeNull();
    expect(runtime.market.status).toBe("error");
    expect(runtime.market.candlesSource).toBe("unavailable");
    expect(runtime.market.candlesCount).toBe(0);
    expect(runtime.market.fullCandleRange).toBeNull();
    expect(runtime.foundationKey).toBeNull();
    expect(runtime.debug.displayBundle.source).toBeNull();
  });

  it("does not expose bundle when focus candles are not ready", () => {
    const { view, focusWindow, coverageWindow, focusWindowKey } = resolveBundleHarness();

    const runtime = resolveMarketBundleRuntime({
      view,
      focusWindow,
      coverageWindow,
      focusWindowKey,
      marketLoadStatus: "loading",
    });

    expect(runtime.bundle).toBeNull();
    expect(runtime.market.candlesSource).toBe("unavailable");
    expect(runtime.market.candlesCount).toBe(0);
    expect(runtime.debug.displayBundle.count).toBe(0);
  });

  it("keeps foundation key null until market status is ready", () => {
    const { view, focusWindow, coverageWindow, focusWindowKey } = resolveBundleHarness();
    seedFocusCandles(view.candlesKey, focusWindow, [1300, 1600]);

    const loading = resolveMarketBundleRuntime({
      view,
      focusWindow,
      coverageWindow,
      focusWindowKey,
      marketLoadStatus: "loading",
    });
    expect(loading.foundationKey).toBeNull();

    const ready = resolveMarketBundleRuntime({
      view,
      focusWindow,
      coverageWindow,
      focusWindowKey,
      marketLoadStatus: "ready",
    });
    expect(ready.foundationKey).toBe(`${focusWindowKey}:2`);
    expect(ready.foundationKey).toBe(
      resolveRenderWindowFoundationKey({
        view,
        focusWindow,
        focusWindowKey,
        marketLoadStatus: "ready",
      }),
    );
  });

  it("production-mounted runtime output stays idle with inactive owner flags", () => {
    const input = makeInput();
    const output = createInitialChartRuntimeOutput(input);

    expect(output.market.status).toBe("idle");
    expect(output.market.candlesSource).toBe("unavailable");
    expect(output.market.candlesCount).toBe(0);
    expect(output.debug.ownerFlags).toEqual(inactiveChartRuntimeOwnerFlags);
    expect(output.debug.displayBundle).toEqual({ range: null, count: 0, source: null });
  });

  it("derives debug bundle fields from isolated bundle runtime without mutating market output on error", () => {
    const { view, focusWindow, coverageWindow, focusWindowKey } = resolveBundleHarness();
    seedFocusCandles(view.candlesKey, focusWindow, [1300, 1600]);

    const runtime = resolveMarketBundleRuntime({
      view,
      focusWindow,
      coverageWindow,
      focusWindowKey,
      marketLoadStatus: "loading",
    });

    expect(runtime.debug.displayBundle.source).toBe("focus");
    expect(runtime.debug.displayBundle.count).toBe(2);
    expect(runtime.debug.fetchedCandles.count).toBe(2);
    expect(runtime.market.candlesSource).toBe("market");
    expect(runtime.market.status).toBe("loading");
    expect(runtime.foundationKey).toBeNull();
  });
});
