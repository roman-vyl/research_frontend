/**
 * Central Journal read API, reached through the dev-server proxy `/journal-api`:
 * `GET /v1/events` (stored `live_entry_evaluated` events of one strategy for a bar range, all of
 * them when no `limit` is passed) and `GET /v1/strategy-instances` (evaluated bar range per strategy).
 */

export type JournalDesiredEntry = {
  side?: string;
  source_plan_bar_open_time_ms?: number;
  planned_entry_price?: unknown;
  initial_stop_price?: unknown;
  initial_take_price?: unknown;
  locked_exit_profile?: string;
};

export type JournalEvent = {
  event_id: string;
  occurred_at: string;
  bar_open_time_ms: number;
  /** The stored Runtime line; `payload.desired_entry` is `null` or an object, read by `runtimeProjection`. */
  body: { payload?: { desired_entry?: unknown } } & Record<string, unknown>;
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
    event_type: "live_entry_evaluated",
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
