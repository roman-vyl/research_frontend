/**
 * Central Journal read API, reached through the dev-server proxy `/journal-api`:
 * `GET /v1/events` (every stored event of one strategy for a bar range, of every type since no
 * `event_type` is passed, all of them since no `limit` is passed), `GET /v1/strategy-instances` (evaluated bar range per strategy)
 * and `GET /v1/closed-trades` (every closed-trade row as stored, since no parameter is passed).
 */

export type JournalDesiredEntry = {
  side?: string;
  source_plan_bar_open_time_ms?: number;
  planned_entry_price?: unknown;
  initial_stop_price?: unknown;
  initial_take_price?: unknown;
  locked_exit_profile?: string;
};

export const LIVE_ENTRY_EVALUATED = "live_entry_evaluated";
export const ENTRY_PACKAGE_APPLIED = "entry_package_applied";
export const TRADE_CYCLE_OPENED = "trade_cycle_opened";
export const TRADE_CYCLE_CLOSED = "trade_cycle_closed";
export const OPEN_TRADE_EVALUATED = "open_trade_evaluated";
export const PROTECTION_APPLIED = "protection_applied";

export type JournalEvent = {
  event_id: string;
  event_type: string;
  occurred_at: string;
  bar_open_time_ms: number;
  /**
   * The stored Runtime line. `live_entry_evaluated`: `payload.desired_entry` is `null` or an object,
   * read by `runtimeProjection`. `entry_package_applied`: `payload.trigger_price`, `stop_loss` and
   * `take_profit` are decimal strings or `null`, read by `runtimeAppliedOrders`.
   * `trade_cycle_opened`: `payload.trade_cycle_id` and `average_entry_price` (decimal string);
   * `trade_cycle_closed`: `payload.trade_cycle_id` and `reason`; both read by `runtimeTradeCycles`.
   * `open_trade_evaluated`: `payload.desired_protection {stop_price, take_price|null}` (Engine's decimal
   * text), `close_signal.active` (boolean) and `trade_cycle_id` (only to split lines);
   * `protection_applied`: `payload.confirmed_protection.take_price`, `stop_order.trigger_price` and
   * `take_order.trigger_price`; both read by `runtimeOpenTrade`.
   */
  body: { payload?: Record<string, unknown> } & Record<string, unknown>;
};

/**
 * One `closed_trades` row as the journal stores it: decimals are strings, times UTC milliseconds.
 * An `incomplete` row has only the detection fields and the retry fields; every other value is `null`.
 */
export type ClosedTrade = {
  strategy_instance_id: string;
  trade_cycle_id: string;
  symbol: string | null;
  side: "long" | "short" | null;
  close_reason: string;
  close_event_id: string;
  closing_order_id: string;
  status: "complete" | "incomplete";
  opened_at_ms: number | null;
  entry_avg_price: string | null;
  entry_qty: string | null;
  entry_notional_usdt: string | null;
  entry_fill_count: number | null;
  entry_fee_usdt: string | null;
  closed_at_ms: number | null;
  exit_avg_price: string | null;
  exit_qty: string | null;
  exit_fill_count: number | null;
  exit_fee_usdt: string | null;
  duration_ms: number | null;
  planned_entry_price: string | null;
  planned_initial_stop: string | null;
  planned_initial_take: string | null;
  last_stop: string | null;
  last_take: string | null;
  gross_pnl_usdt: string | null;
  fees_usdt: string | null;
  net_pnl_usdt: string | null;
  price_return_pct: string | null;
  net_return_pct: string | null;
  risk_usdt: string | null;
  r_multiple: string | null;
  entry_slippage_pct: string | null;
  exit_slippage_pct: string | null;
  created_at_ms: number;
  completed_at_ms: number | null;
  attempts: number;
  last_attempt_at_ms: number | null;
  last_error: string | null;
};

export type JournalEventsAnswer = { events: JournalEvent[]; truncated: boolean };

export type JournalStrategyInstance = {
  strategy_instance_id: string;
  event_count: number;
  first_bar_open_time_ms: number;
  last_bar_open_time_ms: number;
  last_occurred_at: string;
};

export class JournalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JournalError";
  }
}

const JOURNAL_API_BASE = "/journal-api";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${JOURNAL_API_BASE}${path}`, { signal });
  } catch (err) {
    if (isAbort(err)) throw err;
    throw new JournalError("journal unreachable");
  }
  if (!res.ok) throw new JournalError(`journal answered ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new JournalError("journal answer is not JSON");
  }
}

export async function fetchJournalEvents(args: {
  strategyInstanceId: string;
  fromBarMs: number;
  toBarMs: number;
  signal?: AbortSignal;
}): Promise<JournalEventsAnswer> {
  const query = new URLSearchParams({
    strategy_instance_id: args.strategyInstanceId,
    from_bar_ms: String(args.fromBarMs),
    to_bar_ms: String(args.toBarMs),
  });
  const body = await getJson(`/v1/events?${query.toString()}`, args.signal);
  if (!isObject(body) || !Array.isArray(body.events) || typeof body.truncated !== "boolean") {
    throw new JournalError("unexpected events answer");
  }
  return { events: body.events as JournalEvent[], truncated: body.truncated };
}

export async function fetchJournalStrategyInstances(signal?: AbortSignal): Promise<JournalStrategyInstance[]> {
  const body = await getJson("/v1/strategy-instances", signal);
  if (!isObject(body) || !Array.isArray(body.strategy_instances)) {
    throw new JournalError("unexpected strategy-instances answer");
  }
  return body.strategy_instances as JournalStrategyInstance[];
}

function isClosedTrade(value: unknown): value is ClosedTrade {
  return (
    isObject(value) &&
    typeof value.strategy_instance_id === "string" &&
    typeof value.trade_cycle_id === "string" &&
    (value.status === "complete" || value.status === "incomplete") &&
    typeof value.close_reason === "string" &&
    typeof value.created_at_ms === "number" &&
    typeof value.attempts === "number"
  );
}

export async function fetchClosedTrades(signal?: AbortSignal): Promise<ClosedTrade[]> {
  const body = await getJson("/v1/closed-trades", signal);
  if (!isObject(body) || !Array.isArray(body.trades) || typeof body.truncated !== "boolean") {
    throw new JournalError("unexpected closed-trades answer");
  }
  if (!body.trades.every(isClosedTrade)) throw new JournalError("unexpected closed-trade row");
  return body.trades;
}
