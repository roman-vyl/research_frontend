## 1. Journal access

- [x] 1.1 `vite.config.ts`: proxy `/journal-api` → `VITE_JOURNAL_PROXY_TARGET` or `http://127.0.0.1:8097` (prefix stripped).
- [x] 1.2 `src/api/journal.ts`: types and `fetchJournalEvents` (one request per window, `event_type=live_entry_evaluated`, no `limit`; `truncated: true` is an error), `fetchJournalStrategyInstances`, error kinds, `AbortSignal`.

## 2. Projection data

- [x] 2.1 `runtimeProjection.ts`: pure `buildProjection(candles, events, firstKnownBarMs)` returning the three line data arrays (value or whitespace per bar), times of bars without a recorded evaluation, unreadable count; states signal / no signal / no evaluation recorded / before known history (`first_bar_open_time_ms`); latest `occurred_at` per bar, ties by greater `event_id`.
- [x] 2.2 Event loading for the candle window (plus the strategy's `first_bar_open_time_ms`) with generation + strategy/market guard and `AbortController`.

## 3. Chart and UI

- [x] 3.1 `RuntimeCandleChart.tsx`: three `LineSeries` (point markers visible; the segment leaving the last point of each run hidden) and no-evaluation markers; Surface-token colours for light/dark; no viewport calls.
- [x] 3.2 `RuntimeChartPanel.tsx`: legend (Entry, Stop, Take, N without a recorded evaluation, N unreadable), "Projection unavailable" + Retry, Refresh repeats events.
- [x] 3.3 `RuntimeDashboard.tsx`: summary request on list load/Refresh, "Last evaluated" / "No evaluations yet" on cards.

## 4. Tests

- [x] 4.1 `buildProjection`: 3 and 12 consecutive signals; null breaks all three lines; missing event marked as no evaluation recorded and distinct from null; bars before `first_bar_open_time_ms` empty, while a window whose first event is later than `first_bar_open_time_ms` marks the earlier in-history bars as no evaluation recorded; unreadable counted; several events per bar (equal `occurred_at` resolved by `event_id`); a single isolated signal.
- [x] 4.2 Panel (chart library mocked): same-market selection requests events only; journal failure keeps candles and shows the message; Refresh repeats events (+3 bars gives +3 points); late response ignored; one events request per window without `limit`; `truncated: true` shows "Projection unavailable" and draws nothing.
- [x] 4.3 Static guards unchanged (no viewport calls, no forbidden imports); `git diff` touches nothing under `features/chart/`, `features/workbenchChartRuntime/`, `shared/context/`.
- [ ] 4.4 Real-browser check (Chromium via Playwright, on demand): fixture with signal, null and missing bars; screenshot shows gaps, single-point visibility and markers in both themes. Owner reviews the screenshots.
- [x] 4.5 `npm test`, `tsc -b`, `vite build`, `openspec validate --all --strict` green.

## 5. Live check

- [ ] 5.1 On the Mac (on the owner's word, after `journal-read-api-v1` is deployed and one strategy ran 3 bars in ABI dry-run): the three lines grow by a point per bar; a bar with `desired_entry = null` breaks them; stopping the Journal Service shows "Projection unavailable".
