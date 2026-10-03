/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from "react";
import { StrictMode } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  RunDetail,
  RunSummary,
  SignalTraceBundle,
  TradeRecord,
  WorkbenchTab,
} from "@/api/types";
import { clearMarketResourceCache } from "@/features/chart/marketResourceCache";
import { makeTradeRecord } from "@/features/chart/testFixtures/tradeRecordFixtures";
import { CHART_RENDER_WINDOW_SIZE } from "@/features/chart/chartViewWindow";
import { resolveRunMarketView } from "@/features/chart/runMarketView";
import {
  resolveMarketTargetWindow,
} from "@/features/chart/workbenchMarketLoad";
import { installSplitMarketWindowMocks, mockCandlesWindowBundle, mockEmaWindowBundle } from "@/test/marketWindowApiMocks";
import { dbgExport, dbgReset, PIPELINE_DEBUG_STEPS as DBG } from "@/shared/diagnostics/pipelineDebug";
import {
  WorkbenchProvider,
  useWorkbench,
  useWorkbenchChart,
} from "@/shared/context/WorkbenchContext";
import { useWorkbenchRenderViewport } from "@/shared/context/WorkbenchRenderViewportContext";
import { SelectRunOnMount } from "@/test/selectRun";

const fetchRunDetail = vi.fn<typeof import("@/api/client").fetchRunDetail>();
const fetchRunTrades = vi.fn<typeof import("@/api/client").fetchRunTrades>();
const fetchRunMetrics = vi.fn<typeof import("@/api/client").fetchRunMetrics>();
const fetchManagedPolicyEvents = vi.fn<typeof import("@/api/client").fetchManagedPolicyEvents>();
const fetchRunSummaries = vi.fn<typeof import("@/api/client").fetchRunSummaries>();
const fetchConfigState = vi.fn<typeof import("@/api/client").fetchConfigState>();
const fetchCandlesWindow = vi.fn<typeof import("@/api/client").fetchCandlesWindow>();
const fetchEmaWindow = vi.fn<typeof import("@/api/client").fetchEmaWindow>();
const fetchChartMarketBundle = vi.fn<typeof import("@/api/client").fetchChartMarketBundle>();
const fetchSignalTrace = vi.fn<typeof import("@/api/client").fetchSignalTrace>();
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
  fetchRunSummaries: (...args: Parameters<typeof fetchRunSummaries>) =>
    fetchRunSummaries(...args),
  fetchConfigState: (...args: Parameters<typeof fetchConfigState>) =>
    fetchConfigState(...args),
  fetchCandlesWindow: (...args: Parameters<typeof fetchCandlesWindow>) =>
    fetchCandlesWindow(...args),
  fetchEmaWindow: (...args: Parameters<typeof fetchEmaWindow>) => fetchEmaWindow(...args),
  fetchChartMarketBundle: (...args: Parameters<typeof fetchChartMarketBundle>) =>
    fetchChartMarketBundle(...args),
  fetchSignalTrace: (...args: Parameters<typeof fetchSignalTrace>) =>
    fetchSignalTrace(...args),
  fetchChartOverlayEma: (...args: Parameters<typeof fetchChartOverlayEma>) =>
    fetchChartOverlayEma(...args),
  selectSavedConfig: vi.fn(),
}));

const EMPTY_SIGNAL_TRACE: SignalTraceBundle = {
  times: [],
  meta: {
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
  },
  long: {
    direction_ok: [],
    blockers_ok: [],
    setup_ok: [],
    trigger_ok: [],
    risk_ok: [],
    signal_entry: [],
    stop_ready: [],
    portfolio_entry: [],
    internals: {},
  },
  short: {
    direction_ok: [],
    blockers_ok: [],
    setup_ok: [],
    trigger_ok: [],
    risk_ok: [],
    signal_entry: [],
    stop_ready: [],
    portfolio_entry: [],
    internals: {},
  },
};

const ONE_POINT_SIGNAL_TRACE: SignalTraceBundle = {
  ...EMPTY_SIGNAL_TRACE,
  times: [1000],
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
};

const ONE_POINT_HTF_SIGNAL_TRACE: SignalTraceBundle = {
  ...ONE_POINT_SIGNAL_TRACE,
  htf_context: {
    state: ["up"],
    fast: [101],
    anchor: [99],
    slow: [97],
    meta: {},
  },
};

