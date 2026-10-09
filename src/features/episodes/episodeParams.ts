import type { JsonObject } from "@/api/types";
import type { EpisodeParams } from "@/api/episodes";
import { anchorStackPeriodsFromStrategySpec } from "@/features/chart/anchorStackFromSpec";

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

/** Fallback for a strategy without the episode section: the `anchor_stack` periods, Engine's window. */
export function anchorStackEpisodeParams(strategySpec: JsonObject): EpisodeParams | null {
  try {
    const stack = anchorStackPeriodsFromStrategySpec(strategySpec);
    return { fast_period: stack.fast, anchor_period: stack.anchor, slow_period: stack.slow };
  } catch {
    return null;
  }
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

export type EpisodeWindowOverride = { window_bars?: number; break_bars?: number };

/**
 * The strategy's episode parameters with the window values the user typed in the episode toolbar.
 * Only what the user set is replaced; Engine applies its own defaults to anything still missing.
 */
export function withEpisodeOverride(
  params: EpisodeParams | null,
  override: EpisodeWindowOverride,
): EpisodeParams | null {
  if (!params) return null;
  return { ...params, ...override };
}
