## 1. Access to Runtime

- [x] 1.1 `vite.config.ts`: dev proxy `/runtime-api` → `VITE_RUNTIME_PROXY_TARGET` (default `http://127.0.0.1:8093`), prefix removed; `/api` proxy unchanged.
- [x] 1.2 `src/api/runtime.ts`: response types, `fetchRuntimeStrategyInstances()` (`GET /runtime-api/v1/strategy-instances`, no cache), `RuntimeListError` with kinds `not_ready`, `catalog_unavailable`, `runtime_error`, `unreachable`.

## 2. Tab and panel

- [x] 2.1 Add `"runtime"` to `WorkbenchTab`; add "Runtime Dashboard" after "Candidates" in `TabNav`; mount the panel in `App.tsx` while the tab is active.
- [x] 2.2 `src/features/runtime/RuntimeDashboard.tsx`: header with Refresh, summary (count, enabled, disabled), cards in received order, diagnostics block only when not empty, loading / empty / error (with Retry) states, in-flight guard, late response ignored.
- [x] 2.3 `src/features/runtime/runtime.css` under `.sx`, existing tokens and classes; one column below 720px, two above; no colors outside tokens, except the warning amber already used by `sx-badge-warn`.

## 3. Tests

- [x] 3.1 Client: URL and method, error kinds for 503 `not_ready`, 503 `catalog_unavailable`, 500, network failure, 502/504.
- [x] 3.2 Panel: cards and header counts (1 enabled + 32 disabled), ENABLED/DISABLED text, received order, no "running/active/live/trading" wording, diagnostics shown and hidden, loading, empty, each error message, Retry, Refresh disabled while in flight, late response ignored, only `GET` requests.
- [x] 3.3 Navigation: tab present after Candidates, other tabs and stored session unchanged; list requested on each activation.
- [x] 3.4 `npm test`, `tsc -b` and `vite build` green; `openspec validate --all --strict` green.

## 4. Visual check

- [x] 4.1 With the API mocked, screenshots of the tab in light and dark themes at desktop and phone width next to the Surface tab; owner reviews the look.
- [ ] 4.2 On the Mac against the running Runtime (on the owner's word): the tab lists the real catalog (33 strategies, 1 enabled).
