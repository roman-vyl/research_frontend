import { Fragment, useEffect, useMemo, useState } from "react";

import { ApiError, fetchExperimentManifest } from "@/api/client";
import type { Candidate, CandidateMeaning } from "@/api/candidates";
import type { ExperimentResultSchema } from "@/api/experiments";
import "@/features/surface/surface.css";
import { emitFocus } from "@/features/candidates/focus";
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
import { loadCandidates, unstarPoint, useCandidates } from "@/features/candidates/store";
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
            this point and not a deployable specification.
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

/** The shortlist of starred Surface points: current metrics, row state, and the two ways to open a point. */
export function CandidatesPanel() {
  const { setSelectedRunId } = useWorkbenchReport();
  const { setActiveTab } = useWorkbenchShell();
  const { candidates, status, error } = useCandidates();
  const [filters, setFilters] = useState<Condition[]>(loadFilters);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

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

  const update = (next: Condition[]) => {
    setFilters(next);
    writeSession(FILTERS_KEY, next);
  };

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const unstar = async (c: Candidate) => {
    setActionError(null);
    try {
      await unstarPoint(c.candidate_id);
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

  return (
    <section className="sx" aria-label="Candidates">
      <div className="sx-wrap sx-wrap-wide">
        <header>
          <div className="sx-eyebrow">Research · Shortlist</div>
          <h1>Candidates</h1>
          <p className="sx-sub">
            Points starred on the Surface. Metrics are those of the point's row now; a changed row shows the value at the
            time of the star on hover.
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
            <div className="sx-panel sx-cand-scroll">
              <table className="sx-cand-table" aria-label="Candidates">
                <thead>
                  <tr>
                    <th className="sx-cand-starcol" aria-label="star" />
                    <th className="sx-cand-point">Point</th>
                    {ids.map((id) => {
                      const m = metricInfo(id, defs);
                      return <th key={id} className="sx-num-h">{m.label}{m.unit ? ` ${m.unit}` : ""}</th>;
                    })}
                    <th>Picked</th>
                    <th className="sx-cand-actcol">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ c, s }) => {
                    const rowState = c.current?.row_state ?? "missing";
                    const runId = c.current?.run_id ?? null;
                    const origin = originBadge(c);
                    const hint = STATE_HINT[rowState];
                    const expanded = open.has(c.candidate_id);
                    const [day, time] = c.picked_at.replace("T", " ").slice(0, 16).split(" ");
                    return (
                      <Fragment key={c.candidate_id}>
                        <tr className={expanded ? "sx-cand-open" : undefined}>
                          <td className="sx-cand-starcol">
                            <button type="button" className="sx-cand-star" aria-label="Unstar candidate" title="Remove from candidates" onClick={() => unstar(c)}>★</button>
                          </td>
                          <td className="sx-cand-point">
                            <div className="sx-cand-title">{c.current?.meaning?.title ?? c.experiment_id}</div>
                            <div className="sx-cand-chips" title={meaningLine(c)}>
                              {meaningParts(c).map((p, i) => <span key={i} className="sx-chip">{p}</span>)}
                            </div>
                            {(origin || rowState !== "same") && (
                              <div className="sx-cand-badges">
                                {origin && <span className="sx-badge">{origin}</span>}
                                {rowState !== "same" && <span className="sx-badge sx-badge-warn">{rowState}</span>}
                              </div>
                            )}
                          </td>
                          {ids.map((id) => cell(id, s, rowState === "changed"))}
                          <td className="sx-num sx-cand-picked">
                            <span>{day}</span>
                            <span className="sx-cand-time">{time}</span>
                          </td>
                          <td className="sx-cand-actcol">
                            <div className="sx-cand-actions">
                              <button
                                type="button"
                                className="sx-act sx-act-toggle"
                                onClick={() => toggle(c.candidate_id)}
                                aria-expanded={expanded}
                              >
                                Details<span aria-hidden="true" className="sx-chev">›</span>
                              </button>
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
                            </div>
                            {hint && <div className="sx-note">{hint}</div>}
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="sx-cand-detailrow">
                            <td colSpan={ids.length + 4}>
                              <Details c={c} meaning={c.current?.meaning ?? null} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
