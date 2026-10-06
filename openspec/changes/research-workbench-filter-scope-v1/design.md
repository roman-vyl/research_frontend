## Context

`useExperimentData` loads one outer slice (`results?{outer}=v`); `model.ts`
filters work on `Row[]` of that slice. Candidates already reopen a Surface point
through `emitFocus({ experimentId, coords })` with `rowCoords(schema, row)`.

## Decisions

- **Frontend only.** The results API already accepts no filters and a `columns`
  list, so "All settings" needs no backend change.
- **Column subset, columnar evaluation.** The full table is fetched once with only
  the needed columns and kept as `ExperimentResults`. Evaluation walks row indices
  over column arrays and fills one reused row object, so the existing condition
  code (`passes`, percentile cut-offs, comparison index) is reused instead of
  duplicated. No `Row` object per row is kept.
- **Best value per cell** uses the same `displayValue` (treatment / baseline /
  difference) as the displayed grid; higher is better for every metric, as in the
  heat map scale (drawdown is stored negative, so closer to zero wins).
- **Cells key on the row's own grid**: x / y values are read with the row's grid,
  so multi-grid Experiments are covered without special cases.
- **Jump** reuses the focus path (`rowCoords` → `emitFocus`), which already sets the
  outer slice, grid, controls and optional dimensions and selects the point.
- **Scope** is stored with the filters under the per-Experiment session key.

## Risks

- Request size on the ≈3M-row Surfaces. Mitigation: only needed columns, fetched on
  demand; follow-up server-side filtering if needed.
- Coordination with open PRs #4 (select mode) and #5 (spec archive): this branch is
  rebased after they merge; the selection bar is only hidden under "All settings".
