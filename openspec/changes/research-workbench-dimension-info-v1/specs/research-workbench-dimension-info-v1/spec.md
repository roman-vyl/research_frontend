## ADDED Requirements

### Requirement: Dimension information popup
A manifest dimension MAY declare an `info` block (`title`, optional `notes`, optional `tables` of
text cells with optional per-row `details`). For every dimension with a valid `info` the Surface
controls SHALL show an "i" button next to the control label; pressing it SHALL open a popup that
shows the title, the notes and the tables as given, without formatting or computing any value.
A dimension without `info`, or with an `info` of the wrong shape, SHALL show no button and SHALL work
as before.

#### Scenario: Vote switch with info
- **WHEN** the manifest gives `vote_threshold` an `info` block and the user presses its "i" button
- **THEN** a popup shows the block's title, notes and the voters table

#### Scenario: Dimension without info
- **WHEN** a dimension has no `info`
- **THEN** its control has no "i" button

#### Scenario: Malformed info
- **WHEN** `info` is not an object with a text `title`
- **THEN** no button is shown and the controls work as before

### Requirement: Popup behaviour
The popup SHALL close on its close button, on the "i" button, on Esc and on a click outside it; only
one popup SHALL be open at a time. A table row with `details` SHALL expand under the row on click and
collapse on a second click. Opening, using or closing the popup SHALL NOT change the view, the
selected cell, the selection, the filters or the saved session. The "i" button SHALL work whether an
optional dimension is switched on or off.

#### Scenario: Full ladder
- **WHEN** the user clicks a voter row that has `details`
- **THEN** the ladder lines appear under the row, and a second click hides them

#### Scenario: Close with Esc
- **WHEN** the popup is open and the user presses Esc
- **THEN** the popup closes and the view is unchanged

#### Scenario: Info of a switched-off vote
- **WHEN** the own-table switch is off and the user presses its "i" button
- **THEN** the popup opens and the switch stays off

### Requirement: Vote info content from collected data
The `info` blocks of the vote switches SHALL be produced by a converter from the collected
`vote_info.json` without recalculation: `vote_threshold` from `frozen_v3`, `own_vote_threshold` from
the coin's own table. Each block SHALL state the blocking rules (sum ≥ 0.75, one veto blocks, max
inside B1 and B2, weight cap) and the base stop share; own tables SHALL be marked in-sample.

#### Scenario: Frozen v3 window
- **WHEN** the converter runs for `frozen_v3`
- **THEN** the block title is the table's title and the notes list the blocking rules and the base stop share 79.4%

### Requirement: One row per voter
Each vote block SHALL have one row per voter with block, metric, side, the threshold and weight
where voting starts, the threshold and weight at the edge, the number of steps and the veto
(threshold and trades cut, or "нет"); the full ladder SHALL be the row's `details`. Values SHALL be
printed as stored, without rounding.

#### Scenario: BTC own table
- **WHEN** the converter runs on `vote_info.json` for `btc`
- **THEN** the A1 row reads side "режет ≤", start 0.79 → 0.029, edge -0.051 → 0.333, 23 steps, veto -0.18 (18 сделок)

#### Scenario: Veto-only voter
- **WHEN** a voter has an empty ladder and a veto (BTC C5 low: veto 0.024, 44 trades)
- **THEN** the voting columns show "—" and the veto column shows the veto

#### Scenario: Voter without veto
- **WHEN** a voter's veto is null
- **THEN** the veto column shows "нет"
