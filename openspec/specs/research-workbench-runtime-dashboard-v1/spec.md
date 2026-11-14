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
The Runtime Dashboard SHALL send `GET` requests, the enable switch's `PUT` and the trash button's `DELETE`, and nothing else, and SHALL NOT poll.

#### Scenario: Only the allowed mutation
- **WHEN** the tab is used (open, refresh, retry, switch, delete)
- **THEN** every request has method `GET`, except the switch's `PUT` to `/runtime-api/v1/strategy-instances/{id}/enabled` and the confirmed `DELETE` to `/runtime-api/v1/strategy-instances/{id}`

### Requirement: Each strategy card has a trash button that deletes a disabled strategy after confirmation
Each card SHALL have a trash button, outside the card's select button, usable only when the card's `enabled` value is false. Activating it SHALL open a confirmation dialog with a Cancel button and a Delete button; only the Delete button SHALL send exactly one `DELETE /runtime-api/v1/strategy-instances/{strategy_instance_id}`. A `200` SHALL count as a delete only when its body has the requested `strategy_instance_id`, `deleted: true` and a boolean `cancelled_entry_order`.

#### Scenario: Delete a disabled strategy
- **WHEN** the user confirms the delete of a disabled card and Runtime answers `200`
- **THEN** the list is requested again with the cards kept on screen, the card is gone, and a selection on that card is cleared

#### Scenario: Cancel sends nothing
- **WHEN** the user closes the confirmation with Cancel or Esc
- **THEN** no request is sent and focus returns to that card's trash button

#### Scenario: Enabled card
- **WHEN** a card shows ENABLED
- **THEN** its trash button is disabled and its title says "Disable it first."

#### Scenario: Busy
- **WHEN** a switch or a delete request of a card is in flight
- **THEN** that card's switch and trash button are disabled
- **AND** the other cards' controls stay usable

#### Scenario: Accessible
- **WHEN** a card is rendered
- **THEN** its trash button is a `button` with an accessible name that includes the strategy name, and the confirmation has `role="alertdialog"` with initial focus on Cancel

### Requirement: A delete refusal is explained in a dialog
When Runtime answers a delete request with anything but a valid `200`, the card SHALL stay, the list SHALL NOT be requested again, and a dialog with one OK button SHALL state the reason. A body is read as a reason only when its `status` is `delete_refused`. Exact texts by reason: `still_enabled` "This strategy is enabled. Disable it first."; `position_open` "This strategy has an open position and cannot be deleted."; `recovery_pending` "This strategy is recovering an order or position and cannot be deleted yet."; `cycle_not_settled` "This strategy's trade cycle has just ended. Try again after the next bar."; `cancel_not_confirmed` "The entry order could not be confirmed cancelled on the exchange. The strategy was not deleted."; `abi_unavailable` "The exchange gateway did not answer. The strategy was not deleted."; `instance_busy` "The strategy is processing a bar. Try again in a moment."; `file_changed` "The strategy file was changed while deleting. Nothing was changed. Try again."; `trash_name_taken` and `move_failed` "Runtime could not move the strategy file to the trash. Nothing was changed. Try again."; `strategy_instance_not_found` "Runtime no longer has this strategy. Refresh the list."; `catalog_unavailable` "Runtime cannot read the strategy files. Nothing was changed."; any other answer or a network failure "Runtime did not answer correctly. Nothing was changed."

#### Scenario: Open position
- **WHEN** Runtime answers `409` with reason `position_open` to a delete request
- **THEN** a dialog shows the `position_open` text, the card stays and the list is not requested again

#### Scenario: Dialog behaviour
- **WHEN** the refusal dialog is shown
- **THEN** it has `role="alertdialog"` and one OK button, closes on OK or Esc, and returns focus to that card's trash button

#### Scenario: Unknown reason or invalid success
- **WHEN** Runtime answers with a status or reason not in the list, a `200` whose body does not confirm the delete, or the request fails at the network
- **THEN** the dialog shows the generic text and the card stays

### Requirement: Cards offer Close position and Cancel entry order by trade state
A card SHALL show a `Close position` button when its strategy's Runtime trade state is `in_position`, a `Cancel entry order` button when it is `entry_pending`, and neither otherwise or when the trade state is unavailable.

#### Scenario: In position
- **WHEN** a card's trade state is `in_position`
- **THEN** it shows `Close position` and not `Cancel entry order`

#### Scenario: Entry order
- **WHEN** a card's trade state is `entry_pending`
- **THEN** it shows `Cancel entry order` and not `Close position`

