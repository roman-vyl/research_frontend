import { dbgTimed } from "@/shared/diagnostics/pipelineDebug";
import {
  type CandlesWindowBundle,
  type ChartBar,
  type ChartMarketBundle,
  type EmaWindowBundle,
  type ComponentCatalog,
  type IndicatorPoint,
  type ManagedPolicyEventTrace,
  type RunDetail,
  type RunMetrics,
  type RunSummary,
  type RunTrades,
  type SignalTraceBundle,
  type ChartEventsBundle,
  type BacktestResult,
  type ConfigStateResponse,
  type RunBacktestRequest,
  type SaveConfigResult,
  type SerializeResult,
  type StrategyConfigDraft,
  type ValidationResult,
} from "@/api/types";
import type {
  ExperimentFilters,
  ExperimentManifest,
  ExperimentRegistry,
  ExperimentResults,
  ExperimentStorage,
  CalculationCoords,
  CalculationJob,
  CalculationPlan,
  CalculationStarted,
  RunDeletionPlan,
  RunDeletionResult,
} from "@/api/experiments";
import type { Candidate, CandidateCoordsRequest, CandidateList } from "@/api/candidates";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  /** Backend error code (`{ error }` of the service error body), when present. */
  readonly code: string | null;
  readonly details: Record<string, unknown>;

  constructor(status: number, detail: string, code: string | null = null, details: Record<string, unknown> = {}) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.code = code;
    this.details = details;
  }
}

async function readError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      detail?: string | { msg?: string }[];
      message?: string;
      error?: string;
      details?: Record<string, unknown>;
    };
    const code = typeof body.error === "string" ? body.error : null;
    const details = body.details && typeof body.details === "object" ? body.details : {};
    let detail = res.statusText;
    if (typeof body.detail === "string") {
      detail = body.detail;
    } else if (typeof body.message === "string") {
      detail = body.message;
    } else if (Array.isArray(body.detail)) {
      detail = body.detail.map((d) => d.msg ?? JSON.stringify(d)).join("; ");
    }
    return new ApiError(res.status, detail, code, details);
  } catch {
    return new ApiError(res.status, res.statusText);
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    throw await readError(res);
  }
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchRunSummaries(): Promise<RunSummary[]> {
  return requestJson<RunSummary[]>("/api/research/runs");
}

/** Canonical run identity/result/strategy_spec — one run, one strategy instance. */
export async function fetchRunDetail(runId: string): Promise<RunDetail> {
  return dbgTimed("api.fetchRunDetail", () =>
    requestJson<RunDetail>(`/api/research/runs/${encodeURIComponent(runId)}`),
  );
}

/** Canonical realised trades for one run. */
export async function fetchRunTrades(runId: string): Promise<RunTrades> {
  return dbgTimed("api.fetchRunTrades", () =>
    requestJson<RunTrades>(`/api/research/runs/${encodeURIComponent(runId)}/trades`),
  );
}

/** Canonical accounting summary for one run. */
export async function fetchRunMetrics(runId: string): Promise<RunMetrics> {
  return dbgTimed("api.fetchRunMetrics", () =>
    requestJson<RunMetrics>(`/api/research/runs/${encodeURIComponent(runId)}/metrics`),
  );
}

/** Canonical managed-policy event trace, optionally scoped to one trade's `position_id`. */
export async function fetchManagedPolicyEvents(params: {
  runId: string;
  positionId?: string | null;
  signal?: AbortSignal;
}): Promise<ManagedPolicyEventTrace> {
  const qs = new URLSearchParams();
  if (params.positionId) {
    qs.set("position_id", params.positionId);
  }
  const query = qs.toString();
  return dbgTimed("api.fetchManagedPolicyEvents", () =>
    requestJson<ManagedPolicyEventTrace>(
      `/api/research/runs/${encodeURIComponent(params.runId)}/managed-policy-events${query ? `?${query}` : ""}`,
      { signal: params.signal },
    ),
  );
}

/**
 * Per-bar entry pipeline trace for Chart Bar Inspector.
 *
 * The `instance_id` wire query param is Research Service's diagnostics
 * identity — it validates equality against the run's own `instance_id`
 * (see signal_trace projection).
 */
