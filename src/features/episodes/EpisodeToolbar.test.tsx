import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EMPTY_EPISODE_LAYERS_STATE } from "@/features/episodes/EpisodeLayersPrimitive";
import { EpisodeToolbar } from "@/features/episodes/EpisodeToolbar";

const params = { fast_period: 200, anchor_period: 500, slow_period: 1000, window_bars: 12, break_bars: 12 };

function renderToolbar(p: typeof params | null = params) {
  render(
    <EpisodeToolbar
      layers={EMPTY_EPISODE_LAYERS_STATE.layers}
      onLayersChange={() => {}}
      side="both"
      onSideChange={() => {}}
      status={null}
      refs={["a"]}
      chosenRef={null}
      onRefChange={() => {}}
      params={p}
    />,
  );
}

describe("EpisodeToolbar strategy values", () => {
  afterEach(cleanup);

  it("shows the strategy's window and break as read-only text", () => {
    renderToolbar();
    expect(screen.getByLabelText("Episode parameters from the strategy").textContent).toBe(
      "From the strategy: window 12 bars, break 12 bars",
    );
  });

  it("has no input and no reset button, so the values cannot be changed", () => {
    renderToolbar();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByLabelText("Window")).toBeNull();
    expect(screen.queryByRole("button", { name: "Strategy values" })).toBeNull();
  });

  it("shows nothing about values without parameters", () => {
    renderToolbar(null);
    expect(screen.queryByLabelText("Episode parameters from the strategy")).toBeNull();
  });
});
