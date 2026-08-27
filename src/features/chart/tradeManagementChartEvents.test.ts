import { describe, expect, it } from "vitest";

import type { ManagedPolicyEvent, TradeRecord } from "@/api/types";
import {
  buildComponentEventChartMarkers,
  buildComponentEventsForView,
} from "@/features/chart/chartComponentEvents";
import type { ComponentEvent } from "@/api/types";
import {
  buildManagedPolicyEventChartMarkers,
  buildManagedPolicyEventsForView,
  filterManagedPolicyEventsForView,
  hasManagedPolicyEvents,
  phaseTransitionMarkerLabel,
  managedPolicyEventTooltip,
} from "@/features/chart/tradeManagementChartEvents";
import { makeTradeRecord } from "@/features/chart/testFixtures/tradeRecordFixtures";

function samplePhaseEvent(overrides: Partial<ManagedPolicyEvent> = {}): ManagedPolicyEvent {
  return {
    position_id: "position-2",
    side: "long",
    time_ms: 1714561400000,
    bar_index: 10,
    event_type: "phase_changed",
    from_phase: "initial_risk",
    to_phase: "runner",
    rule_id: "to_runner_at_2_5atr",
    component_id: null,
    price: null,
    metadata: {},
    ...overrides,
  };
}

function sampleStopEvent(overrides: Partial<ManagedPolicyEvent> = {}): ManagedPolicyEvent {
  return {
    position_id: "position-2",
    side: "long",
    time_ms: 1714570400000,
    bar_index: 20,
    event_type: "active_stop_updated",
    from_phase: null,
    to_phase: null,
    rule_id: "exit",
    component_id: "break_even_stop",
    price: "100",
    metadata: { exit_reason: "signal:exit" },
    ...overrides,
  };
}

const viewCandles = [{ time: 1714561200 }, { time: 1714570800 }];

function minimalTrade(positionId: string): TradeRecord {
  return makeTradeRecord({
    trade_id: `trade:${positionId}:1`,
    position_id: positionId,
    entry_time_ms: 1_000,
    exit_time_ms: 2_000,
    exit_reason: "signal:test",
  });
}

describe("hasManagedPolicyEvents", () => {
  it("returns false for missing events", () => {
    expect(hasManagedPolicyEvents(undefined)).toBe(false);
    expect(hasManagedPolicyEvents(null)).toBe(false);
    expect(hasManagedPolicyEvents([])).toBe(false);
  });
});

