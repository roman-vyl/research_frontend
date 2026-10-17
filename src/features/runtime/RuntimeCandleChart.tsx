import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

import type { ChartBar } from "@/api/types";
import type { Projection } from "@/features/runtime/runtimeProjection";

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

function lineOptions(color: string) {
  return {
    color,
    lineWidth: 2 as const,
    pointMarkersVisible: true,
    pointMarkersRadius: 2,
    lastValueVisible: false,
    priceLineVisible: false,
  };
}

/**
 * One candlestick series plus three step lines (entry, stop, take) from `projection`; each run of
 * consecutive signal bars is its own set of series, so no line joins two runs. Bars without a recorded evaluation get a small marker. Pan and zoom are left to the library.
 */
export function RuntimeCandleChart({
  candles,
  projection = null,
}: {
  candles: readonly ChartBar[];
  projection?: Projection | null;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const runSeriesRef = useRef<{ entry: ISeriesApi<"Line">; stop: ISeriesApi<"Line">; take: ISeriesApi<"Line"> }[]>([]);
  const paletteRef = useRef<Palette | null>(null);
  const noEvaluationRef = useRef<readonly number[]>([]);
  const applyMarkersRef = useRef<() => void>(() => undefined);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

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
    chartRef.current = chart;
    seriesRef.current = series;
    paletteRef.current = palette;
    markersRef.current = createSeriesMarkers(series, []);

    const resize = new ResizeObserver(() => chart.applyOptions({ width: host.clientWidth, height: host.clientHeight }));
    resize.observe(host);
    const applyMarkers = () => {
      const times = noEvaluationRef.current;
      const color = readPalette(host).muted;
      markersRef.current?.setMarkers(
        times.map((time) => ({ time: time as Time, position: "belowBar" as const, shape: "circle" as const, color, size: 0.3 })),
      );
    };
    applyMarkersRef.current = applyMarkers;
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const restyle = () => {
      const p = readPalette(host);
      chart.applyOptions(chartOptions(p));
      series.applyOptions({ upColor: p.up, downColor: p.down, wickUpColor: p.up, wickDownColor: p.down });
      paletteRef.current = p;
      for (const run of runSeriesRef.current) {
        run.entry.applyOptions({ color: p.text });
        run.stop.applyOptions({ color: p.down });
        run.take.applyOptions({ color: p.up });
      }
      applyMarkers();
    };
    scheme.addEventListener("change", restyle);

    return () => {
      scheme.removeEventListener("change", restyle);
      resize.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      runSeriesRef.current = [];
      markersRef.current = null;
    };
  }, []);

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
    const chart = chartRef.current;
    const palette = paletteRef.current;
    if (!chart || !palette) return;
    for (const old of runSeriesRef.current) {
      chart.removeSeries(old.entry);
      chart.removeSeries(old.stop);
      chart.removeSeries(old.take);
    }
    // one set of series per run of consecutive signal bars: the library joins points across gaps
    runSeriesRef.current = (projection?.runs ?? []).map((run) => {
      const entry = chart.addSeries(LineSeries, lineOptions(palette.text));
      const stop = chart.addSeries(LineSeries, lineOptions(palette.down));
      const take = chart.addSeries(LineSeries, lineOptions(palette.up));
      entry.setData(run.entry.map((p) => ({ time: p.time as Time, value: p.value })));
      stop.setData(run.stop.map((p) => ({ time: p.time as Time, value: p.value })));
      take.setData(run.take.map((p) => ({ time: p.time as Time, value: p.value })));
      return { entry, stop, take };
    });
    noEvaluationRef.current = projection?.noEvaluationTimes ?? [];
    applyMarkersRef.current();
  }, [projection]);

  return <div ref={hostRef} className="rt-chart-host" role="img" aria-label="Candlestick chart" />;
}
