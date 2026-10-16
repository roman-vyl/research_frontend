import { describe, expect, it } from "vitest";
import type { ExperimentRegistryEntry } from "@/api/experiments";
import { groupExperiments } from "./SurfaceView";

const entry = (experiment_id: string, group?: string): ExperimentRegistryEntry => ({
  experiment_id, title: experiment_id, ticker: "BTCUSDT.P", anchor: "ema500", manifest: `${experiment_id}.json`, group,
});

describe("groupExperiments", () => {
  it("keeps groups in order of first appearance and sends ungrouped entries to Other", () => {
    const groups = groupExperiments([entry("a", "A1"), entry("b"), entry("c", "A2"), entry("d", "A1"), entry("e", " ")]);
    expect(groups.map(([g, xs]) => [g, xs.map((x) => x.experiment_id)])).toEqual([
      ["A1", ["a", "d"]],
      ["Other", ["b", "e"]],
      ["A2", ["c"]],
    ]);
  });
});
