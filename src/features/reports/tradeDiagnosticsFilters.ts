import type { TradeRecord } from "@/api/types";
import {
  matchesExitReasonFilter,
  type ExitReasonFilterId,
} from "@/features/reports/exitReasonFilters";

export type DirectionFilterId = "all" | "long" | "short";
export type OutcomeFilterId = "all" | "winners" | "losers";

/**
 * Canonical TradeRecord fields only. The old monolith's HTF entry-profile,
 * entry-context-state, exit-group, and quality-flag filters have no
 * equivalent on the canonical Research Service TradeRecord and are not
 * reconstructed here.
 */
export type TradeDiagnosticsFilterState = {
  direction: DirectionFilterId;
  exitKind: string;
  exitReason: ExitReasonFilterId;
  outcome: OutcomeFilterId;
};

export const DEFAULT_TRADE_DIAGNOSTICS_FILTERS: TradeDiagnosticsFilterState = {
  direction: "all",
  exitKind: "all",
  exitReason: "all",
  outcome: "all",
};

export const DIRECTION_FILTER_OPTIONS = [
  { id: "all" as const, label: "All" },
  { id: "long" as const, label: "long" },
  { id: "short" as const, label: "short" },
];

export const OUTCOME_FILTER_OPTIONS = [
  { id: "all" as const, label: "All" },
  { id: "winners" as const, label: "Winners" },
  { id: "losers" as const, label: "Losers" },
];

export function distinctExitKinds(trades: readonly TradeRecord[]): string[] {
  const kinds = new Set<string>();
  for (const trade of trades) {
    if (trade.exit_kind) kinds.add(trade.exit_kind);
  }
  return [...kinds].sort();
}

export function matchesTradeDiagnosticsFilters(
  trade: TradeRecord,
  filters: TradeDiagnosticsFilterState,
): boolean {
  if (!matchesExitReasonFilter(trade.exit_reason, filters.exitReason)) return false;

  if (filters.direction !== "all") {
    if (trade.side !== filters.direction) return false;
  }

  if (filters.exitKind !== "all") {
    if (trade.exit_kind !== filters.exitKind) return false;
  }

  const netPnl = Number(trade.net_pnl);
  if (filters.outcome === "winners") {
    if (Number.isNaN(netPnl) || netPnl <= 0) return false;
  } else if (filters.outcome === "losers") {
    if (Number.isNaN(netPnl) || netPnl >= 0) return false;
  }

  return true;
}

export function filterTrades(
  trades: readonly TradeRecord[],
  filters: TradeDiagnosticsFilterState,
): TradeRecord[] {
  return trades.filter((trade) => matchesTradeDiagnosticsFilters(trade, filters));
}
