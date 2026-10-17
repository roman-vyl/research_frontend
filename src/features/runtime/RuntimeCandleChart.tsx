import { CandlestickSeries, createChart, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import { useEffect, useRef } from "react";

import type { ChartBar } from "@/api/types";

type Palette = { text: string; grid: string; up: string; down: string };

/** Colours come from the Surface tokens of the element, so the chart follows light and dark. */
function readPalette(el: HTMLElement): Palette {
  const css = getComputedStyle(el);
  const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    text: token("--ink-2", "#52514e"),
    grid: token("--hair", "#e1e0d9"),
    up: token("--pos-500", "#2f9e44"),
    down: token("--neg-500", "#d75352"),
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

/** One candlestick series; pan and zoom are left to the library. */
export function RuntimeCandleChart({ candles }: { candles: readonly ChartBar[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

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

    const resize = new ResizeObserver(() => chart.applyOptions({ width: host.clientWidth, height: host.clientHeight }));
    resize.observe(host);
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const restyle = () => {
      const p = readPalette(host);
      chart.applyOptions(chartOptions(p));
      series.applyOptions({ upColor: p.up, downColor: p.down, wickUpColor: p.up, wickDownColor: p.down });
    };
    scheme.addEventListener("change", restyle);

    return () => {
      scheme.removeEventListener("change", restyle);
      resize.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
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

  return <div ref={hostRef} className="rt-chart-host" role="img" aria-label="Candlestick chart" />;
}
