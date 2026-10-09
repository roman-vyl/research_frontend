import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Episode } from "@/api/episodes";
import { EpisodeBarSection } from "@/features/episodes/EpisodeBarSection";
import { episodeStateAt } from "@/features/episodes/episodeLookup";

// Zone 1 opens at 2000, last contact 3000; a run below the anchor starts at 3100 and is detected as a
// false break at 4000 (zone known_at); the comeback is at 5000 (false break known_at).
const episode: Episode = {
  start_ms: 1_000_000,
  stack_break_ms: 9_000_000,
  censored: false,
  touches: 1,
  false_breaks_count: 1,
  zones: [
    { number: 1, start: 2_000_000, end: 3_000_000, high: 110, low: 100, has_false_break: true, final: true, known_at: 4_000_000 },
  ],
  false_breaks: [
    { number: 1, start: 3_100_000, end: 5_000_000, high: 99, low: 90, depth: 10, outcome: "comeback", final: true, known_at: 5_000_000 },
  ],
  waves: [
    {
      number: 1,
      origin: 1_000_000,
      origin_price: 80,
      peak: 1_500_000,
      peak_price: 130,
      touch: 2_000_000,
      touch_price: 105,
      up_leg: { high: 130, low: 80 },
      down_leg: { high: 130, low: 105 },
      final: true,
      known_at: 2_000_000,
    },
  ],
};
const histories = {
  long: { side: "long" as const, finished: [episode], current: null, marketDataHash: "h", asOfMs: 9_999_000 },
};

describe("episode state at a bar", () => {
  it("keeps the zone open through the run below until the false break is detected", () => {
    for (const t of [2_000_000, 3_000_000, 3_500_000, 3_999_999]) {
      const state = episodeStateAt(episode, t);
      expect(state.phase).toBe("in_zone");
      expect(state.openFalseBreak).toBeNull();
      expect(state.lastClosedZone).toBeNull();
    }
  });

  it("shows the false break from detection and its outcome only from its known_at", () => {
    const detected = episodeStateAt(episode, 4_000_000);
    expect(detected.phase).toBe("in_false_break");
    expect(detected.lastClosedZone?.number).toBe(1);
    expect(detected.lastResolvedFalseBreak).toBeNull();
    const resolved = episodeStateAt(episode, 5_000_000);
    expect(resolved.phase).toBe("away");
    expect(resolved.lastResolvedFalseBreak?.outcome).toBe("comeback");
  });

  it("finishes a wave only at its touch and counts the forming wave causally", () => {
    expect(episodeStateAt(episode, 1_600_000).lastFinishedWave).toBeNull();
    expect(episodeStateAt(episode, 1_600_000).formingNumber).toBe(1);
    expect(episodeStateAt(episode, 2_000_000).lastFinishedWave?.number).toBe(1);
    expect(episodeStateAt(episode, 2_000_000).formingNumber).toBe(2);
    expect(episodeStateAt(episode, 8_999_999).brokenHere).toBe(false);
    expect(episodeStateAt(episode, 9_000_000).brokenHere).toBe(true);
  });
});

describe("EpisodeBarSection", () => {
  it("does not reveal the zone end or a coming false break on an earlier bar", () => {
    render(<EpisodeBarSection barTimeSec={3_500} sides={["long"]} histories={histories} />);
    expect(screen.getByText(/zone № 1 open since/)).toBeTruthy();
    expect(screen.queryByText(/false break №/)).toBeNull();
    expect(screen.queryByText(/low 100\.00/)).toBeNull();
    expect(screen.queryByText(/comeback/)).toBeNull();
    expect(screen.getByText(/stack intact/)).toBeTruthy();
  });

  it("shows outcome and depth only once known", () => {
    const { unmount } = render(<EpisodeBarSection barTimeSec={4_000} sides={["long"]} histories={histories} />);
    expect(screen.getByText(/false break № 1 since/)).toBeTruthy();
    expect(screen.queryByText(/depth/)).toBeNull();
    unmount();
    render(<EpisodeBarSection barTimeSec={5_000} sides={["long"]} histories={histories} />);
    expect(screen.getByText(/comeback · depth 10\.00/)).toBeTruthy();
  });
});