#### Scenario: Flat or unknown
- **WHEN** a card is flat, or the trade state could not be read
- **THEN** it shows neither button

### Requirement: Every command is confirmed in the page and tells what it will do
A click SHALL open an in-page confirmation naming the strategy and stating in plain words that the position will be closed at market and its stop and take cancelled (or that the resting entry order will be cancelled) and that the strategy will be disabled. Nothing SHALL be sent before the confirmation is accepted, and cancelling the confirmation SHALL send nothing.

#### Scenario: Confirmation text
- **WHEN** `Close position` is clicked
- **THEN** a confirmation names the strategy and says the position will be closed, orders cancelled and the strategy disabled

#### Scenario: Declined
- **WHEN** the confirmation is cancelled
- **THEN** no request is sent

### Requirement: The command is sent once and its outcome is shown
Accepting SHALL send exactly one `POST` to `/runtime-api/v1/strategy-instances/{id}/close-position` or `/cancel-entry-orders` with an empty body, disable that card's buttons while it runs, and never retry automatically. On `200` the panel SHALL re-read the list and the trade state. On any other answer it SHALL show Runtime's reason in plain text and whether anything was changed; for a `502` on close it SHALL say that Runtime is still completing the close and the strategy is already disabled.

#### Scenario: Success
- **WHEN** Runtime answers `200`
- **THEN** the list and trade state are re-read and the card shows the new state

#### Scenario: Refusal
- **WHEN** Runtime answers `409` with reason `recovery_pending`
- **THEN** the dialog says the strategy is recovering an order or position and nothing was changed

#### Scenario: Close not confirmed
- **WHEN** Runtime answers `502` to a close
- **THEN** the dialog says the close is still being completed by Runtime and the strategy is already disabled

#### Scenario: No automatic sending
- **WHEN** the tab is opened, refreshed or the 10-second state refresh runs
- **THEN** no command is sent

### Requirement: Runtime cards show stored strategy characteristics when a candidate matches

On every Runtime Dashboard catalog load, the Workbench SHALL also request the existing Candidates list. A Runtime strategy SHALL match a candidate only when exactly one candidate has a non-duplicate `current.runtime.file` equal to that Runtime entry's `source_path` and has a stored `strategy_spec_snapshot` whose source is `run_request`. The card SHALL derive its short strategy summary only from the Runtime instrument, that candidate's stored coordinates and that stored strategy-spec snapshot; current Surface values, current metrics and strategy recalculation SHALL NOT be used.

The summary SHALL use the card's existing primary-name place and SHALL order recognized parts as: compact instrument, `width/lookback`, `SL`, `TP`, managed-policy characteristics, touch cap. The first supported vocabulary SHALL present initial-R trailing as `TD <trigger>/<distance>R`, an ADX-controlled trail as `ADX <timeframe> Δ<threshold> · D <distance>R`, ADX-controlled break-even as `BE по ADX <timeframe> Δ<threshold>`, and the inclusive episode touch limit as `касания ≤<maximum>`. Decimal values SHALL omit unnecessary trailing zeros and use a decimal comma. The frontend SHALL only format explicitly stored values and SHALL NOT evaluate conditions, convert units or infer missing strategy rules. The formatter SHALL distinguish known components that intentionally contribute no short token from an unsupported `component_id`; it SHALL NOT silently omit an unsupported component and present the remainder as a complete summary.

#### Scenario: Fixed take and trailing distance

- **GIVEN** Runtime lists `ETHUSDT.P` from a file matched to one candidate
- **AND** the candidate stores coordinates `width=7`, `lookback=170`, `sl=4.75`, `tp_ratio=4`, `td_trigger_r=3`, `td_distance_r=0.75`
- **AND** its stored spec contains the corresponding initial stop, fixed take and `initial_r_trailing_stop`
- **WHEN** the card is rendered
- **THEN** its primary label is `ETH · 7/170 · SL 4,75 · TP 4 · TD 3/0,75R`.

#### Scenario: ADX break-even followed by ordinary trailing

- **GIVEN** a matched `SOLUSDT.P` candidate stores `width=4`, `lookback=240`, `sl=6`, `tp_ratio=6`, `td_trigger_r=4.5` and `td_distance_r=1`
- **AND** its stored spec explicitly contains ADX 15m activation at delta 23.5 for `break_even_stop` and the corresponding initial-R trailing rule
- **WHEN** the card is rendered
- **THEN** its primary label is `SOL · 4/240 · SL 6 · TP 6 · BE по ADX 15m Δ23,5 · TD 4,5/1R`.

