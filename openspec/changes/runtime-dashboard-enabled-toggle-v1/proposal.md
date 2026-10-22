## Why

The Runtime Dashboard shows ENABLED or DISABLED per strategy but cannot change it; the owner edits spec files on the Mac. Runtime is gaining `PUT /v1/strategy-instances/{id}/enabled` (`strategy_runtime` change `runtime-strategy-enabled-control-v1`, PR #30): it cancels an entry order or refuses when a position is open, and then changes `enabled` in the strategy's deployment file, which stays the only source of that value. The dashboard needs the switch and a clear message when Runtime refuses.

## What Changes

- A switch per strategy card that calls the new Runtime route through the `/runtime-api` dev proxy.
- While the request runs the switch is busy; on `200` the list is requested again; on a refusal or failure the switch returns to its previous state and a dialog states the reason in plain words (open position, recovery pending, cycle not settled, cancel not confirmed, gateway unavailable, strategy busy, file changed, file not writable, strategy gone, files unreadable, Runtime unreachable).
- **BREAKING (rule):** "The tab is read-only" is removed; the only mutating request the tab may send is the enabled switch.
- No polling, no optimistic state, no confirmation before disabling (Runtime cancels an open entry order itself).

## Capabilities

### Modified Capabilities

- `research-workbench-runtime-dashboard-v1`: the switch, its dialog, the narrowed no-mutation rule.

## Impact

`src/api/runtime.ts`, `src/features/runtime/RuntimeDashboard.tsx` and its CSS and tests. Needs the Runtime route and the writable specs mount (bbb_stack PR #60) deployed first; without it the switch answers with the "Runtime did not answer correctly" message and nothing changes.
