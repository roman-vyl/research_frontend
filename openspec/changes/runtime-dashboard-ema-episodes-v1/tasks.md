## 1. research_frontend

- [x] 1.1 `fetchRuntimeChartLayers(id)` in `src/api/runtime.ts`: `GET`, strict body check (`ema_stack` entries with role, timeframe, period; `episodes` entries with ref and params), typed error.
- [x] 1.2 Layer configuration hook in `src/features/runtime/`: one request per selection and on Refresh (D1), failure line with Retry, stale responses ignored, aborted on market switch (D6).
- [x] 1.3 EMA lines (D2, D3): per (symbol, timeframe, period) session store of half-open ranges, request only missing periods and tails, hide/show control, other-timeframe line of text; three line series created once with the chart (D7).
- [x] 1.4 Episode layers (D4, D5): cached episode loaders (not the timer-driven `useEpisodeHistories`) with `historyParamsFromEffective` of the chosen entry, episode primitive on the candle series with the optional `clipToCandles`, toolbar with layer toggles, side choice and explicit entry choice; no timers; `current` refreshed on Refresh.
- [x] 1.4a Partial results (D4a, D9): per-line load and error state, per-episode load and error state, layers keyed by the selected `strategy_instance_id` and cleared on switch, Retry limited to missing or failed data.
- [x] 1.5 Tests: layer request count on select, same-market switch, failure and Retry; EMA requests per period, nothing for a known period, only the tail after Refresh, other timeframe, hide; episode paging, pin and restart on 409, cut by the window with Engine numbers kept, several entries ask for a choice, empty `episodes` shows nothing, no timers; one failing EMA leaves the others, slow or failing episodes leave candles and lines, no previous-strategy layer under a new selection, Retry requests only missing or failed data, pan and zoom send no request, nothing drawn outside the window; fixed series count across strategy switches; static guards (no viewport calls, no Workbench context imports, allowed request kinds including the history `POST`).
- [x] 1.6 `npm test`, `tsc -b`, `openspec validate --all --strict` green.

## 2. Rollout (on owner's word only)

- [ ] 2.1 PR and merge only on the owner's word; deploy after the Runtime change (`strategy_runtime`, `runtime-strategy-chart-layers-v1`) is deployed.
- [ ] 2.2 On the Mac demo: pick a running strategy and compare the three EMA lines and the episodes with the Workbench for the same market; switch to another strategy of the same market and see only the missing requests.
