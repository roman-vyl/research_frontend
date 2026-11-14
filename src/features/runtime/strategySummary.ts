import type { Candidate } from "@/api/candidates";
import type { RuntimeStrategyInstance } from "@/api/runtime";

export const UNKNOWN_STRATEGY_SPEC = "Неизвестная спецификация";

export type StrategySummary =
  | { kind: "summary"; text: string; heading: string; details: readonly string[] }
  | { kind: "unsupported" };
export type RuntimeCandidateIndex = ReadonlyMap<string, Candidate | null>;

const SUMMARY_COMPONENTS = new Set([
  "atr_stop_loss",
  "atr_take_profit",
  "break_even_stop",
  "change_since_entry",
  "composite_phase_condition",
  "initial_r_trailing_stop",
  "mfe_r",
  "take_profile_switch",
]);

const NON_DISPLAYED_COMPONENTS = new Set([
  "anchor_stack_width_setup",
  "composite_setup",
  "touch_anchor",
  "untouched_anchor_setup",
  "weighted_vote_setup",
]);

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function array(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function finite(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && value.trim() === "")) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function decimal(value: unknown): string | null {
  const parsed = finite(value);
  return parsed === null ? null : String(parsed).replace(".", ",");
}

function compactInstrument(instrument: string): string {
  return /^([A-Z0-9]+)USDT\.P$/.exec(instrument)?.[1] ?? instrument;
}

function componentObjects(value: unknown, into: JsonObject[] = []): JsonObject[] {
  if (Array.isArray(value)) {
    value.forEach((item) => componentObjects(item, into));
    return into;
  }
  const item = object(value);
  if (!item) return into;
  if (Object.hasOwn(item, "component_id")) into.push(item);
  Object.values(item).forEach((child) => componentObjects(child, into));
  return into;
}

function componentsAreKnown(components: readonly JsonObject[]): boolean {
  return components.every(({ component_id: id }) =>
    typeof id === "string" && (SUMMARY_COMPONENTS.has(id) || NON_DISPLAYED_COMPONENTS.has(id)),
  );
}

function component(components: readonly JsonObject[], id: string): JsonObject[] {
  return components.filter((item) => item.component_id === id);
}

function params(item: JsonObject): JsonObject | null {
  return object(item.params);
}

function hasBaseShape(rawSpec: JsonObject, components: readonly JsonObject[]): boolean {
  const setups = array(rawSpec.setups);
  if (!setups) return false;
  const setupComponents = setups.map(object).filter((item): item is JsonObject => item !== null);
  const width = setupComponents.filter((item) => item.component_id === "anchor_stack_width_setup");
  const untouched = setupComponents.filter((item) => item.component_id === "untouched_anchor_setup");
  const alwaysOn = object(object(object(rawSpec.trade_management)?.exit_policy)?.always_on);
  const exitValues = array(alwaysOn?.exits);
  if (!exitValues) return false;
  const exits = exitValues
    .map(object)
    .filter((item): item is JsonObject => item !== null);
  const stop = exits.filter((item) => item.component_id === "atr_stop_loss" && item.exit_kind === "stop_loss");
  const take = exits.filter((item) => item.component_id === "atr_take_profit" && item.exit_kind === "take_profit");
  return (
    width.length === 1 && params(width[0]) !== null &&
    untouched.length === 1 && params(untouched[0]) !== null &&
    stop.length === 1 && finite(object(stop[0].distance)?.multiplier) !== null &&
    take.length === 1 && finite(object(take[0].distance)?.multiplier) !== null &&
    component(components, "atr_stop_loss").length === 1 &&
    component(components, "atr_take_profit").length === 1
  );
}

type AdxPhase = { phase: string; timeframe: string; delta: string };