const DEFAULT_CHART_CANDLES = [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1.5 }];

function makeRunSummary(run_id: string, created_at_utc: string): RunSummary {
  return {
    contract_version: "research_run_summary.v1",
    run_id,
    created_at_utc,
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
  };
}

const RUNS: RunSummary[] = [
  makeRunSummary("run-a", "2026-01-01T00:00:00Z"),
  makeRunSummary("run-b", "2026-01-02T00:00:00Z"),
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
        market: {
          ticker: "BTCUSDT",
          timeframe: "5m",
          from_ms: 1_000_000,
          to_ms: 2_000_000,
        },
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

function makeTrades(_runId: string): TradeRecord[] {
  return [
    makeTradeRecord({
      trade_id: "1",
      position_id: "position-1",
      instance_id: "instance_1",
      side: "long",
      entry_time_ms: 1_100_000,
      exit_time_ms: 1_200_000,
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
      exit_time_ms: 1_400_000,
      entry_price: "102",
      exit_price: "103",
      exit_reason: "signal:exit",
      net_pnl: "1",
      net_return_pct: "0.01",
    }),
  ];
}

function makeHtfReport(runId: string): RunDetail {
  const report = makeReport(runId);
  return {
    ...report,
    strategy_spec: {
      ...report.strategy_spec,
      contexts: {
        htf_1: {
          component_id: "htf_context",
          timeframe: "4h",
          fast_period: 21,
          anchor_period: 55,
          slow_period: 144,
        },
      },
      trade_management: {
        exit_policy: {
          context_consumption: {
            context_ref: "htf_1",
          },
          always_on: {
            exits: [],
          },
        },
      },
    },
  };
}

let workbenchRef: ReturnType<typeof useWorkbench> | null = null;
let chartSliceRef: ReturnType<typeof useWorkbenchChart> | null = null;
let renderViewportRef: ReturnType<typeof useWorkbenchRenderViewport> | null = null;

function WorkbenchCapture() {
  workbenchRef = useWorkbench();
  return (
    <div
      data-report-status={workbenchRef.reportLoadStatus}
      data-instance-id={workbenchRef.instanceId}
      data-active-tab={workbenchRef.activeTab}
    />
  );
}

function ChartSliceCapture() {
  chartSliceRef = useWorkbenchChart();
  renderViewportRef = useWorkbenchRenderViewport();
  return null;
}

function Host({
  children,
  initialActiveTab,
  selectRunId = RUNS[0].run_id,
}: {
  children?: ReactNode;
  initialActiveTab?: WorkbenchTab;
  /** The workbench starts without a selected run; pass `null` to keep it that way. */
  selectRunId?: string | null;
}) {
  return (
    <WorkbenchProvider initialActiveTab={initialActiveTab}>
      {selectRunId !== null && <SelectRunOnMount runId={selectRunId} />}
      {children}
    </WorkbenchProvider>
  );
}

describe("Workbench report-load invariant", () => {
  afterEach(() => {
    cleanup();
    workbenchRef = null;
    chartSliceRef = null;
    renderViewportRef = null;
  });

  beforeEach(() => {
    workbenchRef = null;
    chartSliceRef = null;
    renderViewportRef = null;
    vi.clearAllMocks();
    clearMarketResourceCache();
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
      trades: makeTrades(runId),
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
    installDefaultMarketMocks();
    fetchSignalTrace.mockResolvedValue(EMPTY_SIGNAL_TRACE);
    fetchChartOverlayEma.mockResolvedValue([]);
  });

  it("calls fetchRunDetail exactly once on mount", async () => {
    render(
      <Host>
        <WorkbenchCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchRunDetail).toHaveBeenCalledTimes(1);
    });
    expect(fetchRunDetail).toHaveBeenCalledWith("run-a");
  });

  it("run still becomes ready when managed-policy-events fetch fails (optional projection, not core run load)", async () => {
    const { ApiError } = await import("@/api/client");
    fetchManagedPolicyEvents.mockRejectedValue(new ApiError(404, "managed-policy trace unavailable"));

    render(
      <Host>
        <WorkbenchCapture />
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(workbenchRef?.reportLoadStatus).toBe("ready");
    });
    expect(workbenchRef?.runDetail).not.toBeNull();
    expect(chartSliceRef?.managedPolicyEventsLoadStatus).toBe("unavailable");
    expect(chartSliceRef?.managedPolicyEvents).toEqual([]);
  });

  it("starts without a selected run and does not load the run list or any run", async () => {
    render(
      <Host selectRunId={null}>
        <WorkbenchCapture />
      </Host>,
    );

    await Promise.resolve();
    expect(workbenchRef?.selectedRunId).toBeNull();
    expect(fetchRunSummaries).not.toHaveBeenCalled();
    expect(fetchRunDetail).not.toHaveBeenCalled();
  });

  it("loads exactly the run that is selected explicitly", async () => {
    fetchRunSummaries.mockResolvedValue([
      makeRunSummary("run-newest", "2026-01-03T00:00:00Z"),
      makeRunSummary("run-oldest", "2026-01-01T00:00:00Z"),
    ]);

    render(
      <Host selectRunId="run-oldest">
        <WorkbenchCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchRunDetail).toHaveBeenCalledTimes(1);
    });
    expect(fetchRunDetail).toHaveBeenCalledWith("run-oldest");
    expect(fetchRunSummaries).not.toHaveBeenCalled();
  });

  it("does not refetch report when trade is selected", async () => {
    render(
      <Host>
        <WorkbenchCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(workbenchRef?.reportLoadStatus).toBe("ready");
    });
    await waitFor(() => {
      expect(workbenchRef?.selectedTradeId).toBe("2");
    });
    const callsAfterReady = fetchRunDetail.mock.calls.length;

    act(() => {
      workbenchRef!.selectTrade(1);
    });

    await waitFor(() => {
      expect(workbenchRef?.selectedTradeId).toBe(1);
    });
    expect(fetchRunDetail.mock.calls.length).toBe(callsAfterReady);
  });

  it("fetches report again when run changes", async () => {
    render(
      <Host>
        <WorkbenchCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(workbenchRef?.reportLoadStatus).toBe("ready");
    });
    expect(fetchRunDetail).toHaveBeenCalledTimes(1);

    act(() => {
      workbenchRef!.setSelectedRunId("run-b");
    });

    await waitFor(() => {
      expect(fetchRunDetail).toHaveBeenCalledTimes(2);
    });
    expect(fetchRunDetail).toHaveBeenLastCalledWith("run-b");
  });

  it("keeps HTF context EMA overlays sourced from signal trace after context split", async () => {
    fetchRunDetail.mockImplementation(async (runId: string) => makeHtfReport(runId));
    fetchRunTrades.mockImplementation(async (runId: string) => ({
      contract_version: "1.0.0",
      run_id: runId,
      trades: makeTrades(runId),
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
    installDefaultMarketMocks([]);
    fetchSignalTrace.mockResolvedValue(ONE_POINT_HTF_SIGNAL_TRACE);

    render(
      <Host>
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchSignalTrace).toHaveBeenCalledTimes(1);
    });
    expect(fetchSignalTrace.mock.calls[0]![0].contextOverlayRef).toBe("htf_1");

    await waitFor(() => {
      expect(
        chartSliceRef?.chartViewModel.displayAuxEmaOverlays.some(
          (overlay) => overlay.id === "htf_fast" && overlay.dashed && overlay.points[0]?.value === 101,
        ),
      ).toBe(true);
    });
  });
});

