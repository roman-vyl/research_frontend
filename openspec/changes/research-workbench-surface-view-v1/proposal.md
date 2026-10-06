## Why

Research results are persisted as Experiments (a manifest plus a ready-made result
table, owned and served by Research Service). The workbench cannot show them, and
a result point cannot be opened as a run. The workbench also still selects the
newest run from the full run list at startup and offers a run dropdown over that
list, which does not fit navigating from research results.

This change adds the Surface tab: a viewer of an Experiment's ready-made metrics
whose only link to the existing workbench is `setSelectedRunId(run_id)`.

## What Changes

- Add the **Surface tab** (`Chart | Surface | Reports | Strategy Composer`) that
  consumes the Research Service Experiment API: default Surface tab with Experiment cards, views
  declared by the manifest `view` descriptor (including the trailing trigger
  filmstrip), controls with explicit units, filters, and a per-point CellDetails
  panel. All Surface state is local to `SurfaceView`.
- A point with a `run_id` offers an explicit "Open run" that calls the existing
  `setSelectedRunId(run_id)` and opens Chart; a point without one shows its
  metrics only.
- Make the context-bar run dropdown **legacy** (hidden, code kept, selected run id
  shown read-only).
- Start the workbench with `selectedRunId = null` and an explicit idle state in
  Chart and Reports; stop calling `/api/research/runs` at startup. Existing
  Composer behaviour stays functional.

## Capabilities

### New Capabilities

- `research-workbench-surface-view-v1`: Surface tab, point details with an
  explicit run action, legacy run dropdown, startup without a selected run.

### Modified Capabilities

- None.

## Non-Goals

- Defining or changing the Experiment API, manifest schema, result tables, run
  storage or data preparation (owned by Research Service, change
  `research-surface-workbench-v1`).
- Computing trading metrics, reading HTML, discovering or resolving runs.
- A Surface provider or global Surface state, arbitrary-axis rendering, layout or
  widget DSLs, a URL contract for the selected run, changes to the chart runtime,
  report loading dependencies or trade-focus behaviour.

## Dependency

Consumes `GET /api/research/experiments`, `GET /api/research/experiments/{id}` and
`GET /api/research/experiments/{id}/results` from Research Service
(`research_service` OpenSpec change `research-surface-workbench-v1`, PR 18). It
needs the backend change to be implemented to run against real data; tests use
mocked API responses.

## Impact

- `research_frontend`: Surface tab and components, API client and types, context
  bar, startup/report-status handling, tests.
- No Research Service or Strategy Engine change in this repository's change.