function adxPhase(rule: JsonObject): AdxPhase | null {
  const phase = typeof rule.to_phase === "string" ? rule.to_phase : null;
  const condition = object(rule.condition);
  if (!phase || condition?.component_id !== "composite_phase_condition") return null;
  const children = array(params(condition)?.children);
  if (!children) return null;
  const rises = children
    .map(object)
    .map((child) => object(child?.condition))
    .filter((child): child is JsonObject => child?.component_id === "change_since_entry");
  if (rises.length !== 1) return null;
  const comparisons = children
    .map(object)
    .map((child) => object(child?.predicate))
    .filter((predicate) => predicate?.kind === "compare");
  const paths = array(params(condition)?.paths)?.map(object).filter((item): item is JsonObject => item !== null) ?? [];
  if (comparisons.length !== 1 || !paths.some((path) => (array(path.require) ?? []).length >= 2)) return null;
  const riseParams = params(rises[0]);
  const feature = object(object(riseParams?.operand)?.feature);
  const delta = decimal(riseParams?.value);
  if (riseParams?.op !== ">=" || feature?.kind !== "adx" || typeof feature.timeframe !== "string" || delta === null) {
    return null;
  }
  return { phase, timeframe: feature.timeframe, delta };
}

type MfePhase = { phase: string; threshold: number };

function mfePhase(rule: JsonObject): MfePhase | null {
  const phase = typeof rule.to_phase === "string" ? rule.to_phase : null;
  const condition = object(rule.condition);
  const threshold = condition?.component_id === "mfe_r" ? finite(params(condition)?.threshold) : null;
  return phase && threshold !== null ? { phase, threshold } : null;
}

function activationPhase(rule: JsonObject): string | null {
  const phase = object(rule.activate_when)?.phase_at_least;
  return typeof phase === "string" ? phase : null;
}

function validTakeSwitch(rule: JsonObject): boolean {
  return (
    typeof rule.rule_id === "string" &&
    activationPhase(rule) !== null &&
    params(rule)?.action === "disable_fixed_tp"
  );
}

function touchMaximum(setups: unknown[]): { present: false } | { present: true; maximum: string | null } {
  const touchSetups = setups
    .map(object)
    .filter((setup): setup is JsonObject => setup?.component_id === "composite_setup")
    .filter((setup) => setup.instance_id === "touch_max");
  if (touchSetups.length === 0) return { present: false };
  if (touchSetups.length !== 1) return { present: true, maximum: null };
  const children = array(params(touchSetups[0])?.children);
  const predicates = (children ?? []).map(object).map((child) => object(child?.predicate));
  const touch = predicates.filter((predicate) => object(object(predicate?.operand)?.episode)?.field === "touch_number");
  if (touch.length !== 1 || touch[0]?.kind !== "range" || touch[0]?.bounds !== "inclusive") {
    return { present: true, maximum: null };
  }
  return { present: true, maximum: decimal(touch[0].max) };
}

export function indexCandidatesByRuntimeFile(candidates: readonly Candidate[]): RuntimeCandidateIndex {
  const result = new Map<string, Candidate | null>();
  for (const candidate of candidates) {
    const runtime = candidate.current?.runtime;
    if (
      !runtime ||
      !runtime.present ||
      "duplicate" in runtime ||
      candidate.strategy_spec_snapshot?.source !== "run_request"
    ) {
      continue;
    }
    result.set(runtime.file, result.has(runtime.file) ? null : candidate);
  }
  return result;
}

