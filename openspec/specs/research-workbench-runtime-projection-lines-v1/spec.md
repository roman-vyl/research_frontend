# research-workbench-runtime-projection-lines-v1 Specification

## Purpose
Draw the Strategy Runtime desired entry (entry, stop, take) from the Central Journal as projection lines on the Runtime Dashboard candle chart, distinguishing no signal from no recorded evaluation.
## Requirements
### Requirement: Projection comes from the Central Journal
The panel SHALL read the selected strategy's `live_entry_evaluated` events from the Central Journal
(`GET /v1/events`, `event_type=live_entry_evaluated`, no `limit`) with one request for the bars of the candle window and SHALL NOT compute or infer a projection
itself. It SHALL read only `desired_entry.planned_entry_price`, `initial_stop_price` and
`initial_take_price` of each event.

#### Scenario: Strategy selected
- **WHEN** a strategy is selected
- **THEN** the panel requests that strategy's events for the candle window and draws the lines from them

#### Scenario: Unexpectedly truncated answer
- **WHEN** the events answer has `truncated = true`
- **THEN** the panel shows "Projection unavailable" and draws no lines, never an incomplete history as complete

#### Scenario: Same market, other strategy
- **WHEN** another strategy of the displayed market is selected
- **THEN** no candles or bounds request is made and that strategy's events are requested

### Requirement: Three projection lines
The chart SHALL draw three lines over the candles: Entry from `planned_entry_price`, Stop from
`initial_stop_price` and Take from `initial_take_price`, with one point per bar that has a valid
signal event, at the bar's open time. A bar with a single signal SHALL still be visible.

#### Scenario: Strategy just enabled
- **WHEN** the strategy has produced signal events on 3 consecutive bars
- **THEN** each line has 3 points

#### Scenario: An hour later
- **WHEN** the strategy has produced signal events on 12 consecutive bars
- **THEN** each line has 12 points

### Requirement: No signal breaks the lines
A bar whose event has `desired_entry = null` SHALL break all three lines at that bar; a line SHALL
NOT continue the previous values across it.

#### Scenario: Signal disappears
- **WHEN** bars 1 to 3 have a signal, bar 4 has `desired_entry = null`, and bar 5 has a signal
- **THEN** the lines have points at bars 1 to 3, a gap at bar 4 and a new segment at bar 5

### Requirement: A missing record is not a calculation without a signal
The start of a strategy's known history SHALL be its `first_bar_open_time_ms` from
`GET /v1/strategy-instances`, not the first event inside the loaded window. A bar at or after that
time that has no journal event SHALL break all three lines and SHALL be marked "No evaluation
recorded". It SHALL NOT be drawn like a bar with `desired_entry = null`, and the UI SHALL NOT claim
why the record is missing. Bars before that time SHALL stay empty.

#### Scenario: Missing event
- **WHEN** events exist for bars 1, 2 and 4 of a strategy
- **THEN** bar 3 is counted as "No evaluation recorded" (legend counter, no marker on the chart) and the lines are broken at bar 3

#### Scenario: Window starts inside the known history
- **WHEN** the strategy's `first_bar_open_time_ms` is earlier than the window start and the first event inside the window is on day 3
- **THEN** the bars of days 1 and 2 are counted as "No evaluation recorded" in the legend, with no lines and no markers

#### Scenario: Before the strategy's known history
- **WHEN** the window starts earlier than `first_bar_open_time_ms`
- **THEN** the bars before it have no lines and no markers

### Requirement: Unreadable events are counted, not drawn
An event whose `desired_entry` is neither `null` nor an object with the three price strings SHALL
break the lines at its bar and SHALL be counted as unreadable in the legend.

#### Scenario: Malformed entry
- **WHEN** an event carries a `desired_entry` without `initial_take_price`
- **THEN** the lines break at that bar and the legend reports one unreadable bar

### Requirement: Several evaluations of one bar
When several events exist for one bar the one with the latest `occurred_at` SHALL be used, and equal `occurred_at` SHALL be resolved by the greater `event_id`.

#### Scenario: Bar evaluated twice
- **WHEN** a bar has an earlier signal event and a later event with `desired_entry = null`
- **THEN** the bar is drawn as no signal

### Requirement: Journal unavailable
If the Central Journal request fails the panel SHALL keep the candles, draw no projection lines and
no "No evaluation recorded" count, and show "Projection unavailable" with Retry.

#### Scenario: Journal down
- **WHEN** the events request fails
- **THEN** candles are shown, "Projection unavailable" is shown with Retry, and no lines are drawn

### Requirement: Cards show the last evaluated bar
Each strategy card SHALL show the UTC time of its last evaluated bar from
`GET /v1/strategy-instances`, or "No evaluations yet" when the Journal has none for it. If the
Journal cannot be read the cards SHALL look as they did before this change.

#### Scenario: Strategy with evaluations
- **WHEN** the Journal lists the strategy with `last_bar_open_time_ms`
- **THEN** its card shows that time in UTC

### Requirement: Refresh repeats the event requests
Refresh SHALL repeat the bounds request, re-evaluate candle coverage as before, and repeat the event
requests for the whole window. There SHALL be no automatic polling.

#### Scenario: New bars after Refresh
- **WHEN** the strategy evaluated 3 more bars and the user presses Refresh
- **THEN** each line gains 3 points

### Requirement: Existing guarantees stay
The change SHALL NOT call viewport methods, SHALL NOT import the Research Chart runtime, SHALL NOT
modify `features/chart/`, `features/workbenchChartRuntime/` or `shared/context/`, SHALL NOT clear or
reset the market cache, and SHALL NOT change the candle loading of V1.

#### Scenario: Static guards
- **WHEN** the source of `src/features/runtime/` is inspected
- **THEN** it contains none of the forbidden calls or imports

