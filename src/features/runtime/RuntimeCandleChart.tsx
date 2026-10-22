import {
  CandlestickSeries,
  createChart,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

import type { ChartBar } from "@/api/types";
import {
  EMPTY_EPISODE_LAYERS_STATE,
  EpisodeLayersPrimitive,
  type EpisodeLayersState,
} from "@/features/episodes/EpisodeLayersPrimitive";
import { EMA_ROLE_COLORS } from "@/features/runtime/runtimeLayers";
import { AppliedSeriesView, type AppliedSeriesOptions } from "@/features/runtime/appliedSeries";
import { ProjectionSeriesView, type ProjectionSeriesOptions } from "@/features/runtime/projectionSeries";
import { OpenTradeSeriesView, type OpenTradeSeriesOptions } from "@/features/runtime/openTradeSeries";
import type { AppliedOrders, AppliedRing } from "@/features/runtime/runtimeAppliedOrders";
import type { AppliedProtection, OpenTradeProjection } from "@/features/runtime/runtimeOpenTrade";
import type { Projection } from "@/features/runtime/runtimeProjection";
import { closeLabel, closePosition, type TradeCycles } from "@/features/runtime/runtimeTradeCycles";
import { tradeCycleData, TradeCycleSeriesView, type TradeCycleSeriesOptions } from "@/features/runtime/tradeCycleSeries";

type Palette = { text: string; grid: string; up: string; down: string; muted: string };

/** Colours come from the Surface tokens of the element, so the chart follows light and dark. */
function readPalette(el: HTMLElement): Palette {
  const css = getComputedStyle(el);
  const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    text: token("--ink-2", "#52514e"),
    grid: token("--hair", "#e1e0d9"),
    up: token("--pos-500", "#2f9e44"),
    down: token("--neg-500", "#d75352"),
    muted: token("--ink-muted", "#8a8984"),
  };
}

function chartOptions(p: Palette) {
  return {
    layout: { background: { color: "transparent" }, textColor: p.text },
    grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
    rightPriceScale: { borderColor: p.grid },
    timeScale: { borderColor: p.grid, timeVisible: true, secondsVisible: false },
  };
}

function projectionColors(p: Palette): Partial<ProjectionSeriesOptions> {
  return { entryColor: p.text, stopColor: p.down, takeColor: p.up };
}

function appliedColors(p: Palette): Partial<AppliedSeriesOptions> {
  return { entryColor: p.text, stopColor: p.down, takeColor: p.up };
}

function openTradeColors(p: Palette): Partial<OpenTradeSeriesOptions> {
  return { stopColor: p.down, takeColor: p.up };
}

function cycleColors(p: Palette): Partial<TradeCycleSeriesOptions> {
  return { entryColor: p.text, stopColor: p.down, takeColor: p.up };
}

/**
 * Close labels on the candles; SL and TP in the stop and take colours, any other reason muted. Engine's
 * active close signal is a "close" marker above its candle, never placed at a price.
 */
function closeMarkers(cycles: TradeCycles | null, openTrade: OpenTradeProjection | null, p: Palette): SeriesMarker<Time>[] {
  const closes: SeriesMarker<Time>[] = (cycles?.closes ?? []).map((mark) => ({
    time: mark.time as Time,
    position: closePosition(mark),
    shape: "square",
    size: 0.6,
    color: mark.reason === "stop_loss" ? p.down : mark.reason === "take_profit" ? p.up : p.muted,
    text: closeLabel(mark.reason),
  }));
  const signals: SeriesMarker<Time>[] = (openTrade?.closeTimes ?? []).map((time) => ({
    time: time as Time,
    position: "aboveBar",
    shape: "circle",
    size: 0.5,
    color: p.muted,
    text: "close",
  }));
  return [...closes, ...signals].sort((a, b) => (a.time as number) - (b.time as number));
}

/** Applied entry rings and confirmed protection rings share one ring series, merged per bar. */
function ringData(applied: AppliedOrders | null, protection: AppliedProtection | null) {
  const byTime = new Map<number, AppliedRing[]>();
  for (const bar of [...(applied?.bars ?? []), ...(protection?.bars ?? [])]) {
    byTime.set(bar.time, [...(byTime.get(bar.time) ?? []), ...bar.rings]);
  }
  return [...byTime.entries()].sort(([a], [b]) => a - b).map(([time, rings]) => ({ time: time as Time, rings }));
}

const EMA_ROLES = ["fast", "anchor", "slow"] as const;
export type EmaRole = (typeof EMA_ROLES)[number];
/** Points of one EMA line of the stack, already inside the candle window. */
export type EmaLineData = { role: EmaRole; points: readonly { time: number; value: number }[] };

/**
 * One candlestick series plus ONE custom series that draws the three projection lines (entry, stop,
 * take) for the signal bars of `projection`; it breaks the lines wherever bars are not consecutive and
 * draws every point, so a one-bar signal is visible. Bars without a recorded evaluation are left empty.
 * A second custom series draws a ring per price of every applied order in `applied`, in the same
 * colours. A third custom series draws trade cycles from `cycles`: a filled arrow at each fill price and,
for each position period, the entry line and dashed stop and take; close labels are markers on the
candles, never at a price. A fourth custom series draws Engine's open-position Stop and Take lines from
`openTrade`, broken between trades; its active close signals are "close" markers on the candles.
Confirmed protection rings from `protection` join the applied ring series. Three line series draw the EMA stack
(one per role, empty when not given) and one primitive on the candles draws the EMA stack episodes, clipped to the candle
window. The number of series is fixed. Pan and zoom are left to the library.
 */
