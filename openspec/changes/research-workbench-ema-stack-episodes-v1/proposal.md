## Why

Strategy Engine computes the EMA stack episode of a market (`ema-stack-episode-v1`) and serves its whole
history without a strategy (`ema-stack-episode-query-v1`, `POST /v1/ema-stack-episodes/history`).
Research Service passes that route through unchanged as `POST /api/market/ema-stack-episodes/history`
(`research-market-ema-stack-episodes-v1`). The Workbench chart does not show episodes yet, so a run's
trades cannot be read against the episode they were taken in (touch number, false breaks, waves).

The chart layout was agreed on the mock-up "Эпизод на графике: макет" (2026-10-08): the episode is a
market layer drawn the same way for any strategy, under the strategy's trades.

## What Changes

- The Chart tab loads the episode history of the run's market for both sides: all pages newest first,
  every page pinned to the `market_data_hash` of the first page; a 409 `market_data_version_changed`
  restarts from the first page. Loaded episodes are kept per `(ticker, timeframe, episode parameters,
  side)` for the session; finished episodes are kept by their start.
- After each new candle of the chart timeframe the first page is requested again in the background: the
  current episode is replaced and new finished episodes are added by start.
- Episode parameters: the strategy's `ema_stack_episode` section when present, otherwise the run's
  `anchor_stack` periods with Engine's defaults for the window.
- Chart layers, each with its own toggle, under the candles and trades:
  episode band from S0 to the stack break with a header; touch zones with their number;
  false breaks with zone low and break low, depth and outcome; waves S* → P (solid) and P → touch
  (dashed) with labels; the forming wave (dotted).
- Episode lanes LONG and SHORT at the bottom of the chart: phase per bar (away, in zone, false break)
  from Engine's zone and false-break intervals, touch numbers above.
- Bar Inspector: "Episode on this bar" for each side: episode start and break, the zone, false break and
  wave that contain the bar, and the current episode's touch number and phase.
- Touches table of the episode under the selected bar (or the current one): zone, S* → P, prices of
  origin, peak and touch, up and down leg high/low, false break, depth and outcome. A row click
  highlights its zone, false break and wave on the chart.
- Toggles: band, zones, false breaks, waves, forming wave; side LONG / SHORT / both (buttons).

## Capabilities

### New Capabilities

- `research-workbench-ema-stack-episodes-v1`: loading, refresh, chart layers, lanes, inspector, table.

## Non-Goals

- Computing or reshaping any episode object in the frontend; every value shown is a field of Engine's
  response (times are only converted from ms to the chart's seconds for placement).
- Reading the episode from run diagnostics or the signal trace.
- Episode parameters editable in the UI.
- Changes to strategy layers, markers or the signal timeline.

## Impact

- research_frontend: API client and types, an episode history loader with session cache, a chart
  primitive for the layers and lanes, the Bar Inspector, a touches table, toggles, tests.
- Requires Research Service with `research-market-ema-stack-episodes-v1` and Strategy Engine with
  `ema-stack-episode-query-v1` (4f4f80c or later).
