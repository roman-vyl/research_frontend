## Context

The card already has a switch (`role="switch"`) with busy handling, a refusal dialog with a fixed text per reason, and a refetch that keeps the cards on screen (`load(true)`). Runtime answers a delete refusal with `{"status":"delete_refused","reason":...}`.

## Decisions

- **D1 One trash button per card.** A real `button` with an icon and `aria-label` "Delete: <strategy name>", placed in the card footer beside the switch, outside the select button. It is `disabled` while the card's `enabled` is true, with the title "Disable it first." (Runtime would refuse with `still_enabled` anyway).
- **D2 Confirmation before the request.** Clicking the trash button only opens a confirmation dialog (`role="alertdialog"`): "Delete <name>?" and "The file moves to the trash folder on the server and the strategy leaves the list. Its history in Journal stays." Buttons Cancel (initial focus) and Delete. Esc and Cancel close it without a request and return focus to the trash button. Only Delete sends the `DELETE`.
- **D3 Busy per card, shared.** While a switch or a delete request of a card is in flight, both its switch and its trash button are disabled; other cards stay usable.
- **D4 On 200, refetch in place.** The list is read again with the cards kept on screen (the same quiet refresh as after a switch). The deleted card is no longer listed; the existing "selection survives only while listed" rule clears the selection.
- **D5 Refusals.** Any answer but `200` leaves the list unchanged and does not refetch; a dialog with one OK button shows the text. A body is read as a reason only when `status` is `delete_refused`. Texts by reason: `still_enabled` "This strategy is enabled. Disable it first."; `position_open` "This strategy has an open position and cannot be deleted."; `recovery_pending` "This strategy is recovering an order or position and cannot be deleted yet."; `cycle_not_settled` "This strategy's trade cycle has just ended. Try again after the next bar."; `cancel_not_confirmed` "The entry order could not be confirmed cancelled on the exchange. The strategy was not deleted."; `abi_unavailable` "The exchange gateway did not answer. The strategy was not deleted."; `instance_busy` "The strategy is processing a bar. Try again in a moment."; `file_changed` "The strategy file was changed while deleting. Nothing was changed. Try again."; `trash_name_taken` and `move_failed` "Runtime could not move the strategy file to the trash. Nothing was changed. Try again."; `strategy_instance_not_found` "Runtime no longer has this strategy. Refresh the list."; `catalog_unavailable` "Runtime cannot read the strategy files. Nothing was changed."; anything else or a network failure "Runtime did not answer correctly. Nothing was changed."
- **D6 The 200 body is checked.** A `200` counts as a delete only when its body has the requested `strategy_instance_id`, `deleted: true` and a boolean `cancelled_entry_order`; otherwise it is the generic failure.
- **D7 Mutation guard widened.** The static guard allows `GET`, one `PUT` to `/enabled` and one `DELETE` to `/strategy-instances/{id}`, and still forbids polling and other methods.

## Risks

- A mis-click on Delete: mitigated by the confirmation, by the button being usable only for a disabled card, and by the trash (nothing is erased).