describe("buildManagedPolicyEventChartMarkers", () => {
  it("maps phase_changed to phase marker label", () => {
    const markers = buildManagedPolicyEventChartMarkers([samplePhaseEvent()], {
      showPhases: true,
      showExits: false,
      selectedPositionId: null,
    });
    expect(markers).toHaveLength(1);
    expect(markers[0]?.text).toBe("Runner");
  });

  it("maps managed layer events to markers when exits toggle is on", () => {
    const events = [
      sampleStopEvent({ event_type: "active_stop_updated", component_id: "break_even_stop" }),
      sampleStopEvent({ event_type: "runtime_exit_triggered", component_id: "rsi_signal_exit" }),
    ];
    const markers = buildManagedPolicyEventChartMarkers(events, {
      showPhases: false,
      showExits: true,
      selectedPositionId: null,
    });
    expect(markers).toHaveLength(2);
    expect(markers.map((m) => m.text)).toEqual(["Stop↑", "Runtime"]);
  });

  it("uses sequential display number in highlighted marker text", () => {
    const markers = buildManagedPolicyEventChartMarkers(
      [sampleStopEvent({ position_id: "position-long-1" })],
      {
        showPhases: false,
        showExits: true,
        selectedPositionId: "position-long-1",
        trades: [minimalTrade("position-long-1")],
      },
    );
    expect(markers[0]?.text).toBe("M#1");
  });

  it("toggle OFF hides trade-management markers", () => {
    const events = [samplePhaseEvent(), sampleStopEvent()];
    expect(
      buildManagedPolicyEventChartMarkers(events, {
        showPhases: false,
        showExits: false,
        selectedPositionId: null,
      }),
    ).toHaveLength(0);
    expect(
      buildManagedPolicyEventChartMarkers(events, {
        showPhases: true,
        showExits: false,
        selectedPositionId: null,
      }),
    ).toHaveLength(1);
    expect(
      buildManagedPolicyEventChartMarkers(events, {
        showPhases: false,
        showExits: true,
        selectedPositionId: null,
      }),
    ).toHaveLength(1);
  });

  it("selected trade filters events by position_id", () => {
    const events = [
      samplePhaseEvent({ position_id: "position-1", to_phase: "proven" }),
      samplePhaseEvent({ position_id: "position-2", to_phase: "runner" }),
    ];
    const filtered = filterManagedPolicyEventsForView(events, {
      selectedPositionId: "position-2",
      fromSec: viewCandles[0]!.time,
      toSec: viewCandles[1]!.time,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.position_id).toBe("position-2");

    const markers = buildManagedPolicyEventsForView(events, {
      showPhases: true,
      showExits: false,
      selectedPositionId: "position-2",
      viewCandles,
      trades: [minimalTrade("position-1"), minimalTrade("position-2")],
    });
    expect(markers).toHaveLength(1);
    expect(markers[0]?.text).toBe("Runner#2");
  });

  it("missing optional event fields do not crash", () => {
    const sparse = samplePhaseEvent({
      rule_id: null,
      to_phase: null,
    });
    expect(() =>
      buildManagedPolicyEventChartMarkers([sparse], {
        showPhases: true,
        showExits: false,
        selectedPositionId: null,
      }),
    ).not.toThrow();
    expect(managedPolicyEventTooltip(sparse)).toContain("position_id: position-2");
  });

  it("skips events without time_ms", () => {
    const markers = buildManagedPolicyEventChartMarkers(
      [samplePhaseEvent({ time_ms: null as unknown as number })],
      { showPhases: true, showExits: false, selectedPositionId: null },
    );
    expect(markers).toHaveLength(0);
  });
});

describe("phaseTransitionMarkerLabel", () => {
  it("renders initial_risk/proven/protected/runner labels when present", () => {
    expect(phaseTransitionMarkerLabel("proven")).toBe("Proven");
    expect(phaseTransitionMarkerLabel("protected")).toBe("Protected");
    expect(phaseTransitionMarkerLabel("runner")).toBe("Runner");
    expect(phaseTransitionMarkerLabel("exhaustion")).toBe("Exhaust");
  });
});

describe("managedPolicyEventTooltip", () => {
  it("includes available exit fields only", () => {
    const trade = makeTradeRecord({
      trade_id: "trade:position-2:1",
      position_id: "position-2",
      exit_reason: "signal:exit",
      exit_kind: "signal",
      exit_layer: "signal",
    });
    const event = sampleStopEvent({ event_type: "runtime_exit_triggered", component_id: "signal_exit" });
    const tooltip = managedPolicyEventTooltip(event, trade);
    expect(tooltip).toContain("exit_layer: signal");
    expect(tooltip).toContain("component_id: signal_exit");
  });
});

describe("component events unchanged", () => {
  const componentEvent: ComponentEvent = {
    time: 1714561400,
    event_type: "point",
    role: "exit_signal",
    side: "long",
    component_id: "rsi_exit",
    instance_id: "exit_1",
    label: "ExitSig",
    metadata: {},
  };

  it("existing component_events markers still render unchanged", () => {
    const before = buildComponentEventChartMarkers([componentEvent], {
      showEntryBlock: false,
      showExitSignal: true,
      showSetup: false,
    });
    const after = buildComponentEventsForView([componentEvent], {
      showEntryBlock: false,
      showExitSignal: true,
      showSetup: false,
      viewCandles: [{ time: 1714561200 }, { time: 1714561500 }],
    });
    expect(before[0]?.text).toBe("ExitSig");
    expect(after[0]?.text).toBe("ExitSig");
  });
});