describe("Workbench missing-range trace scheduling", () => {
  afterEach(() => {
    cleanup();
    workbenchRef = null;
    chartSliceRef = null;
    renderViewportRef = null;
  });

  beforeEach(() => {
    workbenchRef = null;
    chartSliceRef = null;
    renderViewportRef = null;
    vi.clearAllMocks();
    clearMarketResourceCache();
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
      trades: makeTrades(runId),
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
    fetchChartOverlayEma.mockResolvedValue([]);
  });

  it("schedules one normalized chunk fetch on full display cache miss", async () => {
    installDefaultMarketMocks([]);
    fetchSignalTrace.mockResolvedValue(ONE_POINT_SIGNAL_TRACE);

    render(
      <Host>
        <WorkbenchCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchSignalTrace).toHaveBeenCalledTimes(1);
    });
    expect(fetchSignalTrace.mock.calls[0]![0]).toMatchObject({
      fromMs: 1_000_000,
      toOpenTimeMs: 1_000_000,
    });
  });

  it("does not duplicate fetch once display cache covers the committed window", async () => {
    installDefaultMarketMocks([]);
    fetchSignalTrace.mockResolvedValue(ONE_POINT_SIGNAL_TRACE);

    render(
      <Host>
        <WorkbenchCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchSignalTrace).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(fetchSignalTrace).toHaveBeenCalledTimes(1);
  });
});

