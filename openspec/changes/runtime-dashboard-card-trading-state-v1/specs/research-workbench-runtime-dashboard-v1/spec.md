## ADDED Requirements

### Requirement: Each card shows the strategy's trade state from the Journal
Whenever the panel reads the strategy list, it SHALL also read `GET /journal-api/v1/strategy-instances` and, for every listed strategy that has a `last_bar_open_time_ms`, the events of exactly that bar from `GET /journal-api/v1/events`. A card SHALL show `IN POSITION · LONG` / `IN POSITION · SHORT` when that bar has an `open_trade_evaluated` event (side from that event), `ENTRY ORDER · LONG` / `ENTRY ORDER · SHORT` when it has an `entry_package_applied` event (side from that bar's `live_entry_evaluated` `desired_entry`), and nothing extra otherwise or when the strategy has no journaled bar. The header SHALL show how many strategies are in position and how many have an entry order, and a short note SHALL state that the marks are the Journal's state as of each strategy's last processed bar.

#### Scenario: In position
- **WHEN** a strategy's last journaled bar has an `open_trade_evaluated` event with side `short`
- **THEN** its card shows `IN POSITION · SHORT`

#### Scenario: Entry order
- **WHEN** a strategy's last journaled bar has an `entry_package_applied` event and a `live_entry_evaluated` event whose `desired_entry.side` is `long`
- **THEN** its card shows `ENTRY ORDER · LONG`

#### Scenario: Flat
- **WHEN** the last journaled bar has only a `live_entry_evaluated` event, or the strategy has no journaled bar
- **THEN** the card shows neither mark

#### Scenario: Counts
- **WHEN** one strategy is in position and one has an entry order
- **THEN** the header shows 1 in position and 1 with an entry order

#### Scenario: Marks are text
- **WHEN** a mark is rendered
- **THEN** it is given by its text, not by color alone

### Requirement: A failed trade-state read does not hide the cards
If any Journal read for the marks fails or returns an invalid body, the panel SHALL show the cards from the list without marks or counts, and one line `Trade state unavailable` with a Retry that repeats only the Journal reads. A failed list request keeps today's behavior. The reads SHALL be `GET` requests sent only with the list reads or that Retry, never on a timer.

#### Scenario: Journal unavailable
- **WHEN** the list answers `200` and a Journal read answers `503`
- **THEN** all cards are shown, none has a mark, and `Trade state unavailable` with Retry is shown

#### Scenario: Only GET and no polling
- **WHEN** the tab is opened, refreshed or retried
- **THEN** the Journal reads are `GET`s sent only at those moments
