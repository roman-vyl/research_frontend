import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from "react";

import {
  ApiError,
  fetchConfigState,
  fetchManagedPolicyEvents,
  fetchRunDetail,
  fetchRunMetrics,
  fetchRunSummaries,
  fetchRunTrades,
  selectSavedConfig,
} from "@/api/client";
import {
  CHART_MARKET_TIMEFRAME,
  type ChartBar,
  type ConfigListEntry,
  type ConfigStateResponse,
  type ManagedPolicyEvent,
  type RunDetail,
  type RunMetrics,
  type RunSummary,
  type TradeRecord,
  type SignalTraceBundle,
  type ComponentEvent,
  type StrategyConfigDraft,
  type WorkbenchTab,
} from "@/api/types";
import { COMPOSER_DEFAULT_FAMILY, createBlankConfigDraft } from "@/features/composer/composerDraft";
import { resolveChartTimeframeMs } from "@/features/chart/chartTimeframeMs";
import { getCandles } from "@/features/chart/marketResourceCache";
import type { WindowCommitResult } from "@/features/chart/runtime/chartRuntime";
import type { ChartViewModel } from "@/features/chart/runtime/chartViewModel";
import {
  queueTraceFetchIntent,
  takeCommittedTraceFetchIntent,
} from "@/features/chart/runtime/traceDisplayOrchestrator";
import { flushLanesLoadDebug } from "@/features/chart/runtime/workbenchTraceNetworkLoad";
import {
  defaultChartContextOverlayRef,
  strategyContextRefOptions,
} from "@/features/chart/strategyContexts";
import { candleRangeMs, selectedTradeEntryMarkerInView } from "@/features/chart/chartMarkers";
import {
  buildRenderWindowBoundsKey,
} from "@/features/chart/chartRenderWindowDisplay";
import {
  buildSessionCacheIdentity,
} from "@/features/chart/signalTraceBundleSessionCache";
import {
  buildTraceDisplayCacheKey,
} from "@/features/chart/signalTraceDisplayCache";
import {
  type TraceDisplayState,
} from "@/features/chart/traceDisplayApply";
import {
  defaultClosedTradeSelection,
  findTradeById,
  formatTradeDisplayNumber,
  isKnownTrade,
  resolveSelectedTradeEntryTimeMs,
  resolveTradeEntryTimeMs,
} from "@/features/chart/tradeLookup";
import { hasManagedPolicyEvents } from "@/features/chart/tradeManagementChartEvents";
import {
  buildRunMarketViewIdentity,
  resolveRunMarketView,
  type RunMarketView,
  type RunMarketViewIdentity,
} from "@/features/chart/runMarketView";
import {
  type SignalTraceLoadStatus,
} from "@/shared/context/signalTraceLoadPolicy";
import { evaluateSignalTraceBootstrap } from "@/shared/context/signalTraceBootstrap";
import {
  dbgMark,
  PIPELINE_DEBUG_STEPS as DBG,
} from "@/shared/diagnostics/pipelineDebug";
import {
  dbgMarkCutover,
  dbgTimedSyncCutover,
  emitCutoverDomainOwnersSnapshot,
} from "@/features/workbenchChartRuntime/chartRuntimeCutoverTelemetry";
import {
  createPhase63EAuxOverlayOwnerState,
  resetPhase63EAuxOverlayOwner,
  resolvePhase63EDisplayCacheHasWindowData,
  resolvePhase63EAuxOverlaySnapshot,
  resolvePhase63EModelRuntimeSlice,
  runPhase63EApplyHtfFromDisplaySlice,
  runPhase63ELoadBffAuxOverlays,
  runPhase63ESyncHtfOverlaysFromTraceFallback,
  syncPhase63EAuxOverlaySpecs,
  type Phase63EAuxOverlayOwnerState,
} from "@/features/workbenchChartRuntime/phase63EAuxOverlayBridge";
import {
  applyPhase63FPanPrefetchCoverage,
  cancelPhase63FMarketLoad,
  createPhase63FMarketLoadOwnerState,
  evaluatePhase63FPanPrefetch,
  marketBundleFromSnapshot,
  resetPhase63FMarketLoadOwner,
  resolvePhase63FMarketBundleSnapshot,
  resolvePhase63FMarketReactSync,
  resolvePhase63FMarketTargetWindows,
  resolvePhase63FMarketView,
  runPhase63FMarketLoad,
  type Phase63FMarketLoadOwnerState,
} from "@/features/workbenchChartRuntime/phase63FMarketLoadBridge";
import {
  WorkbenchRenderViewportProvider,
  useWorkbenchRenderViewport,
  type WorkbenchRenderViewportCallbacks,
  type WorkbenchRenderViewportInputs,
} from "@/shared/context/WorkbenchRenderViewportContext";
import { resetTraceCoordinator } from "@/features/workbenchChartRuntime/traceRuntime";
import {
  createPhase63DTraceEventsOwnerState,
  logPhase63DTraceCoverage,
  resetPhase63DTraceDisplayCache,
  resetPhase63DTraceSessionCache,
  resolvePhase63DLanesSnapshot,
  runPhase63DApplyTraceDisplayForWindow,
  runPhase63DTraceLoadCycle,
  shouldPhase63DFinalizeTraceDisplay,
  type Phase63DTraceEventsOwnerState,
} from "@/features/workbenchChartRuntime/phase63DTraceEventsBridge";
export type ReportLoadStatus = "loading" | "ready" | "error";
/**
 * managed-policy-events is an optional chart-diagnostics projection, not part
 * of core run identity — a legacy artifact bundle (predates
 * managed_policy_events.json) or a transient failure here must not block the
 * run from loading. "unavailable" is the backend's explicit
 * managed_policy_trace_unavailable (404) for legacy bundles, distinguished
 * from "error" (unexpected failure) and "ready" with an empty array (managed
 * policy simply wasn't enabled for this run).
 */
export type ManagedPolicyEventsLoadStatus = "idle" | "loading" | "ready" | "unavailable" | "error";
export type ConfigLoadStatus = "loading" | "ready" | "empty" | "error";
export type MarketLoadStatus = "idle" | "loading" | "ready" | "error";
export type CandlesSource = "market" | "unavailable";
export type { SignalTraceLoadStatus };

type WorkbenchState = {
  symbol: string;
  timeframe: string;
  chartTimeframe: string;
  reportTimeframe: string | null;
  timeframeMismatch: boolean;
  activeTab: WorkbenchTab;
  setActiveTab: (tab: WorkbenchTab) => void;
  reportLoadStatus: ReportLoadStatus;
  reportError: string | null;
  marketLoadStatus: MarketLoadStatus;
  marketError: string | null;
  runs: RunSummary[];
  selectedRunId: string | null;
  setSelectedRunId: (runId: string) => void;
  runDetail: RunDetail | null;
  instanceId: string | null;
  runTrades: TradeRecord[];
  runMetrics: RunMetrics | null;
  managedPolicyEvents: ManagedPolicyEvent[];
  managedPolicyEventsLoadStatus: ManagedPolicyEventsLoadStatus;
  /** Renderer-facing projection; prefer over individual chart* fields in ChartPanel. */
  chartViewModel: ChartViewModel;
  htfAuxEmaOverlayStale: boolean;
  componentEventsStale: boolean;
  chartShowEntryBlockMarkers: boolean;
  setChartShowEntryBlockMarkers: (show: boolean) => void;
  chartShowExitSignalMarkers: boolean;
  setChartShowExitSignalMarkers: (show: boolean) => void;
  chartShowSetupMarkers: boolean;
  setChartShowSetupMarkers: (show: boolean) => void;
  chartShowTradeManagementPhaseMarkers: boolean;
  setChartShowTradeManagementPhaseMarkers: (show: boolean) => void;
  chartShowTradeManagementExitMarkers: boolean;
  setChartShowTradeManagementExitMarkers: (show: boolean) => void;
  chartTradeFocusWarning: string | null;
  marketCandlesCount: number;
  fullCandleRange: { min: number; max: number } | null;
  candlesSource: CandlesSource;
  selectedTradeId: number | string | null;
  selectTrade: (tradeId: number | string | null) => void;
  configDraft: StrategyConfigDraft | null;
  setConfigDraft: (draft: StrategyConfigDraft) => void;
  configLoadStatus: ConfigLoadStatus;
  configLoadError: string | null;
  configList: ConfigListEntry[];
  selectedConfigPath: string | null;
  reloadConfig: () => Promise<void>;
  selectConfig: (experimentId: string) => Promise<void>;
  createNewConfig: () => void;
  reloadReport: () => void;
  refreshRunsAndSelectRun: (runId: string) => Promise<void>;
  contextOverlayRef: string | null;
  setContextOverlayRef: (ref: string | null) => void;
  effectiveContextOverlayRef: string | null;
  contextOverlayRefOptions: string[];
  selectedBarTimeSec: number | null;
  selectBar: (timeSec: number | null) => void;
};

