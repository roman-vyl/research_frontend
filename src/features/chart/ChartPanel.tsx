import {

  CandlestickSeries,

  createChart,

  createSeriesMarkers,

  LineSeries,

  LineType,

  type IChartApi,

  type IPriceLine,

  type ISeriesApi,

  type ISeriesMarkersPluginApi,

  type Time,

} from "lightweight-charts";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  dbgMark,
  dbgTimedSync,
  dbgTimedSyncChartModel,
  PIPELINE_DEBUG_STEPS as DBG,
} from "@/shared/diagnostics/cutoverPipelineDebug";



import type { AnchorStackEmaRole, ChartEmaOverlay } from "@/api/types";
import { colorForAuxEmaOverlay } from "@/features/chart/chartAuxEmaOverlays";

import { ChartAsideStackSplitHandle } from "@/features/chart/ChartAsideStackSplitHandle";
import { ChartBarInspector } from "@/features/chart/ChartBarInspector";
import { ChartPanelSplitHandle } from "@/features/chart/ChartPanelSplitHandle";
import { ChartTradeDiagnostics } from "@/features/chart/ChartTradeDiagnostics";
import { ChartTradeFocusNav } from "@/features/chart/ChartTradeFocusNav";
import { useChartAsideResize } from "@/features/chart/useChartAsideResize";
import { useChartAsideStackResize } from "@/features/chart/useChartAsideStackResize";
import { buildTradePriceLineSpecs } from "@/features/chart/chartTradePriceLines";

import { ChartMarkerLegend } from "@/features/chart/ChartMarkerLegend";


import { anchorStackPeriodsFromStrategySpec } from "@/features/chart/anchorStackFromSpec";

import { toCandlestickSeriesData } from "@/features/chart/chartCandleUtils";

import {

  buildTradeMarkersForView,

  tradeOutsideCandleRange,

} from "@/features/chart/chartMarkers";
import {
  buildComponentEventsForView,
  hasHtfAlignedComponentEvents,
} from "@/features/chart/chartComponentEvents";
import {
  buildManagedPolicyEventsForView,
  hasManagedPolicyEvents,
} from "@/features/chart/tradeManagementChartEvents";
import {
  buildTradeManagementLevelSegments,
  groupTradeManagementLevelCurves,
} from "@/features/chart/tradeManagementLevelCurves";

import { readChartViewportDebug, shouldSuppressPanShiftRequest } from "@/features/chart/chartViewport";
import {
  createChartInteractionAdapter,
  registerChartDocumentKeyboardNavigation,
} from "@/features/chart/runtime/interactionAdapter";
import { executeViewportCommand } from "@/features/chart/runtime/executeViewportCommand";
import { CHART_RENDER_WINDOW_SIZE } from "@/features/chart/chartDataWindowManager";
import { findTradeById, tradeDisplayNumber } from "@/features/chart/tradeLookup";

import type { EpisodeSide } from "@/api/episodes";
import { EpisodeBarSection } from "@/features/episodes/EpisodeBarSection";
import {
  EMPTY_EPISODE_LAYERS_STATE,
  EpisodeLayersPrimitive,
  type EpisodeHighlight,
  type EpisodeLayerToggles,
} from "@/features/episodes/EpisodeLayersPrimitive";
import { EpisodeToolbar, type EpisodeSideChoice } from "@/features/episodes/EpisodeToolbar";
import { EpisodeTouchesTable } from "@/features/episodes/EpisodeTouchesTable";
import { allEpisodes, episodeAt } from "@/features/episodes/episodeLookup";
import { selectEpisodeParams, useEpisodeParams } from "@/features/episodes/useEpisodeParams";
import { useEpisodeHistories } from "@/features/episodes/useEpisodeHistories";
import { resolveChartTimeframeMs } from "@/features/chart/chartTimeframeMs";

import { useWorkbenchChart, useWorkbenchShell } from "@/shared/context/WorkbenchContext";
import { useWorkbenchRenderViewport } from "@/shared/context/WorkbenchRenderViewportContext";



const EMA_OVERLAY_STYLE: Record<

  AnchorStackEmaRole,

  { color: string; lineWidth: 1 | 2 | 3 | 4 }

> = {

  fast: { color: "#86efac", lineWidth: 2 },

  anchor: { color: "#38bdf8", lineWidth: 2 },

  slow: { color: "#a78bfa", lineWidth: 2 },

};



