import type { ClosedTrade } from "@/api/journal";

/** The real Demo trade of 2026-10-25 (BTC short closed by its stop) as journal_service stores it. */
export const REAL_SHORT: ClosedTrade = {
  strategy_instance_id: "ema_pullback:6072511fa9c4",
  trade_cycle_id: "6072511f-cycle",
  symbol: "BTCUSDT",
  side: "short",
  close_reason: "stop_loss",
  close_event_id: "evt-close-1",
  closing_order_id: "97c748dd",
  status: "complete",
  opened_at_ms: 1792939843422,
  entry_avg_price: "80496.1",
  entry_qty: "3.818",
  entry_notional_usdt: "307334.1098",
  entry_fill_count: 1,
  entry_fee_usdt: "169.03376039",
  closed_at_ms: 1792940451013,
  exit_avg_price: "80750",
  exit_qty: "3.818",
  exit_fill_count: 1,
  exit_fee_usdt: "169.566925",
  duration_ms: 607591,
  planned_entry_price: "80484",
  planned_initial_stop: "80744.7",
  planned_initial_take: "79571.3",
  last_stop: "80744.7",
  last_take: "79571.3",
  gross_pnl_usdt: "-969.3902",
  fees_usdt: "338.60068539",
  net_pnl_usdt: "-1307.99088539",
  price_return_pct: "-0.3154190078774002715659516",
  net_return_pct: "-0.4255924883317328417153129158",
  risk_usdt: "949.1548",
  r_multiple: "-1.378058526888426371624853069",
  entry_slippage_pct: "-0.01503404403359673972466577208",
  exit_slippage_pct: "0.006563898311591968265409370522",
  created_at_ms: 1792940460000,
  completed_at_ms: 1792940460000,
  attempts: 1,
  last_attempt_at_ms: 1792940460000,
  last_error: null,
};

const DAY = 86_400_000;

/** A complete trade with the given net, closed `dayOffset` days after the real short. */
export function trade(id: string, net: number, extra: Partial<ClosedTrade> = {}, dayOffset = 0): ClosedTrade {
  return {
    ...REAL_SHORT,
    trade_cycle_id: id,
    close_event_id: `evt-${id}`,
    closed_at_ms: (REAL_SHORT.closed_at_ms ?? 0) + dayOffset * DAY,
    opened_at_ms: (REAL_SHORT.opened_at_ms ?? 0) + dayOffset * DAY,
    net_pnl_usdt: String(net),
    gross_pnl_usdt: String(net + 10),
    fees_usdt: "10",
    r_multiple: String(net / 100),
    duration_ms: 600_000,
    ...extra,
  };
}

/** A row still waiting for ABI: detection and retry fields only. */
export function waiting(id: string, attempts: number, lastError: string | null): ClosedTrade {
  const nulls = Object.fromEntries(Object.keys(REAL_SHORT).map((k) => [k, null])) as unknown as ClosedTrade;
  return {
    ...nulls,
    strategy_instance_id: REAL_SHORT.strategy_instance_id,
    trade_cycle_id: id,
    close_reason: "take_profit",
    close_event_id: `evt-${id}`,
    closing_order_id: "o",
    status: "incomplete",
    created_at_ms: 1792950000000,
    attempts,
    last_attempt_at_ms: 1792950060000,
    last_error: lastError,
  };
}
