import { useEffect, useRef, useState } from "react";

import type { ExperimentResultSchema, ExperimentView } from "@/api/experiments";
import { metricId } from "@/api/experiments";
import { Segmented } from "@/features/surface/Segmented";
import {
  GRID_ID,
  armLabel,
  comparisonArms,
  controlReadout,
  dimById,
  type ViewMode,
  type ViewState,
} from "@/features/surface/model";

type Props = {
  schema: ExperimentResultSchema;
  view: ExperimentView;
  state: ViewState;
  options: Record<string, (string | number)[]>;
  outer: { id: string; options: number[] } | null;
  onMetric: (m: string) => void;
  onMode: (m: ViewMode) => void;
  onCompare: (arm: string) => void;
  onControl: (id: string, value: string | number) => void;
};

/** Controls with at most this many values are a row of buttons; longer ones stay sliders. */
const BUTTONS_MAX = 6;
const PLAY_MS = 1100;

export function SurfaceControls({ schema, view, state, options, onMetric, onMode, onCompare, onControl }: Omit<Props, "outer">) {
  const grid = typeof state.controls[GRID_ID] === "string" ? (state.controls[GRID_ID] as string) : null;
  const arms = schema.arms;
  const compare = state.compare ?? arms?.baseline ?? "";
  const cmpName = armLabel(compare);

  return (
    <>
      {(arms || (view.controls.includes(GRID_ID) && (options[GRID_ID]?.length ?? 0) > 0)) && (
        <div className="sx-panel sx-controls">
          {view.controls.includes(GRID_ID) && (options[GRID_ID]?.length ?? 0) > 0 && (
            <Segmented
              label="Geometry grid"
              value={grid ?? ""}
              options={(options[GRID_ID] as string[]).map((g) => ({ id: g, label: `${g} grid` }))}
              onChange={(g) => onControl(GRID_ID, g)}
            />
          )}
          {arms && (
            <Segmented
              label="Comparison arm"
              value={compare}
              options={comparisonArms(schema).map((a) => ({ id: a, label: armLabel(a) }))}
              onChange={onCompare}
            />
          )}
        </div>
      )}
      <div className="sx-panel sx-controls">
        <Segmented
          label="Cell metric"
          value={state.metric}
          options={schema.metrics.map((m) => ({ id: metricId(m), label: m.label }))}
          onChange={onMetric}
        />
        {arms && (
          <Segmented<ViewMode>
            label="Arm"
            value={state.mode}
            options={[
              { id: "treatment", label: armLabel(Object.entries(arms.roles).find(([, r]) => r === "treatment")?.[0] ?? "treatment") },
              { id: "baseline", label: cmpName },
              { id: "difference", label: `Δ vs ${cmpName}` },
            ]}
            onChange={onMode}
          />
        )}
      </div>
    </>
  );
}

