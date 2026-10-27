## MODIFIED Requirements

### Requirement: Look and layout
The chart panel SHALL use the Surface design tokens and follow the light and dark theme, except the
chart canvas. The chart canvas SHALL use the fixed palette of the Research backtest chart: background
`#0f1419`, text `#c8d0dc`, grid `#1e2836`, scale borders `#2a3544`, up candles `#22c55e`, down candles
`#ef4444`; the Entry colour is the text colour, the Stop colour the down colour, the Take colour the up
colour, and the muted colour `#8b949e`. The canvas SHALL NOT change with the color scheme. From 1000px
width the list and the chart are side by side; below that the chart is under the list.

#### Scenario: Canvas looks like the Research chart
- **WHEN** the Runtime chart is shown in the light theme
- **THEN** its background, grid, text and candle colors are those of the Research backtest chart

#### Scenario: Theme change
- **WHEN** the color scheme switches
- **THEN** the panel around the chart follows it and the chart canvas does not change
