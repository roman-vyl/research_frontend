/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { ApiError } from "@/api/client";
import { WorkbenchProvider } from "@/shared/context/WorkbenchContext";
import { SelectRunOnMount } from "@/test/selectRun";

const fetchRunDetail = vi.fn<typeof import("@/api/client").fetchRunDetail>();
const fetchRunSummaries = vi.fn<typeof import("@/api/client").fetchRunSummaries>();
const fetchConfigState = vi.fn<typeof import("@/api/client").fetchConfigState>();
const fetchComponentCatalog = vi.fn<typeof import("@/api/client").fetchComponentCatalog>();

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    fetchRunDetail: (...args: Parameters<typeof fetchRunDetail>) => fetchRunDetail(...args),
    fetchRunTrades: vi.fn().mockResolvedValue({ contract_version: "1.0.0", run_id: "run-prototype", trades: [] }),
    fetchRunMetrics: vi.fn().mockResolvedValue(null),
    fetchManagedPolicyEvents: vi.fn().mockResolvedValue({ contract_version: "1.0.0", run_id: "run-prototype", events: [] }),
    fetchRunSummaries: (...args: Parameters<typeof fetchRunSummaries>) =>
      fetchRunSummaries(...args),
    fetchConfigState: (...args: Parameters<typeof fetchConfigState>) =>
      fetchConfigState(...args),
    fetchComponentCatalog: (...args: Parameters<typeof fetchComponentCatalog>) =>
      fetchComponentCatalog(...args),
    fetchCandlesWindow: vi.fn().mockResolvedValue({
      candles: [],
      coverage: {
        requested_from_ms: 0,
        requested_to_ms: 0,
        actual_from_ms: 0,
        actual_to_ms: 0,
        truncated: false,
      },
    }),
    fetchEmaWindow: vi.fn().mockResolvedValue({
      points: [],
      coverage: {
        requested_from_ms: 0,
        requested_to_ms: 0,
        actual_from_ms: 0,
        actual_to_ms: 0,
        calculation_origin_ms: 0,
        coverage_to_ms: 0,
        cache_hit: false,
        truncated: false,
      },
    }),
    fetchSignalTrace: vi.fn(),
    fetchChartOverlayEma: vi.fn().mockResolvedValue([]),
    selectSavedConfig: vi.fn(),
  };
});

const PROTOTYPE_REPORT_ERROR =
  "Invalid run artifact: variants.0.trade_records.0.context_ref Extra inputs are not permitted";

describe("App report vs composer isolation", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fetchRunSummaries.mockResolvedValue([
      {
        contract_version: "research_run_summary.v1",
        run_id: "run-prototype",
        created_at_utc: "2026-01-01T00:00:00Z",
        instance_id: "instance_1",
        strategy_id: "ema_pullback",
        strategy_version: "1",
        ticker: "BTCUSDT.P",
        timeframe: "5m",
        from_ms: 1_000_000,
        to_ms: 2_000_000,
        realised_trade_count: 0,
        open_position_count: 0,
        final_equity: "10000",
        net_pnl: "0",
        market_data_hash: null,
      },
    ]);
    fetchRunDetail.mockRejectedValue(new ApiError(500, PROTOTYPE_REPORT_ERROR));
    fetchConfigState.mockResolvedValue({
      strategy_id: "ema_pullback",
      selected_experiment_id: "draft_ema_pullback",
      selected_path: "research/experiments/configs/ema_pullback/draft_ema_pullback.json",
      configs: [],
      draft: {
        config_version: 1,
        experiment_id: "draft_ema_pullback",
        strategy_id: "ema_pullback",
        execution: {},
        instances: [
          {
            enabled: true,
            strategy_id: "ema_pullback",
            ticker: "BTCUSDT.P",
            base_timeframe: "5m",
            raw_spec: {
              trade_sides: { long: true, short: false },
              anchor_stack: { source: "close", timeframe: "base", fast: 200, anchor: 500, slow: 1000 },
              direction: { component_id: "ema_anchor_stack_trend" },
              setup: {
                component_id: "untouched_anchor_setup",
                lookback: 50,
                active_bars: 3,
              },
              trigger: { component_id: "reclaim_anchor", lookback: 1 },
              blockers: [{ instance_id: "no_blockers", component_id: "no_blockers" }],
              risk: { component_id: "no_risk_filter" },
              contexts: {},
              trade_management: {
                exit_policy: {
                  always_on: { exits: [] },
                  profiles: {
                    aligned: { exits: [] },
                    countertrend: { exits: [] },
                    neutral: { exits: [] },
                  },
                },
              },
            },
          },
        ],
      },
    });
    fetchComponentCatalog.mockResolvedValue({
      strategy_id: "ema_pullback",
      schema_version: 1,
      sections: [{ section_id: "strategy_contexts", label: "Strategy contexts" }],
      components: [],
      context_providers: [],
      context_consumption_roles: [],
    });
  });

  it("renders Composer when report load fails with prototype trade_records.context_ref", async () => {
    render(
      <WorkbenchProvider initialActiveTab="chart">
        <SelectRunOnMount runId="run-prototype" />
        <App />
      </WorkbenchProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Cannot load report" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Strategy Composer" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Strategy Composer" })).toBeTruthy();
    });
    expect(screen.queryByRole("heading", { name: "Cannot load report" })).toBeNull();
  });
});
