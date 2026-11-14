## Why

Runtime Dashboard cards currently lead with deployment file names, so strategies that differ by setup geometry, protection and managed exits are difficult to distinguish at a glance. The existing Candidates response already carries the exported file association, stored coordinates and the exact historical strategy-spec snapshot, so the frontend can present those facts without recalculating a strategy.

## What Changes

- Load the existing Candidates list together with the Runtime catalog on dashboard load and explicit reloads.
- Match a Runtime entry to exactly one candidate through Runtime `source_path` and the candidate's non-duplicate `current.runtime.file`; no match or an ambiguous match falls back to the current file-name label.
- Build a deterministic short summary from Runtime instrument identity, the candidate's stored coordinates and its stored `strategy_spec_snapshot.spec`. Current Surface values and metrics are not inputs.
- Support the agreed first vocabulary, in fixed order: compact instrument; `width/lookback`; `SL`; `TP`; ADX activation and distance; TD trigger/distance; ADX break-even; touch cap. Examples include `ETH · 7/290 · SL 5 · TP 5 · TD 3,75/2R · касания ≤2` and `SOL · 4/240 · SL 6 · TP 6 · BE по ADX 15m Δ23,5 · TD 4,5/1R`.
- Recognize only explicit stable component/field shapes. A matched snapshot with an unsupported `component_id` or a malformed known component is labelled `Неизвестная спецификация` rather than rendered as a misleading partial summary; the frontend does not execute strategy rules or derive trading values.
- Put the summary in the card's existing primary-name slot; keep the deployment file available as the tooltip and keep existing operational identity, controls and dialogs unchanged. No card-layout or CSS redesign is included.
- Treat both Candidates request failures and per-card formatter failures as non-fatal: Runtime cards still render, and one unsupported snapshot cannot break other cards or the dashboard.
- Do not change Research Service, Strategy Runtime, Strategy Engine, candidate export, strategy calculation or any backend contract.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `research-workbench-runtime-dashboard-v1`: Runtime cards gain an optional frontend-derived short strategy summary sourced from the matching candidate's stored facts, with deterministic fallback to the deployment file name.

## Impact

- Frontend only: Candidates API loading from Runtime Dashboard, a pure file join/summary formatter, the existing Runtime card title slot, and unit/component tests.
- No new endpoint, dependency, persistence, polling, layout or styling change.
- Existing unrelated Surface working-tree changes are outside this OpenSpec and must not be included in its implementation or commit.
