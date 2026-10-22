## Why

The Runtime Dashboard can switch a strategy off but cannot remove it from Runtime. Runtime gets a safe delete (`strategy_runtime`, `runtime-strategy-delete-v1`: `DELETE /v1/strategy-instances/{id}`, moves the file to the trash, only for a disabled strategy). The dashboard needs a trash button that uses it and explains every refusal.

## What Changes

- Each card gets a trash button, outside the card's select button, next to the enable switch. It is usable only when the card is disabled; for an enabled card it is disabled and says "Disable it first."
- Activating it opens a confirmation dialog; only the dialog's Delete button sends exactly one `DELETE /runtime-api/v1/strategy-instances/{id}`.
- On `200` the list is read again in place (cards stay on screen); a deleted card disappears and, if it was selected, the selection clears.
- On any other answer the card stays and a dialog states the reason from Runtime's `delete_refused` body; texts are fixed per reason.
- The tab's mutation guard now allows `GET`, the switch's `PUT` and this `DELETE`, and still forbids polling.
- Busy is per card and covers both the switch and the trash button.

## Capabilities

### Modified Capabilities

- `research-workbench-runtime-dashboard-v1`: new requirements for the trash button, the confirmation and the delete refusals; the mutation guard requirement is widened.

## Impact

`src/api/runtime.ts`, `RuntimeDashboard.tsx`, `runtime.css`, tests. Depends on the Runtime route and on a Runtime image that contains it; the frontend change is deployed after Runtime.
