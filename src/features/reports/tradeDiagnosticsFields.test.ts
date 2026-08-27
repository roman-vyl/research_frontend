import { describe, expect, it } from "vitest";

import { buildTradeDiagnosticFields, formatPrice } from "@/features/reports/tradeDiagnosticsFields";
import { makeTradeRecord } from "@/features/chart/testFixtures/tradeRecordFixtures";

describe("formatPrice", () => {
  it("rounds exit-style prices to one decimal", () => {
    expect(formatPrice(80392.42142857143, 1)).toBe("80392.4");
  });

  it("trims trailing zeros for whole prices", () => {
    expect(formatPrice(62800, 1)).toBe("62800");
  });
});

describe("buildTradeDiagnosticFields", () => {
  const baseTrade = makeTradeRecord({
    trade_id: "long:10",
    position_id: "long:10",
    side: "long",
    entry_time_ms: 1,
    exit_time_ms: 2,
    entry_price: "100",
    exit_price: "101",
    net_pnl: "1",
    net_return_pct: "0.01",
    exit_reason: "exit_management:be",
    exit_layer: "exit_management",
    exit_kind: "stop_loss",
    exit_component_id: "break_even_stop",
  });

  it("includes core canonical fields", () => {
    const { core } = buildTradeDiagnosticFields(baseTrade);
    const keys = core.map((f) => f.key);
    expect(keys).toContain("trade_id");
    expect(keys).toContain("position_id");
    expect(keys).toContain("net_pnl");
    expect(keys).toContain("exit_reason");
    expect(keys).toContain("exit_layer");
  });

  it("includes path diagnostics fields", () => {
    const { diagnostics } = buildTradeDiagnosticFields(baseTrade);
    const keys = diagnostics.map((f) => f.key);
    expect(keys).toContain("path.mfe_pct");
    expect(keys).toContain("path.mae_pct");
    expect(keys).toContain("path.capture_ratio");
    expect(keys).toContain("path.giveback_pct");
  });
});
