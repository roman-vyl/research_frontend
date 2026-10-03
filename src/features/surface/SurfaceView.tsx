import { useEffect, useMemo, useState } from "react";

import { useWorkbenchReport, useWorkbenchShell } from "@/shared/context/WorkbenchContext";
import { CellDetails } from "@/features/surface/CellDetails";
import { FiltersPanel } from "@/features/surface/FiltersPanel";
import { Filmstrip, SurfacePlot } from "@/features/surface/SurfacePlot";
import { SurfaceControls } from "@/features/surface/SurfaceControls";
import {
  baselineIndex,
  controlOptions,
  defaultState,
  dimById,
  passes,
  reconcileControls,
  sliceRows,
  treatmentArms,
  type Row,
  type ViewMode,
  type ViewState,
} from "@/features/surface/model";
import { useExperimentData } from "@/features/surface/useExperimentData";

/**
 * Viewer of an Experiment's ready-made results. All state is local to this component; its only
 * link to the workbench is `setSelectedRunId(run_id)` from the explicit "Open run" action.
 */
export function SurfaceView() {
  const { setSelectedRunId } = useWorkbenchReport();
  const { setActiveTab } = useWorkbenchShell();
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

  // (Re)initialise the view state when a slice arrives.
  useEffect(() => {
    if (!schema || !slice || data.outerId === null || outerValue === null) return;
    setState((prev) => {
      const base = prev ?? defaultState(schema, schema.view[0].id, slice.rows);
      const view = schema.view.find((v) => v.id === base.viewId) ?? schema.view[0];
      const controls = reconcileControls(schema, view, slice.rows, { ...base.controls, [data.outerId as string]: outerValue });
      return { ...base, controls: { ...controls, [data.outerId as string]: outerValue } };
    });
    setSelected(null);
  }, [schema, slice, outerValue, data.outerId]);

  const view = schema && state ? (schema.view.find((v) => v.id === state.viewId) ?? schema.view[0]) : null;
  const rows = slice?.rows ?? [];
  const options = useMemo(
    () => (schema && view && state ? controlOptions(schema, view, rows, state.controls) : {}),
    [schema, view, rows, state],
  );

  const counts = useMemo(() => {
    if (!schema || !view || !state || state.filters.length === 0) return { passing: 0, total: 0 };
    const sliced = sliceRows(schema, view, rows, state.controls, treatmentArms(schema));
    const cache = new Map<string, Map<string, number>>();
    const idx = (m: string) => cache.get(m) ?? (cache.set(m, baselineIndex(schema, rows, m)), cache.get(m)!);
    return { total: sliced.length, passing: sliced.filter((r) => passes(schema, r, state.filters, idx)).length };
  }, [schema, view, state, rows]);

  const update = (patch: Partial<ViewState>) => setState((s) => (s ? { ...s, ...patch } : s));

  const setControl = (id: string, value: string | number) => {
    if (!schema || !view || !state) return;
    if (id === data.outerId && typeof value === "number") {
      setOuterValue(value);
      return;
    }
    update({ controls: reconcileControls(schema, view, rows, { ...state.controls, [id]: value }) });
  };

  const switchView = (id: string) => {
    if (!schema || !state) return;
    const next = schema.view.find((v) => v.id === id);
    if (!next) return;
    update({ viewId: id, controls: reconcileControls(schema, next, rows, state.controls) });
  };

  const pickGeometry = (x: number, y: number) => {
    if (!schema || !view || !state) return;
    const target = schema.view.find((v) => !v.aggregate_over && v.controls.includes(view.x) && v.controls.includes(view.y));
    if (!target) return;
    update({
      viewId: target.id,
      controls: reconcileControls(schema, target, rows, { ...state.controls, [view.x]: x, [view.y]: y }),
    });
  };

  return (
    <section className="panel surface-view">
      <div className="panel__header">
        <h2>Surface</h2>
        <p className="panel__hint">
          Ready-made results of a research Experiment. Points with a run can be opened in Chart and Reports.
        </p>
      </div>
      <label className="surface-select">
        Experiment{" "}
        <select value={experimentId ?? ""} onChange={(e) => setExperimentId(e.target.value || null)}>
          <option value="">Select an experiment…</option>
          {(data.registry ?? []).map((x) => (
            <option key={x.experiment_id} value={x.experiment_id}>
              {x.ticker} · {x.anchor} · {x.title}
            </option>
          ))}
        </select>
      </label>
      {data.error && <p role="alert" className="surface-error">{data.error}</p>}
      {data.loading && <p className="panel__hint">Loading…</p>}
      {schema && view && state && slice && (
        <>
          <SurfaceControls
            schema={schema}
            view={view}
            state={state}
            options={options}
            outer={outer}
            onMetric={(metric) => update({ metric })}
            onMode={(mode: ViewMode) => update({ mode })}
            onControl={setControl}
            onView={switchView}
          />
          <FiltersPanel
            schema={schema}
            filters={state.filters}
            passing={counts.passing}
            total={counts.total}
            onChange={(filters) => update({ filters })}
          />
          <div className="surface-body">
            <div className="surface-plot">
              {view.filmstrip && dimById(schema, view.filmstrip) && (
                <Filmstrip
                  schema={schema}
                  view={view}
                  rows={rows}
                  state={state}
                  options={options[view.filmstrip] ?? []}
                  onPick={(v) => setControl(view.filmstrip as string, v)}
                />
              )}
              <SurfacePlot
                schema={schema}
                view={view}
                rows={rows}
                state={state}
                selected={selected}
                onSelectPoint={setSelected}
                onSelectGeometry={pickGeometry}
              />
            </div>
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
          </div>
        </>
      )}
    </section>
  );
}
