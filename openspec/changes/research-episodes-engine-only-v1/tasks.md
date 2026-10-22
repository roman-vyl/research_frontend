## 1. research_frontend

- [ ] 1.1 Remove the `anchor_stack` fallback (`anchorStackEpisodeParams`, `fallback` state, fallback branch of `selectEpisodeParams`); no section → no episode request.
- [ ] 1.2 Remove the override (`EpisodeWindowOverride`, `withEpisodeOverride`, `ChartPanel` override state, toolbar Window / Break inputs and "Strategy values" button); show `window_bars` / `break_bars` as read-only text.
- [ ] 1.3 Tests: no section → no history request and no episode controls; empty section entry → Engine's effective values drawn; explicit values drawn unchanged; several refs ask for a choice; no input fields in the toolbar; feature-plan failure shows the error and no request; remove the old fallback and override tests.
- [ ] 1.4 `npm test`, `tsc -b`, `openspec validate --all --strict` green.

## 2. Rollout (on owner's word only)

- [ ] 2.1 PR and merge only on the owner's word.
- [ ] 2.2 Mac check: open a run of a strategy without `ema_stack_episode` (no episode layers) and one with it (values equal to the strategy's).
