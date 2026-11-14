## Context

See `proposal.md` for motivation. Runtime Dashboard already loads Runtime catalog, trade-state and Journal data independently. Candidates already exposes three relevant facts without a backend change: the catalog association in `current.runtime`, canonical stored coordinates, and the historical `strategy_spec_snapshot` used by “To Runtime”. The card currently renders `source_path` without `.json` in one existing primary-name element.

The summary is presentation, not a general strategy-language interpreter. Its input may be absent, stale at the network level, ambiguous across candidate records, or contain strategy components newer than the frontend vocabulary. These cases must not weaken the Runtime Dashboard's existing operational function.

## Goals / Non-Goals

**Goals:**

- Produce deterministic, testable summaries for the agreed component vocabulary from exported stored facts.
- Keep the Runtime list usable independently of Candidates availability.
- Preserve deployment identity and the current card structure.

**Non-Goals:**

- Describing every Engine component or arbitrary JSON.
- Calculating indicator values, phase outcomes, prices, R conversions or strategy behavior.
- Editing candidates or deployment specs.
- Changing card dimensions, wrapping policy, CSS or responsive behavior.
- Adding a backend endpoint or changing either existing response.

## Decisions

### 1. Candidate loading joins the existing dashboard load generation

`listCandidates()` runs alongside the Runtime catalog request whenever the dashboard's existing full `load()` path runs. Its result is kept in summary-specific state guarded by the same load generation. Failure sets enrichment unavailable for that generation and leaves the successful Runtime result untouched. The ten-second state-only loader remains unchanged.

Alternative considered: load Candidates only after Runtime succeeds. Rejected because it adds avoidable latency and produces an extra intermediate card relabel after a sequential network round trip.

### 2. Match by catalog file association, never by candidate id or strategy id

Build an index from candidates whose `current.runtime` is exactly `{present: true, file, enabled}` and whose stored spec source is `run_request`. Match that `file` to Runtime `source_path` using the catalog-relative path value returned by the two APIs. Duplicate candidate keys are marked ambiguous rather than resolved by list order. Candidate ids, strategy instance ids and spec equality are not fallback joins.

This uses the association the backend already owns. Inferring from ids or comparing large JSON specs in the browser would duplicate producer identity rules and could silently choose the wrong historical record.

### 3. Separate association from a pure summary formatter

A small Runtime-owned presentation module receives one Runtime instance and one matched Candidate and returns a discriminated result: a complete summary or `unsupported`. Absence of a usable candidate remains outside the formatter and selects the file-name fallback. The module has no React, network, store or chart dependency. The card therefore chooses generated text for `summary`, `Неизвестная спецификация` for `unsupported`, and `cardName(source_path)` when association/enrichment is absent.

The formatter uses:

- Runtime `instrument` for the compact market token (`ETHUSDT.P` → `ETH`, `SOLUSDT.P` → `SOL`; an unrecognized instrument remains unchanged);
- stored candidate coordinates for the selected `width`, `lookback`, `sl`, `tp_ratio`, `td_trigger_r` and `td_distance_r` values;
- stored strategy spec to confirm that optional semantics are actually present and to read explicit ADX timeframe/delta, stop-management kind and inclusive touch bound.

It does not read `current.meaning`, current metrics, manifests or current Surface rows. Coordinates provide the selected surface values; the snapshot confirms the deployed semantic shape. An optional semantic component that is genuinely absent contributes no token; a present component with an unknown id or malformed required shape makes the whole matched snapshot `unsupported`.

Alternative considered: render `current.meaning.coords` directly. Rejected because current meaning can change or disappear while the Runtime file still contains the historical exported snapshot.

### 4. Validate component vocabulary before formatting in a fixed order

Before emitting text, the formatter walks the stored component-bearing collections and classifies every `component_id` against an explicit V1 vocabulary. The vocabulary has two sets: summary components with narrow recognizers, and known baseline components that are valid but intentionally not displayed (for example the established direction, setup, trigger, risk and vote components present in the exported candidate fixtures). A component outside both sets returns `unsupported`. A known summary component with missing or invalid required fields also returns `unsupported`. Extra fields on a known component do not themselves make it unsupported.

This validation prevents a partial label from looking complete when the strategy has gained new behavior. It is still not a general strategy interpreter: the allowlist says only that a known component is safe to ignore for this short view.

After validation, the formatter runs narrow recognizers for stable stored shapes in this order:

1. base geometry: `width/lookback`;
2. initial ATR stop and fixed TP corresponding to `sl` and `tp_ratio`;
3. an ADX phase predicate paired with `initial_r_trailing_stop` → `ADX … Δ… · D …R`;
4. an ADX phase predicate paired with `break_even_stop` → `BE по ADX … Δ…`;
5. an MFE/runner activation paired with `initial_r_trailing_stop` → `TD …/…R`;
6. an inclusive episode `touch_number` maximum → `касания ≤…`.

Recognizers emit tokens only when every required stored field is present and finite. If ADX break-even and ordinary TD coexist, break-even is emitted before TD. A summary is useful only when compact instrument, geometry and initial protection are all available; a matched snapshot that cannot produce those required tokens returns `unsupported` rather than a partial label.

Alternative considered: silently omit unknown components or show their raw coordinate labels. Rejected because either result could present an incomplete strategy as fully described and would suggest semantics the formatter has not verified in the deployed snapshot.

### 5. Formatting is deterministic and display-only

Numbers are parsed only as finite stored numeric values, rendered without unnecessary trailing zeros, and use a decimal comma. No multiplication, division, timeframe conversion or unit conversion is allowed. Token order and separators are fixed (` · `), so identical stored facts produce identical text.

The existing primary-name element receives the generated text or `Неизвестная спецификация` and a `title` containing the deployment file name. Formatter entrypoints fail closed: malformed JSON-like input is converted to `unsupported`, never allowed to throw through card rendering. Existing action labels and dialogs continue to call the file-name helper; the presentation label never becomes an operational identifier. No CSS or markup row is added.

### 6. Tests prove boundaries as well as examples

Pure tests cover every recognizer, decimal formatting, the known non-displayed allowlist, unsupported and malformed components, historical-versus-current data and ambiguous joins. Runtime Dashboard component tests cover per-card failure isolation, parallel loading, fallback on Candidates failure, refresh/generation behavior, absence of candidate polling, tooltip/file identity and unchanged card structure/actions.

Static review of the diff confirms no changes to backend contracts, Surface layout/state, Runtime API mutation code, chart code or stylesheets.

## Risks / Trade-offs

- **[Risk] A producer changes a recognized strategy-spec shape or adds a component.** → The matched card explicitly shows `Неизвестная спецификация`; contract tests use representative stored snapshots and ensure no exception escapes rendering.
- **[Risk] Two candidates reference one catalog file.** → Treat the key as ambiguous and retain the file name; never pick by order.
- **[Risk] Candidate data fails while Runtime is healthy.** → Enrichment is optional and has no effect on Runtime load/error state.
- **[Trade-off] Manually deployed or unstarred strategies retain opaque file names.** → This avoids inventing a second spec-discovery backend and keeps the change frontend-only.
- **[Trade-off] The explicit component allowlist requires maintenance as Engine vocabulary grows.** → Add new displayed or intentionally non-displayed component ids through reviewed vocabulary changes; never fall back to partial or generic JSON prose.

## Migration Plan

No data or API migration is required. Deploy as a frontend release. Rollback restores file-name labels; Runtime files, candidates and backend state are unchanged.
