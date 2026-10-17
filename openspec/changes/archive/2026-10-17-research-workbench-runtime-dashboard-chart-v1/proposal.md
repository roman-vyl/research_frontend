## Why

Runtime Dashboard V1 (#23) lists the strategies of the Runtime catalog. The next smallest step of
the same slice: select a strategy and see the candles of its market. Only price candles; nothing
about the strategy's own state yet.

The existing Research Chart carries a navigation machine (render-window shifts, viewport commands,
pan prefetch) that was stabilised after real problems and is bound to Research runs. This change
deliberately does not touch it and does not copy it: the first chart shows a bounded history and
leaves pan and zoom to the chart library. Loading history to the left, and extracting the proven
navigation core, are separate later changes.

## What Changes

- A strategy card in the Runtime Dashboard becomes selectable. Selection is UI state only.
- Right of the list (below it on a narrow screen) a **CandleChart** panel shows the market of the
  selected strategy: `instrument` + `base_timeframe` (for example `ETHUSDT.P · 5m`).
- The chart shows the last 30 days of candles up to the latest bar that Market Data Service has
  committed. The right edge comes from the new `GET /api/market/bounds` of Research Service
  (`research-market-bounds-v1`), not from the browser clock.
- Candles are loaded with the existing `GET /api/market/candles-window` client and stored in the
  existing shared `marketResourceCache`. Two strategies on the same market use the same cached
  candles and do not request them again.
- Pan and zoom are the native Lightweight Charts behaviour. The code sets no visible range.
- Loading, empty, error (with Retry) states and a Refresh button.

## Out of Scope

Loading history older than the initial 30 days, any prefetch, render-window shifts, viewport
commands, pending shift, trade focus; EMA, indicators of the strategy, Engine observations,
events, trades, markers, levels, Journal, ABI; live updates and polling; timeframe switching;
saving selection or zoom between visits; changes to the Research Chart, `WorkbenchContext`,
`chart/`, `workbenchChartRuntime/` or any existing cache module; changes to Runtime, Engine, MDS
or Research Service (the bounds route is its own change).

## Dependency

Requires `research-market-bounds-v1` (Research Service) to be merged and deployed. Without it the
panel shows its error state for every selection.

## Capabilities

### New Capabilities

- `research-workbench-runtime-dashboard-chart-v1`: strategy selection and the bounded candle chart.

## Impact

- `src/features/runtime/RuntimeDashboard.tsx` (selection, two-column layout), new
  `RuntimeCandleChart.tsx`, `runtimeMarket.ts` (window, loading, identity), `runtime.css`,
  `src/api/client.ts` (new `fetchMarketBounds`), `src/api/types.ts` (bounds type), tests. No new
  dependency, no proxy change (`/api` already reaches Research Service).
