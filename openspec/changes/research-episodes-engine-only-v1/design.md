## Context

Engine's feature plan returns `episode_params_by_ref` only when the spec declares `ema_stack_episode`; the values are effective (defaults applied by Engine: `window_bars` 24, `break_bars` equal to the window, periods from `anchor_stack` when omitted inside an entry). Verified in `strategy_engine` 7263ab2: `stack_episode.py` `parse_episode_section` / `parse_episode_params`, `feature_plan.py` lines 261-263 and 86.

## Decisions

- **D1 No section, no episodes.** `useEpisodeParams` returns no refs and no parameters when `hasEpisodeSection` is false; no history request. `anchorStackEpisodeParams`, `fallback` and the `anchor_stack` branch of `selectEpisodeParams` are deleted.
- **D2 No override.** `EpisodeWindowOverride`, `withEpisodeOverride`, the override state in `ChartPanel` and the toolbar inputs are deleted. A chart can only show what the strategy computed.
- **D3 Visible numbers.** The toolbar shows `window_bars` and `break_bars` of the chosen ref as text ("From the strategy: window 24 bars, break 24 bars"), read-only.
- **D4 Errors are not hidden.** A failed feature-plan request shows the existing error state; there is no fallback to guessed parameters.