export function summarizeRuntimeStrategy(
  runtime: RuntimeStrategyInstance,
  candidate: Candidate,
): StrategySummary {
  try {
    if (candidate.strategy_spec_snapshot?.source !== "run_request") return { kind: "unsupported" };
    const spec = object(candidate.strategy_spec_snapshot.spec);
    const rawSpec = object(spec?.raw_spec);
    if (!rawSpec) return { kind: "unsupported" };

    const components = componentObjects(rawSpec);
    if (!componentsAreKnown(components) || !hasBaseShape(rawSpec, components)) return { kind: "unsupported" };

    const width = decimal(candidate.coords.width);
    const lookback = decimal(candidate.coords.lookback);
    const stop = decimal(candidate.coords.sl);
    const take = decimal(candidate.coords.tp_ratio);
    if ([width, lookback, stop, take].some((value) => value === null)) return { kind: "unsupported" };

    const management = object(object(rawSpec.trade_management)?.exit_management);
    const phaseRules = array(management?.phase_rules)?.map(object).filter((item): item is JsonObject => item !== null) ?? [];
    const stopRules = array(management?.stop_management)?.map(object).filter((item): item is JsonObject => item !== null) ?? [];
    const takeRules = array(management?.take_management)?.map(object).filter((item): item is JsonObject => item !== null) ?? [];
    const adxPhases = phaseRules.map(adxPhase).filter((item): item is AdxPhase => item !== null);
    const mfePhases = phaseRules.map(mfePhase).filter((item): item is MfePhase => item !== null);

    if (component(components, "composite_phase_condition").length !== adxPhases.length) return { kind: "unsupported" };
    if (component(components, "change_since_entry").length !== adxPhases.length) return { kind: "unsupported" };
    if (component(components, "mfe_r").length !== mfePhases.length) return { kind: "unsupported" };
    if (component(components, "take_profile_switch").length !== takeRules.length) return { kind: "unsupported" };
    if (!takeRules.every((rule) => rule.component_id === "take_profile_switch" && validTakeSwitch(rule))) {
      return { kind: "unsupported" };
    }

    const heading = `${compactInstrument(runtime.instrument)} · ${width}/${lookback}`;
    const details = [`SL ${stop}`, `TP ${take}`];
    for (const phase of adxPhases) {
      const stops = stopRules.filter((rule) => activationPhase(rule) === phase.phase);
      if (stops.length !== 1) return { kind: "unsupported" };
      const stopRule = stops[0];
      if (stopRule.component_id === "initial_r_trailing_stop") {
        const distance = decimal(params(stopRule)?.trail_distance_r);
        if (distance === null) return { kind: "unsupported" };
        details.push(`ADX ${phase.timeframe} Δ${phase.delta}`, `D ${distance}R`);
      } else if (stopRule.component_id === "break_even_stop") {
        const stopParams = params(stopRule);
        if (stopParams?.buffer_type !== "none" || finite(stopParams.buffer) !== 0) return { kind: "unsupported" };
        details.push(`BE по ADX ${phase.timeframe} Δ${phase.delta}`);
      } else {
        return { kind: "unsupported" };
      }
    }

    for (const phase of mfePhases) {
      const stops = stopRules.filter(
        (rule) => activationPhase(rule) === phase.phase && rule.component_id === "initial_r_trailing_stop",
      );
      if (stops.length !== 1) return { kind: "unsupported" };
      const trigger = finite(candidate.coords.td_trigger_r);
      const distance = decimal(candidate.coords.td_distance_r);
      const stopParams = params(stops[0]);
      if (
        trigger === null ||
        distance === null ||
        finite(stopParams?.trigger_r) !== trigger ||
        finite(stopParams?.trail_distance_r) !== finite(candidate.coords.td_distance_r) ||
        phase.threshold !== trigger
      ) {
        return { kind: "unsupported" };
      }
      details.push(`TD ${decimal(trigger)}/${distance}R`);
    }

    const recognizedStops = adxPhases.length + mfePhases.length;
    if (
      stopRules.length !== recognizedStops ||
      component(components, "break_even_stop").length !== stopRules.filter((rule) => rule.component_id === "break_even_stop").length ||
      component(components, "initial_r_trailing_stop").length !== stopRules.filter((rule) => rule.component_id === "initial_r_trailing_stop").length
    ) {
      return { kind: "unsupported" };
    }

    const setups = array(rawSpec.setups) ?? [];
    const touch = touchMaximum(setups);
    if (touch.present) {
      if (touch.maximum === null) return { kind: "unsupported" };
      details.push(`касания ≤${touch.maximum}`);
    }

    return { kind: "summary", heading, details, text: [heading, ...details].join(" · ") };
  } catch {
    return { kind: "unsupported" };
  }
}
