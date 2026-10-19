## Why

The vote surfaces (BTC, ETH, SOL, BNB, group "v3 · весовое голосование" and "Монеты: фикс TP/SL +
голосование") have two vote switches: the frozen v3 table (`vote_threshold`) and the coin's own
calibration (`own_vote_threshold`). Nothing on the screen says which voters and vetoes each switch
uses and at what cut thresholds. The owner asked for an "i" button next to the vote switches that
opens an information window with the voters and vetoes and their cut parameters.

## What Changes

- A manifest dimension MAY carry an `info` block: a title, short notes and tables of plain text
  cells. The Workbench draws an "i" button next to the label of every dimension that has one; the
  button opens a popup with that block. The Workbench does not know what a voter or a veto is: it
  draws whatever text the manifest gives.
- The content for the four vote surfaces is built from the already collected
  `vote_info.json` (frozen v3 and the own tables of BTC, ETH, SOL, BNB) by a small converter
  script, with no recalculation. Per switch the window shows: the rules (block at weight sum ≥
  0.75, one veto blocks, max weight inside B1 and B2, weight cap 0.333), the base stop share, one
  row per voter (block, metric, side, threshold where voting starts and its weight, threshold at the
  edge and its weight, number of steps, veto threshold and how many trades it cuts) and, on a click
  on the row, its full ladder of thresholds and weights.
- The own tables are marked in the window as in-sample (calibrated on the coin's own history).

## Out of Scope

Any recalculation of tables, weights or surfaces; info for the per-filter `f_*` sliders on SOL and
BNB; changes to Research Service (the manifest is served as stored and unknown dimension fields are
already ignored by its schema); the Runtime dashboard (thread "Trade Observatory", PR #27).

## Capabilities

### New Capabilities

- `research-workbench-dimension-info-v1`: an optional information popup for a surface control,
  declared in the manifest.

## Impact

- `research_frontend`: `src/api/experiments.ts` (type), `src/features/surface/SurfaceControls.tsx`,
  a new `DimensionInfo` popup component, `surface.css`, tests.
- `scripts/`: converter `vote_info.json` → `info` blocks (pure function, tested).
- Data on the Mac, a separate step only on the owner's word: the converter's output is written into
  the `info` of `vote_threshold` and `own_vote_threshold` in the four vote manifests, with a backup
  of each manifest; no rows change, no restart.
