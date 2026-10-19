import { TRADE_CYCLE_CLOSED, TRADE_CYCLE_OPENED, type JournalEvent } from "@/api/journal";
import type { ChartBar } from "@/api/types";
import { price } from "@/features/runtime/runtimeProjection";

/** `null`: no readable applied record of the cycle, the side is unknown. */
export type CycleSide = "long" | "short" | null;

/** A fill: the arrow at `average_entry_price` on the bar of `trade_cycle_opened`. */
export type OpenMark = { time: number; price: number; side: CycleSide };

/** A close: a label on the candle of `trade_cycle_closed`, never at a price (the event has no exit price). */
export type CloseMark = { time: number; reason: string; side: CycleSide };

/** The bars of one open position: entry line, and the stop and take of the cycle's last applied order. */
export type PositionPeriod = { fromTime: number; toTime: number; entry: number; stop: number | null; take: number | null };

export type TradeCycles = {
  opens: OpenMark[];
  closes: CloseMark[];
  periods: PositionPeriod[];
  openedCount: number;
  closedCount: number;
  closedStopLoss: number;
  closedTakeProfit: number;
  closedOther: number;
  unreadableCount: number;
};

type CycleOrder = { side: CycleSide; stop: number | null; take: number | null };

function payloadOf(event: JournalEvent): Record<string, unknown> | null {
  const payload = event.body?.payload;
  return typeof payload === "object" && payload !== null ? payload : null;
}

function cycleIdOf(payload: Record<string, unknown> | null): string | null {
  const id = payload?.trade_cycle_id;
  return typeof id === "string" && id !== "" ? id : null;
}

/** Latest `occurred_at`, equal times resolved by the greater `event_id`. */
function later(a: JournalEvent, b: JournalEvent): JournalEvent {
  if (a.occurred_at !== b.occurred_at) return a.occurred_at > b.occurred_at ? a : b;
  return a.event_id >= b.event_id ? a : b;
}

/**
 * The cycle's last applied order. V1 frontend heuristic (owner's choice): no cycle event carries a
 * side yet, so a stop above the trigger is short and a stop below it is long; equal or unreadable
 * prices leave the side unknown. A later stage replaces it with an explicit Runtime `side`.
 */
function readCycleOrders(applied: readonly JournalEvent[]): Map<string, CycleOrder> {
  const last = new Map<string, JournalEvent>();
  for (const event of applied) {
    const id = cycleIdOf(payloadOf(event));
    if (id === null) continue;
    const prev = last.get(id);
    last.set(id, prev === undefined ? event : later(prev, event));
  }
  const out = new Map<string, CycleOrder>();
  for (const [id, event] of last) {
    const payload = payloadOf(event);
    const trigger = price(payload?.trigger_price);
    const stop = price(payload?.stop_loss);
    const take = price(payload?.take_profit);
    let side: CycleSide = null;
    if (trigger !== null && stop !== null && stop !== trigger) side = stop > trigger ? "short" : "long";
    out.set(id, { side, stop, take });
  }
  return out;
}

/**
 * Fills and closes of trade cycles on the bars of the candle window, from `trade_cycle_opened` and
 * `trade_cycle_closed`; `applied` (`entry_package_applied`) gives each cycle's side and protection.
 * Every cycle event counts on its own; events on bars outside the window are neither drawn nor counted.
 * A position period runs from its fill bar to the first close bar of the same cycle at or after it,
 * or to the last candle when the answer has no such close.
 */
export function buildTradeCycles(
  candles: readonly ChartBar[],
  cycleEvents: readonly JournalEvent[],
  applied: readonly JournalEvent[],
): TradeCycles {
  const out: TradeCycles = {
    opens: [],
    closes: [],
    periods: [],
    openedCount: 0,
    closedCount: 0,
    closedStopLoss: 0,
    closedTakeProfit: 0,
    closedOther: 0,
    unreadableCount: 0,
  };
  if (candles.length === 0) return out;
  const inWindow = new Set(candles.map((bar) => bar.time * 1000));
  const lastTime = candles[candles.length - 1]!.time;
  const orders = readCycleOrders(applied);
  const opened: { id: string; time: number; price: number }[] = [];
  const closeTimes = new Map<string, number[]>();

  for (const event of cycleEvents) {
    if (event.event_type !== TRADE_CYCLE_OPENED && event.event_type !== TRADE_CYCLE_CLOSED) continue;
    if (!inWindow.has(event.bar_open_time_ms)) continue;
    const time = event.bar_open_time_ms / 1000;
    const payload = payloadOf(event);
    const id = cycleIdOf(payload);
    if (event.event_type === TRADE_CYCLE_OPENED) {
      out.openedCount += 1;
      const fill = price(payload?.average_entry_price);
      if (id === null || fill === null) {
        out.unreadableCount += 1;
        continue;
      }
      opened.push({ id, time, price: fill });
      out.opens.push({ time, price: fill, side: orders.get(id)?.side ?? null });
    } else {
      out.closedCount += 1;
      const reason = payload?.reason;
      if (id === null || typeof reason !== "string" || reason === "") {
        out.unreadableCount += 1;
        continue;
      }
      if (reason === "stop_loss") out.closedStopLoss += 1;
      else if (reason === "take_profit") out.closedTakeProfit += 1;
      else out.closedOther += 1;
      out.closes.push({ time, reason, side: orders.get(id)?.side ?? null });
      const times = closeTimes.get(id);
      if (times === undefined) closeTimes.set(id, [time]);
      else times.push(time);
    }
  }

  for (const open of opened) {
    const closes = (closeTimes.get(open.id) ?? []).filter((t) => t >= open.time);
    const order = orders.get(open.id);
    out.periods.push({
      fromTime: open.time,
      toTime: closes.length > 0 ? Math.min(...closes) : lastTime,
      entry: open.price,
      stop: order?.stop ?? null,
      take: order?.take ?? null,
    });
  }
  out.opens.sort((a, b) => a.time - b.time);
  out.closes.sort((a, b) => a.time - b.time);
  return out;
}

/** Above or below the candle: where the stop or take of that side lies; unknown side above. */
export function closePosition(mark: CloseMark): "aboveBar" | "belowBar" {
  if (mark.side === "long") return mark.reason === "stop_loss" ? "belowBar" : "aboveBar";
  if (mark.side === "short") return mark.reason === "take_profit" ? "belowBar" : "aboveBar";
  return "aboveBar";
}

/** "SL", "TP", or the reason as it is. */
export function closeLabel(reason: string): string {
  if (reason === "stop_loss") return "SL";
  if (reason === "take_profit") return "TP";
  return reason;
}
