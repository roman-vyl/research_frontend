import { useMemo } from "react";

import type { ExperimentResultSchema, ExperimentResults, ExperimentView } from "@/api/experiments";
import { snapshotRow, tableMetrics, type AllSettingsResult } from "@/features/surface/allSettings";
import { colorOf, makeDomain, textOn, type Tokens } from "@/features/surface/color";
import {
  GRID_ID,
  armLabel,
  cellKey,
  controlReadout,
  dimById,
  dimValue,
  formatCell,
  metricById,
  metricStyle,
  type Row,
  type ViewMode,
} from "@/features/surface/model";

type Props = {
  schema: ExperimentResultSchema;
  view: ExperimentView;
  snap: ExperimentResults;
  result: AllSettingsResult;
  metric: string;
  mode: ViewMode;
  equity: number | null;
  tokens: Tokens;
  /** Open this row on the displayed grid. */
  onOpen: (row: Row) => void;
};

/** The setting of a row beyond its cell: every view control except x / y, its grid and its arm. */
export function settingText(schema: ExperimentResultSchema, view: ExperimentView, row: Row): string {
  const grid = typeof row[GRID_ID] === "string" ? (row[GRID_ID] as string) : null;
  const sl = typeof row.sl === "number" ? row.sl : null;
  const parts: string[] = [];
  for (const id of view.controls) {
    if (id === view.x || id === view.y) continue;
    if (id === GRID_ID) {
      if (grid !== null) parts.push(`${grid} grid`);
      continue;
    }
    const v = dimValue(schema, row, id, grid);
    if (v === null) continue;
    parts.push(`${dimById(schema, id)?.label ?? id} ${controlReadout(schema, id, v, grid, sl).main}`);
  }
  if (schema.arms && typeof row.arm === "string") parts.push(armLabel(row.arm));
  return parts.join(" · ");
}

/** "All settings" heat map: per cell the best matching setting and how many settings match; and the top matches. */
export function AllSettingsStage({ schema, view, snap, result, metric, mode, equity, tokens, onOpen }: Props) {
  const m = metricById(schema, metric);
  const delta = mode === "difference";
  const domain = useMemo(() => {
    const vals = [...result.cells.values()].map((c) => c.value).filter((v): v is number => v !== null);
    return makeDomain(vals, metricStyle(metric), delta);
  }, [result, metric, delta]);
  const extra = tableMetrics(schema).filter((id) => id !== metric);
  if (!m) return null;
  const xd = dimById(schema, view.x);
  const yd = dimById(schema, view.y);
  const rowOf = (i: number): Row => snapshotRow(snap, i, equity);

  return (
    <>
      <div className="sx-panel sx-stage">
        <div className="sx-axis-caption">
          rows: {yd?.label ?? view.y} · columns: {xd?.label ?? view.x} · All settings · best {m.label} per cell among matching settings · small number = matching settings · click a cell to open its best setting
        </div>
        <table className="sx-heat" aria-label={`All settings: ${yd?.label ?? view.y} by ${xd?.label ?? view.x}`}>
          <thead>
            <tr>
              <th className="sx-corner" />
              {result.xs.map((x) => <th key={x}>{x}</th>)}
            </tr>
          </thead>
          <tbody>
            {result.ys.map((y) => (
              <tr key={y}>
                <th>{view.y === "width" ? `w=${y}` : y}</th>
                {result.xs.map((x) => {
                  const c = result.cells.get(cellKey(x, y));
                  if (!c) {
                    return (
                      <td key={x}>
                        <div className="sx-cell sx-off" title="no matching setting"><span className="sx-v">·</span></div>
                      </td>
                    );
                  }
                  const bg = colorOf(c.value, domain, tokens);
                  return (
                    <td key={x}>
                      <div
                        className="sx-cell"
                        role="button"
                        tabIndex={0}
                        data-count={c.count}
                        style={{ background: bg, color: textOn(bg, tokens) }}
                        title={`${view.y}=${y} · ${view.x}=${x} · ${c.count} matching · best: ${settingText(schema, view, rowOf(c.best))}`}
                        onClick={() => onOpen(rowOf(c.best))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onOpen(rowOf(c.best));
                          }
                        }}
                      >
                        <span className="sx-v">{formatCell(m, c.value, delta)}</span>
                        <span className="sx-count">{c.count}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.top.length > 0 && (
        <div className="sx-panel">
          <div className="sx-axis-caption">
            Top {result.top.length} of {result.matched.toLocaleString("en-US")} matches by {m.label} · click a row to open it on the surface
          </div>
          <table className="sx-pt-tbl" aria-label="Top matches">
            <thead>
              <tr>
                <th>Cell</th>
                <th>Setting</th>
                <th>{m.label}</th>
                {extra.map((id) => <th key={id}>{metricById(schema, id)?.label ?? id}</th>)}
              </tr>
            </thead>
            <tbody>
              {result.top.map((t) => {
                const r = rowOf(t.index);
                const grid = typeof r[GRID_ID] === "string" ? (r[GRID_ID] as string) : null;
                return (
                  <tr key={t.index} style={{ cursor: "pointer" }} onClick={() => onOpen(r)}>
                    <th>{`${yd?.label ?? view.y} ${dimValue(schema, r, view.y, grid)} · ${xd?.label ?? view.x} ${dimValue(schema, r, view.x, grid)}`}</th>
                    <td style={{ textAlign: "left" }}>{settingText(schema, view, r)}</td>
                    <td className={t.value !== null && t.value < 0 ? "sx-neg" : "sx-pos"}>{formatCell(m, t.value, delta)}</td>
                    {extra.map((id) => {
                      const em = metricById(schema, id);
                      const v = r[id];
                      return <td key={id}>{em ? formatCell(em, typeof v === "number" ? v : null, false) : "—"}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
