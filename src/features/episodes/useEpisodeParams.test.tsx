/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { selectEpisodeParams, useEpisodeParams } from "@/features/episodes/useEpisodeParams";

const fetchStrategyFeaturePlan = vi.fn();
vi.mock("@/api/client", () => ({
  fetchStrategyFeaturePlan: (...a: unknown[]) => fetchStrategyFeaturePlan(...a),
}));

const STACK = { anchor_stack: { fast: { period: 200 }, anchor: { period: 500 }, slow: { period: 1000 } } };
const EFFECTIVE = {
  fast_period: 200,
  anchor_period: 500,
  slow_period: 1000,
  window_bars: 24,
  break_bars: 24,
  history_bars: 15000,
};

describe("useEpisodeParams", () => {
  beforeEach(() => fetchStrategyFeaturePlan.mockReset());

  it("a spec without ema_stack_episode gives no parameters and asks Engine for nothing", async () => {
    const { result } = renderHook(() => useEpisodeParams("s1", STACK));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(selectEpisodeParams(result.current, null)).toBeNull();
    expect(result.current.refs).toEqual([]);
    expect(fetchStrategyFeaturePlan).not.toHaveBeenCalled();
  });

  it("an entry without parameters uses Engine's effective values, without history_bars", async () => {
    fetchStrategyFeaturePlan.mockResolvedValue({ episode_params_by_ref: { trend: EFFECTIVE } });
    const spec = { ...STACK, ema_stack_episode: { trend: {} } };
    const { result } = renderHook(() => useEpisodeParams("s2", spec));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(selectEpisodeParams(result.current, null)).toEqual({
      fast_period: 200,
      anchor_period: 500,
      slow_period: 1000,
      window_bars: 24,
      break_bars: 24,
    });
  });

  it("a failed plan gives an error and no parameters", async () => {
    fetchStrategyFeaturePlan.mockRejectedValue(new Error("down"));
    const spec = { ...STACK, ema_stack_episode: { trend: { window_bars: 12 } } };
    const { result } = renderHook(() => useEpisodeParams("s3", spec));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(selectEpisodeParams(result.current, null)).toBeNull();
  });
});
