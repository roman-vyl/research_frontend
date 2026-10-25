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
const COLUMNS_KEY = "candidates.columns";

/** Metric columns shown until the viewer picks their own: the usual ones, or all when none of them is present. */
const DEFAULT_COLUMNS = ["net_pnl", "return_pct", "profit_factor", "max_drawdown_pct", "win_rate", "realised_trade_count", "cumulative_net_r"];

function loadColumns(): string[] | null {
  const raw = readSession<unknown>(COLUMNS_KEY);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : null;
}

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

/** The point's own coordinates (`<label> <value> <unit>`), without the anchor and the fee shown elsewhere. */
function pointParts(c: Candidate): string[] {
  const m = c.current?.meaning;
  if (!m) return Object.entries(c.coords).filter(([, v]) => v !== null).map(([k, v]) => `${k} ${v}`);
  return m.coords.filter((x) => x.value !== null).map((x) => `${x.label} ${x.value}${x.unit ? ` ${x.unit}` : ""}`);
}

/** Ticker and anchor of the row; the Experiment id stands in for the title when the row is not found. */
function identity(c: Candidate): { title: string; ticker: string; anchor: string } {
  const m = c.current?.meaning;
  return { title: m?.title ?? c.experiment_id, ticker: m?.ticker ?? "", anchor: m?.anchor ?? "" };
}

