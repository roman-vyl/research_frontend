## Why

The Central Journal now keeps one row per closed trade (journal_service
`journal-closed-trades-table-v1`, `-builder-v1`, `-api-v1`, deployed on the Mac demo
2026-10-29 as image 8a33203) and serves them at `GET /v1/closed-trades`. The owner approved a
trade-journal mockup (list with summary, equity curve and calendar; card of one trade) and wants
it as its own Workbench tab.

## What Changes

- New Workbench tab "Trades", placed after "Runtime Dashboard".
- The tab reads `GET /journal-api/v1/closed-trades` (all rows, no `limit`) and Runtime's
  `GET /runtime-api/v1/strategy-instances` (only to show strategy names) on open, on Refresh
  and on Retry. Nothing else is called; nothing is written.
- Filters over the loaded rows: strategy, coin, close date range (UTC), status
  (All / Complete / Waiting for ABI).
- Summary tiles, a cumulative net PnL curve and a month calendar of daily net, all computed in
  the browser from the complete rows of the current filter with the formulas stated in the spec.
- A trade table, newest close first; an incomplete row shows why it waits.
- A trade card opened from a row: plan vs fact with slippage, result with fees and R, volume and
  fill counts, a schematic of the trade's price levels.

## Non-goals

No candles, MFE/MAE or "best exit" (next stage, owner 2026-10-29). No per-execution list (the
journal does not store executions and the front has no ABI proxy). No notes, tags or exports.
No server-side filtering or paging. No change to the Journal, Runtime, ABI or bbb_stack: the
`/journal-api` and `/runtime-api` dev proxies already exist.

## Capabilities

### New Capabilities

- `research-workbench-trade-journal-v1`: the Trades tab.

## Impact

`src/api/journal.ts` (closed-trades read and row type), `src/api/types.ts` (`WorkbenchTab`),
`src/shared/layout/TabNav.tsx`, `src/App.tsx`, a new `src/features/trades/` (panel, summary,
curve, calendar, table, card, CSS), tests. Frontend deploy on the owner's word.
