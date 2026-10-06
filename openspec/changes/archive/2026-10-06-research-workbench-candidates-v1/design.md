## Context

- `App.tsx` keeps the Surface pane mounted (hidden) so its local state survives;
  `SurfaceView` restores Experiment, SL slice (`outerValue`), metric, controls and
  the selected point from session storage (`StoredSurface`).
- `SurfaceView` adds `net_pnl = return_pct × initial equity` when the table has no
  `net_pnl` (`withNetPnl`, `addNetPnl` in `model.ts`). Range filters are
  `FiltersPanel` over `Condition[]` (Max DD compares depth, sign-agnostic; few-value
  parameters are buttons).
- The Surface is linked to the workbench only through `setSelectedRunId` and
  `setActiveTab` (`boundary.test.ts`).

## Decisions

### D1. Star

`CellDetails` shows a star toggle for the selected point. The coordinates sent are
the semantic ids of the row: every dimension (for a multi-grid dimension, the value
in the row's grid), `grid` and `arm` when the schema has them. The client never
computes or sends a `candidate_id` on star; the response record is cached in a
small candidates store and its `candidate_id` is used for unstar. 409
`ambiguous_row` and 404 are shown as messages next to the star.

A cell of the visible slice is marked starred when some candidate's coordinates
equal the cell's row coordinates (numeric equality within `1e-9`). For an aggregated
cell (several rows behind one cell) the mark shows that at least one row behind it
is starred.

### D2. Candidates store

A small module (`src/features/candidates/store.ts`) holds the shortlist loaded with
`GET /api/research/candidates`, reloads it after every star or unstar, and is
shared by the Surface (marks, star state) and the Candidates tab. It is not part of
`WorkbenchContext`.

### D3. Candidates tab

Table columns: star (unstar), Experiment title, meaning in one line, badges, Net PnL
USDT, Return, PF, Max DD, win rate, trades, Cum R, picked at; columns for metrics
present in the record. Values are the `current` metrics; when `row_state` is
`changed` the snapshot value is shown on hover. Net PnL: `net_pnl` when present,
else `return_pct × initial_equity` from `meaning.fixed_params.initial_equity`, the
same rule as the Surface.

One-line meaning: `<anchor> · <label> <value> <unit> · … · fee <entry fee> per side`
from `meaning`.

Badges:
- origin: `Engine run` (current `run_id` present), `replay only` (provenance replay,
  no `run_id`), `no full run` (provenance engine, no `run_id`);
- row state: `changed`, `missing`, `ambiguous` (`same` shows nothing).

Range filters reuse `FiltersPanel` conditions over the candidate metrics, kept in
session storage under `candidates.filters`.

### D4. Chart

"Chart" calls `setSelectedRunId(current.run_id)` and `setActiveTab("chart")`, as
"Open run" on the Surface does. Disabled with "no full run" when the current row has
no `run_id`.

### D5. On Surface

The Candidates tab posts a focus request `{ experimentId, coords }` to a tiny
focus channel (`src/features/candidates/focus.ts`, a subscribe/emit module) and
calls `setActiveTab("surface")`. `SurfaceView` subscribes; on a request it sets the
Experiment, the SL slice (`outerValue`) from the outer dimension's coordinate, the
view controls (`grid`, `arm`, other controls) from the coordinates, and selects the
cell whose row has these coordinates, as the session restore already does. If the
active Surface filters hide the point, it is still selected and the details panel
says it is hidden by filters. Candidates with `row_state` `missing` or
`ambiguous` have the action disabled with a hint ("row not found" / "several rows
match this point"): the client never picks one of several matching rows.

