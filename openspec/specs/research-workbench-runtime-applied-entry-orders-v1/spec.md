# research-workbench-runtime-applied-entry-orders-v1 Specification

## Purpose
Applied entry orders from the Central Journal drawn as rings at their entry, stop and take prices on the Runtime chart.
## Requirements
### Requirement: Applied orders come from the same Journal answer
The panel SHALL take the selected strategy's `entry_package_applied` events from the same
`GET /v1/events` answer as the evaluations: one request for the bars of the candle window, without
`event_type` and without `limit`. It SHALL split the answer by `event_type`, pass
`live_entry_evaluated` to the projection and `entry_package_applied` to the rings, and ignore other
types. It SHALL NOT compute or infer an applied order itself and SHALL read only `trigger_price`,
`stop_loss` and `take_profit` of each payload.

#### Scenario: Strategy selected
- **WHEN** a strategy is selected
- **THEN** the panel makes one events request without `event_type` and draws the lines and the rings from its answer

#### Scenario: No applied events
- **WHEN** a successful answer has evaluations and no `entry_package_applied` events
- **THEN** the projection is drawn as before, no rings are drawn and no error is shown

#### Scenario: Answer unavailable
- **WHEN** the events request fails or its answer has `truncated = true`
- **THEN** the panel shows "Projection unavailable" and draws neither lines nor rings

#### Scenario: Unknown event type
- **WHEN** the answer also contains an event of another type
- **THEN** that event draws nothing and is not counted

### Requirement: Rings on the bar of the applied order
For each applied record on a bar of the window, the chart SHALL draw a ring at the bar's open time
for each of `trigger_price` (Entry colour), `stop_loss` (Stop colour) and `take_profit` (Take colour)
that is a decimal string. A null value SHALL draw no ring. The rings SHALL NOT change the projection lines.

#### Scenario: Order placed as projected
- **WHEN** bar 5 has a signal with entry 100, stop 99, take 103 and an applied record with the same three prices
- **THEN** each projection point of bar 5 is drawn inside a ring of its colour

#### Scenario: Order differs from the projection
- **WHEN** bar 5 has a projected entry of 100 and an applied `trigger_price` of 100.5
- **THEN** the Entry ring of bar 5 is drawn at 100.5 and the projection point stays at 100

#### Scenario: Order without protection
- **WHEN** an applied record has `stop_loss` and `take_profit` null
- **THEN** only the Entry ring is drawn on that bar

### Requirement: Every applied record counts
Each `entry_package_applied` event SHALL be treated as a separate applied order. The panel SHALL NOT
select, merge or drop records of one bar; rings of several records may coincide visually.

#### Scenario: Two records on one bar
- **WHEN** bar 5 has two applied records
- **THEN** the rings of both are drawn and the legend counts 2 applied orders

### Requirement: Unreadable applied record
A record whose three prices are all null or unreadable, or that has a value that is neither null nor
a decimal string, SHALL draw no ring and SHALL be counted in the legend as unreadable applied.

#### Scenario: Broken value
- **WHEN** an applied record has `trigger_price` equal to `"abc"`
- **THEN** that record draws no rings and the legend shows "1 unreadable applied"

### Requirement: Legend
When the window has applied records, the legend SHALL show an "Applied" ring swatch and
"N applied orders", where N counts every applied record of the window.

#### Scenario: Three applied orders
- **WHEN** the window has 3 applied records, two of them on the same bar
- **THEN** the legend shows "3 applied orders"

