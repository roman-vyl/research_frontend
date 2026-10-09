import { describe, expect, it } from "vitest";

import type { Episode } from "@/api/episodes";
import {
  episodeAt,
  falseBreakAt,
  formingWave,
  lanePhaseAt,
  touchRows,
  waveAt,
  zoneAt,
} from "@/features/episodes/episodeLookup";

const zone = (number: number, start: number, end: number, fb = false) => ({
  number,
  start,
  end,
  high: 110,
  low: 100,
  has_false_break: fb,
  final: true,
  known_at: end + 1,
});

const wave = (number: number, origin: number, peak: number, touch: number | null) => ({
  number,
  origin,
  origin_price: 90,
  peak,
  peak_price: 120,
  touch,
  touch_price: touch === null ? null : 101,
  up_leg: { high: 120, low: 90 },
  down_leg: { high: 120, low: 101 },
  final: touch !== null,
  known_at: touch,
});

const finished: Episode = {
  start_ms: 1000,
  stack_break_ms: 2000,
  censored: false,
  touches: 2,
  false_breaks_count: 1,
  zones: [zone(1, 1200, 1300), zone(2, 1500, 1600, true)],
  false_breaks: [
    {
      number: 2,
      start: 1610,
      end: 1700,
      high: 99,
      low: 95,
      depth: 5,
      outcome: "comeback",
      final: true,
      known_at: 1700,
    },
  ],
  waves: [wave(1, 1000, 1100, 1200), wave(2, 1300, 1400, 1500), { ...wave(3, 1700, 1800, null), stack_break: 2000 }],
};

const current: Episode = {
  start_ms: 3000,
  stack_break_ms: null,
  censored: false,
  touches: 0,
  false_breaks_count: 0,
  zones: [],
  false_breaks: [],
  waves: [],
  touch_number: 0,
  phase: "away",
};

describe("episode lookups", () => {
  const episodes = [finished, current];

  it("finds the episode holding a time, open current included", () => {
    expect(episodeAt(episodes, 999)).toBeNull();
    expect(episodeAt(episodes, 1500)).toBe(finished);
    expect(episodeAt(episodes, 2500)).toBeNull();
    expect(episodeAt(episodes, 9_999_999)).toBe(current);
  });

  it("finds zone, false break and wave by time", () => {
    expect(zoneAt(finished, 1550)?.number).toBe(2);
    expect(falseBreakAt(finished, 1650)?.depth).toBe(5);
    expect(waveAt(finished, 1350)?.number).toBe(2);
    expect(waveAt(finished, 1900)?.number).toBe(3);
  });

  it("gives lane phases from Engine intervals", () => {
    expect(lanePhaseAt(episodes, 1250)).toBe("in_zone");
    expect(lanePhaseAt(episodes, 1650)).toBe("in_false_break");
    expect(lanePhaseAt(episodes, 1400)).toBe("away");
    expect(lanePhaseAt(episodes, 2500)).toBeNull();
  });

  it("builds touch rows by number and finds the forming wave", () => {
    const rows = touchRows(finished);
    expect(rows.map((row) => [row.number, row.wave?.number, row.falseBreak?.number ?? null])).toEqual([
      [1, 1, null],
      [2, 2, 2],
    ]);
    expect(formingWave(finished)?.number).toBe(3);
  });
});
