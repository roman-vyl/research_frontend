## 1. research_frontend

- [x] 1.1 Scope state (`view` | `all`) in `SurfaceView`, stored per Experiment with the filters; default `view`.
- [x] 1.2 Switch in `FiltersPanel`, "All settings" label built from the view controls (no per-Experiment text).
- [x] 1.3 Loader of the full table for a column subset (no filters), one response holds the whole needed column set (a new metric re-requests the whole set, never joined by row index), dropped on reload / deletion.
- [x] 1.4 Column-wise evaluation in `model.ts`: conditions on all treatment rows, Δ against the matched comparison row, top / bottom % over all rows; per cell best row and match count; top 50 matches.
- [x] 1.5 All-settings heat map (best value + count, grey when no match), summary, matches table; selection bar and equity panel hidden.
- [x] 1.6 Jump: cell or table row opens Displayed grid on the best setting and selects the point (focus path).
- [x] 1.7 Tests (mocked API): default scope unchanged; switching sends one request without filters and only needed columns; counts and best cell; top / bottom % is global over all settings, not per cell (scenario in spec: A = 1..5, B = 6..10, top 20 % keeps only 9 and 10 in B); Δ condition; jump sets slice and controls; no request before switching.

## 2. Manual check (owner)

- [x] 2.1 On the EMA1000 ADX-since-entry Surface the result matches the HTML page for the same conditions.
- [x] 2.2 On an older Surface (for example EMA500 ratio_4d) the switch appears and works without any change to its manifest.
