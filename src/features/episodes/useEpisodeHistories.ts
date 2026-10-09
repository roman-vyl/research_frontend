import { useEffect, useMemo, useState } from "react";

import type { EpisodeParams, EpisodeSide } from "@/api/episodes";
import { resolveChartTimeframeMs } from "@/features/chart/chartTimeframeMs";
import {
  cachedEpisodeHistory,
  getEpisodeHistory,
  msUntilNextCandle,
  refreshCurrent,
  storeEpisodeHistory,
  type EpisodeHistory,
  type EpisodeHistoryKey,
} from "@/features/episodes/episodeHistory";
import { episodeParamsKey } from "@/features/episodes/episodeParams";

export const EPISODE_SIDES: readonly EpisodeSide[] = ["long", "short"];

export type EpisodeHistoriesState = {
  histories: Partial<Record<EpisodeSide, EpisodeHistory>>;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

/**
 * Both sides' episode history for a market and parameters: loaded once per session (cached), then
 * page 1 is re-requested after every candle of the timeframe to refresh `current`.
 */
export function useEpisodeHistories(
  ticker: string | null,
  timeframe: string,
  params: EpisodeParams | null,
): EpisodeHistoriesState {
  const paramsKey = params ? episodeParamsKey(params) : null;
  const keys = useMemo<EpisodeHistoryKey[] | null>(
    () =>
      ticker && params
        ? EPISODE_SIDES.map((side) => ({ ticker, timeframe, params, side }))
        : null,
    [ticker, timeframe, paramsKey],
  );
  const [state, setState] = useState<EpisodeHistoriesState>({
    histories: {},
    status: "idle",
    error: null,
  });

  useEffect(() => {
    if (!keys) {
      setState({ histories: {}, status: "idle", error: null });
      return;
    }
    let cancelled = false;
    const cached = Object.fromEntries(
      keys.flatMap((key) => {
        const hit = cachedEpisodeHistory(key);
        return hit ? [[key.side, hit]] : [];
      }),
    ) as Partial<Record<EpisodeSide, EpisodeHistory>>;
    const complete = Object.keys(cached).length === keys.length;
    setState({ histories: cached, status: complete ? "ready" : "loading", error: null });
    if (!complete) {
      Promise.all(keys.map((key) => getEpisodeHistory(key)))
        .then((loaded) => {
          if (cancelled) return;
          setState({
            histories: Object.fromEntries(loaded.map((h) => [h.side, h])),
            status: "ready",
            error: null,
          });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setState((prev) => ({
            ...prev,
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          }));
        });
    }

    let stepMs: number;
    try {
      stepMs = resolveChartTimeframeMs(timeframe);
    } catch {
      return () => {
        cancelled = true;
      };
    }
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        void Promise.all(
          keys.map(async (key) => {
            const history = cachedEpisodeHistory(key);
            if (!history) return null;
            const refreshed = await refreshCurrent(key, history);
            storeEpisodeHistory(key, refreshed);
            return refreshed;
          }),
        )
          .then((refreshed) => {
            if (cancelled) return;
            const histories = Object.fromEntries(
              refreshed.flatMap((h) => (h ? [[h.side, h]] : [])),
            ) as Partial<Record<EpisodeSide, EpisodeHistory>>;
            if (Object.keys(histories).length > 0) {
              setState((prev) => ({ ...prev, histories: { ...prev.histories, ...histories } }));
            }
          })
          .catch(() => {
            // A failed refresh keeps the shown history; the next candle tries again.
          })
          .finally(() => {
            if (!cancelled) schedule();
          });
      }, msUntilNextCandle(Date.now(), stepMs));
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [keys, timeframe]);

  return state;
}
