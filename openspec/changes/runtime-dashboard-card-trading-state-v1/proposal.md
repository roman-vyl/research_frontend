## Why

The Runtime Dashboard cards show only ENABLED or DISABLED. The owner needs to see on each card whether the strategy is in a position now and, separately, whether it has an entry order placed and waiting to fill.

## What Changes

- The panel also reads Runtime's `GET /runtime-api/v1/strategy-instance-states` (`strategy_runtime`, `runtime-strategy-trading-state-v1`) whenever it reads the strategy list: on open, Refresh, Retry, and after a switch or a delete.
- Each card shows, next to ENABLED / DISABLED:
  - `IN POSITION · LONG` or `IN POSITION · SHORT` when the strategy's `trade_state` is `in_position`;
  - `ENTRY ORDER · LONG` or `ENTRY ORDER · SHORT` when it is `entry_pending`;
  - `RECOVERY` when `recovery_pending` is set, in addition to either of the above;
  - nothing extra when `flat`.
- The header adds the counts: how many strategies are in position and how many have an entry order.
- If the states request fails, the cards are shown as today, without these marks, and one line says "Trade state unavailable" with a Retry that repeats only that request.
- The marks state Runtime's view as of its last processed bar; a short note under the header says so. Nothing is polled.

## Non-goals

No change to the strategy list request, the enable switch, the delete button, the chart panel, or any Runtime, ABI or Journal behavior. No exchange data on the cards.

## Capabilities

### Modified Capabilities

- `research-workbench-runtime-dashboard-v1`: trade-state marks on the cards and counts in the header.

## Impact

`src/api/runtime.ts` (states read and decoder), `RuntimeDashboard.tsx` and its CSS, tests. Deploy after Runtime serves the route.
