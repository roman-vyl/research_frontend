## MODIFIED Requirements

### Requirement: Episode parameters

The Workbench SHALL draw episodes only for a strategy whose spec declares `ema_stack_episode`. The parameters SHALL be Engine's effective `episode_params_by_ref` from `POST /api/research/strategies/{strategy_id}/feature-plan`, sent to the history route unchanged (without `history_bars`); the frontend SHALL NOT resolve, default or override any of them. With several refs the Workbench SHALL load nothing until the user chooses one. A spec without `ema_stack_episode` SHALL produce no episode request and no episode layers. The toolbar SHALL show `window_bars` and `break_bars` of the chosen ref as read-only text and SHALL have no input that changes them.

#### Scenario: Strategy without the section

- **WHEN** the strategy has `anchor_stack` 200/500/1000 and no `ema_stack_episode`
- **THEN** no history request SHALL be sent and no episode layer or episode control SHALL be shown.

#### Scenario: Section entry without parameters

- **WHEN** the spec declares `ema_stack_episode.trend` as `{}` and Engine's plan gives 200/500/1000, window 24, break 24
- **THEN** the history request SHALL carry exactly those values and the toolbar SHALL show window 24, break 24.

#### Scenario: Section with explicit values

- **WHEN** Engine's feature plan gives `episode_params_by_ref.trend` 500/1000/2000, window 12, break 12
- **THEN** the history request SHALL carry exactly those values and no `history_bars`.

#### Scenario: Several refs

- **WHEN** the strategy declares two episode refs
- **THEN** no history SHALL be requested until the user chooses one.

#### Scenario: No way to change the values

- **WHEN** the episode toolbar is shown
- **THEN** it SHALL contain no input for `window_bars` or `break_bars` and no reset button.

#### Scenario: Feature plan fails

- **WHEN** the feature-plan request fails
- **THEN** the existing error state SHALL be shown and no history request SHALL be sent.
