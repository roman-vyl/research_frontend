import { useEffect, useMemo, useState } from "react";

import type { ExperimentResultSchema, ExperimentView } from "@/api/experiments";
import { fetchRunTrades } from "@/api/client";
import type { TradeRecord } from "@/api/types";
import {
  GRID_ID,
  dimById,
  dimValue,
  makeIndexer,
  makePasses,
  sliceRows,
  treatmentArms,
  type Row,
  type ViewState,
} from "@/features/surface/model";

/** Most curves drawn at once; the rest of the frame is listed as not drawn. */
export const MAX_CURVES = 60;
const CONCURRENCY = 6;

export type CurvePoint = { t: number; n: number; v: number };
export type Curve = { runId: string; points: CurvePoint[] };

/** Cumulative net PnL after each realised trade (equity_after - starting equity), in exit-time order. */
export function equityCurve(trades: TradeRecord[], initialEquity: number | null): CurvePoint[] {
  const sorted = [...trades].sort((a, b) => a.exit_time_ms - b.exit_time_ms);
  // Without a manifest initial equity, the first trade's starting equity is the base.
  const base = initialEquity ?? Number(sorted[0]?.equity_before);
  const pts: CurvePoint[] = [];
  sorted.forEach((t, i) => {
    const eq = Number(t.equity_after);
    if (Number.isFinite(eq) && Number.isFinite(base)) pts.push({ t: t.exit_time_ms, n: i + 1, v: eq - base });
  });
  return pts;
}

const runIdOf = (row: Row): string | null => (typeof row.run_id === "string" && row.run_id !== "" ? row.run_id : null);

// Trades of a run never change, so one fetch per run per page load is enough.
const curveCache = new Map<string, Promise<CurvePoint[]>>();
function loadCurve(runId: string, initialEquity: number | null): Promise<CurvePoint[]> {
  const key = `${runId}|${initialEquity}`;
  let p = curveCache.get(key);
  if (!p) {
    p = fetchRunTrades(runId).then((r) => equityCurve(r.trades, initialEquity));
    p.catch(() => curveCache.delete(key));
    curveCache.set(key, p);
  }
  return p;
}

type Props = {
  schema: ExperimentResultSchema;
  view: ExperimentView;
  rows: Row[];
  state: ViewState;
  selected: Row | null;
  initialEquity: number | null;
  onSelect: (row: Row) => void;
  /**
   * "All settings": the matching settings of every slice instead of the current frame — the best rows to draw
   * (with a run, best first), how many matching settings have a run, how many match and how many were evaluated.
   */
  allSettings?: { rows: Row[]; withRun: number; pass: number; total: number };
};

/**
 * Equity curves of every point of the current frame (fixed controls, treatment arm) that passes the
 * filters and has an Engine run, by exit time or by trade number. Points without a run have no trades.
 */
