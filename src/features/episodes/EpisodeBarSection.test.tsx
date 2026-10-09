import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Episode } from "@/api/episodes";
import { EpisodeBarSection } from "@/features/episodes/EpisodeBarSection";

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

describe("EpisodeBarSection", () => {
  it("does not show later facts as known on an earlier bar", () => {
    render(<EpisodeBarSection barTimeSec={2_500} sides={["long"]} histories={histories} />);
    expect(screen.getByText(/№ 1 · open since/)).toBeTruthy();
    expect(screen.queryByText(/low 100\.00/)).toBeNull();
    expect(screen.getByText(/stack intact/)).toBeTruthy();
  });

  it("shows the false break outcome only from its known_at", () => {
    const { unmount } = render(<EpisodeBarSection barTimeSec={4_000} sides={["long"]} histories={histories} />);
    expect(screen.getByText(/in progress since/)).toBeTruthy();
    expect(screen.queryByText(/comeback/)).toBeNull();
    unmount();
    render(<EpisodeBarSection barTimeSec={5_000} sides={["long"]} histories={histories} />);
    expect(screen.getByText(/comeback · depth 10\.00/)).toBeTruthy();
  });

  it("shows a wave's prices only once its touch is known", () => {
    const { unmount } = render(<EpisodeBarSection barTimeSec={1_600} sides={["long"]} histories={histories} />);
    expect(screen.getByText("1 forming")).toBeTruthy();
    unmount();
    render(<EpisodeBarSection barTimeSec={2_000} sides={["long"]} histories={histories} />);
    expect(screen.getByText(/S\* 80\.00 · P 130\.00/)).toBeTruthy();
  });
});
