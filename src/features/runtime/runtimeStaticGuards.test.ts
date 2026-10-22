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

  it("sends only GET, one PUT at the enabled route and one DELETE at the instance route; never polls", () => {
    for (const s of sources) {
      const methods = [...s.text.matchAll(/method:\s*["'](\w+)["']/g)].map((m) => m[1]);
      for (const m of methods) expect({ file: s.file, m: ["GET", "PUT", "DELETE"].includes(m!) }).toEqual({ file: s.file, m: true });
      expect({ file: s.file, hit: /(setInterval|setTimeout)\s*\(/.test(s.text) }).toEqual({ file: s.file, hit: false });
    }
    const api = readFileSync(join(__dirname, "../../api/runtime.ts"), "utf8");
    const puts = [...api.matchAll(/method:\s*"PUT"/g)];
    expect(puts).toHaveLength(1);
    expect(api).toMatch(/strategy-instances\/\$\{encodeURIComponent\(strategyInstanceId\)\}\/enabled`/);
    const deletes = [...api.matchAll(/method:\s*"DELETE"/g)];
    expect(deletes).toHaveLength(1);
    expect(api).toMatch(/\/v1\/strategy-instances\/\$\{encodeURIComponent\(strategyInstanceId\)\}`, \{\s*method: "DELETE"/);
    expect(/method:\s*["'](POST|PATCH)["']/.test(api)).toBe(false);
  });
});
