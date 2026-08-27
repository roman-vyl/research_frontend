import { describe, expect, it } from "vitest";

import type { TradeRecord } from "@/api/types";
import { attachEmaAvailabilityHints } from "@/features/chart/exitEmaOverlayAvailability";
import { listActiveExitComponents, resolveExitKind } from "@/features/chart/exitPolicyForTrade";
import { makeTradeRecord } from "@/features/chart/testFixtures/tradeRecordFixtures";

const baseTrade: TradeRecord = makeTradeRecord({
  trade_id: "trade:position-1:1",
  entry_time_ms: 1,
  exit_time_ms: 2,
  entry_price: "100",
  exit_price: "101",
  exit_reason: "signal:rsi_exit_base",
  net_pnl: "1",
  exit_kind: "signal",
  exit_component_id: "rsi_signal_exit",
});

const exitPolicy = {
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
    aligned: {
      exits: [
        {
          instance_id: "rsi_exit_base",
          component_id: "rsi_signal_exit",
          exit_kind: "signal",
          ema: 21,
          confirm_bars: 2,
        },
      ],
    },
    countertrend: { exits: [] },
    neutral: { exits: [] },
  },
};

const v4EmaExitPolicy = {
  always_on: {
    exits: [
      {
        instance_id: "ema_close_loss",
        component_id: "ema_close_loss_exit",
        exit_kind: "signal",
        ema: { source: "close", timeframe: "base", period: 500 },
        confirm_bars: 10,
      },
      {
        instance_id: "ema_cross_loss",
        component_id: "ema_cross_loss_exit",
        exit_kind: "signal",
        fast_ema: { source: "close", timeframe: "base", period: 200 },
        slow_ema: { source: "close", timeframe: "base", period: 21 },
      },
    ],
  },
  profiles: {
    aligned: { exits: [] },
    countertrend: { exits: [] },
    neutral: { exits: [] },
  },
};

describe("resolveExitKind", () => {
  it("prefers rule.exit_kind over component_id heuristic", () => {
    const kind = resolveExitKind(
      { component_id: "atr_stop_loss", exit_kind: "signal" },
      baseTrade,
      false,
    );
    expect(kind).toBe("signal");
  });

  it("uses trade.exit_kind only for closing row", () => {
    const rule = { component_id: "atr_stop_loss" };
    expect(resolveExitKind(rule, baseTrade, true)).toBe("signal");
    expect(resolveExitKind(rule, baseTrade, false)).toBe("stop_loss");
  });
});

describe("listActiveExitComponents", () => {
  // Canonical TradeRecord does not track which exit-policy profile was active
  // for a trade (legacy active_exit_profile has no replacement) — only
  // always_on rows are ever listed, and the "profile exits omitted" warning
  // always fires when always_on rows exist.
  it("lists only always_on exits and marks the closing component", () => {
    const { rows, warning } = listActiveExitComponents(exitPolicy, baseTrade);
    expect(rows).toHaveLength(1);
    expect(rows[0].group).toBe("always_on");
    expect(warning).toContain("active_exit_profile missing");
  });

  it("marks the closing component via trade.exit_component_id", () => {
    const trade = makeTradeRecord({ ...baseTrade, exit_component_id: "atr_stop_loss" });
    const { rows } = listActiveExitComponents(exitPolicy, trade);
    const closing = rows.find((r) => r.isClosing);
    expect(closing?.instance_id).toBe("atr_sl");
  });

  it("parses ema_close_loss_exit object EMA params", () => {
    const { rows } = listActiveExitComponents(v4EmaExitPolicy, baseTrade);
    const emaClose = rows.find((r) => r.instance_id === "ema_close_loss");
    expect(emaClose?.parameters.ema).toBe("close/base/500");
    expect(emaClose?.parameters.confirm_bars).toBe("10");
    expect(emaClose?.emaPeriods).toEqual([500]);
  });

  it("parses ema_cross_loss_exit fast/slow EMA object params", () => {
    const { rows } = listActiveExitComponents(v4EmaExitPolicy, baseTrade);
    const cross = rows.find((r) => r.instance_id === "ema_cross_loss");
    expect(cross?.parameters.fast_ema).toBe("close/base/200");
    expect(cross?.parameters.slow_ema).toBe("close/base/21");
    expect(cross?.emaPeriods).toEqual([200, 21]);
  });

  it("returns empty rows with no warning when exit_policy has no always_on exits", () => {
    const policy = {
      always_on: { exits: [] },
      profiles: { aligned: { exits: [] }, countertrend: { exits: [] }, neutral: { exits: [] } },
    };
    const { rows, warning } = listActiveExitComponents(policy, baseTrade);
    expect(rows).toHaveLength(0);
    expect(warning).toBeNull();
  });
});

describe("EMA availability with object params", () => {
  const anchorStack = { fast: 200, anchor: 500, slow: 1000 };

  it("anchor period 500 shows anchor_stack hint for ema_close_loss", () => {
    const { rows } = listActiveExitComponents(v4EmaExitPolicy, baseTrade);
    const withHints = attachEmaAvailabilityHints(rows, anchorStack, []);
    const emaClose = withHints.find((r) => r.instance_id === "ema_close_loss");
    expect(emaClose?.emaAvailabilityHint).toContain("anchor stack EMA anchor");
  });

  it("non-anchor EMA period shows unavailable hint", () => {
    const { rows } = listActiveExitComponents(v4EmaExitPolicy, baseTrade);
    const withHints = attachEmaAvailabilityHints(rows, anchorStack, []);
    const cross = withHints.find((r) => r.instance_id === "ema_cross_loss");
    expect(cross?.emaAvailabilityHint).toContain("unavailable");
    expect(cross?.emaAvailabilityHint).toContain("21");
  });
});
