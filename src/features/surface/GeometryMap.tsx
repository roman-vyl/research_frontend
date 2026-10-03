import { useMemo, useState } from "react";

import type { ExperimentResultSchema, ExperimentView } from "@/api/experiments";
import { geoAggregates, geometryMap } from "@/features/surface/aggregates";
import { colorOf, makeDomain, textOn, type Tokens } from "@/features/surface/color";
import { GRID_ID, armLabel, dimById, type Row, type ViewState } from "@/features/surface/model";
import { Segmented } from "@/features/surface/Segmented";

type Props = {
  schema: ExperimentResultSchema;
  view: ExperimentView;
  /** Controls that identify the geometry on the cells view (the map's x and y). */
  selectedX: number | null;
  selectedY: number | null;
  rows: Row[];
  state: ViewState;
  tokens: Tokens;
  onPick: (x: number, y: number) => void;
};

/** Map of the geometry (y × x) coloured by an aggregate over all cells; a click sets the sliders. */
export function GeometryMap({ schema, view, selectedX, selectedY, rows, state, tokens, onPick }: Props) {
  const aggs = useMemo(() => geoAggregates(schema, view.default_metric), [schema, view.default_metric]);
  const [aggId, setAggId] = useState(aggs[0]?.id ?? "");
  const agg = aggs.find((a) => a.id === aggId) ?? aggs[0];
  const cells = useMemo(
    () => (agg ? geometryMap(schema, view, rows, state, agg.id) : []),
    [schema, view, rows, state, agg],
  );
  if (!agg) return null;
  const xs = [...new Set(cells.map((c) => c.x))].sort((a, b) => a - b);
  const ys = [...new Set(cells.map((c) => c.y))].sort((a, b) => a - b);
  const map = new Map(cells.map((c) => [`${c.x}|${c.y}`, c]));
  const vals = cells.flatMap((c) => (c.value === null ? [] : [c.value]));
  const domain = makeDomain(vals, { center: agg.center, seq: agg.seq, goodHigh: false }, false);
  const grid = typeof state.controls[GRID_ID] === "string" ? (state.controls[GRID_ID] as string) : null;
  const xd = dimById(schema, view.x);
  const yd = dimById(schema, view.y);
  const unit = xd?.grids ? (xd.grids[grid ?? Object.keys(xd.grids)[0]]?.unit ?? "") : (xd?.unit ?? "");
  const sl = typeof state.controls.sl === "number" ? state.controls.sl : null;
  const cmp = armLabel(state.compare ?? schema.arms?.baseline ?? "");
  const n = Math.max(0, ...cells.map((c) => c.count));
  const conv =
    sl === null ? "" : unit === "R" ? `; at SL ${sl}: 1R = ${sl} ATR` : unit === "ATR" ? `; at SL ${sl}: 1 ATR = ${Math.round((1 / sl) * 100) / 100}R` : "";
  return (
    <div className="sx-panel sx-stage">
      <div className="sx-axis-caption">
        Geometry map {yd?.label ?? view.y} × {xd?.label ?? view.x} (both in {unit}{conv}) — click a geometry to set the sliders.
        Cell = aggregate over the {n} width × lookback cells vs {cmp}
      </div>
      <Segmented
        label="Aggregate"
        value={agg.id}
        options={aggs.map((a) => ({ id: a.id, label: a.label }))}
        onChange={setAggId}
      />
      <table className="sx-geo" aria-label="Geometry map">
        <thead>
          <tr>
            <th>{yd?.label ?? view.y} \ {xd?.label ?? view.x}, {unit}</th>
            {xs.map((x) => <th key={x}>{x}</th>)}
          </tr>
        </thead>
        <tbody>
          {ys.map((y) => (
            <tr key={y}>
              <th>{y}</th>
              {xs.map((x) => {
                const c = map.get(`${x}|${y}`);
                if (!c) return <td key={x} className="sx-empty" />;
                const bg = colorOf(c.value, domain, tokens);
                const sel = x === selectedX && y === selectedY;
                return (
                  <td
                    key={x}
                    className={sel ? "sx-sel" : undefined}
                    data-x={x}
                    data-y={y}
                    style={{ background: bg, color: textOn(bg, tokens) }}
                    onClick={() => onPick(x, y)}
                  >
                    {c.value === null ? "—" : agg.fmt(c.value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sx-note">
        All {cells.length} admissible geometries of the {grid ?? ""} grid are shown (none filtered). Comparison per cell = the same cell
        with {cmp}. Δ values in percentage points where the metric is a fraction.
      </p>
    </div>
  );
}
