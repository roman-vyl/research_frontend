import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { metricId } from "@/api/experiments";

import "@/features/surface/surface.css";
import { useWorkbenchReport, useWorkbenchShell } from "@/shared/context/WorkbenchContext";
import { readSession, writeSession } from "@/shared/session/storage";
import { CellDetails } from "@/features/surface/CellDetails";
import { EquityPanel } from "@/features/surface/EquityPanel";
import { FiltersPanel } from "@/features/surface/FiltersPanel";
import { HeatStage } from "@/features/surface/HeatStage";
import { LIGHT_TOKENS, readTokens, type Tokens } from "@/features/surface/color";
import { SurfaceControls, SurfaceSliders } from "@/features/surface/SurfaceControls";
import { SurfaceHeader } from "@/features/surface/SurfaceHeader";
import {
  GRID_ID,
  activeConditions,
  addNetPnl,
  armLabel,
  controlOptions,
  controlReadout,
  convertGrid,
  defaultState,
  dimById,
  dimColumn,
  dimValue,
  initialEquity,
  makeIndexer,
  makePasses,
  reconcileControls,
  sliceRows,
  treatmentArms,
  withNetPnl,
  type Condition,
  type Row,
  type ViewMode,
  type ViewState,
} from "@/features/surface/model";
import { useExperimentData } from "@/features/surface/useExperimentData";

type StoredSurface = {
  experimentId: string | null;
  outerValue: number | null;
  metric?: string;
  mode?: ViewMode;
  compare?: string | null;
  controls?: Record<string, string | number>;
  selected?: { x: number; y: number } | null;
};
const SESSION_KEY = "surface";

const filtersKey = (experimentId: string): string => `surface.filters.${experimentId}`;

