## 1. research_frontend

- [ ] 1.1 `src/api/runtime.ts`: `fetchStrategyInstanceStates` with a strict decoder of the Runtime body.
- [ ] 1.2 `RuntimeDashboard.tsx`: read the states with the list; card marks; header counts; note; failure line with its own Retry.
- [ ] 1.3 Tests: in_position long/short, entry_pending, recovery, flat, unmatched card, states 503 and malformed body, Retry of states only, GET only and no timer; static guards.
- [ ] 1.4 `vitest run` and `tsc -b`.

## 2. Verification on the Mac (on owner's word only)

- [ ] 2.1 After Runtime is deployed with the route: the cards show the marks matching the Runtime states and the positions and entry orders on Bybit demo.
