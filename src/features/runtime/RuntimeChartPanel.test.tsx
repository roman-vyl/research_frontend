/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeStrategyInstance, RuntimeStrategyList } from "@/api/runtime";
import type { CandlesWindowBundle, MarketBounds } from "@/api/types";
import { clearMarketResourceCache } from "@/features/chart/marketResourceCache";
import { RuntimeDashboard } from "@/features/runtime/RuntimeDashboard";

const fetchRuntimeStrategyInstances = vi.fn();
const fetchMarketBounds = vi.fn();
const fetchCandlesWindow = vi.fn();
const chartRenders = vi.fn();

vi.mock("@/api/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/runtime")>();
  return { ...actual, fetchRuntimeStrategyInstances: (...a: unknown[]) => fetchRuntimeStrategyInstances(...a) };
});
vi.mock("@/api/client", () => ({
  fetchMarketBounds: (...a: unknown[]) => fetchMarketBounds(...a),
  fetchCandlesWindow: (...a: unknown[]) => fetchCandlesWindow(...a),
}));
vi.mock("@/features/runtime/RuntimeCandleChart", () => ({
  RuntimeCandleChart: ({ candles }: { candles: readonly unknown[] }) => {
    chartRenders(candles.length);
    return <div data-testid="chart" data-bars={candles.length} />;
  },
}));

const TF = 300_000;
const LATEST = 1_700_000_100_000 - (1_700_000_100_000 % TF);
const DAY_30 = 30 * 24 * 60 * 60 * 1000;

function inst(file: string, instrument: string, tf = "5m", enabled = true): RuntimeStrategyInstance {
  return {
    strategy_instance_id: `ema_pullback:${file}`,
    strategy_id: "ema_pullback",
    instrument,
    base_timeframe: tf,
    enabled,
    source_path: `${file}.json`,
  };
}

function list(...items: RuntimeStrategyInstance[]): RuntimeStrategyList {
  return { scanned_file_count: items.length, strategy_instances: items, invalid_files: [], duplicate_identities: [] };
}

function bundle(fromMs: number, toOpenTimeMs: number): CandlesWindowBundle {
  const candles = [];
  for (let t = fromMs; t <= toOpenTimeMs; t += TF) {
    candles.push({ time: t / 1000, open: 1, high: 2, low: 0.5, close: 1.5 });
  }
  return {
    candles,
    coverage: {
      requested_from_ms: fromMs,
      requested_to_ms: toOpenTimeMs + TF,
      actual_from_ms: fromMs,
      actual_to_ms: toOpenTimeMs + TF,
      truncated: false,
    },
  };
}

let latest = LATEST;
let sym = 0;
function freshSymbols() {
  sym += 1;
  return { eth: `ETH${sym}USDT.P`, btc: `BTC${sym}USDT.P` };
}

function card(name: string): HTMLElement {
  const button = within(screen.getByLabelText("Strategies")).getByText(name, { selector: ".rt-name" }).closest("button");
  if (!button) throw new Error(`no card button for ${name}`);
  return button;
}

