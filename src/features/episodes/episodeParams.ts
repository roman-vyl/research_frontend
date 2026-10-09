import type { JsonObject } from "@/api/types";
import type { EpisodeParams } from "@/api/episodes";
import { anchorStackPeriodsFromStrategySpec } from "@/features/chart/anchorStackFromSpec";

const ROLES = ["fast", "anchor", "slow"] as const;
const WINDOW_KEYS = ["window_bars", "break_bars"] as const;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Episode parameters for the history request: the first `ema_stack_episode` ref of the strategy (a
 * missing period comes from `anchor_stack`, as in the strategy section), otherwise the `anchor_stack`
 * periods. `history_bars` is never sent. Values are not validated here: Engine decides.
 */
export function episodeParamsFromStrategySpec(strategySpec: JsonObject): EpisodeParams | null {
  let stack: { fast: number; anchor: number; slow: number } | null = null;
  try {
    stack = anchorStackPeriodsFromStrategySpec(strategySpec);
  } catch {
    stack = null;
  }
  const section = strategySpec.ema_stack_episode;
  const firstRef = isObject(section) ? Object.values(section).find(isObject) : undefined;
  if (!firstRef) {
    return stack
      ? { fast_period: stack.fast, anchor_period: stack.anchor, slow_period: stack.slow }
      : null;
  }
  const params: Partial<EpisodeParams> = {};
  for (const role of ROLES) {
    const key = `${role}_period` as const;
    const value = firstRef[key];
    if (typeof value === "number") {
      params[key] = value;
    } else if (stack) {
      params[key] = stack[role];
    } else {
      return null;
    }
  }
  for (const key of WINDOW_KEYS) {
    const value = firstRef[key];
    if (typeof value === "number") {
      params[key] = value;
    }
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
