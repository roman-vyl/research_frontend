# research-workbench-surface-view-v1 Specification

## Purpose
Show a research Experiment's ready-made result table as a Surface in the Workbench and open
a result point as a run through `setSelectedRunId(run_id)`, without the full run list.

## Requirements
### Requirement: Experiment API consumption

The Surface tab SHALL obtain data only from the Research Service Experiment API
(`GET /api/research/experiments`, `GET /api/research/experiments/{experiment_id}`
and `GET /api/research/experiments/{experiment_id}/results`) and SHALL NOT
define, extend or work around it. It SHALL use the semantic dimension and metric
ids of the manifest `result_schema`, never physical table column names.

#### Scenario: Semantic ids only

- **WHEN** the Surface tab requests a slice
- **THEN** its query parameters and the columns it reads are semantic ids from
  the manifest.

### Requirement: Surface tab

The Research Workbench SHALL open on the Surface tab by default and SHALL provide a "Surface" tab in the order
`Chart | Surface | Reports | Strategy Composer`. The Surface tab is a
visualisation of an Experiment's ready-made result table: it SHALL provide an
Experiment selector shown as cards (ticker, anchor, title) built from the Experiment
list, with no Experiment selected automatically and a way back to the cards, and for the selected
Experiment the views declared by its manifest `view` descriptor (controls,
heatmap, optional aggregated map), metric selection, filters, and, when the
manifest declares `arms`, baseline/difference. It SHALL NOT recompute any trading
metric, read HTML, or look at runs on disk. It SHALL NOT require a selected run
and SHALL be reachable while no run is selected.

#### Scenario: Open the tab without a run

- **WHEN** the user opens the Surface tab and no run is selected
- **THEN** the Experiment cards and the declared view are shown.

#### Scenario: Request only what is displayed

- **WHEN** the user fixes an initial stop
- **THEN** the results request is filtered by the dimension id (`sl`) to that value
  and the full table is not requested.

### Requirement: Manifest-declared views

The Surface tab SHALL build its views from the manifest `view` descriptor
(x and y dimension ids, the dimensions exposed as controls, default metric,
optionally one dimension id for a filmstrip of small heatmap copies, and for an
aggregated map the dimensions aggregated over) and SHALL NOT offer
arbitrary choice of axes. An Experiment without a `view` descriptor SHALL be
reported as not viewable.

#### Scenario: Trailing filmstrip

- **WHEN** the trailing width × lookback view declares a filmstrip over the
  trigger dimension
- **THEN** a row of small heatmaps, one per trigger value at the selected
  distance, is shown and selecting one sets the trigger control.

#### Scenario: Ratio experiment

- **WHEN** an Experiment declares one view with width and lookback axes and
  controls for SL and TP ratio, and no arms
- **THEN** only that view, metric selection and filters are shown.

### Requirement: Explicit units

Every dimension control and readout SHALL show the dimension's unit. For a
dimension with several grids, the readout SHALL show the value in the active
grid's unit and its conversion to the other unit at the selected initial stop
(`ATR = R × SL`). Tooltips SHALL show both units.

#### Scenario: R grid readout

- **WHEN** the R grid is active with SL 5 ATR and trigger 7R
- **THEN** the readout shows `7R` and `= 35 ATR at SL 5`.

### Requirement: Metric filters

The tab SHALL support any number of conditions `metric ≥ value` or
`metric ≤ value` over declared metrics and, when `arms` are declared, over their
differences to the baseline arm. All conditions SHALL apply together (AND). Points
that fail any condition SHALL be shown greyed out and a counter SHALL show passing
points.

#### Scenario: Two conditions

- **WHEN** the user sets `PF ≥ 1.3` and `short net ≥ 0`
- **THEN** only points meeting both keep their colour and the counter shows their
  number out of all points.

### Requirement: One point model and cell details

Every result row SHALL be treated identically as a point with coordinates,
metrics and an optional `run_id`; the frontend SHALL NOT distinguish point kinds.
Clicking a point SHALL show its details (coordinates, metrics, declared
provenance) as local view state; this selection SHALL NOT be derived from or
written to `selectedRunId`. For a point with a `run_id`, the details SHALL offer
an action that calls the existing run selection with that `run_id` and opens the
Chart. For a point without a `run_id`, the details SHALL state that no detailed
Engine run is available and offer no such action. Provenance SHALL be shown from
the declared provenance, never inferred from `run_id`.

#### Scenario: Point with a run

- **WHEN** the user clicks a point with a `run_id` and chooses to open the run
- **THEN** `selectedRunId` becomes that `run_id` and Chart and Reports load it
  through their existing path.

#### Scenario: Point without a run

- **WHEN** the user clicks a point without a `run_id`
- **THEN** its metrics are shown, `selectedRunId` is unchanged, and no open
  action is offered.

### Requirement: Surface boundary to the workbench

The only link between the Surface tab and the rest of the workbench SHALL be the
existing run selection with a `run_id`. The Surface tab SHALL NOT import chart or
chart-runtime modules, and SHALL NOT read or write chart, report or trade/bar
focus state. Its own state (selected Experiment, metric, controls, filters,
selected point) SHALL be local to the Surface view; it SHALL persist while the
user switches between Chart, Surface and Reports. The Surface view SHALL render
outside the run-loading gate so that it works while no run is selected.

#### Scenario: Surface → Chart → Surface

- **WHEN** the user sets controls, opens a run in the Chart, and returns to Surface
- **THEN** the same Experiment, controls and filters are shown.

### Requirement: Legacy run dropdown

The context-bar run dropdown SHALL be hidden in production builds and kept in the
code as legacy, marked as a candidate for removal. The context bar SHALL show the
selected run id as read-only text. Historical runs SHALL NOT be added to
`/api/research/runs` or to the dropdown for the purpose of the context bar.