export function RuntimeCandleChart({
  candles,
  projection = null,
  applied = null,
  cycles = null,
  openTrade = null,
  protection = null,
  ema = [],
  episodes = null,
}: {
  candles: readonly ChartBar[];
  projection?: Projection | null;
  applied?: AppliedOrders | null;
  cycles?: TradeCycles | null;
  openTrade?: OpenTradeProjection | null;
  protection?: AppliedProtection | null;
  ema?: readonly EmaLineData[];
  /** Episode layers state (`clipToCandles` is forced on); null draws nothing. */
  episodes?: EpisodeLayersState | null;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const projectionRef = useRef<ISeriesApi<"Custom", Time> | null>(null);
  const appliedRef = useRef<ISeriesApi<"Custom", Time> | null>(null);
  const cyclesRef = useRef<ISeriesApi<"Custom", Time> | null>(null);
  const openTradeRef = useRef<ISeriesApi<"Custom", Time> | null>(null);
  const emaSeriesRef = useRef<Record<EmaRole, ISeriesApi<"Line", Time>> | null>(null);
  const episodesRef = useRef<EpisodeLayersPrimitive | null>(null);
  const openTradeDataRef = useRef<OpenTradeProjection | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const hostPaletteRef = useRef<Palette | null>(null);
  const cyclesDataRef = useRef<TradeCycles | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const palette = readPalette(host);
    const chart = createChart(host, { ...chartOptions(palette), width: host.clientWidth, height: host.clientHeight });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: palette.up,
      downColor: palette.down,
      borderVisible: false,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
    });
    const projectionSeries = chart.addCustomSeries(new ProjectionSeriesView(), projectionColors(palette));
    const appliedSeries = chart.addCustomSeries(new AppliedSeriesView(), appliedColors(palette));
    const cyclesSeries = chart.addCustomSeries(new TradeCycleSeriesView(), cycleColors(palette));
    const openTradeSeries = chart.addCustomSeries(new OpenTradeSeriesView(), openTradeColors(palette));
    const emaSeries = Object.fromEntries(
      EMA_ROLES.map((role) => [
        role,
        chart.addSeries(LineSeries, {
          color: EMA_ROLE_COLORS[role],
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        }),
      ]),
    ) as Record<EmaRole, ISeriesApi<"Line", Time>>;
    const episodesPrimitive = new EpisodeLayersPrimitive();
    series.attachPrimitive(episodesPrimitive);
    const markers = createSeriesMarkers(series, []);
    emaSeriesRef.current = emaSeries;
    episodesRef.current = episodesPrimitive;
    hostPaletteRef.current = palette;
    chartRef.current = chart;
    seriesRef.current = series;
    projectionRef.current = projectionSeries;
    appliedRef.current = appliedSeries;
    cyclesRef.current = cyclesSeries;
    openTradeRef.current = openTradeSeries;
    markersRef.current = markers;

    const resize = new ResizeObserver(() => chart.applyOptions({ width: host.clientWidth, height: host.clientHeight }));
    resize.observe(host);
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const restyle = () => {
      const p = readPalette(host);
      chart.applyOptions(chartOptions(p));
      series.applyOptions({ upColor: p.up, downColor: p.down, wickUpColor: p.up, wickDownColor: p.down });
      projectionSeries.applyOptions(projectionColors(p));
      appliedSeries.applyOptions(appliedColors(p));
      cyclesSeries.applyOptions(cycleColors(p));
      openTradeSeries.applyOptions(openTradeColors(p));
      hostPaletteRef.current = p;
      markers.setMarkers(closeMarkers(cyclesDataRef.current, openTradeDataRef.current, p));
    };
    scheme.addEventListener("change", restyle);

    return () => {
      scheme.removeEventListener("change", restyle);
      resize.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      projectionRef.current = null;
      appliedRef.current = null;
      cyclesRef.current = null;
      openTradeRef.current = null;
      markersRef.current = null;
      emaSeriesRef.current = null;
      episodesRef.current = null;
      hostPaletteRef.current = null;
    };
  }, []);

  useEffect(() => {
    const lines = emaSeriesRef.current;
    if (lines === null) return;
    for (const role of EMA_ROLES) {
      const given = ema.find((line) => line.role === role);
      lines[role].setData((given?.points ?? []).map((p) => ({ time: p.time as Time, value: p.value })));
    }
  }, [ema]);

  useEffect(() => {
    episodesRef.current?.setState(episodes === null ? EMPTY_EPISODE_LAYERS_STATE : { ...episodes, clipToCandles: true });
  }, [episodes]);

  useEffect(() => {
    seriesRef.current?.setData(
      candles.map((bar) => ({
        time: bar.time as Time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    );
  }, [candles]);

  useEffect(() => {
    projectionRef.current?.setData(
      (projection?.points ?? []).map((p) => ({ time: p.time as Time, entry: p.entry, stop: p.stop, take: p.take })),
    );
  }, [projection]);

  useEffect(() => {
    appliedRef.current?.setData(ringData(applied, protection));
  }, [applied, protection]);

  useEffect(() => {
    cyclesDataRef.current = cycles;
    openTradeDataRef.current = openTrade;
    cyclesRef.current?.setData(cycles === null ? [] : tradeCycleData(candles.map((bar) => bar.time), cycles));
    openTradeRef.current?.setData(
      (openTrade?.points ?? []).map((p) => ({ time: p.time as Time, segment: p.segment, stop: p.stop, take: p.take })),
    );
    const palette = hostPaletteRef.current;
    if (palette !== null) markersRef.current?.setMarkers(closeMarkers(cycles, openTrade, palette));
  }, [candles, cycles, openTrade]);

  return <div ref={hostRef} className="rt-chart-host" role="img" aria-label="Candlestick chart" />;
}
