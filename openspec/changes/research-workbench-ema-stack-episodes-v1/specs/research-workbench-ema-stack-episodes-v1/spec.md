## ADDED Requirements

### Requirement: Episode history from Research Service

The Workbench SHALL read EMA stack episodes only from `POST /api/market/ema-stack-episodes/history` and
SHALL NOT compute, derive or reshape any episode, zone, false break, wave, touch number or phase.

#### Scenario: Chart opens

- **WHEN** the Chart tab shows a run
- **THEN** the Workbench SHALL request the episode history of the run's ticker and chart timeframe for
  both sides
- **AND** every value it shows SHALL be a field of the response.

### Requirement: Whole history in pinned pages

The Workbench SHALL request page 1 without a pin and then every next page with
`expected_market_data_hash` equal to page 1's `market_data_hash`, following `next_before_start_ms`
until it is null. On HTTP 409 `market_data_version_changed` it SHALL start again from page 1.

#### Scenario: Data changed while paging

- **WHEN** page 2 answers 409 `market_data_version_changed`
- **THEN** the Workbench SHALL request page 1 again without a pin and page again from it.

### Requirement: Session cache

Loaded histories SHALL be kept for the session per ticker, timeframe, episode parameters and side.
Finished episodes SHALL be identified by `start_ms`.

#### Scenario: Same market and parameters again

- **WHEN** another run with the same ticker, timeframe and episode parameters is shown
- **THEN** the Workbench SHALL use the kept history without a request.

### Requirement: Current episode refresh

After each candle boundary of the chart timeframe the Workbench SHALL request page 1 again without a
pin, replace `current` and add finished episodes it does not have, keeping the ones it has.

#### Scenario: Episode finished

- **WHEN** the current episode breaks and page 1 returns it as finished
- **THEN** it SHALL be added by its start and `current` SHALL be the new value or null.

### Requirement: Episode parameters

The parameters SHALL be the strategy's `ema_stack_episode` section when present, otherwise the
`anchor_stack` periods without window keys.

#### Scenario: Strategy without the section

- **WHEN** the strategy has `anchor_stack` 200/500/1000 and no `ema_stack_episode`
- **THEN** the request SHALL carry `fast_period` 200, `anchor_period` 500, `slow_period` 1000 and no
  `window_bars`.

### Requirement: Chart layers

The chart SHALL draw, under the strategy's trades, the episode band, the touch zones with their
numbers, the false breaks with depth and outcome, the waves origin → peak → touch and the forming wave,
each switchable, for LONG, SHORT or both.

#### Scenario: Layer switched off

- **WHEN** the user switches off false breaks
- **THEN** no false break SHALL be drawn and the other layers SHALL stay.

### Requirement: Episode lanes

The chart SHALL show a lane per side with the phase of every visible bar taken from the zone and
false-break intervals of the loaded episodes.

#### Scenario: Bar in a zone

- **WHEN** a bar lies inside zone 2 of a long episode
- **THEN** the LONG lane SHALL mark it as in zone.

### Requirement: Episode on a bar and touches table

The Bar Inspector SHALL show, per side, the episode, zone, false break and wave that contain the
selected bar. A table SHALL list the touches of that episode (or the current one) with Engine's fields;
a row click SHALL highlight its zone, false break and wave.

#### Scenario: Bar outside episodes

- **WHEN** the selected bar is in no episode of a side
- **THEN** the inspector SHALL say there is no episode on that side.