describe("Runtime strategy selection and chart", () => {
  beforeEach(() => {
    clearMarketResourceCache(); // test isolation only
    fetchRuntimeStrategyInstances.mockReset();
    fetchMarketBounds.mockReset();
    fetchCandlesWindow.mockReset();
    chartRenders.mockReset();
    latest = LATEST;
    fetchMarketBounds.mockImplementation(async (p: { symbol: string; timeframe: string }) => ({
      symbol: p.symbol,
      timeframe: p.timeframe,
      earliest_open_time_ms: LATEST - 400 * 86_400_000,
      latest_open_time_ms: latest,
      stream_state: "ready",
    }) satisfies MarketBounds);
    fetchCandlesWindow.mockImplementation(async (p: { fromMs: number; toOpenTimeMs: number }) =>
      bundle(p.fromMs, p.toOpenTimeMs),
    );
  });
  afterEach(cleanup);

  it("selects nothing on open and shows the prompt; no market request is made", async () => {
    const { eth } = freshSymbols();
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth)));
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");
    expect(screen.getByText("Select a strategy")).toBeTruthy();
    expect(card("a").getAttribute("aria-pressed")).toBe("false");
    expect(fetchMarketBounds).not.toHaveBeenCalled();
  });

  it("marks one card selected, selects disabled strategies, loads bounds then candles", async () => {
    const { eth, btc } = freshSymbols();
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth), inst("b", btc, "5m", false)));
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");

    fireEvent.click(card("b"));
    expect(card("b").getAttribute("aria-pressed")).toBe("true");
    expect(card("a").getAttribute("aria-pressed")).toBe("false");
    await screen.findByTestId("chart");
    expect(fetchMarketBounds).toHaveBeenCalledTimes(1);
    expect(fetchMarketBounds.mock.calls[0]![0]).toMatchObject({ symbol: btc, timeframe: "5m" });
    expect(fetchCandlesWindow).toHaveBeenCalledTimes(1);
    const req = fetchCandlesWindow.mock.calls[0]![0];
    expect(req.fromMs).toBe(LATEST + TF - DAY_30);
    expect(req.toOpenTimeMs).toBe(LATEST);
    expect(screen.getByTestId("chart").getAttribute("data-bars")).toBe("8640");
    expect(screen.getByText(/Last bar \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/)).toBeTruthy();
  });

  it("selecting another strategy of the same market makes no request and keeps the chart", async () => {
    const { eth } = freshSymbols();
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth), inst("b", eth)));
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");
    fireEvent.click(card("a"));
    await screen.findByTestId("chart");
    const rendersBefore = chartRenders.mock.calls.length;

    fireEvent.click(card("b"));
    expect(card("b").getAttribute("aria-pressed")).toBe("true");
    const panel = screen.getByLabelText("Market chart");
    expect(within(panel).getByText("b")).toBeTruthy();
    expect(fetchMarketBounds).toHaveBeenCalledTimes(1);
    expect(fetchCandlesWindow).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("chart").getAttribute("data-bars")).toBe("8640");
    expect(rendersBefore).toBeGreaterThan(0);
  });

  it("a different market loads and aborts the previous request; a late response is not drawn", async () => {
    const { eth, btc } = freshSymbols();
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth), inst("c", btc)));
    let release: (() => void) | undefined;
    let firstSignal: AbortSignal | undefined;
    fetchMarketBounds.mockImplementationOnce(async (p: { symbol: string; timeframe: string; signal: AbortSignal }) => {
      firstSignal = p.signal;
      await new Promise<void>((r) => {
        release = r;
      });
      return { symbol: p.symbol, timeframe: p.timeframe, earliest_open_time_ms: 0, latest_open_time_ms: LATEST, stream_state: "ready" };
    });
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");

    fireEvent.click(card("a"));
    await waitFor(() => expect(firstSignal).toBeDefined());
    fireEvent.click(card("c"));
    expect(firstSignal!.aborted).toBe(true);
    await screen.findByTestId("chart");
    expect(fetchCandlesWindow.mock.calls.map((c) => c[0].symbol)).toEqual([btc]);

    await act(async () => {
      release!();
    });
    expect(fetchCandlesWindow.mock.calls.map((c) => c[0].symbol)).toEqual([btc]);
    expect(screen.getByLabelText("Market chart").textContent).toContain(btc);
    expect(screen.getByLabelText("Market chart").textContent).not.toContain(eth);
  });

  it("keeps the selection when the list is refreshed and does not reload the chart", async () => {
    const { eth } = freshSymbols();
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth)));
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");
    fireEvent.click(card("a"));
    await screen.findByTestId("chart");

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(fetchRuntimeStrategyInstances).toHaveBeenCalledTimes(2));
    await screen.findByLabelText("Strategies");
    expect(card("a").getAttribute("aria-pressed")).toBe("true");
    expect(fetchMarketBounds).toHaveBeenCalledTimes(1);
    expect(fetchCandlesWindow).toHaveBeenCalledTimes(1);
  });

  it("clears the selection when its strategy is gone after a list refresh", async () => {
    const { eth, btc } = freshSymbols();
    fetchRuntimeStrategyInstances.mockResolvedValueOnce(list(inst("a", eth), inst("c", btc)));
    fetchRuntimeStrategyInstances.mockResolvedValueOnce(list(inst("c", btc)));
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");
    fireEvent.click(card("a"));
    await screen.findByTestId("chart");

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getByText("Select a strategy")).toBeTruthy());
    expect(card("c").getAttribute("aria-pressed")).toBe("false");
  });

  it("chart Refresh: unchanged latest = one bounds request and zero candle requests", async () => {
    const { eth } = freshSymbols();
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth)));
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");
    fireEvent.click(card("a"));
    await screen.findByTestId("chart");
    fetchMarketBounds.mockClear();
    fetchCandlesWindow.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Refresh chart" }));
    await waitFor(() => expect(fetchMarketBounds).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh chart" })).toHaveProperty("disabled", false));
    expect(fetchCandlesWindow).not.toHaveBeenCalled();
  });

  it("chart Refresh: latest +3 bars = one tail request", async () => {
    const { eth } = freshSymbols();
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth)));
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");
    fireEvent.click(card("a"));
    await screen.findByTestId("chart");
    fetchMarketBounds.mockClear();
    fetchCandlesWindow.mockClear();

    latest = LATEST + 3 * TF;
    fireEvent.click(screen.getByRole("button", { name: "Refresh chart" }));
    await waitFor(() => expect(fetchCandlesWindow).toHaveBeenCalledTimes(1));
    expect(fetchMarketBounds).toHaveBeenCalledTimes(1);
    const req = fetchCandlesWindow.mock.calls[0]![0];
    expect(req.fromMs).toBe(LATEST + TF);
    expect(req.toOpenTimeMs).toBe(LATEST + 3 * TF);
  });

  it("bounds failure shows an error with Retry and makes no candles request; Retry recovers", async () => {
    const { eth } = freshSymbols();
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth)));
    fetchMarketBounds.mockRejectedValueOnce(new Error("down"));
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");
    fireEvent.click(card("a"));
    expect((await screen.findByRole("alert")).textContent).toBe("Market bounds are unavailable");
    expect(fetchCandlesWindow).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Retry chart" }));
    await screen.findByTestId("chart");
  });

  it("candles failure shows an error", async () => {
    const { eth } = freshSymbols();
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth)));
    fetchCandlesWindow.mockRejectedValueOnce(new Error("down"));
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");
    fireEvent.click(card("a"));
    expect((await screen.findByRole("alert")).textContent).toBe("Candles are unavailable");
  });

  it("unsupported timeframe shows a message and makes no request", async () => {
    const { eth } = freshSymbols();
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth, "7x")));
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");
    fireEvent.click(card("a"));
    expect((await screen.findByRole("alert")).textContent).toBe("This timeframe is not supported by the chart");
    expect(fetchMarketBounds).not.toHaveBeenCalled();
    expect(fetchCandlesWindow).not.toHaveBeenCalled();
  });

  it("empty window shows the empty state", async () => {
    const { eth } = freshSymbols();
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth)));
    fetchCandlesWindow.mockResolvedValue({
      candles: [],
      coverage: { requested_from_ms: 0, requested_to_ms: 1, actual_from_ms: LATEST + TF - DAY_30, actual_to_ms: LATEST + TF, truncated: false },
    });
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");
    fireEvent.click(card("a"));
    await screen.findByText("No candles in this window");
  });
});
