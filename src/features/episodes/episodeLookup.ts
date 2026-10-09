/** Lookups over Engine's episode entities by time (ms). Nothing is derived: every result is an entity. */

import type { Episode, EpisodeFalseBreak, EpisodeWave, EpisodeZone } from "@/api/episodes";
import type { EpisodeHistory } from "@/features/episodes/episodeHistory";

export type LanePhase = "away" | "in_zone" | "in_false_break";

export function allEpisodes(history: EpisodeHistory): Episode[] {
  return history.current ? [...history.finished, history.current] : history.finished;
}

function contains(start: number | null, end: number | null, t: number): boolean {
  return start !== null && start <= t && (end === null || t <= end);
}

/** Episodes are oldest first and do not overlap within one side. */
export function episodeAt(episodes: Episode[], t: number): Episode | null {
  let lo = 0;
  let hi = episodes.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (episodes[mid]!.start_ms <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return null;
  const episode = episodes[found]!;
  return contains(episode.start_ms, episode.stack_break_ms, t) ? episode : null;
}

export function zoneAt(episode: Episode, t: number): EpisodeZone | null {
  return episode.zones.find((zone) => contains(zone.start, zone.end, t)) ?? null;
}

export function falseBreakAt(episode: Episode, t: number): EpisodeFalseBreak | null {
  return episode.false_breaks.find((fb) => contains(fb.start, fb.end, t)) ?? null;
}

/** The wave whose span origin → touch holds `t` (the forming wave has no touch yet). */
export function waveAt(episode: Episode, t: number): EpisodeWave | null {
  return (
    episode.waves.find((wave) =>
      contains(wave.origin, wave.final ? wave.touch : (wave.stack_break ?? episode.stack_break_ms), t),
    ) ?? null
  );
}

export function lanePhaseAt(episodes: Episode[], t: number): LanePhase | null {
  const episode = episodeAt(episodes, t);
  if (!episode) return null;
  if (falseBreakAt(episode, t)) return "in_false_break";
  if (zoneAt(episode, t)) return "in_zone";
  return "away";
}

export type TouchRow = {
  number: number;
  zone: EpisodeZone;
  wave: EpisodeWave | null;
  falseBreak: EpisodeFalseBreak | null;
};

/** One row per zone of the episode, with its wave and false break (same `number`). */
export function touchRows(episode: Episode): TouchRow[] {
  return episode.zones.map((zone) => ({
    number: zone.number,
    zone,
    wave: episode.waves.find((wave) => wave.final && wave.number === zone.number) ?? null,
    falseBreak: episode.false_breaks.find((fb) => fb.number === zone.number) ?? null,
  }));
}

export function formingWave(episode: Episode): EpisodeWave | null {
  return episode.waves.find((wave) => !wave.final) ?? null;
}

/** Known at `t`: an entity whose `known_at` is set and not after `t`. */
export function knownBy(knownAt: number | null | undefined, t: number): boolean {
  return knownAt !== null && knownAt !== undefined && knownAt <= t;
}

/** The highest zone number opened at or before `t` (a zone is known from its first contact). */
export function lastZoneOpenedBy(episode: Episode, t: number): number | null {
  let last: number | null = null;
  for (const zone of episode.zones) {
    if (zone.start <= t && (last === null || zone.number > last)) last = zone.number;
  }
  return last;
}