type WorkbenchShellState = Pick<
  WorkbenchState,
  | "activeTab"
  | "setActiveTab"
  | "reportLoadStatus"
  | "reportError"
  | "reloadReport"
>;

type WorkbenchReportState = Pick<
  WorkbenchState,
  | "symbol"
  | "timeframe"
  | "runDetail"
  | "instanceId"
  | "runs"
  | "selectedRunId"
  | "setSelectedRunId"
  | "selectedTradeId"
  | "selectTrade"
>;

type WorkbenchComposerState = Pick<
  WorkbenchState,
  | "configDraft"
  | "setConfigDraft"
  | "configLoadStatus"
  | "configLoadError"
  | "configList"
  | "selectedConfigPath"
  | "reloadConfig"
  | "selectConfig"
  | "createNewConfig"
  | "refreshRunsAndSelectRun"
  | "setActiveTab"
>;

type WorkbenchChartState = Pick<
  WorkbenchState,
  | "marketLoadStatus"
  | "marketError"
  | "chartViewModel"
  | "htfAuxEmaOverlayStale"
  | "componentEventsStale"
  | "chartShowEntryBlockMarkers"
  | "setChartShowEntryBlockMarkers"
  | "chartShowExitSignalMarkers"
  | "setChartShowExitSignalMarkers"
  | "chartShowSetupMarkers"
  | "setChartShowSetupMarkers"
  | "chartShowTradeManagementPhaseMarkers"
  | "setChartShowTradeManagementPhaseMarkers"
  | "chartShowTradeManagementExitMarkers"
  | "setChartShowTradeManagementExitMarkers"
  | "chartTimeframe"
  | "reportTimeframe"
  | "timeframeMismatch"
  | "chartTradeFocusWarning"
  | "marketCandlesCount"
  | "fullCandleRange"
  | "candlesSource"
  | "runDetail"
  | "runTrades"
  | "runMetrics"
  | "managedPolicyEvents"
  | "managedPolicyEventsLoadStatus"
  | "selectedTradeId"
  | "selectTrade"
  | "contextOverlayRef"
  | "setContextOverlayRef"
  | "effectiveContextOverlayRef"
  | "contextOverlayRefOptions"
  | "selectedBarTimeSec"
  | "selectBar"
>;

const WorkbenchShellContext = createContext<WorkbenchShellState | null>(null);
const WorkbenchReportContext = createContext<WorkbenchReportState | null>(null);
const WorkbenchComposerContext = createContext<WorkbenchComposerState | null>(null);
const WorkbenchChartContext = createContext<WorkbenchChartState | null>(null);

const EMPTY_TRACE_DISPLAY_STATE: TraceDisplayState = {
  status: "empty",
  fromSec: 0,
  toSec: 0,
  events: [],
  htfSlice: { times: [], htf_context: undefined },
  coveredRanges: [],
  missingRange: null,
};

const EMPTY_RUNS_HINT =
  "No research runs found. Run a backtest from Strategy Composer or locally, e.g. " +
  "python -m research.strategies.ema_pullback.run --config <path>, " +
  "then refresh.";

/** Backend returns runs newest-first by created_at_utc; the first entry is the default run. */
function pickDefaultRunId(runs: RunSummary[]): string | null {
  if (runs.length === 0) return null;
  return runs[0].run_id;
}

export function WorkbenchProvider({
  children,
  initialActiveTab = "chart",
}: {
  children: ReactNode;
  initialActiveTab?: WorkbenchTab;
}) {
  return (
    <WorkbenchProviderInner initialActiveTab={initialActiveTab}>{children}</WorkbenchProviderInner>
  );
}

