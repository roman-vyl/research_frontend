## Why

The Runtime chart draws only the Engine projection (`live_entry_evaluated.desired_entry`). Runtime
now also journals `entry_package_applied` within the same Runtime→ABI request/response: the entry
order ABI actually placed on Bybit, read back from the exchange (trigger price, stop loss, take
profit, quantity, `order_link_id`, `order_id`), with the `bar_open_time_ms` of the evaluation that
produced it (strategy_runtime #23, abi_executor_bot #21). The Central Journal stores it in `events`
(journal_service #6). The chart should show what was placed next to what was wanted.

## What Changes

- The panel also reads the selected strategy's `entry_package_applied` events for the candle window.
- On the bar of each applied record the chart draws up to three rings: applied trigger price, stop
  loss and take profit, in the colours of the projection lines. Where the order matches the
  projection, the projection point sits inside its ring; a difference is visible as an offset.
- The legend counts applied orders and unreadable applied records.

## Out of Scope

Quantity, `order_link_id`, `order_id` and `trade_cycle_id` on the chart; order lifetime after the
apply (cancel, fill, position, protection); a tooltip or table; any change to Runtime, ABI, the
Journal or the projection lines; polling.

## Capabilities

### New Capabilities

- `research-workbench-runtime-applied-entry-orders-v1`: applied entry orders from the Central
  Journal on the Runtime Dashboard chart.

## Impact

- `research_frontend`: `src/api/journal.ts`, `src/features/runtime/*`.
- Depends on journal_service #6 and strategy_runtime #23 being merged and deployed; until then the
  chart shows no rings and the projection works as today.
