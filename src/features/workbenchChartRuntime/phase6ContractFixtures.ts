import type { ChartBar, RunDetail, TradeRecord } from "@/api/types";
import { buildChartViewModel } from "@/features/chart/runtime/chartViewModel";

import type { ChartRuntimeCompatibilityInput, ChartRuntimeOutput } from "./runtimeTypes";
import { chartRuntimeCutoverConfig } from "./chartRuntimeCutoverConfig";

export function makePhase6RunDetail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    contract_version: "research_run_detail.v1",
    manifest: {
      contract_version: "research_run_artifacts.v1",
      run_id: "run-a",
      instance_id: "instance_1",
      created_at_utc: "2026-01-01T00:00:00Z",
      market_data_hash: "market-hash",
    },
    result: {
      contract_version: "research_single_instance_backtest.v1",
      run_id: "run-a",
      instance_id: "instance_1",
      strategy_evaluation: {
        contract_version: "strategy_evaluation.v1",
        strategy_id: "ema_pullback",
        strategy_version: "v1",
        instance_id: "instance_1",
        market: {
          ticker: "BTCUSDT",
          timeframe: "5m",
          from_ms: 1_000_000,
          to_ms: 1_900_000,
        },
        bar_count: 100,
        market_data_hash: "market-hash",
      },
    },
    strategy_spec: {
      anchor_stack: {
        fast: { period: 200 },
        anchor: { period: 500 },
        slow: { period: 1000 },
      },
    },
    ...overrides,
  };
}

export function makePhase6Trade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    trade_id: "trade:position:instance_1:long:0:1",
    position_id: "position:instance_1:long:0",
    instance_id: "instance_1",
    side: "long",
    status: "closed",
    entry_bar_index: 0,
    exit_bar_index: 1,
    entry_time_ms: 1_000_000,
    exit_time_ms: 1_300_000,
    entry_price: "100",
    exit_price: "105",
    quantity: "1",
    entry_notional: "100",
    exit_notional: "105",
    gross_pnl: "5",
    entry_fee: "0",
    exit_fee: "0",
    fees_paid: "0",
    net_pnl: "5",
    gross_return_pct: "0.05",
    net_return_pct: "0.05",
    equity_before: "1000",
    equity_after: "1005",
    hold_bars: 1,
    hold_ms: 300_000,
    exit_candidate_type: "take_profit",
    exit_reason: "take_profit",
    exit_layer: "static",
    exit_rule_id: null,
    exit_component_id: null,
    exit_kind: null,
    path: {
      mfe_price: "106",
      mfe_pct: "0.06",
      mfe_bar_index: 1,
      mfe_bars_from_entry: 1,
      mae_price: "99",
      mae_pct: "0.01",
      mae_bar_index: 0,
      mae_bars_from_entry: 0,
      captured_price: "105",
      captured_pct: "0.05",
      capture_ratio: "0.83",
      giveback_price: "1",
      giveback_pct: "0.01",
      bars_from_mfe_to_exit: 0,
    },
    ...overrides,
  };
}

export function makePhase6Candles(count: number, startTimeSec = 1_000): ChartBar[] {
  return Array.from({ length: count }, (_, index) => ({
    time: startTimeSec + index * 300,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
  }));
}

export function makePhase6CompatibilityInput(
  overrides: Partial<ChartRuntimeCompatibilityInput> = {},
): ChartRuntimeCompatibilityInput {
  return {
    strategySpec: makePhase6RunDetail().strategy_spec,
    runTrades: [],
    selectedTradeId: 1,
    selectedBarTimeSec: 1_000,
    ...overrides,
  };
}

