## Context

See `proposal.md` for motivation. Runtime Dashboard currently inherits `.sx-wrap { max-width: 1080px }`, fixes its desktop list to `min(420px, 38%)`, renders a complete strategy summary in one `.rt-name`, and gives the chart host a fixed 420px height. The stored-summary formatter already has all display facts, but returns one flattened string. Operational controls deliberately continue to use the deployment file and instance id.

## Goals / Non-Goals

**Goals:**

- Make the dashboard fill a normal operator viewport without changing other `.sx` screens.
- Give cards a stable primary/detail hierarchy derived from the already-recognized summary.
- Keep open-position and recovery information immediately scannable.
- Increase useful chart area while retaining the existing sticky two-pane interaction.
- Preserve all existing accessibility and request/identity behavior.

**Non-Goals:**

- Redesign chart drawing, legends or layer controls.
- Add filters, sorting, virtualization, expansion panels or new actions.
- Change summary recognition, trading semantics, APIs or polling.
- Change Surface, Candidates or Research Chart layout.

## Decisions

### 1. Scope the wide shell to Runtime Dashboard

Add a Runtime-specific modifier to the existing `.sx-wrap`, with a viewport-aware maximum rather than changing the shared Surface cap. The desktop split uses a 460px rail and a flexible chart pane; below 1100px it stacks.

Changing `.sx-wrap` globally was rejected because it would alter Surface and other tabs outside this change.

### 2. Return a presentation model from the summary formatter

For recognized strategies the formatter returns a complete `text` for compatibility plus `heading` and ordered `details`. The heading contains compact instrument and geometry; details contain SL, TP and optional management tokens. Unsupported remains a discriminated result and unmatched files remain outside the formatter.

Parsing the already-rendered string inside React was rejected because separators are presentation output, not a stable data boundary.

### 3. Separate display title from operational strategy name

Runtime Dashboard computes one per-card presentation model. The card and chart header receive its display heading, while switch/delete/dialog labels, selection, chart market props and requests continue to use file/instance fields. The chart receives a separate optional secondary deployment label.

Replacing `strategyName` with the summary everywhere was rejected because it would blur display and operational identity.

### 4. Use CSS hierarchy rather than new interaction

Cards retain the same button and footer structure. Styling introduces a detail line, dedicated trade-state badges, a left selection accent and quieter metadata. The instance id remains in the DOM as secondary copyable metadata but is visually de-emphasized; no hidden menu or copy feature is added in V1.

### 5. Bound responsive chart height

Desktop chart height uses `clamp(520px, calc(100vh - 260px), 760px)`. Narrow layouts use a fixed 420px host so phones and short windows do not inherit desktop viewport assumptions.

## Risks / Trade-offs

- **[Risk] Long unknown/file labels still wrap.** → Preserve `overflow-wrap:anywhere` and allow the heading column to shrink before status badges.
- **[Risk] A 460px rail reduces chart width on smaller laptops.** → Stack below 1100px and keep the chart flexible above it.
- **[Risk] Snapshot enrichment arrives after Runtime and causes a title update.** → Preserve the existing asynchronous fallback behavior; layout dimensions do not depend on enrichment.
- **[Trade-off] Instance ids still consume one quiet line.** → Retain them for operational inspection without adding a new interaction in this focused change.

## Migration Plan

Ship as a frontend-only change. Rollback removes the Runtime wrapper modifier, structured summary rendering and display-title props; APIs and persisted data require no migration.
