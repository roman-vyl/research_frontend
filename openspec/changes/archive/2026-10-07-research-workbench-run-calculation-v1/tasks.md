## 1. research_frontend

- [x] 1.1 API: `planCalculation(experimentId, rows)`, `calculateRows(experimentId, rows, planToken)`, `getCalculation(experimentId, jobId)`, `cancelCalculation(experimentId, jobId)` with backend types; `409 plan_stale` and `409 job_running` as typed errors; backend `{ error, message }` shown.
- [x] 1.2 Rows of a selection: one `coords` per addressable row behind the selected cells regardless of `run_id` (dimension ids in the active grid, `grid`, `arm`); count of rows not addressable.
- [x] 1.3 Selection bar: "Calculate (N)" next to "Delete runs (R)"; disabled without `materialize` (hint), when N is 0 or N > 2 000 (hint).
- [x] 1.4 Plan dialog: Selected / Calculable / Has run / Other skipped (by reason) from the plan, the parity rule text, "Calculate"; `plan_stale` offers a new plan.
- [x] 1.5 Progress: poll every 2 s, counts by outcome, "Cancel"; closing does not cancel.
- [x] 1.6 Result: counts by outcome, failed rows with differing metrics, backup name; selection cleared, slice reloaded.
- [x] 1.7 Tests (mocked API): no `materialize` disables the action; aggregated cell sends one coords per addressable row; rows with run are sent and shown as has run from the plan; not addressable rows not sent; N > 2 000 disabled; stale plan; job_running message; cancel; reload after publish; no request to `/api/research/runs`.

## 2. Manual check (owner)

- [x] 2.1 On `btcusdt_p.ema500.calc_smoke_width_band` or a ratio_4d slice with deleted runs, calculate a small selection; published points get "Open run", failed rows keep their values.
  - 2026-10-07, real stack (research-service c155712 on 8095), built-in browser on the branch dev server (e03ed98): ratio_4d cell width 3, lookback 20, SL 4, TP/SL 4 (return −76.5%). Delete runs (1) → backup `runs.pre_delete_20261007T053108Z.csv`; Calculate (1): plan Selected 1 · Calculable 1 · Has run 0; job completed, Published 1, backup `runs.pre_calculate_20261007T053246Z.csv`; slice reloaded, "Open run" back with new run `run_96488420c4f149d5806f715ad6212d0f`; all metrics identical, only `run_id` changed in `runs.csv`. Plan-only checks: Surface without `materialize` shows Calculate disabled with the hint; ratio_4d 348 cells with runs → Calculable 0 · Has run 348. No request to `GET /api/research/runs`. A parity-failed row was not exercised in the UI (covered by tests).
