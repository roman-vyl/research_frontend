## ADDED Requirements

### Requirement: Each card shows the strategy's trade state from Runtime
Whenever the panel reads the strategy list, and every 10 seconds while the Runtime Dashboard tab is visible, it SHALL read `GET /runtime-api/v1/strategy-instance-states` and match each item to a card by `strategy_instance_id`. A card SHALL show `IN POSITION · LONG` / `IN POSITION · SHORT` when `trade_state` is `in_position`, `ENTRY ORDER · LONG` / `ENTRY ORDER · SHORT` when it is `entry_pending` (side from the item), `RECOVERY · ENTRY` / `RECOVERY · CLOSE` when `recovery_pending` is `entry` / `close` (in addition to the state mark), and nothing extra when `flat` or when the strategy has no item. The header SHALL show how many strategies are in position and how many have an entry order, and a short note SHALL state that the marks are Runtime's state as of each strategy's last processed bar.

#### Scenario: In position
- **WHEN** an item has `trade_state: "in_position"` and `side: "short"`
- **THEN** its card shows `IN POSITION · SHORT`

#### Scenario: Entry order
- **WHEN** an item has `trade_state: "entry_pending"` and `side: "long"`
- **THEN** its card shows `ENTRY ORDER · LONG`

#### Scenario: Flat
- **WHEN** an item is `flat` with no recovery, or a strategy has no item
- **THEN** the card shows no mark

#### Scenario: Recovery marker
- **WHEN** an item has `recovery_pending: "close"`
- **THEN** the card shows `RECOVERY · CLOSE` next to its state mark

#### Scenario: Counts
- **WHEN** one strategy is in position and one has an entry order
- **THEN** the header shows 1 in position and 1 with an entry order

#### Scenario: Marks are text
- **WHEN** a mark is rendered
- **THEN** it is given by its text, not by color alone

### Requirement: The state read is read-only and cadence-limited
The state read SHALL be a `GET` sent with the list reads, by Retry, and every 10 seconds while the tab is visible, and SHALL NOT run while the tab is hidden or overlap an unfinished state read.

#### Scenario: Refresh every 10 seconds
- **WHEN** the Runtime Dashboard tab stays visible for 30 seconds
- **THEN** the state route is read about three times, only with `GET`

#### Scenario: Hidden tab
- **WHEN** the tab is hidden
- **THEN** no state read is sent until it is visible again

### Requirement: A failed state read does not hide the cards
If the state read fails or returns an invalid body, the panel SHALL show the cards from the list without marks or counts and one line `Trade state unavailable`; the next scheduled read or Retry repeats only the state read. A failed list request keeps today's behavior.

#### Scenario: Runtime state unavailable
- **WHEN** the list answers `200` and the state route answers `503`
- **THEN** all cards are shown without marks and `Trade state unavailable` is shown

#### Scenario: Recovery from failure
- **WHEN** the next state read succeeds
- **THEN** the marks return and the failure line disappears
