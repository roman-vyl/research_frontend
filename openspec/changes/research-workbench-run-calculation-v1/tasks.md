## 1. research_frontend

- [ ] 1.1 API: `planCalculation(experimentId, rows)`, `calculateRows(experimentId, rows, planToken)`, `getCalculation(experimentId, jobId)`, `cancelCalculation(experimentId, jobId)` with backend types; `409 plan_stale` and `409 job_running` as typed errors; backend `{ error, message }` shown.
- [ ] 1.2 Rows of a selection: one `coords` per addressable row behind the selected cells regardless of `run_id` (dimension ids in the active grid, `grid`, `arm`); count of rows not addressable.
- [ ] 1.3 Selection bar: "Calculate (N)" next to "Delete runs (R)"; disabled without `materialize` (hint), when N is 0 or N > 2 000 (hint).
- [ ] 1.4 Plan dialog: Selected / Calculable / Has run / Other skipped (by reason) from the plan, the parity rule text, "Calculate"; `plan_stale` offers a new plan.
- [ ] 1.5 Progress: poll every 2 s, counts by outcome, "Cancel"; closing does not cancel.
- [ ] 1.6 Result: counts by outcome, failed rows with differing metrics, backup name; selection cleared, slice reloaded.
- [ ] 1.7 Tests (mocked API): no `materialize` disables the action; aggregated cell sends one coords per addressable row; rows with run are sent and shown as has run from the plan; not addressable rows not sent; N > 2 000 disabled; stale plan; job_running message; cancel; reload after publish; no request to `/api/research/runs`.

## 2. Manual check (owner)

- [ ] 2.1 On `btcusdt_p.ema500.calc_smoke_width_band` or a ratio_4d slice with deleted runs, calculate a small selection; published points get "Open run", failed rows keep their values.
