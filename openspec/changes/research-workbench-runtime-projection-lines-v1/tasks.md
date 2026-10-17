## 1. Journal access

- [ ] 1.1 `vite.config.ts`: proxy `/journal-api` → `VITE_JOURNAL_PROXY_TARGET` or `http://127.0.0.1:8097` (prefix stripped).
- [ ] 1.2 `src/api/journal.ts`: types and `fetchJournalEvents` (with continuation while `truncated`), `fetchJournalStrategyInstances`, error kinds, `AbortSignal`.

## 2. Projection data

- [ ] 2.1 `runtimeProjection.ts`: pure `buildProjection(candles, events)` returning the three line data arrays (value or whitespace per bar), not-computed bar times, unreadable count; states signal / no signal / not computed / before first; latest `occurred_at` per bar.
- [ ] 2.2 Event loading for the candle window with generation + strategy/market guard and `AbortController`.

## 3. Chart and UI

- [ ] 3.1 `RuntimeCandleChart.tsx`: three step `LineSeries` (point markers visible) and not-computed markers; Surface-token colours for light/dark; no viewport calls.
- [ ] 3.2 `RuntimeChartPanel.tsx`: legend (Entry, Stop, Take, N not computed, N unreadable), "Projection unavailable" + Retry, Refresh repeats events.
- [ ] 3.3 `RuntimeDashboard.tsx`: summary request on list load/Refresh, "Last evaluated" / "No evaluations yet" on cards.

## 4. Tests

- [ ] 4.1 `buildProjection`: 3 and 12 consecutive signals; null breaks all three lines; missing event marked not computed and distinct from null; bars before the first event empty; unreadable counted; several events per bar; a single isolated signal.
- [ ] 4.2 Panel (chart library mocked): same-market selection requests events only; journal failure keeps candles and shows the message; Refresh repeats events (+3 bars gives +3 points); late response ignored; truncated continuation.
- [ ] 4.3 Static guards unchanged (no viewport calls, no forbidden imports); `git diff` touches nothing under `features/chart/`, `features/workbenchChartRuntime/`, `shared/context/`.
- [ ] 4.4 Real-browser check (Chromium via Playwright, on demand): fixture with signal, null and missing bars; screenshot shows gaps, single-point visibility and markers in both themes. Owner reviews the screenshots.
- [ ] 4.5 `npm test`, `tsc -b`, `vite build`, `openspec validate --all --strict` green.

## 5. Live check

- [ ] 5.1 On the Mac (on the owner's word, after `journal-read-api-v1` is deployed and one strategy ran 3 bars in ABI dry-run): the three lines grow by a point per bar; a bar with `desired_entry = null` breaks them; stopping the Journal Service shows "Projection unavailable".
