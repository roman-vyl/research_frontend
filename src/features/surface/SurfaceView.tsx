import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { metricId, type ExperimentResultSchema, type ExperimentView } from "@/api/experiments";

import "@/features/surface/surface.css";
import { coordNumber, coordsMatch, focusControls, rowCoords } from "@/features/candidates/coords";
import { emitFocus, subscribeFocus, type FocusRequest } from "@/features/candidates/focus";
import { loadCandidates, useCandidates } from "@/features/candidates/store";
import { useWorkbenchReport, useWorkbenchShell } from "@/shared/context/WorkbenchContext";
import { readSession, writeSession } from "@/shared/session/storage";
import { AllSettingsStage } from "@/features/surface/AllSettingsStage";
import { evaluateAllSettings, neededMetrics, snapshotColumns, type FilterScope } from "@/features/surface/allSettings";
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
  buildMatrix,
  cellKey,
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
  selectionRuns,
  EMPTY_SELECTION,
  sliceRows,
  treatmentArms,
  withNetPnl,
  type Condition,
  type Row,
  type ViewMode,
  type ViewState,
} from "@/features/surface/model";
import { useExperimentData } from "@/features/surface/useExperimentData";
import { useExperimentStorage } from "@/features/surface/useExperimentStorage";
import { useAllSettingsSnapshot } from "@/features/surface/useAllSettingsSnapshot";
import { DeleteRunsDialog, SelectionBar } from "@/features/surface/RunDeletion";
import { CalculateDialog, canCalculate } from "@/features/surface/RunCalculation";
import type { CalculationCoords, CalculationJob } from "@/api/experiments";
import { StorageBlock } from "@/features/surface/StorageBlock";

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
const EPS = 1e-9;

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

const scopeKey = (experimentId: string): string => `surface.scope.${experimentId}`;

