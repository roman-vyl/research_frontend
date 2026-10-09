## Context

Engine response (one side, one page): `history_id`, `market {ticker, base_timeframe, earliest_ms,
as_of_ms}`, `episode` (effective parameters), `params_hash`, `market_data_hash`, `side`, `current`,
`episodes` (finished, newest first), `next_before_start_ms`. An episode: `start_ms`, `stack_break_ms`,
`censored`, `touches`, `false_breaks_count`, `zones[]` (`number`, `start`, `end`, `high`, `low`,
`has_false_break`, `final`, `known_at`), `false_breaks[]` (`number`, `start`, `end`, `high`, `low`,
`depth`, `outcome` comeback | stack_break | null, `final`, `known_at`), `waves[]` (`number`, `origin`,
`origin_price`, `peak`, `peak_price`, `touch`, `touch_price`, `up_leg {high, low}`, `down_leg {high,
low}`, `final`, `known_at`, and `stack_break` on the forming wave). `current` adds `touch_number` and
`phase` (away | in_zone | in_false_break). All times are ms.

## Decisions

### Loader

`loadEpisodeHistory(key)` requests page 1 with `limit` 500 and no pin, then follows
`next_before_start_ms` with `expected_market_data_hash` from page 1 until it is null. On 409
`market_data_version_changed` it starts again from page 1 (at most three times, then the error is
shown). Result per side: finished episodes keyed by `start_ms`, `current`, `market_data_hash`,
`as_of_ms`. A module-level cache keyed by `ticker|timeframe|fast|anchor|slow|window|break|side` keeps
it for the session; a second chart open of the same run or another run with the same market and
parameters uses it without a request. Concurrent loads of one key share one promise.

### Refresh after a candle

A timer fires at every candle boundary of the chart timeframe plus 5 s. It requests page 1 without a
pin; finished episodes of that page are added by start (existing ones are kept), `current`,
`market_data_hash` and `as_of_ms` are replaced. No full reload, no comparison logic.

### Parameters

For a strategy with `ema_stack_episode` the Workbench never resolves the section itself: it posts
`{strategy_id, raw_spec}` to `POST /api/research/strategies/{strategy_id}/feature-plan` (Engine's feature
plan, passed through) and takes `episode_params_by_ref`, the effective parameters after defaults. The
history request gets `fast_period`, `anchor_period`, `slow_period`, `window_bars`, `break_bars` of the
chosen ref; `history_bars` is not sent (the history route covers the whole history and rejects it).
One ref is used as is; with several refs nothing is loaded until the user picks one in the toolbar.
The plan is kept per `(strategy_id, raw_spec)` for the session.

Without the section: the `anchor_stack` periods and no window keys (Engine default 24, break = window).

### Drawing

One lightweight-charts series primitive on the candle series draws all layers in the pane: band, zones
and false breaks as background, waves and labels on top of candles, lanes in a strip at the bottom of
the pane (the candle price scale gets a bottom margin while lanes are on). Times map to x through the
render window's candle times (binary search, then `logicalToCoordinate`), so an entity partly outside
the window is clipped, not dropped. Only entities intersecting the visible logical range are drawn.

Colors follow the mock: band long green / short red at low alpha, zones blue, false breaks red, up leg
green solid, down leg pink dashed, forming wave grey dotted, lanes away (thin, faint), in zone (blue),
false break (red).

### Inspector and table

Both are lookups over the loaded entities by time (`start <= t <= end`); no derived values. The
inspector shows only what is known at the selected bar's close: a zone's number from its start, its end
and prices from its `known_at`; a false break as in progress until its `known_at`, then outcome and
depth; a wave as forming until its touch (`known_at`), then S*, P and touch prices; the stack break only
on its own bar. The current episode's `touch_number` and phase are labelled as of the last closed
candle. The table shows the episode's final structure and is not a per-bar view. The table
shows the episode containing the selected bar on the shown side (long when both), else the current
one.

## Risks

- Full BTC 5m history is about 210 episodes per side; a few hundred KB of JSON per side, one to two
  pages at `limit` 500. Cold Engine compute is about 10 to 15 s; the layers appear when it is done.
