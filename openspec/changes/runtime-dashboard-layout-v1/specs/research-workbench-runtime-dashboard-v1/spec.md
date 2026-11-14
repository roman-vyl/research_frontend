## MODIFIED Requirements

### Requirement: Strategy list from Runtime

The panel SHALL read the list from Runtime's `GET /v1/strategy-instances` through the same-origin `/runtime-api` dev-proxy path and SHALL show one card per entry of `strategy_instances`, in the order received, enabled and disabled alike. A header SHALL show the number of strategies and how many are enabled and disabled. A card with a recognized stored-strategy summary SHALL present its instrument/geometry as the primary heading and its protection/management tokens as a separate detail line. Unknown matched specifications and unmatched Runtime files SHALL retain their defined unknown/file fallbacks. File names and `strategy_instance_id` SHALL remain available as operational identity without competing with the primary strategy description.

#### Scenario: Cards
- **WHEN** Runtime returns one enabled instance whose recognized summary is `ETH · 7/170 · SL 4,75 · TP 4 · TD 3/0,75R`
- **THEN** the card's primary heading shows `ETH · 7/170`
- **AND** a separate detail line shows `SL 4,75 · TP 4 · TD 3/0,75R`
- **AND** the card shows the text ENABLED
- **AND** its deployment file remains available as secondary identity and in operational control names

#### Scenario: State is stated in text
- **WHEN** a card is rendered
- **THEN** its state is given by the text ENABLED or DISABLED, not by color alone

#### Scenario: Nothing implies running
- **WHEN** the panel renders any state
- **THEN** it does not use the words running, active, live or trading for a strategy

#### Scenario: Unknown and unmatched summaries
- **WHEN** a matched specification is unsupported or malformed
- **THEN** the primary heading shows `Неизвестная спецификация` without breaking the card or list
- **WHEN** a Runtime file has no unambiguous candidate association
- **THEN** the primary heading uses the existing file-name fallback

## ADDED Requirements

### Requirement: Runtime Dashboard uses the operator viewport

The Runtime Dashboard SHALL use a wide responsive content area independent of the shared narrow Surface content cap. On desktop it SHALL provide a stable strategy rail and a flexible chart pane; on narrower viewports it SHALL stack the panes without horizontal page overflow.

#### Scenario: Wide desktop
- **WHEN** the available viewport is at least 1100px wide
- **THEN** the strategy rail and chart are side by side
- **AND** the chart pane receives the remaining content width
- **AND** the dashboard content is not capped at 1080px

#### Scenario: Narrow viewport
- **WHEN** the available viewport is below 1100px
- **THEN** the strategy list and chart are stacked in one column
- **AND** cards and controls remain usable without horizontal page scrolling

### Requirement: Operational trade state has a distinct hierarchy

Open-position, entry-order and recovery state SHALL be visually distinct from descriptive strategy metadata while retaining the existing text content and action behavior. The selected card SHALL remain identifiable without relying on color alone through its existing pressed state.

#### Scenario: Open position
- **WHEN** a card has trade state `in_position` and side `short`
- **THEN** it displays `IN POSITION · SHORT` as a dedicated operational badge
- **AND** its Close position action remains outside the card selection button

#### Scenario: Selected card
- **WHEN** a card is selected
- **THEN** it has `aria-pressed="true"`
- **AND** its visual treatment distinguishes it from unselected cards without changing its operational identity
