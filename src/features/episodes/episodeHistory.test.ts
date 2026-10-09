import { beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "@/api/client";
import type { Episode, EpisodeHistoryPage, EpisodeHistoryRequest } from "@/api/episodes";
import {
  clearEpisodeHistoryCache,
  getEpisodeHistory,
  loadAllPages,
  msUntilNextCandle,
  refreshCurrent,
  type EpisodeHistoryKey,
} from "@/features/episodes/episodeHistory";
import { episodeParamsFromStrategySpec } from "@/features/episodes/episodeParams";

const KEY: EpisodeHistoryKey = {
  ticker: "BTCUSDT.P",
  timeframe: "5m",
  params: { fast_period: 200, anchor_period: 500, slow_period: 1000 },
  side: "long",
};

const ep = (start: number, end: number | null = start + 10): Episode => ({
  start_ms: start,
  stack_break_ms: end,
  censored: false,
  touches: 0,
  false_breaks_count: 0,
  zones: [],
  false_breaks: [],
  waves: [],
});

function page(
  episodes: Episode[],
  next: number | null,
  hash = "h1",
  current: Episode | null = ep(900, null),
): EpisodeHistoryPage {
  return {
    history_id: "hid",
    market: { ticker: "BTCUSDT.P", base_timeframe: "5m", earliest_ms: 0, as_of_ms: 1000 },
    episode: { fast_period: 200, anchor_period: 500, slow_period: 1000, window_bars: 24, break_bars: 24 },
    params_hash: "ph",
    market_data_hash: hash,
    side: "long",
    current,
    episodes,
    next_before_start_ms: next,
  };
}

describe("episode history loader", () => {
  beforeEach(() => clearEpisodeHistoryCache());

  it("follows pages newest first pinned to the first page's hash", async () => {
    const calls: EpisodeHistoryRequest[] = [];
    const pages = [page([ep(500), ep(300)], 300), page([ep(100)], null)];
    const history = await loadAllPages(KEY, async (body) => {
      calls.push(body);
      return pages[calls.length - 1]!;
    });
    expect(calls.map((c) => [c.page?.before_start_ms, c.expected_market_data_hash])).toEqual([
      [null, undefined],
      [300, "h1"],
    ]);
    expect(history.finished.map((e) => e.start_ms)).toEqual([100, 300, 500]);
    expect(history.current?.start_ms).toBe(900);
    expect(history.marketDataHash).toBe("h1");
  });

  it("restarts from page 1 on 409 market_data_version_changed", async () => {
    const calls: EpisodeHistoryRequest[] = [];
    const replies: (EpisodeHistoryPage | Error)[] = [
      page([ep(500)], 500, "h1"),
      new ApiError(409, "changed", "market_data_version_changed"),
      page([ep(500)], 500, "h2"),
      page([ep(100)], null, "h2"),
    ];
    const history = await loadAllPages(KEY, async (body) => {
      calls.push(body);
      const reply = replies[calls.length - 1]!;
      if (reply instanceof Error) throw reply;
      return reply;
    });
    expect(calls.map((c) => c.expected_market_data_hash ?? null)).toEqual([null, "h1", null, "h2"]);
    expect(history.marketDataHash).toBe("h2");
    expect(history.finished.map((e) => e.start_ms)).toEqual([100, 500]);
  });

  it("does not retry other errors", async () => {
    await expect(
      loadAllPages(KEY, async () => {
        throw new ApiError(422, "bad", "invalid_request");
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("keeps histories for the session and shares one load", async () => {
    let calls = 0;
    const fetchPage = async () => {
      calls += 1;
      return page([ep(100)], null);
    };
    const [a, b] = await Promise.all([getEpisodeHistory(KEY, fetchPage), getEpisodeHistory(KEY, fetchPage)]);
    await getEpisodeHistory({ ...KEY, params: { ...KEY.params } }, fetchPage);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    await getEpisodeHistory({ ...KEY, side: "short" }, fetchPage);
    expect(calls).toBe(2);
  });

  it("refresh adds new finished episodes by start and replaces current", async () => {
    const history = await loadAllPages(KEY, async () => page([ep(100)], null));
    const changed = { ...ep(100), touches: 99 };
    const calls: EpisodeHistoryRequest[] = [];
    const refreshed = await refreshCurrent(KEY, history, async (body) => {
      calls.push(body);
      return page([ep(900, 950), changed], 100, "h3", null);
    });
    expect(calls[0]!.expected_market_data_hash).toBeUndefined();
    expect(refreshed.finished.map((e) => [e.start_ms, e.touches])).toEqual([
      [100, 0],
      [900, 0],
    ]);
    expect(refreshed.current).toBeNull();
    expect(refreshed.marketDataHash).toBe("h3");
  });

  it("schedules the refresh after the next candle boundary", () => {
    expect(msUntilNextCandle(1_000_000, 300_000)).toBe(200_000 + 5_000);
  });
});

describe("episode parameters", () => {
  const stack = { anchor_stack: { fast: { period: 200 }, anchor: { period: 500 }, slow: { period: 1000 } } };

  it("uses anchor_stack without window keys when the strategy has no section", () => {
    expect(episodeParamsFromStrategySpec(stack)).toEqual({
      fast_period: 200,
      anchor_period: 500,
      slow_period: 1000,
    });
  });

  it("uses the first ema_stack_episode ref, periods defaulted from anchor_stack, no history_bars", () => {
    expect(
      episodeParamsFromStrategySpec({
        ...stack,
        ema_stack_episode: { trend: { anchor_period: 1000, slow_period: 2000, window_bars: 12, history_bars: 15000 } },
      }),
    ).toEqual({ fast_period: 200, anchor_period: 1000, slow_period: 2000, window_bars: 12 });
  });

  it("gives nothing without anchor_stack or section", () => {
    expect(episodeParamsFromStrategySpec({})).toBeNull();
  });
});
