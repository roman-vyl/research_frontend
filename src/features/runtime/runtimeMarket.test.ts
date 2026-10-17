import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CandlesWindowBundle, ChartBar, MarketBounds } from "@/api/types";
import {
  buildCandlesCacheKey,
  clearMarketResourceCache,
  getMarketCandlesCache,
  mergeCandlesChunk,
} from "@/features/chart/marketResourceCache";
import {
  candlesRequestForMissing,
  initialWindow,
  loadRuntimeMarket,
  RUNTIME_CHART_RELOAD_TOKEN,
  RUNTIME_CHART_WINDOW_MS,
  RuntimeChartError,
} from "@/features/runtime/runtimeMarket";

const fetchMarketBounds = vi.fn();
const fetchCandlesWindow = vi.fn();

vi.mock("@/api/client", () => ({
  fetchMarketBounds: (...a: unknown[]) => fetchMarketBounds(...a),
  fetchCandlesWindow: (...a: unknown[]) => fetchCandlesWindow(...a),
}));

const MIN = 60_000;
const TF: Record<string, number> = { "5m": 5 * MIN, "15m": 15 * MIN, "1h": 60 * MIN, "4h": 240 * MIN, "1d": 1440 * MIN };
const DAY_30 = RUNTIME_CHART_WINDOW_MS;
const EARLY = 1_600_000_000_000 - (1_600_000_000_000 % TF["1d"]!);
const LATEST = EARLY + 400 * TF["1d"]!; // aligned to every supported timeframe

function bounds(symbol: string, timeframe: string, latest: number, earliest = EARLY): MarketBounds {
  return { symbol, timeframe, earliest_open_time_ms: earliest, latest_open_time_ms: latest, stream_state: "ready" };
}

function bundleFor(timeframe: string, fromMs: number, toOpenTimeMs: number): CandlesWindowBundle {
  const step = TF[timeframe]!;
  const candles: ChartBar[] = [];
  for (let t = fromMs; t <= toOpenTimeMs; t += step) {
    candles.push({ time: t / 1000, open: 1, high: 2, low: 0.5, close: 1.5 });
  }
  return {
    candles,
    coverage: {
      requested_from_ms: fromMs,
      requested_to_ms: toOpenTimeMs + step,
      actual_from_ms: fromMs,
      actual_to_ms: toOpenTimeMs + step,
      truncated: false,
    },
  };
}

function wire(symbol: string, timeframe: string, latestRef: { latest: number }) {
  fetchMarketBounds.mockImplementation(async () => bounds(symbol, timeframe, latestRef.latest));
  fetchCandlesWindow.mockImplementation(async (p: { fromMs: number; toOpenTimeMs: number }) =>
    bundleFor(timeframe, p.fromMs, p.toOpenTimeMs),
  );
}

const live = () => new AbortController().signal;

describe("runtimeMarket window math", () => {
  it.each(Object.keys(TF))("%s: 30 days ending with the latest bar, half-open", (tf) => {
    const w = initialWindow(bounds("X", tf, LATEST), TF[tf]!);
    expect(w.toMs).toBe(LATEST + TF[tf]!);
    expect(w.fromMs).toBe(w.toMs - DAY_30);
    expect((w.toMs - w.fromMs) / TF[tf]!).toBe(DAY_30 / TF[tf]!);
  });

  it("5m window is 8 640 bars", () => {
    const w = initialWindow(bounds("X", "5m", LATEST), TF["5m"]!);
    expect((w.toMs - w.fromMs) / TF["5m"]!).toBe(8640);
  });

  it("short history starts at earliest", () => {
    const earliest = LATEST - 3 * TF["5m"]!;
    expect(initialWindow(bounds("X", "5m", LATEST, earliest), TF["5m"]!).fromMs).toBe(earliest);
  });

  it("converts a half-open missing range to an inclusive request", () => {
    expect(candlesRequestForMissing({ fromMs: 1000, toMs: 1000 + 4 * 300_000 }, 300_000)).toEqual({
      fromMs: 1000,
      toOpenTimeMs: 1000 + 3 * 300_000,
    });
  });
});

