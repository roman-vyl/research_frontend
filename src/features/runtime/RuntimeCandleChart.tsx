import {
  CandlestickSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

import type { ChartBar } from "@/api/types";
import { AppliedSeriesView, type AppliedSeriesOptions } from "@/features/runtime/appliedSeries";
import { ProjectionSeriesView, type ProjectionSeriesOptions } from "@/features/runtime/projectionSeries";
import type { AppliedOrders } from "@/features/runtime/runtimeAppliedOrders";
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

function projectionColors(p: Palette): Partial<ProjectionSeriesOptions> {
  return { entryColor: p.text, stopColor: p.down, takeColor: p.up };
}

function appliedColors(p: Palette): Partial<AppliedSeriesOptions> {
  return { entryColor: p.text, stopColor: p.down, takeColor: p.up };
}

/**
 * One candlestick series plus ONE custom series that draws the three projection lines (entry, stop,
 * take) for the signal bars of `projection`; it breaks the lines wherever bars are not consecutive and
 * draws every point, so a one-bar signal is visible. Bars without a recorded evaluation are left empty.
 * A second custom series draws a ring per price of every applied order in `applied`, in the same
 * colours. The number of series is fixed. Pan and zoom are left to the library.
 */
export function RuntimeCandleChart({
  candles,
  projection = null,
  applied = null,
}: {
  candles: readonly ChartBar[];
  projection?: Projection | null;
  applied?: AppliedOrders | null;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const projectionRef = useRef<ISeriesApi<"Custom", Time> | null>(null);
  const appliedRef = useRef<ISeriesApi<"Custom", Time> | null>(null);

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
    chartRef.current = chart;
    seriesRef.current = series;
    projectionRef.current = projectionSeries;
    appliedRef.current = appliedSeries;

    const resize = new ResizeObserver(() => chart.applyOptions({ width: host.clientWidth, height: host.clientHeight }));
    resize.observe(host);
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const restyle = () => {
      const p = readPalette(host);
      chart.applyOptions(chartOptions(p));
      series.applyOptions({ upColor: p.up, downColor: p.down, wickUpColor: p.up, wickDownColor: p.down });
      projectionSeries.applyOptions(projectionColors(p));
      appliedSeries.applyOptions(appliedColors(p));
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
    projectionRef.current?.setData(
      (projection?.points ?? []).map((p) => ({ time: p.time as Time, entry: p.entry, stop: p.stop, take: p.take })),
    );
  }, [projection]);

  useEffect(() => {
    appliedRef.current?.setData((applied?.bars ?? []).map((b) => ({ time: b.time as Time, rings: b.rings })));
  }, [applied]);

  return <div ref={hostRef} className="rt-chart-host" role="img" aria-label="Candlestick chart" />;
}
