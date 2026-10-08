## Why

A calculation job keeps running after its dialog is closed, but the Workbench cannot show it again. Pressing "Calculate" while it runs only shows the 409 `job_running` message, so the owner cannot see progress or the result without reading logs.

## What Changes

- When `calculate-plan` or `calculate` answers 409 `job_running` with the running `job_id`, the dialog says "A calculation is already running, please wait". It then attaches to that job and shows the same progress view as before: counts by outcome (Pending, Published, Parity failed, Engine failed, Stale, Cancelled), "Cancel job", and on the end the result, the backup and the slice reload.
- After the attached job ends, the dialog offers "New plan" for the current selection.
- If the running job belongs to another Experiment, its status route answers 404 for this Experiment. The dialog then only says that a calculation of another Experiment is running and offers "New plan".

## Non-Goals

- Showing a job that already finished while no dialog was open: the backend keeps no list of jobs, and job status lives in memory only.
- Any backend change.

## Impact

`src/features/surface/RunCalculation.tsx` and its tests.
