## 1. Data

- [x] 1.1 Types for the Engine episode history response; `fetchEmaStackEpisodeHistory(body)` posting to `/api/market/ema-stack-episodes/history`; 409 as `ApiError` with code.
- [x] 1.2 Episode parameters from `strategy_spec.ema_stack_episode` or `anchor_stack`.
- [x] 1.3 Loader: all pages newest first pinned to page 1's hash, restart on 409, session cache per key, shared in-flight promise.
- [x] 1.4 Refresh at each candle boundary: page 1 without pin, merge finished by start, replace current.

## 2. View

- [x] 2.1 Chart primitive: band with header, zones with numbers, false breaks with depth and outcome, waves and labels, forming wave, lanes.
- [x] 2.2 Toggles (band, zones, false breaks, waves, forming) and side LONG / SHORT / both.
- [x] 2.3 Bar Inspector "Episode on this bar".
- [x] 2.4 Touches table with row highlight.

## 3. Verification

- [x] 3.1 Unit tests: parameters, paging with pin and 409 restart, cache hit, refresh merge, time-to-entity lookups, table rows.
- [x] 3.2 `npm run build`, `npm test`.
  - 2026-10-09: `tsc -b` clean, vitest 117 files / 819 tests pass. Visual check of the chart primitive, toggles, inspector section and table on a throwaway harness page with synthetic Engine-shaped data (headless Chromium): band, zones 1-3, false break with depth and outcome, waves S*→P→touch, forming wave, LONG/SHORT lanes, row highlight.
- [ ] 3.3 Manual check on the owner's stack (research-service with the proxy, Engine 4f4f80c): layers match the mock on BTCUSDT.P 5m.
- [x] 3.4 `openspec validate research-workbench-ema-stack-episodes-v1 --strict`.
