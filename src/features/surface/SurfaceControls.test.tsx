import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ExperimentDimension, ExperimentResultSchema } from "@/api/experiments";
import { RATIO_MANIFEST } from "@/features/surface/fixtures/experiments";
import { SurfaceSliders } from "@/features/surface/SurfaceControls";
import type { ViewState } from "@/features/surface/model";

const BASE = RATIO_MANIFEST.result_schema;

function renderSl(control: ExperimentDimension["control"], count: number): void {
  const schema: ExperimentResultSchema = {
    ...BASE,
    dimensions: BASE.dimensions.map((d) => (d.id === "sl" ? { ...d, control } : d)),
  };
  const sl = Array.from({ length: count }, (_, i) => i + 3);
  const state: ViewState = {
    viewId: "main",
    metric: "return_pct",
    mode: "treatment",
    compare: null,
    controls: { sl: sl[0], tp_ratio: 5 },
    filters: [],
  };
  render(
    <SurfaceSliders
      schema={schema}
      view={schema.view[0]}
      state={state}
      options={{ sl, tp_ratio: [5] }}
      outer={null}
      onControl={() => {}}
      onToggle={() => {}}
      hints={{}}
    />,
  );
}

describe("SurfaceSliders: control from the manifest", () => {
  afterEach(cleanup);

  it("without control: up to 6 values are buttons, more are a slider", () => {
    renderSl(undefined, 6);
    expect(screen.getByRole("group", { name: "Initial SL" }).querySelectorAll("button")).toHaveLength(6);
    cleanup();
    renderSl(undefined, 17);
    expect(screen.queryByRole("group", { name: "Initial SL" })).toBeNull();
    expect(screen.getByRole("slider", { name: "Initial SL" })).toBeTruthy();
  });

  it('control "buttons" shows every value as a button even past 6', () => {
    renderSl("buttons", 17);
    expect(screen.getByRole("group", { name: "Initial SL" }).querySelectorAll("button")).toHaveLength(17);
    expect(screen.queryByRole("slider", { name: "Initial SL" })).toBeNull();
  });

  it('control "slider" keeps a slider even for few values', () => {
    renderSl("slider", 3);
    expect(screen.queryByRole("group", { name: "Initial SL" })).toBeNull();
    expect(screen.getByRole("slider", { name: "Initial SL" })).toBeTruthy();
  });
});
