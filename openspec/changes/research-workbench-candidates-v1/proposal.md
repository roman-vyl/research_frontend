## Why

The owner picks candidates for live trading by eye on the Surface. Research Service
now keeps a persistent shortlist (`research-candidate-shortlist-v1`): a Surface point
is starred, and the record survives run deletion and table recalculation. The
Workbench needs a way to star a point and one place that lists the picked points.

## What Changes

- **Star on Surface.** The point details panel (`CellDetails`) gets a star toggle.
  It sends `experiment_id` and the point's coordinates (every dimension, `grid` and
  `arm` when present); the backend builds `candidate_id`. Starred cells of the
  visible slice show a star mark on the heat map.
- **Candidates tab.** A new `WorkbenchTab` `"candidates"` lists the shortlist: one
  line of meaning, origin and row state badges, metrics with **Net PnL in USDT (from
  the manifest's initial equity, after fees)** first, and metric range filters.
- **Two actions per candidate.** "Chart" opens the run on the Chart tab through the
  existing `setSelectedRunId` + `setActiveTab("chart")`, and is disabled with "no
  full run" when the current row has no `run_id`. "On Surface" opens the Surface on
  the candidate's Experiment, slice and controls and selects the point.
- **Details.** Expanding a candidate shows the full meaning (coordinates with labels
  and units, fixed parameters) and the strategy spec snapshot, labelled as the
  historical spec of the picked run, when the record has one.

## Non-Goals

- Any trading, runtime or deployment action, status or button.
- Presenting the strategy spec snapshot as a current or deployable spec.
- Comments, bulk star, user ordering.
- Changes to `/results`, run loading or `GET /api/research/runs`.

## Impact

- `src/api`: three calls and types for `/api/research/candidates`.
- `src/features/candidates`: new tab.
- `src/features/surface`: star in `CellDetails`, star mark on cells, applying a focus
  request from the Candidates tab.
- `TabNav` and `WorkbenchTab` get one entry. `WorkbenchContext` is not changed.
