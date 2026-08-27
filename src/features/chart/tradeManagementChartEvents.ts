import type { SeriesMarker, Time } from "lightweight-charts";

import { msToChartTime, type ManagedPolicyEvent, type TradeRecord } from "@/api/types";
import { filterMarkersToTimeRange } from "@/features/chart/chartMarkers";
import { buildTradeDisplayNumberLookup } from "@/features/chart/tradeLookup";

export const TRADE_MANAGEMENT_MARKER_LEGEND = [
  { kind: "phase_proven", label: "Proven", description: "Phase transition · proven" },
  { kind: "phase_protected", label: "Protected", description: "Phase transition · protected" },
  { kind: "phase_runner", label: "Runner", description: "Phase transition · runner" },
  { kind: "phase_exhaust", label: "Exhaust", description: "Phase transition · exhaustion" },
  { kind: "managed_stop", label: "Stop↑", description: "Active stop updated" },
  { kind: "managed_take", label: "Take", description: "Take profile updated" },
  { kind: "managed_runtime", label: "Runtime", description: "Runtime exit triggered" },
] as const;

/** Cap markers when no trade is selected to avoid chart spam. */
export const TRADE_MANAGEMENT_MAX_MARKERS_WITHOUT_SELECTION = 200;

export function hasManagedPolicyEvents(
  events: readonly ManagedPolicyEvent[] | null | undefined,
): boolean {
  return Array.isArray(events) && events.length > 0;
}

export function phaseTransitionMarkerLabel(toPhase: string | null | undefined): string {
  switch (toPhase) {
    case "proven":
      return "Proven";
    case "protected":
      return "Protected";
    case "runner":
      return "Runner";
    case "exhaustion":
      return "Exhaust";
    default:
      return toPhase?.trim() ? toPhase : "?";
  }
}

function metadataString(
  metadata: ManagedPolicyEvent["metadata"],
  key: string,
): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const raw = metadata[key];
  if (raw === null || raw === undefined) {
    return null;
  }
  return String(raw);
}

export function managedPolicyEventTooltip(
  event: ManagedPolicyEvent,
  trade?: TradeRecord,
): string {
  const lines: string[] = [`position_id: ${event.position_id}`];

  if (event.event_type === "phase_changed") {
    if (event.from_phase || event.to_phase) {
      lines.push(`phase: ${event.from_phase ?? "?"} → ${event.to_phase ?? "?"}`);
    }
    if (event.rule_id) {
      lines.push(`rule_id: ${event.rule_id}`);
    }
  }

  if (event.event_type === "active_stop_updated") {
    if (event.rule_id) {
      lines.push(`rule_id: ${event.rule_id}`);
    }
    if (event.component_id) {
      lines.push(`component_id: ${event.component_id}`);
    }
    if (event.price !== null) {
      lines.push(`stop_price: ${event.price}`);
    }
  }

  if (event.event_type === "active_take_updated") {
    if (event.rule_id) {
      lines.push(`rule_id: ${event.rule_id}`);
    }
    if (event.component_id) {
      lines.push(`component_id: ${event.component_id}`);
    }
    const action = metadataString(event.metadata, "take_profile");
    if (action) {
      lines.push(`take_profile: ${action}`);
    }
  }

  if (event.event_type === "runtime_exit_triggered") {
    if (event.rule_id) {
      lines.push(`rule_id: ${event.rule_id}`);
    }
    if (event.component_id) {
      lines.push(`component_id: ${event.component_id}`);
    }
    const exitKind = metadataString(event.metadata, "exit_kind");
    if (exitKind) {
      lines.push(`exit_kind: ${exitKind}`);
    }
    if (trade?.exit_layer) {
      lines.push(`exit_layer: ${trade.exit_layer}`);
    }
  }

  if (event.bar_index !== null && event.bar_index !== undefined) {
    lines.push(`bar_index: ${event.bar_index}`);
  }

  return lines.join("\n");
}

function eventChartTime(event: ManagedPolicyEvent): number | null {
  if (event.time_ms === null || event.time_ms === undefined || !Number.isFinite(event.time_ms)) {
    return null;
  }
  return msToChartTime(event.time_ms);
}

function phaseMarkerStyle(
  toPhase: string | null | undefined,
  side: "long" | "short",
  highlighted: boolean,
): { color: string; shape: "circle" | "square"; position: "aboveBar" | "belowBar" } {
  const position = side === "long" ? "belowBar" : "aboveBar";
  if (highlighted) {
    return { color: "#fbbf24", shape: "circle", position };
  }
  switch (toPhase) {
    case "proven":
      return { color: "#22d3ee", shape: "circle", position };
    case "protected":
      return { color: "#818cf8", shape: "circle", position };
    case "runner":
      return { color: "#f472b6", shape: "circle", position };
    case "exhaustion":
      return { color: "#fb923c", shape: "circle", position };
    default:
      return { color: "#94a3b8", shape: "circle", position };
  }
}

function managedLayerMarkerStyle(
  eventType: ManagedPolicyEvent["event_type"],
  side: "long" | "short",
  highlighted: boolean,
): { color: string; shape: "circle" | "square"; position: "aboveBar" | "belowBar"; label: string } {
  const position = side === "long" ? "belowBar" : "aboveBar";
  if (highlighted) {
    return { color: "#fbbf24", shape: "circle", position, label: "M" };
  }
  switch (eventType) {
    case "active_stop_updated":
      return { color: "#34d399", shape: "circle", position, label: "Stop↑" };
    case "active_take_updated":
      return { color: "#60a5fa", shape: "circle", position, label: "Take" };
    case "runtime_exit_triggered":
      return { color: "#fb923c", shape: "circle", position, label: "Runtime" };
    default:
      return { color: "#94a3b8", shape: "circle", position, label: "M" };
  }
}

