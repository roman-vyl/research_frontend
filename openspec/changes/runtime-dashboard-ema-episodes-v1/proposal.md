## Why

The Runtime Dashboard chart of an open strategy shows candles, projection lines and trade markers but not the EMA lines the strategy trades against, and not the EMA stack episodes (legs, half-waves) that explain an entry. Every strategy has its own stack and episode parameters, so the chart must show the selected strategy's own, not a fixed set.

## What Changes

- On selecting a strategy the panel reads its layer configuration from Runtime, `GET /runtime-api/v1/strategy-instances/{id}/chart-layers` (`strategy_runtime`, `runtime-strategy-chart-layers-v1`): the anchor-stack EMAs and the effective episode parameters. The browser never reads the specification.
- **EMA lines.** One line per stack EMA whose `timeframe` is `"base"` (as Engine's plan states it for the strategy's base timeframe) or equals the chart's timeframe and whose `source` is `close`, over the same 30-day window as the candles. Values come from Research `GET /api/market/indicators/ema` (Engine computes them with warm-up); the frontend computes nothing. A line is requested once per (market, period) and kept for the session; selecting another strategy of the same market requests only periods not yet loaded. Refresh re-requests the lines' missing tail together with the candles.
- **Episodes.** When the strategy declares an episode section, the chart shows the Workbench episode layers (band, touch zones, false breaks, waves, forming wave, lanes) from Research `POST /api/market/ema-stack-episodes/history` with the strategy's own parameters. The whole history is loaded (pages of whole finished episodes, as in the Workbench); the 30-day window only decides what is on screen, so an episode that starts before the window is cut by the screen edge and keeps its real touch numbers. The current episode is refreshed by Refresh only.
- **Display and partial results.** Everything is drawn strictly inside the 30-day window; panning or zooming never loads anything. Candles and trade layers never depend on the new layers; each EMA line, the episode history and the configuration load, fail and retry on their own; no layer of the previous strategy is visible under a new selection.
- A small toolbar above the chart: layer toggles for episodes, side choice (long, short, both), and episode buttons when the strategy declares several; EMA lines can be hidden together.
- Strategies without an episode section show no episode layers and no toolbar. A stack EMA on another timeframe is not drawn and the panel says so in one line.
- The tab keeps its rule "GET, the switch PUT and the delete DELETE, nothing else, no polling": the new requests are GETs and POSTs of the read-only history route (the existing Workbench call), sent on selection and on Refresh only.

## Capabilities

### Modified Capabilities

- `research-workbench-runtime-dashboard-chart-v1`: new requirements for the layer configuration, EMA lines and episode layers; "Native viewport only" now allows a fixed number of overlay series.
- `research-workbench-runtime-dashboard-v1`: the mutation guard also allows the read-only episode history `POST`.

## Impact

`src/api/runtime.ts` (chart-layers read), a Runtime layers module and hook in `src/features/runtime/`, `RuntimeChartPanel.tsx`, `RuntimeCandleChart.tsx` (up to three line series and the episode primitive), `runtime.css`, tests, static guards. The Workbench episode modules (`features/episodes/`) are imported as they are, with one optional addition: `EpisodeLayersState.clipToCandles` (the Workbench does not set it, so nothing changes there) makes the primitive draw only between the first and last candle. No Workbench context is imported. `useEpisodeHistories` is not used because it refreshes `current` on a timer; the Runtime hook calls the cached loaders directly. Depends on the Runtime route and a Runtime image that contains it; deployed after Runtime.
