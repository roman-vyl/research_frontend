/**
 * Arithmetic of the Trades tab over closed-trade rows as the Central Journal stores them.
 * Stored strings are parsed with `Number()` for display only and never rewritten.
 */
import type { ClosedTrade } from "@/api/journal";
import type { RuntimeStrategyInstance } from "@/api/runtime";

export type StatusFilter = "all" | "complete" | "incomplete";

export type TradeFilter = {
  strategy: string;
  coin: string;
  /** Inclusive UTC days, `YYYY-MM-DD`, or "". */
  fromDay: string;
  toDay: string;
  status: StatusFilter;
};

export const EMPTY_FILTER: TradeFilter = { strategy: "", coin: "", fromDay: "", toDay: "", status: "all" };

/** Short form of an id: the first 8 characters after its last `:`. */
export function shortId(strategyInstanceId: string): string {
  return strategyInstanceId.slice(strategyInstanceId.lastIndexOf(":") + 1).slice(0, 8);
}

/** Strategy names by id: the deployment file name without directory and `.json`, as on the Runtime Dashboard. */
export function strategyNames(instances: RuntimeStrategyInstance[] | null): Map<string, string> {
  const names = new Map<string, string>();
  for (const s of instances ?? []) {
    names.set(s.strategy_instance_id, s.source_path.replace(/^.*[\\/]/, "").replace(/\.json$/, ""));
  }
  return names;
}

export function strategyName(names: Map<string, string>, strategyInstanceId: string): string {
  return names.get(strategyInstanceId) ?? shortId(strategyInstanceId);
}

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function applyFilter(trades: ClosedTrade[], filter: TradeFilter): ClosedTrade[] {
  return trades.filter((t) => {
    if (filter.strategy && t.strategy_instance_id !== filter.strategy) return false;
    if (filter.coin && t.symbol !== filter.coin) return false;
    if (filter.status !== "all" && t.status !== filter.status) return false;
    if (filter.fromDay || filter.toDay) {
      if (t.closed_at_ms === null) return false;
      const day = utcDay(t.closed_at_ms);
      if (filter.fromDay && day < filter.fromDay) return false;
      if (filter.toDay && day > filter.toDay) return false;
    }
    return true;
  });
}

/** Newest close first; rows without a close time on top, newest detection first. */
export function sortForTable(trades: ClosedTrade[]): ClosedTrade[] {
  return trades.slice().sort((a, b) => {
    if (a.closed_at_ms === null || b.closed_at_ms === null) {
      if (a.closed_at_ms !== null) return 1;
      if (b.closed_at_ms !== null) return -1;
      return b.created_at_ms - a.created_at_ms;
    }
    return b.closed_at_ms - a.closed_at_ms || a.close_event_id.localeCompare(b.close_event_id);
  });
}

export function completeByClose(trades: ClosedTrade[]): ClosedTrade[] {
  return trades
    .filter((t) => t.status === "complete" && t.closed_at_ms !== null)
    .sort((a, b) => (a.closed_at_ms ?? 0) - (b.closed_at_ms ?? 0) || a.close_event_id.localeCompare(b.close_event_id));
}

export type TradeSummary = {
  trades: number;
  waiting: number;
  net: number;
  gross: number;
  winRatePct: number | null;
  averageR: number | null;
  /** `null` when there is no losing trade. */
  profitFactor: number | null;
  fees: number;
  averageDurationMs: number | null;
};

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function summarize(filtered: ClosedTrade[]): TradeSummary {
  const done = completeByClose(filtered);
  const nets = done.map((t) => Number(t.net_pnl_usdt));
  const wins = nets.filter((n) => n > 0);
  const losses = nets.filter((n) => n < 0);
  const n = done.length;
  return {
    trades: n,
    waiting: filtered.filter((t) => t.status === "incomplete").length,
    net: sum(nets),
    gross: sum(done.map((t) => Number(t.gross_pnl_usdt))),
    winRatePct: n ? (100 * wins.length) / n : null,
    averageR: n ? sum(done.map((t) => Number(t.r_multiple))) / n : null,
    profitFactor: losses.length ? sum(wins) / Math.abs(sum(losses)) : null,
    fees: sum(done.map((t) => Number(t.fees_usdt))),
    averageDurationMs: n ? sum(done.map((t) => t.duration_ms ?? 0)) / n : null,
  };
}

