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

export type EpisodeStateAtBar = {
  /** The stack breaks on this very bar. */
  brokenHere: boolean;
  /** Last zone opened at or before the bar (zones are known from their first contact). */
  lastTouch: number | null;
  phase: "away" | "in_zone" | "in_false_break";
  /** The zone that is open on the bar; its final end and prices are not known yet. */
  openZone: EpisodeZone | null;
  /** The false break that is running on the bar (detected at its zone's `known_at`). */
  openFalseBreak: EpisodeFalseBreak | null;
  /** The last zone already closed by the bar, with its final values. */
  lastClosedZone: EpisodeZone | null;
  /** The last false break whose outcome is known by the bar. */
  lastResolvedFalseBreak: EpisodeFalseBreak | null;
  /** The last wave whose touch happened at or before the bar. */
  lastFinishedWave: EpisodeWave | null;
  /** Number of the wave that is forming on the bar. */
  formingNumber: number;
};

/**
 * The episode as it was known at the close of the bar `t`, from Engine's `known_at` only: a zone is
 * open from its start until its `known_at` (even through a run below the anchor that later turns out
 * to be a false break); a false break exists only from its zone's `known_at` (detection) and has an
 * outcome only from its own `known_at`. Nothing that becomes known later changes what is returned.
 */
export function episodeStateAt(episode: Episode, t: number): EpisodeStateAtBar {
  const opened = episode.zones.filter((zone) => zone.start <= t);
  const last = opened.reduce<EpisodeZone | null>(
    (best, zone) => (best === null || zone.number > best.number ? zone : best),
    null,
  );
  const fbOf = (zone: EpisodeZone) => episode.false_breaks.find((fb) => fb.number === zone.number) ?? null;
  let phase: EpisodeStateAtBar["phase"] = "away";
  let openZone: EpisodeZone | null = null;
  let openFalseBreak: EpisodeFalseBreak | null = null;
  if (last && !knownBy(last.known_at, t)) {
    phase = "in_zone";
    openZone = last;
  } else if (last && last.has_false_break) {
    const fb = fbOf(last);
    if (fb && !knownBy(fb.known_at, t)) {
      phase = "in_false_break";
      openFalseBreak = fb;
    }
  }
  const closed = opened.filter((zone) => knownBy(zone.known_at, t));
  const lastClosedZone = closed.length > 0 ? closed[closed.length - 1]! : null;
  const resolved = episode.false_breaks.filter((fb) => knownBy(fb.known_at, t));
  const finished = episode.waves.filter((wave) => wave.final && knownBy(wave.known_at, t));
  return {
    brokenHere: knownBy(episode.stack_break_ms, t),
    lastTouch: last?.number ?? null,
    phase,
    openZone,
    openFalseBreak,
    lastClosedZone,
    lastResolvedFalseBreak: resolved.length > 0 ? resolved[resolved.length - 1]! : null,
    lastFinishedWave: finished.length > 0 ? finished[finished.length - 1]! : null,
    formingNumber: (last?.number ?? 0) + 1,
  };
}
