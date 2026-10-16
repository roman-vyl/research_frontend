import type { CreatePriceLineOptions } from "lightweight-charts";

import type { TradeRecord } from "@/api/types";
import { classifyExitReason } from "@/features/chart/chartMarkers";

export type TradePriceLineKind = "entry";

export type TradePriceLineSpec = {
  kind: TradePriceLineKind;
  options: CreatePriceLineOptions;
};

function entryLineColor(side: TradeRecord["side"]): string {
  return side === "long" ? "#22c55e" : "#ef4444";
}

function exitLineColor(): string {
  return "#fbbf24";
}

export function buildEntryPriceLineTitle(trade: TradeRecord, displayNumber?: number): string {
  const label = displayNumber ?? trade.trade_id;
  return `Entry #${label}`;
}

export function buildExitPriceLineTitle(trade: TradeRecord, displayNumber?: number): string {
  const label = displayNumber ?? trade.trade_id;
  const kind = trade.exit_kind ?? classifyExitReason(trade.exit_reason);
  if (kind === "open" || kind === "unknown") {
    return `Exit #${label}`;
  }
  if (kind === "break_even") {
    return `Exit #${label} · break-even`;
  }
  return `Exit #${label} · ${kind}`;
}

export function buildTradePriceLineSpecs(trade: TradeRecord, displayNumber?: number): TradePriceLineSpec[] {
  const specs: TradePriceLineSpec[] = [];

  specs.push({
    kind: "entry",
    options: {
      price: Number(trade.entry_price),
      color: entryLineColor(trade.side),
      lineWidth: 2,
      lineStyle: 0,
      axisLabelVisible: true,
      title: buildEntryPriceLineTitle(trade, displayNumber),
    },
  });

  return specs;
}

export type TradeExitLineSegment = {
  fromTimeSec: number;
  toTimeSec: number;
  price: number;
  color: string;
  title: string;
};

/**
 * The exit level is drawn only over the trade's own lifetime (entry bar to
 * exit bar) instead of a full-width price line, so it never appears before
 * the entry. A same-bar trade is stretched to one chart bar to stay visible.
 */
export function buildTradeExitLineSegment(
  trade: TradeRecord,
  barMs: number,
  displayNumber?: number,
): TradeExitLineSegment | null {
  const price = Number(trade.exit_price);
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(trade.entry_time_ms) || !Number.isFinite(trade.exit_time_ms)) return null;
  const fromTimeSec = Math.floor(trade.entry_time_ms / 1000);
  let toTimeSec = Math.floor(trade.exit_time_ms / 1000);
  if (toTimeSec <= fromTimeSec) toTimeSec = fromTimeSec + Math.max(1, Math.floor(barMs / 1000));
  return {
    fromTimeSec,
    toTimeSec,
    price,
    color: exitLineColor(),
    title: buildExitPriceLineTitle(trade, displayNumber),
  };
}
