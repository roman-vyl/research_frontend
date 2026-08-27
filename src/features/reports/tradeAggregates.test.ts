import { describe, expect, it } from "vitest";

import type { ManagedPolicyEvent } from "@/api/types";
import { makeTradeRecord } from "@/features/chart/testFixtures/tradeRecordFixtures";
import {
  buildExitLayerBreakdown,
  buildExitReasonBreakdown,
  buildFeeDiagnostics,
  buildPhaseReachedBreakdown,
  exitReasonAvgHoldBars,
  exitReasonAvgReturnPct,
  exitReasonWinRate,
} from "@/features/reports/tradeAggregates";

describe("buildExitReasonBreakdown", () => {
  it("groups trades by exit_reason and sums pnl/fees", () => {
    const trades = [
      makeTradeRecord({
        trade_id: "1",
        exit_reason: "signal:rsi_exit",
        net_pnl: "10",
        gross_pnl: "12",
        fees_paid: "2",
        net_return_pct: "0.01",
        hold_bars: 4,
      }),
      makeTradeRecord({
        trade_id: "2",
        exit_reason: "signal:rsi_exit",
        net_pnl: "-5",
        gross_pnl: "-4",
        fees_paid: "1",
        net_return_pct: "-0.005",
        hold_bars: 2,
      }),
      makeTradeRecord({
        trade_id: "3",
        exit_reason: "stop_loss:atr_sl",
        net_pnl: "20",
        gross_pnl: "22",
        fees_paid: "2",
        net_return_pct: "0.02",
        hold_bars: 6,
      }),
    ];

    const breakdown = buildExitReasonBreakdown(trades);
    expect(Object.keys(breakdown).sort()).toEqual(["signal:rsi_exit", "stop_loss:atr_sl"]);

    const rsiBucket = breakdown["signal:rsi_exit"]!;
    expect(rsiBucket.trades).toBe(2);
    expect(rsiBucket.wins).toBe(1);
    expect(rsiBucket.pnl).toBeCloseTo(5);
    expect(exitReasonWinRate(rsiBucket)).toBeCloseTo(0.5);
    expect(exitReasonAvgReturnPct(rsiBucket)).toBeCloseTo(0.0025);
    expect(exitReasonAvgHoldBars(rsiBucket)).toBe(3);
  });
});

describe("buildFeeDiagnostics", () => {
  it("sums fees and gross/net pnl, computes fees as pct of gross profit", () => {
    const trades = [
      makeTradeRecord({ trade_id: "1", gross_pnl: "100", net_pnl: "90", fees_paid: "10" }),
      makeTradeRecord({ trade_id: "2", gross_pnl: "-20", net_pnl: "-22", fees_paid: "2" }),
    ];
    const diagnostics = buildFeeDiagnostics(trades);
    expect(diagnostics.totalFeesPaid).toBe(12);
    expect(diagnostics.grossPnl).toBe(80);
    expect(diagnostics.netPnl).toBe(68);
    expect(diagnostics.feesAsPctOfGrossProfit).toBeCloseTo(12 / 100);
  });

  it("returns null feesAsPctOfGrossProfit when there is no gross profit", () => {
    const trades = [makeTradeRecord({ trade_id: "1", gross_pnl: "-10", net_pnl: "-12", fees_paid: "2" })];
    expect(buildFeeDiagnostics(trades).feesAsPctOfGrossProfit).toBeNull();
  });
});

describe("buildExitLayerBreakdown", () => {
  it("groups by exit_layer and counts wins", () => {
    const trades = [
      makeTradeRecord({ trade_id: "1", exit_layer: "static", net_pnl: "5" }),
      makeTradeRecord({ trade_id: "2", exit_layer: "static", net_pnl: "-5" }),
      makeTradeRecord({ trade_id: "3", exit_layer: "exit_management", net_pnl: "3" }),
    ];
    const breakdown = buildExitLayerBreakdown(trades);
    expect(breakdown.static).toEqual({ tradeCount: 2, pnl: 0, winCount: 1 });
    expect(breakdown.exit_management).toEqual({ tradeCount: 1, pnl: 3, winCount: 1 });
  });
});

describe("buildPhaseReachedBreakdown", () => {
  function phaseEvent(overrides: Partial<ManagedPolicyEvent>): ManagedPolicyEvent {
    return {
      position_id: "position-1",
      side: "long",
      time_ms: 0,
      bar_index: 0,
      event_type: "phase_changed",
      from_phase: null,
      to_phase: "proven",
      rule_id: null,
      component_id: null,
      price: null,
      metadata: {},
      ...overrides,
    };
  }

  it("takes the latest phase_changed per position by time_ms", () => {
    const events = [
      phaseEvent({ position_id: "position-1", time_ms: 1_000, to_phase: "proven" }),
      phaseEvent({ position_id: "position-1", time_ms: 2_000, to_phase: "runner" }),
      phaseEvent({ position_id: "position-2", time_ms: 500, to_phase: "protected" }),
    ];
    const breakdown = buildPhaseReachedBreakdown(events);
    expect(breakdown).toEqual({ runner: 1, protected: 1 });
  });

  it("ignores non phase_changed events and null to_phase", () => {
    const events = [
      phaseEvent({ event_type: "active_stop_updated", to_phase: null }),
      phaseEvent({ to_phase: null }),
    ];
    expect(buildPhaseReachedBreakdown(events)).toEqual({});
  });
});
