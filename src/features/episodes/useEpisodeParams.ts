import { useEffect, useState } from "react";

import { fetchStrategyFeaturePlan } from "@/api/client";
import type { EpisodeParams } from "@/api/episodes";
import type { JsonObject } from "@/api/types";
import {
  hasEpisodeSection,
  historyParamsFromEffective,
} from "@/features/episodes/episodeParams";

export type EpisodeParamsState = {
  /** `ema_stack_episode` refs in Engine's order; empty when the strategy declares none (then no episodes). */
  refs: string[];
  paramsByRef: Record<string, EpisodeParams>;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

const planCache = new Map<string, Promise<Record<string, EpisodeParams>>>();

function effectiveParams(strategyId: string, rawSpec: JsonObject): Promise<Record<string, EpisodeParams>> {
  const key = `${strategyId}|${JSON.stringify(rawSpec)}`;
  let pending = planCache.get(key);
  if (!pending) {
    pending = fetchStrategyFeaturePlan(strategyId, rawSpec).then((plan) =>
      Object.fromEntries(
        Object.entries(plan.episode_params_by_ref ?? {}).map(([ref, effective]) => [
          ref,
          historyParamsFromEffective(effective),
        ]),
      ),
    );
    pending.catch(() => planCache.delete(key));
    planCache.set(key, pending);
  }
  return pending;
}

/**
 * Episode parameters of the run's strategy: Engine's effective `episode_params_by_ref` when the
 * strategy declares `ema_stack_episode`. Without the section there are none: nothing is invented here.
 */
export function useEpisodeParams(strategyId: string | null, strategySpec: JsonObject | null): EpisodeParamsState {
  const [state, setState] = useState<EpisodeParamsState>({
    refs: [],
    paramsByRef: {},
    status: "idle",
    error: null,
  });

  useEffect(() => {
    if (!strategyId || !strategySpec) {
      setState({ refs: [], paramsByRef: {}, status: "idle", error: null });
      return;
    }
    if (!hasEpisodeSection(strategySpec)) {
      setState({ refs: [], paramsByRef: {}, status: "ready", error: null });
      return;
    }
    let cancelled = false;
    setState({ refs: [], paramsByRef: {}, status: "loading", error: null });
    effectiveParams(strategyId, strategySpec)
      .then((paramsByRef) => {
        if (!cancelled) {
          setState({
            refs: Object.keys(paramsByRef),
            paramsByRef,
                status: "ready",
            error: null,
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            refs: [],
            paramsByRef: {},
                status: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [strategyId, strategySpec]);

  return state;
}

/**
 * The parameters to show: the only ref, or the ref the user chose. With several refs
 * and no choice there are none: the Workbench asks for an explicit choice.
 */
export function selectEpisodeParams(state: EpisodeParamsState, chosenRef: string | null): EpisodeParams | null {
  if (state.refs.length === 0) return null;
  if (state.refs.length === 1) return state.paramsByRef[state.refs[0]!] ?? null;
  return chosenRef !== null ? (state.paramsByRef[chosenRef] ?? null) : null;
}

/**
 * Episode controls exist only for a strategy that declares episodes (or while Engine's plan loads or failed,
 * so the state is visible). A strategy without `ema_stack_episode` shows no episode control at all.
 */
export function showEpisodeControls(state: EpisodeParamsState): boolean {
  return state.refs.length > 0 || state.status === "loading" || state.status === "error";
}
