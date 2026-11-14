## ADDED Requirements

### Requirement: Runtime cards show stored strategy characteristics when a candidate matches

On every Runtime Dashboard catalog load, the Workbench SHALL also request the existing Candidates list. A Runtime strategy SHALL match a candidate only when exactly one candidate has a non-duplicate `current.runtime.file` equal to that Runtime entry's `source_path` and has a stored `strategy_spec_snapshot` whose source is `run_request`. The card SHALL derive its short strategy summary only from the Runtime instrument, that candidate's stored coordinates and that stored strategy-spec snapshot; current Surface values, current metrics and strategy recalculation SHALL NOT be used.

The summary SHALL use the card's existing primary-name place and SHALL order recognized parts as: compact instrument, `width/lookback`, `SL`, `TP`, managed-policy characteristics, touch cap. The first supported vocabulary SHALL present initial-R trailing as `TD <trigger>/<distance>R`, an ADX-controlled trail as `ADX <timeframe> Δ<threshold> · D <distance>R`, ADX-controlled break-even as `BE по ADX <timeframe> Δ<threshold>`, and the inclusive episode touch limit as `касания ≤<maximum>`. Decimal values SHALL omit unnecessary trailing zeros and use a decimal comma. The frontend SHALL only format explicitly stored values and SHALL NOT evaluate conditions, convert units or infer missing strategy rules. The formatter SHALL distinguish known components that intentionally contribute no short token from an unsupported `component_id`; it SHALL NOT silently omit an unsupported component and present the remainder as a complete summary.

#### Scenario: Fixed take and trailing distance

- **GIVEN** Runtime lists `ETHUSDT.P` from a file matched to one candidate
- **AND** the candidate stores coordinates `width=7`, `lookback=170`, `sl=4.75`, `tp_ratio=4`, `td_trigger_r=3`, `td_distance_r=0.75`
- **AND** its stored spec contains the corresponding initial stop, fixed take and `initial_r_trailing_stop`
- **WHEN** the card is rendered
- **THEN** its primary label is `ETH · 7/170 · SL 4,75 · TP 4 · TD 3/0,75R`.

#### Scenario: ADX break-even followed by ordinary trailing

- **GIVEN** a matched `SOLUSDT.P` candidate stores `width=4`, `lookback=240`, `sl=6`, `tp_ratio=6`, `td_trigger_r=4.5` and `td_distance_r=1`
- **AND** its stored spec explicitly contains ADX 15m activation at delta 23.5 for `break_even_stop` and the corresponding initial-R trailing rule
- **WHEN** the card is rendered
- **THEN** its primary label is `SOL · 4/240 · SL 6 · TP 6 · BE по ADX 15m Δ23,5 · TD 4,5/1R`.

#### Scenario: Touch cap is included

- **GIVEN** a matched candidate's stored spec contains an inclusive episode `touch_number` upper bound of 2
- **WHEN** the summary is built
- **THEN** it ends with `касания ≤2`.

#### Scenario: Historical snapshot remains authoritative

- **GIVEN** a candidate's current row is `changed`, `missing` or has current meaning values different from its stored snapshot
- **WHEN** its Runtime card summary is built
- **THEN** the summary uses the stored coordinates and stored run-request spec that were exported, not the current row values.

#### Scenario: Unsupported component makes the specification explicit

- **GIVEN** a matched stored spec contains a `component_id` that is neither a supported summary component nor an explicitly supported non-displayed component
- **WHEN** the summary is built
- **THEN** the card's primary label is `Неизвестная спецификация`
- **AND** no partial strategy summary is shown
- **AND** no strategy rule is inferred for that component.

#### Scenario: Malformed known component makes the specification explicit

- **GIVEN** a matched stored spec names a known summary component but lacks a required stored field or has an invalid field type
- **WHEN** the summary is built
- **THEN** the card's primary label is `Неизвестная спецификация`
- **AND** the dashboard and the other cards continue rendering.

### Requirement: Strategy summary enrichment fails safely

The existing deployment file name without `.json` SHALL remain the card label when there is no matching candidate, more than one candidate matches the same file, the candidate has no stored run-request spec, or the Candidates request fails. When a candidate and stored snapshot match but that snapshot cannot be safely recognized, the card SHALL instead show `Неизвестная спецификация`; this explicit label SHALL NOT be used for absence or network failure. Neither a failed Candidates request nor an unsupported or malformed snapshot SHALL turn a successful Runtime catalog load into an error. The deployment file name SHALL remain available as the generated summary or unknown-specification label's tooltip, and existing strategy ids, metadata, accessible control names, confirmation text and mutation behavior SHALL continue to use their existing operational identity.

#### Scenario: No candidate for a manually deployed file

- **WHEN** Runtime lists `manual-eth.json` and no candidate names that catalog file
- **THEN** the card keeps the primary label `manual-eth`.

#### Scenario: Ambiguous association

- **WHEN** two candidate records identify the same Runtime file
- **THEN** neither is selected and the card keeps its file-name label.

#### Scenario: Candidates is unavailable

- **GIVEN** the Runtime catalog request succeeds
- **WHEN** the Candidates request fails
- **THEN** all Runtime cards render with their existing file-name labels
- **AND** the dashboard does not show a Runtime loading or error state because of that failure.

#### Scenario: One unsupported snapshot is isolated

- **GIVEN** Runtime lists several strategies with matched candidates
- **AND** one stored snapshot is unsupported while the others are recognized
- **WHEN** the cards render
- **THEN** only that card shows `Неизвестная спецификация`
- **AND** the other cards show their generated summaries
- **AND** all cards retain their controls and actions.

#### Scenario: File identity remains available

- **WHEN** a card shows a generated strategy summary or `Неизвестная спецификация`
- **THEN** hovering its primary label exposes the deployment file name
- **AND** its switch, delete and command confirmations retain the same operational strategy identity as before this change.

### Requirement: Candidate summaries follow catalog reloads without new polling

The Candidates list SHALL be requested when the Runtime catalog is loaded on opening the tab, Refresh, Retry and the existing post-mutation reload path. The existing ten-second trade-state refresh SHALL NOT request Candidates, and this change SHALL introduce no timer or polling of its own. A late Candidates response from an obsolete dashboard load SHALL be ignored under the same generation rule as the Runtime list.

#### Scenario: Explicit refresh

- **WHEN** the user presses Refresh
- **THEN** one Runtime catalog request and one Candidates request are sent for that load.

#### Scenario: Trade-state refresh

- **WHEN** the ten-second Runtime trade-state refresh runs
- **THEN** it does not request the Candidates list.

#### Scenario: Late candidate response

- **WHEN** a newer dashboard load starts before an earlier Candidates request completes
- **THEN** the earlier response does not replace the candidate association used by the newer load.

### Requirement: Strategy summaries do not redesign Runtime cards

This change SHALL reuse the current primary-name slot and SHALL NOT add a card row, control, popup, details panel, CSS rule or layout state. It SHALL NOT change the chart, selection, Runtime state marks or action placement.

#### Scenario: Matched summary in the existing card

- **WHEN** a generated summary is displayed
- **THEN** the card has the same structural rows and controls as a fallback card
- **AND** only the text and tooltip of the existing primary-name element differ.
