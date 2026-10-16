## ADDED Requirements

### Requirement: Runtime Dashboard tab

The Workbench navigation SHALL contain a tab labelled "Runtime Dashboard", placed after
"Candidates", that shows the Runtime Dashboard panel. Activating it SHALL NOT change any
other tab, the selected run or the stored session tab.

#### Scenario: Open the tab
- **WHEN** the user activates "Runtime Dashboard"
- **THEN** the Runtime Dashboard panel is shown
- **AND** exactly one `GET` request for the Runtime strategy list is sent

#### Scenario: Open the tab again
- **WHEN** the user leaves the tab and activates it again
- **THEN** the list is requested again

### Requirement: Strategy list from Runtime

The panel SHALL read the list from Runtime's `GET /v1/strategy-instances` through the
same-origin `/runtime-api` dev-proxy path and SHALL show one card per entry of
`strategy_instances`, in the order received, enabled and disabled alike. A header SHALL show
the number of strategies and how many are enabled and disabled.

#### Scenario: Cards
- **WHEN** Runtime returns one enabled instance `journal-smoke-eth-ema500.json` (`ema_pullback`, `ETHUSDT.P`, `5m`) and 32 disabled ones
- **THEN** the header shows 33 strategies, 1 enabled and 32 disabled
- **AND** the first card shows the name `journal-smoke-eth-ema500`, the line `ema_pullback · ETHUSDT.P · 5m`, the text ENABLED and its `strategy_instance_id`
- **AND** each disabled card shows the text DISABLED

#### Scenario: State is stated in text
- **WHEN** a card is rendered
- **THEN** its state is given by the text ENABLED or DISABLED, not by color alone

#### Scenario: Nothing implies running
- **WHEN** the panel renders any state
- **THEN** it does not use the words running, active, live or trading for a strategy

### Requirement: Catalog diagnostics are shown only when present

The panel SHALL show the response's `invalid_files` and `duplicate_identities` in a warning
block when at least one of them is not empty, and SHALL NOT render the block otherwise.

#### Scenario: Invalid file
- **WHEN** Runtime returns `invalid_files` with `bad.json` and `error_code` `invalid_json`
- **THEN** the warning block lists `bad.json · invalid_json`
- **AND** says these files are not in the list above

#### Scenario: Duplicate identity
- **WHEN** Runtime returns a duplicate identity with `source_paths` `a.json` and `b.json`
- **THEN** the warning block lists that `strategy_instance_id` with both file names

#### Scenario: No diagnostics
- **WHEN** both diagnostic lists are empty
- **THEN** no warning block is rendered

### Requirement: Loading, empty, error and refresh states

The panel SHALL show a loading state while the request is in flight, an empty state when
Runtime returns no strategies and no diagnostics, and a distinct error message per failure
kind. Refresh and Retry SHALL repeat the request and SHALL be disabled while one is in flight.

#### Scenario: Loading
- **WHEN** the request is in flight
- **THEN** the header and Refresh are shown and the list area shows "Loading…"

#### Scenario: Empty catalog
- **WHEN** Runtime returns an empty `strategy_instances` and empty diagnostics
- **THEN** the panel shows "No strategies in the Runtime catalog"

#### Scenario: Failure kinds
- **WHEN** Runtime answers `503 {"status":"not_ready"}`
- **THEN** the panel shows "Runtime is not ready"
- **WHEN** Runtime answers `503 {"status":"catalog_unavailable"}`
- **THEN** the panel shows "Runtime catalog is unavailable"
- **WHEN** Runtime answers any other non-success status
- **THEN** the panel shows "Runtime returned an error"
- **WHEN** the request fails at the network level, or the proxy answers 502 or 504
- **THEN** the panel shows "Runtime is not reachable"

#### Scenario: Retry after error
- **WHEN** the panel shows an error and the user presses Retry
- **THEN** one new request is sent
- **AND** on success the list replaces the error

#### Scenario: Late response
- **WHEN** the user leaves the tab before a response arrives
- **THEN** the response is ignored

### Requirement: The tab is read-only

The Runtime Dashboard SHALL send only `GET` requests and SHALL NOT contain a control that
changes Runtime, including enabling or disabling a strategy, and SHALL NOT poll.

#### Scenario: No mutation
- **WHEN** the tab is used (open, refresh, retry)
- **THEN** every request it sends has method `GET`

### Requirement: Visual language follows the Surface tab

The panel SHALL be built from the Surface design tokens and classes (scoped under `.sx`), and
SHALL follow the system light and dark theme.

#### Scenario: Theme
- **WHEN** the system theme is dark
- **THEN** the panel uses the dark tokens of the Surface tab and defines no color of its own outside tokens