/** `selectedPositionId` — the currently selected trade's `TradeRecord.position_id`, not `trade_id`. */
export function filterManagedPolicyEventsForView(
  events: readonly ManagedPolicyEvent[] | null | undefined,
  options: {
    selectedPositionId: string | null;
    fromSec: number;
    toSec: number;
    maxWithoutSelection?: number;
  },
): ManagedPolicyEvent[] {
  if (!hasManagedPolicyEvents(events)) {
    return [];
  }

  const maxWithoutSelection =
    options.maxWithoutSelection ?? TRADE_MANAGEMENT_MAX_MARKERS_WITHOUT_SELECTION;

  let filtered = events!.filter((event) => {
    const timeSec = eventChartTime(event);
    if (timeSec === null) {
      return false;
    }
    if (timeSec < options.fromSec || timeSec > options.toSec) {
      return false;
    }
    if (options.selectedPositionId !== null) {
      return event.position_id === options.selectedPositionId;
    }
    return true;
  });

  if (options.selectedPositionId === null && filtered.length > maxWithoutSelection) {
    filtered = filtered.slice(0, maxWithoutSelection);
  }

  return filtered;
}

const MANAGED_LAYER_EVENT_TYPES = new Set<ManagedPolicyEvent["event_type"]>([
  "active_stop_updated",
  "active_take_updated",
  "runtime_exit_triggered",
]);

function highlightedMarkerLabel(
  prefix: string,
  positionId: string | null | undefined,
  trades: readonly TradeRecord[],
  lookup: ReadonlyMap<string, number>,
): string {
  const trade = trades.find((t) => t.position_id === positionId);
  const display = trade ? lookup.get(String(trade.trade_id)) : undefined;
  return display !== undefined ? `${prefix}#${display}` : prefix;
}

export function buildManagedPolicyEventChartMarkers(
  events: readonly ManagedPolicyEvent[],
  options: {
    showPhases: boolean;
    showExits: boolean;
    selectedPositionId: string | null;
    trades?: readonly TradeRecord[];
  },
): SeriesMarker<Time>[] {
  const out: SeriesMarker<Time>[] = [];
  const trades = options.trades ?? [];
  const displayLookup = buildTradeDisplayNumberLookup(trades);

  for (const event of events) {
    const timeSec = eventChartTime(event);
    if (timeSec === null) {
      continue;
    }

    const highlighted =
      options.selectedPositionId !== null && options.selectedPositionId === event.position_id;

    if (event.event_type === "phase_changed") {
      if (!options.showPhases) {
        continue;
      }
      const style = phaseMarkerStyle(event.to_phase, event.side, highlighted);
      const label = phaseTransitionMarkerLabel(event.to_phase);
      out.push({
        time: timeSec as Time,
        position: style.position,
        color: style.color,
        shape: style.shape,
        text: highlighted
          ? highlightedMarkerLabel(label, event.position_id, trades, displayLookup)
          : label,
      });
      continue;
    }

    if (!options.showExits || !MANAGED_LAYER_EVENT_TYPES.has(event.event_type)) {
      continue;
    }

    const style = managedLayerMarkerStyle(event.event_type, event.side, highlighted);
    out.push({
      time: timeSec as Time,
      position: style.position,
      color: style.color,
      shape: style.shape,
      text: highlighted
        ? highlightedMarkerLabel(style.label, event.position_id, trades, displayLookup)
        : style.label,
    });
  }

  return out.sort((a, b) => (a.time as number) - (b.time as number));
}

export function buildManagedPolicyEventsForView(
  events: readonly ManagedPolicyEvent[] | null | undefined,
  options: {
    showPhases: boolean;
    showExits: boolean;
    selectedPositionId: string | null;
    viewCandles: { time: number }[];
    trades?: readonly TradeRecord[];
    maxWithoutSelection?: number;
  },
): SeriesMarker<Time>[] {
  if (!options.showPhases && !options.showExits) {
    return [];
  }
  if (options.viewCandles.length === 0) {
    return [];
  }

  const fromSec = options.viewCandles[0]!.time;
  const toSec = options.viewCandles[options.viewCandles.length - 1]!.time;
  const inView = filterManagedPolicyEventsForView(events, {
    selectedPositionId: options.selectedPositionId,
    fromSec,
    toSec,
    maxWithoutSelection: options.maxWithoutSelection,
  });

  return buildManagedPolicyEventChartMarkers(inView, {
    showPhases: options.showPhases,
    showExits: options.showExits,
    selectedPositionId: options.selectedPositionId,
    trades: options.trades,
  });
}

/** Stable merge helper for marker rebuild tests. */
export function mergeChartMarkers(
  ...groups: SeriesMarker<Time>[]
): SeriesMarker<Time>[] {
  return groups.flat().sort((a, b) => (a.time as number) - (b.time as number));
}

export function filterTradeManagementMarkersToTimeRange(
  markers: SeriesMarker<Time>[],
  fromSec: number,
  toSec: number,
): SeriesMarker<Time>[] {
  return filterMarkersToTimeRange(markers, fromSec, toSec);
}
