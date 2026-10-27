import { describe, expect, it, vi } from "vitest";

import { EpisodeLayersPrimitive, EMPTY_EPISODE_LAYERS_STATE } from "@/features/episodes/EpisodeLayersPrimitive";

function paintForeground(clipToCandles: boolean | undefined) {
  const calls: { name: string; args: unknown[] }[] = [];
  const context = new Proxy(
    {},
    {
      get: (_t, name: string) => (...args: unknown[]) => {
        calls.push({ name, args });
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  const timeScale = {
    getVisibleLogicalRange: () => ({ from: -50, to: 150 }),
    options: () => ({ barSpacing: 6 }),
    logicalToCoordinate: (logical: number) => 100 + logical * 6,
  };
  const primitive = new EpisodeLayersPrimitive();
  primitive.attached({
    chart: { timeScale: () => timeScale },
    series: { priceToCoordinate: () => 10 },
    requestUpdate: vi.fn(),
  } as never);
  primitive.setState({
    ...EMPTY_EPISODE_LAYERS_STATE,
    times: [1000, 1300, 1600, 1900],
    stepSec: 300,
    clipToCandles,
  });
  const target = { useMediaCoordinateSpace: (cb: (s: unknown) => void) => cb({ context, mediaSize: { width: 800, height: 400 } }) };
  for (const view of primitive.paneViews()) view.renderer()?.drawBackground?.(target as never);
  for (const view of primitive.paneViews()) view.renderer()?.draw(target as never);
  return calls;
}

describe("episode layers clip", () => {
  it("clips to the first-to-last candle (± half a bar) when asked", () => {
    const calls = paintForeground(true);
    const rect = calls.find((c) => c.name === "rect");
    expect(rect?.args).toEqual([97, 0, 24, 400]); // logical -0.5 .. 3.5 at 6 px per bar from x=100
    expect(calls.some((c) => c.name === "clip")).toBe(true);
    expect(calls.findIndex((c) => c.name === "clip")).toBeLessThan(calls.length - 1 - [...calls].reverse().findIndex((c) => c.name !== "clip"));
  });

  it("does not clip by default (Workbench)", () => {
    expect(paintForeground(undefined).some((c) => c.name === "clip")).toBe(false);
  });
});
