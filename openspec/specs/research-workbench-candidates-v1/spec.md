# research-workbench-candidates-v1 Specification

## Purpose
Let the Workbench user star Surface points as live-trading candidates and review the starred
points in one Candidates tab, backed by the Research Service shortlist.

## Requirements
### Requirement: Star a Surface point

The point details panel SHALL offer a star toggle. Starring SHALL send the
Experiment id and the point's coordinates (every dimension, plus `grid` and `arm`
when the schema has them) and SHALL NOT send a candidate id. Unstarring SHALL use
the `candidate_id` returned by the backend. Starred points of the visible slice
SHALL be marked on the heat map.

#### Scenario: Star a replay point

- **WHEN** the user stars a point without `run_id`
- **THEN** the request carries the point's coordinates only
- **AND** the cell shows a star mark.

#### Scenario: Ambiguous row

- **WHEN** the backend answers 409 `ambiguous_row`
- **THEN** the star stays off and the message is shown.

### Requirement: Candidates tab

The Workbench SHALL have a Candidates tab listing every shortlist record with a
one-line meaning, origin badge (`Engine run`, `replay only`, `no full run`), row
state badge (`changed`, `missing`, `ambiguous`), and the current metrics with Net
PnL in USDT first. Net PnL SHALL be the table's `net_pnl` or, when absent,
`return_pct` times the manifest's initial equity. For a `changed` row the snapshot
values SHALL be visible on demand.

#### Scenario: Ratio surface candidate

- **WHEN** a candidate from a table without `net_pnl` is listed
- **THEN** its Net PnL is the return times the initial equity, in USDT.

### Requirement: Metric range filters

The Candidates tab SHALL offer range filters over its metrics with the same
conditions as the Surface; Max DD SHALL compare drawdown depth regardless of sign.

#### Scenario: Max DD filter

- **WHEN** the user sets Max DD at most 20
- **THEN** candidates with drawdown deeper than 20 % are hidden.

### Requirement: Open on Chart

"Chart" SHALL select the candidate's current `run_id` with the existing run
selection and switch to the Chart tab. Without a current `run_id` it SHALL be
disabled with the hint "no full run".

#### Scenario: Run deleted

- **WHEN** the candidate's run was deleted
- **THEN** the candidate is still listed and "Chart" is disabled.

### Requirement: Open on Surface

"On Surface" SHALL switch to the Surface tab with the candidate's Experiment, the
slice and controls given by its coordinates, and its point selected. A point hidden
by active Surface filters SHALL still be selected with a hint. For a candidate
whose `row_state` is `missing` or `ambiguous`, "On Surface" SHALL be disabled with
a hint and SHALL NOT select any cell.

#### Scenario: Candidate in another slice

- **WHEN** the Surface shows another Experiment or SL slice
- **THEN** "On Surface" loads the candidate's Experiment and slice and selects its point.

#### Scenario: Ambiguous candidate

- **WHEN** a candidate is listed with `row_state` `ambiguous`
- **THEN** "On Surface" is disabled with the hint that several rows match
- **AND** no focus request is sent and the Surface selection is unchanged.

### Requirement: Spec snapshot is historical

When a record has a strategy spec snapshot, the details SHALL show it labelled as
the spec of the picked run at the time of the star, never as a current or
deployable specification. The tab SHALL offer no trading or deployment action.

#### Scenario: Changed candidate with a spec

- **WHEN** a `changed` candidate with a spec snapshot is expanded
- **THEN** the spec is shown with the historical label.

