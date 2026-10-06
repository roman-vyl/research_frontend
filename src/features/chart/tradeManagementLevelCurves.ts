import type {
  ChartBar,
  ExecutionEvent,
  ManagedPolicyEvent,
  TradeRecord,
} from "@/api/types";
import { resolveChartTimeframeMs } from "@/features/chart/chartTimeframeMs";

export type TradeManagementLevelKind = "stop" | "take";

export type TradeManagementLevelSegment = {
  kind: TradeManagementLevelKind;
  fromTimeSec: number;
  toTimeSec: number;
  price: number;
};

export type TradeManagementLevelCurve = {
  kind: TradeManagementLevelKind;
  points: { timeSec: number; price: number }[];
};

type LevelState = { stop: number | null; take: number | null };

function finitePrice(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function metadataBoolean(metadata: ManagedPolicyEvent["metadata"], key: string): boolean | null {
  const value = metadata[key];
  return typeof value === "boolean" ? value : null;
}

function metadataString(metadata: ManagedPolicyEvent["metadata"], key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function initialProtectionForTrade(
  trade: TradeRecord,
  executionEvents: readonly ExecutionEvent[] | null | undefined,
): LevelState | null {
  const entry = executionEvents?.find(
    (event) =>
      event.event_type === "entry_filled" && event.position_id === trade.position_id,
  );
  if (!entry) return null;
  return {
    stop: finitePrice(entry.metadata.stop_loss_price),
    take: finitePrice(entry.metadata.take_profit_price),
  };
}

function candleIndexAtTime(candles: readonly ChartBar[], timeMs: number): number {
  const timeSec = Math.floor(timeMs / 1000);
  return candles.findIndex((candle) => candle.time === timeSec);
}

/** Resolve the producer's effective bar to its actual candle open when loaded. */
export function managedEventEffectiveTimeMs(
  event: ManagedPolicyEvent,
  candles: readonly ChartBar[],
  chartTimeframe: string,
): number {
  const explicitTime = finitePrice(event.metadata.effective_from_time_ms);
  if (explicitTime !== null) return explicitTime;

  const rawBar = event.metadata.effective_from_bar;
  const effectiveBar =
    typeof rawBar === "number" && Number.isInteger(rawBar)
      ? rawBar
      : typeof rawBar === "string" && /^\d+$/.test(rawBar)
        ? Number(rawBar)
        : null;
  if (effectiveBar === null || effectiveBar <= event.bar_index) return event.time_ms;

  const eventCandleIndex = candleIndexAtTime(candles, event.time_ms);
  const offset = effectiveBar - event.bar_index;
  const effectiveCandle =
    eventCandleIndex >= 0 ? candles[eventCandleIndex + offset] : undefined;
  if (effectiveCandle) return effectiveCandle.time * 1000;

  return event.time_ms + offset * resolveChartTimeframeMs(chartTimeframe);
}

function nextStopLevel(event: ManagedPolicyEvent, current: number | null): number | null {
  const price = finitePrice(event.price);
  if (price !== null) return price;
  if (metadataBoolean(event.metadata, "active") === false) return null;
  return current;
}

function nextTakeLevel(
  event: ManagedPolicyEvent,
  current: number | null,
  initialTake: number | null,
): number | null {
  const price = finitePrice(event.price);
  if (price !== null) return price;
  if (metadataBoolean(event.metadata, "active") === false) return null;

  // v1 producer compatibility: take switches recorded the resulting factual
  // profile rather than duplicating the already persisted initial price.
  const profile = metadataString(event.metadata, "take_profile");
  if (profile === "disable_initial_tp") return null;
  if (profile === "initial") return initialTake;
  return current;
}

function appendSegment(
  output: TradeManagementLevelSegment[],
  kind: TradeManagementLevelKind,
  price: number | null,
  fromMs: number,
  toMs: number,
): void {
  if (price === null || toMs <= fromMs) return;
  output.push({
    kind,
    fromTimeSec: Math.floor(fromMs / 1000),
    toTimeSec: Math.floor(toMs / 1000),
    price,
  });
}

/**
 * Reconstruct factual stop/take states for one focused trade. No strategy
 * rule is evaluated here: entry facts and persisted state changes are merely
 * converted to horizontal chart segments.
 */
export function buildTradeManagementLevelSegments(options: {
  trade: TradeRecord;
  executionEvents: readonly ExecutionEvent[] | null | undefined;
  managedPolicyEvents: readonly ManagedPolicyEvent[] | null | undefined;
  candles: readonly ChartBar[];
  chartTimeframe: string;
}): TradeManagementLevelSegment[] {
  const initial = initialProtectionForTrade(options.trade, options.executionEvents);
  if (!initial) return [];

  const changes = (options.managedPolicyEvents ?? [])
    .filter(
      (event) =>
        event.position_id === options.trade.position_id &&
        (event.event_type === "active_stop_updated" ||
          event.event_type === "active_take_updated"),
    )
    .map((event, order) => ({
      event,
      order,
      effectiveTimeMs: managedEventEffectiveTimeMs(
        event,
        options.candles,
        options.chartTimeframe,
      ),
    }))
    .filter(
      ({ effectiveTimeMs }) =>
        effectiveTimeMs >= options.trade.entry_time_ms &&
        effectiveTimeMs <= options.trade.exit_time_ms,
    )
    .sort(
      (left, right) =>
        left.effectiveTimeMs - right.effectiveTimeMs || left.order - right.order,
    );

  const segments: TradeManagementLevelSegment[] = [];
  const state: LevelState = { ...initial };
  const starts = {
    stop: options.trade.entry_time_ms,
    take: options.trade.entry_time_ms,
  };

  for (const { event, effectiveTimeMs } of changes) {
    const kind = event.event_type === "active_stop_updated" ? "stop" : "take";
    const next =
      kind === "stop"
        ? nextStopLevel(event, state.stop)
        : nextTakeLevel(event, state.take, initial.take);
    if (next === state[kind]) continue;
    appendSegment(segments, kind, state[kind], starts[kind], effectiveTimeMs);
    state[kind] = next;
    starts[kind] = effectiveTimeMs;
  }

  appendSegment(segments, "stop", state.stop, starts.stop, options.trade.exit_time_ms);
  appendSegment(segments, "take", state.take, starts.take, options.trade.exit_time_ms);
  return segments.sort(
    (left, right) =>
      left.fromTimeSec - right.fromTimeSec || left.kind.localeCompare(right.kind),
  );
}

/** Join adjacent segments into stair-step series while preserving inactive gaps. */
export function groupTradeManagementLevelCurves(
  segments: readonly TradeManagementLevelSegment[],
): TradeManagementLevelCurve[] {
  const curves: TradeManagementLevelCurve[] = [];
  for (const kind of ["stop", "take"] as const) {
    const matching = segments
      .filter((segment) => segment.kind === kind)
      .sort((left, right) => left.fromTimeSec - right.fromTimeSec);
    let current: TradeManagementLevelSegment[] = [];
    const flush = () => {
      if (current.length === 0) return;
      const first = current[0]!;
      const last = current[current.length - 1]!;
      curves.push({
        kind,
        points: [
          { timeSec: first.fromTimeSec, price: first.price },
          ...current.slice(1).map((segment) => ({
            timeSec: segment.fromTimeSec,
            price: segment.price,
          })),
          { timeSec: last.toTimeSec, price: last.price },
        ],
      });
      current = [];
    };
    for (const segment of matching) {
      const previous = current[current.length - 1];
      if (previous && previous.toTimeSec !== segment.fromTimeSec) flush();
      current.push(segment);
    }
    flush();
  }
  return curves;
}