export function makeSampleChartRuntimeOutput(
  overrides: Partial<ChartRuntimeOutput> = {},
): ChartRuntimeOutput {
  const candles = makePhase6Candles(40);
  const chartViewModel = buildChartViewModel({
    candles,
    emaOverlays: [],
    auxEmaOverlays: [],
    displayAuxEmaOverlays: [],
    componentEvents: [],
    htfOverlayStale: false,
    componentEventsStale: false,
    traceDisplayStatus: "current",
    traceDisplayMissingRange: null,
    viewMode: "around-trade",
    centerTimeSec: 1_200,
    firstTimeSec: candles[0]!.time,
    lastTimeSec: candles[candles.length - 1]!.time,
    count: candles.length,
  });

  const base: ChartRuntimeOutput = {
    chartViewModel,
    market: {
      status: "ready",
      error: null,
      candlesSource: "market",
      candlesCount: 200,
      fullCandleRange: { min: 1_000_000, max: 1_900_000 },
    },
    trace: {
      lanesSignalTrace: null,
      lanesSignalTraceStatus: "idle",
      lanesSignalTraceError: null,
    },
    overlays: { htfAuxEmaOverlayStale: false },
    display: {
      componentEventsStale: false,
      displayApplyRevision: 1,
      renderWindowShiftSeq: 0,
    },
    viewport: {
      command: { type: "focusTrade", entryTimeSec: 1_200 },
      commandSeq: 1,
      acknowledge: () => {},
      isWindowSwapTransactionCancelled: () => false,
      settleWindowSwapCommit: () => {},
    },
    interaction: {
      dispatch: () => {},
    },
    debug: {
      runId: "run-a",
      instanceId: "instance_1",
      selectedTradeId: 1,
      selectedTradeEntryTimeMs: 1_200_000,
      chartHeavyIoEnabled: true,
      marketIdentity: "identity-a",
      expectedMarketIdentity: "identity-a",
      focusWindow: { fromMs: 1_300_000, toMs: 1_900_000, toOpenTimeMs: 1_600_000 },
      coverageWindow: { fromMs: 1_000_000, toMs: 1_900_000, toOpenTimeMs: 1_600_000 },
      marketWindowKeys: { focus: "focus-key", coverage: "coverage-key" },
      marketWindowResetKey: "reset-key",
      marketWindowFocusMode: "around-trade",
      marketWindowResetReasons: ["initial_focus"],
      marketWindowComparison: null,
      marketFetchPlan: null,
      fetchedCandles: { range: { min: 1_300_000, max: 1_600_000 }, count: 40 },
      cachedCandles: { range: { min: 1_000_000, max: 1_900_000 }, count: 200 },
      displayBundle: { range: { min: 1_000_000, max: 1_900_000 }, count: 200, source: "coverage" },
      renderWindow: { startIndex: 0, endIndex: 40, firstTimeSec: candles[0]!.time, lastTimeSec: candles[candles.length - 1]!.time },
      chartModel: {
        firstTimeSec: candles[0]!.time,
        lastTimeSec: candles[candles.length - 1]!.time,
        count: candles.length,
        seriesKey: chartViewModel.seriesKey,
      },
      viewportCommand: { type: "focusTrade", entryTimeSec: 1_200 },
      traceRequests: { displayKey: "display-key", denseKey: "dense-key", status: "idle" },
      counts: { componentEvents: 0, auxOverlays: 0, htfOverlays: 0, markers: null },
      ownerFlags: {
        marketWindows: false,
        marketCacheWrites: false,
        renderWindow: false,
        viewportCommands: false,
        traceDisplayCache: false,
        denseLanesTrace: false,
        auxOverlays: false,
        finalChartModel: false,
      },
      cutoverPhase: chartRuntimeCutoverConfig.cutoverPhase,
      domainOwners: { ...chartRuntimeCutoverConfig.domainOwners },
    },
  };

  return { ...base, ...overrides };
}

/** Runtime-owned fields that Phase 6.3 adapter cutover must derive from one ChartRuntimeOutput. */
export const RUNTIME_OWNED_WORKBENCH_CHART_FIELD_KEYS = [
  "marketLoadStatus",
  "marketError",
  "chartViewModel",
  "htfAuxEmaOverlayStale",
  "componentEventsStale",
  "displayApplyRevision",
  "renderWindowShiftSeq",
  "marketCandlesCount",
  "fullCandleRange",
  "candlesSource",
  "lanesSignalTrace",
  "lanesSignalTraceStatus",
  "lanesSignalTraceError",
  "dispatchChartInteraction",
  "chartViewportCommand",
  "chartViewportCommandSeq",
  "acknowledgeChartViewportCommand",
  "isWindowSwapTransactionCancelled",
  "settleWindowSwapCommit",
] as const;

/** Provider-owned fields that must remain outside runtime v2 lifecycle. */
export const PROVIDER_OWNED_WORKBENCH_CHART_FIELD_KEYS = [
  "runTrades",
  "managedPolicyEvents",
  "selectedTradeId",
  "selectTrade",
  "selectedBarTimeSec",
  "selectBar",
  "contextOverlayRef",
  "setContextOverlayRef",
  "effectiveContextOverlayRef",
  "contextOverlayRefOptions",
  "chartShowEntryBlockMarkers",
  "setChartShowEntryBlockMarkers",
  "chartShowExitSignalMarkers",
  "setChartShowExitSignalMarkers",
  "chartShowSetupMarkers",
  "setChartShowSetupMarkers",
  "chartShowTradeManagementPhaseMarkers",
  "setChartShowTradeManagementPhaseMarkers",
  "chartShowTradeManagementExitMarkers",
  "setChartShowTradeManagementExitMarkers",
  "reportTimeframe",
  "timeframeMismatch",
  "chartTimeframe",
  "chartTradeFocusWarning",
] as const;