export async function fetchSignalTrace(params: {
  runId: string;
  instanceId: string;
  fromMs: number;
  toOpenTimeMs: number;
  contextOverlayRef?: string | null;
  signal?: AbortSignal;
}): Promise<SignalTraceBundle> {
  const qs = new URLSearchParams({
    instance_id: params.instanceId,
    from: String(params.fromMs),
    to_open_time_ms: String(params.toOpenTimeMs),
  });
  if (params.contextOverlayRef) {
    qs.set("context_overlay_ref", params.contextOverlayRef);
  }
  return dbgTimed("api.fetchSignalTrace", () =>
    requestJson<SignalTraceBundle>(
      `/api/research/runs/${encodeURIComponent(params.runId)}/signal-trace?${qs.toString()}`,
      { signal: params.signal },
    ),
  );
}

/** Sparse chart display bundle (markers + HTF overlays). See `fetchSignalTrace` re: `instance_id` param. */
export async function fetchChartEvents(params: {
  runId: string;
  instanceId: string;
  fromMs: number;
  toOpenTimeMs: number;
  contextOverlayRef?: string | null;
  signal?: AbortSignal;
}): Promise<ChartEventsBundle> {
  const qs = new URLSearchParams({
    instance_id: params.instanceId,
    from: String(params.fromMs),
    to_open_time_ms: String(params.toOpenTimeMs),
  });
  if (params.contextOverlayRef) {
    qs.set("context_overlay_ref", params.contextOverlayRef);
  }
  return dbgTimed("api.fetchChartEvents", () =>
    requestJson<ChartEventsBundle>(
      `/api/research/runs/${encodeURIComponent(params.runId)}/chart-events?${qs.toString()}`,
      { signal: params.signal },
    ),
  );
}

export function isApiBaseConfigured(): boolean {
  return API_BASE.length > 0;
}

function chartMarketQuery(params: {
  symbol: string;
  timeframe: string;
  fromMs: number;
  toOpenTimeMs: number;
}): URLSearchParams {
  return new URLSearchParams({
    symbol: params.symbol,
    timeframe: params.timeframe,
    from: String(params.fromMs),
    to_open_time_ms: String(params.toOpenTimeMs),
  });
}

/** Windowed OHLC candles with coverage metadata (split cold-load path). */
export async function fetchCandlesWindow(params: {
  symbol: string;
  timeframe: string;
  fromMs: number;
  toOpenTimeMs: number;
  signal?: AbortSignal;
}): Promise<CandlesWindowBundle> {
  const qs = chartMarketQuery(params);
  return dbgTimed("api.fetchCandlesWindow", () =>
    requestJson<CandlesWindowBundle>(`/api/market/candles-window?${qs.toString()}`, {
      signal: params.signal,
    }),
  );
}

/** Windowed canonical chart overlay EMA for one period (split cold-load path). */
export async function fetchEmaWindow(params: {
  symbol: string;
  timeframe: string;
  period: number;
  fromMs: number;
  toOpenTimeMs: number;
  originPolicy?: string;
  signal?: AbortSignal;
}): Promise<EmaWindowBundle> {
  const qs = chartMarketQuery(params);
  qs.set("period", String(params.period));
  qs.set("origin_policy", params.originPolicy ?? "canonical");
  return dbgTimed("api.fetchEmaWindow", () =>
    requestJson<EmaWindowBundle>(`/api/market/ema-window?${qs.toString()}`, {
      signal: params.signal,
    }),
  );
}

/**
 * @deprecated Legacy monolithic cold-load path. Workbench uses `fetchCandlesWindow` +
 * `fetchEmaWindow`. Retained for debug, tests, and rollback only.
 */
