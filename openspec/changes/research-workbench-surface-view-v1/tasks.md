## 1. API Client

- [ ] 1.1 Types and client for the Experiment list, manifest and results (filtered by semantic ids), matching the Research Service contract; no findings client.

## 2. Surface Tab

- [ ] 2.1 `WorkbenchTab` `"surface"`; order `Chart | Surface | Reports | Strategy Composer`; Surface pane mounted-and-hidden like Chart, rendered outside `WorkbenchGate`.
- [ ] 2.2 `SurfaceView` with local state only (experiment, metric, view, controls, filters, selected point); no provider, no global state.
- [ ] 2.3 Components: ExperimentSelector, SurfaceControls (units and ATR↔R conversion), SurfacePlot (heatmap, aggregated map and the declared trigger filmstrip from the manifest `view`), AND-filters with greyed points, CellDetails; baseline/difference only with `arms`.
- [ ] 2.4 CellDetails: with `run_id` an "Open run" action calling `setSelectedRunId(run_id)` and `setActiveTab("chart")`; without it the metrics and an "Engine run not available" note; provenance from the declared provenance; no use of `selectedRunId` as point identity.

## 3. Workbench Integration

- [ ] 3.1 Context bar: run `<select>` behind a legacy flag (off) with a deprecation comment; selected run id as read-only text.
- [ ] 3.2 Startup: initial `selectedRunId` null, idle report status and idle Chart/Reports messages, no `/api/research/runs` call at startup; keep Composer working (change its selection flow only if needed for that).

## 4. Tests

- [ ] 4.1 Update the tests that pin the old startup behaviour (`workbenchLoad`, `App`, `chartEventsDisplayLoad`, `chartEventsDistantTradeDisplay`, `ComposerPanel.runBacktest`) and the Playwright suites so that they set a run through the existing fixture/helper mechanism instead of relying on the automatic newest-run selection; no new URL contract.
- [ ] 4.2 New tests: static guard that `src/features/surface/**` imports nothing from `features/chart/**` or `features/workbenchChartRuntime/**`; no `/api/research/runs` call at startup; a point without `run_id` never calls `setSelectedRunId`; "Open run" calls it once with the `run_id`; Retry keeps the selected run; Surface state survives Chart ↔ Surface ↔ Reports; existing `workbenchChartRuntime` unit tests pass unchanged.

## 5. Verification

- [ ] 5.1 Against a Research Service with the Experiment API and prepared data: open a sample of points with and without `run_id` (point → Open run → Chart → Reports).
- [ ] 5.2 Confirm `/api/research/runs*` client behaviour is unchanged.