export function EquityPanel({ schema, view, rows, state, selected, initialEquity, onSelect, allSettings }: Props) {
  const [xMode, setXMode] = useState<"time" | "n">("time");
  const [curves, setCurves] = useState<Record<string, CurvePoint[]>>({});
  const [failed, setFailed] = useState(0);
  const [hover, setHover] = useState<{ x: number; label: string } | null>(null);

  const frame = useMemo(() => {
    if (allSettings) {
      const drawn = allSettings.rows.slice(0, MAX_CURVES);
      return { sliced: allSettings.total, pass: allSettings.pass, withRun: allSettings.withRun, drawn };
    }
    const sliced = sliceRows(schema, view, rows, state.controls, treatmentArms(schema));
    const idx = makeIndexer(schema, rows, state.compare);
    const pass = sliced.filter(makePasses(schema, sliced, state.filters, idx));
    const withRun = pass.filter((r) => runIdOf(r) !== null);
    const metric = state.metric;
    const val = (r: Row) => (typeof r[metric] === "number" ? (r[metric] as number) : -Infinity);
    withRun.sort((a, b) => val(b) - val(a));
    const selId = selected ? runIdOf(selected) : null;
    let drawn = withRun.slice(0, MAX_CURVES);
    const sel = selId ? withRun.find((r) => runIdOf(r) === selId) : undefined;
    if (sel && !drawn.includes(sel)) drawn = [...drawn.slice(0, MAX_CURVES - 1), sel];
    return { sliced: sliced.length, pass: pass.length, withRun: withRun.length, drawn };
  }, [schema, view, rows, state, selected, allSettings]);

  const runIds = useMemo(() => frame.drawn.map((r) => runIdOf(r) as string), [frame]);

  useEffect(() => {
    let alive = true;
    setFailed(0);
    const queue = runIds.filter((id) => !(id in curves));
    let i = 0;
    const worker = async () => {
      while (alive && i < queue.length) {
        const id = queue[i++];
        try {
          const pts = await loadCurve(id, initialEquity);
          if (alive) setCurves((c) => ({ ...c, [id]: pts }));
        } catch {
          if (alive) setFailed((f) => f + 1);
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runIds, initialEquity]);

  const selId = selected ? runIdOf(selected) : null;
  const loaded = runIds.filter((id) => curves[id]);
  const W = 720, H = 300, x0 = 64, x1 = 708, y0 = 14, y1 = 262;
  const X = (p: CurvePoint) => (xMode === "time" ? p.t : p.n);
  let xmin = Infinity, xmax = -Infinity, vmin = 0, vmax = 0;
  for (const id of loaded) {
    for (const p of curves[id]) {
      xmin = Math.min(xmin, X(p)); xmax = Math.max(xmax, X(p));
      vmin = Math.min(vmin, p.v); vmax = Math.max(vmax, p.v);
    }
  }
  if (xMode === "n") xmin = 0;
  const pad = (vmax - vmin || 1) * 0.06;
  vmin -= pad; vmax += pad;
  const sx = (v: number) => x0 + ((v - xmin) / (xmax - xmin || 1)) * (x1 - x0);
  const sy = (v: number) => y1 - ((v - vmin) / (vmax - vmin || 1)) * (y1 - y0);
  const step = niceStep(vmax - vmin, 4);
  const yTicks: number[] = [];
  for (let v = Math.ceil(vmin / step) * step; v <= vmax; v += step) yTicks.push(v);
  const xTicks: { v: number; label: string }[] = [];
  if (loaded.length) {
    if (xMode === "time") {
      for (let y = new Date(xmin).getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= xmax; y++) xTicks.push({ v: Date.UTC(y, 0, 1), label: String(y) });
    } else {
      const s = niceStep(xmax, 6);
      for (let n = 0; n <= xmax; n += s) xTicks.push({ v: n, label: String(n) });
    }
  }
  const order = [...loaded].sort((a, b) => (a === selId ? 1 : b === selId ? -1 : 0));
  const label = (r: Row) =>
    view.controls
      .concat([view.x, view.y])
      .map((d) => {
        // an "All settings" row is read in its own grid
        const v = dimValue(schema, r, d, allSettings && typeof r[GRID_ID] === "string" ? (r[GRID_ID] as string) : null);
        return v === null ? null : `${dimById(schema, d)?.label ?? d} ${v}`;
      })
      .filter(Boolean)
      .join(" · ");

  const fmt = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const b = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!b) return;
    const px = ((e.clientX - b.left) / b.width) * W;
    const xv = xmin + ((px - x0) / (x1 - x0)) * (xmax - xmin);
    const vals = order.map((id) => {
      let best: CurvePoint | null = null;
      for (const p of curves[id]) {
        if (X(p) <= xv) best = p;
        else break;
      }
      return best ? best.v : 0;
    }).sort((a, b) => a - b);
    const med = vals.length ? vals[vals.length >> 1] : 0;
    const head = xMode === "time" ? new Date(xv).toISOString().slice(0, 7) : `#${Math.round(xv)}`;
    setHover({ x: px, label: `${head} · median ${fmt(med)} · best ${fmt(vals[vals.length - 1] ?? 0)} · worst ${fmt(vals[0] ?? 0)}` });
  };

  return (
    <section className="sx-panel sx-equity" aria-label="Equity curves">
      <div className="sx-equity-head">
        <span className="sx-axis-caption">
          Equity curves · {loaded.length} of {frame.withRun} runs drawn · {frame.pass.toLocaleString("en-US")} of {frame.sliced.toLocaleString("en-US")} {allSettings ? "settings match" : "points pass filters"}
        </span>
        <div className="sx-segmented" role="group" aria-label="Equity x axis">
          <button type="button" aria-pressed={xMode === "time"} onClick={() => setXMode("time")}>By year</button>
          <button type="button" aria-pressed={xMode === "n"} onClick={() => setXMode("n")}>By trade</button>
        </div>
      </div>
      {frame.withRun === 0 ? (
        <p className="sx-note">
          {allSettings ? "No matching setting has an Engine run" : "No point in this frame has an Engine run"}, so there are no trades to draw. Replay-only points carry metrics but no trade list.
        </p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Cumulative net PnL of the runs in the frame">
          {yTicks.map((v) => (
            <g key={`y${v}`}>
              <line x1={x0} x2={x1} y1={sy(v)} y2={sy(v)} className={Math.abs(v) < 1e-9 ? "sx-eq-zero" : "sx-eq-grid"} />
              <text x={x0 - 6} y={sy(v) + 3} textAnchor="end" className="sx-eq-tick">{fmt(v)}</text>
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={`x${t.v}`}>
              <line x1={sx(t.v)} x2={sx(t.v)} y1={y0} y2={y1} className="sx-eq-grid" />
              <text x={sx(t.v) + (xMode === "time" ? 3 : 0)} y={y1 + 14} textAnchor={xMode === "time" ? "start" : "middle"} className="sx-eq-tick">{t.label}</text>
            </g>
          ))}
          {order.map((id) => {
            const pts = curves[id];
            const d = pts.map((p, i) => `${i ? "L" : "M"}${sx(X(p)).toFixed(1)} ${sy(p.v).toFixed(1)}`).join("");
            const row = frame.drawn.find((r) => runIdOf(r) === id);
            return (
              <path
                key={id}
                d={`M${sx(xMode === "time" ? (pts[0]?.t ?? xmin) : 0).toFixed(1)} ${sy(0).toFixed(1)}${d.replace(/^M/, "L")}`}
                className={id === selId ? "sx-eq-line sx-eq-sel" : "sx-eq-line"}
                onClick={() => row && onSelect(row)}
              >
                <title>{row ? `${label(row)} · ${fmt(pts[pts.length - 1]?.v ?? 0)} USDT · ${pts.length} trades` : id}</title>
              </path>
            );
          })}
          {hover && (
            <g pointerEvents="none">
              <line x1={hover.x} x2={hover.x} y1={y0} y2={y1} className="sx-eq-hover" />
              <text x={Math.min(hover.x + 6, x1 - 330)} y={y0 + 10} className="sx-eq-hovertext">{hover.label}</text>
            </g>
          )}
          <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
          <text x={x1} y={H - 4} textAnchor="end" className="sx-eq-tick">
            {xMode === "time" ? "exit time" : "trade number"} · net PnL, USDT{initialEquity !== null ? ` from ${initialEquity.toLocaleString("en-US")}` : ""}
          </text>
        </svg>
      )}
      <p className="sx-note">
        {allSettings
          ? `Every matching setting of all settings that has an Engine run; the best ${MAX_CURVES} by the cell metric are drawn`
          : `Every point of the current frame that passes the filters and has an Engine run; the best ${MAX_CURVES} by the cell metric are drawn`}
        {frame.withRun > MAX_CURVES ? ` (${frame.withRun - MAX_CURVES} more not drawn)` : ""}.
        {allSettings ? " Click a line to open its setting on the displayed grid." : " The selected point is highlighted; click a line to select its point."}
        {frame.pass > frame.withRun ? ` ${(frame.pass - frame.withRun).toLocaleString("en-US")} replay-only ${allSettings ? "settings" : "points"} have no trades.` : ""}
        {failed ? ` ${failed} runs could not be loaded.` : ""}
      </p>
    </section>
  );
}

function niceStep(span: number, k: number): number {
  const r = (span || 1) / k;
  const m = Math.pow(10, Math.floor(Math.log10(r)));
  const f = r / m;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * m;
}
