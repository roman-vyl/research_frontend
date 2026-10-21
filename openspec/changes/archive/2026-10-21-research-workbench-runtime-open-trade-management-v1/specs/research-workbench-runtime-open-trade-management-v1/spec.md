## ADDED Requirements

### Requirement: Open-position events come from the same Journal answer
The panel SHALL take the selected strategy's `open_trade_evaluated` and `protection_applied` events
from the same `GET /v1/events` answer as the other layers, split by `event_type`. It SHALL NOT make
an extra request, SHALL NOT compute or infer a protection itself, and SHALL ignore unknown types. A
failed or truncated answer SHALL draw none of the layers.

#### Scenario: Answer without the new types
- **WHEN** a successful answer has no `open_trade_evaluated` or `protection_applied` events
- **THEN** the chart is drawn as before and no error is shown

#### Scenario: Answer unavailable
- **WHEN** the events request fails or its answer has `truncated = true`
- **THEN** neither open-position lines nor protection rings are drawn

### Requirement: Engine's open-position projection as lines
The chart SHALL draw, from one `open_trade_evaluated` event per bar (latest `occurred_at`, then
greater `event_id`), a Stop line at `desired_protection.stop_price` and a Take line at
`desired_protection.take_price` in the Stop and Take colours, with dots on each bar. A null
`take_price` SHALL give no Take point on that bar. Lines SHALL be broken between bars without an
event and between bars whose `trade_cycle_id` differs, even when the bars are adjacent.
`trade_cycle_id` SHALL be read only for this split and SHALL NOT be shown. A bar with
`close_signal.active = true` SHALL get one "close" marker bound to the candle, whose vertical place
does not depend on the Stop point; it SHALL be drawn even when the bar's stop or take is unreadable
or missing.

#### Scenario: Engine text with trailing zeros
- **WHEN** an event has `desired_protection.stop_price` `"105.150"`
- **THEN** the Stop point is drawn at 105.15

#### Scenario: Two trades
- **WHEN** two open positions are separated by bars without `open_trade_evaluated`
- **THEN** their lines are not joined

#### Scenario: Two trades on adjacent bars
- **WHEN** two adjacent bars have `open_trade_evaluated` events with different `trade_cycle_id`
- **THEN** their lines are not joined and no `trade_cycle_id` is shown

#### Scenario: Close signal
- **WHEN** an event has `close_signal.active = true`
- **THEN** that bar shows a "close" marker bound to the candle

#### Scenario: Close signal without protection levels
- **WHEN** an event has `close_signal.active = true` and no readable `desired_protection.stop_price`
- **THEN** that bar shows the "close" marker, has no Stop or Take point, and is counted as unreadable

### Requirement: Confirmed protection as rings
For each `protection_applied` record on a bar of the window, the chart SHALL draw a Stop ring at
`stop_order.trigger_price` and, when `confirmed_protection.take_price` is not null, a Take ring at
`take_order.trigger_price`. Every record SHALL count on its own.

#### Scenario: Protection moved
- **WHEN** a record has a stop order at 101.2 and a take order at 120.5 with a non-null confirmed take
- **THEN** a Stop ring at 101.2 and a Take ring at 120.5 are drawn on its bar

#### Scenario: Technical take
- **WHEN** a record has `confirmed_protection.take_price: null` and a take order far away
- **THEN** only the Stop ring is drawn and the legend counts one technical take (not drawn)

#### Scenario: Unreadable record
- **WHEN** a record has no decimal-string `stop_order.trigger_price`
- **THEN** it draws nothing and is counted as unreadable
