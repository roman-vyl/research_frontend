## MODIFIED Requirements

### Requirement: Projection comes from the Central Journal
The panel SHALL read the selected strategy's events from the Central Journal (`GET /v1/events`,
without `event_type`, no `limit`) with one request for the bars of the candle window and SHALL use
only its `live_entry_evaluated` events for the projection. It SHALL NOT compute or infer a
projection itself. It SHALL read only `desired_entry.planned_entry_price`, `initial_stop_price` and
`initial_take_price` of each event.

#### Scenario: Strategy selected
- **WHEN** a strategy is selected
- **THEN** the panel requests that strategy's events for the candle window and draws the lines from its `live_entry_evaluated` events

#### Scenario: Unexpectedly truncated answer
- **WHEN** the events answer has `truncated = true`
- **THEN** the panel shows "Projection unavailable" and draws no lines, never an incomplete history as complete

#### Scenario: Same market, other strategy
- **WHEN** another strategy of the displayed market is selected
- **THEN** no candles or bounds request is made and that strategy's events are requested
