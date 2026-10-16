## 1. Frontend

- [x] 1.1 `api/candidates.ts`: `CandidateRuntime` (null, `{present:false}`, `{present:true,file,enabled}`, `{present:true,duplicate:true,files}`) as `runtime?: CandidateRuntime | null` of `CandidateCurrent`; `RuntimeExportResult` (`candidate_id`, `file`, `strategy_instance_id`, `enabled`, `journal`).
- [x] 1.2 `api/client.ts`: `exportCandidateToRuntime(candidateId)`: `POST /api/research/candidates/{id}/runtime-export`, no body, no `Content-Type`.
- [x] 1.3 `candidates/store.ts`: `exportToRuntime(candidateId)` calls the client, then `loadCandidates()`, and returns the result.
- [x] 1.4 `CandidatesPanel`: "To Runtime" action with its enabled / disabled rules and tooltips; confirmation in the existing modal dialog pattern naming the candidate (the file name is shown from the response) and `enabled: false`; the action is blocked while the request is in flight.
- [x] 1.5 `CandidatesPanel`: catalog mark from `current.runtime` (Off / On, file name in the tooltip, duplicate warning with file names); no "running", "active", "live" or "loaded" wording anywhere in the tab.
- [x] 1.6 Errors through `ApiError` by `code`: `no_strategy_spec`, `runtime_duplicate` (file names from `details.files`), `runtime_file_exists`, `runtime_catalog_unconfigured`, `runtime_catalog_unavailable`, `runtime_export_busy`, `runtime_write_failed`, `runtime_publish_failed`, `runtime_invalid_name`; success with `journal: "failed"` shown as exported with a note.
- [x] 1.7 Tests (mocked API and a `fetch` test): the four `runtime` shapes, enabled / disabled rules, confirmation, the request without a body and the reload, in-flight lock, each error, `journal: "failed"`, and no forbidden wording.
- [x] 1.8 `npm test`, `npm run build`, `openspec validate --strict`.

## 2. Manual check (owner)

- [x] 2.1 (Archived before the check; done 2026-10-16 on the Mac stack at main 156e2ee, research-service e19a764: candidate `cand_b2707ef65373f7d260d3b6df` exported, one POST 201, row shows "In Runtime catalog · Off", "To Runtime" disabled, no second POST; file `enabled: false`, catalog of 33 files accepted by a one-shot Runtime container; the test file was then removed by the owner's decision.) On the Mac stack, export one candidate from the Candidates tab: the row shows "In Runtime catalog · Off" and "To Runtime" is disabled; the same candidate cannot be exported again.
