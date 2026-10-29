## 1. research_frontend

- [x] 1.1 `fetchClosedTrades()` in `src/api/journal.ts`: `GET /journal-api/v1/closed-trades`, strict check of `trades` and `truncated`, typed row, `JournalError` on failure.
- [x] 1.2 `WorkbenchTab` gains `trades`; `TabNav` shows "Trades" after "Runtime Dashboard"; `App.tsx` renders the panel.
- [x] 1.3 `src/features/trades/`: loading of both reads (D1), names (D2), filters, summary tiles, curve and calendar (D3), table (D4), card (D5), CSS in the Runtime Dashboard language (D6).
- [x] 1.4 Tests: request count on open/Refresh/Retry, no other requests; the real Demo short `6072511f` rendered with net −1,307.99 and R −1.38; filters; each D3 formula on a small fixture; profit factor "—" without a losing trade, 0.00 with only losers; incomplete row and its card; Runtime list failure falls back to ids; journal failure shows Retry; empty list.
- [x] 1.5 `npm test`, `tsc -b`, `openspec validate --all --strict` green.

## 2. Rollout (on owner's word only)

- [ ] 2.1 PR and merge.
- [ ] 2.2 Mac: open the Trades tab against the Demo journal (21 rows on 2026-10-29) and check the summary against the rows.
