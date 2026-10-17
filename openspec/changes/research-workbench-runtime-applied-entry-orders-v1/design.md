## Context

Facts on `main` (7c694a2):

- `fetchJournalEvents` requests `GET /v1/events` with `event_type=live_entry_evaluated` and no
  `limit` for the bars of the candle window; a truncated answer makes the projection unavailable.
- `buildProjection` keeps one event per bar (latest `occurred_at`, then greater `event_id`) and
  turns signal bars into points; `ProjectionSeriesView` draws them as three lines with dots.
- The Journal filters by one `event_type`, and its `first_bar_open_time_ms` per strategy is the
  minimum over all stored events. Applied records carry the evaluation bar, so that minimum does not move.

The applied line (Runtime e750e5f) is `payload: {trade_cycle_id, bar_open_time_ms, trigger_price,
stop_loss, take_profit, quantity, order_link_id, order_id}`; the four values are decimal strings or
null. It means ABI confirmed the entry order and Runtime recorded that confirmation; it is not proof
that the Runtime state transition completed.

## Decisions

### D1. Second request, same window

The panel requests `event_type=entry_package_applied` for the same bar range in parallel with the
evaluations. A failed or truncated applied answer hides only the rings and shows "Applied orders
unavailable"; the projection stays. The evaluation request is unchanged.

### D2. One applied record per bar

Per bar the record with the latest `occurred_at` (then greater `event_id`) counts, the same rule as
for evaluations. Bars outside the candle window are not drawn.

### D3. Reading the values

Only `trigger_price`, `stop_loss` and `take_profit` are read, with the same decimal-string rule as
the projection. A null value draws no ring for that price. A record with no readable price, or with
a value that is neither null nor a decimal string, is counted as unreadable and draws nothing.

### D4. Drawing

A separate custom series draws hollow rings (radius larger than the projection dot, same colours:
Entry, Stop, Take) at the bar's open time. It has no lines, no last-value label and no price line,
and it does not change how the projection is drawn.

### D5. Legend

The legend adds a ring swatch "Applied" and the counter "N applied orders" when N > 0, and
"N unreadable applied" when there are any.

## Risks / Trade-offs

- A repeat apply of the same cycle on a later bar draws another set of rings; that is what Runtime
  recorded. Two applies on the same bar show only the latest.
- Until the three backend PRs are deployed the applied answer is empty and nothing changes on screen.
