## Why

Strategy Runtime now answers `GET /v1/strategy-instances` (strategy_runtime #21, merged): the
list of strategy instances registered in its deployment catalog, enabled and disabled, with the
catalog diagnostics. Nothing in the Workbench shows it. This change closes the first, smallest
vertical slice of the Runtime Dashboard: one tab that reads that list and displays it. Chart,
EMA, Journal and Engine views are deliberately not part of it.

## What Changes

- A new **Runtime Dashboard** tab in the Workbench navigation, after Candidates.
- Inside it one panel: a header with the number of strategies (and how many are enabled and
  disabled), then one card per strategy instance from the Runtime list: name, `strategy_id ·
  instrument · timeframe`, and an ENABLED / DISABLED state.
- Catalog diagnostics from the same response (`invalid_files`, `duplicate_identities`) appear
  as a compact warning block, only when they are not empty.
- Loading, empty, error and manual **Refresh** states.
- The panel reads the list through a same-origin dev-proxy path (`/runtime-api`) to Runtime,
  because Runtime has no CORS and the Research Service is not involved.
- The look follows the Surface tab (its design tokens, panels, badges, light and dark theme),
  not the Chart tab.

## Out of Scope

Chart, EMA lines, Journal, Engine view, Actual/ABI view, trade cycles and any Runtime state;
enabling, disabling or any other management; polling or live updates; sorting, filtering,
search, pagination; selecting a strategy or opening a detail view; any change to Runtime,
Research Service, Engine, ABI or Journal; production hosting of the frontend (this repository
serves the Workbench through the Vite dev server only).

## Capabilities

### New Capabilities

- `research-workbench-runtime-dashboard-v1`: the Runtime Dashboard tab and its strategy list.

## Impact

- `src/api/types.ts` (`WorkbenchTab`), new `src/api/runtime.ts`, `src/shared/layout/TabNav.tsx`,
  `src/App.tsx`, new `src/features/runtime/` (panel, styles, tests), `vite.config.ts` (dev proxy).
- No change to existing tabs, the Research API client or the session store.
