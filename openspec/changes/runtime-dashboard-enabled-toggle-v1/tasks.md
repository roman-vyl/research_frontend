## 1. research_frontend

- [ ] 1.1 `setRuntimeStrategyEnabled(id, enabled)` in `src/api/runtime.ts`: `PUT`, typed `200` body, typed error with the Runtime reason; the `enabled` doc comment says: the value in the deployment file, changed through Runtime's enabled route.
- [ ] 1.2 Switch in each card beside the select button, busy handling per D4, list refetch on `200`.
- [ ] 1.3 Reason-to-text table and the alert dialog per D3.
- [ ] 1.4 Tests:
  - disable and enable happy paths (one PUT, body, refetch);
  - every reason text including `file_changed`, `write_failed`, `strategy_instance_not_found`, `catalog_unavailable`; unknown reason and non-refusal bodies; network failure; card keeps state, no refetch on refusal;
  - busy blocks a second click on the same card only;
  - switch role, aria-checked, accessible name; dialog role, OK and Esc, focus return;
  - the static guard test allows the PUT only at that path and still forbids polling.
- [ ] 1.5 `npm test`, typecheck, lint, `openspec validate --all --strict` green.

## 2. Rollout (on owner's word only)

- [ ] 2.1 PR and merge only on the owner's word, after the Runtime route (strategy_runtime #30) and the writable mount (bbb_stack #60) are deployed.
- [ ] 2.2 On the Mac demo: switch an idle strategy off and on; try an open position and see the dialog.
