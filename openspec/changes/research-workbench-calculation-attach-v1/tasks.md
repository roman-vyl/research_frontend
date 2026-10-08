## 1. research_frontend

- [ ] 1.1 On 409 `job_running` from `calculate-plan` or `calculate` with `details.job_id`: show "A calculation is already running, please wait" and poll that job with the existing progress and result view (Cancel, result, reload).
- [ ] 1.2 Status 404 for the attached job: say that a calculation of another Experiment is running; no progress shown.
- [ ] 1.3 After the attached job ends: "New plan" requests a plan for the current selection.
- [ ] 1.4 Tests (mocked API): attach from plan 409 and from calculate 409, progress, cancel, result and reload; other-Experiment 404; new plan after the end.

## 2. Manual check (owner)

- [ ] 2.1 Start a calculation, close the dialog, press Calculate again: the running job shows with its counts until it ends.
