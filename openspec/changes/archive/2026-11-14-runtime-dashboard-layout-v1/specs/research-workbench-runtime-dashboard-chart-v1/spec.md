## MODIFIED Requirements

### Requirement: Loading, empty and error states
The panel SHALL show a prompt when nothing is selected, "Loading…" while data loads, an empty state when the window has no candles, and an error state with Retry when bounds or candles fail or the timeframe is not supported. The header SHALL show the selected strategy's presentation title, its deployment file as secondary identity, the market and the UTC time of the last bar. The presentation title SHALL NOT replace the file or instance identity used for selection, loading, actions or requests. A Refresh button SHALL always repeat the bounds request and then re-evaluate cache coverage; it SHALL request candles only for a missing range, if one exists. There SHALL be no automatic polling.

#### Scenario: Bounds fail
- **WHEN** the bounds request fails
- **THEN** the panel shows an error with Retry and makes no candles request

#### Scenario: Unsupported timeframe
- **WHEN** `base_timeframe` is not a supported timeframe
- **THEN** the panel shows the unsupported-timeframe message and makes no request

#### Scenario: Presentation title
- **WHEN** a selected card has a recognized stored-strategy summary
- **THEN** the chart header uses the same compact instrument/geometry heading
- **AND** shows the deployment file as secondary identity
- **AND** all chart data requests still use the selected instance's market fields

#### Scenario: Refresh
- **WHEN** the user presses Refresh
- **THEN** one bounds request is made and cache coverage is re-evaluated; candles are requested only for a missing range

#### Scenario: Refresh with unchanged latest bar
- **WHEN** the user presses Refresh and the latest committed bar is unchanged
- **THEN** one bounds request and zero candle requests are made

#### Scenario: Refresh after the stream advanced
- **WHEN** the user presses Refresh and the latest committed bar moved forward by 3 bars
- **THEN** one bounds request and one candle request for the tail only are made

#### Scenario: Half-open cache range to inclusive request
- **WHEN** a missing cache range `[fromMs, toMs)` is loaded
- **THEN** the request uses `from = fromMs` and `to_open_time_ms = toMs - tfMs`, and the exclusive boundary is never passed as `to_open_time_ms`

### Requirement: Look and layout
The chart panel SHALL use the Surface design tokens and follow the light and dark theme. From 1100px width the list and chart SHALL be side by side, the chart SHALL use the available desktop viewport height within bounded minimum and maximum heights, and it SHALL remain sticky while the strategy rail scrolls. Below that breakpoint the chart SHALL be under the list with a bounded compact height.

#### Scenario: Theme change
- **WHEN** the color scheme switches
- **THEN** the chart's grid, text and candle colors follow it

#### Scenario: Desktop chart area
- **WHEN** the Runtime Dashboard is displayed on a desktop viewport at least 1100px wide
- **THEN** the chart is side by side with the strategy rail
- **AND** its plotting area is taller than the former fixed 420px area when viewport height permits

#### Scenario: Narrow chart area
- **WHEN** the Runtime Dashboard is displayed below 1100px width
- **THEN** the chart is below the list
- **AND** its plotting area remains usable without forcing desktop viewport height assumptions
