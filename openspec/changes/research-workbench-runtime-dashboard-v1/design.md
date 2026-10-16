## Context

The Workbench is a React/Vite app. `TabNav` lists tabs from a `WorkbenchTab` union held in
`WorkbenchContext`; `App.tsx` mounts one panel per tab (Candidates is mounted only while
active, Surface and Chart stay mounted and are hidden). The Surface tab defines the current
visual language in `surface.css`, scoped under `.sx` (tokens, `sx-panel`, `sx-badge`, `sx-chip`,
`sx-note`, `sx-error`, light and dark). All Research API calls go through `src/api/client.ts`
(`API_BASE`, `ApiError`) and the Vite dev server proxies `/api` to Research (8095).

Runtime exposes `GET /v1/strategy-instances` on port 8093 of the local stack (strategy_runtime
#21):

```
200 { scanned_file_count, strategy_instances: [{strategy_instance_id, strategy_id, instrument,
      base_timeframe, enabled, source_path}], invalid_files: [{source_path, error_code,
      error_message | null}], duplicate_identities: [{strategy_instance_id, source_paths[]}] }
503 {"status":"not_ready"} | 503 {"status":"catalog_unavailable"} | 500 {"status":"internal_error"}
```

## Decisions

### D1. Tab
Id `runtime`, label **Runtime Dashboard**, placed after Candidates in `TabNav`; `WorkbenchTab`
gets `"runtime"`. The panel is mounted only while the tab is active (as Candidates), so every
activation loads the list again. The stored-session tab list is not changed (Candidates is not
restored either); reloading the page returns to the default tab.

### D2. Reaching Runtime
Runtime sends no CORS headers, so the browser cannot call it directly from `:5173`. The dev
server gets a second proxy entry: `/runtime-api` → `VITE_RUNTIME_PROXY_TARGET` (default
`http://127.0.0.1:8093`) with the `/runtime-api` prefix removed. The client calls
`/runtime-api/v1/strategy-instances`. The Research Service is not a hop. Hosting the
Workbench anywhere but the Vite dev server would need its own routing and is out of scope.

### D3. Client
New `src/api/runtime.ts` with the response types above and `fetchRuntimeStrategyInstances()`
(`GET`, no body, no caching). Failures become one `RuntimeListError` with a `kind`:
`not_ready`, `catalog_unavailable`, `runtime_error` (any other status) or `unreachable`
(network failure or a 502/504 from the proxy). The panel maps each kind to a fixed message:
"Runtime is not ready", "Runtime catalog is unavailable", "Runtime returned an error",
"Runtime is not reachable". Status codes and bodies are not shown.

### D4. Panel
Component `RuntimeDashboard` in `src/features/runtime/`, root `<section className="sx"
aria-label="Runtime Dashboard">` so it inherits the Surface tokens, with `sx-wrap` as the
column. Parts, top to bottom:

1. **Header**: eyebrow "Runtime", title "Runtime Dashboard", a **Refresh** button.
2. **Summary**: one line "33 strategies" and chips "1 enabled" / "32 disabled" (counts
   computed from the list; the number is `strategy_instances.length`, not
   `scanned_file_count`).
3. **List**: one `sx-panel` card per instance, in the order Runtime returns (file name), no
   re-sorting:
   - title: `source_path` without the `.json` suffix;
   - second line: `strategy_id · instrument · base_timeframe` (mono);
   - badge **ENABLED** (accent dot) or **DISABLED** (muted dot): state is the text, the dot is
     decoration;
   - `strategy_instance_id` in small mono text (selectable), no actions.
4. **Diagnostics block**, rendered only if `invalid_files` or `duplicate_identities` is not
   empty, using the warning style already in `surface.css`: each invalid file as
   `source_path · error_code` (the `error_message`, when present, in the tooltip); each
   duplicate as `strategy_instance_id` with its `source_paths`. Header text says these files
   are not in the list above.

States: **loading** ("Loading…", list area only, header stays), **empty** (`strategy_instances`
is empty and no diagnostics: "No strategies in the Runtime catalog"), **error** (an `sx-error`
`role="alert"` line with the D3 message and a Retry button; a previously loaded list is not
kept). Refresh and Retry call the same fetch; while a request is in flight the button is
disabled. A response that arrives after the tab was left is ignored.

### D5. Styling
New `src/features/runtime/runtime.css`, selectors under `.sx`, reusing existing tokens and
classes (`sx-panel`, `sx-chip`, `sx-badge`, `sx-eyebrow`, `sx-sub`, `sx-note`, `sx-error`);
only the card grid, the state dot and the summary row are new. The grid is one column below
720px and two columns above. Light and dark themes follow `prefers-color-scheme` through the
tokens; no hard-coded colors outside tokens.

### D6. Read-only
The tab issues only `GET`. No control that changes Runtime exists in it, including no enable
or disable toggle. No polling timer.

## Risks

- A running Runtime on 8093 is required; if the stack is down the tab shows "Runtime is not
  reachable", which is the expected state, not a defect.
- The list shows the catalog file's `enabled` value, not whether Runtime is processing the
  strategy. The panel does not say "running" or "active" anywhere.
- Strategy names come from file names; a name collision is impossible because instance ids and
  files are unique in the accepted list.
