## Context

V1 chart (`research-workbench-runtime-dashboard-chart-v1`): one candlestick series, window =
last 30 days ending at the latest committed bar (`runtimeMarket.ts`), no viewport calls. Journal
event shape (`journal-read-api-v1`): `GET /v1/events?strategy_instance_id=&event_type=live_entry_evaluated&from_bar_ms=&to_bar_ms=`
returns `{events:[{event_id, occurred_at, bar_open_time_ms, body}], truncated}` (without `limit` it returns every event of the range; `truncated` is true only if a `limit` was passed) where
`body.payload.desired_entry` is `null` or `{side, source_plan_bar_open_time_ms,
planned_entry_price, initial_stop_price, initial_take_price, locked_exit_profile}` with prices as
decimal text. `GET /v1/strategy-instances` returns per instance `first_bar_open_time_ms`,
`last_bar_open_time_ms`, `event_count`, `last_occurred_at`.

## Decisions

1. **Projection depends on the strategy, candles on the market.** Selecting another strategy of
   the same market keeps the candles (no candle request) and loads that strategy's events (one
   journal request chain). Events are not stored in `marketResourceCache`; they live in the panel
   with an `AbortController` and a generation guard keyed by `strategy_instance_id` and market.
2. **Event window.** One request for the same bars as the candle window (`from_bar_ms` = window
   start, `to_bar_ms` = latest committed bar), with `event_type=live_entry_evaluated` and no `limit`;
   the Journal returns every event of the range in one answer. No pagination. `truncated: true` is
   unexpected (no limit was passed): it is treated as a failure ("Projection unavailable"), never
   drawn as a complete history. Refresh repeats the request for the whole window (no incremental
   logic) and re-reads `first_bar_open_time_ms`.
3. **Bar states** (pure function `buildProjection(candles, events, firstKnownBarMs)`), where
   `firstKnownBarMs` is the strategy's `first_bar_open_time_ms` from `GET /v1/strategy-instances`
   (the start of its known history in the Journal, not the first event inside the window):
   - *signal*: the bar has an event whose `desired_entry` has the three prices as decimal text.
   - *no signal*: the bar has an event with `desired_entry = null` (evaluated, no signal).
   - *no evaluation recorded*: the bar is at or after `firstKnownBarMs` and has no event. The Journal
     only proves there is no record; the cause (not evaluated, not delivered yet, delivery fault)
     is unknown and the UI does not claim one.
   - *before known history*: the bar is before `firstKnownBarMs`: empty, no line, no marker. If the
     strategy has no entry in the instances list, every bar is empty.
   When a bar has several events the one with the latest `occurred_at` is used; equal `occurred_at`
   is broken by the greater `event_id`, the same order as the Journal. An event whose
   `desired_entry` is neither `null` nor a valid three-price object is *unreadable*: it breaks the
   lines like *no evaluation recorded* and is counted separately.
4. **Rendering.** Three `LineSeries` (`LineType.WithSteps`, `pointMarkersVisible: true` so a
   one-bar signal is visible) fed with one datum per candle bar: `{time, value}` for *signal*, a
   whitespace datum `{time}` for every other state, which makes the library break the line. Colours
   from Surface tokens: entry `--ink-2`, stop `--neg-500`, take `--pos-500`, theme-aware like the
   candles. *No evaluation recorded* bars get a small grey marker under the bar on the candle series
   (`createSeriesMarkers`). Nothing calls a viewport method.
5. **Library behaviour is verified, not assumed.** A real-browser check (Chromium via Playwright,
   run on demand, not in CI) draws a fixture with signal, no-signal and missing bars and the
   screenshot is reviewed; unit tests assert the whitespace data produced by `buildProjection`.
6. **Journal failure is its own state.** If the Journal request fails or answers `truncated: true`, the candles stay and the
   panel shows "Projection unavailable" with Retry; no lines and no markers are drawn, so absence of
   lines is never read as absence of signals.
7. **Cards.** One `GET /v1/strategy-instances` per list load (and list Refresh); each card shows
   "Last evaluated" in UTC from `last_bar_open_time_ms`, or "No evaluations yet". A failure leaves the
   cards as in V1 without that line.
8. **Legend.** Three small labelled swatches (Entry, Stop, Take) and, when present, "N bars
   without a recorded evaluation". No tooltips, no table.
9. **Proxy.** `/journal-api` → `VITE_JOURNAL_PROXY_TARGET` or `http://127.0.0.1:8097`, prefix stripped.

## Risks

- A single isolated point is the weakest case for line series; `pointMarkersVisible` and the
  browser check cover it.
- Many missed bars produce many markers; the chart window is at most 8640 bars, which the library
  handles.
