## 1. Candidate association and loading

- [x] 1.1 Add a pure catalog-file association helper that indexes only non-duplicate candidate Runtime files with stored run-request specs and marks repeated file keys ambiguous.
- [x] 1.2 Load `listCandidates()` in parallel with each existing Runtime catalog load, guard it with the dashboard generation, clear enrichment on failure, and leave the ten-second trade-state loader unchanged.
- [x] 1.3 Add tests for exact file association, absent/ambiguous/spec-less candidates, independent Candidates failure, explicit reloads and ignored late responses.

## 2. Stored strategy summary formatter

- [x] 2.1 Add a pure Runtime presentation module for compact instrument and deterministic decimal/token formatting from stored candidate coordinates and `strategy_spec_snapshot.spec` only.
- [x] 2.2 Add an explicit component vocabulary separating summary recognizers from known non-displayed baseline components; return `unsupported` for every other `component_id` or malformed required known shape.
- [x] 2.3 Implement narrow recognizers for geometry, initial SL/fixed TP, ADX-controlled trailing, ADX break-even, initial-R TD and inclusive episode touch cap, with the specified ordering and no partial-summary path.
- [x] 2.4 Add fixture-based unit tests for the agreed ETH/SOL labels, decimal commas, every supported recognizer, the non-displayed allowlist, combined BE/TD/touch cases, malformed input, unknown components, no thrown exception and changed current meaning that must be ignored.

## 3. Existing-card integration

- [x] 3.1 Use the generated summary, exact `Неизвестная спецификация` unsupported label, or existing file-name fallback in the current `rt-name` element and add the deployment file name as its tooltip without adding markup rows or CSS.
- [x] 3.2 Preserve file-based operational names in accessible controls, delete/switch/command dialogs, selection and chart props; add component assertions for per-card unsupported isolation, unchanged card structure and actions.

## 4. Verification and scope guard

- [x] 4.1 Run focused formatter, Candidates API and Runtime Dashboard tests, then the repository typecheck/lint/test gate and `openspec validate runtime-dashboard-strategy-summary-v1 --strict`.
- [x] 4.2 Review the final diff to confirm no backend contract, Surface, chart, stylesheet, polling timer or unrelated pre-existing working-tree file was changed or staged by this work.
