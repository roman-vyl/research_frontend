## Why

The chart must draw exactly the episode configuration the strategy declares and Engine resolved, nothing of its own. The Research Workbench still has two older mechanisms that break this: for a strategy without `ema_stack_episode` it invents a configuration from `anchor_stack` periods (Engine then fills window 24 / break 24), and the toolbar lets the user type `window_bars` / `break_bars`, so the chart can show episodes the tested strategy never computed. The Runtime Dashboard already follows the right model (strategy spec → Engine feature plan → effective `episode_params_by_ref` → drawing).

## What Changes

- **BREAKING (Workbench behaviour):** a strategy whose spec has no `ema_stack_episode` shows no episode layers and sends no history request. The `anchor_stack` fallback is removed.
- The Window / Break inputs and the "Strategy values" reset button are removed from the episode toolbar. The toolbar still shows the effective `window_bars` and `break_bars` of the chosen ref as read-only text, so the number from the spec is visible.
- Engine's effective values are sent unchanged; the frontend invents no default and no override.
- The remaining behaviour stays: several refs ask for an explicit choice, `history_bars` is not sent, pinned pages, session cache, refresh after a candle.

## Capabilities

### Modified Capabilities

- `research-workbench-ema-stack-episodes-v1`: the "Episode parameters" requirement is replaced (no fallback, no override, read-only values).

## Impact

`src/features/episodes/` (`episodeParams.ts`, `useEpisodeParams.ts`, `EpisodeToolbar.tsx`), `src/features/chart/ChartPanel.tsx` (override state), tests. No API, Engine or Runtime change. Independent of `runtime-dashboard-ema-episodes-v1` (that change only adds an optional `clipToCandles` flag to the episode primitive and does not touch these files' behaviour).
