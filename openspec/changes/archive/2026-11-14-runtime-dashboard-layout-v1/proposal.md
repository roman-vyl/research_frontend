## Why

Runtime Dashboard currently uses a 1080px content cap and a narrow card rail, so on wide operator screens the dashboard occupies a small central island while strategy summaries wrap into dense, hard-to-scan blocks and the chart remains only 420px high. The newly added stored-strategy summaries make the information useful, but expose the need for a clearer visual hierarchy and better use of the available viewport.

## What Changes

- Expand Runtime Dashboard independently of the shared Surface content cap and use a stable strategy rail plus a flexible chart pane on desktop.
- Render a structured strategy heading and management-detail line instead of one competing sentence, while preserving the same stored facts and unknown/file fallbacks.
- Promote open-position state and side to a visually distinct operational badge and reduce repeated technical metadata.
- Give the selected chart substantially more viewport height and use the selected strategy summary as its display title while retaining the deployment file as secondary identity.
- Keep all switch, delete, command, selection and chart-fetch identities file/instance based.
- Preserve a single-column responsive layout on narrower screens.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `research-workbench-runtime-dashboard-v1`: Runtime cards and the dashboard shell gain a responsive wide-screen hierarchy for structured strategy summaries and operational state.
- `research-workbench-runtime-dashboard-chart-v1`: The selected chart pane gains responsive viewport sizing and a presentation title separate from its operational file identity.

## Impact

Affected code is limited to Runtime Dashboard presentation, its strategy-summary view model, Runtime chart presentation props, Runtime CSS and related component/static tests. Backend APIs, candidate/runtime contracts, polling cadence, chart data loading and trading actions are unchanged.
