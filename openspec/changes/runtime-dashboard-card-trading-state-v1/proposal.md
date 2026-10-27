## Why

The Runtime Dashboard cards show only ENABLED or DISABLED. The owner needs to see on each card whether the strategy is in a position now and, separately, whether it has an entry order placed and waiting to fill. The Central Journal already records what Runtime did on every bar, so the marks can be read from it without any change to Runtime, ABI or the Journal.

## What Changes

- Whenever the panel reads the strategy list (open, Refresh, Retry, after a switch or a delete), it also reads the Journal:
  - `GET /journal-api/v1/strategy-instances` for each strategy's last journaled bar (`last_bar_open_time_ms`);
  - for each strategy with such a bar, `GET /journal-api/v1/events` for that one bar.
- Marks, from the events of that last bar:
  - `IN POSITION · LONG|SHORT` when it has an `open_trade_evaluated` event (Runtime evaluates an open trade only while the strategy is in a position); the side is the event's `side`;
  - `ENTRY ORDER · LONG|SHORT` when it has an `entry_package_applied` event (ABI placed the entry order on that bar; Runtime replaces or cancels it on the next processed bar); the side is that bar's `live_entry_evaluated` `desired_entry.side`;
  - nothing extra otherwise, or when the strategy has no journaled bar.
- The header adds how many strategies are in position and how many have an entry order, and a short note that the marks are the Journal's state as of each strategy's last processed bar.
- If any of these Journal reads fails, the cards are shown as today without marks, with one line "Trade state unavailable" and a Retry that repeats only the Journal reads.

Facts behind the rules (Bybit demo, ABI correlation log, 1460 unfilled entry orders): an entry order lives one bar (median 300 s), two bars at p95 when the next bar's processing failed; in that case the strategy's last journaled bar is still the bar of the order, so the mark stays correct. Lag is the same as Runtime's: a fill in the middle of a bar shows after the next processed bar.

## Non-goals

No change to Runtime, ABI or the Journal; no new route; no exchange data. Recovery markers of Runtime are not shown (not in the Journal).

## Capabilities

### Modified Capabilities

- `research-workbench-runtime-dashboard-v1`: in-position and entry-order marks on the cards from the Journal, counts in the header.

## Impact

`src/api/journal.ts` (reuse), a small trade-state module and `RuntimeDashboard.tsx` with its CSS, tests. Frontend deploy only.
