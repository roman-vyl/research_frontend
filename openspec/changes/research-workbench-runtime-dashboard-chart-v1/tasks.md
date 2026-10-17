## 0. Precondition

- [ ] 0.1 `research-market-bounds-v1` is merged and deployed in Research Service (otherwise apply may proceed against a mocked bounds, acceptance may not).

## 1. API client

- [ ] 1.1 `src/api/types.ts`: `MarketBounds` type; `src/api/client.ts`: `fetchMarketBounds({symbol, timeframe, signal})` for `GET /api/market/bounds`.

## 2. Market loading

- [ ] 2.1 `src/features/runtime/runtimeMarket.ts`: `marketKey`, 30-day window from bounds (`resolveChartTimeframeMs`), `RUNTIME_CHART_RELOAD_TOKEN = 0`, load through `getMarketCandlesCache` / `fetchCandlesWindow` / `mergeCandlesWindowBundle` / `getCandles` for the missing range only, error kinds, `AbortSignal`.
- [ ] 2.2 Generation + market-identity guard for late responses.

## 3. UI

- [ ] 3.1 `RuntimeDashboard.tsx`: `selectedId`, cards as buttons (`aria-pressed`), selection kept or cleared on list refresh, two-column layout from 1000px.
- [ ] 3.2 `RuntimeCandleChart.tsx`: one candlestick series, Surface colours (light/dark), `ResizeObserver`, `setData` on market change, cleanup; no viewport calls.
- [ ] 3.3 Panel states and header (name, market, last bar UTC), Refresh, Retry; `runtime.css` under `.sx` tokens.

## 4. Tests

- [ ] 4.1 `runtimeMarket`: window math (5m, 15m, 1h, 4h, 1d; short history), request parameters, missing-range-only loading, same-market no request, other-market request, error kinds, unsupported timeframe, late response ignored.
- [ ] 4.2 Panel (chart library mocked): selection marks, same-market selection makes no request, different market loads, states, Retry, Refresh, abort on switch.
- [ ] 4.3 Cache contract: Runtime never calls reset/clear; a Runtime chunk merged into a store holding Research chunks leaves their coverage intact (below the 10-chunk limit) and Research's own cache tests stay unchanged.
- [ ] 4.4 Static guards: no viewport methods and no forbidden imports in `src/features/runtime/`; `git diff` of the change touches no file under `features/chart/`, `features/workbenchChartRuntime/`, `shared/context/`.
- [ ] 4.5 `npm test`, `tsc -b`, `vite build`, `openspec validate --all --strict` green.

## 5. Visual and live check

- [ ] 5.1 Screenshots with mocked bounds and candles: light, dark, desktop two columns, phone, market switch; owner reviews the look.
- [ ] 5.2 On the Mac against the live stack (on the owner's word, after the bounds route is deployed): select the enabled strategy, the `ETHUSDT.P · 5m` chart draws 30 days ending at the real last committed bar; select a second strategy on the same market, no requests are made.
