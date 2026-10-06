## Context

Facts about the existing frontend this design relies on (checked on `main`):

- One `selectedRunId` in `WorkbenchContext`; report loading depends on
  `selectedRunId` and `reloadToken` only; `reportLoadStatus` starts as
  `"loading"` and `WorkbenchGate` shows a loading view until a run loads.
- Startup bootstrap fetches `/api/research/runs`, keeps the previous selection
  only if listed, otherwise picks the first (newest) entry; the context bar
  renders a run `<select>` built from that list; Composer calls
  `refreshRunsAndSelectRun`.
- `App` renders the Composer instead of the tab panes; the Chart pane is kept
  mounted and hidden while Reports is shown.
- Tests that pin the startup behaviour: `workbenchLoad.test.tsx`
  ("selects the first entry from GET /runs as the default run"), `App.test.tsx`,
  `chartEventsDisplayLoad.test.tsx`, `chartEventsDistantTradeDisplay.test.tsx`,
  `ComposerPanel.runBacktest.test.tsx`, and the Playwright suites (`trade-focus*`,
  `diagnostics-acceptance`), which are outside the scope of this change.
- On a run change the existing path already drops the previous run's market owner,
  trace generation, run-keyed trace cache, overlay default and re-seeds trade/bar
  focus to the new run's last closed trade.

## Backend assumptions (consumer side)

This change consumes the Research Service Experiment API and does not define it.
Assumed, per the Research Service change:

- the manifest carries a `result_schema` with semantic dimension ids, units
  (multi-grid dimensions declare each grid), metrics with formats (`fraction`
  means a stored fraction), optional `arms`, a `view` descriptor, and the
  provenance declaration;
- result rows hold ready-made metrics and an optional `run_id`; provenance is
  independent of `run_id`;
- the results route is filtered by semantic ids (for example `sl=5`) and returns
  columnar JSON (`columns`, `rows`, `data`) with semantic column ids;
- the list route returns the registry as is.

## Goals / Non-Goals

**Goals:** a small Surface viewer; one point model; `selectedRunId` stays the only
selected-run identity; no new global state; chart runtime untouched.

**Non-Goals:** see proposal.

## Decisions

Boundary: the Surface tab visualises ready-made metrics; its only link to the
workbench is `setSelectedRunId(run_id)`.

```
App
├── Chart                existing
├── Surface              new: ExperimentSelector, SurfaceControls, SurfacePlot, CellDetails
├── Reports              existing
└── Strategy Composer    existing
```

- **State.** All Surface state (experiment, metric, view, controls, filters,
  selected point) is local to `SurfaceView`. No provider and no global state: the
  Surface pane is mounted-and-hidden like the Chart pane, so its state survives
  Chart/Surface/Reports switches. As with Chart today, visiting the Composer
  (which `App` renders instead of the tab panes) discards it.
- **Placement.** The Surface pane renders outside `WorkbenchGate`, because the
  gate shows loading/error while no run is selected and Surface must work then.
- **Point model.** One model: coordinates, metrics, optional `run_id`; no separate
  kinds for replay or Engine points. Provenance is a label taken from the
  declared provenance.
- **Click.** A point click only opens local CellDetails. With a `run_id` the
  details offer "Open run", which calls `setSelectedRunId(run_id)` and
  `setActiveTab("chart")`; without one it says no detailed Engine run is
  available. `selectedRunId` is never used as the identity of a point and no
  highlight is derived from it.
- **Views.** The manifest `view` descriptor declares each view (x, y, control
  dimensions, default metric, optional `aggregate_over`, optional `filmstrip`); the
  frontend does not offer arbitrary axes. Trailing: a width × lookback view
  (controls SL, trigger, distance, grid) with `"filmstrip": "trigger"` (a row of
  small heatmap copies, one per trigger value at the selected distance; choosing a
  frame sets the trigger control) and an aggregated trigger × distance map
  (aggregates over width and lookback). Ratio: one width × lookback view
  (controls SL and TP ratio). Aggregates (median, counts, share passing,
  difference to the baseline arm) are plain operations over table columns. No
  layouts, widgets, formulas or visibility expressions.
- **Legacy dropdown.** The run `<select>` moves behind a flag (off), marked
  legacy and a candidate for removal; the context bar shows the selected run id
  as text.
- **Startup.** `selectedRunId = null`. `WorkbenchGate` shows the idle state
  ("Open a run from the Surface tab") whenever no run is selected;
  `reportLoadStatus` keeps its values (`loading` / `ready` / `error`) and applies
  only once a run is selected, so the chart runtime types are untouched. Chart and
  Reports are both behind the gate and therefore show the idle message.
  `/api/research/runs` is not called at startup (client function and Composer's
  `refreshRunsAndSelectRun` unchanged; only the startup bootstrap role of the run
  list disappears). No URL contract for the selected run. Existing Composer
  behaviour must remain functional; its selection flow changes only if that
  compatibility requires it.
- **Existing behaviour relied on, no new code.** The existing run-change path
  resets the previous run's inspection state; the Surface tab neither adds nor
  writes any of it.

## Risks / Trade-offs

- Startup without a run changes behaviour pinned by several tests; they are
  updated deliberately (tasks) through the existing fixture/helper mechanism
  rather than kept alive through a hidden default.
- Until the Research Service change is implemented and its data prepared, the
  tab has no real experiments; tests run on mocked responses.
- Whole-table results are large; the client always filters (at least by SL).
