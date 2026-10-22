/**
 * The EMA stack lines and EMA stack episodes of the selected Runtime strategy
 * (`runtime-dashboard-ema-episodes-v1`). Every piece loads and fails on its own: the layer plan (Runtime), each
 * EMA line, each episode side. Nothing here polls; Refresh (a token from the panel) updates `current` and the tails.
 * Layers are tied to the strategy instance that asked for them, so nothing of a previous selection shows.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EpisodeSide } from "@/api/episodes";
import { fetchRuntimeChartLayers, type RuntimeChartLayers, type RuntimeEmaStackEntry } from "@/api/runtime";
import type { ChartBar } from "@/api/types";
import { resolveChartTimeframeMs } from "@/features/chart/chartTimeframeMs";
import {
  cachedEpisodeHistory,
  getEpisodeHistory,
  refreshCurrent,
  storeEpisodeHistory,
  type EpisodeHistory,
  type EpisodeHistoryKey,
} from "@/features/episodes/episodeHistory";
import { episodeParamsKey } from "@/features/episodes/episodeParams";
import {
  emaPointsInWindow,
  ensureEmaLine,
  missingEmaRange,
  skippedText,
  splitStack,
  type EmaLineKey,
} from "@/features/runtime/runtimeEma";
import { selectedEpisode } from "@/features/runtime/runtimeLayers";

export type PieceStatus = "loading" | "ready" | "error";

export type EmaLine = {
  entry: RuntimeEmaStackEntry;
  status: PieceStatus;
  /** Points inside the candle window only. */
  points: { time: number; value: number }[];
};

export type RuntimeChartLayersView = {
  /** Plan of the selected strategy; null while loading, after a failure, or with nothing selected. */
  layers: RuntimeChartLayers | null;
  configStatus: PieceStatus | "idle";
  ema: EmaLine[];
  skipped: string[];
  episodeRefs: string[];
  chosenRef: string | null;
  setChosenRef: (ref: string) => void;
  /** True when several episode sections exist and none is chosen yet. */
  needsChoice: boolean;
  episodeHistories: Partial<Record<EpisodeSide, EpisodeHistory>>;
  episodeStatus: PieceStatus | "idle";
  /** Re-requests only what is missing or failed. */
  retry: () => void;
};

const SIDES: readonly EpisodeSide[] = ["long", "short"];

type Config = { forId: string | null; status: PieceStatus | "idle"; layers: RuntimeChartLayers | null };
type EpisodeState = {
  forKey: string | null;
  histories: Partial<Record<EpisodeSide, EpisodeHistory>>;
  sides: Partial<Record<EpisodeSide, PieceStatus>>;
};

const EMPTY_EPISODES: EpisodeState = { forKey: null, histories: {}, sides: {} };

function emaKeyOf(symbol: string, timeframe: string, entry: RuntimeEmaStackEntry): EmaLineKey {
  return { symbol, timeframe, period: entry.period };
}