const ANCHOR_EMA_OVERLAYS = [
  {
    role: "fast" as const,
    period: 200,
    points: [{ time: 1000, value: 1, kind: "chart_overlay_ema" as const }],
  },
  {
    role: "anchor" as const,
    period: 500,
    points: [{ time: 1000, value: 2, kind: "chart_overlay_ema" as const }],
  },
  {
    role: "slow" as const,
    period: 1000,
    points: [{ time: 1000, value: 3, kind: "chart_overlay_ema" as const }],
  },
];

function installDefaultMarketMocks(
  emaOverlays: typeof ANCHOR_EMA_OVERLAYS = ANCHOR_EMA_OVERLAYS,
) {
  installSplitMarketWindowMocks({
    fetchCandlesWindow,
    fetchEmaWindow,
    candles: DEFAULT_CHART_CANDLES,
    emaOverlays,
  });
}

const WIDE_REPORT_TO_MS = 20_000_000_000_000;
const TAIL_TIMEFRAME_MS = 300_000;

function makeWideTailPanReport(runId: string): RunDetail {
  const report = makeReport(runId);
  return {
    ...report,
    result: {
      ...report.result,
      strategy_evaluation: {
        ...report.result.strategy_evaluation,
        market: {
          ...report.result.strategy_evaluation.market,
          from_ms: 0,
          to_ms: WIDE_REPORT_TO_MS,
        },
      },
    },
  };
}

function resolveTailFocusLeftEdgeSec(): number {
  const report = makeWideTailPanReport("run-a");
  const view = resolveRunMarketView({
    runDetail: report,
    chartTimeframe: "5m",
    reloadToken: 0,
  });
  const focusWindow = resolveMarketTargetWindow(view, null);
  return Math.floor(focusWindow.fromMs / 1000);
}

function installTailLeftEdgeMarketMocks() {
  const leftEdgeSec = resolveTailFocusLeftEdgeSec();
  const focusFromMs = leftEdgeSec * 1000;
  const focusCandle = { time: leftEdgeSec, open: 1, high: 2, low: 0.5, close: 1.5 };
  installSplitMarketWindowMocks({
    fetchCandlesWindow,
    fetchEmaWindow,
    candles: [focusCandle],
    emaOverlays: ANCHOR_EMA_OVERLAYS,
  });
  fetchCandlesWindow.mockImplementation(async ({ fromMs, toOpenTimeMs }) => {
    const candles =
      fromMs < focusFromMs
        ? [
            { time: Math.floor(fromMs / 1000), open: 0.9, high: 1.1, low: 0.8, close: 1.0 },
            focusCandle,
          ]
        : [focusCandle];
    return mockCandlesWindowBundle(candles, fromMs, toOpenTimeMs + TAIL_TIMEFRAME_MS);
  });
  return leftEdgeSec;
}

