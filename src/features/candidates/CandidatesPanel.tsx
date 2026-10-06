import { Fragment, useEffect, useMemo, useState } from "react";

import { ApiError } from "@/api/client";
import type { Candidate, CandidateMeaning } from "@/api/candidates";
import "@/features/surface/surface.css";
import { emitFocus } from "@/features/candidates/focus";
import {
  depthConditions,
  depthRow,
  filterSchema,
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

/** `<anchor> · <label> <value> <unit> · … · fee <entry fee> per side`; the stored coordinates when the row is gone. */
function meaningLine(c: Candidate): string {
  const m = c.current?.meaning;
  if (!m) {
    const coords = Object.entries(c.coords).filter(([, v]) => v !== null).map(([k, v]) => `${k} ${v}`);
    return coords.join(" · ");
  }
  const parts = [m.anchor, ...m.coords.filter((x) => x.value !== null).map((x) => `${x.label} ${x.value}${x.unit ? ` ${x.unit}` : ""}`)];
  const fee = m.fixed_params.entry_fee_rate;
  if (fee !== undefined && fee !== null) parts.push(`fee ${text(fee)} per side`);
  return parts.join(" · ");
}

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

function Details({ c, meaning }: { c: Candidate; meaning: CandidateMeaning | null }) {
  const spec = c.strategy_spec_snapshot;
  return (
    <div className="sx-cand-details">
      <h3>Meaning</h3>
      {meaning ? (
        <dl>
          {meaning.coords.map((x) => (
            <div key={x.id}>
              <dt>{x.label}</dt>
              <dd>{x.value === null ? "—" : `${x.value}${x.unit ? ` ${x.unit}` : ""}`}</dd>
            </div>
          ))}
          {Object.entries(meaning.fixed_params).map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{text(v)}</dd></div>
          ))}
        </dl>
      ) : (
        <p className="sx-note">The row is not in the table now; stored coordinates: {meaningLine(c) || "—"}.</p>
      )}
      {spec && (
        <>
          <h3>Strategy spec of the picked run</h3>
          <p className="sx-note">
            Historical: the spec of run {spec.run_id} as it was when this point was starred. It is not the current spec of
            this point and not a deployable specification.
          </p>
          {spec.source === "run_request" ? (
            <pre aria-label="Historical strategy spec">{JSON.stringify(spec.spec, null, 2)}</pre>
          ) : (
            <p className="sx-note">No spec was stored: {spec.reason}</p>
          )}
        </>
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

  const shown = useMemo(() => candidates.map(shownMetrics), [candidates]);
  const ids = useMemo(() => metricIds(shown), [shown]);
  const schema = useMemo(() => filterSchema(ids), [ids]);

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
    const m = metricInfo(id);
    const v = s.metrics[id];
    const was = s.snapshot[id];
    return (
      <td
        key={id}
        className={`sx-num${s.stale ? " sx-stale" : ""}`}
        title={s.stale ? "row not found: value at the time of the star" : changed ? `at the time of the star: ${formatMetric(m, typeof was === "number" ? was : null)}` : undefined}
      >
        {formatMetric(m, typeof v === "number" ? v : null)}
      </td>
    );
  };

  return (
    <section className="sx" aria-label="Candidates">
      <div className="sx-wrap">
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
                    <th aria-label="star" />
                    <th>Experiment</th>
                    <th>Meaning</th>
                    <th>State</th>
                    {ids.map((id) => {
                      const m = metricInfo(id);
                      return <th key={id}>{m.label}{m.unit ? ` ${m.unit}` : ""}</th>;
                    })}
                    <th>Picked</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ c, s }) => {
                    const rowState = c.current?.row_state ?? "missing";
                    const runId = c.current?.run_id ?? null;
                    const origin = originBadge(c);
                    const hint = STATE_HINT[rowState];
                    const expanded = open.has(c.candidate_id);
                    return (
                      <Fragment key={c.candidate_id}>
                        <tr>
                          <td>
                            <button type="button" className="sx-fbtn sx-starbtn sx-starred" aria-label="Unstar candidate" onClick={() => unstar(c)}>★</button>
                          </td>
                          <td>{c.current?.meaning?.title ?? c.experiment_id}</td>
                          <td>{meaningLine(c)}</td>
                          <td>
                            {origin && <span className="sx-badge">{origin}</span>}
                            {rowState !== "same" && <span className="sx-badge sx-badge-warn">{rowState}</span>}
                          </td>
                          {ids.map((id) => cell(id, s, rowState === "changed"))}
                          <td>{c.picked_at.replace("T", " ").slice(0, 16)}</td>
                          <td>
                            <button type="button" className="sx-fbtn" onClick={() => toggle(c.candidate_id)} aria-expanded={expanded}>
                              {expanded ? "Hide details" : "Details"}
                            </button>{" "}
                            <button
                              type="button"
                              className="sx-fbtn"
                              disabled={!runId}
                              title={runId ? undefined : "no full run"}
                              onClick={() => {
                                if (!runId) return;
                                setSelectedRunId(runId);
                                setActiveTab("chart");
                              }}
                            >
                              Chart
                            </button>{" "}
                            <button
                              type="button"
                              className="sx-fbtn"
                              disabled={hint !== undefined}
                              title={hint}
                              onClick={() => {
                                if (hint !== undefined) return;
                                emitFocus({ experimentId: c.experiment_id, coords: c.coords });
                                setActiveTab("surface");
                              }}
                            >
                              On Surface
                            </button>
                            {!runId && <div className="sx-note">no full run</div>}
                            {hint && <div className="sx-note">{hint}</div>}
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={ids.length + 6}>
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
