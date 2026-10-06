## 1. research_frontend

- [ ] 1.1 API: `planRunDeletion(experimentId, runIds)` and `deleteRuns(experimentId, runIds, planToken)` with types from the backend; `409 plan_stale` surfaced as a typed error; backend `{ error, message }` shown.
- [ ] 1.2 Selection state in `SurfaceView` (toggle, rectangle, passing / not passing); cleared on Experiment, slice, grid, arm or control change; no change to CellDetails point or `selectedRunId`.
- [ ] 1.3 Run ids of a selection: distinct non-empty `run_id` over all rows behind selected cells in the current slice and controls.
- [ ] 1.4 Selection bar and "Delete runs (R)" action; R = distinct non-empty `run_id` behind the selected cells.
- [ ] 1.5 Plan and confirm dialog: counts, GB, skipped by reason, typed run count, warning text, `plan_stale` with new plan.
- [ ] 1.6 After deletion: result summary, selection cleared, slice cache dropped and slice reloaded; "no full run" hint in CellDetails.
- [ ] 1.7 Tests (mocked API): slice change clears selection, only-replay selection disables the action, aggregated cell sends all run ids, wrong typed count sends nothing, stale plan, reload after deletion keeps values, no request to `/api/research/runs`.

## 2. Manual check (owner)

- [ ] 2.1 On a real Surface delete a small selection; values unchanged, Open run gone for those points, freed GB matches the plan.
