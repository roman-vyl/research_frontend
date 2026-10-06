## Context

- The picker (`SurfaceView`, `experimentId === null`) renders one `sx-card` button per
  registry entry; the registry has a handful of entries (6 today).
- An opened Experiment shows `SurfaceHeader` (eyebrow, title, units).
- A result row has a full Engine run iff its `run_id` is non-empty and the folder
  `<artifacts_root>/<run_id>/` exists (backend `research-run-deletion-v1`). Several
  Experiments have no run at all (replay surfaces): their Engine runs count is 0.
- Research Service reads `runs.csv` through a cache keyed by path, mtime and size
  (`adapters/experiments/filesystem.py`); `delete` rewrites the table, so that key
  changes after a deletion or an Engine fill.
- Run folders are big (tens of MB each) and numerous (thousands per Surface, about
  71 000 in total). Stat-ing all files of one Surface's runs is acceptable once;
  doing it for all Surfaces on every picker visit is not.

## Decisions

### D1. Numbers and their meaning

| Shown | Meaning | Source |
| --- | --- | --- |
| Strategies | rows of the result table | table |
| Engine runs | rows with non-empty `run_id` | table |
| Size, GB | bytes of the distinct run folders referenced by the table plus the Experiment folder (table, backups, journal, manifest) | file system, cached |

When the size has been computed and some referenced folders are missing, the block
also shows "M runs missing on disk". GB uses 10^9 bytes, two decimals.

A run folder referenced by two Experiments is counted in both; the block does not
de-duplicate across Experiments.

### D2. Two modes, one route

`size=cached` (default) never touches run folders: it returns the counts and the size
only if the backend already computed it for the current table key, else `null`.
`size=compute` returns the size, computing it if the cache misses. The picker uses
`cached` for every card; the opened Experiment uses `compute` once per open. After a
compute, the next picker visit shows the size from the cache.

### D3. Loading in the frontend

Card requests are sent when the picker is shown, at most two at a time, and their
results are kept for the session in `SurfaceView` state keyed by `experiment_id`.
While loading a card shows "…"; on error it shows "—" and the card still opens. The
opened Experiment's request runs in parallel with the manifest and does not block the
heat map. After a successful run deletion (other change) the stored numbers of that
Experiment are dropped so they are requested again.

## Backend contract (dependency, separate research_service change)

`GET /api/research/experiments/{experiment_id}/storage?size=cached|compute`

Values are illustrative.

```json
{
  "experiment_id": "example.surface",
  "rows": 3000,
  "engine_runs": 1200,
  "distinct_run_ids": 1200,
  "size": {
    "bytes": 50100000000,
    "run_bytes": 50000000000,
    "experiment_folder_bytes": 100000000,
    "missing_runs": 0,
    "computed_at": "2026-10-06T07:30:00Z"
  }
}
```

- `rows`, `engine_runs`, `distinct_run_ids` come from the result table already loaded
  by the results cache; computing them reads no run folder.
- `size` is `null` in `cached` mode when not computed for the current table key.
- The size is computed by stat-ing files of the distinct referenced run folders only
  (`<artifacts_root>/<run_id>/`, no symbolic links followed) plus the Experiment
  folder. It never lists `artifacts_root`, never opens or hashes run files, and never
  calls the code behind `GET /api/research/runs`.
- The cache is in memory, keyed by (table path, mtime, size); a deletion or an Engine
  fill changes the key. Nothing is written to disk; the route stays read-only.
- Unknown Experiment: 404 as the other Experiment routes. Invalid `size` value: 422.

## Risks / Trade-offs

- The first `compute` of a large Surface after a container restart stats every file of
  its runs (thousands of folders); it is slow but bounded to that Surface and happens
  only when the user opens it.
- The in-memory cache is lost on restart, so sizes show "not computed yet" in the
  picker until each Surface is opened again. A persisted cache was rejected because
  the route would then write to the analysis folder.
