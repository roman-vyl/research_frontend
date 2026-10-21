## Why

The Runtime chart shows what the Engine wanted (projection lines) and what was placed (Applied
rings), but not what happened after: the entry fill and the close. While a position is open Runtime
writes no `live_entry_evaluated`, so the chart goes blank exactly when a trade is live, and a
stop-out is invisible. Runtime already journals both facts (strategy_runtime #24, #25), the Central
Journal stores them (journal_service #8, #9), and the panel already receives them in its one events
answer and ignores them (`research-workbench-runtime-applied-entry-orders-v1`, D1).

Example on the demo stack: SOL `ema_pullback:c9f52d850201b1732615fcf4`, cycle
`e8fc6911-7268-4e60-9438-643c8b6e0769`, short. Applied on bar 21:55Z (trigger 103.30, stop 105.15,
take 93.11); `trade_cycle_opened` on bar 22:00Z, `average_entry_price` 103.32, first fill 22:01:51Z;
`trade_cycle_closed` on bar 02:05Z, `reason` `stop_loss`. Today the chart shows none of it.

## What Changes

- The panel reads `trade_cycle_opened` and `trade_cycle_closed` from the same events answer.
- **Open marker**: on the bar of each `trade_cycle_opened`, an arrow at `average_entry_price`
  (up for long, down for short, a dot when the side is unknown).
- **Close marker**: on the bar of each `trade_cycle_closed`, a label above or below the candle with
  the reason (`SL`, `TP`, or the reason text). It is not placed at a price: the closed event carries
  no exit price.
- **Position period**: from the open bar to the close bar (or the last bar while still open), a line
  at `average_entry_price` and, dashed, the stop and take of that cycle's last applied order.
- Legend: swatches and counters for opened, closed (by reason) and unreadable cycle events.

## Out of Scope

An exit price or PnL on the chart (the Journal has no exit price; adding one is a Runtime/Journal
change); any change to Runtime, ABI or the Journal; quantity, order ids and `trade_cycle_id` on the
chart; a tooltip, table or price-axis labels; cycles whose open event lies before the candle window
(only their close marker is drawn); polling; the stray diagonal on the take line when zooming
(separate fix); changes to how projection lines and Applied rings are built and drawn.

## Capabilities

### New Capabilities

- `research-workbench-runtime-trade-cycle-markers-v1`: trade cycle open and close facts from the
  Central Journal on the Runtime Dashboard chart.

### Modified Capabilities

None. The events request and its error handling stay as defined by
`research-workbench-runtime-applied-entry-orders-v1`; the split by `event_type` routes two more types.

## Impact

- `research_frontend`: `src/api/journal.ts`, `src/features/runtime/*`.
- No backend change. Works on the events already in the Journal of the demo stack.