export async function fetchChartMarketBundle(params: {
  symbol: string;
  timeframe: string;
  fromMs: number;
  toOpenTimeMs: number;
  emaFast: number;
  emaAnchor: number;
  emaSlow: number;
  signal?: AbortSignal;
}): Promise<ChartMarketBundle> {
  const base = chartMarketQuery(params);
  const bundleQs = new URLSearchParams(base);
  bundleQs.set("ema_fast", String(params.emaFast));
  bundleQs.set("ema_anchor", String(params.emaAnchor));
  bundleQs.set("ema_slow", String(params.emaSlow));
  return dbgTimed("api.fetchChartMarketBundle", () =>
    requestJson<ChartMarketBundle>(`/api/market/chart-bundle?${bundleQs.toString()}`, {
      signal: params.signal,
    }),
  );
}

export async function fetchCandles(params: {
  symbol: string;
  timeframe: string;
  fromMs: number;
  /** Report ``data_range.to_open_time_ms``; BFF resolves exclusive end via Data Engine ``timeframe_ms``. */
  toOpenTimeMs: number;
}): Promise<ChartBar[]> {
  const qs = new URLSearchParams({
    symbol: params.symbol,
    timeframe: params.timeframe,
    from: String(params.fromMs),
    to_open_time_ms: String(params.toOpenTimeMs),
  });
  return requestJson<ChartBar[]>(`/api/market/candles?${qs.toString()}`);
}

/** Chart overlay EMA from BFF (`kind: chart_overlay_ema`). Not strategy/Data Engine indicators. */
export async function fetchChartOverlayEma(params: {
  symbol: string;
  timeframe: string;
  period: number;
  fromMs: number;
  toOpenTimeMs: number;
  signal?: AbortSignal;
}): Promise<IndicatorPoint[]> {
  const qs = new URLSearchParams({
    symbol: params.symbol,
    timeframe: params.timeframe,
    period: String(params.period),
    from: String(params.fromMs),
    to_open_time_ms: String(params.toOpenTimeMs),
  });
  return requestJson<IndicatorPoint[]>(`/api/market/indicators/ema?${qs.toString()}`, {
    signal: params.signal,
  });
}

export async function fetchComponentCatalog(
  strategyId = "ema_pullback",
): Promise<ComponentCatalog> {
  const qs = new URLSearchParams({ strategy_id: strategyId });
  return requestJson<ComponentCatalog>(`/api/research/component-catalog?${qs.toString()}`);
}

export async function validateConfigDraft(
  draft: StrategyConfigDraft,
): Promise<ValidationResult> {
  return postJson<ValidationResult>("/api/research/config/validate", draft);
}

export async function serializeConfigDraft(
  draft: StrategyConfigDraft,
  format: "json" | "yaml" = "json",
): Promise<SerializeResult> {
  const qs = new URLSearchParams({ format });
  return postJson<SerializeResult>(
    `/api/research/config/serialize?${qs.toString()}`,
    draft,
  );
}

export async function saveConfigDraft(
  draft: StrategyConfigDraft,
): Promise<SaveConfigResult> {
  return postJson<SaveConfigResult>("/api/research/config/save", { draft });
}

export async function fetchConfigState(
  strategyId = "ema_pullback",
): Promise<ConfigStateResponse> {
  const qs = new URLSearchParams({ strategy_id: strategyId });
  return requestJson<ConfigStateResponse>(`/api/research/configs/state?${qs.toString()}`);
}

export async function selectSavedConfig(
  strategyId: string,
  experimentId: string,
): Promise<ConfigStateResponse> {
  return requestJson<ConfigStateResponse>("/api/research/configs/selected", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ strategy_id: strategyId, experiment_id: experimentId }),
  });
}

export async function runBacktest(body: RunBacktestRequest): Promise<BacktestResult> {
  return dbgTimed("api.runBacktest", () => postJson<BacktestResult>("/api/research/backtests", body));
}

export async function fetchExperiments(): Promise<ExperimentRegistry> {
  return requestJson<ExperimentRegistry>("/api/research/experiments");
}

export async function fetchExperimentManifest(experimentId: string): Promise<ExperimentManifest> {
  return requestJson<ExperimentManifest>(
    `/api/research/experiments/${encodeURIComponent(experimentId)}`,
  );
}

