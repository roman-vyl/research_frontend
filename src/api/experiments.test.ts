import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  calculateRows,
  cancelCalculation,
  fetchExperimentManifest,
  fetchExperimentResults,
  fetchExperiments,
  getCalculation,
  planCalculation,
} from "@/api/client";
import { metricId } from "@/api/experiments";
import {
  RATIO_MANIFEST,
  RATIO_RESULTS,
  REGISTRY,
  TRAILING_MANIFEST,
  TRAILING_RESULTS,
} from "@/features/surface/fixtures/experiments";

function stubFetch(body: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({ ok, status, statusText: "x", json: async () => body }) as Response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("Experiment API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the registry and a manifest", async () => {
    const fn = stubFetch(REGISTRY);
    expect((await fetchExperiments()).experiments).toHaveLength(2);
    expect(fn.mock.calls[0][0]).toBe("/api/research/experiments");
    stubFetch(RATIO_MANIFEST);
    expect((await fetchExperimentManifest("btcusdt_p.ema500.ratio_4d")).result_schema.table).toBe("runs.csv");
  });

  it("sends semantic-id filters and columns", async () => {
    const fn = stubFetch(TRAILING_RESULTS);
    await fetchExperimentResults({
      experimentId: "btcusdt_p.ema500.trailing_geometry_4d",
      filters: { sl: 5, grid: "R" },
      columns: ["width", "net_pnl"],
    });
    const url = new URL(String(fn.mock.calls[0][0]), "http://x");
    expect(url.pathname).toBe("/api/research/experiments/btcusdt_p.ema500.trailing_geometry_4d/results");
    expect(url.searchParams.get("sl")).toBe("5");
    expect(url.searchParams.get("grid")).toBe("R");
    expect(url.searchParams.get("columns")).toBe("width,net_pnl");
  });

  it("surfaces the backend error message", async () => {
    stubFetch({ error: "experiment_not_found", message: "experiment not found: x" }, false, 404);
    await expect(fetchExperimentManifest("x")).rejects.toMatchObject({
      status: 404,
      detail: "experiment not found: x",
    });
    await expect(fetchExperimentManifest("x")).rejects.toBeInstanceOf(ApiError);
  });

  it("Calculate routes: plan and calculate wrap coords; job status and cancel by job id", async () => {
    const id = "btcusdt_p.ema500.ratio_4d";
    const coords = { width: 3, lookback: 20, sl: 5, tp_ratio: 5 };
    const fn = stubFetch({});
    await planCalculation(id, [coords]);
    await calculateRows(id, [coords], "sha256:p");
    await getCalculation(id, "calc_1");
    await cancelCalculation(id, "calc_1");
    const calls = fn.mock.calls as unknown as [string, RequestInit | undefined][];
    expect(calls.map((c) => c[0])).toEqual([
      `/api/research/experiments/${id}/runs/calculate-plan`,
      `/api/research/experiments/${id}/runs/calculate`,
      `/api/research/experiments/${id}/calculations/calc_1`,
      `/api/research/experiments/${id}/calculations/calc_1/cancel`,
    ]);
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ rows: [{ coords }] });
    expect(JSON.parse(String(calls[1][1]?.body))).toEqual({ rows: [{ coords }], plan_token: "sha256:p" });
    expect(calls[3][1]?.method).toBe("POST");
  });

  it("a 409 keeps the backend error code and details", async () => {
    stubFetch({ error: "job_running", message: "another calculation job is running", details: { job_id: "calc_9" } }, false, 409);
    await expect(calculateRows("x", [], "t")).rejects.toMatchObject({
      status: 409,
      code: "job_running",
      details: { job_id: "calc_9" },
    });
  });

  it("fixtures are consistent columnar responses", () => {
    for (const r of [RATIO_RESULTS, TRAILING_RESULTS]) {
      expect(r.data).toHaveLength(r.columns.length);
      for (const col of r.data) expect(col).toHaveLength(r.rows);
    }
    expect(TRAILING_MANIFEST.result_schema.metrics.map(metricId)).toContain("net_pnl");
  });
});
