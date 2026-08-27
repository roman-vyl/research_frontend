import { describe, expect, it } from "vitest";

import type { ChartBar, RunDetail } from "@/api/types";
import {
  buildRunMarketViewIdentity,
  resolveRunMarketView,
} from "@/features/chart/runMarketView";
import {
  chartWindowKeyMatchesRunInstance,
  evaluateSignalTraceBootstrap,
  resolveSignalTraceFetchSource,
} from "@/shared/context/signalTraceBootstrap";

const REPORT: RunDetail = {
  contract_version: "1.0.0",
  manifest: {
    contract_version: "1.0.0",
    run_id: "run-a",
    instance_id: "exp_a",
    created_at_utc: "2026-01-01T00:00:00Z",
    market_data_hash: null,
  },
  result: {
    contract_version: "1.0.0",
    run_id: "run-a",
    instance_id: "exp_a",
    strategy_evaluation: {
      contract_version: "1.0.0",
      strategy_id: "ema_pullback",
      strategy_version: "1",
      instance_id: "exp_a",
      market: { ticker: "BTCUSDT", timeframe: "5m", from_ms: 1_000_000, to_ms: 2_000_000 },
      bar_count: 100,
      market_data_hash: "hash",
    },
  },
  strategy_spec: {
    anchor_stack: {
      fast: { period: 200 },
      anchor: { period: 500 },
      slow: { period: 1000 },
    },
  },
};

function makeCandles(count: number, start = 1_700_000_000): ChartBar[] {
  return Array.from({ length: count }, (_, index) => ({
    time: start + index * 300,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
  }));
}

function marketIdentityForReport(report: RunDetail = REPORT): string {
  return buildRunMarketViewIdentity(
    resolveRunMarketView({
      runDetail: report,
      chartTimeframe: "5m",
      reloadToken: 0,
    }),
  );
}

function bootstrapInput(
  overrides: Partial<Parameters<typeof evaluateSignalTraceBootstrap>[0]> = {},
) {
  const candles = makeCandles(10);
  const first = candles[0]!.time;
  const last = candles.at(-1)!.time;
  const windowKey = `run-a:exp_a:${first}:${last}:`;
  const identity = marketIdentityForReport();
  return {
    runDetail: REPORT,
    reportLoadStatus: "ready" as const,
    selectedRunId: "run-a",
    instanceId: REPORT.manifest.instance_id,
    marketLoadStatus: "ready" as const,
    runMarketViewIdentity: identity,
    expectedRunMarketViewIdentity: identity,
    chartWindowKey: windowKey,
    candles,
    renderWindowBounds: { fromSec: first, toSec: last },
    previousWindowKey: null,
    ...overrides,
  };
}

describe("signalTraceBootstrap", () => {
  it("blocks when market is not ready", () => {
    const result = evaluateSignalTraceBootstrap(
      bootstrapInput({ marketLoadStatus: "loading" }),
    );
    expect(result).toEqual({ ready: false, reason: "market_not_ready" });
  });

  it("blocks when report run_id mismatches selectedRunId during run switch", () => {
    const result = evaluateSignalTraceBootstrap(
      bootstrapInput({ selectedRunId: "run-b" }),
    );
    expect(result).toEqual({ ready: false, reason: "report_run_mismatch" });
  });

  it("blocks when report is still loading after run switch", () => {
    const result = evaluateSignalTraceBootstrap(
      bootstrapInput({ reportLoadStatus: "loading", runDetail: null }),
    );
    expect(result).toEqual({ ready: false, reason: "run_switch_not_ready" });
  });

  it("blocks when market view identity is stale after run switch", () => {
    const result = evaluateSignalTraceBootstrap(
      bootstrapInput({ runMarketViewIdentity: "stale-market-view" }),
    );
    expect(result).toEqual({ ready: false, reason: "run_switch_not_ready" });
  });

  it("blocks when render window key does not match current run/instance", () => {
    const candles = makeCandles(10);
    const result = evaluateSignalTraceBootstrap(
      bootstrapInput({
        chartWindowKey: "run-b:exp_a:1:2:",
        candles,
        renderWindowBounds: { fromSec: candles[0]!.time, toSec: candles.at(-1)!.time },
      }),
    );
    expect(result).toEqual({ ready: false, reason: "render_window_not_ready" });
  });

  it("returns load request on initial render window readiness", () => {
    const candles = makeCandles(50);
    const first = candles[0]!.time;
    const last = candles.at(-1)!.time;
    const windowKey = `run-a:exp_a:${first}:${last}:`;
    const result = evaluateSignalTraceBootstrap(bootstrapInput({ candles, chartWindowKey: windowKey }));
    expect(result.ready).toBe(true);
    if (!result.ready) {
      return;
    }
    expect(result.fetchSource).toBe("initial");
    expect(result.request).toEqual({
      windowKey,
      runId: "run-a",
      variant: "exp_a",
      fromMs: first * 1000,
      toOpenTimeMs: last * 1000,
    });
  });

  it("marks window shift when chart window key changes", () => {
    expect(resolveSignalTraceFetchSource("run-a:exp_a:1:2:", "run-a:exp_a:3:4:")).toBe(
      "window_shift",
    );
    expect(resolveSignalTraceFetchSource(null, "run-a:exp_a:1:2:")).toBe("initial");
  });

  it("validates window prefix helper against run/instance", () => {
    expect(chartWindowKeyMatchesRunInstance("run-a:exp_a:1:2:", "run-a", "exp_a")).toBe(true);
    expect(chartWindowKeyMatchesRunInstance("run-b:exp_a:1:2:", "run-a", "exp_a")).toBe(false);
  });
});
