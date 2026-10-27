## 1. research_frontend

- [x] 1.1 `src/api/journal.ts`: `fetchJournalEvents` without `event_type`; `event_type` on the event type; the applied payload type.
- [x] 1.2 `runtimeAppliedOrders.ts`: every applied record (D2), reading per D3, counters.
- [x] 1.3 Applied rings custom series and wiring in `RuntimeCandleChart` (D4).
- [x] 1.4 `RuntimeChartPanel`: one request split by `event_type` (D1), existing error handling, legend (D5).
- [x] 1.5 Tests: one request without `event_type`; answer split by type, unknown type ignored; rings at the bar; null price draws no ring; unreadable counted; two records on one bar both counted; answer without applied events draws the projection and no rings; failed or truncated answer draws neither; existing tests unchanged except the request query.
- [x] 1.6 `npx tsc -p tsconfig.app.json --noEmit`, `npm run build`, all unit tests (965), `openspec validate --all --strict` green. The repository has no lint script.
- [ ] 1.7 Owner check on the Mac after the backend PRs are deployed.
