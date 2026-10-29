## Why

The owner wants two buttons on the Runtime Dashboard cards: leave the position (all related orders cancelled and confirmed) and take off the resting entry order. Runtime gets the two commands in `runtime-operator-close-and-cancel-v1`; this change is their buttons. It builds on the trade-state marks (`runtime-dashboard-card-trading-state-v1`) which tell which button a card shows.

## What Changes

- A card whose trade state is `in_position` shows a `Close position` button; a card whose state is `entry_pending` shows a `Cancel entry order` button; other cards show neither.
- A click opens a confirmation dialog in the page (not a browser dialog) that names the strategy and says in plain words what will happen, including that the strategy will be disabled:
  - close: the position is closed at market, stop and take are cancelled, the strategy is disabled;
  - cancel: the resting entry order is cancelled, the strategy is disabled.
- Confirming sends `POST /runtime-api/v1/strategy-instances/{id}/close-position` or `.../cancel-entry-orders`. While it runs the buttons of that card are disabled; there is no automatic retry.
- On `200` the list and the trade state are re-read. On a refusal or failure the dialog shows Runtime's reason in plain text (no position, recovery in progress, trade cycle just ended, busy, exchange did not answer, not confirmed) and says whether anything was changed; a `502` on close says that the close is still being completed by Runtime and the strategy is already disabled.
- The buttons are never sent on a timer and never from the 10-second refresh.

## Non-goals

No change to Runtime beyond its own change, no partial close, no re-enable button, no bulk action.

## Capabilities

### Modified Capabilities

- `research-workbench-runtime-dashboard-v1`: Close position and Cancel entry order on the cards.

## Impact

`src/api/runtime.ts` (two POSTs and a typed refusal), `RuntimeDashboard.tsx` with its CSS, tests, the static guard (allows exactly these two POSTs). Frontend deploy after Runtime with the commands.
