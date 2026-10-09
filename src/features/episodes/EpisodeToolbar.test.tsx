import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EMPTY_EPISODE_LAYERS_STATE } from "@/features/episodes/EpisodeLayersPrimitive";
import { EpisodeToolbar } from "@/features/episodes/EpisodeToolbar";

const params = { fast_period: 200, anchor_period: 500, slow_period: 1000, window_bars: 12, break_bars: 12 };

function renderToolbar(onOverrideChange = vi.fn(), override = {}) {
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
      params={params}
      override={override}
      onOverrideChange={onOverrideChange}
    />,
  );
  return onOverrideChange;
}

describe("EpisodeToolbar window fields", () => {
  afterEach(cleanup);

  it("shows the parameters sent to Engine", () => {
    renderToolbar();
    expect((screen.getByLabelText("Window") as HTMLInputElement).value).toBe("12");
    expect((screen.getByLabelText("Break") as HTMLInputElement).value).toBe("12");
  });

  it("applies a typed window on Enter, not on every keystroke", () => {
    const onOverrideChange = renderToolbar();
    const input = screen.getByLabelText("Window");
    fireEvent.change(input, { target: { value: "48" } });
    expect(onOverrideChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onOverrideChange).toHaveBeenCalledWith({ window_bars: 48 });
  });

  it("ignores a value that is not a positive integer", () => {
    const onOverrideChange = renderToolbar();
    const input = screen.getByLabelText("Break");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(onOverrideChange).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("12");
  });

  it("returns to the strategy values", () => {
    const onOverrideChange = renderToolbar(vi.fn(), { window_bars: 48 });
    fireEvent.click(screen.getByRole("button", { name: "Strategy values" }));
    expect(onOverrideChange).toHaveBeenCalledWith({});
  });
});
