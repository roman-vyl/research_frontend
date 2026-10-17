## Why

The Runtime Dashboard shows the candles of a selected strategy's market, but not what Strategy
Engine wanted for that strategy. Strategy Runtime already journals, for every confirmed bar, the
Engine `desired_entry` (entry, stop and take prices, or `null`), and the Central Journal now
serves those events (`journal_service` change `journal-read-api-v1`). Stage 1 of running all
Runtime strategies is to draw this projection on the existing CandleChart.

## What Changes

- Read `desired_entry` events of the selected strategy from the Central Journal through a dev
  proxy `/journal-api`.
- Draw three lines on the existing candle chart: entry (`planned_entry_price`), stop
  (`initial_stop_price`) and take (`initial_take_price`), one point per evaluated bar.
- A bar evaluated with `desired_entry = null` breaks all three lines. A bar from the strategy's
  first known evaluation onward that has no journal event also breaks them and is marked "No
  evaluation recorded", so a missing record is never shown as a calculation without a signal.
- Strategy cards show the last evaluated bar from the Journal; the strategy's `first_bar_open_time_ms` from the same endpoint marks where its known history starts.
- If the Journal is unavailable, or the event answer is unexpectedly truncated, the chart keeps its candles and says the projection is unavailable; it never draws an incomplete history as complete.

## Out of Scope

Trades, fills, positions, ABI or dispatch outcomes, a history table, entry markers, diagnostics
beyond the three prices, EMA overlays, any change to Strategy Runtime, Strategy Engine, the
Journal Service or the Research Chart, polling.

## Capabilities

### New Capabilities

- `research-workbench-runtime-projection-lines-v1`: journal-backed projection lines on the
  Runtime Dashboard chart.

## Impact

- `research_frontend`: `src/api/journal.ts`, `src/features/runtime/*`, `vite.config.ts` proxy.
- Depends on `journal-read-api-v1` being merged and deployed; until then the chart shows the
  "projection unavailable" state.
