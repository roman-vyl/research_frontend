# research-workbench-filter-scope-v1 Specification

## Purpose
Every Research Workbench Surface lets the user evaluate its filter conditions either on the displayed grid or across all settings of the Experiment, from one columnar snapshot of the result table.
## Requirements
### Requirement: Filter scope switch on every Surface

The Filters panel SHALL offer a scope switch with two options, "Displayed grid"
(default) and "All settings", on every Experiment, derived only from the manifest
`result_schema`. The "All settings" label SHALL name the controls of the cells view
other than its `x` and `y`.

#### Scenario: any manifest
- **WHEN** any registered Experiment is opened
- **THEN** the switch is shown with "Displayed grid" selected and filters behave as before

### Requirement: All settings evaluation

Under "All settings" the active conditions SHALL be evaluated on every treatment
row of the Experiment across all outer slice values, grids, control values and
optional dimensions. Δ conditions SHALL use the matched comparison row. Top / bottom
% SHALL rank all those rows.

#### Scenario: match counted outside the displayed slice
- **WHEN** a row with SL different from the displayed SL passes all conditions
- **THEN** it is counted in its x × y cell and in the summary

#### Scenario: top / bottom % is global over all settings, not per cell
- **GIVEN** 2 cells A and B with 5 settings each; Net PnL in A is 1, 2, 3, 4, 5 and in B is 6, 7, 8, 9, 10
- **WHEN** the only condition is Net PnL top 20 %
- **THEN** the cut-off is taken over all 10 rows (k = ceil(10 × 0.2) = 2, cut-off 9), 2 settings match (9 and 10), both in cell B
- **AND** cell A has no match and is grey (a per-cell ranking would wrongly keep 5 in A and 10 in B)

### Requirement: All settings heat map

Each x × y cell SHALL show the best displayed value among its matching rows and
their count; a cell without a match SHALL be grey. A summary SHALL show matching
rows of all rows and cells with a match of all cells. A table SHALL list the top
50 matches by the displayed value.

#### Scenario: no active condition
- **WHEN** no condition has a value
- **THEN** every treatment row matches and each cell shows its best setting

### Requirement: Jump to the setting

Clicking a cell or a match SHALL switch to "Displayed grid" on that row's outer
slice, grid and controls, and select that point.

#### Scenario: jump
- **WHEN** a cell whose best row has SL 7 is clicked while SL 5 is displayed
- **THEN** the SL 7 slice is shown with that row's controls and the point selected

### Requirement: Data loading for All settings

Nothing SHALL be requested before "All settings" is chosen. Then one results
request without filters SHALL fetch only the columns needed (arm, grid, view
dimensions, displayed and condition metrics). Columns from different responses
SHALL NOT be joined by row index: when another metric becomes needed, the whole
needed set SHALL be requested again in one response. Loaded data SHALL be dropped
on reload and after run deletion.

#### Scenario: column subset
- **WHEN** "All settings" is chosen with one condition on win rate and Net PnL displayed
- **THEN** one request is sent with no filters and a `columns` list without unrelated metrics

### Requirement: Selection outside the displayed grid

Under "All settings" the selection bar, Delete runs and Calculate SHALL be offered on the
All settings map. A picked cell SHALL stand for its settings of every outer slice, grid
and control value on one side of the active conditions: "Select matching" picks every
cell with a match and takes the matching settings, "Select not matching" picks every
cell with a failing setting and takes the failing ones; a click in select mode (or
Ctrl/Cmd+click) toggles a cell on the current side. When the comparison arm is shown,
the matched comparison rows SHALL be included, as on the displayed grid. Run ids and
Calculate addresses SHALL come from the same snapshot (the snapshot includes `run_id`);
the existing plan dialogs (dry-run counts and size, plan confirm) SHALL be used unchanged.
A new evaluation, a scope change, deletion or Calculate SHALL clear the picked cells.

#### Scenario: delete runs of the failing settings of every slice
- **WHEN** "All settings" is selected, a condition fails settings in SL 5 and SL 7 and the user presses "Select not matching" and "Delete runs"
- **THEN** the deletion plan is requested for the run ids of the failing settings of both SL values

### Requirement: Equity curves under All settings

Under "All settings" the equity panel (by year / by trade) SHALL draw the matching
settings of every slice that have an Engine run, the best 60 by the displayed metric;
clicking a curve SHALL open its setting on the displayed grid.

#### Scenario: curves of matches
- **WHEN** 4 settings match and 2 of them have a run
- **THEN** the panel draws those 2 runs and reports 4 matching settings

