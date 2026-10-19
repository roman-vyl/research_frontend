## Context

Facts on `main` (7c81d1d):

- The panel makes one `GET /v1/events` request (no `event_type`, no `limit`) for the bars of the
  candle window and splits the answer by `event_type`: `live_entry_evaluated` to the projection,
  `entry_package_applied` to the rings, other types ignored. A failed or truncated answer shows
  "Projection unavailable" and draws nothing.
- Every event has the envelope `bar_open_time_ms` and `occurred_at`; the Runtime line is in `body.payload`.

Runtime payloads (strategy_runtime c9ad922):

- `trade_cycle_opened`: `trade_cycle_id`, `bar_open_time_ms`, `first_fill_at_ms`,
  `average_entry_price` (decimal string, taken from the order's `avgPrice`), `entry_order_link_id`,
  `entry_order_id`. It means Runtime saw the entry filled; there is no side.
- `trade_cycle_closed`: `trade_cycle_id`, `bar_open_time_ms`, `reason` (`stop_loss`,
  `take_profit`, `runtime_signal`, ...), `order_id`, `order_link_id`, `parent_order_link_id`. It means
  ABI confirmed the cycle closed and Runtime saved that; there is no exit price and no exit time
  from the exchange (`occurred_at` is the Runtime write time).
- `entry_package_applied`: `trade_cycle_id`, `trigger_price`, `stop_loss`, `take_profit` (decimal
  strings or null). Stop and take are what ABI placed with the entry order (request echo, not read back).

## Decisions

### D1. Same answer, two more types

`trade_cycle_opened` and `trade_cycle_closed` are taken from the existing events answer. No new
request. Error handling stays as today: a failed or truncated answer draws no markers either. An
answer without cycle events draws no markers and shows no error.

### D2. Bar of a marker

A marker is drawn on the candle whose open time equals the envelope `bar_open_time_ms`. An event on
a bar outside the candle window is not drawn and not counted.

### D3. Cycle grouping and side

Events are grouped by `payload.trade_cycle_id`. The side of a cycle comes from its last
`entry_package_applied` of the answer (latest `occurred_at`, then greater `event_id`): stop above
trigger is short, stop below trigger is long. Without a readable applied record the side is
unknown. The panel does not guess the side from the projection.

### D4. Open marker

For each `trade_cycle_opened` with a readable `average_entry_price` (decimal-string rule of the
projection): an arrow at that price on its bar, up for long, down for short, a dot when unknown,
in the Entry colour, filled (Applied rings are hollow). Several opened events of one cycle each
draw a marker and each count.

### D5. Close marker

For each `trade_cycle_closed`: a lightweight-charts series marker on the candle series, on its
bar, with text by reason: `stop_loss` "SL" (Stop colour), `take_profit` "TP" (Take colour), any
other reason its text as is (neutral colour). Placement: short stop and long take above the
candle, long stop and short take below, unknown side above. It is never placed at a price.

### D6. Position period

For a cycle with an open marker in the window: a solid line in the Entry colour at
`average_entry_price` from the open bar to the close bar of the same cycle, or to the last candle
of the window if the cycle has no close event in the answer. On the same bars, dashed lines at the
stop and take of the cycle's last applied record (D3), each only when readable. These lines are a
separate series and do not change the projection lines or the rings.

### D7. Unreadable

An opened event without a readable `average_entry_price` or without `trade_cycle_id`, and a closed
event without `reason` or `trade_cycle_id`, draws nothing and is counted as unreadable.

### D8. Legend

When the window has cycle events: an "Opened" arrow swatch with "N opened", "M closed" with the
split by reason ("SL k, TP j, other i"), and "N unreadable cycle events" when there are any.

## Risks / Trade-offs

- The close label has no price: where on the bar the stop actually filled is not shown. Showing it
  needs an exit price in the Journal (Runtime/ABI change), outside this change.
- The dashed stop and take are the levels sent with the entry order; a later amend on the exchange
  is not visible.
- A closure journaled without a bar (pending close recovery) may not be returned by a bar-range
  request; it is then neither drawn nor counted.
- The 4 stale BTC instances have no cycle events; nothing changes for them.