describe("loadRuntimeMarket", () => {
  beforeEach(() => {
    clearMarketResourceCache(); // test isolation only; production Runtime code never clears
    fetchMarketBounds.mockReset();
    fetchCandlesWindow.mockReset();
  });

  it("(a) full initial 5m window: from = end - 30d, to_open_time_ms = latest bar", async () => {
    wire("A5", "5m", { latest: LATEST });
    const data = await loadRuntimeMarket({ symbol: "A5", timeframe: "5m" }, live());
    expect(fetchMarketBounds).toHaveBeenCalledTimes(1);
    expect(fetchCandlesWindow).toHaveBeenCalledTimes(1);
    const call = fetchCandlesWindow.mock.calls[0]![0];
    expect(call.symbol).toBe("A5");
    expect(call.timeframe).toBe("5m");
    expect(call.fromMs).toBe(LATEST + TF["5m"]! - DAY_30);
    expect(call.toOpenTimeMs).toBe(LATEST);
    expect(data.candles).toHaveLength(8640);
    expect(data.candles.at(-1)!.time * 1000).toBe(LATEST);
  });

  it("(b) tail fill of 3 bars requests from T+1bar to_open_time_ms T+3bars, never beyond latest", async () => {
    const ref = { latest: LATEST };
    wire("B5", "5m", ref);
    await loadRuntimeMarket({ symbol: "B5", timeframe: "5m" }, live());
    fetchCandlesWindow.mockClear();
    fetchMarketBounds.mockClear();

    ref.latest = LATEST + 3 * TF["5m"]!;
    const data = await loadRuntimeMarket({ symbol: "B5", timeframe: "5m" }, live());
    expect(fetchMarketBounds).toHaveBeenCalledTimes(1);
    expect(fetchCandlesWindow).toHaveBeenCalledTimes(1);
    const call = fetchCandlesWindow.mock.calls[0]![0];
    expect(call.fromMs).toBe(LATEST + TF["5m"]!);
    expect(call.toOpenTimeMs).toBe(LATEST + 3 * TF["5m"]!);
    expect(call.toOpenTimeMs).toBe(ref.latest);
    expect(data.candles.at(-1)!.time * 1000).toBe(ref.latest);
    expect(data.candles).toHaveLength(8640);
  });

  it("unchanged latest: bounds are asked, zero candle requests", async () => {
    wire("C5", "5m", { latest: LATEST });
    await loadRuntimeMarket({ symbol: "C5", timeframe: "5m" }, live());
    fetchCandlesWindow.mockClear();
    fetchMarketBounds.mockClear();
    const data = await loadRuntimeMarket({ symbol: "C5", timeframe: "5m" }, live());
    expect(fetchMarketBounds).toHaveBeenCalledTimes(1);
    expect(fetchCandlesWindow).not.toHaveBeenCalled();
    expect(data.candles).toHaveLength(8640);
  });

  it.each(["15m", "1h"])("(c) %s boundary: to_open_time_ms = missing.to - tf", async (tf) => {
    const ref = { latest: LATEST };
    wire(`D${tf}`, tf, ref);
    await loadRuntimeMarket({ symbol: `D${tf}`, timeframe: tf }, live());
    const first = fetchCandlesWindow.mock.calls[0]![0];
    expect(first.fromMs).toBe(LATEST + TF[tf]! - DAY_30);
    expect(first.toOpenTimeMs).toBe(LATEST);
    fetchCandlesWindow.mockClear();

    ref.latest = LATEST + 3 * TF[tf]!;
    await loadRuntimeMarket({ symbol: `D${tf}`, timeframe: tf }, live());
    const tail = fetchCandlesWindow.mock.calls[0]![0];
    expect(fetchCandlesWindow).toHaveBeenCalledTimes(1);
    expect(tail.fromMs).toBe(LATEST + TF[tf]!);
    expect(tail.toOpenTimeMs).toBe(LATEST + 3 * TF[tf]!);
  });

  it("short history loads from earliest", async () => {
    const earliest = LATEST - 9 * TF["5m"]!;
    fetchMarketBounds.mockResolvedValue(bounds("S5", "5m", LATEST, earliest));
    fetchCandlesWindow.mockImplementation(async (p: { fromMs: number; toOpenTimeMs: number }) =>
      bundleFor("5m", p.fromMs, p.toOpenTimeMs),
    );
    const data = await loadRuntimeMarket({ symbol: "S5", timeframe: "5m" }, live());
    expect(fetchCandlesWindow.mock.calls[0]![0].fromMs).toBe(earliest);
    expect(data.candles).toHaveLength(10);
  });

  it("uses the shared key at token 0 and leaves Research chunks intact", async () => {
    expect(RUNTIME_CHART_RELOAD_TOKEN).toBe(0);
    const key = buildCandlesCacheKey({ symbol: "R5", timeframe: "5m", reloadToken: 0 });
    const researchFrom = EARLY;
    const researchTo = EARLY + 10 * TF["5m"]!;
    mergeCandlesChunk(key, { ...bundleChunk("5m", researchFrom, researchTo) });
    wire("R5", "5m", { latest: LATEST });
    await loadRuntimeMarket({ symbol: "R5", timeframe: "5m" }, live());
    expect(getMarketCandlesCache(key).coversRange(researchFrom, researchTo)).toBe(true);
    expect(getMarketCandlesCache(key).chunkCount()).toBe(2);
  });

  it("unsupported timeframe: error and no request", async () => {
    await expect(loadRuntimeMarket({ symbol: "U", timeframe: "7x" }, live())).rejects.toMatchObject({
      kind: "unsupported_timeframe",
    });
    expect(fetchMarketBounds).not.toHaveBeenCalled();
    expect(fetchCandlesWindow).not.toHaveBeenCalled();
  });

  it("bounds failure: error kind bounds and no candles request", async () => {
    fetchMarketBounds.mockRejectedValue(new Error("boom"));
    await expect(loadRuntimeMarket({ symbol: "E1", timeframe: "5m" }, live())).rejects.toMatchObject({
      kind: "bounds",
    });
    expect(fetchCandlesWindow).not.toHaveBeenCalled();
  });

  it("candles failure: error kind candles", async () => {
    fetchMarketBounds.mockResolvedValue(bounds("E2", "5m", LATEST));
    fetchCandlesWindow.mockRejectedValue(new Error("boom"));
    const err = await loadRuntimeMarket({ symbol: "E2", timeframe: "5m" }, live()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RuntimeChartError);
    expect((err as RuntimeChartError).kind).toBe("candles");
  });

  it("an abort is rethrown as an abort, not as a data error", async () => {
    const ctl = new AbortController();
    fetchMarketBounds.mockImplementation(async () => {
      ctl.abort();
      throw new DOMException("aborted", "AbortError");
    });
    const err = await loadRuntimeMarket({ symbol: "E3", timeframe: "5m" }, ctl.signal).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(RuntimeChartError);
    expect((err as DOMException).name).toBe("AbortError");
  });
});

function bundleChunk(tf: string, fromMs: number, toMs: number) {
  const b = bundleFor(tf, fromMs, toMs - TF[tf]!);
  return { fromMs, toMs, candles: b.candles };
}
