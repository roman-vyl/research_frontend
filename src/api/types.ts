/** Mirrors canonical Research Service HTTP contracts — single source for UI types. */

/** JSON object maps in reports/config drafts (avoids bare `Record` under TS 5.8). */
export type JsonObject = Record<string, unknown>;

export type ChartBar = {
  /** Unix seconds (from `Candle.open_time_ms / 1000`) for Lightweight Charts. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

/** BFF overlay discriminator — not strategy features / not Data Engine indicators. */
export const CHART_OVERLAY_EMA_KIND = "chart_overlay_ema" as const;

export type IndicatorPoint = {
  time: number;
  value: number;
  kind: typeof CHART_OVERLAY_EMA_KIND;
};

export type AnchorStackEmaRole = "fast" | "anchor" | "slow";

export type AnchorStackPeriods = {
  fast: number;
  anchor: number;
  slow: number;
};

/** One anchor-stack overlay line (computed from chart candle closes, not research features). */
export type ChartEmaOverlay = {
  role: AnchorStackEmaRole;
  period: number;
  points: IndicatorPoint[];
};

export type ChartMarketBundle = {
  candles: ChartBar[];
  ema_overlays: ChartEmaOverlay[];
};

/** Coverage for `GET /api/market/candles-window`. */
export type CandlesWindowCoverage = {
  requested_from_ms: number;
  requested_to_ms: number;
  actual_from_ms: number;
  actual_to_ms: number;
  truncated: boolean;
};

/** Windowed candles only — no EMA overlays. */
export type CandlesWindowBundle = {
  candles: ChartBar[];
  coverage: CandlesWindowCoverage;
};

/** Coverage for `GET /api/market/ema-window` (canonical cache metadata always present in v1). */
export type EmaWindowCoverage = {
  requested_from_ms: number;
  requested_to_ms: number;
  actual_from_ms: number;
  actual_to_ms: number;
  calculation_origin_ms: number;
  coverage_to_ms: number;
  cache_hit: boolean;
  truncated: boolean;
};

/** Windowed chart overlay EMA — one period per response (no candles). */
export type EmaWindowBundle = {
  points: IndicatorPoint[];
  coverage: EmaWindowCoverage;
};

/** Non-anchor-stack EMA line (exit policy on chart TF or HTF context from signal trace). */
export type ChartAuxEmaOverlay = {
  id: string;
  label: string;
  period: number;
  timeframe: string;
  points: IndicatorPoint[];
  dashed: boolean;
};

/** MVP chart market timeframe (execution/research TF for Workbench). */
export const CHART_MARKET_TIMEFRAME = "5m" as const;

/** Canonical Research Service `MarketRange` — ticker/timeframe/window for one run. */
export type MarketRange = {
  ticker: string;
  timeframe: string;
  from_ms: number;
  to_ms: number;
};

/** Only the fields Workbench actually reads from `StrategyEvaluationResult`. */
export type StrategyEvaluationResult = {
  contract_version: string;
  strategy_id: string;
  strategy_version: string;
  instance_id: string;
  market: MarketRange;
  bar_count: number;
  market_data_hash: string;
};

/** Only the fields Workbench actually reads from `SingleInstanceBacktestResult`. */
export type SingleInstanceBacktestResult = {
  contract_version: string;
  run_id: string;
  instance_id: string;
  strategy_evaluation: StrategyEvaluationResult;
};

export type RunArtifactManifest = {
  contract_version: string;
  run_id: string;
  instance_id: string;
  created_at_utc: string;
  market_data_hash: string | null;
};

/** Canonical Research Service `RunDetail` (research_run_detail.v1) — one run, one strategy instance. */
export type RunDetail = {
  contract_version: string;
  manifest: RunArtifactManifest;
  result: SingleInstanceBacktestResult;
  strategy_spec: JsonObject;
};

/** Per-trade excursion/capture metrics (`TradeRecord.path`). Decimal fields arrive as strings. */
export type TradePathMetrics = {
  mfe_price: string;
  mfe_pct: string;
  mfe_bar_index: number;
  mfe_bars_from_entry: number;
  mae_price: string;
  mae_pct: string;
  mae_bar_index: number;
  mae_bars_from_entry: number;
  captured_price: string;
  captured_pct: string;
  capture_ratio: string | null;
  giveback_price: string | null;
  giveback_pct: string | null;
  bars_from_mfe_to_exit: number;
};

/** Canonical Research Service `TradeRecord` — one realised (closed) trade. Decimal fields are strings. */
export type TradeRecord = {
  trade_id: string;
  position_id: string;
  instance_id: string;
  side: "long" | "short";
  status: "closed";
  entry_bar_index: number;
  exit_bar_index: number;
  entry_time_ms: number;
  exit_time_ms: number;
  entry_price: string;
  exit_price: string;
  quantity: string;
  entry_notional: string;
  exit_notional: string;
  gross_pnl: string;
  entry_fee: string;
  exit_fee: string;
  fees_paid: string;
  net_pnl: string;
  gross_return_pct: string;
  net_return_pct: string;
  equity_before: string;
  equity_after: string;
  hold_bars: number;
  hold_ms: number;
  exit_candidate_type: string;
  exit_reason: string;
  exit_layer: string;
  exit_rule_id: string | null;
  exit_component_id: string | null;
  exit_kind: string | null;
  path: TradePathMetrics;
};

/** Canonical Research Service `RunTrades` (research_run_trades.v1). */
export type RunTrades = {
  contract_version: string;
  run_id: string;
  trades: TradeRecord[];
};

/** Canonical Research Service `RunMetrics` (research_run_metrics.v1). Decimal fields are strings. */
export type RunMetrics = {
  contract_version: string;
  run_id: string;
  initial_equity: string;
  final_equity: string;
  realised_trade_count: number;
  open_position_count: number;
  gross_pnl: string;
  fees_paid: string;
  net_pnl: string;
};

/** The four Engine-sourced managed-policy event types (`exit_rule_triggered` was never emitted; not modeled). */
export type ManagedPolicyEventType =
  | "phase_changed"
  | "active_stop_updated"
  | "active_take_updated"
  | "runtime_exit_triggered";

/** Canonical managed-policy event, correlated to a trade via `position_id` (not `trade_id`). */
export type ManagedPolicyEvent = {
  position_id: string;
  side: "long" | "short";
  time_ms: number;
  bar_index: number;
  event_type: ManagedPolicyEventType;
  rule_id: string | null;
  component_id: string | null;
  from_phase: string | null;
  to_phase: string | null;
  price: string | null;
  metadata: JsonObject;
};

/** Canonical Research Service `ManagedPolicyEventTrace` (research_managed_policy_events.v1). */
export type ManagedPolicyEventTrace = {
  contract_version: string;
  run_id: string;
  events: ManagedPolicyEvent[];
};

/** Mirrors Research Service `RunSummary` (research_run_summary.v1). Newest-first ordering by created_at_utc is a backend contract, not re-sorted here. */
export type RunSummary = {
  contract_version: string;
  run_id: string;
  created_at_utc: string;
  instance_id: string;
  strategy_id: string;
  strategy_version: string;
  ticker: string;
  timeframe: string;
  from_ms: number;
  to_ms: number;
  realised_trade_count: number;
  open_position_count: number;
  final_equity: string;
  net_pnl: string;
  market_data_hash: string | null;
};

export type ExecutionDraft = {
  init_cash?: number;
  fees?: number;
  slippage?: number;
};

export type StrategyConfigDraft = {
  config_version: number;
  experiment_id: string;
  strategy_id: string;
  execution: ExecutionDraft;
  instances: DeployableStrategyInstance[];
};

/** Canonical deployable strategy instance (canonical-strategy-instance-v1):
 * identity subset (strategy_id/ticker/base_timeframe/raw_spec) plus sibling
 * `enabled` deployment metadata. `enabled` never affects instance_id or
 * backtest evaluation. */
export type DeployableStrategyInstance = {
  enabled: boolean;
  strategy_id: string;
  ticker: string;
  base_timeframe: string;
  raw_spec: JsonObject;
};

export type ParamFieldSchema = {
  type: "integer" | "number" | "string" | "boolean" | "array";
  label?: string | null;
  min?: number | null;
  max?: number | null;
  enum?: string[] | null;
  default?: unknown;
};

export type ContextConsumptionPolicySchema = {
  policy_id: string;
  label: string;
  params_schema?: Record<string, ParamFieldSchema>;
};

export type ContextConsumptionRoleSchema = {
  role: string;
  label: string;
  policies: ContextConsumptionPolicySchema[];
};

export type ContextProviderSchema = {
  component_id: string;
  label: string;
  description?: string | null;
  params_schema?: Record<string, ParamFieldSchema>;
};

export type ComponentSchema = {
  component_id: string;
  role:
    | "direction"
    | "setup"
    | "trigger"
    | "blockers"
    | "exits"
    | "risk"
    | "exit_management";
  label: string;
  description?: string | null;
  /** Consumer roles this component may be authored under (e.g. exit_management.runtime_exit). */
  allowed_roles?: string[];
  params_schema?: Record<string, ParamFieldSchema>;
  /** When "nested", Composer nests params_schema keys under setup.params on save. */
  params_storage?: "flat" | "nested";
  list_slot?: boolean;
  supports_context_consumption?: boolean;
  context_consumption_policies?: ContextConsumptionPolicySchema[];
};

export type ComposerSectionSchema = {
  section_id: string;
  label: string;
  role?: string | null;
  list_slot?: boolean;
};

export type ComponentCatalog = {
  strategy_id: string;
  schema_version: number;
  sections: ComposerSectionSchema[];
  components: ComponentSchema[];
  context_providers?: ContextProviderSchema[];
  context_consumption_roles?: ContextConsumptionRoleSchema[];
};

export type ValidationErrorItem = {
  path: string;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  errors: ValidationErrorItem[];
};

export type SerializeResult = {
  ok: boolean;
  format: "json" | "yaml";
  content: string;
  errors: ValidationErrorItem[];
};

export type SaveConfigResult = {
  ok: boolean;
  path: string | null;
  errors: ValidationErrorItem[];
};

export type ConfigListEntry = {
  experiment_id: string;
  path: string;
  format: "json" | "yaml";
};

export type ConfigStateResponse = {
  strategy_id: string;
  selected_experiment_id: string | null;
  selected_path: string | null;
  draft: StrategyConfigDraft | null;
  configs: ConfigListEntry[];
};

/** Exactly one field — mutual exclusion enforced by BFF (422 if both or neither). */
export type RunBacktestRequest =
  | { draft: StrategyConfigDraft; config_path?: never }
  | { config_path: string; draft?: never };

export type BacktestResult = {
  ok: boolean;
  run_id: string | null;
  config_path: string | null;
  errors: ValidationErrorItem[];
};

export type SignalTraceGate =
  | "direction_ok"
  | "blockers_ok"
  | "setup_ok"
  | "trigger_ok"
  | "risk_ok"
  | "stop_ready";

export type SetupComponentRef = {
  instance_id: string;
  component_id: string;
};

export type SetupParamsEntry = SetupComponentRef &
  Record<string, number | string | boolean>;

export type SignalTraceMeta = {
  variant: string;
  component_ids: {
    direction: string;
    setups: SetupComponentRef[];
    trigger: string;
    risk: string;
  };
  setup_params: SetupParamsEntry[];
  trigger_params?: { lookback: number };
  blocker_instances: { instance_id: string; component_id: string }[];
};

export type SideSignalTrace = {
  direction_ok: boolean[];
  blockers_ok: boolean[];
  setup_ok: boolean[];
  trigger_ok: boolean[];
  risk_ok: boolean[];
  signal_entry: boolean[];
  stop_ready: boolean[];
  portfolio_entry: boolean[];
  internals: Record<string, unknown>;
};

export type HtfContextTrace = {
  state: ("up" | "down" | "neutral")[];
  fast: Array<number | null>;
  anchor: Array<number | null>;
  slow: Array<number | null>;
  meta: Record<string, unknown>;
};

/** HTF EMA overlay series for chart-events — no regime `state` (diagnostics use signal-trace). */
export type ChartEventsHtfContext = {
  fast: Array<number | null>;
  anchor: Array<number | null>;
  slow: Array<number | null>;
  meta: Record<string, unknown>;
};

export type ChartEventsCoverage = {
  schema_version: number;
  from_sec: number;
  to_sec: number;
  bar_count: number;
  requested_from_sec: number;
  requested_to_sec: number;
  truncated: boolean;
  max_bars: number;
};

/** Sparse chart display payload — no dense lanes or diagnostics trace. */
export type ChartEventsBundle = {
  times: number[];
  component_events: ComponentEvent[];
  htf_context: ChartEventsHtfContext;
  meta: SignalTraceMeta;
  coverage: ChartEventsCoverage;
};

export type ContextConsumptionTraceRecord = {
  role: string;
  component_id: string;
  context_ref: string;
  policy_id: string;
  context_applied: boolean[];
  instance_id?: string | null;
  setup_instance_id?: string | null;
  outcome?: Record<string, unknown> | null;
};

export type ComponentEventType = "point" | "span_start" | "span_end" | "source";

export type ComponentEventRole = "entry_block" | "exit_signal" | "setup";

export type ComponentEvent = {
  time: number;
  event_type: ComponentEventType;
  role: ComponentEventRole;
  side: "long" | "short";
  component_id: string;
  instance_id: string;
  label: string;
  tooltip?: string | null;
  span_id?: string | null;
  feature_family?: string | null;
  source_timeframe?: string | null;
  base_timeframe?: string | null;
  metadata: Record<string, unknown>;
};

export type SignalTraceBundle = {
  times: number[];
  meta: SignalTraceMeta;
  htf_context?: HtfContextTrace;
  context_consumption_trace?: ContextConsumptionTraceRecord[];
  component_events?: ComponentEvent[];
  long: SideSignalTrace;
  short: SideSignalTrace;
};

export type WorkbenchTab = "chart" | "composer" | "reports";

export function msToChartTime(openTimeMs: number): number {
  return Math.floor(openTimeMs / 1000);
}
