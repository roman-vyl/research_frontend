## Why

Runtime Dashboard V1 (#23) lists the strategies of the Runtime catalog. The next smallest
step of the same slice: pick one strategy and see its market as a candle chart, so the list
stops being a table of names. Only the price candles; nothing about the strategy's state yet.

## What Changes

- A strategy card in the Runtime Dashboard list becomes selectable. One strategy is selected
  at a time; the selected card is marked.
- Next to the list (below it on a narrow screen) a **CandleChart** panel shows the candles of
  the selected strategy's `instrument` at its `base_timeframe`: the last 500 bars up to the
  current bar, candlesticks only.
- The panel header names the strategy and the market (`ETHUSDT.P · 5m`), shows the time of
  the last bar it received, and has a **Refresh** button that reloads the candles.
- Loading, empty, error (with Retry) and stale-data notice states.
- Candles come from the existing `GET /api/market/candles-window` through the existing
  `fetchCandlesWindow` client; no new backend call and no new proxy.
- The chart is drawn with `lightweight-charts` (already a dependency), in a new small
  component in `src/features/runtime/`, styled with the Surface tokens in light and dark
  theme. The legacy Chart tab runtime is not reused.

## Out of Scope

EMA lines, volume, entry / stop / take-profit levels, trades and markers, Journal, Engine
view, Actual/ABI view, any Runtime state or `enabled` management; live updates and polling;
timeframe switching, loading older history on scroll, saving zoom or the selection between
visits; sorting, filtering, search of the list; any change to Runtime, Research Service,
Engine, ABI or Journal; changes to the existing Chart tab. The V1 list and its states stay as
they are, apart from selectability.

## Capabilities

### New Capabilities

- `research-workbench-runtime-dashboard-chart-v1`: strategy selection and the candle chart in
  the Runtime Dashboard.

## Impact

- `src/features/runtime/RuntimeDashboard.tsx` (selection, two-column layout), new
  `RuntimeCandleChart.tsx`, `runtimeCandles.ts` (window computation and loading),
  `runtime.css`, tests. No new dependency, no API or proxy change.