#### Scenario: Production context bar

- **WHEN** the workbench runs with default settings
- **THEN** the context bar shows the selected run id as text and no run dropdown.

### Requirement: Startup without a selected run

The workbench SHALL start with `selectedRunId` equal to null and SHALL NOT call
`/api/research/runs` at startup. Chart and Reports SHALL show an explicit idle
state ("Open a run from the Surface tab"), shown by the run-loading gate, instead
of the loading view while no run is selected; the report load status SHALL apply
only once a run is selected. Existing Composer behaviour SHALL remain functional after the
removal of startup `/api/research/runs` loading.

#### Scenario: Fresh start

- **WHEN** the workbench loads
- **THEN** no run is selected, no run list is requested, and Chart and Reports
  show the idle state.

#### Scenario: Composer after a backtest

- **WHEN** the user runs a backtest from the Composer
- **THEN** the resulting run is selected and shown as before.

#### Scenario: Failed load stays selected

- **WHEN** the selected run fails to load and the user presses Retry
- **THEN** the same `run_id` is requested again and stays selected.

### Requirement: Surface follows the research visualisation style

The Surface view SHALL reproduce the look and the controls of the standalone research
visualisations: segmented choices for grid, comparison arm, metric and arm view; sliders with
unit readouts and a play button for the declared controls; a percentile-rank heatmap with
legend, summary figures, hover details of both arms and a frame strip; AND-filters that grey out failing cells. The
look SHALL follow the light or dark colour scheme of the system. Everything shown SHALL be driven
by the manifest `result_schema` and the result rows.

#### Scenario: Comparison arm choice

- **WHEN** the manifest declares several comparison arms and the user picks one
- **THEN** the comparison figures, differences and filters use that arm.

### Requirement: The session survives a page reload

The application SHALL remember, in the browser, the active tab, the selected run, the selected
trade of that run, and the Surface state (open Experiment, SL slice, metric, arm view, comparison
arm, slider positions, selected point, filters), and restore them when the page is loaded again.
Values that no longer exist in the data SHALL fall back to a valid option. Browser storage being
unavailable SHALL NOT break the application.

#### Scenario: Reload with a trade and sliders set

- **WHEN** the user has selected a trade and moved the Surface sliders, and then reloads the page
- **THEN** the same tab, run, trade, Experiment and slider positions are shown again.

### Requirement: Optional dimensions are switched on by a checkbox

A manifest dimension marked `optional` (for example "Breakeven") SHALL be off by default and, while off,
the view SHALL show only the rows that have no value for it. A checkbox SHALL switch it on; only then its
values SHALL appear (buttons for up to six values, otherwise a slider): the values of the current geometry's
rows plus the dimension's declared `values`. The checkbox SHALL be unavailable while the current geometry has
no row with a value and the dimension declares no `values`, and a switched-on dimension SHALL switch itself
off when a geometry without values is selected. While it is on, the heatmap SHALL keep every cell of the
geometry: a cell with no row for the selected value SHALL show "—", SHALL be selectable (click in select
mode, Ctrl/Cmd+click, drag, "Select empty") and SHALL be sent to Calculate with its coordinates (x / y of the
cell, the other dimensions from the controls, the selected optional value, `grid`, and `arm` when the schema
has exactly one treatment arm). An address SHALL leave out an optional dimension that is off.

#### Scenario: Breakeven runs

- **WHEN** the user selects a geometry that has breakeven rows and ticks the Breakeven checkbox
- **THEN** the breakeven triggers appear and the heatmap shows the rows of the selected trigger, each with
  its Engine run.

#### Scenario: Geometry without breakeven rows

- **WHEN** the selected geometry has no breakeven rows and the dimension declares no `values`
- **THEN** the checkbox is disabled with an explanatory note and the plain rows are shown.

#### Scenario: Calculate breakeven cells that have no row

- **WHEN** the dimension declares `values` [2, 3], no row has breakeven 2R, the user ticks Breakeven, keeps 2R, presses "Select empty" and Calculate
- **THEN** every cell shows "—" and the plan is requested with one address per cell carrying `be_trigger` 2

### Requirement: Percentile filters

Besides `>=` and `<=` against a typed value, a filter condition SHALL offer `top %` and `bottom %`: the
typed number is a percent, and the condition SHALL keep the best (top) or worst (bottom) share of the cells
of the frame being shown, ties included and at least one cell. "Best" SHALL mean the highest value of the
metric, or of its difference to the comparison arm for a difference condition; for metrics stored as
negative numbers such as drawdown the best value is the one closest to zero. Conditions SHALL combine with
AND, and every frame (the heatmap and each frame of the strip) SHALL compute its own cut-off.

#### Scenario: Top ten percent by net PnL

- **WHEN** the user adds a condition Net PnL, `top %`, 10
- **THEN** only the best tenth of the cells shown stays coloured and the others turn grey.

#### Scenario: Smallest drawdown

- **WHEN** the user adds a condition Max DD, `top %`, 10
- **THEN** the tenth of cells with the shallowest drawdown stays coloured.

### Requirement: Every Experiment is its own surface

Each registered Experiment SHALL be opened and shown on its own, from its own manifest and table; the
view SHALL NOT merge or reuse the rows, controls or comparison arms of another Experiment. Discrete
dimension values MAY carry readable names in the manifest (`labels`), which the view SHALL use for slider
readouts and point details.

#### Scenario: Third surface

- **WHEN** a new Experiment (for example the ADX-triggered trailing) is added to the registry
- **THEN** it appears as its own card with its own controls and comparison arms, and the other
  Experiments are unchanged.

