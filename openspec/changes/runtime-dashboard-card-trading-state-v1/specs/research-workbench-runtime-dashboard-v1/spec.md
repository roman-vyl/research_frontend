## ADDED Requirements

### Requirement: Each card shows the strategy's trade state from Runtime
Whenever the panel reads the strategy list, it SHALL also read `GET /runtime-api/v1/strategy-instance-states` and match items to cards by `strategy_instance_id`. A card SHALL show the text `IN POSITION · LONG` / `IN POSITION · SHORT` when the item's `trade_state` is `in_position`, `ENTRY ORDER · LONG` / `ENTRY ORDER · SHORT` when it is `entry_pending`, and nothing extra when it is `flat` or no item matches. A card SHALL additionally show `RECOVERY` when the item's `recovery_pending` is not `null`. The header SHALL show how many strategies are in position and how many have an entry order. A short note SHALL state that the marks are Runtime's state as of its last processed bar.

#### Scenario: In position and entry order
- **WHEN** Runtime reports `be9c…` `in_position` short and `6072…` `entry_pending` long, and the rest `flat`
- **THEN** the `be9c…` card shows `IN POSITION · SHORT`, the `6072…` card shows `ENTRY ORDER · LONG`, the other cards show neither
- **AND** the header shows 1 in position and 1 with an entry order

#### Scenario: Recovery
- **WHEN** an item has `recovery_pending: "entry"`
- **THEN** its card also shows `RECOVERY`

#### Scenario: Marks are text
- **WHEN** a mark is rendered
- **THEN** it is given by its text, not by color alone

### Requirement: A failed trade-state read does not hide the cards
If the states request fails or its body is not valid, the panel SHALL show the cards from the list without trade-state marks or counts, and one line `Trade state unavailable` with a Retry that repeats only the states request. A failed list request keeps today's behavior.

#### Scenario: States unavailable
- **WHEN** the list answers `200` and the states request answers `503`
- **THEN** all cards are shown, none has a trade-state mark, and `Trade state unavailable` with Retry is shown

#### Scenario: Only GET and no polling
- **WHEN** the tab is opened, refreshed or retried
- **THEN** the states request is a `GET`, sent only at those moments and never on a timer
