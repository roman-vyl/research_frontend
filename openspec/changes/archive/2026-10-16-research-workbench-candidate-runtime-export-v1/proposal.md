## Why

Research Service can write a starred candidate's stored strategy spec into the
Strategy Runtime catalog as a new, switched-off deployment file
(`POST /api/research/candidates/{candidate_id}/runtime-export`) and reports the
file's presence in `current.runtime` of the candidate list
(`research-candidate-runtime-export-v1`, deployed). The Candidates tab has no way to
use it, and its current requirements forbid any deployment action.

## What Changes

- A **To Runtime** action in the candidate row's action group. It opens the
  existing modal dialog pattern (as in run deletion) that names the file Research
  will create and says it is created switched off (`enabled: false`) and that
  Research does not change it afterwards. Confirming sends the export request, with
  no body; on success the candidate list is loaded again.
- A catalog mark on the row from `current.runtime` only: **In Runtime catalog · Off**
  or **In Runtime catalog · On** (file name in the tooltip), or a duplicate warning
  with the file names. The mark states that a file with that `enabled` value exists in
  the catalog directory. It never says the strategy is loaded, running, active or
  trading.
- An already exported candidate (any file with its Runtime identity in the catalog)
  cannot be exported again from the tab; the action is disabled with the reason.
- Export errors are shown through the existing `ApiError` path, by the backend
  error code.
- **Modified requirement** of `research-workbench-candidates-v1`: "Spec snapshot is
  historical" no longer says the tab offers no deployment action at all; the only
  allowed one is this create-only export of a switched-off deployment.

## Out of scope

Switching `enabled`, editing or deleting a deployment, a Live tab, reading Runtime
state, new API routes, and any change to Research Service, Strategy Runtime, ABI or
the stack.

## Impact

`research_frontend` only: the candidates API types and client, the candidates store,
`CandidatesPanel`, and tests. Depends on the deployed Research Service route and
`current.runtime`.
