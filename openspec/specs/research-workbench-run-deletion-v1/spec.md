# research-workbench-run-deletion-v1 Specification

## Purpose
Let the Workbench user select Surface cells (by hand or by filters) and delete the Engine run
bundles behind them through the Research Service, keeping the Surface rows and metrics.

## Requirements
### Requirement: Selection acts on the visible slice

Under "Displayed grid" selection SHALL include only cells of the currently displayed slice
and controls (under "All settings" see research-workbench-filter-scope-v1).
Changing the Experiment, the outer slice, the grid, the arm view or any fixed control
SHALL clear the selection. Selection SHALL NOT change the point shown in CellDetails
or `selectedRunId`.

#### Scenario: Slice change clears selection

- **WHEN** the user selects cells and then changes SL
- **THEN** the selection is empty.

### Requirement: Selection tools

The user SHALL be able to toggle a cell with Ctrl/Cmd+click, select a rectangle with
Shift+drag, and select all visible cells that pass or that do not pass the active
filters. Outside select mode a plain click SHALL keep its current meaning (show the
point in CellDetails).

#### Scenario: Bulk select by filters

- **WHEN** filters grey out some cells and the user presses "Select not passing"
- **THEN** exactly the greyed visible cells are selected.

### Requirement: Select mode

The selection bar SHALL have a "Select cells" button that turns select mode on. In
select mode a plain click SHALL toggle a cell, a plain drag SHALL add a rectangle of
cells, and the point shown in CellDetails SHALL NOT change. "Done selecting" or Esc
SHALL turn select mode off and keep the selected cells; after that a plain click SHALL
show the point in CellDetails again.

#### Scenario: Pick by click in select mode

- **WHEN** the user presses "Select cells" and clicks a cell twice
- **THEN** the cell is selected after the first click and not selected after the second, and CellDetails is not opened.

#### Scenario: Leave select mode

- **WHEN** the user drags over a rectangle in select mode and presses Esc
- **THEN** the rectangle stays selected and a plain click on a cell shows its point in CellDetails.

### Requirement: Run ids of a selection

The run ids of a selection SHALL be the distinct non-empty `run_id` values of all
rows behind the selected cells in the current slice and controls. Rows without
`run_id` SHALL NOT be sent.

#### Scenario: Aggregated cell

- **WHEN** a selected cell stands for three rows, two of them with `run_id`
- **THEN** both run ids are sent and the cell counts as having a run.

### Requirement: Delete runs action

The selection bar SHALL show the number of selected cells, the run count and the
number of selected cells without a run, and a "Delete runs (R)" action over the run
ids of the selection. The run count R in the bar and on the action SHALL be the number
of distinct non-empty `run_id` behind the selected cells, not the number of cells with
a run. The action SHALL be disabled when R is 0.

#### Scenario: Run count is distinct run ids

- **WHEN** two selected cells stand for five rows with three distinct non-empty `run_id`
- **THEN** the bar and the action show 3 runs.

#### Scenario: Only replay cells selected

- **WHEN** no selected cell has a `run_id`
- **THEN** "Delete runs" is disabled.

### Requirement: Dry run and typed confirmation

"Delete runs" SHALL first call `delete-plan` and show the run count, file count,
size in GB, already absent runs and skipped runs with their reasons. `delete` SHALL be
sent only after the user types a number equal to the planned run count, with the
plan's `plan_token`. The dialog SHALL state that the result table is rewritten and
that no script may write the same table meanwhile.

#### Scenario: Wrong count typed

- **WHEN** the plan reports 47 runs and the user types 46
- **THEN** the confirm button stays disabled and nothing is sent.

#### Scenario: Stale plan

- **WHEN** `delete` answers 409 `plan_stale`
- **THEN** nothing is reported as deleted and the dialog offers to request a new plan.

### Requirement: Surface unchanged after deletion

After a successful deletion the dialog SHALL show deleted and already absent runs,
freed GB and the backup name; the selection SHALL be cleared and the current slice
SHALL be reloaded. Cell values, colors and filters SHALL be unchanged and "Open run"
SHALL be unavailable for points without `run_id`.

#### Scenario: Open run after deletion

- **WHEN** a point whose run was deleted is shown in CellDetails
- **THEN** its metrics are shown and "Open run" is replaced by the hint "no full run".

### Requirement: No run list request

Selection, deletion and the reload after it SHALL NOT call `GET /api/research/runs`.

#### Scenario: Request log

- **WHEN** a deletion completes in a test with mocked fetch
- **THEN** no request to `/api/research/runs` was made.

