import type { ManagedPolicyEvent, TradeRecord } from "@/api/types";

/**
 * Client-side aggregates over canonical RunTrades/managed-policy-events —
 * the old monolith computed these breakdowns server-side on RunVariant, but
 * everything below is derivable from fields the canonical Research Service
 * already exposes per-trade/per-event, so it is recomputed here instead of
 * being dropped. Two things genuinely have no canonical source and are NOT
 * reconstructed anywhere in Reports: entry-profile grouping (canonical
 * TradeRecord carries no entry_profile/active_exit_profile field at all) and
 * baseline-vs-managed comparison (requires an unmanaged replay the backend
 * does not produce).
 */

export type ExitReasonBucket = {
  trades: number;
  wins: number;
  pnl: number;
  gross_pnl: number;
  fees_paid: number;
  return_pct_sum: number;
  hold_bars_sum: number;
};

export type ExitReasonBreakdown = Record<string, ExitReasonBucket>;

export function buildExitReasonBreakdown(trades: readonly TradeRecord[]): ExitReasonBreakdown {
  const breakdown: ExitReasonBreakdown = {};
  for (const trade of trades) {
    const key = trade.exit_reason;
    const bucket = (breakdown[key] ??= {
      trades: 0,
      wins: 0,
      pnl: 0,
      gross_pnl: 0,
      fees_paid: 0,
      return_pct_sum: 0,
      hold_bars_sum: 0,
    });
    const netPnl = Number(trade.net_pnl);
    bucket.trades += 1;
    if (netPnl > 0) bucket.wins += 1;
    bucket.pnl += netPnl;
    bucket.gross_pnl += Number(trade.gross_pnl);
    bucket.fees_paid += Number(trade.fees_paid);
    bucket.return_pct_sum += Number(trade.net_return_pct);
    bucket.hold_bars_sum += trade.hold_bars;
  }
  return breakdown;
}

export function exitReasonWinRate(bucket: ExitReasonBucket): number | null {
  return bucket.trades === 0 ? null : bucket.wins / bucket.trades;
}

export function exitReasonAvgReturnPct(bucket: ExitReasonBucket): number | null {
  return bucket.trades === 0 ? null : bucket.return_pct_sum / bucket.trades;
}

export function exitReasonAvgHoldBars(bucket: ExitReasonBucket): number | null {
  return bucket.trades === 0 ? null : bucket.hold_bars_sum / bucket.trades;
}

/**
 * Profit factor needs gross wins/losses split, which the flat bucket above
 * doesn't carry — approximate is intentionally omitted rather than guessed;
 * callers that need it should treat this as future work, not silently wrong.
 */

export type FeeDiagnostics = {
  totalFeesPaid: number;
  grossPnl: number;
  netPnl: number;
  feesAsPctOfGrossProfit: number | null;
};

export function buildFeeDiagnostics(trades: readonly TradeRecord[]): FeeDiagnostics {
  let totalFeesPaid = 0;
  let grossPnl = 0;
  let netPnl = 0;
  let grossProfit = 0;
  for (const trade of trades) {
    const gross = Number(trade.gross_pnl);
    totalFeesPaid += Number(trade.fees_paid);
    grossPnl += gross;
    netPnl += Number(trade.net_pnl);
    if (gross > 0) grossProfit += gross;
  }
  return {
    totalFeesPaid,
    grossPnl,
    netPnl,
    feesAsPctOfGrossProfit: grossProfit > 0 ? totalFeesPaid / grossProfit : null,
  };
}

export type ExitLayerBucket = {
  tradeCount: number;
  pnl: number;
  winCount: number;
};

export type ExitLayerBreakdown = Record<string, ExitLayerBucket>;

/** Groups by trade.exit_layer — the closest canonical equivalent of the old
 * per-managed-component breakdown (component_id is not always populated). */
export function buildExitLayerBreakdown(trades: readonly TradeRecord[]): ExitLayerBreakdown {
  const breakdown: ExitLayerBreakdown = {};
  for (const trade of trades) {
    const key = trade.exit_layer;
    const bucket = (breakdown[key] ??= { tradeCount: 0, pnl: 0, winCount: 0 });
    const netPnl = Number(trade.net_pnl);
    bucket.tradeCount += 1;
    bucket.pnl += netPnl;
    if (netPnl > 0) bucket.winCount += 1;
  }
  return breakdown;
}

export type PhaseReachedBreakdown = Record<string, number>;

/** Max phase reached per position, derived from phase_changed events'
 * to_phase — the canonical trace has no ordinal phase rank, so "max" here
 * means "last phase_changed event by time_ms" per position_id. */
export function buildPhaseReachedBreakdown(
  events: readonly ManagedPolicyEvent[],
): PhaseReachedBreakdown {
  const lastPhaseByPosition = new Map<string, { phase: string; timeMs: number }>();
  for (const event of events) {
    if (event.event_type !== "phase_changed" || !event.to_phase) continue;
    const existing = lastPhaseByPosition.get(event.position_id);
    if (!existing || event.time_ms >= existing.timeMs) {
      lastPhaseByPosition.set(event.position_id, { phase: event.to_phase, timeMs: event.time_ms });
    }
  }
  const breakdown: PhaseReachedBreakdown = {};
  for (const { phase } of lastPhaseByPosition.values()) {
    breakdown[phase] = (breakdown[phase] ?? 0) + 1;
  }
  return breakdown;
}
