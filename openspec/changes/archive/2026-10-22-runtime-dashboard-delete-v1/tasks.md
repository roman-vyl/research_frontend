## 1. research_frontend

- [x] 1.1 `deleteRuntimeStrategy(id)` in `src/api/runtime.ts`: `DELETE`, strict `200` body check per D6, typed error with the Runtime reason read only from a `delete_refused` body.
- [x] 1.2 Trash button in each card beside the switch, disabled for an enabled card, busy shared with the switch (D1, D3).
- [x] 1.3 Confirmation dialog (D2) and the refusal dialog with the reason texts (D5); refetch in place on `200` (D4).
- [x] 1.4 Tests: happy path (confirm, one `DELETE`, refetch, card gone, selection cleared); Cancel and Esc send nothing and return focus; button disabled for an enabled card; every reason text; unknown reason, non-refusal bodies and network failure; strict `200` body cases; no refetch on refusal; busy blocks only that card and covers the switch too; accessibility (button name, dialog roles, focus); the static guard allows exactly `GET`, the switch `PUT` and this `DELETE`.
- [x] 1.5 `npm test`, `tsc -b`, `openspec validate --all --strict` green.

## 2. Rollout (on owner's word only)

- [x] 2.1 PR and merge only on the owner's word, deploy after the Runtime change (`strategy_runtime`, `runtime-strategy-delete-v1`) is deployed.
  Done 2026-10-22: PR #35 squash-merged (638a0ec) after Runtime #33 was deployed.
- [ ] 2.2 On the Mac demo: delete a disabled idle strategy through the button; try with an open position and see the dialog.
  Observed 2026-10-22 16:49 UTC: the owner deleted a disabled strategy through the button and the file landed in `.deleted/`. Not yet checked by hand: the dialog for an open position.
