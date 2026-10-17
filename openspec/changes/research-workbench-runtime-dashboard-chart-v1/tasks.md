## 1. Candle loading

- [ ] 1.1 `src/features/runtime/runtimeCandles.ts`: compute the 500-bar window from `now` and the timeframe (existing helper; unknown timeframe → typed error), call `fetchCandlesWindow` with an `AbortSignal`, classify errors (network/5xx, 4xx, unsupported timeframe), compute last-bar age and the stale flag.

## 2. Selection and layout

- [ ] 2.1 `RuntimeDashboard.tsx`: `selectedId` state, cards as buttons with `aria-pressed`, keep or clear the selection on list refresh, two-column layout from 1000px.
- [ ] 2.2 `runtime.css`: selected card, chart panel (sticky), states, stale label; only existing `.sx` tokens.

## 3. Chart component

- [ ] 3.1 `RuntimeCandleChart.tsx`: one `lightweight-charts` chart, candlestick series, UTC axis, colors from CSS variables (re-read on scheme change), fit content on new data, `ResizeObserver`, cleanup on unmount.
- [ ] 3.2 Panel states: select-prompt, loading, empty, error with Retry, header with market and last bar, Refresh disabled while loading, aborted and late responses ignored.

## 4. Tests

- [ ] 4.1 `runtimeCandles`: window math (5m, 15m, 1h), unknown timeframe, error kinds, stale flag boundary (2 bars).
- [ ] 4.2 Panel (chart library mocked): selection marks, selection moves, kept/cleared on list refresh, request parameters, header, stale and fresh label, loading / empty / error / Retry, unknown timeframe makes no request, abort on reselect, Refresh makes one request, no request without selection.
- [ ] 4.3 `npm test`, `tsc -b`, `vite build`, `openspec validate --all --strict` green.

## 5. Visual check

- [ ] 5.1 Screenshots with mocked Runtime and candles: light, dark, desktop two columns, phone, stale label; owner reviews the look.
- [ ] 5.2 On the Mac against the running Runtime and Research Service (on the owner's word): select the enabled strategy, the ETHUSDT.P 5m chart draws and shows the real last bar.
