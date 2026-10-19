## Context

Surface controls come from `result_schema.dimensions` of the manifest. Research Service serves the
manifest JSON as stored (`GET /experiments/{id}/manifest`); its `Dimension` model ignores unknown
fields (`extra="ignore"`), so a new field needs no backend change. The Workbench must not know
strategy components (project rule: Engine owns semantics), so the vote composition cannot be coded
into the frontend.

## Decisions

### D1. Info lives in the manifest, on the dimension

`ExperimentDimension.info?: DimensionInfo`:

```ts
type DimensionInfo = {
  title: string;
  notes?: string[];            // short lines shown above the tables
  tables?: {
    title?: string;
    columns: string[];
    rows: { cells: string[]; details?: string[] }[];   // details: lines shown when the row is opened
  }[];
};
```

All values are display text; the Workbench formats nothing. A malformed `info` (wrong types) is
ignored: no button, the control works as before.

Alternative rejected: a JSON file bundled with the frontend keyed by surface. It would put strategy
content into the UI code and go stale whenever a table is recalibrated.

### D2. Button and popup

An "i" button (`aria-label="About <label>"`) right after the control label, for optional and
always-on dimensions alike. Click opens a popup anchored to the button; it closes on the button
again, Esc, a click outside, or its own close button. One popup at a time. The popup is scrollable
(max height about 70% of the window) and wide enough for a seven-column table; on a narrow window it
takes the full width. Clicking a row with `details` expands it under the row (the full ladder).
Opening the popup changes nothing in the view, selection, URL or saved session.

### D3. Vote content (converter)

`scripts/vote-info-to-manifest-info.mjs` reads `vote_info.json` and prints, per table
(`frozen_v3`, `btc`, `eth`, `sol`, `bnb`), an `info` block:

- title: the table's `title` (for example "своя калибровка BTC SL7", "frozen v3 (таблица BTC W7/LB20,
  одна для всех монет)");
- notes: block at weight sum ≥ 0.75; one veto blocks the entry; B1 and B2 take the max weight inside
  the block; weight cap 0.333; base stop share in percent; for own tables "in-sample: откалибровано на
  собственной истории монеты";
- table "Голосующие и вето", columns: Блок, Метрика, Сторона (режет ≤ / режет ≥ / шаг),
  Начало голосования (порог → вес), Край (порог → вес), Ступеней, Вето (порог, сделок отсечено);
  a voter without a ladder shows "—" in the voting columns (only a veto); a voter with no veto shows
  "нет";
- details of a row: every step of the ladder as "порог → вес".

Numbers are printed as they are in `vote_info.json`; nothing is rounded or recomputed. The A2 vote
steps are shown as written ("2/1/0.2").

Which table goes to which switch: `vote_threshold` → `frozen_v3` on all four surfaces;
`own_vote_threshold` → the coin's own table (BTC → `btc`, ETH → `eth`, SOL → `sol`, BNB → `bnb`).

### D4. Data step on the Mac

Writing the blocks into the four manifests is a data change on the Mac (BBB_data), done only on the
owner's word, by the converter, with `manifest.pre_info_<time>.json` backups; result rows untouched;
the manifest is read on every request, so no restart is needed.

## Risks

- Manifest grows by a few tens of KB per surface (four tables of about 12 rows with ladders up to
  24 steps): negligible next to the result table.
- If a table is recalibrated later, the info must be regenerated with the converter; the window shows
  what the manifest says.
