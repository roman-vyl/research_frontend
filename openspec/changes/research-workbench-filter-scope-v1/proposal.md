## Why

Surface filters today look only at the displayed grid: the loaded outer slice (for
example SL) and the current controls. To find where a set of conditions holds
anywhere in an Experiment the owner has to step through every SL, timeframe and
parameter by hand. The research HTML pages ("EMA1000 ADX Since Entry", "... + BE")
already have a "Displayed grid / All settings" switch for this. The Workbench must
have it on every Surface, past and future, without any per-Experiment code.

## What Changes

- A **filter scope** switch in the Filters panel of every Surface:
  **Displayed grid** (today's behaviour, default) and **All settings**. The "All
  settings" label lists the manifest controls it spans (for example
  "All settings (SL × ADX timeframe × rise × D)"), built from the view's
  `controls` minus `x` / `y`.
- **All settings** evaluates the same conditions (value or Δ, ≥ / ≤ / top % /
  bottom %) on every treatment row of the Experiment: every outer slice value,
  grid, control value and optional dimension on or off. Top / bottom % rank all
  those rows.
- The heat map keeps its x × y axes. A cell shows the best displayed value among its
  matching rows and, under it, the number of matching settings; a cell with no match
  is grey. With no active condition every row matches.
- Summary: "M of N settings match · C of K cells have a match".
- A "Top 50 matches" table (cell, setting, displayed metric, Net PnL, trades).
- Clicking a cell or a table row switches back to **Displayed grid** on that cell's
  best setting (outer slice, grid, controls) and selects the point, through the
  existing "show on Surface" focus path used by Candidates.
- The chosen scope is remembered per Experiment together with its filters.

## Data (stated up front)

Today the Surface loads only one outer slice. "All settings" needs every row, so on
first switch it sends one `GET .../results` request **without filters** and with
**only the columns it needs**: `arm`, grid, the view dimensions, the displayed
metric and the condition metrics (`return_pct` when Net PnL is derived). Columns
of separate responses are never joined by row index: a metric added later
re-requests the whole needed set in one response. Data is dropped on reload or
after run deletion. Rows are evaluated column-wise, without building
one object per row. Nothing is requested until the user picks "All settings".

Expected cost: about the size of a few slices. For the largest Surface (≈3M rows)
this is a heavy request; if it proves too slow, the follow-up is a server-side
filter endpoint (not in this change).

## Non-Goals

- Backend or manifest changes; HTML artifacts.
- Selection and run deletion in "All settings" (the selection bar is hidden there;
  it stays on the displayed grid only).
- Equity panel in "All settings" (hidden; it returns after a jump).
- Aggregate views (`aggregate_over`): the switch applies to the cells view.

## Capabilities

### New Capabilities

- `research-workbench-filter-scope-v1`

### Modified Capabilities

- None. `research-workbench-surface-view-v1` filters keep their meaning under
  "Displayed grid".

## Impact

`src/features/surface` (scope state, all-settings evaluation in `model.ts`, a
loader for the column subset, an all-settings heat map and match table, Filters
panel switch), tests with mocked responses. No backend change.