/** Cumulative net from 0, one point per complete trade in close order. */
export function equityCurve(filtered: ClosedTrade[]): { closedAtMs: number | null; cumulative: number }[] {
  let cumulative = 0;
  const points: { closedAtMs: number | null; cumulative: number }[] = [{ closedAtMs: null, cumulative: 0 }];
  for (const t of completeByClose(filtered)) {
    cumulative += Number(t.net_pnl_usdt);
    points.push({ closedAtMs: t.closed_at_ms, cumulative });
  }
  return points;
}

export type CalendarMonth = { year: number; month: number };

export type CalendarDay = { day: number; net: number; count: number } | null;

export function latestMonth(filtered: ClosedTrade[]): CalendarMonth | null {
  const done = completeByClose(filtered);
  const last = done[done.length - 1];
  if (!last || last.closed_at_ms === null) return null;
  const d = new Date(last.closed_at_ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

export function shiftMonth(m: CalendarMonth, by: number): CalendarMonth {
  const d = new Date(Date.UTC(m.year, m.month + by, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** Cells of a Monday-first month grid: `null` before day 1, then each day with its net and trade count. */
export function calendarCells(filtered: ClosedTrade[], m: CalendarMonth): { lead: number; days: { day: number; net: number; count: number }[] } {
  const first = new Date(Date.UTC(m.year, m.month, 1));
  const length = new Date(Date.UTC(m.year, m.month + 1, 0)).getUTCDate();
  const days = Array.from({ length }, (_, i) => ({ day: i + 1, net: 0, count: 0 }));
  for (const t of completeByClose(filtered)) {
    const d = new Date(t.closed_at_ms ?? 0);
    if (d.getUTCFullYear() !== m.year || d.getUTCMonth() !== m.month) continue;
    const cell = days[d.getUTCDate() - 1];
    cell.net += Number(t.net_pnl_usdt);
    cell.count += 1;
  }
  return { lead: (first.getUTCDay() + 6) % 7, days };
}

/** Planned exit by close reason: last stop for a stop, last take for a take, none for a Runtime signal. */
export function plannedExit(t: ClosedTrade): string | null {
  if (t.close_reason === "stop_loss") return t.last_stop;
  if (t.close_reason === "take_profit") return t.last_take;
  return null;
}

export const REASON_TEXT: Record<string, string> = {
  stop_loss: "Stop loss",
  take_profit: "Take profit",
  runtime_signal: "Runtime signal",
};

export function reasonText(reason: string): string {
  return Object.hasOwn(REASON_TEXT, reason) ? REASON_TEXT[reason] : reason;
}

export function sideText(side: ClosedTrade["side"]): string {
  return side === "long" ? "Long" : side === "short" ? "Short" : "—";
}

const MINUS = "−";

export function fmt(value: number, digits: number): string {
  return Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** A number with its sign written out: `+12.30`, `−4.00`, `0.00`. */
export function signed(value: number, digits: number): string {
  const text = fmt(value, digits);
  if (Number(text.replace(/,/g, "")) === 0) return text;
  return `${value > 0 ? "+" : MINUS}${text}`;
}

export function plain(value: number, digits: number): string {
  return `${value < 0 ? MINUS : ""}${fmt(value, digits)}`;
}

export function tone(value: number): "pos" | "neg" | "zero" {
  return value > 0 ? "pos" : value < 0 ? "neg" : "zero";
}

export function formatUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

export function formatUtcSeconds(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ${totalSeconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/** Decimal places worth showing for a price: as stored, at least one, at most eight. */
export function priceDigits(stored: string): number {
  const dot = stored.indexOf(".");
  return Math.min(8, Math.max(1, dot < 0 ? 0 : stored.length - dot - 1));
}

export function price(stored: string | null): string {
  return stored === null ? "—" : plain(Number(stored), priceDigits(stored));
}

export function coinOf(symbol: string | null): string {
  return symbol ? symbol.replace(/USDT$/, "") : "";
}
