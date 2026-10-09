/**
 * Episode history loader (`research-workbench-ema-stack-episodes-v1`): every page newest first, pinned
 * to page 1's `market_data_hash`; a 409 `market_data_version_changed` restarts from page 1. Histories
 * are kept for the session per (ticker, timeframe, parameters, side). Nothing is computed here.
 */

import type {
  Episode,
  EpisodeHistoryPage,
  EpisodeHistoryRequest,
  EpisodeParams,
  EpisodeSide,
} from "@/api/episodes";
import { ApiError, fetchEmaStackEpisodeHistory } from "@/api/client";
import { episodeParamsKey } from "@/features/episodes/episodeParams";

export const EPISODE_PAGE_LIMIT = 500;
const MAX_VERSION_RESTARTS = 3;

export type EpisodeHistoryKey = {
  ticker: string;
  timeframe: string;
  params: EpisodeParams;
  side: EpisodeSide;
};

export type EpisodeHistory = {
  side: EpisodeSide;
  /** Finished episodes, oldest first, unique by `start_ms`. */
  finished: Episode[];
  current: Episode | null;
  marketDataHash: string;
  asOfMs: number;
};

export type FetchEpisodePage = (body: EpisodeHistoryRequest) => Promise<EpisodeHistoryPage>;

export function episodeHistoryCacheKey(key: EpisodeHistoryKey): string {
  return [key.ticker, key.timeframe, episodeParamsKey(key.params), key.side].join("|");
}

function request(
  key: EpisodeHistoryKey,
  beforeStartMs: number | null,
  pin: string | null,
): EpisodeHistoryRequest {
  const body: EpisodeHistoryRequest = {
    market: { ticker: key.ticker, base_timeframe: key.timeframe },
    episode: key.params,
    side: key.side,
    page: { before_start_ms: beforeStartMs, limit: EPISODE_PAGE_LIMIT },
  };
  if (pin !== null) {
    body.expected_market_data_hash = pin;
  }
  return body;
}

function isVersionChanged(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === "market_data_version_changed";
}

/** Add `episodes` to `finished` by `start_ms`, keeping the ones already there; oldest first. */
export function mergeFinished(finished: Episode[], episodes: Episode[]): Episode[] {
  const byStart = new Map<number, Episode>();
  for (const episode of finished) byStart.set(episode.start_ms, episode);
  for (const episode of episodes) {
    if (!byStart.has(episode.start_ms)) byStart.set(episode.start_ms, episode);
  }
  return [...byStart.values()].sort((a, b) => a.start_ms - b.start_ms);
}

export async function loadAllPages(
  key: EpisodeHistoryKey,
  fetchPage: FetchEpisodePage = fetchEmaStackEpisodeHistory,
): Promise<EpisodeHistory> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const first = await fetchPage(request(key, null, null));
      let finished = mergeFinished([], first.episodes);
      let next = first.next_before_start_ms;
      while (next !== null) {
        const page = await fetchPage(request(key, next, first.market_data_hash));
        finished = mergeFinished(finished, page.episodes);
        next = page.next_before_start_ms;
      }
      return {
        side: key.side,
        finished,
        current: first.current,
        marketDataHash: first.market_data_hash,
        asOfMs: first.market.as_of_ms,
      };
    } catch (error) {
      if (!isVersionChanged(error) || attempt >= MAX_VERSION_RESTARTS) throw error;
    }
  }
}

/** Page 1 without a pin after a new candle: new finished episodes added by start, `current` replaced. */
export async function refreshCurrent(
  key: EpisodeHistoryKey,
  history: EpisodeHistory,
  fetchPage: FetchEpisodePage = fetchEmaStackEpisodeHistory,
): Promise<EpisodeHistory> {
  const first = await fetchPage(request(key, null, null));
  return {
    side: history.side,
    finished: mergeFinished(history.finished, first.episodes),
    current: first.current,
    marketDataHash: first.market_data_hash,
    asOfMs: first.market.as_of_ms,
  };
}

const cache = new Map<string, EpisodeHistory>();
const inFlight = new Map<string, Promise<EpisodeHistory>>();

export function cachedEpisodeHistory(key: EpisodeHistoryKey): EpisodeHistory | null {
  return cache.get(episodeHistoryCacheKey(key)) ?? null;
}

export function storeEpisodeHistory(key: EpisodeHistoryKey, history: EpisodeHistory): void {
  cache.set(episodeHistoryCacheKey(key), history);
}

/** Session-cached history; concurrent callers of one key share one load. */
export function getEpisodeHistory(
  key: EpisodeHistoryKey,
  fetchPage: FetchEpisodePage = fetchEmaStackEpisodeHistory,
): Promise<EpisodeHistory> {
  const id = episodeHistoryCacheKey(key);
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  const pending = inFlight.get(id);
  if (pending) return pending;
  const load = loadAllPages(key, fetchPage)
    .then((history) => {
      cache.set(id, history);
      return history;
    })
    .finally(() => inFlight.delete(id));
  inFlight.set(id, load);
  return load;
}

export function clearEpisodeHistoryCache(): void {
  cache.clear();
  inFlight.clear();
}

/** ms until the next candle boundary of `stepMs` plus `delayMs`. */
export function msUntilNextCandle(nowMs: number, stepMs: number, delayMs = 5_000): number {
  return stepMs - (nowMs % stepMs) + delayMs;
}
