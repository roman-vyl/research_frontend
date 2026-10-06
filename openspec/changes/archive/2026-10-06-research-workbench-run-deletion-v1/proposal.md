## Why

Surface shows points from the Experiment result table; only "Open run" needs an
Engine run bundle. Bundles of junk points take tens of gigabytes. Research Service
already deletes selected runs and keeps their rows (`research-run-deletion-v1`,
research_service #19, main b8cb312). The Workbench has no way to choose points and
call it, so today deletion is only possible by hand.

## What Changes

- Selection on the Surface heat map: a "Select cells" select mode in which a plain
  click toggles a cell and a plain drag selects a rectangle; outside the mode
  Ctrl/Cmd+click toggles a cell and Shift+drag selects a rectangle; two buttons
  select the visible cells that pass or do not pass the active filters. Selection acts on the **visible slice only** (the
  loaded outer slice, for example SL, plus the current grid, arm and fixed
  controls), never on the whole Experiment.
- A selection bar: "N cells selected · R runs · B cells without run" and one action
  "Delete runs (R)", disabled when R is 0. R is the number of distinct non-empty
  `run_id` behind the selected cells, not the number of cells with a run.
- A dialog that first calls `delete-plan` (dry run) and shows runs, files, size in
  GB and skipped runs with reasons, then sends `delete` only after the user types the
  planned run count. It says that the result table is rewritten and that no script
  may be writing the same table meanwhile. A `409 plan_stale` answer asks for a new
  plan.
- After deletion the result shows deleted runs, already absent runs, freed GB and the
  backup file name; the current slice is reloaded; cell values, colors and filters
  stay as they were; "Open run" is unavailable for points without `run_id`.

## Capabilities

### New Capabilities

- `research-workbench-run-deletion-v1`: selection on the visible slice, delete
  action, plan and typed confirmation, result and reload.

### Modified Capabilities

- None. `research-workbench-surface-view-v1` (open, not archived) is extended, not
  changed: Open run already requires a non-empty `run_id`.

## Non-Goals

- Calculating or restoring runs, jobs, progress, undo, trash, a "pruned" state.
- Deleting across slices or Experiments, deleting rows or Experiments.
- Any change to Chart, run loading, `WorkbenchContext` or `selectedRunId` rules.
- Any call to `GET /api/research/runs` (it reads and hashes every run folder and
  loads the server for minutes); neither deletion nor the reload after it uses it.
- Surface size and run counts on the cards (separate change
  `research-workbench-surface-storage-v1`).

## Dependency

Consumes `POST /api/research/experiments/{experiment_id}/runs/delete-plan` and
`POST /api/research/experiments/{experiment_id}/runs/delete` (merged and deployed).
No backend change is needed.

## Impact

`src/features/surface` (selection state in `SurfaceView`, selection bar, dialog),
`src/api` (two calls and types), tests with mocked responses.
