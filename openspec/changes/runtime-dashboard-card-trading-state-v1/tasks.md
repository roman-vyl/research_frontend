## 1. research_frontend

- [x] 1.1 `api/runtime.ts`: `GET /v1/strategy-instance-states` read with validation of the body and typed errors.
- [x] 1.2 `RuntimeDashboard.tsx`: read with the list and every 10 s while visible (no overlap, paused when hidden); card marks; header counts and note; failure line.
- [x] 1.3 Tests: in position long/short, entry order long/short, flat, no item, recovery marker, 503 and malformed body, recovery after failure, GET only, 10 s cadence and hidden-tab pause.
- [x] 1.4 `vitest run` and `tsc -b`.

## 2. Verification on the Mac (on owner's word only)

- [ ] 2.1 Deploy Runtime with the route, then the frontend. The marks match the positions and entry orders on Bybit demo.
