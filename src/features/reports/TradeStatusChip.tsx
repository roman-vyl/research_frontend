import type { TradeRecord } from "@/api/types";

// Canonical TradeRecord (GET /runs/{run_id}/trades) only ever carries
// realised (closed) trades — the open position is a separate, unrelated
// concept (RunMetrics.open_position_count) with no per-trade record today.
export function tradeStatusLabel(_status: TradeRecord["status"]): string {
  return "CLOSED";
}

export function TradeStatusChip({ status }: { status: TradeRecord["status"] }) {
  return (
    <span
      className="chart-legend__chip chart-legend__chip--closed"
      data-testid="trade-status-chip"
    >
      {tradeStatusLabel(status)}
    </span>
  );
}
