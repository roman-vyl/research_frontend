## ADDED Requirements

### Requirement: Calculate availability

The selection bar SHALL show a "Calculate (N)" action. It SHALL be disabled with the
hint "This Surface cannot be calculated: no materialize in the manifest" when the
Experiment manifest has no `materialize` block, and disabled when N is 0 or greater
than 2 000.

#### Scenario: Surface without materialize

- **WHEN** the manifest has no `materialize` and cells are selected
- **THEN** "Calculate" is disabled and the hint is shown.

#### Scenario: Too many rows

- **WHEN** the selection has 2 001 rows without a run
- **THEN** "Calculate" is disabled and says that at most 2 000 rows can be calculated at once.

### Requirement: Rows of a selection for Calculate

N SHALL be the number of rows without `run_id` behind the selected cells in the
current slice and controls. For each such row the request SHALL carry `coords` with
every dimension id of `result_schema` and the row's value in the active grid, plus
`grid` when a dimension has grids and `arm` when the schema has arms. Rows with
`run_id` SHALL NOT be sent and SHALL be counted as "has run". Rows without a value
for a dimension SHALL NOT be sent and SHALL be counted as "not addressable".

#### Scenario: Aggregated cell

- **WHEN** a selected cell stands for three rows, one of them with `run_id`
- **THEN** two `coords` are sent and the bar shows one row with a run.

### Requirement: Plan before calculation

"Calculate" SHALL first call `calculate-plan` and show the calculable count, the
skipped rows grouped by reason and the rule that a row is published only when the
Engine reproduces its stored metrics, otherwise it stays unchanged. `calculate` SHALL
be sent only after the user presses "Calculate" in the dialog, with the plan's
`plan_token`, and only when the calculable count is greater than 0.

#### Scenario: Stale plan

- **WHEN** `calculate` answers 409 `plan_stale`
- **THEN** no job is started and the dialog offers to request a new plan.

#### Scenario: Job already running

- **WHEN** `calculate` answers 409 `job_running`
- **THEN** the dialog shows the message and no new job is started.

### Requirement: Job progress and cancel

While the job runs the dialog SHALL poll its status every 2 s, show the counts by
outcome and offer "Cancel", which calls the cancel route. Polling SHALL stop when the
state is `completed`, `cancelled` or `failed`. Closing the dialog SHALL NOT cancel the
job and the dialog SHALL say so.

#### Scenario: Cancel

- **WHEN** the user presses "Cancel" during a job
- **THEN** the cancel route is called and the final counts show the cancelled rows.

### Requirement: Result and reload

When the job ends the dialog SHALL show the counts of published, parity failed,
Engine failed, stale and cancelled rows, for each parity-failed row the differing
metrics with expected and actual values, and the backup name when a backup was made.
The selection SHALL be cleared. When at least one row was published the slice SHALL be
reloaded, and published points SHALL offer "Open run".

#### Scenario: Partly published

- **WHEN** a job ends with 3 published and 2 parity failed rows
- **THEN** the slice is reloaded, the 3 points offer "Open run" and the 2 keep their values and the hint "no full run".

### Requirement: No run list request for Calculate

Calculate, its polling and the reload after it SHALL NOT call `GET /api/research/runs`.

#### Scenario: Request log

- **WHEN** a calculation completes in a test with mocked fetch
- **THEN** no request to `/api/research/runs` was made.