/** Results are requested filtered (at least by one outer dimension): the full table is large. */
export async function fetchExperimentResults(params: {
  experimentId: string;
  filters: ExperimentFilters;
  columns?: string[];
  signal?: AbortSignal;
}): Promise<ExperimentResults> {
  const qs = new URLSearchParams();
  for (const [id, value] of Object.entries(params.filters)) {
    qs.set(id, String(value));
  }
  if (params.columns && params.columns.length > 0) {
    qs.set("columns", params.columns.join(","));
  }
  const query = qs.toString();
  return requestJson<ExperimentResults>(
    `/api/research/experiments/${encodeURIComponent(params.experimentId)}/results${query ? `?${query}` : ""}`,
    { signal: params.signal },
  );
}

const runsPath = (experimentId: string, action: string): string =>
  `/api/research/experiments/${encodeURIComponent(experimentId)}/runs/${action}`;

/** Dry run: how many runs, files and bytes a deletion would remove. Changes nothing. */
export async function planRunDeletion(experimentId: string, runIds: string[]): Promise<RunDeletionPlan> {
  return postJson<RunDeletionPlan>(runsPath(experimentId, "delete-plan"), { run_ids: runIds });
}

/** Irreversible: deletes the planned runs. A changed table or selection is `ApiError` 409 (`plan_stale`). */
export async function deleteRuns(experimentId: string, runIds: string[], planToken: string): Promise<RunDeletionResult> {
  return postJson<RunDeletionResult>(runsPath(experimentId, "delete"), { run_ids: runIds, plan_token: planToken });
}

/** Which of the sent rows can be calculated; `has_run` and other skip reasons come from the backend. Changes nothing. */
export async function planCalculation(experimentId: string, rows: CalculationCoords[]): Promise<CalculationPlan> {
  return postJson<CalculationPlan>(runsPath(experimentId, "calculate-plan"), { rows: rows.map((coords) => ({ coords })) });
}

/** Starts a calculation job for the planned rows. `ApiError` 409 with code `plan_stale` or `job_running`. */
export async function calculateRows(
  experimentId: string,
  rows: CalculationCoords[],
  planToken: string,
): Promise<CalculationStarted> {
  return postJson<CalculationStarted>(runsPath(experimentId, "calculate"), {
    rows: rows.map((coords) => ({ coords })),
    plan_token: planToken,
  });
}

const calculationPath = (experimentId: string, jobId: string, action = ""): string =>
  `/api/research/experiments/${encodeURIComponent(experimentId)}/calculations/${encodeURIComponent(jobId)}${action}`;

export async function getCalculation(experimentId: string, jobId: string): Promise<CalculationJob> {
  return requestJson<CalculationJob>(calculationPath(experimentId, jobId));
}

/** Asks the backend to stop the job; rows not yet calculated end as `cancelled`. */
export async function cancelCalculation(experimentId: string, jobId: string): Promise<CalculationJob> {
  return postJson<CalculationJob>(calculationPath(experimentId, jobId, "/cancel"), {});
}

/** Counts and size of one Experiment; `cached` never computes the size, `compute` does on a cache miss. */
export async function fetchExperimentStorage(
  experimentId: string,
  size: "cached" | "compute",
): Promise<ExperimentStorage> {
  return requestJson<ExperimentStorage>(
    `/api/research/experiments/${encodeURIComponent(experimentId)}/storage?size=${size}`,
  );
}

/** The candidate shortlist with the current state of each record's row. */
export async function listCandidates(): Promise<CandidateList> {
  return requestJson<CandidateList>("/api/research/candidates");
}

/** Stars a point by its coordinates only: the service builds the `candidate_id` (404 / 409 / 400 are `ApiError`). */
export async function starCandidate(experimentId: string, coords: CandidateCoordsRequest): Promise<Candidate> {
  return requestJson<Candidate>("/api/research/candidates", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ experiment_id: experimentId, coords }),
  });
}

export async function unstarCandidate(candidateId: string): Promise<{ removed: boolean }> {
  return requestJson<{ removed: boolean }>(`/api/research/candidates/${encodeURIComponent(candidateId)}`, {
    method: "DELETE",
  });
}
