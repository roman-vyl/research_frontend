## 1. API Client

- [x] 1.1 Types and client for the Experiment list, manifest and results (filtered by semantic ids), matching the Research Service contract; no findings client.

## 2. Surface Tab

- [x] 2.1 `WorkbenchTab` `"surface"`; order `Chart | Surface | Reports | Strategy Composer`; Surface pane mounted-and-hidden like Chart, rendered outside `WorkbenchGate`.
- [x] 2.2 `SurfaceView` with local state only (experiment, metric, view, controls, filters, selected point); no provider, no global state.
- [x] 2.3 Components: ExperimentSelector, SurfaceControls (units and ATR↔R conversion), SurfacePlot (heatmap, aggregated map and the declared trigger filmstrip from the manifest `view`), AND-filters with greyed points, CellDetails; baseline/difference only with `arms`.
- [x] 2.4 CellDetails: with `run_id` an "Open run" action calling `setSelectedRunId(run_id)` and `setActiveTab("chart")`; without it the metrics and an "Engine run not available" note; provenance from the declared provenance; no use of `selectedRunId` as point identity.

## 3. Workbench Integration

- [x] 3.1 Context bar: run `<select>` behind a legacy flag (off) with a deprecation comment; selected run id as read-only text.
- [x] 3.2 Startup: initial `selectedRunId` null; `WorkbenchGate` shows the idle state when no run is selected (no new `ReportLoadStatus` value); no `/api/research/runs` call at startup (Composer's `refreshRunsAndSelectRun` stays); keep Composer working (change its selection flow only if needed for that).

## 4. Tests

- [x] 4.1 Update the unit tests that pin the old startup behaviour (`workbenchLoad`, `App`, `chartEventsDisplayLoad`, `chartEventsDistantTradeDisplay`, `ComposerPanel.runBacktest`). Playwright suites and infrastructure are out of scope: not adapted, not extended, not removed, and not a completion condition.
- [x] 4.2 New tests: static guard that `src/features/surface/**` imports nothing from `features/chart/**` or `features/workbenchChartRuntime/**`; no `/api/research/runs` call at startup; a point without `run_id` never calls `setSelectedRunId`; "Open run" calls it once with the `run_id`; Retry keeps the selected run; Surface state survives Chart ↔ Surface ↔ Reports; existing `workbenchChartRuntime` unit tests pass unchanged.

## 4b. Visual parity with the research HTML

- [x] 4b.1 Restyle Surface after the research visualisations (segmented choices, sliders with play, percentile-rank heatmap, hover details, frame strip, filters), comparison-arm choice, light/dark scheme.

## 4c. Session persistence

- [x] 4c.1 Remember tab, run, selected trade and the Surface state in browser storage and restore them after a reload (guarded storage, off in tests unless enabled).

## 5. Verification

- [ ] 5.1 Manual verification by the owner after the historical data is prepared: Experiment → Surface → point → CellDetails → Open run → Chart → Reports.
- [x] 5.2 Confirm `/api/research/runs*` client behaviour is unchanged.
