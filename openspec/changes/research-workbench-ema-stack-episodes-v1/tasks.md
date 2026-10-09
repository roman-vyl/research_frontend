## 1. Data

- [x] 1.1 Types for the Engine episode history response; `fetchEmaStackEpisodeHistory(body)` posting to `/api/market/ema-stack-episodes/history`; 409 as `ApiError` with code.
- [x] 1.2 Episode parameters: Engine's effective `episode_params_by_ref` via the feature-plan proxy for a strategy with `ema_stack_episode` (explicit choice of several refs), `anchor_stack` fallback otherwise (owner review 2026-10-09).
- [x] 1.3 Loader: all pages newest first pinned to page 1's hash, restart on 409, session cache per key, shared in-flight promise.
- [x] 1.4 Refresh at each candle boundary: page 1 without pin, merge finished by start, replace current.

## 2. View

- [x] 2.1 Chart primitive: band with header, zones with numbers, false breaks with depth and outcome, waves and labels, forming wave, lanes.
- [x] 2.2 Toggles (band, zones, false breaks, waves, forming) and side LONG / SHORT / both.
- [x] 2.3 Bar Inspector "Episode on this bar", only facts known at the bar's close (`known_at`).
- [x] 2.4 Touches table with row highlight.

## 3. Verification

- [x] 3.1 Unit tests: parameters, paging with pin and 409 restart, cache hit, refresh merge, time-to-entity lookups, table rows.
- [x] 3.2 `npm run build`, `npm test`.
  - 2026-10-09: `tsc -b` clean, vitest 117 files / 819 tests pass. Visual check of the chart primitive, toggles, inspector section and table on a throwaway harness page with synthetic Engine-shaped data (headless Chromium): band, zones 1-3, false break with depth and outcome, waves S*→P→touch, forming wave, LONG/SHORT lanes, row highlight.
- [x] 3.3 Mac smoke (owner-approved 2026-10-09): research-service on 8095 against Engine 4f4f80c; HTTP page 1, page 2 with the right pin, 409 with a wrong pin; Workbench on this branch, BTCUSDT.P and ETHUSDT.P 5m, LONG / SHORT / Both, zones, waves, false breaks, table, inspector; after a new candle the history stays and `current` refreshes without a reload loop; a few episodes and touches match Engine's response by time; the inspector shows no later facts as known.
  - 2026-10-09 (Engine 4f4f80c on 8090, research_service branch on 8096, this branch 7901897 on 5177): real BTCUSDT.P and ETHUSDT.P 5m episodes on the chart; anchor_stack fallback without feature-plan call; one ref labelled; two refs → no history until a ref is chosen; LONG/SHORT/Both, five layer toggles, table row highlight. New candle 15:20:05 and 15:25:05: exactly 2 page-1 requests (long, short) without pin, history kept on screen, no full reload, timers of a previous run do not fire; each refresh 12.7–25.6 s (Engine recomputes per candle, accepted for V1). Entities match Engine to the minute and price: BTC LONG 2026-09-18 18:20 → 2026-09-26 02:20 (7 touches, 5 false breaks, 8 waves), BTC SHORT current, ETH SHORT 2026-09-15 → 09-18 (3 touches, 2 false breaks). Inspector causality on real false breaks: BTC LONG №5 (run below 05:45, detection 07:45, comeback 08:20) and ETH SHORT №2: zone open and no false break before detection, false break without outcome until its known_at, comeback and depth only from it. Found outside this change (reproduces on main bbf84e1): switching ETH run → BTC run in one tab keeps ETH candles.
- [x] 3.4 `openspec validate research-workbench-ema-stack-episodes-v1 --strict`.