function WorkbenchProviderInner({
  children,
  initialActiveTab = "chart",
}: {
  children: ReactNode;
  initialActiveTab?: WorkbenchTab;
}) {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>(initialActiveTab);
  const [hasChartEverActivated, setHasChartEverActivated] = useState(false);
  const [configDraft, setConfigDraft] = useState<StrategyConfigDraft | null>(null);
  const [configLoadStatus, setConfigLoadStatus] = useState<ConfigLoadStatus>("loading");
  const [configLoadError, setConfigLoadError] = useState<string | null>(null);
  const [configList, setConfigList] = useState<ConfigListEntry[]>([]);
  const [selectedConfigPath, setSelectedConfigPath] = useState<string | null>(null);

  const [reportLoadStatus, setReportLoadStatus] = useState<ReportLoadStatus>("loading");
  const [reportError, setReportError] = useState<string | null>(null);
  const cachedBundleCandlesRef = useRef<ChartBar[]>([]);
  const phase63FMarketLoadOwnerRef = useRef<Phase63FMarketLoadOwnerState | null>(null);
  if (phase63FMarketLoadOwnerRef.current === null) {
    phase63FMarketLoadOwnerRef.current = createPhase63FMarketLoadOwnerState();
  }
  const phase63FMarketLoadOwner = (): Phase63FMarketLoadOwnerState =>
    phase63FMarketLoadOwnerRef.current!;
  const marketReactState = resolvePhase63FMarketReactSync(phase63FMarketLoadOwner());
  const marketLoadStatus = marketReactState.marketLoadStatus;
  const marketError = marketReactState.marketError;
  const runMarketViewIdentity = marketReactState.runMarketViewIdentity;
  const marketCandlesRevision = phase63FMarketLoadOwner().controller.candlesRevision;
  const marketOverlayRevision = phase63FMarketLoadOwner().controller.overlayRevision;
  const phase63EAuxOverlayOwnerRef = useRef<Phase63EAuxOverlayOwnerState | null>(null);
  if (phase63EAuxOverlayOwnerRef.current === null) {
    phase63EAuxOverlayOwnerRef.current = createPhase63EAuxOverlayOwnerState();
  }
  const phase63EAuxOverlayOwner = (): Phase63EAuxOverlayOwnerState =>
    phase63EAuxOverlayOwnerRef.current!;
  const [auxOverlayRevision, setAuxOverlayRevision] = useState(0);
  const phase63DTraceOwnerRef = useRef<Phase63DTraceEventsOwnerState | null>(null);
  if (phase63DTraceOwnerRef.current === null) {
    phase63DTraceOwnerRef.current = createPhase63DTraceEventsOwnerState();
  }
  const phase63DTraceOwner = (): Phase63DTraceEventsOwnerState => phase63DTraceOwnerRef.current!;
  const [displayCacheVersion, setDisplayCacheVersion] = useState(0);
  const [displayApplyRevision, setDisplayApplyRevision] = useState(0);
  const [chartDisplayComponentEvents, setChartDisplayComponentEvents] = useState<ComponentEvent[]>([]);
  const chartDisplayComponentEventsRef = useRef<ComponentEvent[]>([]);
  const [traceDisplayState, setTraceDisplayState] = useState<TraceDisplayState>(
    EMPTY_TRACE_DISPLAY_STATE,
  );
  const [chartShowEntryBlockMarkers, setChartShowEntryBlockMarkers] = useState(true);
  const [chartShowExitSignalMarkers, setChartShowExitSignalMarkers] = useState(true);
  const [chartShowSetupMarkers, setChartShowSetupMarkers] = useState(true);
  const [chartShowTradeManagementPhaseMarkers, setChartShowTradeManagementPhaseMarkers] =
    useState(false);
  const [chartShowTradeManagementExitMarkers, setChartShowTradeManagementExitMarkers] =
    useState(false);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunIdState] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [runTrades, setRunTrades] = useState<TradeRecord[]>([]);
  const [runMetrics, setRunMetrics] = useState<RunMetrics | null>(null);
  const [managedPolicyEvents, setManagedPolicyEvents] = useState<ManagedPolicyEvent[]>([]);
  const [managedPolicyEventsLoadStatus, setManagedPolicyEventsLoadStatus] =
    useState<ManagedPolicyEventsLoadStatus>("idle");
  const [selectedTradeId, setSelectedTradeId] = useState<number | string | null>(null);
  const [selectedBarTimeSec, setSelectedBarTimeSec] = useState<number | null>(null);
  const [signalTrace, setSignalTrace] = useState<SignalTraceBundle | null>(null);
  const [signalTraceStatus, setSignalTraceStatus] = useState<SignalTraceLoadStatus>("idle");
  const [loadedSignalTraceWindowKey, setLoadedSignalTraceWindowKey] = useState<string | null>(null);
  const [contextOverlayRef, setContextOverlayRef] = useState<string | null>(null);
  const signalTraceStatusRef = useRef<SignalTraceLoadStatus>("idle");
  const selectedTradeIdRef = useRef<number | string | null>(null);
  const applyTraceDisplayRef = useRef<() => void>(() => {});
  const [reloadToken, setReloadToken] = useState(0);
  const prevRunIdForTradeBootstrapRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeTab === "chart") {
      setHasChartEverActivated(true);
    }
  }, [activeTab]);

  const chartHeavyIoEnabled = activeTab === "chart" || hasChartEverActivated;

  const applyTradeFocusSelection = useCallback((trades: readonly TradeRecord[]) => {
    const { tradeId, barTimeSec } = defaultClosedTradeSelection(trades);
    setSelectedTradeId(tradeId);
    setSelectedBarTimeSec(barTimeSec);
  }, []);

  const applyConfigState = useCallback((state: ConfigStateResponse) => {
    setConfigList(state.configs);
    setSelectedConfigPath(state.selected_path);
    if (state.draft) {
      setConfigDraft(state.draft);
      setConfigLoadStatus("ready");
      setConfigLoadError(null);
      return;
    }
    setConfigDraft(null);
    if (state.configs.length === 0) {
      setConfigLoadStatus("empty");
      setConfigLoadError(null);
      return;
    }
    setConfigLoadStatus("error");
    setConfigLoadError("Saved config could not be loaded.");
  }, []);

  const reloadConfig = useCallback(async () => {
    setConfigLoadStatus((status) => (status === "ready" ? status : "loading"));
    try {
      const state = await fetchConfigState(COMPOSER_DEFAULT_FAMILY);
      applyConfigState(state);
    } catch (err) {
      setConfigLoadError(
        err instanceof ApiError ? err.detail : "Failed to load saved strategy config.",
      );
      setConfigLoadStatus("error");
    }
  }, [applyConfigState]);

  const selectConfig = useCallback(
    async (experimentId: string) => {
      try {
        const state = await selectSavedConfig(COMPOSER_DEFAULT_FAMILY, experimentId);
        applyConfigState(state);
        setConfigLoadError(null);
      } catch (err) {
        setConfigLoadError(
          err instanceof ApiError ? err.detail : "Failed to switch strategy config.",
        );
      }
    },
    [applyConfigState],
  );

  const createNewConfig = useCallback(() => {
    setConfigDraft(createBlankConfigDraft(COMPOSER_DEFAULT_FAMILY));
    setSelectedConfigPath(null);
    setConfigLoadStatus("ready");
    setConfigLoadError(null);
  }, []);

  useEffect(() => {
    void reloadConfig();
  }, [reloadConfig]);

  const chartTimeframe = CHART_MARKET_TIMEFRAME;
  const reportTimeframe = runDetail?.result.strategy_evaluation.market.timeframe ?? null;
  const timeframeMismatch =
    reportTimeframe !== null && reportTimeframe !== chartTimeframe;

  // REPORT_LOAD_DEPS: selectedRunId, reloadToken only — do not add UI/report/market state.
  useEffect(() => {
    if (selectedRunId === null) {
      return;
    }
    const runId = selectedRunId;
    let cancelled = false;

    async function loadReportRemote() {
      setReportLoadStatus("loading");
      setReportError(null);
      resetPhase63FMarketLoadOwner(phase63FMarketLoadOwner());
      try {
        const [detail, trades, metrics] = await Promise.all([
          fetchRunDetail(runId),
          fetchRunTrades(runId),
          fetchRunMetrics(runId),
        ]);
        if (cancelled) return;
        setRunDetail(detail);
        setRunTrades(trades.trades);
        setRunMetrics(metrics);
        setReportLoadStatus("ready");
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : "Failed to load run report.";
        setRunDetail(null);
        setRunTrades([]);
        setRunMetrics(null);
        setReportError(message);
        setReportLoadStatus("error");
      }
    }

    void loadReportRemote();
    return () => {
      cancelled = true;
    };
  }, [selectedRunId, reloadToken]);

  // Optional chart-diagnostics projection — must not gate core run loading
  // (reportLoadStatus above). A legacy artifact bundle without
  // managed_policy_events.json, or a transient failure here, leaves the run
  // itself fully usable; only chart-layer managed-policy markers go missing.
  useEffect(() => {
    if (selectedRunId === null) {
      setManagedPolicyEvents([]);
      setManagedPolicyEventsLoadStatus("idle");
      return;
    }
    const runId = selectedRunId;
    let cancelled = false;

    async function loadManagedPolicyEventsRemote() {
      setManagedPolicyEventsLoadStatus("loading");
      try {
        const trace = await fetchManagedPolicyEvents({ runId });
        if (cancelled) return;
        setManagedPolicyEvents(trace.events);
        setManagedPolicyEventsLoadStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setManagedPolicyEvents([]);
        setManagedPolicyEventsLoadStatus(err instanceof ApiError && err.status === 404 ? "unavailable" : "error");
      }
    }

    void loadManagedPolicyEventsRemote();
    return () => {
      cancelled = true;
    };
  }, [selectedRunId, reloadToken]);

  useEffect(() => {
    phase63DTraceOwner().traceController.loadGeneration += 1;
    resetTraceCoordinator(phase63DTraceOwner().traceController);
    phase63DTraceOwner().traceController.previousWindowKey = null;
  }, [selectedRunId]);

  useEffect(() => {
    if (reportLoadStatus === "ready" && selectedRunId !== null) {
      dbgMarkCutover(DBG.load.reportReady, "market", { runId: selectedRunId });
    }
  }, [reportLoadStatus, selectedRunId]);

  useEffect(() => {
    if (chartHeavyIoEnabled) {
      emitCutoverDomainOwnersSnapshot();
    }
  }, [chartHeavyIoEnabled]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapRuns() {
      try {
        const listed = await fetchRunSummaries();
        if (cancelled) return;

        setRuns(listed);
        const defaultRunId = pickDefaultRunId(listed);
        if (defaultRunId === null) {
          setRunDetail(null);
          setRunTrades([]);
          setRunMetrics(null);
          setManagedPolicyEvents([]);
          setManagedPolicyEventsLoadStatus("idle");
          setSelectedRunIdState(null);
          setReportError(EMPTY_RUNS_HINT);
          setReportLoadStatus("error");
          return;
        }

        setSelectedRunIdState((prev) => {
          if (prev !== null && listed.some((r) => r.run_id === prev)) {
            return prev;
          }
          return defaultRunId;
        });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : "Failed to reach Research API.";
        setReportError(message);
        setReportLoadStatus("error");
      }
    }

    void bootstrapRuns();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const instanceId = runDetail?.manifest.instance_id ?? null;

  const expectedRunMarketViewIdentity = useMemo((): RunMarketViewIdentity | null => {
    if (
      reportLoadStatus !== "ready" ||
      runDetail === null ||
      selectedRunId === null ||
      runDetail.manifest.run_id !== selectedRunId
    ) {
      return null;
    }
    try {
      return buildRunMarketViewIdentity(
        resolveRunMarketView({
          runDetail,
          chartTimeframe,
          reloadToken,
        }),
      );
    } catch {
      return null;
    }
  }, [reportLoadStatus, runDetail, selectedRunId, chartTimeframe, reloadToken]);

  // Default/refresh trade focus whenever the run (and therefore its trades) changes.
  useEffect(() => {
    if (runDetail === null) {
      return;
    }
    const runId = runDetail.manifest.run_id;
    const runChanged = prevRunIdForTradeBootstrapRef.current !== runId;
    if (!runChanged) {
      return;
    }
    prevRunIdForTradeBootstrapRef.current = runId;
    applyTradeFocusSelection(runTrades);
  }, [runDetail, runTrades, applyTradeFocusSelection]);

  useLayoutEffect(() => {
    if (selectedTradeId === null) {
      return;
    }
    if (isKnownTrade(runTrades, selectedTradeId)) {
      return;
    }
    applyTradeFocusSelection(runTrades);
  }, [runTrades, selectedTradeId, applyTradeFocusSelection]);

  const chartTimeframeMs = useMemo(
    () => resolveChartTimeframeMs(chartTimeframe),
    [chartTimeframe],
  );

  const setSelectedRunId = useCallback((runId: string) => {
    setSelectedRunIdState(runId);
  }, []);

  const reloadReport = useCallback(() => {
    setReloadToken((t) => t + 1);
  }, []);

  const refreshRunsAndSelectRun = useCallback(async (runId: string) => {
    const listed = await fetchRunSummaries();
    setRuns(listed);
    setSelectedRunIdState(runId);
  }, []);

  const selectedTradeResolution = useMemo(() => {
    if (selectedTradeId === null) {
      return {
        trade: undefined,
        entryTimeMs: null as number | null,
        warning: null as string | null,
      };
    }
    const { trade, entryTimeMs } = resolveSelectedTradeEntryTimeMs(runTrades, selectedTradeId);
    if (!trade) {
      return {
        trade: undefined,
        entryTimeMs: null,
        warning: `Trade #${formatTradeDisplayNumber(runTrades, selectedTradeId)} not found in run trades.`,
      };
    }
    if (entryTimeMs === null) {
      return {
        trade,
        entryTimeMs: null,
        warning: `Trade #${formatTradeDisplayNumber(runTrades, trade.trade_id)} has no valid entry_time_ms in run trades.`,
      };
    }
    return { trade, entryTimeMs, warning: null };
  }, [runTrades, selectedTradeId]);

  const selectedTradeEntryTimeMs = selectedTradeResolution.entryTimeMs;
  const chartTradeFocusWarning = selectedTradeResolution.warning;

  const intendedRunMarketView = useMemo((): RunMarketView | null => {
    if (runDetail === null) return null;
    try {
      return resolveRunMarketView({
        runDetail,
        chartTimeframe,
        reloadToken,
      });
    } catch {
      return null;
    }
  }, [runDetail, chartTimeframe, reloadToken]);

  const intendedRunMarketViewIdentity = useMemo((): RunMarketViewIdentity | null => {
    if (intendedRunMarketView === null) return null;
    return buildRunMarketViewIdentity(intendedRunMarketView);
  }, [intendedRunMarketView]);

  const [marketCoverageTargetTick, bumpMarketCoverageTargetTick] = useState(0);
  const [marketLoadDeliveryTick, bumpMarketLoadDeliveryTick] = useState(0);

  const marketTargetWindows = useMemo(() => {
    if (intendedRunMarketView === null || intendedRunMarketViewIdentity === null) {
      return null;
    }
    return resolvePhase63FMarketTargetWindows({
      owner: phase63FMarketLoadOwner(),
      view: intendedRunMarketView,
      viewIdentity: intendedRunMarketViewIdentity,
      selectedTradeEntryTimeMs,
    });
  }, [
    intendedRunMarketView,
    intendedRunMarketViewIdentity,
    selectedTradeEntryTimeMs,
    marketCoverageTargetTick,
  ]);

  const marketFocusWindow = marketTargetWindows?.focusWindow ?? null;
  const marketCoverageWindow = marketTargetWindows?.coverageWindow ?? null;

  const marketFocusWindowKey = marketTargetWindows?.focusWindowKey ?? null;

  const marketCoverageWindowKey = marketTargetWindows?.coverageWindowKey ?? null;

  useEffect(() => {
    if (runDetail === null || reportLoadStatus !== "ready") {
      return;
    }
    if (!chartHeavyIoEnabled) {
      dbgMark(DBG.load.chartHeavyIoBlocked, {
        source: "market",
      });
      return;
    }
    if (marketFocusWindow === null || marketCoverageWindow === null) {
      return;
    }

    const snapshot: RunDetail = runDetail;
    const abortController = new AbortController();
    const owner = phase63FMarketLoadOwner();
    const resolvedView = resolvePhase63FMarketView({
      runDetail: snapshot,
      chartTimeframe,
      reloadToken,
    });
    if (resolvedView.outcome === "error") {
      return;
    }

    const { view, viewIdentity } = resolvedView;
    const focusWindow = marketFocusWindow;
    const coverageWindow = marketCoverageWindow;

    void (async () => {
      const result = await runPhase63FMarketLoad(owner, {
        view,
        viewIdentity,
        focusWindow,
        coverageWindow,
        symbol: snapshot.result.strategy_evaluation.market.ticker,
        timeframe: chartTimeframe,
        signal: abortController.signal,
        onChunkSeeded: () => {
          bumpMarketLoadDeliveryTick((tick) => tick + 1);
        },
      });

      if (result.outcome === "aborted") {
        dbgMark(DBG.load.marketFetchAbort, {
          key: viewIdentity,
          note: "frontend abort/stale-response protection; backend CPU work may continue",
        });
        return;
      }
      if (result.outcome === "stale_response") {
        dbgMark(DBG.load.marketFetchStaleResponse, { key: viewIdentity, phase: "network" });
        return;
      }
      // Re-render after load settles even when no new chunks were seeded (cache-hit ready).
      bumpMarketLoadDeliveryTick((tick) => tick + 1);
    })();

    return () => {
      abortController.abort();
      cancelPhase63FMarketLoad(owner);
    };
  }, [
    runDetail,
    reportLoadStatus,
    chartTimeframe,
    reloadToken,
    chartHeavyIoEnabled,
    marketCoverageWindowKey,
  ]);

  const marketBundleSnapshot = useMemo(
    () =>
      resolvePhase63FMarketBundleSnapshot({
        owner: phase63FMarketLoadOwner(),
        view: intendedRunMarketView,
        focusWindow: marketFocusWindow,
        coverageWindow: marketCoverageWindow,
        focusWindowKey: marketFocusWindowKey,
        marketLoadStatus,
        marketLoadError: marketError,
      }),
    [
      intendedRunMarketView,
      intendedRunMarketViewIdentity,
      runMarketViewIdentity,
      marketCandlesRevision,
      marketOverlayRevision,
      marketLoadStatus,
      marketError,
      marketFocusWindowKey,
      marketCoverageWindowKey,
      marketLoadDeliveryTick,
    ],
  );

  const cachedBundle = marketBundleFromSnapshot(marketBundleSnapshot);
  const renderWindowFoundationKey = marketBundleSnapshot.foundationKey;

  useEffect(() => {
    if (
      renderWindowFoundationKey === null ||
      intendedRunMarketView === null ||
      marketCoverageWindow === null
    ) {
      return;
    }
    const candles = getCandles(
      intendedRunMarketView.candlesKey,
      marketCoverageWindow.fromMs,
      marketCoverageWindow.toMs,
    );
    if (candles !== undefined) {
      cachedBundleCandlesRef.current = candles;
    }
  }, [
    renderWindowFoundationKey,
    intendedRunMarketView,
    marketCoverageWindow,
    marketCandlesRevision,
    marketLoadDeliveryTick,
  ]);

  const onWindowCommit = useCallback(
    (_commit: WindowCommitResult, slice: ChartBar[]) => {
      if (slice.length > 0 && selectedRunId !== null) {
        const overlay =
          contextOverlayRef ??
          (runDetail ? defaultChartContextOverlayRef(runDetail.strategy_spec) : null) ??
          "";
        const windowKey = `${selectedRunId}:${instanceId ?? ""}:${slice[0]!.time}:${slice[slice.length - 1]!.time}:${overlay}`;
        queueTraceFetchIntent(windowKey);
      }
    },
    [selectedRunId, instanceId, contextOverlayRef, runDetail],
  );

  const onPanPrefetch = useCallback(
    (
      visibleFromSec: number,
      visibleToSec: number,
      isUserPan: boolean,
      visibleSample?: string,
    ) => {
      if (intendedRunMarketView === null || marketCoverageWindow === null || !chartHeavyIoEnabled) {
        return;
      }
      const decision = evaluatePhase63FPanPrefetch(phase63FMarketLoadOwner(), {
        view: intendedRunMarketView,
        coverageWindow: marketCoverageWindow,
        visibleFromSec,
        visibleToSec,
        chartTimeframeMs,
        forceUserPan: isUserPan,
        isUserPan,
        visibleSample: visibleSample ?? `${visibleFromSec}:${visibleToSec}`,
      });
      if (!decision.shouldApply || decision.expanded === null) {
        return;
      }
      const owner = phase63FMarketLoadOwner();
      if (!applyPhase63FPanPrefetchCoverage(owner, decision.expanded)) {
        return;
      }
      bumpMarketCoverageTargetTick((tick) => tick + 1);
    },
    [
      bumpMarketCoverageTargetTick,
      chartHeavyIoEnabled,
      chartTimeframeMs,
      intendedRunMarketView,
      marketCoverageWindow,
    ],
  );

  const renderViewportInputs = useMemo<WorkbenchRenderViewportInputs>(
    () => ({
      cachedBundle,
      cachedBundleCandlesRef,
      marketLoadStatus,
      marketCandlesRevision,
      marketLoadDeliveryTick,
      renderWindowFoundationKey,
      intendedRunMarketView,
      marketFocusWindow,
      marketCoverageWindow,
      selectedRunId,
      instanceId,
      selectedTradeEntryTimeMs,
      selectedTradeId,
      chartHeavyIoEnabled,
      auxEmaOverlays: phase63EAuxOverlayOwner().controller.auxEmaOverlays,
      auxOverlayRevision,
      marketOverlayRevision,
      intendedRunMarketViewIdentity,
      runMarketViewIdentity,
      getPrevBundleFirstTimeSec: () => phase63FMarketLoadOwner().prevBundleFirstTimeSec,
      setPrevBundleFirstTimeSec: (value) => {
        phase63FMarketLoadOwner().prevBundleFirstTimeSec = value;
      },
    }),
    [
      cachedBundle,
      marketLoadStatus,
      marketCandlesRevision,
      renderWindowFoundationKey,
      intendedRunMarketView,
      marketFocusWindow,
      marketCoverageWindow,
      selectedRunId,
      instanceId,
      selectedTradeEntryTimeMs,
      selectedTradeId,
      chartHeavyIoEnabled,
      auxOverlayRevision,
      marketOverlayRevision,
      intendedRunMarketViewIdentity,
      runMarketViewIdentity,
      marketLoadDeliveryTick,
    ],
  );

  const renderViewportCallbacks = useMemo<WorkbenchRenderViewportCallbacks>(
    () => ({
      onWindowCommit,
      onPanPrefetch,
      shouldPanPrefetchForSample: (sampleKey) =>
        sampleKey !== phase63FMarketLoadOwner().visiblePrefetchSample,
    }),
    [onWindowCommit, onPanPrefetch],
  );

  return (
    <WorkbenchRenderViewportProvider
      inputs={renderViewportInputs}
      callbacks={renderViewportCallbacks}
    >
      <WorkbenchProviderContexts
        initialActiveTab={initialActiveTab}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasChartEverActivated={hasChartEverActivated}
        configDraft={configDraft}
        setConfigDraft={setConfigDraft}
        configLoadStatus={configLoadStatus}
        configLoadError={configLoadError}
        configList={configList}
        selectedConfigPath={selectedConfigPath}
        reloadConfig={reloadConfig}
        selectConfig={selectConfig}
        createNewConfig={createNewConfig}
        reportLoadStatus={reportLoadStatus}
        reportError={reportError}
        marketLoadStatus={marketLoadStatus}
        marketError={marketError}
        auxOverlayRevision={auxOverlayRevision}
        setAuxOverlayRevision={setAuxOverlayRevision}
        displayCacheVersion={displayCacheVersion}
        setDisplayCacheVersion={setDisplayCacheVersion}
        displayApplyRevision={displayApplyRevision}
        setDisplayApplyRevision={setDisplayApplyRevision}
        chartDisplayComponentEvents={chartDisplayComponentEvents}
        setChartDisplayComponentEvents={setChartDisplayComponentEvents}
        chartDisplayComponentEventsRef={chartDisplayComponentEventsRef}
        traceDisplayState={traceDisplayState}
        setTraceDisplayState={setTraceDisplayState}
        chartShowEntryBlockMarkers={chartShowEntryBlockMarkers}
        setChartShowEntryBlockMarkers={setChartShowEntryBlockMarkers}
        chartShowExitSignalMarkers={chartShowExitSignalMarkers}
        setChartShowExitSignalMarkers={setChartShowExitSignalMarkers}
        chartShowSetupMarkers={chartShowSetupMarkers}
        setChartShowSetupMarkers={setChartShowSetupMarkers}
        chartShowTradeManagementPhaseMarkers={chartShowTradeManagementPhaseMarkers}
        setChartShowTradeManagementPhaseMarkers={setChartShowTradeManagementPhaseMarkers}
        chartShowTradeManagementExitMarkers={chartShowTradeManagementExitMarkers}
        setChartShowTradeManagementExitMarkers={setChartShowTradeManagementExitMarkers}
        runs={runs}
        selectedRunId={selectedRunId}
        setSelectedRunId={setSelectedRunId}
        runDetail={runDetail}
        instanceId={instanceId}
        runTrades={runTrades}
        runMetrics={runMetrics}
        managedPolicyEvents={managedPolicyEvents}
        managedPolicyEventsLoadStatus={managedPolicyEventsLoadStatus}
        selectedTradeId={selectedTradeId}
        setSelectedTradeId={setSelectedTradeId}
        selectedBarTimeSec={selectedBarTimeSec}
        setSelectedBarTimeSec={setSelectedBarTimeSec}
        signalTrace={signalTrace}
        setSignalTrace={setSignalTrace}
        signalTraceStatus={signalTraceStatus}
        setSignalTraceStatus={setSignalTraceStatus}
        loadedSignalTraceWindowKey={loadedSignalTraceWindowKey}
        setLoadedSignalTraceWindowKey={setLoadedSignalTraceWindowKey}
        contextOverlayRef={contextOverlayRef}
        setContextOverlayRef={setContextOverlayRef}
        signalTraceStatusRef={signalTraceStatusRef}
        selectedTradeIdRef={selectedTradeIdRef}
        applyTraceDisplayRef={applyTraceDisplayRef}
        reloadReport={reloadReport}
        refreshRunsAndSelectRun={refreshRunsAndSelectRun}
        chartTradeFocusWarning={chartTradeFocusWarning}
        chartHeavyIoEnabled={chartHeavyIoEnabled}
        chartTimeframe={chartTimeframe}
        reportTimeframe={reportTimeframe}
        timeframeMismatch={timeframeMismatch}
        cachedBundle={cachedBundle}
        intendedRunMarketViewIdentity={intendedRunMarketViewIdentity}
        runMarketViewIdentity={runMarketViewIdentity}
        expectedRunMarketViewIdentity={expectedRunMarketViewIdentity}
        effectiveContextOverlayRefSeed={contextOverlayRef}
        reloadToken={reloadToken}
        phase63EAuxOverlayOwner={phase63EAuxOverlayOwner}
        phase63DTraceOwner={phase63DTraceOwner}
      >
        {children}
      </WorkbenchProviderContexts>
    </WorkbenchRenderViewportProvider>
  );
}

