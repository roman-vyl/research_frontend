import { describe, expect, it } from "vitest";

import type { ExecutionEvent, ManagedPolicyEvent } from "@/api/types";
import { makeTradeRecord } from "@/features/chart/testFixtures/tradeRecordFixtures";
import {
  buildTradeManagementLevelSegments,
  groupTradeManagementLevelCurves,
  managedEventEffectiveTimeMs,
} from "@/features/chart/tradeManagementLevelCurves";

const trade = makeTradeRecord({
  position_id: "position-1",
  entry_bar_index: 10,
  exit_bar_index: 15,
  entry_time_ms: 1_000_000,
  exit_time_ms: 2_500_000,
});

const entryEvent: ExecutionEvent = {
  event_id: "entry-1",
  event_type: "entry_filled",
  instance_id: "instance-1",
  position_id: "position-1",
  side: "long",
  bar_index: 10,
  time_ms: 1_000_000,
  fill_id: "fill-1",
  metadata: { stop_loss_price: "90", take_profit_price: "120" },
};

function update(overrides: Partial<ManagedPolicyEvent>): ManagedPolicyEvent {
  return {
    position_id: "position-1",
    side: "long",
    time_ms: 1_600_000,
    bar_index: 12,
    event_type: "active_stop_updated",
    rule_id: "managed",
    component_id: "managed",
    from_phase: null,
    to_phase: null,
    price: "100",
    metadata: { effective_from_bar: 13 },
    ...overrides,
  };
}

const candles = [
  { time: 1_000, open: 100, high: 101, low: 99, close: 100 },
  { time: 1_300, open: 100, high: 101, low: 99, close: 100 },
  { time: 1_600, open: 100, high: 101, low: 99, close: 100 },
  { time: 1_900, open: 100, high: 101, low: 99, close: 100 },
  { time: 2_200, open: 100, high: 101, low: 99, close: 100 },
  { time: 2_500, open: 100, high: 101, low: 99, close: 100 },
];

describe("buildTradeManagementLevelSegments", () => {
  it("draws initial levels and applies a stop update on its effective bar", () => {
    expect(
      buildTradeManagementLevelSegments({
        trade,
        executionEvents: [entryEvent],
        managedPolicyEvents: [update({})],
        candles,
        chartTimeframe: "5m",
      }),
    ).toEqual([
      { kind: "stop", fromTimeSec: 1000, toTimeSec: 1900, price: 90 },
      { kind: "take", fromTimeSec: 1000, toTimeSec: 2500, price: 120 },
      { kind: "stop", fromTimeSec: 1900, toTimeSec: 2500, price: 100 },
    ]);
  });

  it("ends a take line when disabled and starts a new segment when restored", () => {
    const events = [
      update({
        event_type: "active_take_updated",
        price: null,
        metadata: { take_profile: "disable_initial_tp", effective_from_bar: 13 },
      }),
      update({
        time_ms: 1_900_000,
        bar_index: 13,
        event_type: "active_take_updated",
        price: null,
        metadata: { take_profile: "initial", effective_from_bar: 14 },
      }),
    ];
    expect(
      buildTradeManagementLevelSegments({
        trade,
        executionEvents: [entryEvent],
        managedPolicyEvents: events,
        candles,
        chartTimeframe: "5m",
      }).filter((segment) => segment.kind === "take"),
    ).toEqual([
      { kind: "take", fromTimeSec: 1000, toTimeSec: 1900, price: 120 },
      { kind: "take", fromTimeSec: 2200, toTimeSec: 2500, price: 120 },
    ]);
  });

  it("uses a persisted take price without evaluating the rule that produced it", () => {
    const segments = buildTradeManagementLevelSegments({
      trade,
      executionEvents: [entryEvent],
      managedPolicyEvents: [
        update({ event_type: "active_take_updated", price: "130" }),
      ],
      candles,
      chartTimeframe: "5m",
    }).filter((segment) => segment.kind === "take");
    expect(segments).toEqual([
      { kind: "take", fromTimeSec: 1000, toTimeSec: 1900, price: 120 },
      { kind: "take", fromTimeSec: 1900, toTimeSec: 2500, price: 130 },
    ]);
  });

  it("does not invent levels when the entry fact is unavailable", () => {
    expect(
      buildTradeManagementLevelSegments({
        trade,
        executionEvents: [],
        managedPolicyEvents: [update({})],
        candles,
        chartTimeframe: "5m",
      }),
    ).toEqual([]);
  });
});

describe("managedEventEffectiveTimeMs", () => {
  it("prefers an explicit effective time and otherwise uses the next loaded candle", () => {
    expect(
      managedEventEffectiveTimeMs(
        update({ metadata: { effective_from_time_ms: 2_050_000 } }),
        candles,
        "5m",
      ),
    ).toBe(2_050_000);
    expect(managedEventEffectiveTimeMs(update({}), candles, "5m")).toBe(1_900_000);
  });
});

describe("groupTradeManagementLevelCurves", () => {
  it("joins adjacent changes as steps but keeps disabled intervals as gaps", () => {
    expect(
      groupTradeManagementLevelCurves([
        { kind: "stop", fromTimeSec: 1, toTimeSec: 2, price: 90 },
        { kind: "stop", fromTimeSec: 2, toTimeSec: 4, price: 100 },
        { kind: "take", fromTimeSec: 1, toTimeSec: 2, price: 120 },
        { kind: "take", fromTimeSec: 3, toTimeSec: 4, price: 120 },
      ]),
    ).toEqual([
      {
        kind: "stop",
        points: [
          { timeSec: 1, price: 90 },
          { timeSec: 2, price: 100 },
          { timeSec: 4, price: 100 },
        ],
      },
      {
        kind: "take",
        points: [
          { timeSec: 1, price: 120 },
          { timeSec: 2, price: 120 },
        ],
      },
      {
        kind: "take",
        points: [
          { timeSec: 3, price: 120 },
          { timeSec: 4, price: 120 },
        ],
      },
    ]);
  });
});
