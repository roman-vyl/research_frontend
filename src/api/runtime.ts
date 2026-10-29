/**
 * Strategy Runtime read API, reached through the dev-server proxy `/runtime-api` (Runtime sends no CORS headers):
 * `GET /v1/strategy-instances`, the strategy instances registered in Runtime's deployment catalog, and
 * `PUT /v1/strategy-instances/{id}/enabled`, which switches a strategy on or off, and
 * `DELETE /v1/strategy-instances/{id}`, which removes a disabled strategy.
 */

export type RuntimeStrategyInstance = {
  strategy_instance_id: string;
  strategy_id: string;
  instrument: string;
  base_timeframe: string;
  /** The `enabled` value in the deployment file, changed through Runtime's enabled route. */
  enabled: boolean;
  source_path: string;
};

export type RuntimeInvalidFile = {
  source_path: string;
  error_code: string;
  error_message: string | null;
};

export type RuntimeDuplicateIdentity = {
  strategy_instance_id: string;
  source_paths: string[];
};

export type RuntimeStrategyList = {
  scanned_file_count: number;
  strategy_instances: RuntimeStrategyInstance[];
  invalid_files: RuntimeInvalidFile[];
  duplicate_identities: RuntimeDuplicateIdentity[];
};

export type RuntimeListErrorKind = "not_ready" | "catalog_unavailable" | "runtime_error" | "unreachable";

export class RuntimeListError extends Error {
  readonly kind: RuntimeListErrorKind;

  constructor(kind: RuntimeListErrorKind) {
    super(kind);
    this.name = "RuntimeListError";
    this.kind = kind;
  }
}

const RUNTIME_API_BASE = "/runtime-api";

async function runtimeBodyStatus(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && typeof (body as { status?: unknown }).status === "string") {
      return (body as { status: string }).status;
    }
  } catch {
    // not a Runtime body
  }
  return null;
}

/**
 * The strategy list. A failure is classified by what answered: Runtime's own status bodies map to
 * `not_ready` / `catalog_unavailable` / `runtime_error`; a network failure, a 502 / 504 or a 5xx without a
 * Runtime body (what the dev proxy answers when Runtime is down) is `unreachable`.
 */
export async function fetchRuntimeStrategyInstances(): Promise<RuntimeStrategyList> {
  let res: Response;
  try {
    res = await fetch(`${RUNTIME_API_BASE}/v1/strategy-instances`, { method: "GET" });
  } catch {
    throw new RuntimeListError("unreachable");
  }
  if (res.ok) {
    return (await res.json()) as RuntimeStrategyList;
  }
  const status = await runtimeBodyStatus(res);
  if (status === "not_ready") throw new RuntimeListError("not_ready");
  if (status === "catalog_unavailable") throw new RuntimeListError("catalog_unavailable");
  if (status === "internal_error") throw new RuntimeListError("runtime_error");
  if (res.status === 502 || res.status === 504 || (res.status >= 500 && status === null)) {
    throw new RuntimeListError("unreachable");
  }
  throw new RuntimeListError("runtime_error");
}

export type RuntimeTradeState = "flat" | "entry_pending" | "in_position";

export type RuntimeStrategyState = {
  strategy_instance_id: string;
  trade_state: RuntimeTradeState;
  trade_cycle_id: string | null;
  side: "long" | "short" | null;
  first_fill_at_ms: number | null;
  recovery_pending: "entry" | "close" | null;
};

function isStrategyState(x: unknown): x is RuntimeStrategyState {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.strategy_instance_id === "string" &&
    (o.trade_state === "flat" || o.trade_state === "entry_pending" || o.trade_state === "in_position") &&
    (o.side === null || o.side === "long" || o.side === "short") &&
    (o.recovery_pending === null || o.recovery_pending === "entry" || o.recovery_pending === "close")
  );
}

/**
 * Runtime's own stored trade state of every deployed strategy (`GET /v1/strategy-instance-states`): flat,
 * entry order placed, or in a position, as of the last processed bar. Read only. Any failure or invalid body
 * throws; there is no partial answer.
 */
export async function fetchRuntimeStrategyStates(): Promise<RuntimeStrategyState[]> {
  const res = await fetch(`${RUNTIME_API_BASE}/v1/strategy-instance-states`, { method: "GET" });
  if (!res.ok) throw new Error(`strategy-instance-states ${res.status}`);
  const body: unknown = await res.json();
  const items = (body as { strategy_instances?: unknown } | null)?.strategy_instances;
  if (!Array.isArray(items) || !items.every(isStrategyState)) throw new Error("invalid strategy-instance-states body");
  return items;
}

