/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ChartEventsBundle,
  RunDetail,
  RunSummary,
  TradeRecord,
} from "@/api/types";
import { makeTradeRecord } from "@/features/chart/testFixtures/tradeRecordFixtures";
import { selectedTradeEntryMarkerInView } from "@/features/chart/chartMarkers";
import { clearMarketResourceCache } from "@/features/chart/marketResourceCache";
import { resetChartEventsFlagDisabledNoteForTests } from "@/features/chart/runtime/chartEventsLoad";
import { dbgExport, dbgReset, PIPELINE_DEBUG_STEPS as DBG } from "@/shared/diagnostics/pipelineDebug";
import { installSplitMarketWindowMocks } from "@/test/marketWindowApiMocks";
import {
  WorkbenchProvider,
  useWorkbench,
  useWorkbenchChart,
} from "@/shared/context/WorkbenchContext";

const fetchRunDetail = vi.fn<typeof import("@/api/client").fetchRunDetail>();
const fetchRunTrades = vi.fn<typeof import("@/api/client").fetchRunTrades>();
const fetchRunMetrics = vi.fn<typeof import("@/api/client").fetchRunMetrics>();
const fetchManagedPolicyEvents = vi.fn<typeof import("@/api/client").fetchManagedPolicyEvents>();
const fetchRunSummaries = vi.fn<typeof import("@/api/client").fetchRunSummaries>();
const fetchConfigState = vi.fn<typeof import("@/api/client").fetchConfigState>();
const fetchCandlesWindow = vi.fn<typeof import("@/api/client").fetchCandlesWindow>();
const fetchEmaWindow = vi.fn<typeof import("@/api/client").fetchEmaWindow>();
const fetchSignalTrace = vi.fn<typeof import("@/api/client").fetchSignalTrace>();
const fetchChartEvents = vi.fn<typeof import("@/api/client").fetchChartEvents>();
const fetchChartOverlayEma = vi.fn<typeof import("@/api/client").fetchChartOverlayEma>();

vi.mock("@/api/client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    detail: string;
    constructor(status: number, detail: string) {
      super(detail);
      this.status = status;
      this.detail = detail;
    }
  },
  fetchRunDetail: (...args: Parameters<typeof fetchRunDetail>) => fetchRunDetail(...args),
  fetchRunTrades: (...args: Parameters<typeof fetchRunTrades>) => fetchRunTrades(...args),
  fetchRunMetrics: (...args: Parameters<typeof fetchRunMetrics>) => fetchRunMetrics(...args),
  fetchManagedPolicyEvents: (...args: Parameters<typeof fetchManagedPolicyEvents>) =>
    fetchManagedPolicyEvents(...args),
  fetchRunSummaries: (...args: Parameters<typeof fetchRunSummaries>) => fetchRunSummaries(...args),
  fetchConfigState: (...args: Parameters<typeof fetchConfigState>) => fetchConfigState(...args),
  fetchCandlesWindow: (...args: Parameters<typeof fetchCandlesWindow>) =>
    fetchCandlesWindow(...args),
  fetchEmaWindow: (...args: Parameters<typeof fetchEmaWindow>) => fetchEmaWindow(...args),
  fetchSignalTrace: (...args: Parameters<typeof fetchSignalTrace>) => fetchSignalTrace(...args),
  fetchChartEvents: (...args: Parameters<typeof fetchChartEvents>) => fetchChartEvents(...args),
  fetchChartOverlayEma: (...args: Parameters<typeof fetchChartOverlayEma>) =>
    fetchChartOverlayEma(...args),
  selectSavedConfig: vi.fn(),
}));

const THREE_BAR_MARKET = [
  { time: 1100, open: 1, high: 2, low: 0.5, close: 1.5 },
  { time: 1200, open: 1.1, high: 2.1, low: 0.6, close: 1.6 },
  { time: 1300, open: 1.2, high: 2.2, low: 0.7, close: 1.7 },
];

