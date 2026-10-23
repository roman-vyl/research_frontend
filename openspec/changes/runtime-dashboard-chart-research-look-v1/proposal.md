## Why

On the Runtime Dashboard the chart canvas follows the light Surface theme. The EMA stack episode layers (#38, #39) use the Workbench episode colours, which are made for the dark Research backtest chart: bands at 7 % and zones at 13–16 % opacity. On the light canvas they are drawn but cannot be seen. The owner asked for the Runtime chart to look like the Research backtest chart.

## What Changes

- The Runtime chart canvas uses the fixed dark palette of the Research backtest chart (`features/chart/ChartPanel.tsx`): background `#0f1419`, text `#c8d0dc`, grid `#1e2836`, scale borders `#2a3544`, up candles `#22c55e`, down candles `#ef4444`.
- Projection, applied-order rings, trade-cycle marks, open-trade lines and close markers take their Entry, Stop, Take and muted colours from this palette instead of the Surface tokens. The muted colour is `#8b949e`.
- The canvas no longer follows the system light or dark theme. The panel around it (list, toolbar, legend) keeps the Surface tokens and still follows the theme.
- Episode colours, EMA line colours and the Workbench episode module are not changed.

## Out of Scope

The Research backtest chart, `features/chart/`, `features/episodes/`, the data, requests and layers of the Runtime chart.

## Capabilities

### Modified Capabilities

- `research-workbench-runtime-dashboard-chart-v1`: "Look and layout" — the chart canvas uses the Research chart palette.

## Impact

`src/features/runtime/RuntimeCandleChart.tsx` (palette, no theme listener), tests.
