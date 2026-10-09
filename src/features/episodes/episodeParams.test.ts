import { describe, expect, it } from "vitest";

import { withEpisodeOverride } from "@/features/episodes/episodeParams";

const base = { fast_period: 200, anchor_period: 500, slow_period: 1000, window_bars: 12, break_bars: 12 };

describe("withEpisodeOverride", () => {
  it("keeps the strategy parameters without an override", () => {
    expect(withEpisodeOverride(base, {})).toEqual(base);
  });

  it("replaces only the typed values", () => {
    expect(withEpisodeOverride(base, { window_bars: 48 })).toEqual({ ...base, window_bars: 48 });
    expect(withEpisodeOverride(base, { window_bars: 48, break_bars: 6 })).toEqual({
      ...base,
      window_bars: 48,
      break_bars: 6,
    });
  });

  it("adds a value the fallback parameters leave to Engine", () => {
    const fallback = { fast_period: 500, anchor_period: 1000, slow_period: 2000 };
    expect(withEpisodeOverride(fallback, { break_bars: 36 })).toEqual({ ...fallback, break_bars: 36 });
  });

  it("has nothing to override without parameters", () => {
    expect(withEpisodeOverride(null, { window_bars: 48 })).toBeNull();
  });
});
