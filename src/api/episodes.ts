/**
 * Strategy Engine EMA stack episode history (`ema-stack-episode-query-v1`), passed through unchanged by
 * Research Service `POST /api/market/ema-stack-episodes/history`. All times are ms.
 */

export type EpisodeSide = "long" | "short";

export type EpisodeParams = {
  fast_period: number;
  anchor_period: number;
  slow_period: number;
  window_bars?: number;
  break_bars?: number;
};

export type EpisodeHistoryRequest = {
  market: { ticker: string; base_timeframe: string };
  episode: EpisodeParams;
  side: EpisodeSide;
  page?: { before_start_ms: number | null; limit: number };
  expected_market_data_hash?: string;
};

export type EpisodeZone = {
  number: number;
  start: number;
  end: number;
  high: number;
  low: number;
  has_false_break: boolean;
  final: boolean;
  known_at: number | null;
};

export type EpisodeFalseBreak = {
  number: number;
  start: number;
  end: number | null;
  high: number;
  low: number;
  depth: number;
  outcome: "comeback" | "stack_break" | null;
  final: boolean;
  known_at: number | null;
};

export type EpisodeLeg = { high: number | null; low: number | null };

export type EpisodeWave = {
  number: number;
  origin: number | null;
  origin_price: number | null;
  peak: number | null;
  peak_price: number | null;
  touch: number | null;
  touch_price: number | null;
  up_leg: EpisodeLeg;
  down_leg: EpisodeLeg;
  final: boolean;
  known_at: number | null;
  stack_break?: number | null;
};

export type EpisodePhase = "away" | "in_zone" | "in_false_break";

export type Episode = {
  start_ms: number;
  stack_break_ms: number | null;
  censored: boolean;
  touches: number;
  false_breaks_count: number;
  zones: EpisodeZone[];
  false_breaks: EpisodeFalseBreak[];
  waves: EpisodeWave[];
  /** Only on `current`. */
  touch_number?: number | null;
  phase?: EpisodePhase | null;
};

export type EpisodeHistoryPage = {
  history_id: string;
  market: { ticker: string; base_timeframe: string; earliest_ms: number; as_of_ms: number };
  episode: Required<EpisodeParams>;
  params_hash: string;
  market_data_hash: string;
  side: EpisodeSide;
  current: Episode | null;
  episodes: Episode[];
  next_before_start_ms: number | null;
};

/** The part of Engine's strategy feature plan the Workbench reads: effective episode parameters per ref. */
export type StrategyFeaturePlan = {
  episode_params_by_ref?: Record<string, Record<string, number>>;
};
