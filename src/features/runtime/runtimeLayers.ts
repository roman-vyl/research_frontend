/** Pure helpers of the Runtime chart layers (`runtime-dashboard-ema-episodes-v1`). */

import type { EpisodeParams } from "@/api/episodes";
import type { RuntimeChartLayers } from "@/api/runtime";
import { historyParamsFromEffective } from "@/features/episodes/episodeParams";

export const EMA_ROLE_COLORS = { fast: "#e6b422", anchor: "#4aa3df", slow: "#b07ad9" } as const;

/** Episode parameters to load: the only entry, or the chosen one; with several and no choice there are none. */
export function selectedEpisode(
  layers: RuntimeChartLayers | null,
  chosenRef: string | null,
): { ref: string; params: EpisodeParams } | null {
  if (layers === null || layers.episodes.length === 0) return null;
  const entry =
    layers.episodes.length === 1 ? layers.episodes[0]! : layers.episodes.find((e) => e.episode_ref === chosenRef);
  if (entry === undefined) return null;
  return { ref: entry.episode_ref, params: historyParamsFromEffective(entry.params) };
}
