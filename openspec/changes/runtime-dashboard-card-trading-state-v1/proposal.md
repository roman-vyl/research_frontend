## Why

The Runtime Dashboard cards show only ENABLED or DISABLED. The owner needs to see on each card whether the strategy is in a position now and, separately, whether it has an entry order placed and waiting to fill. Runtime now publishes exactly this itself (`GET /v1/strategy-instance-states`, strategy_runtime #41), read from its own durable state. The earlier draft of this change read the Central Journal; it is replaced by this route.

## What Changes

- The panel reads `GET /runtime-api/v1/strategy-instance-states` together with the strategy list (open, Refresh, Retry, after a switch or a delete) and then every 10 seconds while the Runtime Dashboard tab is visible. The route only reads Runtime's stored state: no exchange, ABI or Engine call.
- Marks on a card, from its item (matched by `strategy_instance_id`):
  - `IN POSITION · LONG|SHORT` when `trade_state` is `in_position`;
  - `ENTRY ORDER · LONG|SHORT` when `trade_state` is `entry_pending`;
  - `RECOVERY · ENTRY|CLOSE` when `recovery_pending` is set (shown next to the state mark);
  - nothing extra when `flat`, or when the strategy has no item.
- The header shows how many strategies are in position and how many have an entry order, and a note that the marks are Runtime's state as of each strategy's last processed bar (up to one bar behind).
- If the state read fails, the cards are shown as today without marks, with one line "Trade state unavailable"; the next 10-second read or Retry repeats only the state read.

## Non-goals

No change to Runtime, ABI or the Journal; no exchange data; no Close button (separate change). Lamps need Runtime with the route deployed.

## Capabilities

### Modified Capabilities

- `research-workbench-runtime-dashboard-v1`: in-position, entry-order and recovery marks on the cards from Runtime's state route, counts in the header, 10 s refresh.

## Impact

`src/api/runtime.ts` (new read), `RuntimeDashboard.tsx` with its CSS, tests. Frontend deploy, after Runtime with the route is deployed.
