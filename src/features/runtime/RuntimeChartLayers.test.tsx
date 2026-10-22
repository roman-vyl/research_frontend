/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Episode, EpisodeHistoryPage, EpisodeHistoryRequest } from "@/api/episodes";
import type { RuntimeChartLayers, RuntimeStrategyInstance, RuntimeStrategyList } from "@/api/runtime";
import type { CandlesWindowBundle } from "@/api/types";
import { clearMarketResourceCache } from "@/features/chart/marketResourceCache";
import { clearEpisodeHistoryCache } from "@/features/episodes/episodeHistory";
import { RuntimeDashboard } from "@/features/runtime/RuntimeDashboard";
import { clearRuntimeEmaStoreForTests } from "@/features/runtime/runtimeEma";

const fetchRuntimeStrategyInstances = vi.fn();
const fetchRuntimeChartLayers = vi.fn();
const fetchMarketBounds = vi.fn();
const fetchCandlesWindow = vi.fn();
const fetchChartOverlayEma = vi.fn();
const fetchEmaStackEpisodeHistory = vi.fn();
const chartProps = vi.fn();

vi.mock("@/api/journal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/journal")>()),
  fetchJournalEvents: async () => ({ events: [], truncated: false }),
  fetchJournalStrategyInstances: async () => [],
}));
vi.mock("@/api/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/runtime")>()),
  fetchRuntimeStrategyInstances: (...a: unknown[]) => fetchRuntimeStrategyInstances(...a),
  fetchRuntimeChartLayers: (...a: unknown[]) => fetchRuntimeChartLayers(...a),
}));
vi.mock("@/api/client", () => ({
  ApiError: class ApiError extends Error {
    status = 0;
    code: string | null = null;
  },
  fetchMarketBounds: (...a: unknown[]) => fetchMarketBounds(...a),
  fetchCandlesWindow: (...a: unknown[]) => fetchCandlesWindow(...a),
  fetchChartOverlayEma: (...a: unknown[]) => fetchChartOverlayEma(...a),
  fetchEmaStackEpisodeHistory: (...a: unknown[]) => fetchEmaStackEpisodeHistory(...a),
}));

type EmaProp = { role: string; points: { time: number; value: number }[] }[];
type EpisodesProp = {
  histories: Record<string, { finished: unknown[]; current: unknown }>;
  sides: string[];
  times: number[];
  clipToCandles?: boolean;
} | null;

vi.mock("@/features/runtime/RuntimeCandleChart", () => ({
  RuntimeCandleChart: (props: { candles: readonly unknown[]; ema?: EmaProp; episodes?: EpisodesProp }) => {
    chartProps(props);
    return (
      <div
        data-testid="chart"
        data-bars={props.candles.length}
        data-ema={(props.ema ?? []).map((l) => `${l.role}:${l.points.length}`).join(",")}
        data-episode-sides={props.episodes ? Object.keys(props.episodes.histories).sort().join(",") : "none"}
      />
    );
  },
}));

const TF = 300_000;
const LATEST = 1_700_000_100_000 - (1_700_000_100_000 % TF);
const DAY_30 = 30 * 24 * 60 * 60 * 1000;
const WINDOW_FROM = LATEST + TF - DAY_30;

const PLAN: RuntimeChartLayers = {
  strategy_instance_id: "x",
  ema_stack: [
    { role: "fast", timeframe: "base", period: 20, source: "close" },
    { role: "anchor", timeframe: "base", period: 50, source: "close" },
    { role: "slow", timeframe: "base", period: 200, source: "close" },
  ],
  episodes: [{ episode_ref: "e1", params: { fast_period: 20, anchor_period: 50, slow_period: 200, window_bars: 24, break_bars: 24, history_bars: 15000 } }],
};
const plan = (id: string, patch: Partial<RuntimeChartLayers> = {}): RuntimeChartLayers => ({ ...PLAN, ...patch, strategy_instance_id: id });