#### Scenario: Touch cap is included

- **GIVEN** a matched candidate's stored spec contains an inclusive episode `touch_number` upper bound of 2
- **WHEN** the summary is built
- **THEN** it ends with `касания ≤2`.

#### Scenario: Historical snapshot remains authoritative

- **GIVEN** a candidate's current row is `changed`, `missing` or has current meaning values different from its stored snapshot
- **WHEN** its Runtime card summary is built
- **THEN** the summary uses the stored coordinates and stored run-request spec that were exported, not the current row values.

#### Scenario: Unsupported component makes the specification explicit

- **GIVEN** a matched stored spec contains a `component_id` that is neither a supported summary component nor an explicitly supported non-displayed component
- **WHEN** the summary is built
- **THEN** the card's primary label is `Неизвестная спецификация`
- **AND** no partial strategy summary is shown
- **AND** no strategy rule is inferred for that component.

#### Scenario: Malformed known component makes the specification explicit

- **GIVEN** a matched stored spec names a known summary component but lacks a required stored field or has an invalid field type
- **WHEN** the summary is built
- **THEN** the card's primary label is `Неизвестная спецификация`
- **AND** the dashboard and the other cards continue rendering.

### Requirement: Strategy summary enrichment fails safely

The existing deployment file name without `.json` SHALL remain the card label when there is no matching candidate, more than one candidate matches the same file, the candidate has no stored run-request spec, or the Candidates request fails. When a candidate and stored snapshot match but that snapshot cannot be safely recognized, the card SHALL instead show `Неизвестная спецификация`; this explicit label SHALL NOT be used for absence or network failure. Neither a failed Candidates request nor an unsupported or malformed snapshot SHALL turn a successful Runtime catalog load into an error. The deployment file name SHALL remain available as the generated summary or unknown-specification label's tooltip, and existing strategy ids, metadata, accessible control names, confirmation text and mutation behavior SHALL continue to use their existing operational identity.

#### Scenario: No candidate for a manually deployed file

- **WHEN** Runtime lists `manual-eth.json` and no candidate names that catalog file
- **THEN** the card keeps the primary label `manual-eth`.

#### Scenario: Ambiguous association

- **WHEN** two candidate records identify the same Runtime file
- **THEN** neither is selected and the card keeps its file-name label.

#### Scenario: Candidates is unavailable

- **GIVEN** the Runtime catalog request succeeds
- **WHEN** the Candidates request fails
- **THEN** all Runtime cards render with their existing file-name labels
- **AND** the dashboard does not show a Runtime loading or error state because of that failure.

#### Scenario: One unsupported snapshot is isolated

- **GIVEN** Runtime lists several strategies with matched candidates
- **AND** one stored snapshot is unsupported while the others are recognized
- **WHEN** the cards render
- **THEN** only that card shows `Неизвестная спецификация`
- **AND** the other cards show their generated summaries
- **AND** all cards retain their controls and actions.

#### Scenario: File identity remains available

- **WHEN** a card shows a generated strategy summary or `Неизвестная спецификация`
- **THEN** hovering its primary label exposes the deployment file name
- **AND** its switch, delete and command confirmations retain the same operational strategy identity as before this change.

### Requirement: Candidate summaries follow catalog reloads without new polling

The Candidates list SHALL be requested when the Runtime catalog is loaded on opening the tab, Refresh, Retry and the existing post-mutation reload path. The existing ten-second trade-state refresh SHALL NOT request Candidates, and this change SHALL introduce no timer or polling of its own. A late Candidates response from an obsolete dashboard load SHALL be ignored under the same generation rule as the Runtime list.

#### Scenario: Explicit refresh

- **WHEN** the user presses Refresh
- **THEN** one Runtime catalog request and one Candidates request are sent for that load.

#### Scenario: Trade-state refresh

- **WHEN** the ten-second Runtime trade-state refresh runs
- **THEN** it does not request the Candidates list.

#### Scenario: Late candidate response

- **WHEN** a newer dashboard load starts before an earlier Candidates request completes
- **THEN** the earlier response does not replace the candidate association used by the newer load.

### Requirement: Strategy summaries do not redesign Runtime cards

This change SHALL reuse the current primary-name slot and SHALL NOT add a card row, control, popup, details panel, CSS rule or layout state. It SHALL NOT change the chart, selection, Runtime state marks or action placement.

#### Scenario: Matched summary in the existing card

- **WHEN** a generated summary is displayed
- **THEN** the card has the same structural rows and controls as a fallback card
- **AND** only the text and tooltip of the existing primary-name element differ.

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

