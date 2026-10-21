# research-workbench-runtime-trade-cycle-markers-v1 Specification

## Purpose
Trade cycles from the Central Journal on the Runtime chart: fill arrows, close labels on candles and position periods.
## Requirements
### Requirement: Cycle facts come from the same Journal answer
The panel SHALL take `trade_cycle_opened` and `trade_cycle_closed` events from the same
`GET /v1/events` answer that feeds the projection and the Applied rings, and SHALL NOT make another
request. It SHALL NOT infer a fill or a close from other events. A failed or truncated answer SHALL
draw no cycle markers.

#### Scenario: Answer with cycle events
- **WHEN** the answer contains `trade_cycle_opened` and `trade_cycle_closed` events on bars of the window
- **THEN** their markers are drawn and no extra request is made

#### Scenario: No cycle events
- **WHEN** a successful answer has no cycle events
- **THEN** the projection and the rings are drawn as before, no cycle markers are drawn and no error is shown

#### Scenario: Answer unavailable
- **WHEN** the events request fails or its answer has `truncated = true`
- **THEN** the panel shows "Projection unavailable" and draws no cycle markers

### Requirement: Open marker at the fill price
For each `trade_cycle_opened` on a bar of the window with a readable `average_entry_price`, the chart
SHALL draw a filled arrow at that price on that bar: up for a long cycle, down for a short cycle,
a dot when the side is unknown. The side SHALL come only from the cycle's last applied record
(stop above trigger is short, below is long).

#### Scenario: SOL short fill
- **WHEN** cycle `e8fc6911` has an applied record with trigger 103.30 and stop 105.15, and `trade_cycle_opened` on bar 22:00Z with `average_entry_price` 103.32
- **THEN** a down arrow is drawn at 103.32 on the 22:00Z candle

#### Scenario: Side unknown
- **WHEN** a cycle has an opened event and no readable applied record in the answer
- **THEN** a dot is drawn at `average_entry_price` on its bar

### Requirement: Close marker without a price
For each `trade_cycle_closed` on a bar of the window, the chart SHALL draw a label on that candle:
"SL" for `stop_loss`, "TP" for `take_profit`, the reason text otherwise. The label SHALL be placed
above or below the candle by side and reason (short stop and long take above, long stop and short
take below, unknown side above) and SHALL NOT be placed at a price.

#### Scenario: SOL stop-out
- **WHEN** short cycle `e8fc6911` has `trade_cycle_closed` on bar 02:05Z with reason `stop_loss`
- **THEN** an "SL" label in the Stop colour is drawn above the 02:05Z candle

#### Scenario: Close without open in the window
- **WHEN** a cycle's opened event lies before the window and its closed event is inside
- **THEN** only the close label is drawn for that cycle

### Requirement: Position period
For a cycle with an open marker in the window, the chart SHALL draw a solid Entry-colour line at
`average_entry_price` from the open bar to that cycle's close bar, or to the last candle when the
answer has no close for it, and on the same bars dashed lines at the readable stop and take of the
cycle's last applied record. These lines SHALL NOT change the projection lines or the rings.

#### Scenario: Closed SOL cycle
- **WHEN** cycle `e8fc6911` opened on 22:00Z at 103.32 and closed on 02:05Z, last applied stop 105.15 and take 93.11
- **THEN** a solid line at 103.32 and dashed lines at 105.15 and 93.11 run from 22:00Z to 02:05Z

#### Scenario: Position still open
- **WHEN** a cycle has an opened event and no closed event in the answer
- **THEN** its lines run from the open bar to the last candle of the window

### Requirement: Unreadable cycle event
An opened event without `trade_cycle_id` or a readable `average_entry_price`, and a closed event
without `trade_cycle_id` or `reason`, SHALL draw nothing and SHALL be counted as unreadable.

#### Scenario: Broken fill price
- **WHEN** an opened event has `average_entry_price` equal to `"abc"`
- **THEN** it draws nothing and the legend shows "1 unreadable cycle events"

### Requirement: Legend
When the window has cycle events, the legend SHALL show "N opened" and "M closed" with the split by
reason, counting every event of the window.

#### Scenario: Two trades
- **WHEN** the window has 2 opened events, one closed by `stop_loss` and one by `take_profit`
- **THEN** the legend shows "2 opened" and "2 closed (SL 1, TP 1)"

