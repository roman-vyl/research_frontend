import type { TradeRecord } from "@/api/types";

export function tradeDirectionLabel(side: TradeRecord["side"]): string {
  return side === "long" ? "LONG" : "SHORT";
}

export function TradeDirectionChip({ side }: { side: TradeRecord["side"] }) {
  const chipClass =
    side === "long"
      ? "chart-legend__chip chart-legend__chip--long"
      : "chart-legend__chip chart-legend__chip--short";

  return (
    <span className={chipClass} data-testid="trade-direction-chip">
      {tradeDirectionLabel(side)}
    </span>
  );
}
