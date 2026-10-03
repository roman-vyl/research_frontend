import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import "@/features/surface/surface.css";
import { useWorkbenchReport, useWorkbenchShell } from "@/shared/context/WorkbenchContext";
import { CellDetails } from "@/features/surface/CellDetails";
import { FiltersPanel } from "@/features/surface/FiltersPanel";
import { HeatStage } from "@/features/surface/HeatStage";
import { LIGHT_TOKENS, readTokens, type Tokens } from "@/features/surface/color";
import { SurfaceControls, SurfaceSliders } from "@/features/surface/SurfaceControls";
import { SurfaceHeader } from "@/features/surface/SurfaceHeader";
import {
  GRID_ID,
  activeConditions,
  armLabel,
  controlOptions,
  convertGrid,
  defaultState,
  makeIndexer,
  passes,
  reconcileControls,
  sliceRows,
  treatmentArms,
  type Condition,
  type Row,
  type ViewMode,
  type ViewState,
} from "@/features/surface/model";
import { useExperimentData } from "@/features/surface/useExperimentData";

const filtersKey = (experimentId: string): string => `surface.filters.${experimentId}`;

function loadFilters(experimentId: string): Condition[] {
  try {
    const raw = JSON.parse(localStorage.getItem(filtersKey(experimentId)) ?? "[]") as unknown;
    return Array.isArray(raw)
      ? raw.filter((c): c is Condition => !!c && typeof c.id === "string" && typeof c.metric === "string" && (c.op === ">=" || c.op === "<="))
      : [];
  } catch {
    return [];
  }
}

function saveFilters(experimentId: string, filters: Condition[]): void {
  try {
    localStorage.setItem(filtersKey(experimentId), JSON.stringify(filters));
  } catch {
    /* storage is a convenience only */
  }
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
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [outerValue, setOuterValue] = useState<number | null>(null);
  const data = useExperimentData(experimentId, outerValue);
  const { manifest, slice, outer } = data;
  const schema = manifest?.result_schema ?? null;
  const [state, setState] = useState<ViewState | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);

  useEffect(() => {
    setOuterValue(null);
    setState(null);
    setSelected(null);
  }, [experimentId]);

  useEffect(() => {
    if (outer && outerValue === null) setOuterValue(outer.options[0] ?? null);
  }, [outer, outerValue]);

  // The cells view is the first one that is not an aggregate.
  const view = schema ? (schema.view.find((v) => !v.aggregate_over) ?? schema.view[0]) : null;

  // (Re)initialise the view state when a slice arrives.
  useEffect(() => {
    if (!schema || !view || !slice || data.outerId === null || outerValue === null || experimentId === null) return;
    setState((prev) => {
      const base = prev ?? { ...defaultState(schema, view.id, slice.rows), filters: loadFilters(experimentId) };
      const controls = reconcileControls(schema, view, slice.rows, { ...base.controls, [data.outerId as string]: outerValue });
      return { ...base, controls: { ...controls, [data.outerId as string]: outerValue } };
    });
    setSelected(null);
  }, [schema, view, slice, outerValue, data.outerId, experimentId]);

  const rows = slice?.rows ?? [];
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
    const pass = sliced.filter((r) => passes(schema, r, state.filters, idx)).length;
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
            <SurfaceSliders schema={schema} view={view} state={state} options={options} outer={outer} onControl={setControl} />
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
