## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: The tab changes Runtime only through the enable switch
The Runtime Dashboard SHALL send `GET` requests, the enable switch's `PUT` and the trash button's `DELETE`, and nothing else, and SHALL NOT poll.

#### Scenario: Only the allowed mutation
- **WHEN** the tab is used (open, refresh, retry, switch, delete)
- **THEN** every request has method `GET`, except the switch's `PUT` to `/runtime-api/v1/strategy-instances/{id}/enabled` and the confirmed `DELETE` to `/runtime-api/v1/strategy-instances/{id}`
