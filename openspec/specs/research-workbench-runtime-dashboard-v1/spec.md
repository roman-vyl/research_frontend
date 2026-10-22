# research-workbench-runtime-dashboard-v1 Specification

## Purpose
The Runtime Dashboard tab: the strategy list from Runtime, strategy selection and the candle chart of the selected strategy's market.
## Requirements
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
- **WHEN** the request fails at the network level, or the proxy answers 502, 504 or a 5xx without a Runtime body
- **THEN** the panel shows "Runtime is not reachable"

#### Scenario: Retry after error
- **WHEN** the panel shows an error and the user presses Retry
- **THEN** one new request is sent
- **AND** on success the list replaces the error

#### Scenario: Late response
- **WHEN** the user leaves the tab before a response arrives
- **THEN** the response is ignored

### Requirement: Visual language follows the Surface tab

The panel SHALL be built from the Surface design tokens and classes (scoped under `.sx`), and
SHALL follow the system light and dark theme.

#### Scenario: Theme
- **WHEN** the system theme is dark
- **THEN** the panel uses the dark tokens of the Surface tab and defines no color of its own outside tokens

### Requirement: Each strategy card has an enable switch
Each card SHALL have a switch, outside the card's select button, whose state is the card's `enabled` value from the list. Activating it SHALL send exactly one `PUT /runtime-api/v1/strategy-instances/{strategy_instance_id}/enabled` with body `{"enabled": <the opposite value>}`.

#### Scenario: Disable an idle strategy
- **WHEN** the user switches an enabled card off and Runtime answers `200`
- **THEN** the list is requested again and the card shows DISABLED

#### Scenario: Enable
- **WHEN** the user switches a disabled card on and Runtime answers `200`
- **THEN** the list is requested again and the card shows ENABLED

#### Scenario: Busy
- **WHEN** a request for a card is in flight
- **THEN** its switch is disabled and further clicks on it send nothing
- **AND** the other cards' switches stay usable

#### Scenario: Switch is accessible
- **WHEN** a card is rendered
- **THEN** its switch has `role="switch"`, `aria-checked` equal to the list value and an accessible name that includes the strategy name

### Requirement: A refusal is explained in a dialog
When Runtime answers a switch request with anything but `200`, the card SHALL keep its previous state and a dialog SHALL state the reason. A body is read as a reason only when its `status` is `enabled_change_refused`. Exact texts by reason: `position_open` "This strategy has an open position and cannot be disabled."; `recovery_pending` "This strategy is recovering an order or position and cannot be disabled yet."; `cycle_not_settled` "This strategy's trade cycle has just ended. Try again after the next bar."; `cancel_not_confirmed` "The entry order could not be confirmed cancelled on the exchange. The strategy stays enabled."; `abi_unavailable` "The exchange gateway did not answer. The strategy stays enabled."; `instance_busy` "The strategy is processing a bar. Try again in a moment."; `file_changed` "The strategy file was changed while switching. Nothing was changed. Try again."; `write_failed` "Runtime could not write the strategy file. Nothing was changed. Try again."; `strategy_instance_not_found` "Runtime no longer has this strategy. Refresh the list."; `catalog_unavailable` "Runtime cannot read the strategy files. Nothing was changed."; any other answer (including `identity_changed`, a not-ready or internal-error body and a rejected body) or a network failure "Runtime did not answer correctly. Nothing was changed."

#### Scenario: Open position
- **WHEN** Runtime answers `409` with reason `position_open` to a disable request
- **THEN** a dialog shows the `position_open` text
- **AND** the card still shows ENABLED
- **AND** the list is not requested again

#### Scenario: Dialog behaviour
- **WHEN** the dialog is shown
- **THEN** it has `role="alertdialog"` and one OK button, closes on OK or Esc, and returns focus to that card's switch

#### Scenario: File could not be written
- **WHEN** Runtime answers `500` with reason `write_failed` to a disable request
- **THEN** a dialog shows the `write_failed` text and the card still shows ENABLED
- **AND** the same text is shown when an enable request fails this way and the card still shows DISABLED
- **AND** the list is not requested again

#### Scenario: Unknown reason
- **WHEN** Runtime answers with a status or reason not in the list, or the request fails at the network
- **THEN** the dialog shows the generic text and the card keeps its state

### Requirement: The tab changes Runtime only through the enable switch
The Runtime Dashboard SHALL send `GET` requests and the enable switch's `PUT`, and nothing else, and SHALL NOT poll.

#### Scenario: Only the allowed mutation
- **WHEN** the tab is used (open, refresh, retry, switch)
- **THEN** every request has method `GET`, except the switch's `PUT` to `/runtime-api/v1/strategy-instances/{id}/enabled`

