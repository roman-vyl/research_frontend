## Why

The Runtime chart shows what happens before entry: Engine's projection (`live_entry_evaluated`) as
lines and the entry orders ABI placed (`entry_package_applied`) as rings. After entry it shows
nothing per bar. Runtime now journals the open-position counterparts (strategy_runtime #27,
abi_executor_bot #25), and the Central Journal stores them (journal_service #10):

- `open_trade_evaluated`: Engine's answer on every bar of an open position: desired stop and take
  (Engine's own text), close signal, side, `trade_cycle_id`;
- `protection_applied`: every protection change ABI confirmed: requested and confirmed levels, the
  trade quantity, and the stop and take orders on the exchange (`order_id`, `trigger_price`).

The chart should show, by full analogy with the pre-entry side, what Engine wanted while the
position was open and what was actually set on the exchange.

## What Changes

- The existing single events request (no `event_type`) already returns both new types; the panel
  splits them out next to `live_entry_evaluated` and `entry_package_applied`.
- `open_trade_evaluated` → open-position projection: two lines, desired Stop and desired Take, one
  point per bar, in the Stop and Take colours, drawn like the entry projection lines. Lines break
  between bars without events and when `trade_cycle_id` changes (read only for this split). A bar
  with an active close signal gets a small "close" marker bound to the candle, shown even without
  readable protection levels.
- `protection_applied` → rings on the bar of the record at the trigger prices of the real stop and
  take orders, like the applied entry rings.
- A take that Engine disabled (`requested_protection.take_price: null`) whose real order ABI keeps
  far away is not drawn (it would squash the price scale); the legend counts it as a technical take.
- Legend counters for both types and their unreadable records.

## Out of Scope

Quantity, order ids and `trade_cycle_id` on the chart (as for applied entry orders); a tooltip or
table; exit price; any change to Runtime, ABI or the Journal; polling.

## Capabilities

### New Capabilities

- `research-workbench-runtime-open-trade-management-v1`: Engine's open-position projection and
  ABI-confirmed protection from the Central Journal on the Runtime Dashboard chart.

## Impact

- `research_frontend`: `src/api/journal.ts`, `src/features/runtime/*`.
- Builds on the trade-cycle markers change (#27, not merged yet); apply starts after #27 is merged,
  from fresh `main`.
- Shows something only after strategy_runtime #27, abi_executor_bot #25 and journal_service #10 are
  merged and deployed; until then the chart is unchanged.
