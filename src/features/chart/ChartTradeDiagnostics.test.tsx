/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChartTradeDiagnostics } from "@/features/chart/ChartTradeDiagnostics";
import { makeTradeRecord } from "@/features/chart/testFixtures/tradeRecordFixtures";

afterEach(() => cleanup());

const trade = makeTradeRecord({
  trade_id: "2",
  position_id: "position-2",
  side: "long",
  entry_time_ms: 1714561400000,
  exit_time_ms: 1714565400000,
  entry_price: "62800",
  exit_price: "63100",
  quantity: "0.15",
  net_pnl: "100",
  net_return_pct: "0.03",
  gross_pnl: "105",
  fees_paid: "5",
  exit_reason: "signal:rsi_exit_base",
  exit_kind: "signal",
  exit_component_id: "rsi_signal_exit",
});

const strategySpec = {
  anchor_stack: {
    fast: { period: 200 },
    anchor: { period: 500 },
    slow: { period: 1000 },
  },
  trade_management: {
    exit_policy: {
      always_on: {
        exits: [
          {
            instance_id: "atr_sl",
            component_id: "atr_stop_loss",
            exit_kind: "stop_loss",
            distance: { timeframe: "5m", period: 14, multiplier: 2 },
          },
        ],
      },
      profiles: {
        aligned: { exits: [] },
        countertrend: { exits: [] },
        neutral: { exits: [] },
      },
    },
  },
};

describe("ChartTradeDiagnostics", () => {
  it("renders core trade fields", () => {
    render(
      <ChartTradeDiagnostics
        trade={trade}
        selectedTradeId="2"
        strategySpec={strategySpec}
        chartEmaOverlays={[]}
        focusWarning={null}
      />,
    );
    expect(screen.getByTestId("chart-trade-diagnostics")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Trade #2" })).toBeTruthy();
    expect(screen.getByTestId("trade-status-chip").textContent).toBe("CLOSED");
    expect(screen.getByTestId("trade-direction-chip").textContent).toBe("LONG");
    const result = screen.getByTestId("chart-trade-result");
    expect(result.textContent).toContain("3.00%");
    expect(result.textContent).toContain("100.00");
    expect(result.className).toContain("pnl-positive");
    expect(screen.queryByText("trade_id")).toBeNull();
  });

  it("renders path diagnostics section from trade.path", () => {
    render(
      <ChartTradeDiagnostics
        trade={trade}
        selectedTradeId="2"
        strategySpec={strategySpec}
        chartEmaOverlays={[]}
        focusWarning={null}
      />,
    );
    expect(screen.getByText("Path diagnostics")).toBeTruthy();
  });

  it("colors loss result red", () => {
    render(
      <ChartTradeDiagnostics
        trade={{ ...trade, net_pnl: "-39.73", net_return_pct: "-0.0074" }}
        selectedTradeId="2"
        strategySpec={strategySpec}
        chartEmaOverlays={[]}
        focusWarning={null}
      />,
    );
    const result = screen.getByTestId("chart-trade-result");
    expect(result.className).toContain("pnl-negative");
    expect(result.textContent).toContain("-0.74%");
    expect(result.textContent).toContain("-39.73");
  });

  it("highlights closing exit component", () => {
    render(
      <ChartTradeDiagnostics
        trade={{ ...trade, exit_component_id: "atr_stop_loss" }}
        selectedTradeId="2"
        strategySpec={strategySpec}
        chartEmaOverlays={[]}
        focusWarning={null}
      />,
    );
    expect(screen.getByTestId("closing-exit-component")).toBeTruthy();
  });

  it("shows stale empty state when trade missing", () => {
    render(
      <ChartTradeDiagnostics
        trade={undefined}
        selectedTradeId={99}
        strategySpec={strategySpec}
        chartEmaOverlays={[]}
        focusWarning="Trade #99 not found in run trades."
      />,
    );
    expect(screen.getByTestId("chart-trade-diagnostics-stale")).toBeTruthy();
    expect(screen.queryByTestId("active-exit-components")).toBeNull();
  });
});
