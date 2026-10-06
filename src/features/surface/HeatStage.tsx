import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import type { ExperimentResultSchema, ExperimentView } from "@/api/experiments";
import { metricId } from "@/api/experiments";
import { summaryCards } from "@/features/surface/aggregates";
import { colorOf, makeDomain, textOn, type Tokens } from "@/features/surface/color";
import {
  GRID_ID,
  activeConditions,
  armLabel,
  baselineOf,
  buildMatrix,
  cellKey,
  controlReadout,
  dimById,
  dimValue,
  displayValue,
  formatCell,
  makeIndexer,
  metricById,
  metricStyle,
  makePasses,
  sliceRows,
  treatmentArms,
  type ControlState,
  type Row,
  type ViewState,
} from "@/features/surface/model";

type Props = {
  schema: ExperimentResultSchema;
  view: ExperimentView;
  rows: Row[];
  state: ViewState;
  tokens: Tokens;
  selected: Row | null;
  filmstripOptions: (string | number)[];
  onSelect: (row: Row) => void;
  onPickFrame: (value: number) => void;
  /** Cells selected for an action (keys from `cellKey`); separate from the point shown in details. */
  picked?: ReadonlySet<string>;
  /** Ctrl/Cmd+click toggles one cell; Shift+drag adds a rectangle. */
  onPick?: (keys: string[], how: "toggle" | "add") => void;
};

type Drag = { x0: number; y0: number; x1: number; y1: number };
const inRect = (d: Drag, xi: number, yi: number): boolean =>
  xi >= Math.min(d.x0, d.x1) && xi <= Math.max(d.x0, d.x1) && yi >= Math.min(d.y0, d.y1) && yi <= Math.max(d.y0, d.y1);

type Tip = { x: number; y: number; row: Row };