function loadFilters(experimentId: string): Condition[] {
  const raw = readSession<unknown>(filtersKey(experimentId));
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

function saveFilters(experimentId: string, filters: Condition[]): void {
  writeSession(filtersKey(experimentId), filters);
}

function useTokens(ref: React.RefObject<HTMLElement | null>): Tokens {
  const [tokens, setTokens] = useState<Tokens>(LIGHT_TOKENS);
  useLayoutEffect(() => {
    const read = () => {
      if (ref.current) setTokens(readTokens(ref.current));
    };
    read();
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    mq?.addEventListener?.("change", read);
    return () => mq?.removeEventListener?.("change", read);
  }, [ref]);
  return tokens;
}

/**
 * Viewer of an Experiment's ready-made results. All state is local to this component; its only
 * link to the workbench is `setSelectedRunId(run_id)` from the explicit "Open run" action.
 */
export function SurfaceView() {
  const { setSelectedRunId } = useWorkbenchReport();
  const { setActiveTab } = useWorkbenchShell();
  const rootRef = useRef<HTMLElement>(null);
  const tokens = useTokens(rootRef);
  // What a page refresh restores: the open Experiment, the SL slice, metric, arm view, sliders and the selected point.
  const restoreRef = useRef<StoredSurface | null>(readSession<StoredSurface>(SESSION_KEY));
  const [experimentId, setExperimentId] = useState<string | null>(restoreRef.current?.experimentId ?? null);
  const [outerValue, setOuterValue] = useState<number | null>(restoreRef.current?.outerValue ?? null);
  const data = useExperimentData(experimentId, outerValue);
  const { manifest, slice, outer } = data;
  const equity = useMemo(() => initialEquity(manifest), [manifest]);
  const schema = useMemo(() => (manifest ? withNetPnl(manifest.result_schema, equity) : null), [manifest, equity]);
  const [state, setState] = useState<ViewState | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);

  useEffect(() => {
    const restore = restoreRef.current;
    setOuterValue(restore && restore.experimentId === experimentId ? restore.outerValue : null);
    setState(null);
    setSelected(null);
    if (restore && restore.experimentId !== experimentId) restoreRef.current = null;
  }, [experimentId]);

  useEffect(() => {
    if (outer && outerValue === null) setOuterValue(outer.options[0] ?? null);
  }, [outer, outerValue]);

  // The cells view is the first one that is not an aggregate.
  const view = schema ? (schema.view.find((v) => !v.aggregate_over) ?? schema.view[0]) : null;

  // (Re)initialise the view state when a slice arrives (first time: from the remembered session, if any).
  useEffect(() => {
    if (!schema || !view || !slice || data.outerId === null || outerValue === null || experimentId === null) return;
    const sliceRows0 = addNetPnl(slice.rows, equity);
    const restore = restoreRef.current && restoreRef.current.experimentId === experimentId ? restoreRef.current : null;
    restoreRef.current = null;
    setState((prev) => {
      let base = prev;
      if (!base) {
        base = { ...defaultState(schema, view.id, sliceRows0), filters: loadFilters(experimentId) };
        if (restore) {
          const metrics = new Set(schema.metrics.map(metricId));
          base = {
            ...base,
            metric: restore.metric && metrics.has(restore.metric) ? restore.metric : base.metric,
            mode: restore.mode && (schema.arms || restore.mode === "treatment") ? restore.mode : base.mode,
            compare:
              restore.compare && schema.arms && restore.compare in schema.arms.roles ? restore.compare : base.compare,
            controls: { ...base.controls, ...(restore.controls ?? {}) },
          };
        }
      }
      const controls = reconcileControls(schema, view, sliceRows0, { ...base.controls, [data.outerId as string]: outerValue });
      return { ...base, controls: { ...controls, [data.outerId as string]: outerValue } };
    });
    let point: Row | null = null;
    if (restore?.selected) {
      const pos = restore.selected;
      point =
        sliceRows0.find(
          (r) =>
            (!schema.arms || treatmentArms(schema)?.includes(String(r.arm))) &&
            dimValue(schema, r, view.x, null) === pos.x &&
            dimValue(schema, r, view.y, null) === pos.y,
        ) ?? null;
    }
    setSelected(point);
  }, [schema, view, slice, outerValue, data.outerId, experimentId, equity]);

  // Remember the session for the next page load.
  useEffect(() => {
    if (experimentId !== null && state === null) return; // still restoring: keep what was stored
    writeSession(SESSION_KEY, {
      experimentId,
      outerValue,
      metric: state?.metric,
      mode: state?.mode,
      compare: state?.compare,
      controls: state?.controls,
      selected:
        schema && view && selected
          ? { x: dimValue(schema, selected, view.x, null), y: dimValue(schema, selected, view.y, null) }
          : null,
    });
  }, [experimentId, outerValue, state, selected, schema, view]);

  const rows = useMemo(() => addNetPnl(slice?.rows ?? [], equity), [slice, equity]);
  const options = useMemo(
    () => (schema && view && state ? controlOptions(schema, view, rows, state.controls) : {}),
    [schema, view, rows, state],
  );

  const summary = useMemo(() => {
    if (!schema || !view || !state) return "";
    const active = activeConditions(state.filters);
    if (active.length === 0) return "no active conditions";
    const sliced = sliceRows(schema, view, rows, state.controls, treatmentArms(schema));
    const idx = makeIndexer(schema, rows, state.compare);
    const pass = sliced.filter(makePasses(schema, sliced, state.filters, idx)).length;
    const cmp = schema.arms ? `, vs ${armLabel(state.compare ?? schema.arms.baseline)}` : "";
    return `${pass} / ${sliced.length} cells pass (${active.length} condition${active.length > 1 ? "s" : ""}${cmp})`;
  }, [schema, view, state, rows]);

  const update = (patch: Partial<ViewState>) => {
    setState((s) => (s ? { ...s, ...patch } : s));
    if (patch.filters && experimentId !== null) saveFilters(experimentId, patch.filters);
  };

  const setControl = (id: string, value: string | number) => {
    if (!schema || !view || !state) return;
    if (id === data.outerId && typeof value === "number") {
      setOuterValue(value);
      return;
    }
    const next = id === GRID_ID && typeof value === "string" ? convertGrid(schema, state.controls, value) : { ...state.controls, [id]: value };
    update({ controls: reconcileControls(schema, view, rows, next) });
  };

  const toggleOptional = (id: string, on: boolean) => {
    if (!schema || !view || !state) return;
    const controls = { ...state.controls };
    if (on) {
      const first = options[id]?.[0];
      if (first === undefined) return;
      controls[id] = first;
    } else {
      delete controls[id];
    }
    update({ controls: reconcileControls(schema, view, rows, controls) });
  };

  // For each optional control: the geometry of this slice that has the most rows with a value for it.
  const optionalHints = useMemo(() => {
    const out: Record<string, { label: string; go: () => void } | undefined> = {};
    if (!schema || !view || !state) return out;
    const free = new Set([view.x, view.y, ...(view.aggregate_over ?? [])]);
    const arms = treatmentArms(schema);
    for (const id of view.controls) {
      const od = dimById(schema, id);
      if (!od?.optional) continue;
      const geo = view.controls.filter((c) => c !== data.outerId && !free.has(c) && c !== id && !dimById(schema, c)?.optional);
      const counts = new Map<string, { n: number; values: Record<string, string | number> }>();
      for (const r of rows) {
        if (arms && !arms.includes(String(r.arm))) continue;
        const grid = typeof r[GRID_ID] === "string" ? (r[GRID_ID] as string) : null;
        if (typeof r[dimColumn(od, grid)] !== "number") continue;
        const values: Record<string, string | number> = {};
        for (const c of geo) {
          if (c === GRID_ID) {
            if (grid !== null) values[c] = grid;
            continue;
          }
          const d = dimById(schema, c);
          const v = d ? r[dimColumn(d, grid)] : null;
          if (typeof v === "number") values[c] = v;
        }
        const key = JSON.stringify(values);
        const hit = counts.get(key) ?? { n: 0, values };
        hit.n += 1;
        counts.set(key, hit);
      }
      const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
      if (!best) continue;
      const g = typeof best.values[GRID_ID] === "string" ? (best.values[GRID_ID] as string) : null;
      const sl = typeof state.controls.sl === "number" ? state.controls.sl : null;
      const label = Object.entries(best.values)
        .map(([c, v]) => (c === GRID_ID ? `${v} grid` : `${dimById(schema, c)?.label ?? c} ${controlReadout(schema, c, v as number, g, sl).main}`))
        .join(" · ");
      out[id] = {
        label,
        go: () => update({ controls: reconcileControls(schema, view, rows, { ...state.controls, ...best.values }) }),
      };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, view, state, rows, data.outerId]);

  const entry = data.registry?.find((x) => x.experiment_id === experimentId) ?? null;
  const ready = schema && view && state && slice;
  const cellsFilmstrip = view?.filmstrip ? ((state && options[view.filmstrip]) ?? []) : [];

  return (
    <section className="sx" ref={rootRef} aria-label="Surface">
      <div className="sx-wrap">
        {experimentId === null ? (
          <>
            <header>
              <div className="sx-eyebrow">Research · Experiments</div>
              <h1>Surface</h1>
              <p className="sx-sub">
                Ready-made results of a research Experiment. Pick an Experiment; points with a run can be opened in Chart and Reports.
              </p>
            </header>
            <div className="sx-cards" role="group" aria-label="Experiments">
              {(data.registry ?? []).map((x) => (
                <button type="button" key={x.experiment_id} className="sx-card sx-panel" onClick={() => setExperimentId(x.experiment_id)}>
                  <span className="sx-eyebrow">{x.ticker} · {x.anchor}</span>
                  <span className="sx-card-title">{x.title}</span>
                </button>
              ))}
              {data.registry !== null && data.registry.length === 0 && <p className="sx-note">No experiments are registered.</p>}
            </div>
          </>
        ) : (
          <>
            <div className="sx-top">
              <button type="button" className="sx-fbtn" onClick={() => setExperimentId(null)}>← All experiments</button>
            </div>
            <SurfaceHeader entry={entry} manifest={manifest} />
          </>
        )}
        {data.error && <p role="alert" className="sx-error">{data.error}</p>}
        {experimentId !== null && data.loading && !ready && <p className="sx-note">Loading…</p>}
        {ready && (
          <>
            <SurfaceControls
              schema={schema}
              view={view}
              state={state}
              options={options}
              onMetric={(metric) => update({ metric })}
              onMode={(mode: ViewMode) => update({ mode })}
              onCompare={(compare) => update({ compare })}
              onControl={setControl}
            />
            <FiltersPanel
              schema={schema}
              filters={state.filters}
              compare={state.compare}
              summary={summary}
              onChange={(filters) => update({ filters })}
            />
            <SurfaceSliders schema={schema} view={view} state={state} options={options} outer={outer} onControl={setControl} onToggle={toggleOptional} hints={optionalHints} />
            <HeatStage
              schema={schema}
              view={view}
              rows={rows}
              state={state}
              tokens={tokens}
              selected={selected}
              filmstripOptions={cellsFilmstrip}
              onSelect={setSelected}
              onPickFrame={(v) => view.filmstrip && setControl(view.filmstrip, v)}
            />
            <EquityPanel
              schema={schema}
              view={view}
              rows={rows}
              state={state}
              selected={selected}
              initialEquity={equity}
              onSelect={setSelected}
            />
            {selected && (
              <CellDetails
                schema={schema}
                row={selected}
                allRows={rows}
                state={state}
                provenance={slice.provenance}
                onOpenRun={(runId) => {
                  setSelectedRunId(runId);
                  setActiveTab("chart");
                }}
              />
            )}
            <footer>
              <span>{entry ? `${entry.ticker} · ${entry.anchor} · ${entry.experiment_id}` : ""}</span>
              <span className="sx-prov">
                data = {schema.table} · provenance {schema.provenance.value ?? schema.provenance.column ?? "—"}
              </span>
            </footer>
          </>
        )}
      </div>
    </section>
  );
}
