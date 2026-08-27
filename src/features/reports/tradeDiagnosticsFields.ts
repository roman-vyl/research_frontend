import type { TradeRecord } from "@/api/types";
import { EM_DASH, formatMoney, formatReturnPct } from "@/features/reports/formatDiagnostics";

export { EM_DASH, formatMoney, formatReturnPct };

export function formatMs(ms: number | null): string {
  if (ms === null) return EM_DASH;
  return new Date(ms).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

export function formatPrice(
  value: number | null | undefined,
  fractionDigits = 8,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  const fixed = value.toFixed(fractionDigits);
  if (!fixed.includes(".")) return fixed;
  return fixed.replace(/\.?0+$/, "");
}

export function formatNum(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return value.toFixed(digits);
}

export type TradeDiagnosticField = {
  key: string;
  label: string;
  value: string;
  hint?: string;
};

function field(key: string, label: string, value: string, hint?: string): TradeDiagnosticField {
  return hint ? { key, label, value, hint } : { key, label, value };
}

/**
 * Core rows for Reports/Chart trade detail panels — canonical TradeRecord
 * fields only. The old monolith's richer per-trade diagnostics (entry
 * profile, break-even, context-consumption attribution, setup diagnostics,
 * quality flags, managed trade-management block) have no equivalent on the
 * canonical Research Service TradeRecord and are not reconstructed here.
 */
export function buildTradeDiagnosticFields(trade: TradeRecord): {
  core: TradeDiagnosticField[];
  diagnostics: TradeDiagnosticField[];
} {
  const core: TradeDiagnosticField[] = [
    field("trade_id", "trade_id", trade.trade_id),
    field("position_id", "position_id", trade.position_id),
    field("entry_price", "entry_price", formatPrice(Number(trade.entry_price))),
    field("exit_price", "exit_price", formatPrice(Number(trade.exit_price), 1)),
    field("net_pnl", "net_pnl", formatMoney(Number(trade.net_pnl))),
    field("net_return_pct", "net_return_pct", formatReturnPct(Number(trade.net_return_pct))),
    field("exit_reason", "exit_reason", trade.exit_reason),
    field("exit_layer", "exit_layer", trade.exit_layer),
    field("exit_kind", "exit_kind", trade.exit_kind ?? EM_DASH),
    field("entry_time_ms", "entry_time_ms", formatMs(trade.entry_time_ms)),
    field("exit_time_ms", "exit_time_ms", formatMs(trade.exit_time_ms)),
    field("hold_bars", "hold_bars", String(trade.hold_bars)),
  ];

  const diagnostics: TradeDiagnosticField[] = [
    field("path.mfe_pct", "mfe_pct", formatReturnPct(Number(trade.path.mfe_pct))),
    field("path.mae_pct", "mae_pct", formatReturnPct(Number(trade.path.mae_pct))),
    field(
      "path.capture_ratio",
      "capture_ratio",
      trade.path.capture_ratio === null ? EM_DASH : formatReturnPct(Number(trade.path.capture_ratio)),
    ),
    field(
      "path.giveback_pct",
      "giveback_pct",
      trade.path.giveback_pct === null ? EM_DASH : formatReturnPct(Number(trade.path.giveback_pct)),
    ),
  ];

  return { core, diagnostics };
}