export function HeatStage({ schema, view, rows, state, tokens, selected, filmstripOptions, onSelect, onPickFrame, picked, onPick }: Props) {
  const [tip, setTip] = useState<Tip | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const metric = metricById(schema, state.metric);
  const compare = state.compare ?? schema.arms?.baseline ?? null;
  const idx = useMemo(() => makeIndexer(schema, rows, compare), [schema, rows, compare]);
  const sliced = useMemo(
    () => sliceRows(schema, view, rows, state.controls, treatmentArms(schema)),
    [schema, view, rows, state.controls],
  );
  const matrix = useMemo(() => buildMatrix(schema, view, sliced, state.controls), [schema, view, sliced, state.controls]);
  const filtersOn = activeConditions(state.filters).length > 0;
  const passFrame = useMemo(() => makePasses(schema, sliced, state.filters, idx), [schema, sliced, state.filters, idx]);
  const delta = state.mode === "difference";

  const frame = useMemo(() => {
    if (!metric) return null;
    const vals = sliced
      .map((r) => displayValue(schema, r, state.metric, state.mode, idx(state.metric)))
      .filter((v): v is number => v !== null);
    return makeDomain(vals, metricStyle(state.metric), delta);
  }, [schema, sliced, state.metric, state.mode, idx, delta, metric]);

  const frames = useMemo(() => {
    const id = view.filmstrip;
    if (!id || !metric) return [];
    const out: { value: number; xs: number; cells: { bg: string }[] }[] = [];
    for (const value of filmstripOptions) {
      if (typeof value !== "number") continue;
      const controls: ControlState = { ...state.controls, [id]: value };
      const fs = sliceRows(schema, view, rows, controls, treatmentArms(schema));
      if (fs.length === 0) continue;
      const m = buildMatrix(schema, view, fs, controls);
      const passFs = makePasses(schema, fs, state.filters, idx);
      const vals = fs
        .map((r) => displayValue(schema, r, state.metric, state.mode, idx(state.metric)))
        .filter((v): v is number => v !== null);
      const dom = makeDomain(vals, metricStyle(state.metric), delta);
      out.push({
        value,
        xs: m.xs.length || 1,
        cells: m.cells.flat().map((r) => {
          if (!r) return { bg: tokens.offBg };
          if (filtersOn && !passFs(r)) return { bg: tokens.offBg };
          return { bg: colorOf(displayValue(schema, r, state.metric, state.mode, idx(state.metric)), dom, tokens) };
        }),
      });
    }
    return out;
  }, [schema, view, rows, state, filmstripOptions, idx, tokens, filtersOn, delta, metric]);

  // A Shift+drag ends wherever the mouse is released.
  useEffect(() => {
    if (!drag) return;
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d || !onPick) return;
      const keys: string[] = [];
      matrix.ys.forEach((y, yi) =>
        matrix.xs.forEach((x, xi) => {
          if (matrix.cells[yi][xi] && inRect(d, xi, yi)) keys.push(cellKey(x, y));
        }),
      );
      onPick(keys, "add");
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [drag !== null, matrix, onPick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!metric || !frame) return null;
  const grid = typeof state.controls[GRID_ID] === "string" ? (state.controls[GRID_ID] as string) : null;
  const sl = typeof state.controls.sl === "number" ? state.controls.sl : null;
  const xd = dimById(schema, view.x);
  const yd = dimById(schema, view.y);
  const free = new Set([view.x, view.y, ...(view.aggregate_over ?? [])]);
  const readouts = view.controls
    .filter((id) => id !== GRID_ID && !free.has(id))
    .map((id) => {
      const v = state.controls[id];
      if (typeof v !== "number") return null;
      const ro = controlReadout(schema, id, v, grid, sl);
      return `${dimById(schema, id)?.label ?? id} ${ro.main}${ro.alt ? ` ${ro.alt}` : ""}`;
    })
    .filter(Boolean);
  const cmp = armLabel(compare ?? "");
  const armText = !schema.arms
    ? ""
    : state.mode === "treatment"
      ? ` · ${armLabel(Object.entries(schema.arms.roles).find(([, r]) => r === "treatment")?.[0] ?? "treatment")}`
      : state.mode === "baseline"
        ? ` · ${cmp}`
        : ` · Δ = trailing − ${cmp}`;
  const caption = `rows: ${yd?.label ?? view.y} · columns: ${xd?.label ?? view.x} · ${readouts.join(" · ")} · ${metric.label}${armText}`;
  const cards = summaryCards(schema, sliced, rows, state, view.default_metric, cmp);
  const lo = frame.goodHigh ? "deeper DD" : "worse / loss";
  const hi = frame.seq
    ? "more — sequential, scaled per frame by percentile rank"
    : `better / profit — diverging at ${frame.center}, scaled per frame by percentile rank`;

  const show = (e: MouseEvent, row: Row) => setTip({ x: e.clientX + 16, y: e.clientY + 16, row });

  return (
    <div className="sx-panel sx-stage">
      <div className="sx-axis-caption">{caption}</div>
      {cards.length > 0 && (
        <div className="sx-agg">
          {cards.map((c) => (
            <div key={c.label}>
              <span>{c.label}</span>
              <b>{c.value}</b>
            </div>
          ))}
        </div>
      )}
      <table className="sx-heat" aria-label={`${yd?.label ?? view.y} by ${xd?.label ?? view.x}`}>
        <thead>
          <tr>
            <th className="sx-corner" />
            {matrix.xs.map((x) => <th key={x}>{x}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.ys.map((y, yi) => (
            <tr key={y}>
              <th>{view.y === "width" ? `w=${y}` : y}</th>
              {matrix.xs.map((x, xi) => {
                const r = matrix.cells[yi][xi];
                if (!r) return <td key={x}><div className="sx-cell sx-empty" /></td>;
                const v = displayValue(schema, r, state.metric, state.mode, idx(state.metric));
                const off = filtersOn && !passFrame(r);
                const bg = colorOf(v, frame, tokens);
                const isPicked = (picked?.has(cellKey(x, y)) ?? false) || (drag !== null && inRect(drag, xi, yi));
                return (
                  <td key={x}>
                    <div
                      className={`sx-cell${off ? " sx-off" : ""}${r === selected ? " sx-sel" : ""}${typeof r.run_id === "string" && r.run_id !== "" ? " sx-run" : ""}${isPicked ? " sx-pick" : ""}`}
                      style={off ? undefined : { background: bg, color: textOn(bg, tokens) }}
                      onMouseMove={(e) => show(e, r)}
                      onMouseLeave={() => setTip(null)}
                      onMouseDown={(e) => {
                        if (!onPick || !e.shiftKey) return;
                        e.preventDefault();
                        setDrag({ x0: xi, y0: yi, x1: xi, y1: yi });
                      }}
                      onMouseEnter={() => drag && setDrag({ ...drag, x1: xi, y1: yi })}
                      onClick={(e) => {
                        if (onPick && (e.ctrlKey || e.metaKey)) onPick([cellKey(x, y)], "toggle");
                        else if (!(onPick && e.shiftKey)) onSelect(r);
                      }}
                    >
                      <span className="sx-v">{formatCell(metric, v, delta)}</span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sx-legend">
        <span>{lo}</span>
        <span className="sx-legend-ramp" aria-hidden="true" />
        <span>{hi}</span>
      </div>
      {frames.length > 0 && view.filmstrip && (
        <div className="sx-filmstrip">
          <div className="sx-axis-caption">
            frames: {dimById(schema, view.filmstrip)?.label ?? view.filmstrip} for the selected controls — click to jump
          </div>
          <div className="sx-filmstrip-track">
            {frames.map((f) => {
              const fid = view.filmstrip as string;
              const ro = controlReadout(schema, fid, f.value, grid, sl);
              return (
                <div
                  key={f.value}
                  className="sx-frame"
                  role="button"
                  tabIndex={0}
                  aria-pressed={state.controls[fid] === f.value}
                  onClick={() => onPickFrame(f.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onPickFrame(f.value);
                    }
                  }}
                >
                  <div className="sx-fr-label">{ro.main}</div>
                  <div className="sx-frame-grid" style={{ gridTemplateColumns: `repeat(${f.xs}, 1fr)` }}>
                    {f.cells.map((c, i) => <div key={i} style={{ background: c.bg }} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {tip && (
        <div className="sx-tooltip sx-show" style={{ left: tip.x, top: tip.y }} role="tooltip">
          <div className="sx-tt-head">
            {[
              `${view.y}=${String(dimValue(schema, tip.row, view.y, grid))}`,
              `${view.x}=${String(dimValue(schema, tip.row, view.x, grid))}`,
              ...readouts,
            ].join(" · ")}
          </div>
          {schema.arms && (
            <div className="sx-row" style={{ color: "var(--ink-muted)" }}>
              <span />
              <span>{armLabel(Object.entries(schema.arms.roles).find(([, r]) => r === "treatment")?.[0] ?? "")}</span>
              <span>{cmp}</span>
            </div>
          )}
          {schema.metrics.map((m) => {
            const id = metricId(m);
            const v = tip.row[id];
            const b = schema.arms ? baselineOf(schema, tip.row, idx(id)) : null;
            return (
              <div className="sx-row" key={id}>
                <span>{m.label}</span>
                <span>{formatCell(m, typeof v === "number" ? v : null, false)}</span>
                {schema.arms && <span>{formatCell(m, b, false)}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
