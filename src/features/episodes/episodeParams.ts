import type { JsonObject } from "@/api/types";
import type { EpisodeParams } from "@/api/episodes";

const HISTORY_KEYS = [
  "fast_period",
  "anchor_period",
  "slow_period",
  "window_bars",
  "break_bars",
] as const;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** True when the strategy declares `ema_stack_episode`: its parameters then come from Engine. */
export function hasEpisodeSection(strategySpec: JsonObject): boolean {
  return isObject(strategySpec.ema_stack_episode);
}

/**
 * History request parameters from one ref of Engine's `episode_params_by_ref` (effective, after
 * defaults). Only the keys the history route accepts are taken; `history_bars` is left out because
 * the route always covers the whole history.
 */
export function historyParamsFromEffective(effective: Record<string, number>): EpisodeParams {
  const params: Record<string, number> = {};
  for (const key of HISTORY_KEYS) {
    if (typeof effective[key] === "number") params[key] = effective[key];
  }
  return params as EpisodeParams;
}

export function episodeParamsKey(params: EpisodeParams): string {
  return [
    params.fast_period,
    params.anchor_period,
    params.slow_period,
    params.window_bars ?? "",
    params.break_bars ?? "",
  ].join("/");
}
