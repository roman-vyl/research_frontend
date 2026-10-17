## ADDED Requirements

### Requirement: Strategy selection
The Runtime Dashboard SHALL let the user select one strategy card at a time. No strategy is
selected when the tab opens. Enabled and disabled strategies are both selectable.

#### Scenario: Select a strategy
- **WHEN** the user activates a strategy card
- **THEN** that card is marked selected (`aria-pressed="true"`) and no other card is

#### Scenario: Select another strategy
- **WHEN** a strategy is selected and the user activates a different card
- **THEN** the selection moves to the new card and the previous card is not marked

#### Scenario: Selection survives a list refresh
- **WHEN** the list is refreshed and the selected `strategy_instance_id` is still present
- **THEN** the same card stays selected and the chart is not reloaded

#### Scenario: Selected strategy disappears
- **WHEN** the list is refreshed and the selected `strategy_instance_id` is no longer present
- **THEN** nothing is selected and the chart area shows "Select a strategy"

### Requirement: Candle chart of the selected strategy
For the selected strategy the panel SHALL show a candlestick chart of its `instrument` at its
`base_timeframe`, built from the last 500 bars ending at the current bar and requested through
`GET /api/market/candles-window`. The chart SHALL show candlesticks only: no volume, EMA,
levels, trades or markers.

#### Scenario: Request window
- **WHEN** `ETHUSDT.P · 5m` is selected
- **THEN** one `candles-window` request is made with `symbol=ETHUSDT.P`, `timeframe=5m`,
  `to_open_time_ms` equal to the open time of the current 5-minute bar and `from` 499 bars
  before it

#### Scenario: Header
- **WHEN** candles are loaded
- **THEN** the panel header shows the strategy name, `ETHUSDT.P · 5m` and "Last bar:" with the
  UTC time of the last returned candle

#### Scenario: Fewer bars than requested
- **WHEN** the server returns fewer than 500 candles
- **THEN** the chart draws the returned candles without error

#### Scenario: Nothing selected
- **WHEN** no strategy is selected
- **THEN** the chart area shows "Select a strategy" and no candle request is made

### Requirement: Stale market data is visible
The panel SHALL mark the last-bar label as a warning when the last returned candle opened
more than two bars before the current bar.

#### Scenario: Old data
- **WHEN** the last returned 5m candle opened 30 minutes before the current bar
- **THEN** the "Last bar" label uses the warning style and the panel says there are no newer
  candles in the market data

#### Scenario: Fresh data
- **WHEN** the last returned candle is the current or the previous bar
- **THEN** the label has no warning style

### Requirement: Loading, empty and error states
The panel SHALL show a loading state while candles load, an empty state when the response has
no candles, and an error state with a Retry button when the request fails or the timeframe is
not supported. A response of a superseded request SHALL be ignored.

#### Scenario: Loading
- **WHEN** a request is in flight
- **THEN** the panel shows "Loading…" and Refresh is disabled

#### Scenario: Empty
- **WHEN** the response contains no candles
- **THEN** the panel says there are no candles for this market and draws no chart

#### Scenario: Request fails
- **WHEN** the request fails with a network error, a 5xx or a 4xx
- **THEN** the panel shows a fixed message for that kind and a Retry button, and Retry repeats
  the same request

#### Scenario: Unknown timeframe
- **WHEN** the selected strategy's `base_timeframe` is not a known timeframe
- **THEN** the panel shows the unsupported-timeframe message and makes no request

#### Scenario: Selection changes during loading
- **WHEN** the user selects another strategy while a request is in flight
- **THEN** the first request is aborted and its response, if it still arrives, is not shown

### Requirement: Manual refresh
The panel SHALL have a Refresh button that reloads the candles of the selected strategy for
the current bar. There SHALL be no automatic polling.

#### Scenario: Refresh
- **WHEN** the user presses Refresh
- **THEN** one new `candles-window` request is made with a window ending at the then-current
  bar

### Requirement: Look and layout
The chart panel SHALL use the Surface design tokens and follow the light and dark theme. From
1000px width the list and the chart panel are side by side; below that the chart panel is
under the list.

#### Scenario: Theme change
- **WHEN** the color scheme switches between light and dark
- **THEN** the chart's grid, text and candle colors follow the new scheme

### Requirement: Scope boundary
This change SHALL NOT alter the existing Chart tab, the market API client, the dev proxy, or
any backend.

#### Scenario: Other tabs unchanged
- **WHEN** the change is applied
- **THEN** the Chart, Surface, Candidates, Reports and Strategy Composer tabs behave as before
