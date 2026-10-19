## 1. research_frontend (apply after #27 is merged, from fresh main)

- [ ] 1.1 `src/api/journal.ts`: payload types for `open_trade_evaluated` and `protection_applied`.
- [ ] 1.2 `runtimeOpenTrade.ts`: `buildOpenTradeProjection` (D2, D5) and `buildAppliedProtection` (D3, D4, D5) with counters.
- [ ] 1.3 Chart wiring in `RuntimeCandleChart`: open-position lines with the projection series style, close markers, protection rings with the applied-ring series.
- [ ] 1.4 `RuntimeChartPanel`: split of the two new types (D1), legend (D6).
- [ ] 1.5 Tests: split by type, unknown types still ignored; one event per bar rule; null take gives no Take point; lines broken between bars without events; lines broken on a `trade_cycle_id` change on adjacent bars; `trade_cycle_id` not shown; close marker bound to the candle on active signal; close marker drawn when stop is unreadable or missing; every protection record counted; Stop and Take rings at order trigger prices; technical take not drawn and counted; unreadable counted; Engine text `"105.150"` read by value; failed or truncated answer draws none; existing tests unchanged.
- [ ] 1.6 `npx tsc -p tsconfig.app.json --noEmit`, `npm run build`, all unit tests, `openspec validate --all --strict` green.
- [ ] 1.7 Owner check on the Mac after the backend PRs are deployed.
