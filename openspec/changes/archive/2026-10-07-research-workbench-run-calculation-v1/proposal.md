## Why

Research Service calculates Engine runs for Surface rows without a run and publishes
them only when the Engine reproduces the stored metrics (`research-run-calculation-v1`,
parity tolerances `research-calculation-parity-tolerance-v1`, research_service #23 and
#26). The Workbench has no way to call it, so today a calculation is a
hand-written script against the API.

## What Changes

- The existing selection bar (select mode, Ctrl/Cmd+click, Shift+drag, select passing
  / not passing) gets a second action, "Calculate (N)", next to "Delete runs (R)".
  N is the number of addressable rows behind the selected cells, with or without
  `run_id`; which of them can be calculated is decided by the backend plan.
- The action is available only when the Experiment manifest has a `materialize`
  block; otherwise it is shown disabled with the hint "This Surface cannot be
  calculated: no materialize in the manifest". It is disabled when N is 0 or above
  2 000 (the backend request limit).
- A dialog first calls `calculate-plan` and shows selected, calculable, has run
  and other skipped rows (by reason), and the rule that a row is published only when the Engine
  reproduces its stored metrics. "Calculate" sends `calculate` with the plan token.
- While the job runs the dialog shows progress by outcome and a "Cancel" button.
- At the end it shows published, parity failed, Engine failed, stale and cancelled
  rows, the metrics that differed for each failed row and the backup name; the
  selection is cleared and the slice is reloaded, so published points get "Open run".

## Capabilities

### New Capabilities

- `research-workbench-run-calculation-v1`: Calculate action over the selection, plan
  dialog, job progress and cancel, result and reload.

### Modified Capabilities

- None. Selection and the selection bar of `research-workbench-run-deletion-v1` are
  reused unchanged.

## Non-Goals

- Editing or creating `materialize` blocks, choosing parity rules, recalculating rows
  that already have a run (delete the run first), calculating across slices or
  Experiments, a job list or resuming a job after a page reload.
- Any call to `GET /api/research/runs`.

## Dependency

Consumes `POST .../runs/calculate-plan`, `POST .../runs/calculate`,
`GET .../calculations/{job_id}` and `POST .../calculations/{job_id}/cancel` of
research_service (merged; dac0f91). No backend change is needed.

## Impact

`src/features/surface` (selection bar action, dialog), `src/api` (four calls and
types), tests with mocked responses.