export type RuntimeEnabledChanged = {
  strategy_instance_id: string;
  enabled: boolean;
  cancelled_entry_order: boolean;
};

/**
 * A switch that did not happen. `reason` is Runtime's own refusal code, read only from a body whose status is
 * `enabled_change_refused`; for any other answer (or none) it is null.
 */
export class RuntimeEnabledError extends Error {
  readonly reason: string | null;

  constructor(reason: string | null) {
    super(reason ?? "unexpected_answer");
    this.name = "RuntimeEnabledError";
    this.reason = reason;
  }
}

/** Sets `enabled` of one strategy through Runtime; Runtime checks position and order state before it changes the file. */
export async function setRuntimeStrategyEnabled(
  strategyInstanceId: string,
  enabled: boolean,
): Promise<RuntimeEnabledChanged> {
  let res: Response;
  try {
    res = await fetch(`${RUNTIME_API_BASE}/v1/strategy-instances/${encodeURIComponent(strategyInstanceId)}/enabled`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  } catch {
    throw new RuntimeEnabledError(null);
  }
  if (res.ok) {
    // a 2xx counts as a switch only when its body confirms this instance and this value
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new RuntimeEnabledError(null);
    }
    const b = body && typeof body === "object" ? (body as Partial<RuntimeEnabledChanged>) : null;
    if (
      !b ||
      b.strategy_instance_id !== strategyInstanceId ||
      b.enabled !== enabled ||
      typeof b.cancelled_entry_order !== "boolean"
    ) {
      throw new RuntimeEnabledError(null);
    }
    return b as RuntimeEnabledChanged;
  }
  let reason: string | null = null;
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object") {
      const b = body as { status?: unknown; reason?: unknown };
      if (b.status === "enabled_change_refused" && typeof b.reason === "string") reason = b.reason;
    }
  } catch {
    // not a Runtime body
  }
  throw new RuntimeEnabledError(reason);
}

export type RuntimeOperatorCommand = "close-position" | "cancel-entry-orders";

/**
 * An operator command that did not complete. `reason` is Runtime's own refusal code, read only from a body whose
 * status is `enabled_change_refused`; `httpStatus` is null when Runtime did not answer at all.
 */
export class RuntimeCommandError extends Error {
  readonly reason: string | null;
  readonly httpStatus: number | null;

  constructor(reason: string | null, httpStatus: number | null) {
    super(reason ?? "unexpected_answer");
    this.name = "RuntimeCommandError";
    this.reason = reason;
    this.httpStatus = httpStatus;
  }
}

/**
 * Sends one operator command (close the position, or cancel the entry order) for one strategy. Runtime disables the
 * strategy as part of either command. A 2xx counts only when its body confirms this instance and `enabled: false`.
 */
