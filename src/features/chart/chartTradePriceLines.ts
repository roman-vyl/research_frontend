import type { CreatePriceLineOptions } from "lightweight-charts";

import type { TradeRecord } from "@/api/types";
import { classifyExitReason } from "@/features/chart/chartMarkers";

export type TradePriceLineKind = "entry" | "exit";

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

  specs.push({
    kind: "exit",
    options: {
      price: Number(trade.exit_price),
      color: exitLineColor(),
      lineWidth: 2,
      lineStyle: 2,
      axisLabelVisible: true,
      title: buildExitPriceLineTitle(trade, displayNumber),
    },
  });

  return specs;
}
