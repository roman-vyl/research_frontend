## ADDED Requirements

### Requirement: The chart layers of a strategy come from Runtime
When a strategy is selected the panel SHALL request `GET /runtime-api/v1/strategy-instances/{strategy_instance_id}/chart-layers` and SHALL take the stack EMAs from its `ema_stack` and the episode parameters from its `episodes`. The frontend SHALL NOT read the strategy specification and SHALL NOT resolve periods or episode defaults. The request SHALL be sent when the strategy is selected and when Refresh is pressed, and nowhere else. A failure of this request SHALL leave candles and trade layers unchanged and SHALL show "Chart layers unavailable" with a Retry button.

#### Scenario: Select a strategy
- **WHEN** the user selects a strategy
- **THEN** exactly one chart-layers request is sent for its `strategy_instance_id`

#### Scenario: Another strategy of the same market
- **WHEN** strategy B of the displayed market is selected
- **THEN** no bounds or candles request is made and one chart-layers request is sent for B

#### Scenario: Chart layers fail
- **WHEN** the request fails or answers an unexpected body
- **THEN** candles and trade layers stay, the line "Chart layers unavailable" and Retry are shown, and no EMA or episode request is sent

### Requirement: EMA lines of the strategy's stack
For each entry of `ema_stack` whose `timeframe` is `"base"` or equals the chart timeframe, and whose `source` is `close`, the chart SHALL draw one line over the candle window, with values from Research `GET /api/market/indicators/ema` for that `period` and window, coloured by role (fast, anchor, slow). The frontend SHALL NOT compute EMA values. Lines SHALL be stored for the session per symbol, timeframe and period; selecting another strategy of the same market SHALL request only periods not yet loaded, and Refresh SHALL request only the missing tail. An entry on another concrete timeframe or with another source SHALL NOT be drawn and SHALL NOT trigger a request; the panel SHALL state this in one line. A control SHALL hide and show all EMA lines.

#### Scenario: Strategy with a 200/500/1000 stack
- **WHEN** a strategy of a 5m market with that stack is selected
- **THEN** three EMA requests are sent for periods 200, 500, 1000 over the candle window and three lines are drawn

#### Scenario: Same stack, other strategy
- **WHEN** another strategy of the same market with the same stack is selected
- **THEN** no EMA request is sent

#### Scenario: Different stack
- **WHEN** another strategy of the same market uses periods 100, 200, 500
- **THEN** only the period 100 is requested

#### Scenario: Refresh
- **WHEN** the user presses Refresh and new bars exist
- **THEN** each loaded line is extended by one request for its missing tail only

#### Scenario: Base timeframe
- **WHEN** a stack entry has timeframe `"base"` on a 5m chart
- **THEN** it is drawn from the 5m series

#### Scenario: Other timeframe
- **WHEN** a stack entry has a concrete timeframe different from the chart's, or a source other than `close`
- **THEN** no request is sent for it, no line is drawn, and one line of text names the entry

#### Scenario: Hide lines
- **WHEN** the user hides EMA lines
- **THEN** no line is visible and no request is sent

### Requirement: Episode layers of the strategy
When `episodes` is not empty the chart SHALL show the Workbench episode layers (band, touch zones, false breaks, waves, forming wave, lanes) for the strategy's own parameters, taken from the chosen `episodes` entry with the keys the history route accepts. The whole history SHALL be loaded through Research `POST /api/market/ema-stack-episodes/history` in pages of whole finished episodes pinned to the first page's `market_data_hash`, restarting on `409 market_data_version_changed`; the 30-day window SHALL decide only what is on screen. An episode that starts before the window SHALL be drawn cut by the screen edge with the Engine's touch numbers. The frontend SHALL NOT compute any episode value. With several entries the toolbar SHALL require an explicit choice; with an empty `episodes` no episode layer and no episode toolbar SHALL exist. The toolbar SHALL offer the layer toggles and the side choice (long, short, both). The current episode SHALL be refreshed by Refresh only.

#### Scenario: One episode
- **WHEN** a strategy whose `episodes` holds one entry is selected
- **THEN** the history of both sides is requested for that entry's parameters until `next_before_start_ms` is null, and the layers are drawn

#### Scenario: Strategy values are visible

- **WHEN** the chosen entry has `window_bars` 24 and `break_bars` 24
- **THEN** the episode toolbar SHALL show "From the strategy: window 24 bars, break 24 bars" as read-only text and SHALL have no input that changes them.

#### Scenario: Episode cut by the window
- **WHEN** the history contains an episode that starts before the 30-day window
- **THEN** the chart draws the part inside the window and the touch numbers equal the Engine's

