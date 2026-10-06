## Context

Facts from the code (branch `feature/research-workbench-surface-view-v1`, 1ae1c25,
and research_service main 5bf10f0):

- `useExperimentData` loads one slice of results filtered by the outer control
  (`fetchExperimentResults({ filters: { [outerId]: value } })`) and caches it by
  `experimentId|outerId|value`. The full table is never requested.
- Each row may carry `run_id`; `HeatStage` marks cells with a run (`sx-run`) and
  `CellDetails` offers "Open run" only for a non-empty `run_id`.
- A heat map cell can stand for more than one row (`aggregate_over`, arms).
- Backend routes (`api/routers/experiments.py`, `adapters/experiments/run_deletion.py`):
  - `delete-plan` body `{ run_ids }` → `{ run_count, file_count, bytes,
    already_absent, skipped: [{ run_id, reason }], plan_token }`, changes nothing;
  - `delete` body `{ run_ids, plan_token }` → `{ deleted, already_absent,
    cleared_rows, file_count, bytes, skipped, backup }`; `409 plan_stale` when the
    table or the list differs from the plan; unknown Experiment `404`;
  - skip reasons: `invalid_run_id`, `not_in_experiment`,
    `shared_with_other_experiment`, `not_a_directory`.
- The results route reads the table through a cache keyed by path, mtime and size,
  so the reload after deletion sees the rewritten table.

## Decisions

### D1. Selection is a set of cells of the visible slice

Selection state lives in `SurfaceView` as a set of cell keys (x, y) of the current
view. It is cleared when the Experiment, the outer slice, the grid, the arm view or
any fixed control changes, so it can never hold cells the user does not see. It does
not touch `selected` (the point shown in CellDetails) or `selectedRunId`.

The run ids sent to the backend are the distinct non-empty `run_id` of all rows
behind the selected cells **in the current slice and current controls** (every row a
cell aggregates, every arm the cell shows). Rows without `run_id` are not sent.
The run count R shown in the selection bar and on "Delete runs (R)" is the size of
this distinct set, not the number of cells with a run; a cell counts as "without
run" when none of its rows has a `run_id`.

### D1a. Selection mode

A "Select" button turns on a selection mode held in `SurfaceView`. In the mode a plain
click toggles a cell, a drag selects a rectangle (no modifier key needed), and the
selection bar with the counts and "Delete runs (R)" is shown. "Done" or Esc leaves
the mode and clears the selection; a slice or control change clears the selection but
keeps the mode. Outside the mode a plain click shows the point in CellDetails as
before; Ctrl/Cmd+click and Shift+drag stay as shortcuts and turn the mode on. The
filter buttons also turn the mode on.

### D2. Filters decide only the two bulk buttons

"Select passing" and "Select not passing" use the same pass test that greys cells
today. Manual toggling ignores filters: a greyed cell can be selected by hand.

### D3. Plan, then typed confirmation

"Delete runs (R)", where R is the number of distinct non-empty `run_id` behind
the selected cells (D1), opens a dialog that calls `delete-plan` at once. The dialog shows
`run_count`, `file_count`, `bytes` as GB with two decimals, `already_absent` and the
skipped list grouped by reason. The confirm button is enabled only when the typed
number equals `run_count` and `run_count > 0`. Confirm sends `delete` with the same
`run_ids` and the `plan_token`. The plan is not reused after the dialog closes.

On `409 plan_stale` the dialog shows "The table or the selection changed since the
plan" and a button that requests a new plan; nothing is reported as deleted. Other
errors show the backend `{ error, message }` text.

### D4. After deletion

The dialog shows `deleted`, `already_absent`, freed GB (`bytes`) and `backup`. The
selection is cleared, the slice cache of this Experiment is dropped and the current
slice is requested again (the same filtered request as today). If the selected point
lost its run, CellDetails shows its metrics and "Open run" is replaced by the hint
"no full run". If `selectedRunId` equals a deleted run, it is left as is: Chart and
Reports then show their existing not-found error; no new state is added.

### D5. No run list

Nothing in this change calls `GET /api/research/runs` or
`refreshRunsAndSelectRun`. The cell marks come only from `run_id` in the reloaded
slice.

## Risks / Trade-offs

- Deletion is irreversible; safeguards are the dry run, the typed count, the backend
  token, the table backup and the journal.
- A script writing the same `runs.csv` during the delete is not detected by the
  token; the dialog text warns about it (backend design D6).
- A selection of tens of thousands of runs makes a large request body and a plan that
  stats every run; acceptable for the expected size (backend measured 0.86 s for
  12 672 runs).
