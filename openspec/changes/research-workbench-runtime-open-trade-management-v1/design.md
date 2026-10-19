## Context

Facts on `main` (7c81d1d) and the trade-cycle markers branch (#27):

- `RuntimeChartPanel` makes one `GET /v1/events` request for the bars of the candle window, without
  `event_type` and without `limit`, and splits the answer by `event_type`: `live_entry_evaluated` →
  `buildProjection` (one event per bar: latest `occurred_at`, then greater `event_id`; three lines
  with dots), `entry_package_applied` → `buildAppliedOrders` (every record; rings), and on #27
  `trade_cycle_opened` / `trade_cycle_closed` → period arrows and close labels. Unknown types are
  ignored. A failed or truncated answer shows "Projection unavailable" and draws nothing.
- Colours: Entry `#52514e`, Stop `#d75352`, Take `#2f9e44` (`projectionSeries.ts`).
- Runtime lines (strategy_runtime #27):
  - `open_trade_evaluated.payload`: `instrument`, `timeframe`, `bar_open_time_ms`, `trade_cycle_id`,
    `side`, `desired_protection {stop_price, take_price|null}` (Engine's own decimal text),
    `close_signal {active, reason, component_id, layer}`. One per bar while a position is open.
  - `protection_applied.payload`: `trade_cycle_id`, `bar_open_time_ms`, `requested_protection` and
    `confirmed_protection` (each `{stop_price, take_price|null}`), `position_quantity`,
    `stop_order {order_id, trigger_price}`, `take_order {order_id, trigger_price}`. One per
    confirmed protection change. `take_order` is always present; with `take_price: null` it is the
    take ABI keeps about ±50% away from the entry price.

## Decisions

### D1. Same request, two more types

No new request. The split adds `open_trade_evaluated` → `buildOpenTradeProjection` and
`protection_applied` → `buildAppliedProtection`. Error handling stays as today: a failed or
truncated answer draws none of the layers. An answer without the new types is not an error.

### D2. Open-position projection: same rule as the entry projection

One event per bar, chosen exactly as `buildProjection` does (latest `occurred_at`, then greater
`event_id`). From it only `desired_protection.stop_price`, `desired_protection.take_price` and
`close_signal.active` are read. Stop and Take become two lines with dots, in the Stop and Take
colours, drawn by the same projection series style (no Entry line: there is no entry to project
while the position is open). A null `take_price` gives no Take point on that bar. A bar where
`close_signal.active` is `true` gets one small marker "close" at the Stop point. Lines are broken
between bars that have no event (no interpolation), so separate trades never join.

### D3. Applied protection: same rule as applied entry orders

Every `protection_applied` record of the window counts on its own and draws, at its bar's open time:

- a Stop ring at `stop_order.trigger_price`;
- a Take ring at `take_order.trigger_price`, only when `confirmed_protection.take_price` is not null.

The rings use the applied-ring series of the entry orders. Where the exchange matches Engine, the
projection dot sits inside its ring; a difference shows as an offset.

### D4. Technical take

When `confirmed_protection.take_price` is null, the take order exists on the exchange but is a
technical far take. It is not drawn (drawing it would stretch the price scale by ~50%), and the
record is counted in the legend as "N technical takes (not drawn)". The Journal keeps the real
values; the frontend only chooses not to draw them.

### D5. Reading values

Prices are read with the same decimal-string rule as the entry projection; Engine's own text such as
`"105.150"` is read by value. A record whose needed values are missing or not decimal strings (or,
for `open_trade_evaluated`, whose `close_signal.active` is not a boolean) is counted as unreadable
and draws nothing. Quantity, order ids, `side`, `trade_cycle_id`, `requested_protection` are not
read.

### D6. Legend

Swatches "Engine stop/take (open)" for the open-position lines and "Protection" for its rings;
counters "N open-position bars", "N protection changes", "N technical takes (not drawn)" and
"N unreadable open-position events", each shown only when greater than 0.

## Risks / Trade-offs

- A protection change journaled twice (Runtime repeats Apply after a failed save) draws two sets of
  rings; that is what Runtime recorded.
- The technical take is hidden on the chart by choice; it stays visible in the legend counter and in
  the Journal.
- Until the backend PRs are deployed the answer has no new events and nothing changes on screen.
