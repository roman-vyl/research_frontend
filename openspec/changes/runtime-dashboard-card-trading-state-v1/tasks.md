## 1. research_frontend

- [ ] 1.1 Trade-state module: last bar per strategy from Journal strategy-instances, one-bar events read per strategy, marks per the spec.
- [ ] 1.2 `RuntimeDashboard.tsx`: read with the list; card marks; header counts and note; failure line with its own Retry.
- [ ] 1.3 Tests: in position long/short, entry order long/short, flat, no journaled bar, Journal 503 and malformed body, Retry of the Journal reads only, GET only and no timer; static guards.
- [ ] 1.4 `vitest run` and `tsc -b`.

## 2. Verification on the Mac (on owner's word only)

- [ ] 2.1 Deploy the frontend. The marks match the positions and entry orders on Bybit demo.
