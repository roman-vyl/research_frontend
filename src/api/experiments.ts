/**
 * Research Service Experiment API (read-only): registry, manifest, results.
 * The frontend speaks semantic ids from the manifest `result_schema`, never physical column names.
 */

export type ExperimentRegistryEntry = {
  experiment_id: string;
  title: string;
  ticker: string;
  anchor: string;
  manifest: string;
};

export type ExperimentRegistry = {
  registry_version: number;
  experiments: ExperimentRegistryEntry[];
};

export type GridColumn = { column: string; unit: string };

export type ExperimentDimension = {
  id: string;
  label?: string;
  column?: string;
  unit?: string;
  grid_column?: string;
  grids?: Record<string, GridColumn>;
  /** Off by default: a checkbox enables it, then it is a slider; rows without a value are the "off" rows. */
  optional?: boolean;
  /** Readable names of discrete values, keyed by the value as text (for example {"60": "1h"}). */
  labels?: Record<string, string>;
};

export type ExperimentMetric = {
  column: string;
  label: string;
  format: "fraction" | "number" | "integer";
  unit?: string;
  id?: string;
};

export type ExperimentArms = {
  column: string;
  roles: Record<string, "treatment" | "comparison">;
  baseline: string;
  match_on: string[];
};

export type ExperimentView = {
  id: string;
  x: string;
  y: string;
  controls: string[];
  default_metric: string;
  aggregate_over?: string[];
  filmstrip?: string;
};

export type ExperimentResultSchema = {
  contract_version: string;
  table: string;
  run_id_column: string;
  provenance: { value?: string; column?: string };
  row_columns?: Record<string, string>;
  dimensions: ExperimentDimension[];
  arms?: ExperimentArms;
  metrics: ExperimentMetric[];
  view: ExperimentView[];
};

export type ExperimentManifest = {
  experiment_id?: string;
  test_id?: string;
  result_schema: ExperimentResultSchema;
  [key: string]: unknown;
};

/** Columnar results: `data[k]` holds the values of `columns[k]`. */
export type ExperimentResults = {
  columns: string[];
  rows: number;
  data: (number | string | null)[][];
  /** Present when provenance is a table-wide constant. */
  provenance?: { value: string };
};

/** Semantic-id filters, for example `{ sl: 5, grid: "R", trigger: 7 }`. */
export type ExperimentFilters = Record<string, string | number>;

export function metricId(metric: ExperimentMetric): string {
  return metric.id ?? metric.column;
}