type WorkbenchProviderContextsProps = {
  children: ReactNode;
  initialActiveTab: WorkbenchTab;
  activeTab: WorkbenchTab;
  setActiveTab: (tab: WorkbenchTab) => void;
  hasChartEverActivated: boolean;
  configDraft: StrategyConfigDraft | null;
  setConfigDraft: (draft: StrategyConfigDraft) => void;
  configLoadStatus: ConfigLoadStatus;
  configLoadError: string | null;
  configList: ConfigListEntry[];
  selectedConfigPath: string | null;
  reloadConfig: () => Promise<void>;
  selectConfig: (experimentId: string) => Promise<void>;
  createNewConfig: () => void;
  reportLoadStatus: ReportLoadStatus;
  reportError: string | null;
  marketLoadStatus: MarketLoadStatus;
  marketError: string | null;
  auxOverlayRevision: number;
  setAuxOverlayRevision: Dispatch<SetStateAction<number>>;
  displayCacheVersion: number;
  setDisplayCacheVersion: Dispatch<SetStateAction<number>>;
  displayApplyRevision: number;
  setDisplayApplyRevision: Dispatch<SetStateAction<number>>;
  chartDisplayComponentEvents: ComponentEvent[];
  setChartDisplayComponentEvents: Dispatch<SetStateAction<ComponentEvent[]>>;
  chartDisplayComponentEventsRef: MutableRefObject<ComponentEvent[]>;
  traceDisplayState: TraceDisplayState;
  setTraceDisplayState: Dispatch<SetStateAction<TraceDisplayState>>;
  chartShowEntryBlockMarkers: boolean;
  setChartShowEntryBlockMarkers: (show: boolean) => void;
  chartShowExitSignalMarkers: boolean;
  setChartShowExitSignalMarkers: (show: boolean) => void;
  chartShowSetupMarkers: boolean;
  setChartShowSetupMarkers: (show: boolean) => void;
  chartShowTradeManagementPhaseMarkers: boolean;
  setChartShowTradeManagementPhaseMarkers: (show: boolean) => void;
  chartShowTradeManagementExitMarkers: boolean;
  setChartShowTradeManagementExitMarkers: (show: boolean) => void;
  runs: RunSummary[];
  selectedRunId: string | null;
  setSelectedRunId: (runId: string) => void;
  runDetail: RunDetail | null;
  instanceId: string | null;
  runTrades: TradeRecord[];
  runMetrics: RunMetrics | null;
  managedPolicyEvents: ManagedPolicyEvent[];
  managedPolicyEventsLoadStatus: ManagedPolicyEventsLoadStatus;
  selectedTradeId: number | string | null;
  setSelectedTradeId: (id: number | string | null) => void;
  selectedBarTimeSec: number | null;
  setSelectedBarTimeSec: (timeSec: number | null) => void;
  signalTrace: SignalTraceBundle | null;
  setSignalTrace: (trace: SignalTraceBundle | null) => void;
  signalTraceStatus: SignalTraceLoadStatus;
  setSignalTraceStatus: (status: SignalTraceLoadStatus) => void;
  loadedSignalTraceWindowKey: string | null;
  setLoadedSignalTraceWindowKey: (key: string | null) => void;
  contextOverlayRef: string | null;
  setContextOverlayRef: (ref: string | null) => void;
  signalTraceStatusRef: MutableRefObject<SignalTraceLoadStatus>;
  selectedTradeIdRef: MutableRefObject<number | string | null>;
  applyTraceDisplayRef: MutableRefObject<() => void>;
  reloadReport: () => void;
  refreshRunsAndSelectRun: (runId: string) => Promise<void>;
  chartTradeFocusWarning: string | null;
  chartHeavyIoEnabled: boolean;
  chartTimeframe: string;
  reportTimeframe: string | null;
  timeframeMismatch: boolean;
  cachedBundle: ReturnType<typeof marketBundleFromSnapshot>;
  intendedRunMarketViewIdentity: RunMarketViewIdentity | null;
  runMarketViewIdentity: string | null;
  expectedRunMarketViewIdentity: RunMarketViewIdentity | null;
  effectiveContextOverlayRefSeed: string | null;
  reloadToken: number;
  phase63EAuxOverlayOwner: () => Phase63EAuxOverlayOwnerState;
  phase63DTraceOwner: () => Phase63DTraceEventsOwnerState;
};

