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

  it("sends only GET, one PUT at the enabled route and one DELETE at the instance route; polls only the state route every 10 s in the dashboard", () => {
    for (const s of sources) {
      const methods = [...s.text.matchAll(/method:\s*["'](\w+)["']/g)].map((m) => m[1]);
      for (const m of methods) expect({ file: s.file, m: ["GET", "PUT", "DELETE"].includes(m!) }).toEqual({ file: s.file, m: true });
      expect({ file: s.file, hit: /setTimeout\s*\(/.test(s.text) }).toEqual({ file: s.file, hit: false });
      // the only timer: the dashboard's single 10 s trade-state refresh
      const intervals = [...s.text.matchAll(/setInterval\s*\(/g)].length;
      expect({ file: s.file, intervals }).toEqual({ file: s.file, intervals: s.file === "RuntimeDashboard.tsx" ? 1 : 0 });
    }
    const dash = sources.find((s) => s.file === "RuntimeDashboard.tsx")!.text;
    expect(dash).toMatch(/STATE_REFRESH_MS = 10_000/);
    expect(dash).toMatch(/setInterval\(tick, STATE_REFRESH_MS\)/);
    const api = readFileSync(join(__dirname, "../../api/runtime.ts"), "utf8");
    const puts = [...api.matchAll(/method:\s*"PUT"/g)];
    expect(puts).toHaveLength(1);
    expect(api).toMatch(/strategy-instances\/\$\{encodeURIComponent\(strategyInstanceId\)\}\/enabled`/);
    const deletes = [...api.matchAll(/method:\s*"DELETE"/g)];
    expect(deletes).toHaveLength(1);
    expect(api).toMatch(/\/v1\/strategy-instances\/\$\{encodeURIComponent\(strategyInstanceId\)\}`, \{\s*method: "DELETE"/);
    expect(/method:\s*["'](POST|PATCH)["']/.test(api)).toBe(false);
  });

  it("does not use the timer-driven episode hook; episode and EMA data come only from the cached loaders", () => {
    for (const s of sources) {
      expect({ file: s.file, hit: /useEpisodeHistories/.test(s.text) }).toEqual({ file: s.file, hit: false });
    }
    const hook = sources.find((s) => s.file === "useRuntimeChartLayers.ts")!.text;
    expect(hook).toMatch(/getEpisodeHistory/);
    expect(hook).toMatch(/refreshCurrent/);
  });

  it("reads the layer plan with one GET and keeps the series count fixed", () => {
    const api = readFileSync(join(__dirname, "../../api/runtime.ts"), "utf8");
    expect([...api.matchAll(/chart-layers`,\s*\{\s*method:\s*"GET"/g)]).toHaveLength(1);
    const chart = sources.find((s) => s.file === "RuntimeCandleChart.tsx")!.text;
    expect([...chart.matchAll(/addCustomSeries\(/g)]).toHaveLength(4);
    expect([...chart.matchAll(/addSeries\(/g)]).toHaveLength(2); // candles, and one line per stack role in a fixed map
    expect([...chart.matchAll(/attachPrimitive\(/g)]).toHaveLength(1);
    expect(chart).toMatch(/EMA_ROLES = \["fast", "anchor", "slow"\]/);
  });
});
