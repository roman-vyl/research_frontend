## Context

V1 renders `GET /v1/strategy-instances` as cards. Each item has `strategy_instance_id`,
`instrument` (for example `ETHUSDT.P`) and `base_timeframe` (for example `5m`), which are the
same symbol and timeframe strings the Research Service market endpoints take. The Workbench
already has `fetchCandlesWindow({symbol, timeframe, fromMs, toOpenTimeMs})` returning
`{candles, coverage}`, and `lightweight-charts` v5 in `package.json`. The Chart tab draws with
a large, outdated runtime that is deliberately left alone.

## Decisions

1. **Selection.** Component state `selectedId` (the `strategy_instance_id`) in
   `RuntimeDashboard`. Nothing is selected on open; the chart area shows "Select a strategy".
   Cards become buttons (`aria-pressed`), selected card gets an outline from the Surface
   tokens. Disabled strategies are selectable too: the chart is market data and does not depend
   on `enabled`. A Refresh of the list keeps the selection if the id is still present, otherwise
   clears it.
2. **Candle window.** `toOpenTimeMs` = open time of the current bar = `floor(now / tfMs) *
   tfMs` using the existing timeframe-to-ms helper; `fromMs` = `toOpenTimeMs - 499 * tfMs`
   (500 bars). The server may return fewer bars (data gaps, end of stored history); the chart
   draws what came back. An unknown timeframe string is an error state, not a guess.
3. **Stale data.** The panel shows "Last bar: <UTC time>" taken from the last returned candle.
   If that bar is older than two bars before `now`, the label gets the warning style and the
   text "no newer candles in the market data". The stack's market data may lag; the chart must
   not look live when it is not.
4. **Chart component.** `RuntimeCandleChart` creates one `lightweight-charts` chart with a
   candlestick series, UTC time axis, no volume, no overlays, no markers. Up/down colors come
   from the existing positive/negative Surface tokens, grid and text from the neutral tokens;
   colors are read from CSS variables on mount and when the color scheme changes. The chart
   fits content on each new data set and resizes with its container (`ResizeObserver`); it is
   removed on unmount.
5. **Loading.** One request per selection or Refresh, aborted when another selection is made
   or the panel unmounts (`AbortSignal`); a late response of an older request is ignored.
   Errors map to a fixed message with Retry: market data unavailable (network / 5xx), bad
   request (4xx), unsupported timeframe.
6. **Layout.** Two columns from 1000px width: list left (V1 cards, one column), chart panel
   right and sticky; one column below that, chart panel under the list. Same `.sx` tokens and
   panel classes as V1.
7. **Boundaries.** No change to `fetchCandlesWindow`, the Vite proxy, or any other tab. The
   candles pass through unchanged; no resampling or indicator calculation in the browser.

## Risks

- Market data in the local stack may end before "now" (decision 3 makes that visible).
- `lightweight-charts` needs real layout size; unit tests mock the chart library, the drawing
  itself is checked by screenshots.
