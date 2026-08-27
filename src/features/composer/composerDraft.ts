import type {
  ComponentCatalog,
  ComponentSchema,
  DeployableStrategyInstance,
  JsonObject,
  StrategyConfigDraft,
  ValidationErrorItem,
} from "@/api/types";
import { createBlankExitManagement } from "@/features/composer/composerExitManagementProduct";

export const COMPOSER_DEFAULT_STRATEGY_ID = "ema_pullback";
export const COMPOSER_DEFAULT_EXPERIMENT_ID = "draft_ema_pullback";
export const COMPOSER_DEFAULT_TICKER = "BTCUSDT.P";
export const COMPOSER_DEFAULT_BASE_TIMEFRAME = "5m";

export function createBlankConfigDraft(
  strategyId = COMPOSER_DEFAULT_STRATEGY_ID,
): StrategyConfigDraft {
  return {
    config_version: 1,
    experiment_id: COMPOSER_DEFAULT_EXPERIMENT_ID,
    strategy_id: strategyId,
    execution: {},
    instances: [createDefaultInstance()],
  };
}

export function createDefaultInstance(): DeployableStrategyInstance {
  return {
    enabled: true,
    strategy_id: COMPOSER_DEFAULT_STRATEGY_ID,
    ticker: COMPOSER_DEFAULT_TICKER,
    base_timeframe: COMPOSER_DEFAULT_BASE_TIMEFRAME,
    raw_spec: {
      trade_sides: { long: true, short: false },
      anchor_stack: {
        source: "close",
        timeframe: "base",
        fast: 200,
        anchor: 500,
        slow: 1000,
      },
      direction: { component_id: "ema_anchor_stack_trend" },
      setups: [
        {
          instance_id: "setup",
          component_id: "untouched_anchor_setup",
          lookback: 50,
          active_bars: 3,
        },
      ],
      trigger: { component_id: "reclaim_anchor", lookback: 1 },
      blockers: [{ instance_id: "no_blockers", component_id: "no_blockers" }],
      risk: { component_id: "no_risk_filter" },
      contexts: {},
      trade_management: {
        exit_policy: {
          always_on: {
            exits: [
              {
                instance_id: "atr_sl",
                component_id: "atr_stop_loss",
                distance: { timeframe: "5m", period: 14, multiplier: 2 },
              },
              {
                instance_id: "atr_tp",
                component_id: "atr_take_profit",
                distance: { timeframe: "base", period: 14, multiplier: 4 },
              },
            ],
          },
          profiles: {
            aligned: { exits: [] },
            countertrend: { exits: [] },
            neutral: { exits: [] },
          },
        },
        exit_management: createBlankExitManagement(),
      },
    },
  };
}

/** Instance identity is derived (strategy_id/ticker/base_timeframe/raw_spec)
 * -- there is no caller-assigned id to carry forward. Duplicating just
 * deep-clones raw_spec so edits to the copy don't alias the source. */
export function duplicateInstance(
  source: DeployableStrategyInstance,
): DeployableStrategyInstance {
  return {
    ...source,
    raw_spec: structuredClone(source.raw_spec),
  };
}

import {
  DEPRECATED_EXIT_MANAGEMENT_AUTHORING_IDS,
} from "@/features/composer/composerExitManagementProduct";

export function componentsForRole(
  catalog: ComponentCatalog,
  role: ComponentSchema["role"],
): ComponentSchema[] {
  return catalog.components.filter(
    (c) =>
      c.role === role &&
      !(DEPRECATED_EXIT_MANAGEMENT_AUTHORING_IDS as readonly string[]).includes(c.component_id),
  );
}

/** Components catalogued for a specific consumer role (e.g. exit_management.runtime_exit). */
export function componentsForAllowedRole(
  catalog: ComponentCatalog,
  allowedRole: string,
): ComponentSchema[] {
  return catalog.components
    .filter(
      (c) =>
        Array.isArray(c.allowed_roles) && c.allowed_roles.includes(allowedRole),
    )
    .sort((a, b) => a.component_id.localeCompare(b.component_id));
}

export function findComponentSchema(
  catalog: ComponentCatalog,
  componentId: string,
): ComponentSchema | undefined {
  return catalog.components.find((c) => c.component_id === componentId);
}

export function applyComponentDefaults(
  base: JsonObject,
  schema: ComponentSchema | undefined,
): JsonObject {
  if (!schema?.params_schema) {
    return { ...base };
  }
  let out = { ...base };
  for (const [key, field] of Object.entries(schema.params_schema)) {
    if (readParamValue(out, key) === undefined && field.default !== undefined) {
      out = writeParamValue(out, key, field.default);
    }
  }
  return out;
}

