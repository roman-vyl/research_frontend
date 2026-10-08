## MODIFIED Requirements

### Requirement: Plan before calculation

"Calculate" SHALL first call `calculate-plan` and show, from its response, Selected
(rows sent), Calculable, Has run (reason `has_run`) and Other skipped grouped by
reason, and the rule that a row is published only when the
Engine reproduces its stored metrics, otherwise it stays unchanged. `calculate` SHALL
be sent only after the user presses "Calculate" in the dialog, with the plan's
`plan_token`, and only when the calculable count is greater than 0. When
`calculate-plan` or `calculate` answers 409 `job_running`, the dialog SHALL say "A
calculation is already running, please wait" and SHALL attach to the running job
named in the error details, as required by "Attach to a running job".

#### Scenario: Plan counts

- **WHEN** 120 rows are sent and the plan returns 83 calculable, 31 `has_run` and 6 other skipped
- **THEN** the dialog shows Selected 120, Calculable 83, Has run 31, Other skipped 6.

#### Scenario: Stale plan

- **WHEN** `calculate` answers 409 `plan_stale`
- **THEN** no job is started and the dialog offers to request a new plan.

#### Scenario: Job already running

- **WHEN** `calculate-plan` answers 409 `job_running` with `job_id` in its details
- **THEN** no new job is started, the dialog says a calculation is already running and shows that job's progress.

## ADDED Requirements

### Requirement: Attach to a running job

An attached job SHALL be shown with the same progress and result view as a job the
dialog started: its status polled every 2 s, counts by outcome, "Cancel job", and on
the end the result, the backup, the cleared selection and, when a row was published,
the reloaded slice. When the job ends, the dialog SHALL offer "New plan" for the
current selection. When the job's status route answers 404 (a job of another
Experiment), the dialog SHALL say that a calculation of another Experiment is running
and SHALL offer "New plan", without progress.

#### Scenario: Reopened during a job

- **WHEN** a job runs, its dialog was closed, and the user presses "Calculate" again
- **THEN** the dialog shows "A calculation is already running, please wait" with the job's counts, and its result when it ends.

#### Scenario: Job of another Experiment

- **WHEN** the running job belongs to another Experiment and its status answers 404
- **THEN** the dialog says that a calculation of another Experiment is running and offers "New plan".
