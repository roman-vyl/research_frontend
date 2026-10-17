## Context

Facts on `main` (7c694a2):

- `fetchJournalEvents` requests `GET /v1/events` with `event_type=live_entry_evaluated` and no
  `limit` for the bars of the candle window; a failed or truncated answer makes the projection unavailable.
- Without `event_type` the Journal returns every stored type for the range, each event with its
  `event_type`.
- `buildProjection` keeps one event per bar (latest `occurred_at`, then greater `event_id`) and
  turns signal bars into points; `ProjectionSeriesView` draws them as three lines with dots.
- The Journal's `first_bar_open_time_ms` per strategy is the
  minimum over all stored events. Applied records carry the evaluation bar, so that minimum does not move.

The applied line (Runtime e750e5f) is `payload: {trade_cycle_id, bar_open_time_ms, trigger_price,
stop_loss, take_profit, quantity, order_link_id, order_id}`; the four values are decimal strings or
null. It means ABI confirmed the entry order and Runtime recorded that confirmation; it is not proof
that the Runtime state transition completed.

## Decisions

### D1. One request, split by type

The panel makes one `GET /v1/events` request for the bar range of the candle window, without
`event_type` and without `limit`; the Journal then returns both types. The answer is split by
`event_type`: `live_entry_evaluated` goes to the existing `buildProjection`, `entry_package_applied`
to the ring builder, any other type is ignored. Error handling stays as today: a failed or truncated
answer shows "Projection unavailable" and draws neither lines nor rings. A successful answer with
no applied events is not an error: it draws no rings.

### D2. Every applied record counts

There is no per-bar selection: each `entry_package_applied` event of the window is its own applied
order, and draws its own rings. Rings of several records on one bar may coincide visually, but the
counter counts every record. Records on bars outside the candle window are not drawn.

### D3. Reading the values

Only `trigger_price`, `stop_loss` and `take_profit` are read, with the same decimal-string rule as
the projection. A null value draws no ring for that price. A record with no readable price, or with
a value that is neither null nor a decimal string, is counted as unreadable and draws nothing.

### D4. Drawing

A separate custom series draws hollow rings (radius larger than the projection dot, same colours:
Entry, Stop, Take) at the bar's open time. It has no lines, no last-value label and no price line,
and it does not change how the projection is drawn.

### D5. Legend

The legend adds a ring swatch "Applied" and the counter "N applied orders" (every applied record of
the window) when N > 0, and "N unreadable applied" when there are any.

## Risks / Trade-offs

- A repeat apply of the same cycle draws another set of rings, on the same bar or a later one; that
  is what Runtime recorded.
- Until the three backend PRs are deployed the answer has no applied events and nothing changes on screen.
- An answer without `event_type` will also carry any event type the Journal ingests later; the
  frontend ignores types it does not know.
