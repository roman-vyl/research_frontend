import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(__dirname);
const sources = readdirSync(DIR)
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f))
  .map((f) => ({ file: f, text: readFileSync(join(DIR, f), "utf8") }));

describe("Runtime Dashboard static guards", () => {
  it("has source files to check", () => {
    expect(sources.map((s) => s.file)).toEqual(
      expect.arrayContaining(["RuntimeCandleChart.tsx", "RuntimeChartPanel.tsx", "runtimeMarket.ts", "RuntimeDashboard.tsx"]),
    );
  });

  it("calls no viewport methods", () => {
    const forbidden = /(setVisibleRange|setVisibleLogicalRange|fitContent|scrollToPosition|scrollToRealTime)/;
    for (const s of sources) expect({ file: s.file, hit: forbidden.test(s.text) }).toEqual({ file: s.file, hit: false });
  });

  it("imports nothing from the Research chart runtime", () => {
    const forbidden =
      /from\s+["'][^"']*(WorkbenchContext|WorkbenchRenderViewportContext|features\/chart\/ChartPanel|features\/chart\/runtime\/|features\/workbenchChartRuntime\/)/;
    for (const s of sources) expect({ file: s.file, hit: forbidden.test(s.text) }).toEqual({ file: s.file, hit: false });
  });

  it("never resets or clears the shared market cache", () => {
    const forbidden = /(clearMarketResourceCache|\.reset\s*\()/;
    for (const s of sources) expect({ file: s.file, hit: forbidden.test(s.text) }).toEqual({ file: s.file, hit: false });
  });
});