export function readParamValue(obj: JsonObject, key: string): unknown {
  if (!key.includes(".")) {
    return obj[key];
  }
  const [head, ...rest] = key.split(".");
  const nested = obj[head];
  if (typeof nested !== "object" || nested === null || Array.isArray(nested)) {
    return undefined;
  }
  return readParamValue(nested as JsonObject, rest.join("."));
}

export function writeParamValue(obj: JsonObject, key: string, value: unknown): JsonObject {
  if (!key.includes(".")) {
    return { ...obj, [key]: value };
  }
  const [head, ...rest] = key.split(".");
  const nested = (obj[head] as JsonObject | undefined) ?? {};
  return {
    ...obj,
    [head]: writeParamValue(nested, rest.join("."), value),
  };
}

export function errorsForPath(
  errors: ValidationErrorItem[],
  pathPrefix: string,
): ValidationErrorItem[] {
  if (!pathPrefix) {
    return errors.filter((e) => !e.path || e.path === "");
  }
  return errors.filter(
    (e) =>
      e.path === pathPrefix ||
      e.path.startsWith(`${pathPrefix}.`) ||
      e.path.startsWith(`${pathPrefix}[`),
  );
}

export function instancePath(index: number): string {
  return `instances[${index}]`;
}

export function instanceMetaPath(
  index: number,
  field: "enabled" | "strategy_id" | "ticker" | "base_timeframe",
): string {
  return `${instancePath(index)}.${field}`;
}

const INSTANCE_META_FIELDS = ["enabled", "strategy_id", "ticker", "base_timeframe"] as const;

/** Validation paths for the deployable-instance identity fields only
 * (enabled/strategy_id/ticker/base_timeframe) -- not raw_spec. */
export function errorsForInstanceMeta(
  errors: ValidationErrorItem[],
  index: number,
): ValidationErrorItem[] {
  const prefix = instancePath(index);
  return errors.filter((e) => {
    const path = e.path ?? "";
    if (!path.startsWith(`${prefix}.`)) {
      return false;
    }
    const rest = path.slice(prefix.length + 1);
    return INSTANCE_META_FIELDS.some(
      (field) => rest === field || rest.startsWith(`${field}.`) || rest.startsWith(`${field}[`),
    );
  });
}

export function anyInstanceMetaHasError(
  errors: ValidationErrorItem[],
  instanceCount: number,
): boolean {
  for (let i = 0; i < instanceCount; i++) {
    if (errorsForInstanceMeta(errors, i).length > 0) {
      return true;
    }
  }
  return false;
}

export function strategyPath(index: number): string {
  return `${instancePath(index)}.raw_spec`;
}

export function listSlotPath(
  index: number,
  role:
    | "blockers"
    | "setups"
    | "exits"
    | "always_on_exits"
    | "aligned_exits"
    | "countertrend_exits"
    | "neutral_exits"
    | "phase_rules"
    | "always_on_management"
    | "aligned_management"
    | "countertrend_management"
    | "neutral_management",
  slot: number,
): string {
  if (role === "setups") {
    return `${strategyPath(index)}.setups[${slot}]`;
  }
  if (role === "blockers") {
    return `${strategyPath(index)}.blockers[${slot}]`;
  }
  if (role === "exits" || role === "always_on_exits") {
    return `${strategyPath(index)}.trade_management.exit_policy.always_on.exits[${slot}]`;
  }
  if (role === "aligned_exits") {
    return `${strategyPath(index)}.trade_management.exit_policy.profiles.aligned.exits[${slot}]`;
  }
  if (role === "countertrend_exits") {
    return `${strategyPath(index)}.trade_management.exit_policy.profiles.countertrend.exits[${slot}]`;
  }
  if (role === "neutral_exits") {
    return `${strategyPath(index)}.trade_management.exit_policy.profiles.neutral.exits[${slot}]`;
  }
  if (role === "phase_rules") {
    return `${strategyPath(index)}.trade_management.exit_management.phase_rules[${slot}]`;
  }
  if (role === "always_on_management") {
    return `${strategyPath(index)}.trade_management.exit_management.always_on.rules[${slot}]`;
  }
  if (role === "aligned_management") {
    return `${strategyPath(index)}.trade_management.exit_management.profiles.aligned.rules[${slot}]`;
  }
  if (role === "countertrend_management") {
    return `${strategyPath(index)}.trade_management.exit_management.profiles.countertrend.rules[${slot}]`;
  }
  return `${strategyPath(index)}.trade_management.exit_management.profiles.neutral.rules[${slot}]`;
}