export function useRuntimeChartLayers({
  strategyInstanceId,
  symbol,
  timeframe,
  candles,
  refreshToken,
}: {
  strategyInstanceId: string | null;
  symbol: string | null;
  timeframe: string | null;
  candles: readonly ChartBar[];
  refreshToken: number;
}): RuntimeChartLayersView {
  const [config, setConfig] = useState<Config>({ forId: null, status: "idle", layers: null });
  const [configRetry, setConfigRetry] = useState(0);
  const [emaRetry, setEmaRetry] = useState(0);
  const [emaFailed, setEmaFailed] = useState<ReadonlySet<string>>(new Set());
  const [emaVersion, setEmaVersion] = useState(0);
  const [episodeRetry, setEpisodeRetry] = useState(0);
  const [episodes, setEpisodes] = useState<EpisodeState>(EMPTY_EPISODES);
  const [chosen, setChosen] = useState<{ forId: string | null; ref: string | null }>({ forId: null, ref: null });
  const episodesRef = useRef<EpisodeState>(EMPTY_EPISODES);
  const refreshSeen = useRef<Map<string, number>>(new Map());

  // 1. The plan: periods and episode parameters of the selected strategy, from Runtime.
  useEffect(() => {
    if (strategyInstanceId === null) {
      setConfig({ forId: null, status: "idle", layers: null });
      return;
    }
    const ctl = new AbortController();
    let live = true;
    setConfig((prev) =>
      prev.forId === strategyInstanceId && prev.layers !== null
        ? prev
        : { forId: strategyInstanceId, status: "loading", layers: null },
    );
    fetchRuntimeChartLayers(strategyInstanceId, ctl.signal).then(
      (layers) => {
        if (live) setConfig({ forId: strategyInstanceId, status: "ready", layers });
      },
      () => {
        if (!live || ctl.signal.aborted) return;
        // A refresh that fails keeps the plan already shown for this strategy.
        setConfig((prev) =>
          prev.forId === strategyInstanceId && prev.layers !== null
            ? prev
            : { forId: strategyInstanceId, status: "error", layers: null },
        );
      },
    );
    return () => {
      live = false;
      ctl.abort();
    };
  }, [strategyInstanceId, refreshToken, configRetry]);

  const layers = config.forId === strategyInstanceId ? config.layers : null;
  const configStatus: PieceStatus | "idle" = config.forId === strategyInstanceId ? config.status : strategyInstanceId === null ? "idle" : "loading";

  const split = useMemo(
    () => (layers !== null && timeframe !== null ? splitStack(layers.ema_stack, timeframe) : { drawn: [], skipped: [] }),
    [layers, timeframe],
  );

  const firstTime = candles.length > 0 ? candles[0]!.time : null;
  const lastTime = candles.length > 0 ? candles[candles.length - 1]!.time : null;

  // 2. One request per EMA line, independent of each other; only the missing part of the window is asked for.
  const drawnPeriods = split.drawn.map((e) => e.period).join(",");
  useEffect(() => {
    if (symbol === null || timeframe === null || firstTime === null || lastTime === null || split.drawn.length === 0) return;
    let tfMs: number;
    try {
      tfMs = resolveChartTimeframeMs(timeframe);
    } catch {
      return;
    }
    const window = { fromMs: firstTime * 1000, toMs: lastTime * 1000 + tfMs };
    const ctl = new AbortController();
    let live = true;
    for (const entry of split.drawn) {
      const key = emaKeyOf(symbol, timeframe, entry);
      if (missingEmaRange(key, window) === null) continue;
      const id = `${symbol}|${timeframe}|${entry.period}`;
      setEmaFailed((prev) => (prev.has(id) ? new Set([...prev].filter((x) => x !== id)) : prev));
      ensureEmaLine(key, window, tfMs, ctl.signal).then(
        () => {
          if (!live) return;
          setEmaFailed((prev) => (prev.has(id) ? new Set([...prev].filter((x) => x !== id)) : prev));
          setEmaVersion((v) => v + 1);
        },
        () => {
          if (!live || ctl.signal.aborted) return;
          setEmaFailed((prev) => new Set(prev).add(id));
        },
      );
    }
    return () => {
      live = false;
      ctl.abort();
    };
  }, [symbol, timeframe, firstTime, lastTime, drawnPeriods, emaRetry]); // eslint-disable-line react-hooks/exhaustive-deps

  const ema = useMemo<EmaLine[]>(() => {
    if (symbol === null || timeframe === null) return [];
    const window =
      firstTime !== null && lastTime !== null
        ? (() => {
            try {
              return { fromMs: firstTime * 1000, toMs: lastTime * 1000 + resolveChartTimeframeMs(timeframe) };
            } catch {
              return null;
            }
          })()
        : null;
    return split.drawn.map((entry) => {
      const key = emaKeyOf(symbol, timeframe, entry);
      const failed = emaFailed.has(`${symbol}|${timeframe}|${entry.period}`);
      const complete = window !== null && missingEmaRange(key, window) === null;
      const status: PieceStatus = complete ? "ready" : failed ? "error" : "loading";
      const points = emaPointsInWindow(key, candles).map((p) => ({ time: p.time, value: p.value }));
      return { entry, status, points };
    });
    // emaVersion: the session store changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [split, symbol, timeframe, candles, firstTime, lastTime, emaFailed, emaVersion]);

  // 3. Episodes of the chosen (or only) episode section, both sides, whole history.
  const episodeRefs = layers?.episodes.map((e) => e.episode_ref) ?? [];
  const chosenRef = chosen.forId === strategyInstanceId ? chosen.ref : null;
  const selected = selectedEpisode(layers, chosenRef);
  const episodeKey =
    selected !== null && symbol !== null && timeframe !== null
      ? `${symbol}|${timeframe}|${episodeParamsKey(selected.params)}`
      : null;
  const needsChoice = layers !== null && layers.episodes.length > 1 && selected === null;

  useEffect(() => {
    if (episodeKey === null || selected === null || symbol === null || timeframe === null) {
      episodesRef.current = EMPTY_EPISODES;
      setEpisodes(EMPTY_EPISODES);
      return;
    }
    const params = selected.params;
    const keys: EpisodeHistoryKey[] = SIDES.map((side) => ({ ticker: symbol, timeframe, params, side }));
    let live = true;
    const previous = episodesRef.current.forKey === episodeKey ? episodesRef.current : null;
    const seen = refreshSeen.current.get(episodeKey);
    const refreshChanged = seen !== undefined && seen !== refreshToken;
    refreshSeen.current.set(episodeKey, refreshToken);

    const apply = (update: (s: EpisodeState) => EpisodeState) => {
      if (!live) return;
      const next = update(episodesRef.current.forKey === episodeKey ? episodesRef.current : { forKey: episodeKey, histories: {}, sides: {} });
      episodesRef.current = next;
      setEpisodes(next);
    };
    const setSide = (side: EpisodeSide, status: PieceStatus, history?: EpisodeHistory) =>
      apply((s) => ({
        forKey: episodeKey,
        histories: history ? { ...s.histories, [side]: history } : s.histories,
        sides: { ...s.sides, [side]: status },
      }));

    const initial: EpisodeState = { forKey: episodeKey, histories: {}, sides: {} };
    for (const key of keys) {
      const hit = cachedEpisodeHistory(key);
      if (hit) {
        initial.histories[key.side] = hit;
        initial.sides[key.side] = previous?.sides[key.side] ?? "ready";
      } else {
        initial.sides[key.side] = "loading";
      }
    }
    episodesRef.current = initial;
    setEpisodes(initial);

    for (const key of keys) {
      const hit = cachedEpisodeHistory(key);
      if (hit === null) {
        getEpisodeHistory(key).then(
          (history) => setSide(key.side, "ready", history),
          () => setSide(key.side, "error"),
        );
      } else if (refreshChanged || initial.sides[key.side] === "error") {
        // Only `current` and new finished episodes: page 1 without a pin.
        refreshCurrent(key, hit).then(
          (history) => {
            storeEpisodeHistory(key, history);
            setSide(key.side, "ready", history);
          },
          () => setSide(key.side, "error"),
        );
      } else {
        initial.sides[key.side] = "ready";
      }
    }
    return () => {
      live = false;
    };
  }, [episodeKey, refreshToken, episodeRetry]); // eslint-disable-line react-hooks/exhaustive-deps

  const episodeShown = episodes.forKey !== null && episodes.forKey === episodeKey ? episodes : EMPTY_EPISODES;
  const sideStatuses = SIDES.map((s) => episodeShown.sides[s]);
  const episodeStatus: PieceStatus | "idle" =
    episodeKey === null
      ? "idle"
      : sideStatuses.some((s) => s === "error")
        ? "error"
        : sideStatuses.every((s) => s === "ready")
          ? "ready"
          : "loading";

  const retry = useCallback(() => {
    if (config.status === "error") setConfigRetry((n) => n + 1);
    setEmaRetry((n) => n + 1);
    setEpisodeRetry((n) => n + 1);
  }, [config.status]);

  const setChosenRef = useCallback(
    (ref: string) => setChosen({ forId: strategyInstanceId, ref }),
    [strategyInstanceId],
  );

  return {
    layers,
    configStatus,
    ema,
    skipped: split.skipped.map(skippedText),
    episodeRefs,
    chosenRef: selected?.ref ?? null,
    setChosenRef,
    needsChoice,
    episodeHistories: episodeShown.histories,
    episodeStatus,
    retry,
  };
}
