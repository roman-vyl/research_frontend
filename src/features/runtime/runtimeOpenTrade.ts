import type { JournalEvent } from "@/api/journal";
import type { ChartBar } from "@/api/types";
import type { AppliedRing } from "@/features/runtime/runtimeAppliedOrders";
import { price } from "@/features/runtime/runtimeProjection";

/**
 * One open-position bar with a readable stop. `segment` changes where the lines must break: after a
 * bar without a point, or where `trade_cycle_id` changes. A `null` take draws no Take point.
 */
export type OpenTradePoint = { time: number; segment: number; stop: number; take: number | null };

export type OpenTradeProjection = {
  points: OpenTradePoint[];
  /** Bars whose chosen event has `close_signal.active = true`, whatever its prices. */
  closeTimes: number[];
  /** Bars of the window with an `open_trade_evaluated` event. */
  barCount: number;
  unreadableCount: number;
};

type Read = {
  levels: { stop: number; take: number | null } | null;
  close: boolean | null;
  /** Read only to split the lines; never shown. */
  cycle: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOpenTrade(event: JournalEvent): Read {
  const payload = event.body?.payload;
  const desired = isObject(payload) ? payload.desired_protection : undefined;
  const signal = isObject(payload) ? payload.close_signal : undefined;
  let levels: Read["levels"] = null;
  if (isObject(desired)) {
    const stop = price(desired.stop_price);
    const take = desired.take_price === null ? null : price(desired.take_price);
    if (stop !== null && (take !== null || desired.take_price === null)) levels = { stop, take };
  }
  const active = isObject(signal) ? signal.active : undefined;
  const cycle = isObject(payload) && typeof payload.trade_cycle_id === "string" ? payload.trade_cycle_id : null;
  return { levels, close: typeof active === "boolean" ? active : null, cycle };
}

/** The event that counts for a bar: latest `occurred_at`, equal times resolved by the greater `event_id`. */
function later(a: JournalEvent, b: JournalEvent): JournalEvent {
  if (a.occurred_at !== b.occurred_at) return a.occurred_at > b.occurred_at ? a : b;
  return a.event_id >= b.event_id ? a : b;
}

/**
 * Engine's open-position projection (`open_trade_evaluated` events) on the bars of the candle window,
 * one event per bar. The close signal and the levels are read separately: an active close signal is
 * kept even when the levels are unreadable or missing. An event is unreadable when its levels or its
 * `close_signal.active` cannot be read.
 */
export function buildOpenTradeProjection(candles: readonly ChartBar[], events: readonly JournalEvent[]): OpenTradeProjection {
  const byBar = new Map<number, JournalEvent>();
  for (const event of events) {
    const prev = byBar.get(event.bar_open_time_ms);
    byBar.set(event.bar_open_time_ms, prev === undefined ? event : later(prev, event));
  }
  const out: OpenTradeProjection = { points: [], closeTimes: [], barCount: 0, unreadableCount: 0 };
  let segment = 0;
  let previous: { cycle: string | null } | null = null;
  for (const bar of candles) {
    const event = byBar.get(bar.time * 1000);
    if (event === undefined) {
      previous = null;
      continue;
    }
    out.barCount += 1;
    const read = readOpenTrade(event);
    if (read.levels === null || read.close === null) out.unreadableCount += 1;
    if (read.close === true) out.closeTimes.push(bar.time);
    if (read.levels === null) {
      previous = null;
      continue;
    }
    if (previous === null || read.cycle === null || previous.cycle !== read.cycle) segment += 1;
    out.points.push({ time: bar.time, segment, stop: read.levels.stop, take: read.levels.take });
    previous = { cycle: read.cycle };
  }
  return out;
}

/** Rings of the confirmed protection on one bar; several records of a bar are all kept. */
export type ProtectionBar = { time: number; rings: AppliedRing[] };

export type AppliedProtection = {
  bars: ProtectionBar[];
  /** Every `protection_applied` record on a bar of the window, unreadable ones included. */
  appliedCount: number;
  /** Records whose `confirmed_protection.take_price` is null: the far take order is not drawn. */
  technicalTakeCount: number;
  unreadableCount: number;
};

function readProtection(event: JournalEvent): { ring: AppliedRing; technicalTake: boolean } | null {
  const payload = event.body?.payload;
  if (!isObject(payload) || !isObject(payload.confirmed_protection) || !isObject(payload.stop_order)) return null;
  const stop = price(payload.stop_order.trigger_price);
  if (stop === null) return null;
  const confirmedTake = payload.confirmed_protection.take_price;
  if (confirmedTake === null) return { ring: { entry: null, stop, take: null }, technicalTake: true };
  if (price(confirmedTake) === null || !isObject(payload.take_order)) return null;
  const take = price(payload.take_order.trigger_price);
  if (take === null) return null;
  return { ring: { entry: null, stop, take }, technicalTake: false };
}

/**
 * The confirmed protection (`protection_applied` events) on the bars of the candle window: a Stop ring
 * at the stop order's trigger price and a Take ring at the take order's, unless the confirmed take is
 * null (technical far take: counted, not drawn). Every record counts on its own.
 */
export function buildAppliedProtection(candles: readonly ChartBar[], events: readonly JournalEvent[]): AppliedProtection {
  const inWindow = new Set(candles.map((bar) => bar.time * 1000));
  const byBar = new Map<number, AppliedRing[]>();
  const out: AppliedProtection = { bars: [], appliedCount: 0, technicalTakeCount: 0, unreadableCount: 0 };
  for (const event of events) {
    if (!inWindow.has(event.bar_open_time_ms)) continue;
    out.appliedCount += 1;
    const read = readProtection(event);
    if (read === null) {
      out.unreadableCount += 1;
      continue;
    }
    if (read.technicalTake) out.technicalTakeCount += 1;
    const rings = byBar.get(event.bar_open_time_ms);
    if (rings === undefined) byBar.set(event.bar_open_time_ms, [read.ring]);
    else rings.push(read.ring);
  }
  for (const bar of candles) {
    const rings = byBar.get(bar.time * 1000);
    if (rings !== undefined) out.bars.push({ time: bar.time, rings });
  }
  return out;
}
