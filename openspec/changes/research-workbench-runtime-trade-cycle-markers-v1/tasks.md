## 1. research_frontend

- [ ] 1.1 `src/api/journal.ts`: event type constants and payload types for `trade_cycle_opened` and `trade_cycle_closed`.
- [ ] 1.2 `runtimeTradeCycles.ts`: grouping by `trade_cycle_id`, side from the last applied record (D3), open and close facts, position periods, unreadable and counters (D2, D4–D7).
- [ ] 1.3 Open arrows and position-period custom series; close markers on the candle series; wiring in `RuntimeCandleChart` (D4–D6).
- [ ] 1.4 `RuntimeChartPanel`: route the two types from the existing split (D1), legend (D8).
- [ ] 1.5 Tests: the SOL example (short arrow at 103.32 on 22:00Z, "SL" above the 02:05Z candle, entry line 22:00Z–02:05Z at 103.32, dashed 105.15 and 93.11); long cycle closed by take; open cycle runs to the last candle; close without open in the window draws only the label; unknown side draws a dot and the label above; unreadable counted; events outside the window ignored; answer without cycle events unchanged; failed or truncated answer draws nothing; existing tests unchanged.
- [ ] 1.6 `npx tsc -p tsconfig.app.json --noEmit`, `npm run build`, all unit tests, `openspec validate --all --strict` green.
- [ ] 1.7 Owner check on the Mac on the SOL trade of 2026-10-18.
