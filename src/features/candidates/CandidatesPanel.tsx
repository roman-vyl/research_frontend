import { useEffect, useMemo, useState } from "react";

import { ApiError, fetchExperimentManifest } from "@/api/client";
import type { Candidate, CandidateMeaning } from "@/api/candidates";
import type { ExperimentResultSchema } from "@/api/experiments";
import "@/features/surface/surface.css";
import { emitFocus } from "@/features/candidates/focus";
import { CatalogMark, ExportDialog, exportRule } from "@/features/candidates/RuntimeExport";
import {
  depthConditions,
  depthRow,
  filterSchema,
  metricDefs,
  metricIds,
  metricInfo,
  shownMetrics,
  type Shown,
} from "@/features/candidates/metrics";
import { loadCandidates, unstarPoint, unstarPoints, useCandidates } from "@/features/candidates/store";
import { FiltersPanel } from "@/features/surface/FiltersPanel";
import { formatMetric, makePasses, type Condition } from "@/features/surface/model";
import { useWorkbenchReport, useWorkbenchShell } from "@/shared/context/WorkbenchContext";
import { readSession, writeSession } from "@/shared/session/storage";

const FILTERS_KEY = "candidates.filters";

/** Result schemas of the candidates' Experiments, for metric labels and formats; a failed manifest is skipped. */
function useResultSchemas(experimentIds: string[]): ExperimentResultSchema[] {
  const [schemas, setSchemas] = useState<Record<string, ExperimentResultSchema>>({});
  const key = [...new Set(experimentIds)].sort().join("\n");
  useEffect(() => {
    let alive = true;
    const wanted = key ? key.split("\n") : [];
    void Promise.all(
      wanted.map((id) =>
        fetchExperimentManifest(id).then(
          (m) => [id, m.result_schema] as const,
          () => null,
        ),
      ),
    ).then((loaded) => {
      if (!alive) return;
      const next: Record<string, ExperimentResultSchema> = {};
      for (const item of loaded) if (item && item[1]) next[item[0]] = item[1];
      setSchemas(next);
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return useMemo(() => Object.values(schemas), [schemas]);
}

function loadFilters(): Condition[] {
  const raw = readSession<unknown>(FILTERS_KEY);
  return Array.isArray(raw)
    ? raw.filter(
        (c): c is Condition =>
          !!c &&
          typeof c.id === "string" &&
          typeof c.metric === "string" &&
          (c.op === ">=" || c.op === "<=" || c.op === "top" || c.op === "bottom"),
      )
    : [];
}

const errorText = (e: unknown): string =>
  e instanceof ApiError ? e.detail : e instanceof Error ? e.message : "Request failed.";

const text = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));

/** `<anchor>`, `<label> <value> <unit>`, …, `fee <entry fee> per side`; the stored coordinates when the row is gone. */
function meaningParts(c: Candidate): string[] {
  const m = c.current?.meaning;
  if (!m) return Object.entries(c.coords).filter(([, v]) => v !== null).map(([k, v]) => `${k} ${v}`);
  const parts = [m.anchor, ...m.coords.filter((x) => x.value !== null).map((x) => `${x.label} ${x.value}${x.unit ? ` ${x.unit}` : ""}`)];
  const fee = m.fixed_params?.entry_fee_rate;
  const rate = typeof fee === "number" || typeof fee === "string" ? Number(fee) : NaN;
  if (Number.isFinite(rate)) parts.push(`fee ${Number((rate * 100).toPrecision(6))}% per side`);
  else if (fee !== undefined && fee !== null) parts.push(`fee ${text(fee)} per side`);
  return parts.filter(Boolean);
}

const meaningLine = (c: Candidate): string => meaningParts(c).join(" · ");

function originBadge(c: Candidate): string | null {
  const runId = c.current ? c.current.run_id : c.snapshot.run_id;
  const provenance = c.current ? c.current.provenance : c.snapshot.provenance;
  if (runId) return "Engine run";
  if (provenance === "replay") return "replay only";
  if (provenance === "engine") return "no full run";
  return null;
}

const STATE_HINT: Record<string, string> = {
  missing: "row not found",
  ambiguous: "several rows match this point",
};

/** Metrics whose sign is the verdict: a loss is drawn in the negative ink. */
const SIGNED = new Set(["net_pnl", "return_pct"]);

const valueText = (v: number | string | null, unit: string | null | undefined): string =>
  v === null ? "—" : `${v}${unit ? ` ${unit}` : ""}`;

function Details({ c, meaning }: { c: Candidate; meaning: CandidateMeaning | null }) {
  const spec = c.strategy_spec_snapshot;
  const fixed = Object.entries(meaning?.fixed_params ?? {});
  return (
    <div className="sx-cand-details">
      <section className="sx-cd-block">
        <h3 className="sx-cd-h">Point</h3>
        {meaning ? (
          <dl className="sx-cd-tiles">
            {meaning.coords.map((x) => (
              <div key={x.id} className="sx-cd-tile">
                <dt>{x.label}</dt>
                <dd className="sx-num">{valueText(x.value, x.unit)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="sx-note">The row is not in the table now; stored coordinates: {meaningLine(c) || "—"}.</p>
        )}
      </section>
      {fixed.length > 0 && (
        <section className="sx-cd-block">
          <h3 className="sx-cd-h">Fixed parameters</h3>
          <dl className="sx-cd-kv">
            {fixed.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className="sx-num">{text(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {spec && (
        <section className="sx-cd-block sx-cd-spec">
          <h3 className="sx-cd-h">Strategy spec of the picked run</h3>
          <p className="sx-note">
            Historical: the spec of run {spec.run_id} as it was when this point was starred. It is not the current spec of
            this point. "To Runtime" exports exactly this stored snapshot.
          </p>
          {spec.source === "run_request" ? (
            <details className="sx-cd-pre">
              <summary>Show JSON</summary>
              <pre aria-label="Historical strategy spec">{JSON.stringify(spec.spec, null, 2)}</pre>
            </details>
          ) : (
            <p className="sx-note">No spec was stored: {spec.reason}</p>
          )}
        </section>
      )}
    </div>
  );
}

/** A coordinate column of an Experiment block: the manifest's label and unit, or the stored id when no row is found. */
type CoordColumn = { id: string; head: string };

type Group = { experimentId: string; title: string; sub: string; columns: CoordColumn[]; rows: { c: Candidate; s: Shown }[] };

/** Visible candidates grouped by Experiment, in the order the Experiments first appear in the list. */
function groupByExperiment(rows: { c: Candidate; s: Shown }[]): Group[] {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const id = row.c.experiment_id;
    let g = groups.get(id);
    if (!g) {
      g = { experimentId: id, title: id, sub: "", columns: [], rows: [] };
      groups.set(id, g);
    }
    g.rows.push(row);
  }
  for (const g of groups.values()) {
    const meanings = g.rows.map((r) => r.c.current?.meaning).filter((m): m is CandidateMeaning => !!m);
    const first = meanings[0];
    if (first) {
      g.title = first.title;
      g.sub = [first.ticker, first.anchor].filter(Boolean).join(" · ");
    }
    const seen = new Map<string, string>();
    for (const m of meanings) {
      for (const x of m.coords) if (!seen.has(x.id)) seen.set(x.id, `${x.label}${x.unit ? ` ${x.unit}` : ""}`);
    }
    if (seen.size === 0) for (const r of g.rows) for (const k of Object.keys(r.c.coords)) if (!seen.has(k)) seen.set(k, k);
    g.columns = [...seen].map(([id, head]) => ({ id, head }));
  }
  return [...groups.values()];
}

/** The coordinate value shown in a column: the current meaning's value, else the stored coordinate. */
function coordValue(c: Candidate, id: string): string {
  const meaning = c.current?.meaning;
  if (meaning) {
    const x = meaning.coords.find((k) => k.id === id);
    return x && x.value !== null ? String(x.value) : "—";
  }
  const v = c.coords[id];
  return v === null || v === undefined ? "—" : v;
}

type Sort = { metric: string; dir: "desc" | "asc" };

const SORT_KEY = "candidates.sort";

function loadSort(): Sort | null {
  const raw = readSession<unknown>(SORT_KEY);
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Sort>;
  return typeof r.metric === "string" && (r.dir === "desc" || r.dir === "asc") ? { metric: r.metric, dir: r.dir } : null;
}

/** Rows ordered by one metric; rows without a value stay at the end in their list order. */
function sortRows<T extends { s: Shown }>(rows: T[], sort: Sort | null): T[] {
  if (!sort) return rows;
  const sign = sort.dir === "desc" ? -1 : 1;
  return rows
    .map((r, i) => ({ r, i, v: r.s.metrics[sort.metric] }))
    .sort((a, b) => {
      const av = typeof a.v === "number" ? a.v : null;
      const bv = typeof b.v === "number" ? b.v : null;
      if (av === null || bv === null) return av === bv ? a.i - b.i : av === null ? 1 : -1;
      return av === bv ? a.i - b.i : (av - bv) * sign;
    })
    .map((x) => x.r);
}

/** The shortlist of starred Surface points: one block per Experiment, the point's actions in a side panel. */
export function CandidatesPanel() {
  const { setSelectedRunId } = useWorkbenchReport();
  const { setActiveTab } = useWorkbenchShell();
  const { candidates, status, error } = useCandidates();
  const [filters, setFilters] = useState<Condition[]>(loadFilters);
  const [sort, setSort] = useState<Sort | null>(loadSort);
  const [focused, setFocused] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    void loadCandidates();
  }, []);

  const schemas = useResultSchemas(candidates.map((c) => c.experiment_id));
  const defs = useMemo(() => metricDefs(schemas), [schemas]);
  const shown = useMemo(() => candidates.map(shownMetrics), [candidates]);
  const ids = useMemo(() => metricIds(shown), [shown]);
  const schema = useMemo(() => filterSchema(ids, defs), [ids, defs]);

  const visible = useMemo(() => {
    const rows = shown.map((s) => depthRow(s.metrics));
    const pass = makePasses(schema, rows, depthConditions(filters), () => new Map());
    return candidates.map((c, i) => ({ c, s: shown[i], ok: pass(rows[i]) })).filter((x) => x.ok);
  }, [candidates, shown, schema, filters]);

  const groups = useMemo(
    () => groupByExperiment(visible).map((g) => ({ ...g, rows: sortRows(g.rows, sort) })),
    [visible, sort],
  );

  /** Selected rows that are still in the list and pass the filters: hidden rows are never removed. */
  const selected = useMemo(() => visible.filter((x) => picked.has(x.c.candidate_id)).map((x) => x.c.candidate_id), [visible, picked]);
  const allPicked = visible.length > 0 && selected.length === visible.length;

  const focus = focused === null ? null : (visible.find((x) => x.c.candidate_id === focused)?.c ?? null);
  const exportCandidate = exporting === null ? null : (candidates.find((c) => c.candidate_id === exporting) ?? null);

  const update = (next: Condition[]) => {
    setFilters(next);
    writeSession(FILTERS_KEY, next);
  };

  /** First click sorts by the metric from high to low, the next one flips the order. */
  const sortBy = (metric: string) => {
    const next: Sort = sort?.metric === metric && sort.dir === "desc" ? { metric, dir: "asc" } : { metric, dir: "desc" };
    setSort(next);
    writeSession(SORT_KEY, next);
  };

  const pick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pickAll = () => setPicked(allPicked ? new Set() : new Set(visible.map((x) => x.c.candidate_id)));

  const pickGroup = (g: Group) =>
    setPicked((prev) => {
      const next = new Set(prev);
      const all = g.rows.every((r) => next.has(r.c.candidate_id));
      for (const r of g.rows) {
        if (all) next.delete(r.c.candidate_id);
        else next.add(r.c.candidate_id);
      }
      return next;
    });

  const removeSelected = async () => {
    if (selected.length === 0) return;
    setActionError(null);
    setRemoving(true);
    try {
      await unstarPoints(selected);
      setPicked(new Set());
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setRemoving(false);
    }
  };

  const unstar = async (c: Candidate) => {
    setActionError(null);
    try {
      await unstarPoint(c.candidate_id);
      setFocused(null);
    } catch (e) {
      setActionError(errorText(e));
    }
  };

  const cell = (id: string, s: Shown, changed: boolean) => {
    const m = metricInfo(id, defs);
    const v = s.metrics[id];
    const was = s.snapshot[id];
    return (
      <td
        key={id}
        className={`sx-num${s.stale ? " sx-stale" : ""}${SIGNED.has(id) && typeof v === "number" && v < 0 ? " sx-loss" : ""}`}
        title={s.stale ? "row not found: value at the time of the star" : changed ? `at the time of the star: ${formatMetric(m, typeof was === "number" ? was : null)}` : undefined}
      >
        {formatMetric(m, typeof v === "number" ? v : null)}
      </td>
    );
  };

  const side = (c: Candidate) => {
    const rowState = c.current?.row_state ?? "missing";
    const runId = c.current?.run_id ?? null;
    const origin = originBadge(c);
    const hint = STATE_HINT[rowState];
    const toRuntime = exportRule(c);
    return (
      <aside className="sx-panel sx-cand-side" aria-label="Candidate details">
        <div className="sx-cand-side-head">
          <div>
            <div className="sx-cand-title">{c.current?.meaning?.title ?? c.experiment_id}</div>
            <p className="sx-note">{meaningLine(c) || "—"}</p>
          </div>
          <button type="button" className="sx-cand-close" aria-label="Close details" onClick={() => setFocused(null)}>×</button>
        </div>
        {(origin || rowState !== "same" || c.current?.runtime?.present) && (
          <div className="sx-cand-badges">
            {origin && <span className="sx-badge">{origin}</span>}
            {rowState !== "same" && <span className="sx-badge sx-badge-warn">{rowState}</span>}
            <CatalogMark c={c} />
          </div>
        )}
        <div className="sx-cand-actions">
          <button
            type="button"
            className="sx-act"
            disabled={!runId}
            title={runId ? "Open the run on the Chart" : "no full run"}
            onClick={() => {
              if (!runId) return;
              setSelectedRunId(runId);
              setActiveTab("chart");
            }}
          >
            Chart
          </button>
          <button
            type="button"
            className="sx-act"
            disabled={hint !== undefined}
            title={hint ?? "Show this point on the Surface"}
            onClick={() => {
              if (hint !== undefined) return;
              emitFocus({ experimentId: c.experiment_id, coords: c.coords });
              setActiveTab("surface");
            }}
          >
            On Surface
          </button>
          <button
            type="button"
            className="sx-act"
            disabled={!toRuntime.canExport}
            title={toRuntime.hint}
            onClick={() => toRuntime.canExport && setExporting(c.candidate_id)}
          >
            To Runtime
          </button>
        </div>
        {hint && <div className="sx-note">{hint}</div>}
        <Details c={c} meaning={c.current?.meaning ?? null} />
        <button type="button" className="sx-act sx-act-danger sx-cand-remove" onClick={() => unstar(c)}>
          Remove from candidates
        </button>
      </aside>
    );
  };

  return (
    <section className="sx" aria-label="Candidates">
      <div className="sx-wrap sx-wrap-wide">
        <header>
          <div className="sx-eyebrow">Research · Shortlist</div>
          <h1>Candidates</h1>
          <p className="sx-sub">
            Points starred on the Surface, one block per Experiment. Click a row for its details and actions. A changed row
            shows the value at the time of the star on hover.
          </p>
        </header>
        {(error || actionError) && <p role="alert" className="sx-error">{actionError ?? error}</p>}
        {status === "loading" && candidates.length === 0 && <p className="sx-note">Loading…</p>}
        {status !== "loading" && candidates.length === 0 && !error && (
          <p className="sx-note">No candidates yet: star a point in the Surface details.</p>
        )}
        {candidates.length > 0 && (
          <>
            <FiltersPanel
              schema={schema}
              filters={filters}
              compare={null}
              summary={`${visible.length} / ${candidates.length} candidates shown`}
              onChange={update}
              label="Filters · all conditions must hold (AND) · candidates that fail are hidden · Max DD compares depth"
            />
            <div className="sx-cand-bulk">
              <label className="sx-cand-all">
                <input
                  type="checkbox"
                  className="sx-cand-check"
                  aria-label="Select all shown candidates"
                  checked={allPicked}
                  disabled={visible.length === 0}
                  onChange={pickAll}
                />
                All shown
              </label>
              <button
                type="button"
                className="sx-act sx-act-danger"
                disabled={selected.length === 0 || removing}
                onClick={removeSelected}
              >
                {removing ? "Deleting…" : `Delete selected (${selected.length})`}
              </button>
              {selected.length > 0 && !removing && (
                <button type="button" className="sx-act" onClick={() => setPicked(new Set())}>
                  Clear selection
                </button>
              )}
            </div>
            <div className={`sx-cand-layout${focus ? " sx-cand-layout-open" : ""}`}>
              <div className="sx-cand-groups">
                {groups.map((g) => (
                  <div key={g.experimentId} className="sx-panel sx-cand-group">
                    <div className="sx-cand-ghead">
                      <span className="sx-cand-gtitle">{g.title}</span>
                      <span className="sx-note">
                        {g.sub ? `${g.sub} · ` : ""}
                        {g.rows.length} {g.rows.length === 1 ? "point" : "points"}
                      </span>
                    </div>
                    <div className="sx-cand-scroll">
                      <table className="sx-cand-table" aria-label={`Candidates · ${g.title}`}>
                        <thead>
                          <tr>
                            <th className="sx-cand-checkcol">
                              <input
                                type="checkbox"
                                className="sx-cand-check"
                                aria-label="Select all in this experiment"
                                checked={g.rows.every((r) => picked.has(r.c.candidate_id))}
                                onChange={() => pickGroup(g)}
                              />
                            </th>
                            {g.columns.map((k) => (
                              <th key={k.id} className="sx-num-h sx-cand-coord">{k.head}</th>
                            ))}
                            {ids.map((id) => {
                              const m = metricInfo(id, defs);
                              const on = sort?.metric === id;
                              return (
                                <th
                                  key={id}
                                  className="sx-num-h"
                                  aria-sort={on ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}
                                >
                                  <button type="button" className={`sx-sort${on ? " sx-sort-on" : ""}`} onClick={() => sortBy(id)}>
                                    {m.label}{m.unit ? ` ${m.unit}` : ""}
                                    <span aria-hidden="true">{on ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}</span>
                                  </button>
                                </th>
                              );
                            })}
                            <th>State</th>
                            <th>Picked</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map(({ c, s }) => {
                            const rowState = c.current?.row_state ?? "missing";
                            const origin = originBadge(c);
                            const open = focus?.candidate_id === c.candidate_id;
                            const [day, time] = c.picked_at.replace("T", " ").slice(0, 16).split(" ");
                            return (
                              <tr
                                key={c.candidate_id}
                                className={`sx-cand-row${open ? " sx-cand-open" : ""}${picked.has(c.candidate_id) ? " sx-cand-picked-row" : ""}`}
                                tabIndex={0}
                                aria-selected={open}
                                title={meaningLine(c)}
                                onClick={() => setFocused(open ? null : c.candidate_id)}
                                onKeyDown={(e) => {
                                  if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                                  e.preventDefault();
                                  setFocused(open ? null : c.candidate_id);
                                }}
                              >
                                <td className="sx-cand-checkcol" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    className="sx-cand-check"
                                    aria-label="Select candidate"
                                    checked={picked.has(c.candidate_id)}
                                    onChange={() => pick(c.candidate_id)}
                                  />
                                </td>
                                {g.columns.map((k) => (
                                  <td key={k.id} className="sx-num sx-cand-coord">{coordValue(c, k.id)}</td>
                                ))}
                                {ids.map((id) => cell(id, s, rowState === "changed"))}
                                <td className="sx-cand-state">
                                  {origin && <span className="sx-badge">{origin}</span>}
                                  {rowState !== "same" && <span className="sx-badge sx-badge-warn">{rowState}</span>}
                                  <CatalogMark c={c} />
                                </td>
                                <td className="sx-num sx-cand-picked">
                                  <span>{day}</span>
                                  <span className="sx-cand-time">{time}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
              {focus && side(focus)}
            </div>
          </>
        )}
      </div>
      {exportCandidate && <ExportDialog candidate={exportCandidate} onClose={() => setExporting(null)} />}
    </section>
  );
}
