## ADDED Requirements

### Requirement: Applied orders come from the Central Journal
The panel SHALL read the selected strategy's `entry_package_applied` events from the Central Journal
(`GET /v1/events`, `event_type=entry_package_applied`, no `limit`) for the bars of the candle window,
in parallel with the evaluation request, and SHALL NOT compute or infer an applied order itself. It
SHALL read only `trigger_price`, `stop_loss` and `take_profit` of each payload.

#### Scenario: Strategy selected
- **WHEN** a strategy is selected
- **THEN** the panel requests its evaluations and its applied records for the candle window

#### Scenario: Applied answer unavailable
- **WHEN** the applied request fails or its answer has `truncated = true`
- **THEN** the panel shows "Applied orders unavailable", draws no rings, and still draws the projection

### Requirement: Rings on the bar of the applied order
For each bar of the window with an applied record, the chart SHALL draw a ring at the bar's open time
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

### Requirement: One applied record per bar
When a bar has several applied records, the record with the latest `occurred_at` SHALL count, equal
times resolved by the greater `event_id`.

#### Scenario: Two records on one bar
- **WHEN** bar 5 has two applied records
- **THEN** only the rings of the later one are drawn

### Requirement: Unreadable applied record
A record whose three prices are all unreadable or null, or that has a value that is neither null nor
a decimal string, SHALL draw no ring and SHALL be counted in the legend as unreadable applied.

#### Scenario: Broken value
- **WHEN** an applied record has `trigger_price` equal to `"abc"`
- **THEN** that bar has no rings and the legend shows "1 unreadable applied"

### Requirement: Legend
When the window has applied records, the legend SHALL show an "Applied" ring swatch and "N applied orders".

#### Scenario: Three applied orders
- **WHEN** the window has applied records on 3 bars
- **THEN** the legend shows "3 applied orders"