#### Scenario: Several entries
- **WHEN** `episodes` holds two entries and none is chosen
- **THEN** no history is requested and the toolbar asks to choose

#### Scenario: No episode section
- **WHEN** `episodes` is empty
- **THEN** no episode request is sent and no episode toolbar is shown

#### Scenario: Same parameters, other strategy
- **WHEN** another strategy of the same market has the same effective parameters
- **THEN** no history page is requested

#### Scenario: Version changed
- **WHEN** a page answers `409 market_data_version_changed`
- **THEN** loading restarts from the first page, as in the Workbench

#### Scenario: Refresh
- **WHEN** the user presses Refresh
- **THEN** page 1 is requested without a pin to refresh the current episode, and no timer exists

#### Scenario: Loading
- **WHEN** the history is loading
- **THEN** candles and EMA lines are drawn and "Loading episodes…" is shown

### Requirement: History is loaded whole, display stays inside the window, panning loads nothing
The episode history SHALL be loaded whole, but the chart SHALL draw episode elements and EMA line points only inside the 30-day candle window; nothing SHALL be drawn outside the candle times of the window. Every touch number, wave and false-break value drawn SHALL be the Engine's value; the frontend SHALL NOT recompute it. Panning or zooming the chart SHALL NOT widen the candle window and SHALL NOT send any candle, EMA or episode request.

#### Scenario: Pan to the left edge
- **WHEN** the user pans to the left edge of the window and beyond
- **THEN** no candle, EMA or episode request is sent and nothing is drawn outside the window

#### Scenario: Episode crossing the left edge
- **WHEN** an episode started before the window
- **THEN** only its part inside the window is drawn and its touch numbers equal the Engine's

#### Scenario: Zoom
- **WHEN** the user zooms in or out
- **THEN** no request is sent

### Requirement: Partial results are independent
Candles and trade layers (projection lines, applied orders, cycles, open-trade lines) SHALL be independent of the EMA lines and episodes: no failure or delay of the layer configuration, any EMA or the episode history SHALL remove or reload them. Each EMA line SHALL load and fail on its own: a failed line SHALL NOT remove the lines already drawn and SHALL show its own error mark. Episodes SHALL load independently of EMA lines. Layers SHALL belong to the strategy that is selected: after selecting another strategy no line or episode of the previous strategy SHALL be visible under the new selection, even while the new layers are loading. Retry SHALL repeat only the data that is missing or failed (the layer configuration, the failed lines, the failed episode pages) and SHALL NOT reload candles or lines already loaded.

#### Scenario: One EMA fails
- **WHEN** the lines for periods 200 and 500 load and the line for 1000 fails
- **THEN** lines 200 and 500 and the candles stay, line 1000 shows an error mark, and Retry requests only period 1000

#### Scenario: Slow episodes
- **WHEN** the episode history is still loading after 14 seconds
- **THEN** candles and loaded lines stay drawn and "Loading episodes…" is shown

#### Scenario: Episodes fail
- **WHEN** an episode page request fails
- **THEN** candles and lines stay, an episode error mark with Retry is shown, and Retry requests only the missing pages

#### Scenario: Switch strategy
- **WHEN** another strategy of the same market is selected while its layers load
- **THEN** the previous strategy's lines and episodes are hidden at once and are not shown under the new selection

#### Scenario: Configuration fails
- **WHEN** the chart-layers request fails
- **THEN** candles and trade layers stay unchanged and no line or episode of any strategy is shown

## MODIFIED Requirements

### Requirement: Native viewport only
The chart SHALL draw a candlestick series and a fixed set of overlay series and primitives created once with the chart (the trade layers, up to three EMA lines and one episode primitive), and SHALL leave pan and zoom to Lightweight
Charts. No series or primitive SHALL be added or removed after the chart is created. The Runtime Dashboard code SHALL NOT call `setVisibleRange`, `setVisibleLogicalRange`,
`fitContent`, `scrollToPosition` or `scrollToRealTime`, and SHALL NOT implement a render window,
prefetch, pending shift, viewport owner or restore command.

#### Scenario: No viewport control
- **WHEN** the source of `src/features/runtime/` is inspected
- **THEN** it contains none of those calls or mechanisms

#### Scenario: No Research coupling
- **WHEN** the imports of `src/features/runtime/` are inspected
- **THEN** none comes from `WorkbenchContext`, `WorkbenchRenderViewportContext`, `features/chart/ChartPanel`, `features/chart/runtime/` or `features/workbenchChartRuntime/`

#### Scenario: Fixed series count
- **WHEN** strategies with different stacks and episodes are selected one after another
- **THEN** the number of series and primitives of the chart does not change
