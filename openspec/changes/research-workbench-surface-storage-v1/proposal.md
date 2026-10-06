## Why

The owner chooses which Surface to clean up by how much disk it takes and how many of
its points are real Engine runs. Neither is visible: a Surface card shows only the
ticker, anchor and title, and the Research API has no route that reports a Surface's
size or run counts. The only route that knows about runs, `GET /api/research/runs`,
reads and hashes every run folder (about 71 000) and must not be used.

## What Changes

- Each Experiment card in the Surface picker shows three numbers:
  - **Strategies**: rows in the Experiment's result table;
  - **Engine runs**: rows with a non-empty `run_id`;
  - **Size**: GB on disk of the Experiment's run folders plus its own folder.
- The opened Experiment shows the same block under its title. Opening a Surface is
  "choosing" it: this is the only place that asks the backend to compute the size.
  The picker shows the size only when the backend already has it; otherwise "size not
  computed yet". Counts are always shown.
- New API call to a new Research Service route (see Dependency); no other route is
  used for these numbers.

## Capabilities

### New Capabilities

- `research-workbench-surface-storage-v1`: storage block on Experiment cards and on
  the opened Experiment, and how it is loaded.

### Modified Capabilities

- None.

## Non-Goals

- Sizes per slice, per cell or per run; history of sizes; a disk usage page.
- Any call to `GET /api/research/runs`.
- Deleting anything (change `research-workbench-run-deletion-v1`).

## Dependency

Needs a **separate backend change in research_service** that adds
`GET /api/research/experiments/{experiment_id}/storage` (contract in `design.md`,
section "Backend contract"). This frontend change can be implemented with mocked
responses but cannot run against real data until that route is deployed.

## Impact

`src/api` (one call and type), the picker cards in `SurfaceView`, `SurfaceHeader`,
tests with mocked responses.