export async function sendRuntimeCommand(
  strategyInstanceId: string,
  command: RuntimeOperatorCommand,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${RUNTIME_API_BASE}/v1/strategy-instances/${encodeURIComponent(strategyInstanceId)}/${command}`, {
      method: "POST",
    });
  } catch {
    throw new RuntimeCommandError(null, null);
  }
  if (res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new RuntimeCommandError(null, res.status);
    }
    const b = body && typeof body === "object" ? (body as { strategy_instance_id?: unknown; enabled?: unknown }) : null;
    if (!b || b.strategy_instance_id !== strategyInstanceId || b.enabled !== false) {
      throw new RuntimeCommandError(null, res.status);
    }
    return;
  }
  let reason: string | null = null;
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object") {
      const b = body as { status?: unknown; reason?: unknown };
      if (b.status === "enabled_change_refused" && typeof b.reason === "string") reason = b.reason;
    }
  } catch {
    // not a Runtime body
  }
  throw new RuntimeCommandError(reason, res.status);
}

export type RuntimeStrategyDeleted = {
  strategy_instance_id: string;
  deleted: true;
  cancelled_entry_order: boolean;
  trash_file?: string;
};

/**
 * A delete that did not happen. `reason` is Runtime's own refusal code, read only from a body whose status is
 * `delete_refused`; for any other answer (or none) it is null.
 */
export class RuntimeDeleteError extends Error {
  readonly reason: string | null;

  constructor(reason: string | null) {
    super(reason ?? "unexpected_answer");
    this.name = "RuntimeDeleteError";
    this.reason = reason;
  }
}

/** Deletes one strategy through Runtime: a disabled, settled strategy's file moves to Runtime's trash directory. */
export async function deleteRuntimeStrategy(strategyInstanceId: string): Promise<RuntimeStrategyDeleted> {
  let res: Response;
  try {
    res = await fetch(`${RUNTIME_API_BASE}/v1/strategy-instances/${encodeURIComponent(strategyInstanceId)}`, {
      method: "DELETE",
    });
  } catch {
    throw new RuntimeDeleteError(null);
  }
  if (res.ok) {
    // a 2xx counts as a delete only when its body confirms this instance
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new RuntimeDeleteError(null);
    }
    const b = body && typeof body === "object" ? (body as Partial<RuntimeStrategyDeleted>) : null;
    if (
      !b ||
      b.strategy_instance_id !== strategyInstanceId ||
      b.deleted !== true ||
      typeof b.cancelled_entry_order !== "boolean"
    ) {
      throw new RuntimeDeleteError(null);
    }
    return b as RuntimeStrategyDeleted;
  }
  let reason: string | null = null;
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object") {
      const b = body as { status?: unknown; reason?: unknown };
      if (b.status === "delete_refused" && typeof b.reason === "string") reason = b.reason;
    }
  } catch {
    // not a Runtime body
  }
  throw new RuntimeDeleteError(reason);
}

export type RuntimeEmaStackEntry = {
  role: "fast" | "anchor" | "slow";
  /** As Engine's plan states it: the literal "base" (the strategy's base timeframe) or a concrete timeframe. */
  timeframe: string;
  period: number;
  source: string;
};

export type RuntimeEpisodeEntry = {
  episode_ref: string;
  /** Engine's effective episode parameters, unchanged. */
  params: Record<string, number>;
};

export type RuntimeChartLayers = {
  strategy_instance_id: string;
  ema_stack: RuntimeEmaStackEntry[];
  episodes: RuntimeEpisodeEntry[];
};

/** A chart-layers read that did not give a valid answer; `reason` is Runtime's own code when it sent one. */
export class RuntimeChartLayersError extends Error {
  readonly reason: string | null;

  constructor(reason: string | null) {
    super(reason ?? "unexpected_answer");
    this.name = "RuntimeChartLayersError";
    this.reason = reason;
  }
}

const STACK_ROLES = ["fast", "anchor", "slow"] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Strict check of a 200 body: anything not exactly the documented shape is not an answer. */
function parseChartLayers(body: unknown, strategyInstanceId: string): RuntimeChartLayers | null {
  if (!isObject(body) || body.strategy_instance_id !== strategyInstanceId) return null;
  const { ema_stack: stack, episodes } = body;
  if (!Array.isArray(stack) || stack.length !== STACK_ROLES.length || !Array.isArray(episodes)) return null;
  const emaStack: RuntimeEmaStackEntry[] = [];
  for (const [index, raw] of stack.entries()) {
    if (!isObject(raw)) return null;
    const { role, timeframe, period, source } = raw;
    if (
      role !== STACK_ROLES[index] ||
      typeof timeframe !== "string" ||
      timeframe === "" ||
      typeof period !== "number" ||
      !Number.isInteger(period) ||
      period < 1 ||
      typeof source !== "string"
    ) {
      return null;
    }
    emaStack.push({ role: STACK_ROLES[index]!, timeframe, period, source });
  }
  const parsedEpisodes: RuntimeEpisodeEntry[] = [];
  for (const raw of episodes) {
    if (!isObject(raw) || typeof raw.episode_ref !== "string" || !isObject(raw.params)) return null;
    const params: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw.params)) {
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      params[key] = value;
    }
    parsedEpisodes.push({ episode_ref: raw.episode_ref, params });
  }
  return { strategy_instance_id: strategyInstanceId, ema_stack: emaStack, episodes: parsedEpisodes };
}

/**
 * The EMA stack and the episode parameters one strategy uses, as Engine's feature plan resolves them
 * (`GET /v1/strategy-instances/{id}/chart-layers`). Read only; sent when a strategy is selected and on Refresh.
 */
export async function fetchRuntimeChartLayers(
  strategyInstanceId: string,
  signal?: AbortSignal,
): Promise<RuntimeChartLayers> {
  let res: Response;
  try {
    res = await fetch(
      `${RUNTIME_API_BASE}/v1/strategy-instances/${encodeURIComponent(strategyInstanceId)}/chart-layers`,
      { method: "GET", signal },
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new RuntimeChartLayersError(null);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // not JSON
  }
  if (res.ok) {
    const layers = parseChartLayers(body, strategyInstanceId);
    if (layers === null) throw new RuntimeChartLayersError(null);
    return layers;
  }
  let reason: string | null = null;
  if (isObject(body) && body.status === "chart_layers_refused" && typeof body.reason === "string") {
    reason = body.reason;
  }
  throw new RuntimeChartLayersError(reason);
}