describe("Workbench split market resource cache", () => {
  afterEach(() => {
    cleanup();
    workbenchRef = null;
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    workbenchRef = null;
    vi.clearAllMocks();
    clearMarketResourceCache();
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
      trades: makeTrades(runId),
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
    fetchChartOverlayEma.mockResolvedValue([]);
    fetchSignalTrace.mockResolvedValue(EMPTY_SIGNAL_TRACE);
  });

  it("cold open becomes candle-ready before deferred EMA overlays arrive", async () => {
    installDefaultMarketMocks(ANCHOR_EMA_OVERLAYS);
    const emaDeferreds = new Map<
      number,
      ReturnType<typeof createDeferred<Awaited<ReturnType<typeof fetchEmaWindow>>>>
    >();
    fetchEmaWindow.mockImplementation(async (params) => {
      const deferred = createDeferred<Awaited<ReturnType<typeof fetchEmaWindow>>>();
      emaDeferreds.set(params.period, deferred);
      const overlay = ANCHOR_EMA_OVERLAYS.find((candidate) => candidate.period === params.period);
      return deferred.promise.then(() =>
        mockEmaWindowBundle(
          overlay?.points ?? [],
          params.fromMs,
          params.toOpenTimeMs + 300_000,
        ),
      );
    });

    render(
      <Host>
        <WorkbenchCapture />
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(fetchCandlesWindow).toHaveBeenCalledTimes(1);
      expect(workbenchRef?.marketLoadStatus).toBe("ready");
    });
    expect(fetchChartMarketBundle).not.toHaveBeenCalled();
    expect(workbenchRef?.marketCandlesCount).toBeGreaterThan(0);
    expect(chartSliceRef?.chartViewModel.emaOverlays).toHaveLength(0);

    await act(async () => {
      for (const overlay of ANCHOR_EMA_OVERLAYS) {
        emaDeferreds.get(overlay.period)?.resolve(
          mockEmaWindowBundle(overlay.points, 0, 2_000_000),
        );
      }
    });

    await waitFor(() => {
      expect(chartSliceRef?.chartViewModel.emaOverlays).toHaveLength(3);
    });
  });

  it("keeps cachedBundle reference stable across unrelated renders", async () => {
    installDefaultMarketMocks(ANCHOR_EMA_OVERLAYS);

    render(
      <Host>
        <WorkbenchCapture />
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(workbenchRef?.marketLoadStatus).toBe("ready");
      expect(chartSliceRef?.chartViewModel.emaOverlays).toHaveLength(3);
    });

    const initialEma = chartSliceRef?.chartViewModel.emaOverlays;
    await act(async () => {
      workbenchRef!.setChartShowSetupMarkers(false);
    });
    expect(chartSliceRef?.chartViewModel.emaOverlays).toBe(initialEma);
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("Workbench abort + in-flight dedupe", () => {
  afterEach(() => {
    cleanup();
    workbenchRef = null;
  });

  beforeEach(() => {
    workbenchRef = null;
    vi.clearAllMocks();
    clearMarketResourceCache();
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
      trades: makeTrades(runId),
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
    fetchChartOverlayEma.mockResolvedValue([]);
    fetchSignalTrace.mockResolvedValue(EMPTY_SIGNAL_TRACE);
  });

  it("signalTrace: StrictMode remount with same traceRequestKey resolves the trace fetch", async () => {
    installDefaultMarketMocks([]);
    const deferred = createDeferred<SignalTraceBundle>();
    fetchSignalTrace.mockReturnValue(deferred.promise);

    render(
      <StrictMode>
        <Host>
          <WorkbenchCapture />
        </Host>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(fetchSignalTrace.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    await act(async () => {
      deferred.resolve(EMPTY_SIGNAL_TRACE);
    });

    await waitFor(() => {
      expect(fetchSignalTrace).toHaveBeenCalled();
    });
  });
});

describe("Workbench market pan prefetch", () => {
  afterEach(() => {
    cleanup();
    workbenchRef = null;
    chartSliceRef = null;
    renderViewportRef = null;
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    workbenchRef = null;
    chartSliceRef = null;
    renderViewportRef = null;
    vi.clearAllMocks();
    clearMarketResourceCache();
    dbgReset();
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
      trades: makeTrades(runId),
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
    installDefaultMarketMocks(ANCHOR_EMA_OVERLAYS);
    fetchSignalTrace.mockResolvedValue(EMPTY_SIGNAL_TRACE);
    fetchChartOverlayEma.mockResolvedValue([]);
  });

  it("does not prefetch on programmatic viewport range changes", async () => {
    render(
      <Host>
        <WorkbenchCapture />
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(workbenchRef?.marketLoadStatus).toBe("ready");
    });
    const callsBefore = fetchCandlesWindow.mock.calls.length;

    act(() => {
      renderViewportRef!.dispatchChartInteraction({ type: "programmatic_viewport_start" });
      renderViewportRef!.dispatchChartInteraction({
        type: "visible_range_changed",
        visible: { from: 0, to: 10 },
        anchorTimeSec: 1000,
      });
      renderViewportRef!.dispatchChartInteraction({ type: "programmatic_viewport_end" });
    });

    const prefetchMarks = dbgExport().steps.filter(
      (row) => row.step === DBG.market.panPrefetchDecision,
    );
    expect(prefetchMarks).toHaveLength(0);
    expect(fetchCandlesWindow.mock.calls.length).toBe(callsBefore);
  });

  it("evaluates pan prefetch on user visible-range changes without refocusing trade", async () => {
    render(
      <Host>
        <WorkbenchCapture />
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(workbenchRef?.marketLoadStatus).toBe("ready");
    });
    const viewportSeqBefore = renderViewportRef!.chartViewportCommandSeq;
    const tradeIdBefore = workbenchRef!.selectedTradeId;

    act(() => {
      renderViewportRef!.dispatchChartInteraction({ type: "pointerdown" });
      renderViewportRef!.dispatchChartInteraction({
        type: "visible_range_changed",
        visible: { from: 0, to: 10 },
        anchorTimeSec: 1000,
      });
      renderViewportRef!.dispatchChartInteraction({ type: "pointerup" });
    });

    const prefetchMark = dbgExport().steps
      .filter((row) => row.step === DBG.market.panPrefetchDecision)
      .at(-1);
    expect(prefetchMark?.last_meta?.reason).not.toBe("not_user_pan");
    expect(workbenchRef!.selectedTradeId).toBe(tradeIdBefore);
    expect(renderViewportRef!.chartViewportCommandSeq).toBe(viewportSeqBefore);
  });

  it("applies pan-left prefetch coverage and fetches the expanded range", async () => {
    fetchRunDetail.mockImplementation(async (runId: string) => makeWideTailPanReport(runId));
    fetchRunTrades.mockImplementation(async (runId: string) => ({
      contract_version: "1.0.0",
      run_id: runId,
      trades: makeTrades(runId),
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
    const leftEdgeSec = installTailLeftEdgeMarketMocks();

    render(
      <Host>
        <WorkbenchCapture />
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(workbenchRef?.marketLoadStatus).toBe("ready");
    });

    act(() => {
      workbenchRef!.selectTrade(null);
    });

    await waitFor(() => {
      expect(workbenchRef?.selectedTradeId).toBeNull();
      expect(workbenchRef?.marketLoadStatus).toBe("ready");
      expect(renderViewportRef!.chartView.candles.length).toBeGreaterThan(0);
    });

    const firstCandleBefore = renderViewportRef!.chartView.candles[0]!.time;
    const boundsBefore = renderViewportRef!.renderWindowBounds?.fromSec;

    const callsBefore = fetchCandlesWindow.mock.calls.length;

    act(() => {
      renderViewportRef!.dispatchChartInteraction({ type: "pointerdown" });
      renderViewportRef!.dispatchChartInteraction({
        type: "visible_range_changed",
        visible: { from: 0, to: 0 },
        anchorTimeSec: leftEdgeSec,
      });
      renderViewportRef!.dispatchChartInteraction({ type: "pointerup" });
    });

    await waitFor(() => {
      const prefetchMark = dbgExport().steps
        .filter((row) => row.step === DBG.market.panPrefetchDecision)
        .at(-1);
      expect(prefetchMark?.last_meta?.reason).toBe("near_left_edge");
    });

    const expandedFromMs = dbgExport().steps
      .filter((row) => row.step === DBG.market.panPrefetchDecision)
      .at(-1)?.last_meta?.expanded_from_ms;

    await waitFor(() => {
      const fetchStart = dbgExport().steps
        .filter((row) => row.step === DBG.load.marketFetchStart)
        .at(-1);
      expect(fetchStart?.last_meta?.targetFromMs).toBe(expandedFromMs);
    });
    expect(fetchCandlesWindow.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(expandedFromMs).toBeLessThan(
      WIDE_REPORT_TO_MS - CHART_RENDER_WINDOW_SIZE * TAIL_TIMEFRAME_MS,
    );

    await waitFor(() => {
      const firstCandleAfter = renderViewportRef!.chartView.candles[0]!.time;
      const boundsAfter = renderViewportRef!.renderWindowBounds?.fromSec;
      const movedCandles = firstCandleAfter < firstCandleBefore;
      const movedBounds =
        boundsBefore !== undefined &&
        boundsAfter !== undefined &&
        boundsAfter < boundsBefore;
      expect(movedCandles || movedBounds).toBe(true);
    });
  });

  it("resets expanded coverage back to focus after trade selection changes", async () => {
    fetchRunDetail.mockImplementation(async (runId: string) => makeWideTailPanReport(runId));
    fetchRunTrades.mockImplementation(async (runId: string) => ({
      contract_version: "1.0.0",
      run_id: runId,
      trades: makeTrades(runId),
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
    const leftEdgeSec = installTailLeftEdgeMarketMocks();

    render(
      <Host>
        <WorkbenchCapture />
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(workbenchRef?.marketLoadStatus).toBe("ready");
    });

    act(() => {
      workbenchRef!.selectTrade(null);
    });

    await waitFor(() => {
      expect(workbenchRef?.selectedTradeId).toBeNull();
      expect(workbenchRef?.marketLoadStatus).toBe("ready");
    });

    act(() => {
      renderViewportRef!.dispatchChartInteraction({ type: "pointerdown" });
      renderViewportRef!.dispatchChartInteraction({
        type: "visible_range_changed",
        visible: { from: 0, to: 0 },
        anchorTimeSec: leftEdgeSec,
      });
      renderViewportRef!.dispatchChartInteraction({ type: "pointerup" });
    });

    await waitFor(() => {
      const prefetchMark = dbgExport().steps
        .filter((row) => row.step === DBG.market.panPrefetchDecision)
        .at(-1);
      expect(prefetchMark?.last_meta?.reason).toBe("near_left_edge");
    });

    const expandedFromMs = dbgExport().steps
      .filter((row) => row.step === DBG.market.panPrefetchDecision)
      .at(-1)?.last_meta?.expanded_from_ms;

    await waitFor(() => {
      const fetchStart = dbgExport().steps
        .filter((row) => row.step === DBG.load.marketFetchStart)
        .at(-1);
      expect(fetchStart?.last_meta?.targetFromMs).toBe(expandedFromMs);
    });

    const report = makeWideTailPanReport("run-a");
    const view = resolveRunMarketView({
      runDetail: report,
      chartTimeframe: "5m",
      reloadToken: 0,
    });
    const tradeFocusFromMs = resolveMarketTargetWindow(view, 1_100_000).fromMs;

    dbgReset();

    act(() => {
      workbenchRef!.selectTrade(1);
    });

    await waitFor(() => {
      expect(workbenchRef?.selectedTradeId).toBe(1);
    });

    await waitFor(() => {
      const fetchStart = dbgExport().steps
        .filter((row) => row.step === DBG.load.marketFetchStart)
        .at(-1);
      expect(fetchStart?.last_meta?.targetFromMs).toBe(tradeFocusFromMs);
      expect(fetchStart?.last_meta?.targetFromMs).not.toBe(expandedFromMs);
    });
  });

  it("dedupes pan prefetch decisions for identical visible-range samples", async () => {
    render(
      <Host>
        <WorkbenchCapture />
        <ChartSliceCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(workbenchRef?.marketLoadStatus).toBe("ready");
    });

    act(() => {
      renderViewportRef!.dispatchChartInteraction({ type: "pointerdown" });
      for (let i = 0; i < 5; i += 1) {
        renderViewportRef!.dispatchChartInteraction({
          type: "visible_range_changed",
          visible: { from: 0, to: 10 },
          anchorTimeSec: 1000,
        });
      }
      renderViewportRef!.dispatchChartInteraction({ type: "pointerup" });
    });

    const prefetchMarks = dbgExport().steps.filter(
      (row) => row.step === DBG.market.panPrefetchDecision,
    );
    expect(prefetchMarks.length).toBeLessThanOrEqual(1);
  });

  it("cold open still fetches candles-window once and ema-window once per period", async () => {
    render(
      <Host>
        <WorkbenchCapture />
      </Host>,
    );

    await waitFor(() => {
      expect(workbenchRef?.marketLoadStatus).toBe("ready");
    });
    expect(fetchCandlesWindow).toHaveBeenCalledTimes(1);
    expect(fetchEmaWindow).toHaveBeenCalledTimes(3);
  });
});