function inst(file: string, instrument: string): RuntimeStrategyInstance {
  return {
    strategy_instance_id: `ema_pullback:${file}`,
    strategy_id: "ema_pullback",
    instrument,
    base_timeframe: "5m",
    enabled: true,
    source_path: `${file}.json`,
  };
}
const list = (...items: RuntimeStrategyInstance[]): RuntimeStrategyList => ({
  scanned_file_count: items.length,
  strategy_instances: items,
  invalid_files: [],
  duplicate_identities: [],
});
const ep = (start: number): Episode => ({
  start_ms: start,
  stack_break_ms: start + 10,
  censored: false,
  touches: 0,
  false_breaks_count: 0,
  zones: [],
  false_breaks: [],
  waves: [],
});
function episodePage(body: EpisodeHistoryRequest, next: number | null = null): EpisodeHistoryPage {
  return {
    history_id: "h",
    market: { ticker: body.market.ticker, base_timeframe: "5m", earliest_ms: 0, as_of_ms: 1 },
    episode: { fast_period: 20, anchor_period: 50, slow_period: 200, window_bars: 24, break_bars: 24 },
    params_hash: "p",
    market_data_hash: "m1",
    side: body.side,
    current: null,
    episodes: [ep(body.page?.before_start_ms ?? 1000)],
    next_before_start_ms: next,
  };
}
const bundle = (from: number, to: number): CandlesWindowBundle => {
  const candles = [];
  for (let t = from; t <= to; t += TF) candles.push({ time: t / 1000, open: 1, high: 2, low: 0.5, close: 1.5 });
  return { candles, coverage: { requested_from_ms: from, requested_to_ms: to + TF, actual_from_ms: from, actual_to_ms: to + TF, truncated: false } };
};

let sym = 0;
const freshSymbol = () => `ETH${(sym += 1)}USDT.P`;
const card = (name: string) => within(screen.getByLabelText("Strategies")).getByText(name, { selector: ".rt-name" }).closest("button")!;
const ema = () => screen.getByTestId("chart").getAttribute("data-ema");
const emaCalls = (period?: number) =>
  fetchChartOverlayEma.mock.calls.map((c) => c[0] as { period: number; fromMs: number; toOpenTimeMs: number }).filter((c) => period === undefined || c.period === period);

async function open(...names: string[]) {
  render(<RuntimeDashboard />);
  await screen.findByLabelText("Strategies");
  fireEvent.click(card(names[0]!));
  await screen.findByTestId("chart");
}

