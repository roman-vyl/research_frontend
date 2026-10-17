## 1. research_frontend

- [ ] 1.1 `src/api/journal.ts`: `fetchJournalEvents` takes the event type; the applied payload type.
- [ ] 1.2 `runtimeAppliedOrders.ts`: one record per bar (D2), reading per D3, counters.
- [ ] 1.3 Applied rings custom series and wiring in `RuntimeCandleChart` (D4).
- [ ] 1.4 `RuntimeChartPanel`: parallel request (D1), "Applied orders unavailable", legend (D5).
- [ ] 1.5 Tests: request per type; rings at the bar; null price draws no ring; unreadable counted; latest record per bar; applied failure or truncation keeps the projection; existing tests unchanged.
- [ ] 1.6 `npm run lint`, `npx tsc --noEmit`, unit tests, `openspec validate --all --strict` green.
- [ ] 1.7 Owner check on the Mac after the backend PRs are deployed.
