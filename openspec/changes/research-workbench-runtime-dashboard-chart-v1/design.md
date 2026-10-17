## Context

V1 renders the Runtime list as cards; each item has `strategy_instance_id`, `instrument`
(`ETHUSDT.P`) and `base_timeframe` (`5m`), the same strings the Research market routes take.
Explore findings this design relies on (`/mnt/project-files/runtime-dashboard/explore-research-chart.md`):

- `chart/marketResourceCache.ts` is a module singleton keyed `symbol␞timeframe␞reloadToken`, with
  no run in the key, half-open `[from, to)` ranges, merge and dedup by bar time, at most 10 chunks
  per key (the leftmost are dropped first).
- `reloadToken` changes only when the Workbench "Retry" button after a failed report load is
  pressed (`WorkbenchGate.tsx:29` → `reloadReport`), so it is not a data-refresh signal.
- `fetchCandlesWindow` answers exactly the requested range or fails; the route cannot tell what
  exists, hence the bounds route.
- Supported timeframes are 5m, 15m, 1h, 4h, 1d, so 30 days is at most 8 640 bars, below the Research
  render window of 25 000 bars. No window slicing is needed.

## Decisions

1. **Two identities.** `selectedId` = `strategy_instance_id` (UI state in `RuntimeDashboard`,
   nothing selected on open). `marketKey` = `instrument` + `base_timeframe`. The chart depends only
   on `marketKey`; selecting another strategy with the same `marketKey` changes the highlighted
   card and the header name and does nothing else: no request, no series reset. Disabled
   strategies are selectable.
2. **Right edge from bounds.** On selecting a new market and on Refresh the panel calls
   `GET /api/market/bounds`. `toOpenTimeMs = latest_open_time_ms`. The browser clock is not used.
3. **Initial window.** `toExclusive = latest_open_time_ms + tfMs`;
   `fromMs = max(earliest_open_time_ms, toExclusive - 30 days)`, aligned to the bar grid; `tfMs`
   from the existing `resolveChartTimeframeMs`. 5m: up to 8 640 bars. An unsupported timeframe is
   an error state with no request.
4. **Loading through the shared cache, without touching Research modules.** Runtime code uses the
   public cache API only: `getMarketCandlesCache(key).missingRange(fromMs, toMs)`, then one
   `fetchCandlesWindow` for the missing range, `mergeCandlesWindowBundle`, then `getCandles`. It
   does not use `RunMarketView`, the planner, the load owner or any `workbenchChartRuntime` code, so
   no Research file changes. A repeated selection of a covered window makes no candles request.
   When the committed tail has moved on, only the missing tail range is requested.
5. **Cache key and token.** `buildCandlesCacheKey({symbol, timeframe, reloadToken: 0})` with a
   named constant `RUNTIME_CHART_RELOAD_TOKEN = 0`. Contract (verified in code): Research moves to a
   new key only when its Retry increments the token; neither side clears or resets stores
   (`clearMarketResourceCache` has no production caller); candles are closed bars and immutable, so
   sharing a store cannot serve stale bars. Runtime code never calls `reset`, `clear` or
   `clearMarketResourceCache`.
6. **Eviction contract.** Runtime adds at most one contiguous chunk per window (merged with an
   adjacent chunk when they touch). A Research store reaches the 10-chunk limit only after ten
   disjoint trade windows; then Runtime's chunk can push out Research's leftmost chunk, which costs
   Research one refetch and never wrong data (the same already happens between Research's own
   chunks). This is accepted and covered by a test; the cache is not changed.
7. **Chart component.** `RuntimeCandleChart` creates one `lightweight-charts` chart with one
   candlestick series, no volume, EMA, markers or price lines, colours from the Surface tokens
   (light/dark), width from a `ResizeObserver`. Data goes in with `series.setData`. The component
   calls no viewport method: no `setVisibleRange`, `setVisibleLogicalRange`, `fitContent`,
   `scrollToPosition`, `scrollToRealTime`. A static test asserts this and also that no file in
   `src/features/runtime/` imports `WorkbenchContext`, `WorkbenchRenderViewportContext`,
   `features/chart/ChartPanel`, `features/chart/runtime/*` or `features/workbenchChartRuntime/*`.
8. **Switching market and stale responses.** One request chain per `marketKey`, with an
   `AbortController` and a generation counter. A response is applied only if its `marketKey` is still
   the displayed one (identity compare, not the Research "generation OR identity" rule). Selecting a
   strategy of another market aborts the previous chain and replaces the series data; the previous
   market's candles stay in the cache.
9. **Header and states.** Header: strategy name, `ETHUSDT.P · 5m`, "Last bar" with
   `latest_open_time_ms` in UTC, Refresh. States: select prompt, loading, empty (no candles),
   error (bounds failed, candles failed, unsupported timeframe) with Retry. Refresh repeats bounds
   and the candle window for the current market.
10. **Layout.** From 1000px the list is on the left and the chart panel on the right (sticky);
    below that the chart is under the list. Surface tokens and panel classes as in V1.

## Risks

- After replacing the series data for another market the library decides the visible area; checked
  by screenshots. If it is unacceptable, the fix is a follow-up, not a viewport controller here.
- Depends on the bounds route being deployed; the error state makes the dependency visible.
- The shared cache has no per-bar limit (existing behaviour); V1 loads one bounded window per market.