function loadScope(experimentId: string | null): FilterScope {
  return experimentId !== null && readSession<unknown>(scopeKey(experimentId)) === "all" ? "all" : "view";
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
  const { storage, drop: dropStorage } = useExperimentStorage(data.registry, experimentId);
  // Cells picked for "Delete runs": only cells of the visible slice and controls (keys from `cellKey`).
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  // Where the filters apply: the displayed grid, or every setting of the Experiment (one snapshot, loaded on demand).
  const [scope, setScopeState] = useState<FilterScope>(() => loadScope(restoreRef.current?.experimentId ?? null));
  const [allVersion, setAllVersion] = useState(0);
  const [calculating, setCalculating] = useState<{ rows: CalculationCoords[]; notAddressable: number } | null>(null);
  // A "show this point" request from the Candidates tab: the slice part is applied once the Experiment's
  // options are known, the controls and the selection once the matching slice has arrived.
  const focusRef = useRef<FocusRequest | null>(null);
  const focusSliceRef = useRef<FocusRequest | null>(null);
  const switchRef = useRef<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const { candidates } = useCandidates();

  useEffect(() => {
    void loadCandidates();
  }, []);

  useEffect(
    () =>
      subscribeFocus((req) => {
        focusRef.current = req;
        focusSliceRef.current = req;
        // a point is shown on the displayed grid
        setScopeState("view");
        writeSession(scopeKey(req.experimentId), "view");
        restoreRef.current = null;
        if (req.experimentId !== experimentId) {
          // go through the Experiment list so that no data of the previous Experiment is mixed in
          if (experimentId === null) setExperimentId(req.experimentId);
          else {
            switchRef.current = req.experimentId;
            setExperimentId(null);
          }
        }
        setFocusTick((t) => t + 1);
      }),
    [experimentId],
  );

  useEffect(() => {
    if (experimentId === null && switchRef.current !== null) {
      const next = switchRef.current;
      switchRef.current = null;
      setExperimentId(next);
    }
  }, [experimentId]);

  useEffect(() => {
    const restore = restoreRef.current;
    setOuterValue(restore && restore.experimentId === experimentId ? restore.outerValue : null);
    setState(null);
    setSelected(null);
    setScopeState(loadScope(experimentId));
    if (restore && restore.experimentId !== experimentId) restoreRef.current = null;
  }, [experimentId]);

  useEffect(() => {
    if (outer && outerValue === null) setOuterValue(outer.options[0] ?? null);
  }, [outer, outerValue]);

  // The same row objects feed the heat map, so that a selected point is the highlighted cell.
  const rows = useMemo(() => addNetPnl(slice?.rows ?? [], equity), [slice, equity]);
  const outerId = outer?.id ?? null;
  const outerOptions = outer?.options ?? null;
  useEffect(() => {
    const f = focusSliceRef.current;
    if (!f || f.experimentId !== experimentId || outerId === null || outerOptions === null) return;
    focusSliceRef.current = null;
    const v = coordNumber(f.coords[outerId]);
    const option = v === null ? undefined : outerOptions.find((o) => Math.abs(o - v) <= EPS);
    if (option !== undefined) setOuterValue(option);
  }, [focusTick, outerId, outerOptions, experimentId]);

  // The cells view is the first one that is not an aggregate.
  const view = schema ? (schema.view.find((v) => !v.aggregate_over) ?? schema.view[0]) : null;

  // (Re)initialise the view state when a slice arrives (first time: from the remembered session, if any).
  useEffect(() => {
    if (!schema || !view || !slice || data.outerId === null || outerValue === null || experimentId === null) return;
    const sliceRows0 = rows;
    const restore = restoreRef.current && restoreRef.current.experimentId === experimentId ? restoreRef.current : null;
    restoreRef.current = null;
    let focus = focusRef.current;
    if (focus) {
      // only the slice of the requested SL (not a stale one) can answer the request
      const want = coordNumber(focus.coords[data.outerId]);
      const first = sliceRows0[0]?.[data.outerId];
      const here = focus.experimentId === experimentId && want !== null && Math.abs(want - outerValue) <= EPS;
      if (here && typeof first === "number" && Math.abs(first - want) <= EPS) focusRef.current = null;
      else focus = null;
    }
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
      if (focus) base = { ...base, mode: "treatment", controls: focusControls(schema, view, data.outerId as string, focus.coords, base.controls) };
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
    if (focus) {
      const want = focus.coords;
      point = sliceRows0.find((r) => coordsMatch(want, rowCoords(schema, r))) ?? null;
    }
    setSelected(point);
  }, [schema, view, slice, outerValue, data.outerId, experimentId, rows, focusTick]);

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

  const options = useMemo(
    () => (schema && view && state ? controlOptions(schema, view, rows, state.controls) : {}),
    [schema, view, rows, state],
  );

  const isStarred = useMemo(() => {
    const mine = candidates.filter((c) => c.experiment_id === experimentId);
    if (!schema || mine.length === 0) return null;
    return (row: Row): boolean => {
      const coords = rowCoords(schema, row);
      return mine.some((c) => coordsMatch(c.coords, coords));
    };
  }, [candidates, experimentId, schema]);

  // A selected point (for example one opened from the Candidates tab) that the active filters grey out.
  const hiddenByFilters = useMemo(() => {
    if (!schema || !view || !state || !selected || activeConditions(state.filters).length === 0) return false;
    const sliced = sliceRows(schema, view, rows, state.controls, treatmentArms(schema));
    return !makePasses(schema, sliced, state.filters, makeIndexer(schema, rows, state.compare ?? schema.arms?.baseline ?? null))(selected);
  }, [schema, view, state, rows, selected]);

  const allColumns = useMemo(
    () => (scope === "all" && manifest && schema && state ? snapshotColumns(manifest.result_schema, neededMetrics(schema, state.metric, state.filters)) : null),
    [scope, manifest, schema, state],
  );
  const all = useAllSettingsSnapshot(experimentId, allColumns, allVersion);
  const allResult = useMemo(() => {
    if (scope !== "all" || !all.snap || !schema || !view || !state) return null;
    return evaluateAllSettings(schema, view, all.snap, {
      filters: state.filters,
      metric: state.metric,
      mode: state.mode,
      compare: state.compare,
      equity,
    });
  }, [scope, all.snap, schema, view, state, equity]);

  const setScope = (next: FilterScope) => {
    setScopeState(next);
    if (experimentId !== null) writeSession(scopeKey(experimentId), next);
    if (next === "all") {
      setSelectMode(false);
      setPicked(new Set());
    }
  };

  // Open a setting found under "All settings" on the displayed grid (same path as "On Surface" of a candidate).
  const openSetting = (row: Row) => {
    if (!schema || experimentId === null) return;
    setScope("view");
    // stored coordinates are text, as the candidate API keeps them
    const coords = Object.fromEntries(Object.entries(rowCoords(schema, row)).map(([k, v]) => [k, v === null ? null : String(v)]));
    emitFocus({ experimentId, coords });
  };

  const summary = useMemo(() => {
    if (scope === "all") {
      if (!allResult) return "";
      return `${allResult.matched.toLocaleString("en-US")} of ${allResult.total.toLocaleString("en-US")} settings match · ${allResult.cells.size} of ${allResult.cellTotal} cells have a match`;
    }
    if (!schema || !view || !state) return "";
    const active = activeConditions(state.filters);
    if (active.length === 0) return "no active conditions";
    const sliced = sliceRows(schema, view, rows, state.controls, treatmentArms(schema));
    const idx = makeIndexer(schema, rows, state.compare);
    const pass = sliced.filter(makePasses(schema, sliced, state.filters, idx)).length;
    const cmp = schema.arms ? `, vs ${armLabel(state.compare ?? schema.arms.baseline)}` : "";
    return `${pass} / ${sliced.length} cells pass (${active.length} condition${active.length > 1 ? "s" : ""}${cmp})`;
  }, [schema, view, state, rows, scope, allResult]);

  // Any change of what is visible clears the picked cells.
  const visibleKey = JSON.stringify([experimentId, outerValue, state?.controls ?? null, state?.mode ?? null, state?.compare ?? null]);
  useEffect(() => setPicked(new Set()), [visibleKey]);

  const passSplit = useMemo(() => {
    const out = { passing: [] as string[], notPassing: [] as string[] };
    if (!schema || !view || !state) return out;
    const sliced = sliceRows(schema, view, rows, state.controls, treatmentArms(schema));
    const matrix = buildMatrix(schema, view, sliced, state.controls);
    const filtersOn = activeConditions(state.filters).length > 0;
    const pass = makePasses(schema, sliced, state.filters, makeIndexer(schema, rows, state.compare ?? schema.arms?.baseline ?? null));
    matrix.ys.forEach((y, yi) =>
      matrix.xs.forEach((x, xi) => {
        const r = matrix.cells[yi][xi];
        if (!r) return;
        (!filtersOn || pass(r) ? out.passing : out.notPassing).push(cellKey(x, y));
      }),
    );
    return out;
  }, [schema, view, state, rows]);

  const selection = useMemo(
    () => (schema && view && state ? selectionRuns(schema, view, rows, state, picked) : EMPTY_SELECTION),
    [schema, view, state, rows, picked],
  );

  // Esc leaves select mode; the delete dialog handles its own keys.
  useEffect(() => {
    if (!selectMode || deleting || calculating) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelectMode(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode, deleting, calculating]);

  const pick = (keys: string[], how: "toggle" | "add") =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (how === "toggle" && next.has(k)) next.delete(k);
        else next.add(k);
      }
      return next;
    });

  const afterDeletion = () => {
    if (experimentId === null) return;
    setPicked(new Set());
    dropStorage(experimentId);
    // Reload the slice and keep the point shown in details (its run_id may now be empty).
    const x = schema && view && selected ? dimValue(schema, selected, view.x, null) : null;
    const y = schema && view && selected ? dimValue(schema, selected, view.y, null) : null;
    restoreRef.current = { experimentId, outerValue, selected: x !== null && y !== null ? { x, y } : null };
    data.reload();
    setAllVersion((v) => v + 1);
  };

  // The job is over: clear the selection; reload the slice only when a row was published.
  const afterCalculation = (job: CalculationJob) => {
    setPicked(new Set());
    if ((job.counts.published ?? 0) > 0) afterDeletion();
  };

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
                  <StorageBlock entry={storage[x.experiment_id]} />
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
            <StorageBlock entry={storage[experimentId]} />
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
              scope={{ value: scope, allLabel: allSettingsLabel(schema, view), note: scopeNote(scope, allResult?.total ?? null), onChange: setScope }}
            />
            <SurfaceSliders schema={schema} view={view} state={state} options={options} outer={outer} onControl={setControl} onToggle={toggleOptional} hints={optionalHints} />
            {scope === "all" ? (
              <>
                {all.error && <p role="alert" className="sx-error">{all.error}</p>}
                {all.loading && <p className="sx-note">Loading all settings… one request, {allColumns?.length ?? 0} columns.</p>}
                {allResult && all.snap && !all.loading && (
                  <AllSettingsStage
                    schema={schema}
                    view={view}
                    snap={all.snap}
                    result={allResult}
                    metric={state.metric}
                    mode={state.mode}
                    equity={equity}
                    tokens={tokens}
                    onOpen={openSetting}
                  />
                )}
              </>
            ) : (
              <>
              <SelectionBar
                selection={selection}
                selectMode={selectMode}
                onSelectMode={setSelectMode}
                onSelectPassing={() => setPicked(new Set(passSplit.passing))}
                onSelectNotPassing={() => setPicked(new Set(passSplit.notPassing))}
                onClear={() => setPicked(new Set())}
                onDelete={() => setDeleting(selection.runIds)}
                calculable={canCalculate(manifest)}
                onCalculate={() => setCalculating({ rows: selection.calcCoords, notAddressable: selection.notAddressable })}
              />
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
                picked={picked}
                onPick={pick}
                pickMode={selectMode}
                isStarred={isStarred}
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
              </>
            )}
            {selected && experimentId !== null && (
              <CellDetails
                schema={schema}
                experimentId={experimentId}
                hiddenByFilters={hiddenByFilters}
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
            {deleting && experimentId !== null && (
              <DeleteRunsDialog
                experimentId={experimentId}
                runIds={deleting}
                onClose={() => setDeleting(null)}
                onDeleted={afterDeletion}
              />
            )}
            {calculating && experimentId !== null && (
              <CalculateDialog
                experimentId={experimentId}
                rows={calculating.rows}
                notAddressable={calculating.notAddressable}
                onClose={() => setCalculating(null)}
                onFinished={afterCalculation}
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

/** "All settings (SL × ADX timeframe × …)": the cells view controls other than its axes, from the manifest. */
function allSettingsLabel(schema: ExperimentResultSchema, view: ExperimentView): string {
  const names = view.controls
    .filter((id) => id !== view.x && id !== view.y)
    .map((id) => (id === GRID_ID ? "grid" : (dimById(schema, id)?.label ?? id)));
  return names.length > 0 ? `All settings (${names.join(" × ")})` : "All settings";
}

function scopeNote(scope: FilterScope, total: number | null): string {
  if (scope === "view") return "Conditions check only the settings shown on the surface; top / bottom % rank the cells shown. Failing cells turn grey.";
  const n = total === null ? "all" : `all ${total.toLocaleString("en-US")}`;
  return `Conditions check every setting of each cell; top / bottom % rank ${n} settings. A cell shows its best matching setting and how many settings match; click it to open it on the displayed grid.`;
}