describe("Runtime chart layers", () => {
  beforeEach(() => {
    clearMarketResourceCache();
    clearEpisodeHistoryCache();
    clearRuntimeEmaStoreForTests();
    for (const m of [fetchRuntimeStrategyInstances, fetchRuntimeChartLayers, fetchMarketBounds, fetchCandlesWindow, fetchChartOverlayEma, fetchEmaStackEpisodeHistory, chartProps]) m.mockReset();
    fetchMarketBounds.mockImplementation(async (p: { symbol: string; timeframe: string }) => ({
      symbol: p.symbol,
      timeframe: p.timeframe,
      earliest_open_time_ms: LATEST - 400 * 86_400_000,
      latest_open_time_ms: LATEST,
      stream_state: "ready",
    }));
    fetchCandlesWindow.mockImplementation(async (p: { fromMs: number; toOpenTimeMs: number }) => bundle(p.fromMs, p.toOpenTimeMs));
    fetchRuntimeChartLayers.mockImplementation(async (id: string) => plan(id));
    fetchChartOverlayEma.mockImplementation(async (p: { period: number; fromMs: number; toOpenTimeMs: number }) => {
      const out = [];
      for (let t = p.fromMs; t <= p.toOpenTimeMs; t += TF) out.push({ time: t / 1000, value: p.period, kind: "ema" });
      return out;
    });
    fetchEmaStackEpisodeHistory.mockImplementation(async (body: EpisodeHistoryRequest) => episodePage(body));
  });
  afterEach(cleanup);

  it("on select asks for the layers once, each EMA period once and both episode sides", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", freshSymbol())));
    await open("a");
    await waitFor(() => expect(ema()).toBe("fast:8640,anchor:8640,slow:8640"));
    expect(fetchRuntimeChartLayers).toHaveBeenCalledTimes(1);
    expect(fetchRuntimeChartLayers.mock.calls[0]![0]).toBe("ema_pullback:a");
    expect([20, 50, 200].map((p) => emaCalls(p).length)).toEqual([1, 1, 1]);
    expect(emaCalls(20)[0]).toMatchObject({ fromMs: WINDOW_FROM, toOpenTimeMs: LATEST });
    await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-episode-sides")).toBe("long,short"));
    expect(fetchEmaStackEpisodeHistory).toHaveBeenCalledTimes(2);
    const sent = fetchEmaStackEpisodeHistory.mock.calls.map((c) => c[0] as EpisodeHistoryRequest);
    expect(sent.every((b) => b.episode.fast_period === 20 && b.episode.window_bars === 24 && !("history_bars" in b.episode))).toBe(true);
  });

  it("draws only points inside the candle window although more were returned", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", freshSymbol())));
    fetchChartOverlayEma.mockImplementation(async (p: { period: number; fromMs: number; toOpenTimeMs: number }) => {
      const out = [];
      for (let t = p.fromMs - 10 * TF; t <= p.toOpenTimeMs + 10 * TF; t += TF) out.push({ time: t / 1000, value: 1, kind: "ema" });
      return out;
    });
    await open("a");
    await waitFor(() => expect(ema()).toBe("fast:8640,anchor:8640,slow:8640"));
    const last = chartProps.mock.calls.at(-1)![0] as { episodes: EpisodesProp };
    if (last.episodes) expect(last.episodes.times.length).toBe(8640);
  });

  it("another strategy of the same market sends no candle request and shows no layer of the previous one", async () => {
    const s = freshSymbol();
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", s), inst("b", s)));
    await open("a");
    await waitFor(() => expect(ema()).toBe("fast:8640,anchor:8640,slow:8640"));
    let release: (() => void) | undefined;
    fetchRuntimeChartLayers.mockImplementationOnce(async (id: string) => {
      await new Promise<void>((r) => (release = r));
      return plan(id, { ema_stack: [], episodes: [] });
    });
    fireEvent.click(card("b"));
    await waitFor(() => expect(fetchRuntimeChartLayers).toHaveBeenCalledTimes(2));
    expect(ema()).toBe("");
    expect(screen.getByTestId("chart").getAttribute("data-episode-sides")).toBe("none");
    expect(fetchMarketBounds).toHaveBeenCalledTimes(1);
    expect(fetchCandlesWindow).toHaveBeenCalledTimes(1);
    release?.();
    await waitFor(() => expect(screen.queryByText("Loading layers…")).toBeNull());
  });

  it("a failed plan keeps candles, says so, and Retry re-requests only the plan", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", freshSymbol())));
    fetchRuntimeChartLayers.mockRejectedValueOnce(new Error("down"));
    await open("a");
    expect((await screen.findByText("Chart layers unavailable")).getAttribute("role")).toBe("alert");
    expect(screen.getByTestId("chart").getAttribute("data-bars")).toBe("8640");
    expect(fetchChartOverlayEma).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Retry layers"));
    await waitFor(() => expect(ema()).toBe("fast:8640,anchor:8640,slow:8640"));
    expect(fetchRuntimeChartLayers).toHaveBeenCalledTimes(2);
    expect(fetchCandlesWindow).toHaveBeenCalledTimes(1);
    expect(fetchMarketBounds).toHaveBeenCalledTimes(1);
  });

  it("one failed EMA leaves the others, and Retry asks only for that period", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", freshSymbol())));
    fetchChartOverlayEma.mockImplementation(async (p: { period: number; fromMs: number; toOpenTimeMs: number }) => {
      if (p.period === 50) throw new Error("boom");
      const out = [];
      for (let t = p.fromMs; t <= p.toOpenTimeMs; t += TF) out.push({ time: t / 1000, value: 1, kind: "ema" });
      return out;
    });
    await open("a");
    await waitFor(() => expect(ema()).toBe("fast:8640,anchor:0,slow:8640"));
    await screen.findByText(/EMA 50 \(unavailable\)/);
    await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-episode-sides")).toBe("long,short"));
    fetchChartOverlayEma.mockClear();
    fetchEmaStackEpisodeHistory.mockClear();
    fetchChartOverlayEma.mockImplementation(async (p: { period: number; fromMs: number; toOpenTimeMs: number }) => {
      const out = [];
      for (let t = p.fromMs; t <= p.toOpenTimeMs; t += TF) out.push({ time: t / 1000, value: 1, kind: "ema" });
      return out;
    });
    fireEvent.click(screen.getByLabelText("Retry layers"));
    await waitFor(() => expect(ema()).toBe("fast:8640,anchor:8640,slow:8640"));
    expect(emaCalls().map((c) => c.period)).toEqual([50]);
    expect(fetchEmaStackEpisodeHistory).not.toHaveBeenCalled();
    expect(fetchRuntimeChartLayers).toHaveBeenCalledTimes(1);
  });

  it("a failed episode side does not hide the other side or the lines; Retry re-asks only it", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", freshSymbol())));
    fetchEmaStackEpisodeHistory.mockImplementation(async (body: EpisodeHistoryRequest) => {
      if (body.side === "short") throw new Error("boom");
      return episodePage(body);
    });
    await open("a");
    await screen.findByText("Episodes unavailable");
    await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-episode-sides")).toBe("long"));
    expect(ema()).toBe("fast:8640,anchor:8640,slow:8640");
    fetchEmaStackEpisodeHistory.mockClear();
    fetchEmaStackEpisodeHistory.mockImplementation(async (body: EpisodeHistoryRequest) => episodePage(body));
    fireEvent.click(screen.getByLabelText("Retry layers"));
    await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-episode-sides")).toBe("long,short"));
    expect(fetchEmaStackEpisodeHistory.mock.calls.map((c) => (c[0] as EpisodeHistoryRequest).side)).toEqual(["short"]);
    expect(emaCalls().length).toBe(3);
  });

  it("episodes follow the paging of next_before_start_ms with the first page's pin", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", freshSymbol())));
    fetchEmaStackEpisodeHistory.mockImplementation(async (body: EpisodeHistoryRequest) =>
      episodePage(body, body.page?.before_start_ms == null ? 500 : null),
    );
    await open("a");
    await waitFor(() => expect(fetchEmaStackEpisodeHistory).toHaveBeenCalledTimes(4));
    const second = fetchEmaStackEpisodeHistory.mock.calls.map((c) => c[0] as EpisodeHistoryRequest).filter((b) => b.page?.before_start_ms === 500);
    expect(second).toHaveLength(2);
    expect(second.every((b) => b.expected_market_data_hash === "m1")).toBe(true);
  });

  it("EMA on another timeframe or source is not drawn and not requested; a text says so", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", freshSymbol())));
    fetchRuntimeChartLayers.mockImplementation(async (id: string) =>
      plan(id, {
        ema_stack: [
          { role: "fast", timeframe: "base", period: 20, source: "close" },
          { role: "anchor", timeframe: "1h", period: 50, source: "close" },
          { role: "slow", timeframe: "base", period: 200, source: "hlc3" },
        ],
      }),
    );
    await open("a");
    await waitFor(() => expect(ema()).toBe("fast:8640"));
    expect(emaCalls().map((c) => c.period)).toEqual([20]);
    expect(screen.getByText("EMA 1h 50 is not drawn (other timeframe or source)")).toBeTruthy();
    expect(screen.getByText("EMA base 200 is not drawn (other timeframe or source)")).toBeTruthy();
  });

  it("hiding the lines empties them without a request; showing brings them back", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", freshSymbol())));
    await open("a");
    await waitFor(() => expect(ema()).toBe("fast:8640,anchor:8640,slow:8640"));
    fetchChartOverlayEma.mockClear();
    fireEvent.click(screen.getByLabelText("Hide EMA lines"));
    expect(ema()).toBe("");
    fireEvent.click(screen.getByLabelText("Show EMA lines"));
    expect(ema()).toBe("fast:8640,anchor:8640,slow:8640");
    expect(fetchChartOverlayEma).not.toHaveBeenCalled();
  });

  it("no episode section: no episode request and no episode controls", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", freshSymbol())));
    fetchRuntimeChartLayers.mockImplementation(async (id: string) => plan(id, { episodes: [] }));
    await open("a");
    await waitFor(() => expect(ema()).toBe("fast:8640,anchor:8640,slow:8640"));
    expect(fetchEmaStackEpisodeHistory).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("EMA stack episode layers")).toBeNull();
  });

  it("several episode sections ask for a choice and load nothing until one is chosen", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", freshSymbol())));
    fetchRuntimeChartLayers.mockImplementation(async (id: string) =>
      plan(id, {
        episodes: [
          { episode_ref: "e1", params: { fast_period: 20, anchor_period: 50, slow_period: 200 } },
          { episode_ref: "e2", params: { fast_period: 10, anchor_period: 50, slow_period: 200 } },
        ],
      }),
    );
    await open("a");
    await screen.findByText("Choose an episode section");
    expect(fetchEmaStackEpisodeHistory).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByLabelText("Episode ref")).getByText("e2"));
    await waitFor(() => expect(fetchEmaStackEpisodeHistory).toHaveBeenCalledTimes(2));
    expect((fetchEmaStackEpisodeHistory.mock.calls[0]![0] as EpisodeHistoryRequest).episode.fast_period).toBe(10);
  });

  it("Refresh asks for the EMA tail only and page 1 of each episode side; the plan again", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", freshSymbol())));
    await open("a");
    await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-episode-sides")).toBe("long,short"));
    await waitFor(() => expect(ema()).toBe("fast:8640,anchor:8640,slow:8640"));
    fetchChartOverlayEma.mockClear();
    fetchEmaStackEpisodeHistory.mockClear();
    const latestBefore = LATEST;
    fetchMarketBounds.mockImplementation(async (p: { symbol: string; timeframe: string }) => ({
      symbol: p.symbol,
      timeframe: p.timeframe,
      earliest_open_time_ms: LATEST - 400 * 86_400_000,
      latest_open_time_ms: latestBefore + 3 * TF,
      stream_state: "ready",
    }));
    fireEvent.click(screen.getByLabelText("Refresh chart"));
    await waitFor(() => expect(emaCalls().length).toBe(3));
    await waitFor(() => expect(screen.getByTestId("chart").getAttribute("data-bars")).toBe("8640"));
    expect(ema()).toBe("fast:8640,anchor:8640,slow:8640"); // the window slides: the old head leaves it
    expect(emaCalls().map((c) => [c.fromMs, c.toOpenTimeMs])).toEqual([
      [LATEST + TF, LATEST + 3 * TF],
      [LATEST + TF, LATEST + 3 * TF],
      [LATEST + TF, LATEST + 3 * TF],
    ]);
    await waitFor(() => expect(fetchEmaStackEpisodeHistory).toHaveBeenCalledTimes(2));
    expect(fetchEmaStackEpisodeHistory.mock.calls.every((c) => (c[0] as EpisodeHistoryRequest).page?.before_start_ms === null)).toBe(true);
    expect(fetchRuntimeChartLayers).toHaveBeenCalledTimes(2);
  });

  it("sends no request by itself over time", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fetchRuntimeStrategyInstances.mockResolvedValue(list(inst("a", freshSymbol())));
      await open("a");
      await waitFor(() => expect(ema()).toBe("fast:8640,anchor:8640,slow:8640"));
      await waitFor(() => expect(fetchEmaStackEpisodeHistory).toHaveBeenCalledTimes(2));
      const counts = [fetchRuntimeChartLayers, fetchChartOverlayEma, fetchEmaStackEpisodeHistory, fetchCandlesWindow, fetchMarketBounds].map((m) => m.mock.calls.length);
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect([fetchRuntimeChartLayers, fetchChartOverlayEma, fetchEmaStackEpisodeHistory, fetchCandlesWindow, fetchMarketBounds].map((m) => m.mock.calls.length)).toEqual(counts);
    } finally {
      vi.useRealTimers();
    }
  });
});
