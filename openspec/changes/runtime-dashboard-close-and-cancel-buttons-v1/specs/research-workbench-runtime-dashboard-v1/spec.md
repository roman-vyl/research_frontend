## ADDED Requirements

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
