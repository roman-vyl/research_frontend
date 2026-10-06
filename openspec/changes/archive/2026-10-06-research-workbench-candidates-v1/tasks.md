## 1. research_frontend

- [x] 1.1 API: `listCandidates()`, `starCandidate(experimentId, coords)`, `unstarCandidate(candidateId)` with types from the backend; `{ error, message }` shown.
- [x] 1.2 Candidates store shared by Surface and the tab; reload after star or unstar.
- [x] 1.3 Surface: star toggle in `CellDetails` with coordinates from the row; star mark on cells of the visible slice.
- [x] 1.4 `WorkbenchTab` `"candidates"` and `TabNav` entry; Candidates table with meaning line, badges, metrics (Net PnL USDT first), snapshot on hover for `changed`, expandable details with the spec snapshot labelled historical.
- [x] 1.5 Metric range filters with `FiltersPanel` conditions (Max DD by depth); remembered in session storage.
- [x] 1.6 Chart action through `setSelectedRunId` + `setActiveTab("chart")`; disabled without `run_id`.
- [x] 1.7 On Surface: focus channel, `SurfaceView` applies Experiment, slice, controls and selected point; hint when filtered out; disabled for `missing` and `ambiguous`.
- [x] 1.8 Tests (mocked API): star sends coordinates and no id; unstar; marks on slice; Net PnL derived from return; `no full run` disables Chart; On Surface sets slice and selection; On Surface disabled for `ambiguous` and `missing` with no focus request; no request to `/api/research/runs`.

## 2. Manual check (owner)

- [x] 2.1 Star an Engine point and a replay point on real Surfaces; open both from the Candidates tab on Chart and on Surface. Confirmed by the owner on real data 2026-10-06: star, Candidates tab, details, Chart and On Surface work.
