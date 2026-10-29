## 1. research_frontend

- [x] 1.1 `api/runtime.ts`: the two POSTs with typed refusals (reason, status).
- [x] 1.2 `RuntimeDashboard.tsx`: buttons by trade state, in-page confirmation, one send, outcome text, re-read on success.
- [x] 1.3 Tests: buttons by state, confirmation text, declined sends nothing, one POST per accept, success re-read, refusals and the 502 close text, no send on refresh; static guard allows exactly these two POSTs.
- [x] 1.4 `vitest run` and `tsc -b`.

## 2. Verification on the Mac (on owner's word only)

- [x] 2.1 Deploy Runtime with the commands, then the frontend; try both buttons on Bybit demo.
