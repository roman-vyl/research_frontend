## 0. Dependency (separate research_service change, not part of this change)

- [x] 0.1 `GET /api/research/experiments/{experiment_id}/storage?size=cached|compute` as in `design.md` "Backend contract"; deployed on the stack.

## 1. research_frontend

- [x] 1.1 API: `fetchExperimentStorage(experimentId, size)` and its type.
- [x] 1.2 Picker cards: storage block, `size=cached`, at most two requests at a time, session cache by `experiment_id`, "…" / "—" / "size not computed yet".
- [x] 1.3 Opened Experiment: block under the title with `size=compute`, not blocking the heat map; missing runs shown.
- [x] 1.4 Drop the stored numbers of an Experiment after a run deletion (when `research-workbench-run-deletion-v1` is present).
- [x] 1.5 Tests (mocked API): replay surface shows 0 Engine runs, null size, compute on open then size on the card, only `cached` from the picker, failed request still opens, no request to `/api/research/runs`.

## 2. Manual check (owner)

- [ ] 2.1 On the stack: sizes in the cards after opening each Surface match `du -sh` within rounding.
