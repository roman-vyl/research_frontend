## ADDED Requirements

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
When Runtime answers a switch request with anything but `200`, the card SHALL keep its previous state and a dialog SHALL state the reason. Exact texts by reason: `position_open` "This strategy has an open position and cannot be disabled."; `recovery_pending` "This strategy is recovering an order or position and cannot be disabled yet."; `cycle_not_settled` "This strategy's trade cycle has just ended. Try again after the next bar."; `cancel_not_confirmed` "The entry order could not be confirmed cancelled on the exchange. The strategy stays enabled."; `abi_unavailable` "The exchange gateway did not answer. The strategy stays enabled."; `instance_busy` "The strategy is processing a bar. Try again in a moment."; any other answer or a network failure "Runtime did not answer correctly. Nothing was changed."

#### Scenario: Open position
- **WHEN** Runtime answers `409` with reason `position_open` to a disable request
- **THEN** a dialog shows the `position_open` text
- **AND** the card still shows ENABLED
- **AND** the list is not requested again

#### Scenario: Dialog behaviour
- **WHEN** the dialog is shown
- **THEN** it has `role="alertdialog"` and one OK button, closes on OK or Esc, and returns focus to that card's switch

#### Scenario: Unknown reason
- **WHEN** Runtime answers with a status or reason not in the list, or the request fails at the network
- **THEN** the dialog shows the generic text and the card keeps its state

### Requirement: The tab changes Runtime only through the enable switch
The Runtime Dashboard SHALL send `GET` requests and the enable switch's `PUT`, and nothing else, and SHALL NOT poll.

#### Scenario: Only the allowed mutation
- **WHEN** the tab is used (open, refresh, retry, switch)
- **THEN** every request has method `GET`, except the switch's `PUT` to `/runtime-api/v1/strategy-instances/{id}/enabled`

## REMOVED Requirements

### Requirement: The tab is read-only
**Reason**: The dashboard gains the enable switch; the rule is replaced by "The tab changes Runtime only through the enable switch".
**Migration**: None; the narrowed rule keeps the no-polling and GET-only behaviour for everything except the switch.