function makeReport(runId: string): RunDetail {
  return {
    contract_version: "1.0.0",
    manifest: {
      contract_version: "1.0.0",
      run_id: runId,
      instance_id: "instance_1",
      created_at_utc: "2026-01-01T00:00:00Z",
      market_data_hash: null,
    },
    result: {
      contract_version: "1.0.0",
      run_id: runId,
      instance_id: "instance_1",
      strategy_evaluation: {
        contract_version: "1.0.0",
        strategy_id: "ema_pullback",
        strategy_version: "1",
        instance_id: "instance_1",
        market: { ticker: "BTCUSDT", timeframe: "5m", from_ms: 1_100_000, to_ms: 1_300_000 },
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

function makeTrades(): TradeRecord[] {
  return [
    makeTradeRecord({
      trade_id: "1",
      position_id: "position-1",
      instance_id: "instance_1",
      side: "long",
      entry_time_ms: 1_100_000,
      exit_time_ms: 1_150_000,
      entry_price: "100",
      exit_price: "101",
      exit_reason: "signal:exit",
      net_pnl: "1",
      net_return_pct: "0.01",
    }),
    makeTradeRecord({
      trade_id: "2",
      position_id: "position-2",
      instance_id: "instance_1",
      side: "long",
      entry_time_ms: 1_300_000,
      exit_time_ms: 1_350_000,
      entry_price: "102",
      exit_price: "103",
      exit_reason: "signal:exit",
      net_pnl: "1",
      net_return_pct: "0.01",
    }),
  ];
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const RUNS: RunSummary[] = [
  {
    contract_version: "research_run_summary.v1",
    run_id: "run-a",
    created_at_utc: "2026-01-01T00:00:00Z",
    instance_id: "instance_1",
    strategy_id: "ema_pullback",
    strategy_version: "1",
    ticker: "BTCUSDT.P",
    timeframe: "5m",
    from_ms: 1_000_000,
    to_ms: 2_000_000,
    realised_trade_count: 0,
    open_position_count: 0,
    final_equity: "10000",
    net_pnl: "0",
    market_data_hash: null,
  },
];

let workbenchRef: ReturnType<typeof useWorkbench> | null = null;
let chartSliceRef: ReturnType<typeof useWorkbenchChart> | null = null;

function WorkbenchCapture() {
  workbenchRef = useWorkbench();
  return null;
}

function ChartSliceCapture() {
  chartSliceRef = useWorkbenchChart();
  return null;
}

function Host({ children }: { children?: ReactNode }) {
  return <WorkbenchProvider initialActiveTab="chart">{children}</WorkbenchProvider>;
}

describe("chart-events distant trade display apply", () => {
  afterEach(() => {
    cleanup();
    workbenchRef = null;
    chartSliceRef = null;
    vi.unstubAllEnvs();
    resetChartEventsFlagDisabledNoteForTests();
  });

  beforeEach(() => {
    workbenchRef = null;
    chartSliceRef = null;
    vi.clearAllMocks();
    clearMarketResourceCache();
    dbgReset();
    vi.stubEnv("VITE_CHART_EVENTS_API", "1");
    vi.stubEnv("VITE_EMA_PIPELINE_DEBUG", "true");
    fetchRunSummaries.mockResolvedValue(RUNS);
    fetchConfigState.mockResolvedValue({
      strategy_id: "ema_pullback",
      selected_experiment_id: null,
      configs: [],
      selected_path: null,
      draft: null,
    });
    fetchRunDetail.mockImplementation(async (runId: string) => makeReport(runId));
    fetchRunTrades.mockImplementation(async (runId: string) => ({
      contract_version: "1.0.0",
      run_id: runId,
      trades: makeTrades(),
    }));
    fetchRunMetrics.mockResolvedValue({
      contract_version: "1.0.0",
      run_id: "run-a",
      initial_equity: "1000",
      final_equity: "1000",
      realised_trade_count: 0,
      open_position_count: 0,
      gross_pnl: "0",
      fees_paid: "0",
      net_pnl: "0",
    });
    fetchManagedPolicyEvents.mockResolvedValue({
      contract_version: "1.0.0",
      run_id: "run-a",
      events: [],
    });
    installSplitMarketWindowMocks({
      fetchCandlesWindow,
      fetchEmaWindow,
      candles: THREE_BAR_MARKET,
      emaOverlays: [],
    });
    fetchChartOverlayEma.mockResolvedValue([]);
    fetchSignalTrace.mockResolvedValue({
      times: [1100, 1200, 1300],
      meta: {
        variant: "exp_a",
        component_ids: { direction: "d", setups: [], trigger: "t", risk: "r" },
        setup_params: [],
        blocker_instances: [],
      },
      long: {
        direction_ok: [false, false, false],
        blockers_ok: [false, false, false],
        setup_ok: [false, false, false],
        trigger_ok: [false, false, false],
        risk_ok: [false, false, false],
        signal_entry: [false, false, false],
        stop_ready: [false, false, false],
        portfolio_entry: [false, false, false],
        internals: {},
      },
      short: {
        direction_ok: [false, false, false],
        blockers_ok: [false, false, false],
        setup_ok: [false, false, false],
        trigger_ok: [false, false, false],
        risk_ok: [false, false, false],
        signal_entry: [false, false, false],
        stop_ready: [false, false, false],
        portfolio_entry: [false, false, false],
        internals: {},
      },
      component_events: [],
    });
  });

  it("shows selected trade entry marker after deferred chart-events merge without re-selecting trade", async () => {
    const deferredChartEvents = createDeferred<ChartEventsBundle>();
    fetchChartEvents.mockReturnValue(deferredChartEvents.promise);

    render(
      <Host>
        <WorkbenchCapture />
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchChartEvents).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(chartSliceRef?.selectedTradeId).toBe("2");
    });

    await act(async () => {
      workbenchRef!.selectTrade(1);
    });

    await waitFor(() => {
      expect(chartSliceRef?.selectedTradeId).toBe(1);
    });

    await act(async () => {
      deferredChartEvents.resolve({
        times: [1100, 1200, 1300],
        component_events: [],
        htf_context: { fast: [1], anchor: [1], slow: [1], meta: {} },
        meta: {
          variant: "exp_a",
          component_ids: { direction: "d", setups: [], trigger: "t", risk: "r" },
          setup_params: [],
          blocker_instances: [],
        },
        coverage: {
          schema_version: 1,
          from_sec: 1100,
          to_sec: 1300,
          bar_count: 3,
          requested_from_sec: 1100,
          requested_to_sec: 1300,
          truncated: false,
          max_bars: 50_000,
        },
      });
    });

    await waitFor(() => {
      expect(chartSliceRef?.selectedTradeId).toBe(1);
      const candles = chartSliceRef!.chartViewModel.candles;
      expect(
        selectedTradeEntryMarkerInView(
          chartSliceRef!.runTrades,
          1,
          candles,
        ),
      ).toBe(true);
    });

    const applyMark = dbgExport().steps
      .filter((row) => row.step === DBG.traceDisplay.applyCurrentWindow)
      .at(-1);
    expect(applyMark?.last_meta?.selectedTradeId).toBe(1);
    expect(applyMark?.last_meta?.selectedTradeEntryMarkerInView).toBe(true);
    expect(fetchChartEvents.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
