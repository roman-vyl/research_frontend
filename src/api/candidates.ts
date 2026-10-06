/**
 * Research Service candidate shortlist API (`/api/research/candidates`): points of an Experiment surface
 * the owner starred. The record outlives run deletion and table recalculation.
 */

/** Coordinates sent on star: numbers as numbers, grid / arm ids as text, `null` for an empty row cell. */
export type CandidateCoordsRequest = Record<string, number | string | null>;

/** Coordinates of a stored record: canonical values as text (`"6"`, `"7.5"`, `"R"`), `null` for an empty cell. */
export type CandidateCoords = Record<string, string | null>;

export type CandidateMeaning = {
  experiment_id: string;
  title: string;
  ticker: string;
  anchor: string;
  coords: {
    id: string;
    label: string;
    value: number | string | null;
    unit: string | null;
    component_id?: string | null;
    component_param?: string | null;
  }[];
  fixed_params: Record<string, unknown> | null;
};

export type CandidateRowState = "same" | "changed" | "missing" | "ambiguous";

export type CandidateCurrent = {
  row_state: CandidateRowState;
  run_id: string | null;
  provenance: string | null;
  metrics: Record<string, number | null> | null;
  meaning: CandidateMeaning | null;
};

/** Spec of the picked run as the run request stored it at the time of the star: historical, never current. */
export type CandidateSpecSnapshot =
  | { source: "run_request"; run_id: string; spec: Record<string, unknown> }
  | { source: null; run_id: string; reason: string };

export type Candidate = {
  candidate_id: string;
  experiment_id: string;
  coords: CandidateCoords;
  picked_at: string;
  fingerprint_fields: string[];
  fingerprint: string;
  table_key: { mtime_ns: number; size: number };
  snapshot: {
    metrics: Record<string, number | null>;
    provenance: string | null;
    run_id: string | null;
    row_columns: Record<string, string | null>;
  };
  strategy_spec_snapshot: CandidateSpecSnapshot | null;
  /** Present on the list only. */
  current?: CandidateCurrent;
};

export type CandidateList = { candidates: Candidate[] };
