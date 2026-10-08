# research-workbench-run-calculation-v1 Specification

## Purpose
Calculate Engine runs from the Workbench Surface: a selection action available when the Experiment manifest has `materialize`, a server plan that decides which selected rows can be calculated, job progress with cancel, and the result with a reload of the slice.
## Requirements
### Requirement: Calculate availability

The selection bar SHALL show a "Calculate (N)" action. It SHALL be disabled with the
hint "This Surface cannot be calculated: no materialize in the manifest" when the
Experiment manifest has no `materialize` block, and disabled when N is 0 or greater
than 2 000.

#### Scenario: Surface without materialize

- **WHEN** the manifest has no `materialize` and cells are selected
- **THEN** "Calculate" is disabled and the hint is shown.

#### Scenario: Too many rows

- **WHEN** the selection has 2 001 addressable rows
- **THEN** "Calculate" is disabled and says that at most 2 000 rows can be calculated at once.

### Requirement: Rows of a selection for Calculate

N SHALL be the number of addressable rows behind the selected cells in the current
slice and controls, regardless of `run_id`. For each such row the request SHALL carry
`coords` with every dimension id of `result_schema` and the row's value in the active
grid, plus `grid` when a dimension has grids and `arm` when the schema has arms. The
frontend SHALL NOT decide calculability from `run_id`; it SHALL be taken only from the
`calculate-plan` response. Rows without a value for a dimension SHALL NOT be sent and
SHALL be counted as "not addressable". The 2 000 limit SHALL apply to the number of
`coords` sent.

#### Scenario: Aggregated cell

- **WHEN** a selected cell stands for three addressable rows, one of them with `run_id`
- **THEN** three `coords` are sent to `calculate-plan`.

#### Scenario: Row not addressable

- **WHEN** a selected row has no value for a dimension
- **THEN** it is not sent and is counted as "not addressable".

### Requirement: Plan before calculation

"Calculate" SHALL first call `calculate-plan` and show, from its response, Selected
(rows sent), Calculable, Has run (reason `has_run`) and Other skipped grouped by
reason, and the rule that a row is published only when the
Engine reproduces its stored metrics, otherwise it stays unchanged. `calculate` SHALL
be sent only after the user presses "Calculate" in the dialog, with the plan's
`plan_token`, and only when the calculable count is greater than 0.

#### Scenario: Plan counts

- **WHEN** 120 rows are sent and the plan returns 83 calculable, 31 `has_run` and 6 other skipped
- **THEN** the dialog shows Selected 120, Calculable 83, Has run 31, Other skipped 6.

#### Scenario: Stale plan

- **WHEN** `calculate` answers 409 `plan_stale`
- **THEN** no job is started and the dialog offers to request a new plan.

#### Scenario: Job already running

- **WHEN** `calculate-plan` or `calculate` answers 409 `job_running`
- **THEN** no new job is started; the dialog says a calculation is already running and
  follows the job named in `details.job_id` with the same progress, cancel and result
  view, then offers a new plan
- **AND** if that job belongs to another Experiment (status 404), the dialog says so
  and offers a new plan.

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

