/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RunDetail, RunMetrics, TradeRecord } from "@/api/types";
import { ReportsPanel } from "@/features/reports/ReportsPanel";
import { makeTradeRecord } from "@/features/chart/testFixtures/tradeRecordFixtures";

const { mockUseWorkbenchReport, mockUseWorkbenchChart } = vi.hoisted(() => ({
  mockUseWorkbenchReport: vi.fn(),
  mockUseWorkbenchChart: vi.fn(),
}));

vi.mock("@/shared/context/WorkbenchContext", () => ({
  useWorkbenchReport: () => mockUseWorkbenchReport(),
  useWorkbenchChart: () => mockUseWorkbenchChart(),
}));

afterEach(() => {
  cleanup();
});

function makeRunDetail(): RunDetail {
  return {
    contract_version: "1.0.0",
    manifest: {
      contract_version: "1.0.0",
      run_id: "run-a",
      instance_id: "instance_1",
      created_at_utc: "2026-01-01T00:00:00Z",
      market_data_hash: null,
    },
    result: {
      contract_version: "1.0.0",
      run_id: "run-a",
      instance_id: "instance_1",
      strategy_evaluation: {
        contract_version: "1.0.0",
        strategy_id: "ema_pullback",
        strategy_version: "1",
        instance_id: "instance_1",
        market: { ticker: "BTCUSDT", timeframe: "5m", from_ms: 0, to_ms: 1_000 },
        bar_count: 10,
        market_data_hash: "hash",
      },
    },
    strategy_spec: {},
  };
}

function makeMetrics(overrides: Partial<RunMetrics> = {}): RunMetrics {
  return {
    contract_version: "1.0.0",
    run_id: "run-a",
    initial_equity: "1000",
    final_equity: "1100",
    realised_trade_count: 2,
    open_position_count: 0,
    gross_pnl: "110",
    fees_paid: "10",
    net_pnl: "100",
    ...overrides,
  };
}

const tradeLong = makeTradeRecord({
  trade_id: "1",
  position_id: "position-1",
  side: "long",
  entry_time_ms: 1_000,
  exit_time_ms: 2_000,
  net_pnl: "50",
  exit_reason: "signal:rsi_exit_base",
  exit_kind: "signal",
});

const tradeShort = makeTradeRecord({
  trade_id: "2",
  position_id: "position-2",
  side: "short",
  entry_time_ms: 3_000,
  exit_time_ms: 4_000,
  net_pnl: "-20",
  exit_reason: "stop_loss:atr_sl",
  exit_kind: "stop_loss",
});

function mockWorkbench(overrides: {
  runTrades: TradeRecord[];
  runMetrics?: RunMetrics | null;
  selectedTradeId?: number | string | null;
  selectTrade?: (id: number | string | null) => void;
}) {
  const selectTrade = overrides.selectTrade ?? vi.fn();
  mockUseWorkbenchReport.mockReturnValue({
    runDetail: makeRunDetail(),
    instanceId: "instance_1",
    selectedTradeId: overrides.selectedTradeId ?? null,
    selectTrade,
  });
  mockUseWorkbenchChart.mockReturnValue({
    runTrades: overrides.runTrades,
    runMetrics: overrides.runMetrics === undefined ? makeMetrics() : overrides.runMetrics,
  });
  return { selectTrade };
}

describe("ReportsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders summary cards from runMetrics", () => {
    mockWorkbench({ runTrades: [tradeLong, tradeShort] });
    render(<ReportsPanel />);
    expect(screen.getByText("Net PnL")).toBeTruthy();
    expect(screen.getByText("100.00")).toBeTruthy();
    expect(screen.getByText("Trades")).toBeTruthy();
    expect(screen.getByTestId("filter-direction")).toBeTruthy();
  });

  it("shows em dash fallback when runMetrics is null", () => {
    mockWorkbench({ runTrades: [tradeLong], runMetrics: null });
    render(<ReportsPanel />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("filters trades by long side", () => {
    mockWorkbench({ runTrades: [tradeLong, tradeShort] });
    render(<ReportsPanel />);
    fireEvent.click(
      within(screen.getByTestId("filter-direction")).getByRole("button", { name: "long" }),
    );
    const tradeTable = document.querySelector(".trade-table");
    const rows = within(tradeTable as HTMLElement).getAllByRole("row").slice(1);
    expect(rows.length).toBe(1);
    for (const row of rows) {
      expect(within(row).getByText("long")).toBeTruthy();
    }
  });

  it("filtered row click calls selectTrade with trade id", () => {
    const { selectTrade } = mockWorkbench({ runTrades: [tradeLong, tradeShort] });
    render(<ReportsPanel />);
    const tradeTable = document.querySelector(".trade-table");
    const row = within(tradeTable as HTMLElement).getByText("signal:rsi_exit_base").closest("tr");
    expect(row).toBeTruthy();
    fireEvent.click(row!);
    expect(selectTrade).toHaveBeenCalledWith("1");
  });

  it("shows trade detail for selected trade", () => {
    mockWorkbench({ runTrades: [tradeLong, tradeShort], selectedTradeId: "2" });
    render(<ReportsPanel />);
    expect(screen.getByText("Trade #2")).toBeTruthy();
    expect(screen.getByText("Path diagnostics")).toBeTruthy();
  });

  it("diagnostics columns toggle shows enriched cells", () => {
    mockWorkbench({ runTrades: [tradeLong, tradeShort] });
    render(<ReportsPanel />);
    fireEvent.click(screen.getByLabelText("Show diagnostics columns"));
    expect(screen.getAllByText("stop_loss").length).toBeGreaterThan(0);
  });
});