function overlaySeriesTitle(overlay: ChartEmaOverlay): string {

  return `EMA ${overlay.role} ${overlay.period} (overlay)`;

}

export function ChartPanel() {
  const { activeTab } = useWorkbenchShell();
  const chartTabActiveRef = useRef(activeTab === "chart");
  chartTabActiveRef.current = activeTab === "chart";

  const containerRef = useRef<HTMLDivElement>(null);
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  const { asideWidth, maxAsideWidth, splitHandleProps } = useChartAsideResize(panelBodyRef);

  const chartRef = useRef<IChartApi | null>(null);

  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const emaSeriesByRoleRef = useRef<Partial<Record<AnchorStackEmaRole, ISeriesApi<"Line">>>>(

    {},

  );

  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const episodeLayersRef = useRef<EpisodeLayersPrimitive | null>(null);

  const tradePriceLinesRef = useRef<IPriceLine[]>([]);

  const tradeManagementLevelSeriesRef = useRef<ISeriesApi<"Line">[]>([]);

  const auxEmaSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());

  /** Renderer plumbing only — suppress programmatic range / pan-shift feedback, not policy. */
  const isApplyingViewportRef = useRef(false);
  const suppressPanShiftUntilRef = useRef(0);
  const visibleRangeHandlerRef = useRef<(() => void) | null>(null);

  const {

    chartViewModel,

    htfAuxEmaOverlayStale,

    componentEventsStale,

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

    candlesSource,

    marketLoadStatus,

    marketError,

    marketCandlesCount,

    timeframeMismatch,

    reportTimeframe,

    chartTimeframe,

    runDetail,

    runTrades,

    managedPolicyEvents,

    selectedTradeId,

    selectTrade,

    chartTradeFocusWarning,

    fullCandleRange,

    setContextOverlayRef,

    effectiveContextOverlayRef,

    contextOverlayRefOptions,

    selectedBarTimeSec,

    selectBar,

  } = useWorkbenchChart();

  const {
    dispatchChartInteraction,
    chartViewportCommand,
    chartViewportCommandSeq,
    acknowledgeChartViewportCommand,
    isWindowSwapTransactionCancelled,
    settleWindowSwapCommit,
    windowShiftSeq,
  } = useWorkbenchRenderViewport();

  const dispatchChartInteractionRef = useRef(dispatchChartInteraction);
  dispatchChartInteractionRef.current = dispatchChartInteraction;
  const chartCandles = chartViewModel.candles;
  const chartEmaOverlays = chartViewModel.emaOverlays;
  const chartDisplayAuxEmaOverlays = chartViewModel.displayAuxEmaOverlays;
  const chartDisplayComponentEvents = chartViewModel.componentEvents;
  const traceDisplayStatus = chartViewModel.traceDisplayStatus;
  const traceDisplayMissingRange = chartViewModel.traceDisplayMissingRange;

  const chartCandlesRef = useRef(chartCandles);
  chartCandlesRef.current = chartCandles;
  const interactionAdapterRef = useRef(
    createChartInteractionAdapter({
      dispatch: (event) => dispatchChartInteractionRef.current(event),
      getCandles: () => chartCandlesRef.current,
      shouldSuppressRangeEvent: () =>
        shouldSuppressPanShiftRequest(
          isApplyingViewportRef.current,
          suppressPanShiftUntilRef.current,
        ),
    }),
  );
  const trades = runTrades;

  const selectedTrade = findTradeById(trades, selectedTradeId);

  const showAsideStack = selectedTradeId !== null;
  const { diagnosticsHeight, maxDiagnosticsHeight, stackSplitHandleProps } =
    useChartAsideStackResize(asideRef, showAsideStack);

  const [episodeLayers, setEpisodeLayers] = useState<EpisodeLayerToggles>(
    EMPTY_EPISODE_LAYERS_STATE.layers,
  );
  const [episodeSide, setEpisodeSide] = useState<EpisodeSideChoice>("both");
  const [episodeHighlight, setEpisodeHighlight] = useState<EpisodeHighlight>(null);
  const [episodeRef, setEpisodeRef] = useState<string | null>(null);
  const episodeParamsState = useEpisodeParams(
    runDetail?.result.strategy_evaluation.strategy_id ?? null,
    runDetail?.strategy_spec ?? null,
  );
  const episodeParams = selectEpisodeParams(episodeParamsState, episodeRef);
  const episodeTicker = runDetail?.result.strategy_evaluation.market.ticker ?? null;
  const episodeHistories = useEpisodeHistories(episodeTicker, chartTimeframe, episodeParams);
  const episodeSides = useMemo<EpisodeSide[]>(
    () => (episodeSide === "both" ? ["long", "short"] : [episodeSide]),
    [episodeSide],
  );
  const episodeTable = useMemo(() => {
    for (const side of episodeSides) {
      const history = episodeHistories.histories[side];
      if (!history) continue;
      const atBar =
        selectedBarTimeSec === null
          ? null
          : episodeAt(allEpisodes(history), selectedBarTimeSec * 1000);
      if (atBar) return { side, episode: atBar };
    }
    for (const side of episodeSides) {
      const current = episodeHistories.histories[side]?.current;
      if (current) return { side, episode: current };
    }
    return null;
  }, [episodeHistories.histories, episodeSides, selectedBarTimeSec]);
  const episodeStatus =
    episodeParamsState.status === "loading"
      ? "loading episode parameters from Engine…"
      : episodeParamsState.status === "error"
        ? `episode parameters unavailable: ${episodeParamsState.error ?? "error"}`
        : episodeParams === null
          ? episodeParamsState.refs.length > 1
            ? "choose an ema_stack_episode ref"
            : "no anchor_stack or ema_stack_episode in strategy_spec"
          : episodeHistories.status === "loading"
        ? "loading episode history…"
        : episodeHistories.status === "error"
          ? `episode history unavailable: ${episodeHistories.error ?? "error"}`
          : null;

  const rangeWarning =

    selectedTrade && tradeOutsideCandleRange(selectedTrade.entry_time_ms, fullCandleRange);



  const chartSeriesDataKey = chartViewModel.seriesKey;

  const stackPeriodsLabel = useMemo(() => {

    if (chartEmaOverlays.length === 3) {

      return chartEmaOverlays.map((o) => o.period).join("/");

    }

    if (runDetail) {

      try {

        const p = anchorStackPeriodsFromStrategySpec(runDetail.strategy_spec);

        return `${p.fast}/${p.anchor}/${p.slow}`;

      } catch {

        return null;

      }

    }

    return null;

  }, [chartEmaOverlays, runDetail]);



  const chartHint = useMemo(() => {

    if (candlesSource !== "market") {
      if (marketLoadStatus === "loading") {
        return "Loading market data for trade focus…";
      }
      return "Market data unavailable · trade markers from report";
    }

    const shown = chartCandles.length;

    const total = marketCandlesCount;

    const modeNote =
      chartViewModel.viewMode === "around-trade" && chartViewModel.centerTimeSec !== null
        ? `trade focus · center ${chartViewModel.centerTimeSec}`
        : chartViewModel.viewMode === "tail"
          ? "tail view"
          : "";

    const rangeNote =
      chartViewModel.firstTimeSec !== null && chartViewModel.lastTimeSec !== null
        ? `range ${chartViewModel.firstTimeSec}–${chartViewModel.lastTimeSec}`
        : "";

    const windowNote =

      total > shown

        ? `Showing ${shown} of ${total} bars`

        : `Showing ${shown} bar${shown === 1 ? "" : "s"}`;

    const auxNote =
      chartDisplayAuxEmaOverlays.length > 0
        ? ` · +${chartDisplayAuxEmaOverlays.length} aux EMA (exit/HTF)`
        : "";

    const htfStaleNote = htfAuxEmaOverlayStale
      ? " · HTF EMA may lag (signal trace reloading; stable BFF overlay planned)"
      : "";

    const componentEventNote =
      chartDisplayComponentEvents.length > 0
        ? ` · +${chartDisplayComponentEvents.length} component events`
        : "";

    const componentStaleNote = componentEventsStale
      ? " · component events may lag (signal trace reloading)"
      : "";

    const traceDisplayStateNote =
      traceDisplayStatus === "loading_missing"
        ? traceDisplayMissingRange
          ? ` · trace display loading missing ${traceDisplayMissingRange.fromSec}–${traceDisplayMissingRange.toSec}`
          : " · trace display loading missing range"
        : traceDisplayStatus === "partial"
          ? " · trace display partial"
          : traceDisplayStatus === "stale"
            ? " · trace display stale"
            : "";

    const htfAlignedEventNote =
      hasHtfAlignedComponentEvents(chartDisplayComponentEvents) &&
      chartDisplayComponentEvents.some(
        (event) => event.source_timeframe != null && event.source_timeframe !== chartTimeframe,
      )
        ? " · HTF spans use backend-aligned base-bar boundaries"
        : "";

    const emaNote = stackPeriodsLabel

      ? `OHLC + EMA stack ${stackPeriodsLabel} (overlay, periods from run strategy_spec)${auxNote}${htfStaleNote}`

      : `OHLC · overlay EMA requires anchor_stack in strategy_spec${auxNote}${htfStaleNote}`;

    const traceLoadingHint =
      componentEventsStale && chartDisplayComponentEvents.length === 0
          ? " · Loading events/HTF context…"
          : "";

    const parts = [
      windowNote,
      modeNote,
      rangeNote,
      emaNote,
      "trade markers from report",
      traceLoadingHint,
      componentEventNote,
      componentStaleNote,
      traceDisplayStateNote,
      htfAlignedEventNote,
    ].filter(Boolean);

    return parts.join(" · ");

  }, [

    candlesSource,

    marketLoadStatus,

    chartCandles.length,

    marketCandlesCount,

    chartViewModel.viewMode,

    chartViewModel.centerTimeSec,

    chartViewModel.firstTimeSec,

    chartViewModel.lastTimeSec,

    stackPeriodsLabel,

    chartDisplayAuxEmaOverlays.length,

    htfAuxEmaOverlayStale,

    chartDisplayComponentEvents,

    componentEventsStale,

    traceDisplayStatus,

    traceDisplayMissingRange,

    chartTimeframe,

  ]);



  useEffect(() => {

    const el = containerRef.current;

    if (!el) return;



    const chart = createChart(el, {

      layout: {

        background: { color: "#0f1419" },

        textColor: "#c8d0dc",

      },

      grid: {

        vertLines: { color: "#1e2836" },

        horzLines: { color: "#1e2836" },

      },

      rightPriceScale: { borderColor: "#2a3544" },

      timeScale: { borderColor: "#2a3544", timeVisible: true, secondsVisible: false },

      crosshair: { mode: 1 },

    });



    const series = chart.addSeries(CandlestickSeries, {

      upColor: "#22c55e",

      downColor: "#ef4444",

      borderVisible: false,

      wickUpColor: "#22c55e",

      wickDownColor: "#ef4444",

    });



    const emaSeriesByRole: Partial<Record<AnchorStackEmaRole, ISeriesApi<"Line">>> = {};

    for (const role of ["fast", "anchor", "slow"] as const) {

      const style = EMA_OVERLAY_STYLE[role];

      emaSeriesByRole[role] = chart.addSeries(LineSeries, {

        color: style.color,

        lineWidth: style.lineWidth,

        title: `EMA ${role} (overlay)`,

        priceLineVisible: false,

      });

    }



    chartRef.current = chart;

    seriesRef.current = series;

    emaSeriesByRoleRef.current = emaSeriesByRole;

    markersRef.current = createSeriesMarkers(series);

    const episodeLayersPrimitive = new EpisodeLayersPrimitive();
    series.attachPrimitive(episodeLayersPrimitive);
    episodeLayersRef.current = episodeLayersPrimitive;



    chart.subscribeClick((param) => {

      if (param.time === undefined) {

        return;

      }

      const timeSec = typeof param.time === "number" ? param.time : Number(param.time);

      selectBar(timeSec);

    });

    const adapter = interactionAdapterRef.current;

    const onPointerDown = () => adapter.onPointerDown();
    const onPointerUp = () => adapter.onPointerUp();
    const onWheel = () => adapter.onWheel();
    const keyboardNavigation = registerChartDocumentKeyboardNavigation({
      chartTabActive: () => chartTabActiveRef.current,
      chartCanvas: el,
      adapter,
    });

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: true });

    const visibleRangeHandler = (range: { from: number; to: number } | null) => {
      if (
        shouldSuppressPanShiftRequest(
          isApplyingViewportRef.current,
          suppressPanShiftUntilRef.current,
        )
      ) {
        dbgMark(DBG.pan.suppressedProgrammatic);
        adapter.onProgrammaticViewportStart();
        adapter.onVisibleLogicalRangeChange(range);
        adapter.onProgrammaticViewportEnd();
        return;
      }
      adapter.onVisibleLogicalRangeChange(range);
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(visibleRangeHandler);
    visibleRangeHandlerRef.current = () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(visibleRangeHandler);
    };



    const ro = new ResizeObserver((entries) => {

      const { width, height } = entries[0].contentRect;

      chart.applyOptions({ width, height });

      dispatchChartInteractionRef.current({ type: "resize" });

    });

    ro.observe(el);



    return () => {

      ro.disconnect();

      visibleRangeHandlerRef.current?.();
      visibleRangeHandlerRef.current = null;
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("wheel", onWheel);
      keyboardNavigation.unregister();

      // chart.remove() destroys all series; do not call removeSeries afterward.
      auxEmaSeriesRef.current.clear();

      tradeManagementLevelSeriesRef.current = [];

      chart.remove();

      chartRef.current = null;

      seriesRef.current = null;

      emaSeriesByRoleRef.current = {};

      markersRef.current = null;

      episodeLayersRef.current = null;

    };

  }, [selectBar]);

  useLayoutEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !runDetail || chartSeriesDataKey === "") {
      return;
    }

    dbgTimedSyncChartModel(
      DBG.chart.setDataCandles,
      () => {
        series.setData(toCandlestickSeriesData(chartCandles));
      },
      () => ({ barCount: chartCandles.length }),
    );
  }, [chartCandles, chartSeriesDataKey, runDetail]);

  useLayoutEffect(() => {
    const chart = chartRef.current;
    const emaByRole = emaSeriesByRoleRef.current;
    if (!chart || !runDetail || chartSeriesDataKey === "") {
      return;
    }

    dbgTimedSyncChartModel(
      DBG.chart.setDataAnchorEma,
      () => {
        for (const role of ["fast", "anchor", "slow"] as const) {
          const lineSeries = emaByRole[role];
          if (!lineSeries) continue;
          const overlay = chartEmaOverlays.find((o) => o.role === role);
          if (!overlay) {
            lineSeries.setData([]);
            continue;
          }
          lineSeries.applyOptions({ title: overlaySeriesTitle(overlay) });
          lineSeries.setData(
            overlay.points.map((p) => ({
              time: p.time as Time,
              value: p.value,
            })),
          );
        }
      },
      () => ({ overlayCount: chartEmaOverlays.length }),
    );

    dbgTimedSyncChartModel(
      DBG.chart.setDataAuxHtf,
      () => {
        const seriesMap = auxEmaSeriesRef.current;
        const activeIds = new Set(chartDisplayAuxEmaOverlays.map((overlay) => overlay.id));
        for (const [id, lineSeries] of [...seriesMap.entries()]) {
          if (!activeIds.has(id)) {
            chart.removeSeries(lineSeries);
            seriesMap.delete(id);
          }
        }
        chartDisplayAuxEmaOverlays.forEach((overlay, index) => {
          let lineSeries = seriesMap.get(overlay.id);
          if (!lineSeries) {
            lineSeries = chart.addSeries(LineSeries, {
              color: colorForAuxEmaOverlay(index),
              lineWidth: 2,
              lineStyle: overlay.dashed ? 2 : 0,
              title: overlay.label,
              priceLineVisible: false,
            });
            seriesMap.set(overlay.id, lineSeries);
          }
          if (overlay.points.length === 0 && lineSeries) {
            return;
          }
          lineSeries.applyOptions({
            color: colorForAuxEmaOverlay(index),
            lineStyle: overlay.dashed ? 2 : 0,
            title: overlay.label,
          });
          lineSeries.setData(
            overlay.points.map((p) => ({
              time: p.time as Time,
              value: p.value,
            })),
          );
        });
      },
      () => ({ overlayCount: chartDisplayAuxEmaOverlays.length }),
    );
  }, [
    chartEmaOverlays,
    chartDisplayAuxEmaOverlays,
    chartSeriesDataKey,
    runDetail,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    const command = chartViewportCommand;
    if (!chart || !command || chartCandles.length === 0) {
      return;
    }

    if (
      command.type === "restoreAfterWindowSwap" &&
      isWindowSwapTransactionCancelled(command.swapTransactionId)
    ) {
      dbgMark(DBG.renderWindow.shiftRestoreCancelled, {
        shiftSeq: command.shiftSeq,
        swapTransactionId: command.swapTransactionId,
      });
      acknowledgeChartViewportCommand();
      return;
    }

    if (
      command.type === "restoreAfterWindowSwap" &&
      command.shiftSeq !== windowShiftSeq
    ) {
      dbgMark(DBG.chart.viewportRestoreAfterShiftSkippedStale, {
        expected: command.shiftSeq,
        current: windowShiftSeq,
      });
      acknowledgeChartViewportCommand();
      return;
    }

    interactionAdapterRef.current.onProgrammaticViewportStart();
    isApplyingViewportRef.current = true;
    suppressPanShiftUntilRef.current = Date.now() + 300;

    if (command.type === "focusTrade") {
      dbgMark(DBG.chart.viewportApplyTradeFocus);
    }
    const dbgStep =
      command.type === "restoreAfterWindowSwap"
        ? DBG.chart.viewportRestoreAfterShift
        : DBG.chart.viewportApply;
    dbgTimedSync(
      dbgStep,
      () => {
        executeViewportCommand({ chart, command, candles: chartCandles });
        return null;
      },
      () => ({ command: command.type, barCount: chartCandles.length }),
    );

    acknowledgeChartViewportCommand();

    if (command.type === "restoreAfterWindowSwap") {
      settleWindowSwapCommit(command.shiftSeq, command.swapTransactionId);
    }

    window.setTimeout(() => {
      isApplyingViewportRef.current = false;
      interactionAdapterRef.current.onProgrammaticViewportEnd();
    }, 300);
  }, [
    chartViewportCommand,
    chartViewportCommandSeq,
    chartCandles,
    windowShiftSeq,
    acknowledgeChartViewportCommand,
    isWindowSwapTransactionCancelled,
    settleWindowSwapCommit,
  ]);

  useEffect(() => {
    if (!import.meta.env.VITE_EMA_PIPELINE_DEBUG) {
      return;
    }
    const chart = chartRef.current;
    const w = window as Window & {
      __chartVisibleTimeRange?: () => ReturnType<typeof readChartViewportDebug>["visibleTime"];
    };
    if (!chart || chartCandles.length === 0) {
      w.__chartVisibleTimeRange = () => null;
      return;
    }
    w.__chartVisibleTimeRange = () => readChartViewportDebug(chart).visibleTime;
  }, [chartCandles, chartViewportCommandSeq, chartSeriesDataKey]);

  useLayoutEffect(() => {

    const markersPlugin = markersRef.current;

    if (!markersPlugin || !runDetail || chartCandles.length === 0) return;



    let tradeMarkerCount = 0;
    let componentMarkerCount = 0;
    let tradeManagementMarkerCount = 0;
    dbgTimedSync(
      DBG.chart.markersRebuild,
      () => {
        const tradeMarkers = buildTradeMarkersForView(runTrades, selectedTradeId, chartCandles);
        const componentMarkers = buildComponentEventsForView(chartDisplayComponentEvents, {
          showEntryBlock: chartShowEntryBlockMarkers,
          showExitSignal: chartShowExitSignalMarkers,
          showSetup: chartShowSetupMarkers,
          viewCandles: chartCandles,
        });
        const tradeManagementMarkers = buildManagedPolicyEventsForView(managedPolicyEvents, {
          showPhases: chartShowTradeManagementPhaseMarkers,
          showExits: chartShowTradeManagementExitMarkers,
          selectedPositionId: selectedTrade?.position_id ?? null,
          viewCandles: chartCandles,
          trades: runTrades,
        });
        tradeMarkerCount = tradeMarkers.length;
        componentMarkerCount = componentMarkers.length;
        tradeManagementMarkerCount = tradeManagementMarkers.length;
        markersPlugin.setMarkers(
          [...tradeMarkers, ...componentMarkers, ...tradeManagementMarkers].sort(
            (a, b) => (a.time as number) - (b.time as number),
          ),
        );
      },
      () => ({ tradeMarkerCount, componentMarkerCount, tradeManagementMarkerCount }),
    );

  }, [
    chartCandles,
    runDetail,
    runTrades,
    managedPolicyEvents,
    selectedTrade,
    selectedTradeId,
    chartDisplayComponentEvents,
    windowShiftSeq,
    chartViewportCommandSeq,
    chartShowEntryBlockMarkers,
    chartShowExitSignalMarkers,
    chartShowSetupMarkers,
    chartShowTradeManagementPhaseMarkers,
    chartShowTradeManagementExitMarkers,
  ]);



  useEffect(() => {

    const series = seriesRef.current;

    if (!series) return;



    for (const line of tradePriceLinesRef.current) {

      series.removePriceLine(line);

    }

    tradePriceLinesRef.current = [];



    if (!selectedTrade) return;



    const specs = buildTradePriceLineSpecs(
      selectedTrade,
      tradeDisplayNumber(runTrades, selectedTrade.trade_id) ?? undefined,
    );

    tradePriceLinesRef.current = specs.map((spec) => series.createPriceLine(spec.options));

  }, [selectedTrade]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    for (const lineSeries of tradeManagementLevelSeriesRef.current) {
      chart.removeSeries(lineSeries);
    }
    tradeManagementLevelSeriesRef.current = [];

    if (!selectedTrade || !runDetail) return;

    const displayNumber = tradeDisplayNumber(runTrades, selectedTrade.trade_id);
    const curves = groupTradeManagementLevelCurves(
      buildTradeManagementLevelSegments({
        trade: selectedTrade,
        executionEvents: runDetail.result.execution_events,
        managedPolicyEvents,
        candles: chartCandles,
        chartTimeframe,
      }),
    );

    tradeManagementLevelSeriesRef.current = curves.map((curve) => {
      const isStop = curve.kind === "stop";
      const lineSeries = chart.addSeries(LineSeries, {
        color: isStop ? "#f87171" : "#60a5fa",
        lineWidth: 2,
        lineStyle: isStop ? 2 : 3,
        lineType: LineType.WithSteps,
        title: `${isStop ? "Stop" : "Take"} #${displayNumber ?? selectedTrade.trade_id}`,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      lineSeries.setData(
        curve.points.map((point) => ({
          time: point.timeSec as Time,
          value: point.price,
        })),
      );
      return lineSeries;
    });
  }, [
    chartCandles,
    chartTimeframe,
    managedPolicyEvents,
    runDetail,
    runTrades,
    selectedTrade,
  ]);



  useEffect(() => {
    const primitive = episodeLayersRef.current;
    const series = seriesRef.current;
    if (!primitive || !series) return;
    let stepSec = 300;
    try {
      stepSec = resolveChartTimeframeMs(chartTimeframe) / 1000;
    } catch {
      // keep the 5m default for placement outside the render window
    }
    const hasEpisodes = Object.keys(episodeHistories.histories).length > 0;
    series.priceScale().applyOptions({
      scaleMargins: hasEpisodes ? { top: 0.1, bottom: 0.16 } : { top: 0.2, bottom: 0.1 },
    });
    primitive.setState({
      histories: episodeHistories.histories,
      sides: episodeSides,
      layers: episodeLayers,
      times: chartCandles.map((candle) => candle.time),
      stepSec,
      highlight: episodeHighlight,
    });
  }, [
    chartCandles,
    chartTimeframe,
    episodeHistories.histories,
    episodeSides,
    episodeLayers,
    episodeHighlight,
  ]);

  if (!runDetail) {

    return null;

  }



  return (

    <section className="panel chart-panel">

      <div className="panel__header">

        <h2>Chart</h2>

        <p className="panel__hint">{chartHint}</p>

        {contextOverlayRefOptions.length > 0 ? (
          <label className="field field--inline chart-panel__overlay-ref">
            <span>HTF overlay context</span>
            <select
              value={effectiveContextOverlayRef ?? ""}
              onChange={(e) => setContextOverlayRef(e.target.value || null)}
            >
              <option value="">— select context —</option>
              {contextOverlayRefOptions.map((ref) => (
                <option key={ref} value={ref}>
                  {ref}
                </option>
              ))}
            </select>
          </label>
        ) : null}

      </div>

      {timeframeMismatch && reportTimeframe !== null && (

        <p className="banner banner--warn" role="status">

          Report timeframe ({reportTimeframe}) differs from chart timeframe ({chartTimeframe}).

        </p>

      )}

      {candlesSource === "unavailable" && marketError !== null && (

        <p className="banner banner--warn" role="status">

          Market data unavailable: {marketError}

        </p>

      )}

      {candlesSource === "market" && marketCandlesCount > CHART_RENDER_WINDOW_SIZE && (

        <p className="banner banner--info" role="status">

          Full report range cached ({marketCandlesCount} bars). Chart renders up to{" "}

          {CHART_RENDER_WINDOW_SIZE.toLocaleString()} bars per render window; pan shifts slice from
          in-memory cache (no extra API

          calls).

        </p>

      )}

      <ChartMarkerLegend
        showEntryBlockMarkers={chartShowEntryBlockMarkers}
        onShowEntryBlockMarkersChange={setChartShowEntryBlockMarkers}
        showExitSignalMarkers={chartShowExitSignalMarkers}
        onShowExitSignalMarkersChange={setChartShowExitSignalMarkers}
        showSetupMarkers={chartShowSetupMarkers}
        onShowSetupMarkersChange={setChartShowSetupMarkers}
        hasComponentEvents={chartDisplayComponentEvents.length > 0}
        hasTradeManagementEvents={hasManagedPolicyEvents(managedPolicyEvents)}
        showTradeManagementPhaseMarkers={chartShowTradeManagementPhaseMarkers}
        onShowTradeManagementPhaseMarkersChange={setChartShowTradeManagementPhaseMarkers}
        showTradeManagementExitMarkers={chartShowTradeManagementExitMarkers}
        onShowTradeManagementExitMarkersChange={setChartShowTradeManagementExitMarkers}
      />

      <EpisodeToolbar
        layers={episodeLayers}
        onLayersChange={setEpisodeLayers}
        side={episodeSide}
        onSideChange={setEpisodeSide}
        status={episodeStatus}
        refs={episodeParamsState.refs}
        chosenRef={episodeRef}
        onRefChange={setEpisodeRef}
      />

      {chartTradeFocusWarning && (

        <p className="banner banner--warn" role="status">

          {chartTradeFocusWarning}

        </p>

      )}

      {rangeWarning && (

        <p className="banner banner--warn" role="status">

          Selected trade entry is outside the loaded market data range.

        </p>

      )}

      {htfAuxEmaOverlayStale && (

        <p className="banner banner--info" role="status">

          HTF EMA lines are held from the previous signal trace while the chart window reloads. Values

          may not match the current view until trace finishes loading. A stable BFF HTF overlay is

          planned for a follow-up.

        </p>

      )}

      <div ref={panelBodyRef} className="chart-panel__body">

        <div className="chart-panel__main">

          <div ref={containerRef} className="chart-canvas" tabIndex={0} />

          {selectedTradeId !== null && (
            <ChartTradeFocusNav
              trades={trades}
              selectedTradeId={selectedTradeId}
              onSelectTrade={selectTrade}
            />
          )}

        </div>

        <ChartPanelSplitHandle
          asideWidth={asideWidth}
          maxAsideWidth={maxAsideWidth}
          {...splitHandleProps}
        />

        <div
          ref={asideRef}
          className={
            showAsideStack
              ? "chart-panel__aside chart-panel__aside--stacked"
              : "chart-panel__aside"
          }
          style={{ width: asideWidth, flexBasis: asideWidth }}
        >
          {showAsideStack && (
            <>
              <div
                className="chart-panel__aside-stack-top"
                style={{
                  height: diagnosticsHeight,
                  flexBasis: diagnosticsHeight,
                }}
              >
                <ChartTradeDiagnostics
                  trade={selectedTrade}
                  selectedTradeId={selectedTradeId}
                  tradeDisplayNumber={tradeDisplayNumber(trades, selectedTradeId) ?? undefined}
                  strategySpec={runDetail.strategy_spec}
                  chartEmaOverlays={chartEmaOverlays}
                  chartAuxEmaOverlays={chartDisplayAuxEmaOverlays}
                  focusWarning={chartTradeFocusWarning}
                />
              </div>
              <ChartAsideStackSplitHandle
                diagnosticsHeight={diagnosticsHeight}
                maxDiagnosticsHeight={maxDiagnosticsHeight}
                {...stackSplitHandleProps}
              />
            </>
          )}

          <div className="chart-panel__aside-stack-bottom">
            <ChartBarInspector
              selectedBarTimeSec={selectedBarTimeSec}
              candles={chartCandles}
              emaOverlays={chartEmaOverlays}
              onClear={() => selectBar(null)}
            >
              {selectedBarTimeSec !== null ? (
                <EpisodeBarSection
                  barTimeSec={selectedBarTimeSec}
                  sides={episodeSides}
                  histories={episodeHistories.histories}
                />
              ) : null}
            </ChartBarInspector>
          </div>
        </div>

      </div>

      <EpisodeTouchesTable
        side={episodeTable?.side ?? "long"}
        episode={episodeTable?.episode ?? null}
        highlight={episodeHighlight}
        onHighlight={setEpisodeHighlight}
      />

    </section>

  );

}
