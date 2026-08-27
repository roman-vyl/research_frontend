/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ChartEventsBundle,
  ComponentEvent,
  RunDetail,
  RunSummary,
  SignalTraceBundle,
} from "@/api/types";
import { clearMarketResourceCache } from "@/features/chart/marketResourceCache";
import { resetChartEventsFlagDisabledNoteForTests } from "@/features/chart/runtime/chartEventsLoad";
import { dbgReset } from "@/shared/diagnostics/pipelineDebug";
import { installSplitMarketWindowMocks } from "@/test/marketWindowApiMocks";
import {
  WorkbenchProvider,
  useWorkbenchChart,
  useWorkbenchShell,
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

const TRACE_META: SignalTraceBundle["meta"] = {
  instance_id: "exp_a",
  component_ids: {
    direction: "d",
    setups: [{ instance_id: "setup", component_id: "s" }],
    trigger: "t",
    risk: "r",
  },
  setup_params: [
    {
      instance_id: "setup",
      component_id: "s",
      lookback: 50,
      active_bars: 3,
    },
  ],
  blocker_instances: [],
};

const CHART_EVENTS_MARKER: ComponentEvent = {
  event_type: "point",
  role: "exit_signal",
  side: "long",
  component_id: "comp_chart_events",
  instance_id: "inst_chart_events",
  label: "from-chart-events",
  time: 1000,
  span_id: null,
  feature_family: null,
  source_timeframe: null,
  base_timeframe: null,
  metadata: {},
};

const ONE_POINT_CHART_EVENTS: ChartEventsBundle = {
  times: [1000],
  component_events: [CHART_EVENTS_MARKER],
  htf_context: {
    fast: [101],
    anchor: [99],
    slow: [97],
    meta: {},
  },
  meta: TRACE_META,
  coverage: {
    schema_version: 1,
    from_sec: 1000,
    to_sec: 1000,
    bar_count: 1,
    requested_from_sec: 1000,
    requested_to_sec: 1000,
    truncated: false,
    max_bars: 50_000,
  },
};

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
        market: { ticker: "BTCUSDT", timeframe: "5m", from_ms: 1_000_000, to_ms: 2_000_000 },
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

let chartSliceRef: ReturnType<typeof useWorkbenchChart> | null = null;

function ChartSliceCapture() {
  chartSliceRef = useWorkbenchChart();
  return null;
}

function ShellSliceCapture() {
  useWorkbenchShell();
  return null;
}

function Host({ children }: { children?: ReactNode }) {
  return <WorkbenchProvider initialActiveTab="chart">{children}</WorkbenchProvider>;
}

describe("lazy dense lanes (5B)", () => {
  afterEach(() => {
    cleanup();
    chartSliceRef = null;
    vi.unstubAllEnvs();
    resetChartEventsFlagDisabledNoteForTests();
  });

  beforeEach(() => {
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
    fetchRunTrades.mockResolvedValue({ contract_version: "1.0.0", run_id: "run-a", trades: [] });
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
      candles: [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }],
      emaOverlays: [],
    });
    fetchChartOverlayEma.mockResolvedValue([]);
    fetchChartEvents.mockResolvedValue(ONE_POINT_CHART_EVENTS);
  });

  it("flag off performs single combined signal-trace fetch (no chart-events)", async () => {
    vi.stubEnv("VITE_CHART_EVENTS_API", "0");
    fetchSignalTrace.mockResolvedValue({
      times: [1000],
      meta: TRACE_META,
      long: {
        direction_ok: [false],
        blockers_ok: [false],
        setup_ok: [false],
        trigger_ok: [false],
        risk_ok: [false],
        signal_entry: [false],
        stop_ready: [false],
        portfolio_entry: [false],
        internals: {},
      },
      short: {
        direction_ok: [false],
        blockers_ok: [false],
        setup_ok: [false],
        trigger_ok: [false],
        risk_ok: [false],
        signal_entry: [false],
        stop_ready: [false],
        portfolio_entry: [false],
        internals: {},
      },
      component_events: [CHART_EVENTS_MARKER],
    });

    render(
      <Host>
        <ChartSliceCapture />
        <ShellSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchSignalTrace).toHaveBeenCalledTimes(1);
    });
    expect(fetchChartEvents).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(chartSliceRef?.chartViewModel.componentEvents).toEqual([CHART_EVENTS_MARKER]);
    });
  });
});