function WorkbenchProviderContexts({
  children,
  activeTab,
  setActiveTab,
  hasChartEverActivated,
  configDraft,
  setConfigDraft,
  configLoadStatus,
  configLoadError,
  configList,
  selectedConfigPath,
  reloadConfig,
  selectConfig,
  createNewConfig,
  reportLoadStatus,
  reportError,
  marketLoadStatus,
  marketError,
  auxOverlayRevision,
  setAuxOverlayRevision,
  displayCacheVersion,
  setDisplayCacheVersion,
  displayApplyRevision,
  setDisplayApplyRevision,
  chartDisplayComponentEvents,
  setChartDisplayComponentEvents,
  chartDisplayComponentEventsRef,
  traceDisplayState,
  setTraceDisplayState,
  chartShowEntryBlockMarkers,
  setChartShowEntryBlockMarkers,
  chartShowExitSignalMarkers,
  setChartShowExitSignalMarkers,
  chartShowSetupMarkers,
  setChartShowSetupMarkers,
  chartShowTradeManagementPhaseMarkers,
  setChartShowTradeManagementPhaseMarkers,
  chartShowTradeManagementExitMarkers,
  setChartShowTradeManagementExitMarkers,
  runs,
  selectedRunId,
  setSelectedRunId,
  runDetail,
  instanceId,
  runTrades,
  runMetrics,
  managedPolicyEvents,
  managedPolicyEventsLoadStatus,
  selectedTradeId,
  setSelectedTradeId,
  selectedBarTimeSec,
  setSelectedBarTimeSec,
  signalTrace,
  setSignalTrace,
  signalTraceStatus,
  setSignalTraceStatus,
  loadedSignalTraceWindowKey,
  setLoadedSignalTraceWindowKey,
  contextOverlayRef,
  setContextOverlayRef,
  signalTraceStatusRef,
  selectedTradeIdRef,
  applyTraceDisplayRef,
  reloadReport,
  refreshRunsAndSelectRun,
  chartTradeFocusWarning,
  chartHeavyIoEnabled,
  chartTimeframe,
  reportTimeframe,
  timeframeMismatch,
  cachedBundle,
  intendedRunMarketViewIdentity,
  runMarketViewIdentity,
  expectedRunMarketViewIdentity,
  reloadToken,
  phase63EAuxOverlayOwner,
  phase63DTraceOwner,
}: WorkbenchProviderContextsProps) {
  const rv = useWorkbenchRenderViewport();
  const chartView = rv.chartView;
  const chartWindowSnapshotRevision = rv.windowSnapshotRevision;
  const renderWindowBounds = rv.renderWindowBounds;
  const traceDisplayCache = () => phase63DTraceOwner().traceDisplayController.cache;

  const contextOverlayRefOptions = useMemo(() => {
    if (!runDetail) return [];
    return strategyContextRefOptions(runDetail.strategy_spec);
  }, [runDetail]);

  const defaultContextOverlayRef = useMemo(() => {
    if (!runDetail) return null;
    return defaultChartContextOverlayRef(runDetail.strategy_spec);
  }, [runDetail]);

  /** Resolved ref for trace + HTF overlays (avoids one-frame null before default effect runs). */
  const effectiveContextOverlayRef = contextOverlayRef ?? defaultContextOverlayRef;

  useEffect(() => {
    if (contextOverlayRef !== null && !contextOverlayRefOptions.includes(contextOverlayRef)) {
      setContextOverlayRef(null);
    }
  }, [contextOverlayRef, contextOverlayRefOptions]);

  useEffect(() => {
    if (!runDetail) {
      setContextOverlayRef(null);
      return;
    }
    setContextOverlayRef(defaultChartContextOverlayRef(runDetail.strategy_spec));
  }, [selectedRunId, runDetail]);

  useEffect(() => {
    syncPhase63EAuxOverlaySpecs(phase63EAuxOverlayOwner(), {
      strategySpec: runDetail?.strategy_spec ?? null,
      chartTimeframe,
      effectiveContextOverlayRef,
    });
    setAuxOverlayRevision((revision) => revision + 1);
  }, [runDetail, chartTimeframe, effectiveContextOverlayRef]);

  const finalizeTraceDisplayUpdate = useCallback(() => {
    applyTraceDisplayRef.current();
    const traceViewportCmd = rv.onTraceReadyViewport();
    if (traceViewportCmd !== null) {
      rv.emitViewportCommand(traceViewportCmd);
    }
  }, [rv]);

  const applyTraceDisplayForCurrentWindow = useCallback(() => {
    const candles = chartView.candles;
    const selectedTradeIdSnapshot = selectedTradeIdRef.current;
    const selectedTradeEntryTimeSec =
      selectedTradeIdSnapshot !== null
        ? (() => {
            const trade = findTradeById(runTrades, selectedTradeIdSnapshot);
            const entryMs = trade ? resolveTradeEntryTimeMs(trade) : null;
            return entryMs !== null ? Math.floor(entryMs / 1000) : null;
          })()
        : null;

    const applyResult = runPhase63DApplyTraceDisplayForWindow(phase63DTraceOwner(), {
      candles,
      traceLoadStatus: signalTraceStatusRef.current,
      selectedTradeId: selectedTradeIdSnapshot,
      selectedTradeEntryTimeSec,
      selectedTradeEntryMarkerInView:
        selectedTradeIdSnapshot !== null
          ? selectedTradeEntryMarkerInView(runTrades, selectedTradeIdSnapshot, candles)
          : false,
    });

    setTraceDisplayState(applyResult.state);
    chartDisplayComponentEventsRef.current = applyResult.componentEvents;
    setChartDisplayComponentEvents(applyResult.componentEvents);
    setDisplayApplyRevision(applyResult.displayApplyRevision);

    if (applyResult.htfSlice.times.length > 0) {
      if (runPhase63EApplyHtfFromDisplaySlice(phase63EAuxOverlayOwner(), applyResult.htfSlice)) {
        setAuxOverlayRevision((revision) => revision + 1);
      }
    }
  }, [
    runTrades,
    phase63DTraceOwner,
    chartView.candles,
    signalTraceStatusRef,
    selectedTradeIdRef,
    setTraceDisplayState,
    chartDisplayComponentEventsRef,
    setChartDisplayComponentEvents,
    setDisplayApplyRevision,
    phase63EAuxOverlayOwner,
    setAuxOverlayRevision,
  ]);

  applyTraceDisplayRef.current = applyTraceDisplayForCurrentWindow;

  useEffect(() => {
    chartDisplayComponentEventsRef.current = chartDisplayComponentEvents;
  }, [chartDisplayComponentEvents]);

  useEffect(() => {
    signalTraceStatusRef.current = signalTraceStatus;
  }, [signalTraceStatus]);

  useEffect(() => {
    selectedTradeIdRef.current = selectedTradeId;
  }, [selectedTradeId]);

  useEffect(() => {
    if (!chartHeavyIoEnabled) {
      dbgMark(DBG.load.chartHeavyIoBlocked, {
        source: "aux_ema",
      });
      return;
    }

    const owner = phase63EAuxOverlayOwner();
    if (
      marketLoadStatus !== "ready" ||
      runDetail === null ||
      owner.controller.auxEmaSpecs.length === 0
    ) {
      resetPhase63EAuxOverlayOwner(owner);
      setAuxOverlayRevision((revision) => revision + 1);
      return;
    }

    const abortController = new AbortController();
    let cancelled = false;

    void (async () => {
      const result = await runPhase63ELoadBffAuxOverlays(owner, {
        chartHeavyIoEnabled,
        marketLoadStatus,
        runDetail,
        chartTimeframe,
        signal: abortController.signal,
      });
      if (cancelled) {
        return;
      }
      if (result.outcome === "aborted") {
        dbgMark(DBG.load.marketFetchAbort, {
          source: "aux_ema",
          note: "frontend abort/stale-response protection; backend CPU work may continue",
        });
        return;
      }
      setAuxOverlayRevision((revision) => revision + 1);
    })();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [marketLoadStatus, runDetail, chartTimeframe, chartHeavyIoEnabled, effectiveContextOverlayRef]);

  useEffect(() => {
    const changed = runPhase63ESyncHtfOverlaysFromTraceFallback(phase63EAuxOverlayOwner(), {
      renderWindowCandles: chartView.candles,
      traceDisplayCache: traceDisplayCache(),
      signalTraceStatus,
      signalTrace,
    });
    if (changed) {
      setAuxOverlayRevision((revision) => revision + 1);
    }
  }, [
    signalTrace,
    signalTraceStatus,
    chartView.candles,
    displayCacheVersion,
    displayApplyRevision,
  ]);

  const traceDisplayCacheKey = useMemo(() => {
    if (selectedRunId === null || instanceId === null) {
      return null;
    }
    return buildTraceDisplayCacheKey(selectedRunId, instanceId, effectiveContextOverlayRef);
  }, [selectedRunId, instanceId, effectiveContextOverlayRef]);

  useEffect(() => {
    if (traceDisplayCacheKey === null) {
      return;
    }
    resetPhase63DTraceDisplayCache(phase63DTraceOwner(), traceDisplayCacheKey);
    resetPhase63EAuxOverlayOwner(phase63EAuxOverlayOwner());
    chartDisplayComponentEventsRef.current = [];
    setChartDisplayComponentEvents([]);
    setTraceDisplayState(EMPTY_TRACE_DISPLAY_STATE);
    setDisplayCacheVersion((version) => version + 1);
  }, [traceDisplayCacheKey, reloadToken]);

  const sessionCacheIdentity = useMemo(() => {
    if (selectedRunId === null || instanceId === null) {
      return null;
    }
    return buildSessionCacheIdentity(
      selectedRunId,
      instanceId,
      effectiveContextOverlayRef,
      reloadToken,
      intendedRunMarketViewIdentity ?? runMarketViewIdentity,
    );
  }, [
    selectedRunId,
    instanceId,
    effectiveContextOverlayRef,
    reloadToken,
    intendedRunMarketViewIdentity,
    runMarketViewIdentity,
  ]);

  useEffect(() => {
    if (sessionCacheIdentity === null) {
      return;
    }
    resetPhase63DTraceSessionCache(phase63DTraceOwner(), sessionCacheIdentity);
  }, [sessionCacheIdentity]);

  const chartWindowKey = useMemo(() => {
    if (chartView.candles.length === 0) {
      return null;
    }
    const first = chartView.candles[0]!.time;
    const last = chartView.candles[chartView.candles.length - 1]!.time;
    const overlay = effectiveContextOverlayRef ?? "";
    return `${selectedRunId}:${instanceId ?? ""}:${first}:${last}:${overlay}`;
  }, [chartView.candles, selectedRunId, instanceId, effectiveContextOverlayRef]);

  const renderWindowBoundsKey = useMemo(() => {
    if (renderWindowBounds === null || chartView.count === 0) {
      return "";
    }
    return buildRenderWindowBoundsKey(
      renderWindowBounds.fromSec,
      renderWindowBounds.toSec,
      chartView.count,
    );
  }, [renderWindowBounds, chartView.count]);

  const displayCacheCoversWindow = useMemo(() => {
    if (renderWindowBounds === null) {
      return false;
    }
    return traceDisplayCache().coversRange(
      renderWindowBounds.fromSec,
      renderWindowBounds.toSec,
    );
  }, [renderWindowBounds, displayCacheVersion]);

  const displayCacheHasWindowData = useMemo(() => {
    if (renderWindowBounds === null) {
      return false;
    }
    const { fromSec, toSec } = renderWindowBounds;
    dbgTimedSyncCutover(
      DBG.traceDisplay.sliceEvents,
      "trace",
      () => traceDisplayCache().sliceEventsForWindow(fromSec, toSec).length,
      () => ({ fromSec, toSec }),
    );
    return resolvePhase63EDisplayCacheHasWindowData({
      traceDisplayCache: traceDisplayCache(),
      renderWindowBounds,
    });
  }, [renderWindowBounds, displayCacheVersion]);

  const auxOverlaySnapshot = useMemo(
    () =>
      resolvePhase63EAuxOverlaySnapshot(phase63EAuxOverlayOwner(), {
        slicedAuxOverlays: chartView.auxEmaOverlays,
        renderWindowCandles: chartView.candles,
        chartWindowKey,
        loadedSignalTraceWindowKey,
        displayCacheCoversWindow,
        displayCacheHasWindowData,
        signalTraceStatus,
        htfSlice: traceDisplayState.htfSlice,
      }),
    [
      chartView.auxEmaOverlays,
      chartView.candles,
      chartWindowKey,
      loadedSignalTraceWindowKey,
      displayCacheCoversWindow,
      displayCacheHasWindowData,
      signalTraceStatus,
      traceDisplayState.htfSlice,
      displayApplyRevision,
      auxOverlayRevision,
    ],
  );

  useEffect(() => {
    applyTraceDisplayForCurrentWindow();
  }, [renderWindowBounds, displayCacheVersion, applyTraceDisplayForCurrentWindow]);

  const componentEventsStale = useMemo(() => {
    if (
      traceDisplayState.status === "current" ||
      traceDisplayState.status === "empty" ||
      chartDisplayComponentEvents.length === 0
    ) {
      return false;
    }
    return true;
  }, [chartDisplayComponentEvents.length, traceDisplayState.status]);

  const phase63AModelSlice = useMemo(() => {
    const slice = resolvePhase63EModelRuntimeSlice(
      {
        chartView,
        chartDisplayAuxEmaOverlays: [],
        chartDisplayComponentEvents,
        htfAuxEmaOverlayStale: false,
        componentEventsStale,
        traceDisplayState,
      },
      auxOverlaySnapshot,
    );
    if (slice.chartViewModel.count === 0) {
      dbgMark(DBG.keyboard.modelApplyEmpty, {
        seriesKey: slice.chartViewModel.seriesKey,
        barCount: 0,
        chartWindowKey,
        renderWindowBounds,
        cachedBundleCandleCount: cachedBundle?.candles.length ?? 0,
        chartViewCount: chartView.count,
        chartViewFirstTimeSec: chartView.firstTimeSec,
        chartViewLastTimeSec: chartView.lastTimeSec,
        marketLoadStatus,
      });
    }
    return slice;
  }, [
      chartView,
      chartDisplayComponentEvents,
      componentEventsStale,
      traceDisplayState,
      auxOverlaySnapshot,
      chartWindowKey,
      renderWindowBounds,
      cachedBundle,
      marketLoadStatus,
    ],
  );

  const fullCandleRange = useMemo(
    () => (cachedBundle ? candleRangeMs(cachedBundle.candles) : null),
    [cachedBundle],
  );

  const marketCandlesCount = cachedBundle?.candles.length ?? 0;
  const candlesSource: CandlesSource =
    cachedBundle !== undefined && marketLoadStatus !== "error" ? "market" : "unavailable";

  const selectTrade = useCallback(
    (tradeId: number | string | null) => {
      let entryTimeSec: number | null = null;
      const trade = tradeId !== null ? findTradeById(runTrades, tradeId) : undefined;
      if (trade) {
        const entryTimeMs = resolveTradeEntryTimeMs(trade);
        if (entryTimeMs !== null) {
          entryTimeSec = Math.floor(entryTimeMs / 1000);
        }
      }
      setSelectedTradeId(tradeId);
      if (
        trade &&
        hasManagedPolicyEvents(managedPolicyEvents) &&
        managedPolicyEvents.some((event) => event.position_id === trade.position_id)
      ) {
        setChartShowTradeManagementPhaseMarkers(true);
        setChartShowTradeManagementExitMarkers(true);
      }
      if (tradeId !== null && entryTimeSec !== null) {
        setSelectedBarTimeSec(entryTimeSec);
        if (hasChartEverActivated) {
          setActiveTab("chart");
        }
      }
    },
    [runTrades, managedPolicyEvents, hasChartEverActivated, setActiveTab],
  );

  const selectBar = useCallback((timeSec: number | null) => {
    setSelectedBarTimeSec(timeSec);
  }, []);

  useEffect(() => {
    const owner = phase63DTraceOwner();

    if (!chartHeavyIoEnabled) {
      dbgMark(DBG.load.chartHeavyIoBlocked, {
        source: "signal_trace",
      });
      resetTraceCoordinator(owner.traceController);
      owner.traceController.previousWindowKey = null;
      setSignalTrace(null);
      setSignalTraceStatus("idle");
      setLoadedSignalTraceWindowKey(null);
      signalTraceStatusRef.current = "idle";
      return;
    }

    if (renderWindowBounds !== null) {
      logPhase63DTraceCoverage(owner, renderWindowBounds);
    }

    const bootstrapPreview = evaluateSignalTraceBootstrap({
      runDetail,
      reportLoadStatus,
      selectedRunId,
      instanceId,
      marketLoadStatus,
      runMarketViewIdentity,
      expectedRunMarketViewIdentity,
      chartWindowKey,
      candles: chartView.candles,
      renderWindowBounds,
      previousWindowKey: owner.traceController.previousWindowKey,
    });
    const fetchSource = bootstrapPreview.ready ? bootstrapPreview.fetchSource : undefined;

    const abortController = new AbortController();
    let cancelled = false;

    void (async () => {
      const result = await runPhase63DTraceLoadCycle(owner, {
        chartHeavyIoEnabled,
        reportLoadStatus,
        runDetail,
        selectedRunId: selectedRunId ?? "",
        instanceId: instanceId ?? "",
        marketLoadStatus,
        runMarketViewIdentity,
        expectedRunMarketViewIdentity,
        effectiveContextOverlayRef,
        chartTimeframe,
        chartWindowKey,
        candles: chartView.candles,
        renderWindowBounds,
        interactionState: rv.getInteractionState(),
        hasPendingShift: rv.hasPendingShift(),
        coalescedWindowKey: takeCommittedTraceFetchIntent(),
        signal: abortController.signal,
        telemetryMeta: {
          renderWindowRevision: chartWindowSnapshotRevision,
          boundsKey: renderWindowBoundsKey,
          fetchSource,
        },
      });

      if (cancelled) {
        return;
      }

      const snapshot = resolvePhase63DLanesSnapshot(owner);
      setSignalTrace(snapshot.signalTrace);
      setSignalTraceStatus(snapshot.signalTraceStatus);
      setLoadedSignalTraceWindowKey(snapshot.loadedSignalTraceWindowKey);
      signalTraceStatusRef.current = snapshot.signalTraceStatus;

      if (result.outcome === "fetch_superseded") {
        dbgMark(DBG.traceDisplay.fetchSuperseded, {
          windowKey: chartWindowKey,
        });
        return;
      }

      if (result.outcome === "bootstrap_blocked") {
        return;
      }

      if (
        result.displayLoadOutcome === "committed" ||
        result.outcome === "session_restored"
      ) {
        setDisplayCacheVersion((version) => version + 1);
      }

      if (shouldPhase63DFinalizeTraceDisplay(result.outcome)) {
        finalizeTraceDisplayUpdate();
      }

      if (
        result.outcome === "completed" ||
        result.outcome === "display_committed" ||
        result.outcome === "session_restored"
      ) {
        flushLanesLoadDebug();
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
      owner.traceController.loadGeneration += 1;
    };
  }, [
    reportLoadStatus,
    runDetail,
    selectedRunId,
    instanceId,
    chartWindowKey,
    chartWindowSnapshotRevision,
    renderWindowBoundsKey,
    marketLoadStatus,
    runMarketViewIdentity,
    expectedRunMarketViewIdentity,
    effectiveContextOverlayRef,
    finalizeTraceDisplayUpdate,
    chartHeavyIoEnabled,
    chartTimeframe,
    chartView.candles,
    renderWindowBounds,
    rv,
  ]);

  const symbol = runDetail?.result.strategy_evaluation.market.ticker ?? "—";
  const timeframe = chartTimeframe;

  const shellValue = useMemo<WorkbenchShellState>(
    () => ({
      activeTab,
      setActiveTab,
      reportLoadStatus,
      reportError,
      reloadReport,
    }),
    [activeTab, reportLoadStatus, reportError, reloadReport],
  );

  const reportValue = useMemo<WorkbenchReportState>(
    () => ({
      symbol,
      timeframe,
      runDetail,
      instanceId,
      runs,
      selectedRunId,
      setSelectedRunId,
      selectedTradeId,
      selectTrade,
    }),
    [
      symbol,
      timeframe,
      runDetail,
      instanceId,
      runs,
      selectedRunId,
      selectedTradeId,
      selectTrade,
    ],
  );

  const composerValue = useMemo<WorkbenchComposerState>(
    () => ({
      configDraft,
      setConfigDraft,
      configLoadStatus,
      configLoadError,
      configList,
      selectedConfigPath,
      reloadConfig,
      selectConfig,
      createNewConfig,
      refreshRunsAndSelectRun,
      setActiveTab,
    }),
    [
      configDraft,
      configLoadStatus,
      configLoadError,
      configList,
      selectedConfigPath,
      reloadConfig,
      selectConfig,
      createNewConfig,
      refreshRunsAndSelectRun,
    ],
  );

  const chartValue = useMemo<WorkbenchChartState>(
    () => ({
      marketLoadStatus,
      marketError,
      chartViewModel: phase63AModelSlice.chartViewModel,
      htfAuxEmaOverlayStale: phase63AModelSlice.chartViewModel.htfOverlayStale,
      componentEventsStale: phase63AModelSlice.chartViewModel.componentEventsStale,
      chartShowEntryBlockMarkers,
      setChartShowEntryBlockMarkers,
      chartShowExitSignalMarkers,
      setChartShowExitSignalMarkers,
      chartShowSetupMarkers,
      setChartShowSetupMarkers,
      chartShowTradeManagementPhaseMarkers,
      setChartShowTradeManagementPhaseMarkers,
      chartShowTradeManagementExitMarkers,
      setChartShowTradeManagementExitMarkers,
      chartTimeframe,
      reportTimeframe,
      timeframeMismatch,
      chartTradeFocusWarning,
      marketCandlesCount,
      fullCandleRange,
      candlesSource,
      selectedTradeId,
      selectTrade,
      runDetail,
      runTrades,
      runMetrics,
      managedPolicyEvents,
      managedPolicyEventsLoadStatus,
      contextOverlayRef,
      setContextOverlayRef,
      effectiveContextOverlayRef,
      contextOverlayRefOptions,
      selectedBarTimeSec,
      selectBar,
    }),
    [
      chartTimeframe,
      reportTimeframe,
      timeframeMismatch,
      marketLoadStatus,
      marketError,
      phase63AModelSlice,
      chartShowEntryBlockMarkers,
      chartShowExitSignalMarkers,
      chartShowSetupMarkers,
      chartShowTradeManagementPhaseMarkers,
      chartShowTradeManagementExitMarkers,
      chartTradeFocusWarning,
      marketCandlesCount,
      fullCandleRange,
      candlesSource,
      selectedTradeId,
      selectTrade,
      runDetail,
      runTrades,
      runMetrics,
      managedPolicyEvents,
      managedPolicyEventsLoadStatus,
      contextOverlayRef,
      effectiveContextOverlayRef,
      contextOverlayRefOptions,
      selectedBarTimeSec,
      selectBar,
    ],
  );

  return (
    <WorkbenchShellContext.Provider value={shellValue}>
      <WorkbenchReportContext.Provider value={reportValue}>
        <WorkbenchComposerContext.Provider value={composerValue}>
          <WorkbenchChartContext.Provider value={chartValue}>{children}</WorkbenchChartContext.Provider>
        </WorkbenchComposerContext.Provider>
      </WorkbenchReportContext.Provider>
    </WorkbenchShellContext.Provider>
  );
}

export function useWorkbench(): WorkbenchState {
  const shell = useWorkbenchShell();
  const report = useWorkbenchReport();
  const composer = useWorkbenchComposer();
  const chart = useWorkbenchChart();
  return useMemo(
    () => ({
      ...shell,
      ...report,
      ...composer,
      ...chart,
    }),
    [shell, report, composer, chart],
  );
}

export function useWorkbenchShell(): WorkbenchShellState {
  const ctx = useContext(WorkbenchShellContext);
  if (!ctx) {
    throw new Error("useWorkbenchShell must be used within WorkbenchProvider");
  }
  return ctx;
}

export function useWorkbenchReport(): WorkbenchReportState {
  const ctx = useContext(WorkbenchReportContext);
  if (!ctx) {
    throw new Error("useWorkbenchReport must be used within WorkbenchProvider");
  }
  return ctx;
}

export function useWorkbenchComposer(): WorkbenchComposerState {
  const ctx = useContext(WorkbenchComposerContext);
  if (!ctx) {
    throw new Error("useWorkbenchComposer must be used within WorkbenchProvider");
  }
  return ctx;
}

export function useWorkbenchChart(): WorkbenchChartState {
  const ctx = useContext(WorkbenchChartContext);
  if (!ctx) {
    throw new Error("useWorkbenchChart must be used within WorkbenchProvider");
  }
  return ctx;
}
