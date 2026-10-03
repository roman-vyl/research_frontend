import type { ExperimentResultSchema, ExperimentView } from "@/api/experiments";
import { colorFor, GREY, makeScale } from "@/features/surface/color";
import {
  aggregateMap,
  baselineIndex,
  buildMatrix,
  displayValue,
  formatMetric,
  metricById,
  passes,
  sliceRows,
  treatmentArms,
  type ControlState,
  type Row,
  type ViewState,
} from "@/features/surface/model";

type PlotProps = {
  schema: ExperimentResultSchema;
  view: ExperimentView;
  rows: Row[];
  state: ViewState;
  selected: Row | null;
  onSelectPoint: (row: Row) => void;
  onSelectGeometry: (x: number, y: number) => void;
};

function indexer(schema: ExperimentResultSchema, rows: Row[]): (metric: string) => Map<string, number> {
  const cache = new Map<string, Map<string, number>>();
  return (m) => {
    let v = cache.get(m);
    if (!v) cache.set(m, (v = baselineIndex(schema, rows, m)));
    return v;
  };
}

export function SurfacePlot({ schema, view, rows, state, selected, onSelectPoint, onSelectGeometry }: PlotProps) {
  const metric = metricById(schema, state.metric);
  if (!metric) return null;
  const idx = indexer(schema, rows);
  const xLabel = schema.dimensions.find((d) => d.id === view.x)?.label ?? view.x;
  const yLabel = schema.dimensions.find((d) => d.id === view.y)?.label ?? view.y;

  if (view.aggregate_over) {
    const cells = aggregateMap(schema, view, rows, state);
    const xs = [...new Set(cells.map((c) => c.x))].sort((a, b) => a - b);
    const ys = [...new Set(cells.map((c) => c.y))].sort((a, b) => a - b);
    const scale = makeScale(cells.flatMap((c) => (c.value === null ? [] : [c.value])));
    const hasFilters = state.filters.length > 0;
    return (
      <table className="surface-grid" aria-label={`${yLabel} by ${xLabel}`}>
        <thead>
          <tr>
            <th>{yLabel} \ {xLabel}</th>
            {xs.map((x) => <th key={x}>{x}</th>)}
          </tr>
        </thead>
        <tbody>
          {ys.map((y) => (
            <tr key={y}>
              <th>{y}</th>
              {xs.map((x) => {
                const c = cells.find((k) => k.x === x && k.y === y);
                const dim = c !== undefined && hasFilters && c.passing === 0;
                return (
                  <td
                    key={x}
                    className="surface-grid__cell"
                    style={{ background: dim ? GREY : colorFor(c?.value ?? null, scale), opacity: dim ? 0.45 : 1 }}
                    title={c ? `median ${formatMetric(metric, c.value)} · ${c.passing}/${c.count} pass` : ""}
                    onClick={() => c && onSelectGeometry(x, y)}
                  >
                    {c ? formatMetric(metric, c.value) : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const sliced = sliceRows(schema, view, rows, state.controls, treatmentArms(schema));
  const m = buildMatrix(schema, view, sliced, state.controls);
  const base = idx(state.metric);
  const values = sliced
    .map((r) => displayValue(schema, r, state.metric, state.mode, base))
    .filter((v): v is number => v !== null);
  const scale = makeScale(values);
  const hasFilters = state.filters.length > 0;
  return (
    <table className="surface-grid" aria-label={`${yLabel} by ${xLabel}`}>
      <thead>
        <tr>
          <th>{yLabel} \ {xLabel}</th>
          {m.xs.map((x) => <th key={x}>{x}</th>)}
        </tr>
      </thead>
      <tbody>
        {m.ys.map((y, yi) => (
          <tr key={y}>
            <th>{y}</th>
            {m.xs.map((x, xi) => {
              const r = m.cells[yi][xi];
              const v = r ? displayValue(schema, r, state.metric, state.mode, base) : null;
              const off = r !== null && hasFilters && !passes(schema, r, state.filters, idx);
              return (
                <td
                  key={x}
                  className={`surface-grid__cell${r === selected ? " surface-grid__cell--selected" : ""}${off ? " surface-grid__cell--off" : ""}`}
                  style={off ? undefined : { background: colorFor(v, scale) }}
                  onClick={() => r && onSelectPoint(r)}
                >
                  {r ? formatMetric(metric, v) : ""}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type FilmstripProps = {
  schema: ExperimentResultSchema;
  view: ExperimentView;
  rows: Row[];
  state: ViewState;
  options: (string | number)[];
  onPick: (value: number) => void;
};

/** One mini heatmap per value of the declared dimension (for example trigger T). */
export function Filmstrip({ schema, view, rows, state, options, onPick }: FilmstripProps) {
  const id = view.filmstrip;
  if (!id) return null;
  const idx = indexer(schema, rows);
  const base = idx(state.metric);
  const frames = options.filter((o): o is number => typeof o === "number").map((value) => {
    const controls: ControlState = { ...state.controls, [id]: value };
    const sliced = sliceRows(schema, view, rows, controls, treatmentArms(schema));
    const m = buildMatrix(schema, view, sliced, controls);
    const vals = sliced
      .map((r) => displayValue(schema, r, state.metric, state.mode, base))
      .filter((v): v is number => v !== null);
    return { value, m, scale: makeScale(vals) };
  });
  return (
    <div className="surface-film" aria-label={`${id} frames`}>
      {frames.map((f) => (
        <button
          type="button"
          key={f.value}
          className={`surface-film__frame${state.controls[id] === f.value ? " surface-film__frame--active" : ""}`}
          onClick={() => onPick(f.value)}
        >
          <span>{id} {f.value}</span>
          <div className="surface-film__grid" style={{ gridTemplateColumns: `repeat(${f.m.xs.length || 1}, 1fr)` }}>
            {f.m.cells.flat().map((r, i) => {
              const v = r ? displayValue(schema, r, state.metric, state.mode, base) : null;
              return <i key={i} style={{ background: colorFor(v, f.scale) }} />;
            })}
          </div>
        </button>
      ))}
    </div>
  );
}
