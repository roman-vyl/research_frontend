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
const fetchJournalEvents = vi.fn();
const fetchJournalStrategyInstances = vi.fn();

vi.mock("@/api/journal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/journal")>()),
  fetchJournalEvents: (...a: unknown[]) => fetchJournalEvents(...a),
  fetchJournalStrategyInstances: (...a: unknown[]) => fetchJournalStrategyInstances(...a),
}));

vi.mock("@/api/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/runtime")>();
  return { ...actual, fetchRuntimeStrategyInstances: (...a: unknown[]) => fetchRuntimeStrategyInstances(...a) };
});
vi.mock("@/api/client", () => ({
  fetchMarketBounds: (...a: unknown[]) => fetchMarketBounds(...a),
  fetchCandlesWindow: (...a: unknown[]) => fetchCandlesWindow(...a),
}));
vi.mock("@/features/runtime/RuntimeCandleChart", () => ({
  RuntimeCandleChart: ({
    candles,
    projection,
    applied,
  }: {
    candles: readonly unknown[];
    projection?: { points: unknown[]; noEvaluationTimes: number[]; unreadableCount: number } | null;
    applied?: { bars: { rings: unknown[] }[]; appliedCount: number } | null;
  }) => {
    chartRenders(candles.length);
    return (
      <div
        data-testid="chart"
        data-bars={candles.length}
        data-points={projection ? projection.points.length : "none"}
        data-noeval={projection ? projection.noEvaluationTimes.length : "none"}
        data-rings={applied ? applied.bars.reduce((n, b) => n + b.rings.length, 0) : "none"}
      />
    );
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
    fetchJournalEvents.mockReset();
    fetchJournalStrategyInstances.mockReset();
    fetchJournalStrategyInstances.mockResolvedValue([]);
    fetchJournalEvents.mockResolvedValue({ events: [], truncated: false });
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

  describe("projection lines", () => {
    const entry = (price: string) => ({
      side: "long",
      source_plan_bar_open_time_ms: 0,
      planned_entry_price: price,
      initial_stop_price: "90",
      initial_take_price: "120",
      locked_exit_profile: "runner",
    });
    const ev = (bar: number, desired: unknown, id = `e${bar}`) => ({
      event_id: id,
      event_type: "live_entry_evaluated",
      occurred_at: `2026-10-17T12:${String(bar % 60).padStart(2, "0")}:00Z`,
      bar_open_time_ms: bar,
      body: { payload: { desired_entry: desired } },
    });
    const bar = (i: number) => LATEST - i * TF;

    it("requests one events window for the strategy without limit and draws the points", async () => {
      const { eth } = freshSymbols();
      const a = inst("a", eth);
      fetchRuntimeStrategyInstances.mockResolvedValue(list(a));
      fetchJournalStrategyInstances.mockResolvedValue([
        { strategy_instance_id: a.strategy_instance_id, event_count: 3, first_bar_open_time_ms: bar(2), last_bar_open_time_ms: bar(0), last_occurred_at: "x" },
      ]);
      fetchJournalEvents.mockResolvedValue({
        events: [ev(bar(2), entry("100")), ev(bar(1), null), ev(bar(0), entry("101"))],
        truncated: false,
      });
      render(<RuntimeDashboard />);
      await screen.findByLabelText("Strategies");
      fireEvent.click(card("a"));
      await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-points")).toBe("2"));
      expect(fetchJournalEvents).toHaveBeenCalledTimes(1);
      const req = fetchJournalEvents.mock.calls[0]![0];
      expect(req).toMatchObject({ strategyInstanceId: a.strategy_instance_id, fromBarMs: LATEST + TF - DAY_30, toBarMs: LATEST });
      expect(req.limit).toBeUndefined();
      expect(req.eventType).toBeUndefined();
      expect(screen.getByTestId("chart").getAttribute("data-noeval")).toBe("0");
    });

    it("another strategy of the same market requests only its events, not candles", async () => {
      const { eth } = freshSymbols();
      fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth), inst("b", eth)));
      render(<RuntimeDashboard />);
      await screen.findByLabelText("Strategies");
      fireEvent.click(card("a"));
      await waitFor(() => expect(fetchJournalEvents).toHaveBeenCalledTimes(1));
      fireEvent.click(card("b"));
      await waitFor(() => expect(fetchJournalEvents).toHaveBeenCalledTimes(2));
      expect(fetchJournalEvents.mock.calls[1]![0].strategyInstanceId).toBe("ema_pullback:b");
      expect(fetchMarketBounds).toHaveBeenCalledTimes(1);
      expect(fetchCandlesWindow).toHaveBeenCalledTimes(1);
    });

    it("a missing event inside the known history is counted, bars before it are not", async () => {
      const { eth } = freshSymbols();
      const a = inst("a", eth);
      fetchRuntimeStrategyInstances.mockResolvedValue(list(a));
      fetchJournalStrategyInstances.mockResolvedValue([
        { strategy_instance_id: a.strategy_instance_id, event_count: 2, first_bar_open_time_ms: bar(3), last_bar_open_time_ms: bar(0), last_occurred_at: "x" },
      ]);
      fetchJournalEvents.mockResolvedValue({ events: [ev(bar(0), entry("101"))], truncated: false });
      render(<RuntimeDashboard />);
      await screen.findByLabelText("Strategies");
      fireEvent.click(card("a"));
      await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-noeval")).toBe("3"));
      expect(screen.getByText("3 bars without a recorded evaluation")).toBeTruthy();
    });

    it("a journal failure keeps the candles and offers Retry", async () => {
      const { eth } = freshSymbols();
      fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth)));
      fetchJournalEvents.mockRejectedValueOnce(new Error("down"));
      render(<RuntimeDashboard />);
      await screen.findByLabelText("Strategies");
      fireEvent.click(card("a"));
      expect(await screen.findByText("Projection unavailable")).toBeTruthy();
      expect(screen.getByTestId("chart").getAttribute("data-points")).toBe("none");
      fireEvent.click(screen.getByLabelText("Retry projection"));
      await waitFor(() => expect(screen.queryByText("Projection unavailable")).toBeNull());
      expect(fetchJournalEvents).toHaveBeenCalledTimes(2);
      expect(fetchCandlesWindow).toHaveBeenCalledTimes(1);
    });

    it("an unexpectedly truncated answer is not drawn as a complete history", async () => {
      const { eth } = freshSymbols();
      fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth)));
      fetchJournalEvents.mockResolvedValue({ events: [ev(bar(0), entry("101"))], truncated: true });
      render(<RuntimeDashboard />);
      await screen.findByLabelText("Strategies");
      fireEvent.click(card("a"));
      expect(await screen.findByText("Projection unavailable")).toBeTruthy();
      expect(screen.getByTestId("chart").getAttribute("data-points")).toBe("none");
    });

    const appliedEv = (bar: number, id: string, trigger: unknown = "100.5", stop: unknown = "90", take: unknown = "120") => ({
      event_id: id,
      event_type: "entry_package_applied",
      occurred_at: "2026-10-17T12:00:30Z",
      bar_open_time_ms: bar,
      body: { payload: { trade_cycle_id: `c-${id}`, bar_open_time_ms: bar, trigger_price: trigger, stop_loss: stop, take_profit: take } },
    });

    it("splits one answer by type: evaluations to the lines, applied orders to the rings, other types ignored", async () => {
      const { eth } = freshSymbols();
      fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth)));
      fetchJournalEvents.mockResolvedValue({
        events: [
          ev(bar(1), entry("100")),
          ev(bar(0), entry("101")),
          appliedEv(bar(0), "a1"),
          appliedEv(bar(0), "a2"),
          appliedEv(bar(1), "a3", "100", null, null),
          { ...appliedEv(bar(1), "x"), event_type: "something_else" },
        ],
        truncated: false,
      });
      render(<RuntimeDashboard />);
      await screen.findByLabelText("Strategies");
      fireEvent.click(card("a"));
      await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-points")).toBe("2"));
      expect(fetchJournalEvents).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("chart").getAttribute("data-rings")).toBe("3");
      expect(screen.getByText("Applied")).toBeTruthy();
      expect(screen.getByText("3 applied orders")).toBeTruthy();
      expect(screen.queryByText("Projection unavailable")).toBeNull();
    });

    it("an answer without applied orders draws the lines, no rings and no error", async () => {
      const { eth } = freshSymbols();
      fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth)));
      fetchJournalEvents.mockResolvedValue({ events: [ev(bar(0), entry("101"))], truncated: false });
      render(<RuntimeDashboard />);
      await screen.findByLabelText("Strategies");
      fireEvent.click(card("a"));
      await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-points")).toBe("1"));
      expect(screen.getByTestId("chart").getAttribute("data-rings")).toBe("0");
      expect(screen.queryByText("Applied")).toBeNull();
      expect(screen.queryByText("Projection unavailable")).toBeNull();
    });

    it("an unreadable applied record is counted and draws no ring", async () => {
      const { eth } = freshSymbols();
      fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth)));
      fetchJournalEvents.mockResolvedValue({ events: [ev(bar(0), entry("101")), appliedEv(bar(0), "a1", "abc")], truncated: false });
      render(<RuntimeDashboard />);
      await screen.findByLabelText("Strategies");
      fireEvent.click(card("a"));
      expect(await screen.findByText("1 unreadable applied")).toBeTruthy();
      expect(screen.getByText("1 applied orders")).toBeTruthy();
      expect(screen.getByTestId("chart").getAttribute("data-rings")).toBe("0");
    });

    it("a truncated answer draws neither lines nor rings", async () => {
      const { eth } = freshSymbols();
      fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", eth)));
      fetchJournalEvents.mockResolvedValue({ events: [ev(bar(0), entry("101")), appliedEv(bar(0), "a1")], truncated: true });
      render(<RuntimeDashboard />);
      await screen.findByLabelText("Strategies");
      fireEvent.click(card("a"));
      expect(await screen.findByText("Projection unavailable")).toBeTruthy();
      expect(screen.getByTestId("chart").getAttribute("data-points")).toBe("none");
      expect(screen.getByTestId("chart").getAttribute("data-rings")).toBe("none");
    });

    it("Refresh repeats the events request and a later answer adds points", async () => {
      const { eth } = freshSymbols();
      const a = inst("a", eth);
      fetchRuntimeStrategyInstances.mockResolvedValue(list(a));
      fetchJournalEvents.mockResolvedValueOnce({ events: [ev(bar(0), entry("101"))], truncated: false });
      render(<RuntimeDashboard />);
      await screen.findByLabelText("Strategies");
      fireEvent.click(card("a"));
      await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-points")).toBe("1"));
      fetchJournalEvents.mockResolvedValueOnce({
        events: [ev(bar(2), entry("100")), ev(bar(1), entry("100")), ev(bar(0), entry("101"))],
        truncated: false,
      });
      fireEvent.click(screen.getByLabelText("Refresh chart"));
      await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-points")).toBe("3"));
      expect(fetchJournalEvents).toHaveBeenCalledTimes(2);
    });
  });
});
