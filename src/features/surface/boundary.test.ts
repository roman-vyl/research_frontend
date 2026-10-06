import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = __dirname;

function sources(): { name: string; text: string }[] {
  return readdirSync(DIR)
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
    .map((f) => ({ name: f, text: readFileSync(join(DIR, f), "utf8") }));
}

describe("Surface boundary to the workbench", () => {
  it("imports no chart or chart-runtime modules", () => {
    const bad = sources().flatMap(({ name, text }) =>
      [...text.matchAll(/from\s+["']([^"']+)["']/g)]
        .map((m) => m[1])
        .filter((p) => /features\/chart|workbenchChartRuntime|marketResourceCache|signalTrace/.test(p))
        .map((p) => `${name}: ${p}`),
    );
    expect(bad).toEqual([]);
  });

  it("uses the workbench only through run selection and tab switching", () => {
    const uses = sources().flatMap(({ name, text }) =>
      [...text.matchAll(/use(Workbench[A-Za-z]*)\(/g)].map((m) => `${name}:${m[1]}`),
    );
    expect(uses.sort()).toEqual(["SurfaceView.tsx:WorkbenchReport", "SurfaceView.tsx:WorkbenchShell"]);
    const text = sources().find((s) => s.name === "SurfaceView.tsx")!.text;
    expect(text).toMatch(/const \{ setSelectedRunId \} = useWorkbenchReport\(\)/);
    expect(text).toMatch(/const \{ setActiveTab \} = useWorkbenchShell\(\)/);
  });

  it("does not call the run list API", () => {
    expect(sources().some(({ text }) => /fetchRunSummaries|api\/research\/runs/.test(text))).toBe(false);
  });
});