export function SurfaceSliders({
  schema,
  view,
  state,
  options,
  outer,
  onControl,
  onToggle,
  hints,
}: Pick<Props, "schema" | "view" | "state" | "options" | "outer" | "onControl"> & {
  /** Switch an optional control (for example Breakeven) on or off. */
  onToggle: (id: string, on: boolean) => void;
  /** Where an optional control has values in this slice: a short label and a jump to that geometry. */
  hints: Record<string, { label: string; go: () => void } | undefined>;
}) {
  const grid = typeof state.controls[GRID_ID] === "string" ? (state.controls[GRID_ID] as string) : null;
  const sl = typeof state.controls.sl === "number" ? state.controls.sl : null;
  const free = new Set([view.x, view.y, ...(view.aggregate_over ?? [])]);
  const sliders = view.controls.filter((id) => id !== GRID_ID && !free.has(id));
  // play steps the last always-on control (optional ones such as Breakeven are not animated)
  const playId = [...sliders].reverse().find((id) => !dimById(schema, id)?.optional) ?? null;
  const [playing, setPlaying] = useState(false);
  const latest = useRef({ state, options, outer, onControl });
  latest.current = { state, options, outer, onControl };
  useEffect(() => {
    if (!playing || playId === null) return undefined;
    const timer = setInterval(() => {
      const { state: s, options: o, outer: out, onControl: set } = latest.current;
      const opts = playId === out?.id ? out.options : (o[playId] ?? []);
      if (opts.length === 0) return;
      const cur = opts.findIndex((x) => x === s.controls[playId]);
      set(playId, opts[(cur + 1) % opts.length]);
    }, PLAY_MS);
    return () => clearInterval(timer);
  }, [playing, playId]);
  if (sliders.length === 0) return null;
  return (
    <div className="sx-panel sx-controls sx-three">
      {sliders.map((id) => {
        const opts = (id === outer?.id ? outer.options : (options[id] ?? [])) as number[];
        const dim = dimById(schema, id);
        const cur = state.controls[id];
        const index = Math.max(0, opts.findIndex((o) => o === cur));
        const unit = dim?.grids ? (dim.grids[grid ?? Object.keys(dim.grids)[0]]?.unit ?? "") : (dim?.unit ?? "");
        const ro = typeof cur === "number" ? controlReadout(schema, id, cur, grid, sl) : null;
        if (dim?.optional) {
          const on = cur !== undefined;
          const available = (options[id]?.length ?? 0) > 0;
          return (
            <div className="sx-control-group" key={id}>
              <label className="sx-control-label sx-check">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && !available}
                  onChange={(e) => onToggle(id, e.target.checked)}
                />
                {dim.label ?? id}
                {unit && <span className="sx-unit-tag">{unit}</span>}
              </label>
              {on ? (
                <div className="sx-sl-row">
                  <input
                    type="range"
                    aria-label={dim.label ?? id}
                    min={0}
                    max={Math.max(0, opts.length - 1)}
                    step={1}
                    value={index}
                    disabled={opts.length < 2}
                    onChange={(e) => {
                      const o = opts[Number(e.target.value)];
                      if (o !== undefined) onControl(id, o);
                    }}
                  />
                  <span className="sx-ro">
                    {ro?.main}
                    {ro?.alt && <small>{ro.alt}</small>}
                  </span>
                </div>
              ) : (
                <span className="sx-note">
                  {available ? (
                    "off: plain trailing rows"
                  ) : hints[id] ? (
                    <>
                      none for this geometry.{" "}
                      <button type="button" className="sx-fbtn" onClick={hints[id]!.go}>
                        Go to {hints[id]!.label}
                      </button>
                    </>
                  ) : (
                    "none for this stop size"
                  )}
                </span>
              )}
            </div>
          );
        }
        return (
          <div className={opts.length <= BUTTONS_MAX ? "sx-control-group sx-btns" : "sx-control-group"} key={id}>
            <span className="sx-control-label">
              {dim?.label ?? id}
              {unit && <span className="sx-unit-tag">{unit}</span>}
            </span>
            <div className="sx-sl-row">
              {id === playId && (
                <button
                  type="button"
                  className="sx-play-btn"
                  aria-label={`Play through ${dim?.label ?? id}`}
                  aria-pressed={playing}
                  onClick={() => setPlaying((p) => !p)}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                    {playing ? (
                      <>
                        <rect x="1" y="1" width="3.4" height="10" rx="0.5" />
                        <rect x="7.6" y="1" width="3.4" height="10" rx="0.5" />
                      </>
                    ) : (
                      <path d="M2 1l9 5-9 5V1z" />
                    )}
                  </svg>
                </button>
              )}
              {opts.length <= BUTTONS_MAX ? (
                <div className="sx-segmented" role="group" aria-label={dim?.label ?? id}>
                  {opts.map((o) => (
                    <button key={o} type="button" aria-pressed={o === cur} onClick={() => onControl(id, o)}>
                      {controlReadout(schema, id, o, grid, sl).main}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="range"
                  aria-label={dim?.label ?? id}
                  min={0}
                  max={Math.max(0, opts.length - 1)}
                  step={1}
                  value={index}
                  disabled={opts.length < 2}
                  onChange={(e) => {
                    const o = opts[Number(e.target.value)];
                    if (o !== undefined) onControl(id, o);
                  }}
                />
              )}
              <span className="sx-ro">
                {opts.length <= BUTTONS_MAX ? null : ro?.main}
                {ro?.alt && <small>{ro.alt}</small>}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
