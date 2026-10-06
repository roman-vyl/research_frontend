## Context

Selection, the selection bar and the delete dialog exist
(`research-workbench-run-deletion-v1`). The backend addresses a row by `coords`: every
dimension id of `result_schema` with the row's value, plus `grid` when a dimension has
grids and `arm` when the schema has arms (the same ids as the results filters). It
plans at most 2 000 rows, runs one job per Experiment at a time and keeps job status
in memory.

## Decisions

### D1. Rows, not cells

A selected cell can stand for several rows (aggregation, arms). Calculate sends one
`coords` per row without `run_id` behind the selected cells, built from that row's
values in the active grid. Rows with `run_id` are counted as "has run" and not sent.
Rows with no value for a dimension (an optional dimension switched off) cannot be
addressed and are counted as "not addressable", not sent.

### D2. Availability from the manifest only

The frontend checks only that `manifest.materialize` exists. Whether a row can be
calculated (template, bindings, market data) is decided by `calculate-plan`, and its
skip reasons are shown as they come. The frontend does not read the template.

### D3. Plain confirm, not a typed count

Delete removes files and needs a typed run count. Calculate never removes or changes
a row that fails the gate, and the backend backs up the table before the first
publish, so one "Calculate" button after the plan is enough.

### D4. Progress by polling while the dialog is open

The dialog polls the job status every 2 s and stops on `completed`, `cancelled` or
`failed`. Closing the dialog does not cancel the job; the dialog says so. A job id is
not kept across a page reload (no job list exists).

### D5. Reload after the job

When the job ends with at least one published row, the slice cache is dropped and the
slice reloaded, as after a deletion. Values of published rows change to the Engine
values within the parity tolerance; failed rows keep their values.

## Risks

- A second calculation on the same Experiment while one runs is refused with
  `409 job_running`; the dialog shows the message and the running job id.
