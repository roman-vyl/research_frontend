import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chartMock = vi.hoisted(() => {
  const series = () => ({ applyOptions: vi.fn(), setData: vi.fn(), attachPrimitive: vi.fn() });
  const state = {
    createOptions: [] as unknown[],
    chartApplied: [] as unknown[],
    seriesOptions: [] as unknown[],
  };
  const chart = {
    addSeries: vi.fn((_type: unknown, options: unknown) => {
      state.seriesOptions.push(options);
      return series();
    }),
    addCustomSeries: vi.fn(() => series()),
    applyOptions: vi.fn((options: unknown) => state.chartApplied.push(options)),
    remove: vi.fn(),
  };
  return { state, chart };
});

vi.mock("lightweight-charts", () => ({
  CandlestickSeries: "Candlestick",
  LineSeries: "Line",
  createChart: vi.fn((_host: unknown, options: unknown) => {
    chartMock.state.createOptions.push(options);
    return chartMock.chart;
  }),
  createSeriesMarkers: vi.fn(() => ({ setMarkers: vi.fn() })),
}));

import { RESEARCH_CHART_PALETTE, RuntimeCandleChart } from "@/features/runtime/RuntimeCandleChart";

const listeners: Array<() => void> = [];

beforeEach(() => {
  chartMock.state.createOptions.length = 0;
  chartMock.state.chartApplied.length = 0;
  chartMock.state.seriesOptions.length = 0;
  listeners.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: vi.fn(),
  }));
});

function renderChart() {
  return render(
    <RuntimeCandleChart
      candles={[]}
      projection={null}
      applied={null}
      cycles={null}
      openTrade={null}
      protection={null}
      ema={[]}
      episodes={null}
    />,
  );
}

describe("RuntimeCandleChart palette", () => {
  it("creates the chart with the Research backtest chart colors", () => {
    renderChart();
    expect(chartMock.state.createOptions[0]).toMatchObject({
      layout: { background: { color: "#0f1419" }, textColor: "#c8d0dc" },
      grid: { vertLines: { color: "#1e2836" }, horzLines: { color: "#1e2836" } },
      rightPriceScale: { borderColor: "#2a3544" },
      timeScale: { borderColor: "#2a3544" },
    });
    expect(chartMock.state.seriesOptions[0]).toMatchObject({
      upColor: "#22c55e",
      downColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    expect(RESEARCH_CHART_PALETTE.muted).toBe("#8b949e");
  });

  it("does not restyle the chart when the color scheme changes", () => {
    renderChart();
    for (const listener of listeners) listener();
    expect(listeners).toHaveLength(0);
    expect(chartMock.state.chartApplied.filter((o) => typeof o === "object" && o !== null && "layout" in o)).toHaveLength(0);
  });
});