/** Value colour of a metric cell: profit and loss by sign, drawdown always in the loss ink. */
function tone(id: string, v: number | null | undefined): string {
  if (typeof v !== "number") return "";
  if (id === "max_drawdown_pct") return v !== 0 ? " sx-loss" : "";
  if (SIGNED.has(id) || id === "cumulative_net_r") return v > 0 ? " sx-gain" : v < 0 ? " sx-loss" : "";
  return "";
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

/** The shortlist of starred Surface points: one flat table, a row per point, the point's actions in a side panel. */
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
  const [columns, setColumns] = useState<string[] | null>(loadColumns);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    void loadCandidates();
  }, []);

  const schemas = useResultSchemas(candidates.map((c) => c.experiment_id));
  const defs = useMemo(() => metricDefs(schemas), [schemas]);
  const shown = useMemo(() => candidates.map(shownMetrics), [candidates]);
  const allIds = useMemo(() => metricIds(shown), [shown]);
  /** Metric columns of the table: the viewer's pick from the run table's metrics; filters and sorting still see all. */
  const ids = useMemo(() => {
    if (columns) return allIds.filter((id) => columns.includes(id));
    const usual = allIds.filter((id) => DEFAULT_COLUMNS.includes(id));
    return usual.length > 0 ? usual : allIds;
  }, [allIds, columns]);
  const schema = useMemo(() => filterSchema(allIds, defs), [allIds, defs]);

  const visible = useMemo(() => {
    const rows = shown.map((s) => depthRow(s.metrics));
    const pass = makePasses(schema, rows, depthConditions(filters), () => new Map());
    return candidates.map((c, i) => ({ c, s: shown[i], ok: pass(rows[i]) })).filter((x) => x.ok);
  }, [candidates, shown, schema, filters]);

  const rows = useMemo(() => sortRows(visible, sort), [visible, sort]);
  const profitable = visible.filter((x) => typeof x.s.metrics.net_pnl === "number" && x.s.metrics.net_pnl > 0).length;

  /** Selected rows that are still in the list and pass the filters: hidden rows are never removed. */
  const selected = useMemo(() => visible.filter((x) => picked.has(x.c.candidate_id)).map((x) => x.c.candidate_id), [visible, picked]);
  const allPicked = visible.length > 0 && selected.length === visible.length;

  const focus = focused === null ? null : (visible.find((x) => x.c.candidate_id === focused)?.c ?? null);
  const exportCandidate = exporting === null ? null : (candidates.find((c) => c.candidate_id === exporting) ?? null);

  const toggleColumn = (id: string) => {
    const now = new Set(ids);
    if (now.has(id)) now.delete(id);
    else now.add(id);
    const next = allIds.filter((x) => now.has(x));
    setColumns(next);
    writeSession(COLUMNS_KEY, next);
  };

  const setAllColumns = (next: string[] | null) => {
    setColumns(next);
    writeSession(COLUMNS_KEY, next);
  };

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
        className={`sx-num${s.stale ? " sx-stale" : tone(id, v)}`}
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
    <section className="sx sx-cand-dark" aria-label="Candidates">
      <div className="sx-wrap sx-wrap-wide">
        <header>
          <div className="sx-eyebrow">Research · Shortlist</div>
          <h1>Candidates</h1>
          <p className="sx-sub">
            Points starred on the Surface. Click a row for its details and actions. A changed row
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
              <span className="sx-cand-summary">
                Profitable: <b className="sx-gain">{visible.length ? Math.round((profitable / visible.length) * 100) : 0}%</b> ({profitable} of {visible.length})
              </span>
              <div className="sx-cand-colpick">
                <button
                  type="button"
                  className="sx-act"
                  aria-expanded={picking}
                  onClick={() => setPicking((v) => !v)}
                >
                  Columns ({ids.length}/{allIds.length})
                </button>
                {picking && (
                  <div className="sx-panel sx-cand-colmenu" role="group" aria-label="Columns from the run table">
                    <div className="sx-cand-colmenu-head">
                      <span className="sx-note">Columns from the run table</span>
                      <button type="button" className="sx-cand-close" aria-label="Close columns" onClick={() => setPicking(false)}>×</button>
                    </div>
                    <div className="sx-cand-colmenu-list">
                      {allIds.map((id) => {
                        const m = metricInfo(id, defs);
                        return (
                          <label key={id} className="sx-cand-colitem">
                            <input
                              type="checkbox"
                              className="sx-cand-check"
                              checked={ids.includes(id)}
                              onChange={() => toggleColumn(id)}
                            />
                            {m.label}{m.unit ? ` ${m.unit}` : ""}
                          </label>
                        );
                      })}
                    </div>
                    <div className="sx-cand-colmenu-foot">
                      <button type="button" className="sx-act" onClick={() => setAllColumns([...allIds])}>All</button>
                      <button type="button" className="sx-act" onClick={() => setAllColumns(null)}>Default</button>
                    </div>
                  </div>
                )}
              </div>
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
              <div className="sx-panel sx-cand-groups">
                <div className="sx-cand-scroll">
                  <table className="sx-cand-table" aria-label="Candidates">
                    <thead>
                      <tr>
                        <th className="sx-cand-checkcol" aria-label="select" />
                        <th>Picked</th>
                        <th>Experiment</th>
                        <th>Ticker</th>
                        <th>Point</th>
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
                        <th>Run</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ c, s }) => {
                        const rowState = c.current?.row_state ?? "missing";
                        const origin = originBadge(c);
                        const open = focus?.candidate_id === c.candidate_id;
                        const who = identity(c);
                        const point = pointParts(c);
                        const [day, time] = c.picked_at.replace("T", " ").slice(0, 16).split(" ");
                        return (
                          <tr
                            key={c.candidate_id}
                            className={`sx-cand-row${open ? " sx-cand-open" : ""}${picked.has(c.candidate_id) ? " sx-cand-picked-row" : ""}`}
                            tabIndex={0}
                            aria-selected={open}
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
                            <td className="sx-cand-picked">
                              <span>{day}</span>
                              <span className="sx-cand-time">{time}</span>
                            </td>
                            <td className="sx-cand-exp">
                              <span className="sx-cand-clamp" title={who.title}>{who.title}</span>
                            </td>
                            <td className="sx-cand-tags">
                              {who.ticker && <span className="sx-tag">{who.ticker}</span>}
                              {who.anchor && <span className="sx-tag">{who.anchor}</span>}
                            </td>
                            <td className="sx-cand-pt" title={meaningLine(c)}>
                              <span className="sx-cand-clamp">{point.join(" · ") || "—"}</span>
                            </td>
                            {ids.map((id) => cell(id, s, rowState === "changed"))}
                            <td className="sx-cand-state">
                              {origin && <span className={`sx-badge${c.current?.run_id ? " sx-badge-ok" : ""}`}>{origin}</span>}
                              {rowState !== "same" && <span className="sx-badge sx-badge-warn">{rowState}</span>}
                              <CatalogMark c={c} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
