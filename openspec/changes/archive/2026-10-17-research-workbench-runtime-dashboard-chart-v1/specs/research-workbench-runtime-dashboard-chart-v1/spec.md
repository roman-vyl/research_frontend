## ADDED Requirements

### Requirement: Strategy selection is UI state only
The Runtime Dashboard SHALL let the user select one strategy card at a time, identified by
`strategy_instance_id`. Nothing is selected when the tab opens. Enabled and disabled strategies are
both selectable. Selecting a strategy SHALL NOT send any request to Runtime or change any
strategy state.

#### Scenario: Select a strategy
- **WHEN** the user activates a strategy card
- **THEN** that card is marked selected (`aria-pressed="true"`) and no other card is

#### Scenario: Selection survives a list refresh
- **WHEN** the list is refreshed and the selected `strategy_instance_id` is still present
- **THEN** the same card stays selected and the chart is not reloaded

#### Scenario: Selected strategy disappears
- **WHEN** the list is refreshed and the selected `strategy_instance_id` is gone
- **THEN** nothing is selected and the chart area shows "Select a strategy"

### Requirement: Chart identity is the market
The chart SHALL depend only on the market `instrument` + `base_timeframe` of the selected
strategy. Selecting a different strategy with the same market SHALL NOT trigger any request and
SHALL NOT reset the chart series.

#### Scenario: Same market
- **WHEN** strategy A (`ETHUSDT.P`, `5m`) is shown and the user selects strategy B (`ETHUSDT.P`, `5m`)
- **THEN** no bounds or candles request is made and the chart keeps its data

#### Scenario: Different market
- **WHEN** strategy A (`ETHUSDT.P`, `5m`) is shown and the user selects strategy C (`BTCUSDT.P`, `5m`)
- **THEN** the chart loads and shows `BTCUSDT.P` candles

### Requirement: Right edge from market bounds
For a market that is not displayed yet the panel SHALL first call `GET /api/market/bounds` with the
strategy's `instrument` and `base_timeframe` and SHALL use `latest_open_time_ms` as the last bar of
the requested window. The browser clock SHALL NOT take part in choosing the window.

#### Scenario: Bounds request
- **WHEN** `ETHUSDT.P · 5m` is selected for the first time
- **THEN** one `GET /api/market/bounds?symbol=ETHUSDT.P&timeframe=5m` request is made before any candles request

### Requirement: Initial window is the last 30 days
The candle window SHALL end at `latest_open_time_ms` (inclusive bar) and start 30 days before the
exclusive end, but not before `earliest_open_time_ms`. The window SHALL NOT exceed the Research
render window of 25 000 bars.

#### Scenario: 5m market
- **WHEN** the latest bar is the 5m bar opening at `T` and earliest is older than 30 days
- **THEN** `candles-window` is requested with `from` = `T + 300000 - 30 days` and
  `to_open_time_ms` = `T`, which is 8 640 bars

#### Scenario: Short history
- **WHEN** `earliest_open_time_ms` is less than 30 days before the end
- **THEN** the window starts at `earliest_open_time_ms`

### Requirement: Candles go through the shared cache
Candles SHALL be read and stored through the existing `marketResourceCache` with key
`symbol` + `timeframe` + the constant reload token `0`. Only the part of the window missing from
the cache SHALL be requested. Runtime code SHALL NOT reset, clear or evict cache stores.

#### Scenario: Window already cached
- **WHEN** the market was shown before and its window is fully covered by the cache
- **THEN** no `candles-window` request is made and the chart draws from the cache

#### Scenario: Tail moved on
- **WHEN** a cached window ends at bar `T` and the bounds now report latest `T + 3 bars`
- **THEN** only the missing range after `T` is requested

#### Scenario: Shared with Research
- **WHEN** Research has cached the same symbol and timeframe at token `0`
- **THEN** Runtime uses those candles without changing or clearing them

### Requirement: Native viewport only
The chart SHALL draw a single candlestick series and SHALL leave pan and zoom to Lightweight
Charts. The Runtime Dashboard code SHALL NOT call `setVisibleRange`, `setVisibleLogicalRange`,
`fitContent`, `scrollToPosition` or `scrollToRealTime`, and SHALL NOT implement a render window,
prefetch, pending shift, viewport owner or restore command.

#### Scenario: No viewport control
- **WHEN** the source of `src/features/runtime/` is inspected
- **THEN** it contains none of those calls or mechanisms

#### Scenario: No Research coupling
- **WHEN** the imports of `src/features/runtime/` are inspected
- **THEN** none comes from `WorkbenchContext`, `WorkbenchRenderViewportContext`, `features/chart/ChartPanel`, `features/chart/runtime/` or `features/workbenchChartRuntime/`

### Requirement: Stale responses are ignored
Responses SHALL be applied only if their market is still the displayed one. Selecting a strategy
of another market SHALL abort the previous requests.

#### Scenario: Switch during loading
- **WHEN** the user selects a strategy of another market while a request is in flight
- **THEN** the first request is aborted and its response, if it still arrives, is not drawn

### Requirement: Loading, empty and error states
The panel SHALL show a prompt when nothing is selected, "Loading…" while data loads, an empty
state when the window has no candles, and an error state with Retry when bounds or candles fail or
the timeframe is not supported. The header SHALL show the strategy name, the market and the UTC
time of the last bar. A Refresh button SHALL always repeat the bounds request and then re-evaluate cache coverage;
it SHALL request candles only for a missing range, if one exists. There SHALL be no automatic polling.

#### Scenario: Bounds fail
- **WHEN** the bounds request fails
- **THEN** the panel shows an error with Retry and makes no candles request

#### Scenario: Unsupported timeframe
- **WHEN** `base_timeframe` is not a supported timeframe
- **THEN** the panel shows the unsupported-timeframe message and makes no request

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
The chart panel SHALL use the Surface design tokens and follow the light and dark theme. From
1000px width the list and the chart are side by side; below that the chart is under the list.

#### Scenario: Theme change
- **WHEN** the color scheme switches
- **THEN** the chart's grid, text and candle colors follow it

### Requirement: Research Chart is not changed
This change SHALL NOT modify the Research Chart, `WorkbenchContext`,
`WorkbenchRenderViewportContext`, `features/chart/`, `features/workbenchChartRuntime/` or the
market cache modules.

#### Scenario: Other tabs unchanged
- **WHEN** the change is applied
- **THEN** the Chart, Surface, Candidates, Reports and Strategy Composer tabs behave as before
