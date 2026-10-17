import {
  customSeriesDefaultOptions,
  type CustomData,
  type CustomSeriesOptions,
  type CustomSeriesPricePlotValues,
  type CustomSeriesWhitespaceData,
  type ICustomSeriesPaneRenderer,
  type ICustomSeriesPaneView,
  type PaneRendererCustomData,
  type Time,
} from "lightweight-charts";

/** One signal bar: the three projected prices. Bars without a signal carry no datum at all. */
export type ProjectionDatum = CustomData<Time> & { entry: number; stop: number; take: number };

export type ProjectionSeriesOptions = CustomSeriesOptions & {
  entryColor: string;
  stopColor: string;
  takeColor: string;
  lineWidth: number;
  pointRadius: number;
};

export type ProjectionBar = { x: number; logicalIndex: number; entry: number; stop: number; take: number };

/**
 * Splits the bars the library hands to the renderer into runs of consecutive time-scale positions.
 * Bars exist only for signal bars, so a jump in the logical index is a gap: no line joins two runs.
 */
export function splitRuns(bars: readonly ProjectionBar[]): ProjectionBar[][] {
  const runs: ProjectionBar[][] = [];
  let run: ProjectionBar[] = [];
  for (const bar of bars) {
    const last = run[run.length - 1];
    if (last !== undefined && bar.logicalIndex !== last.logicalIndex + 1) {
      runs.push(run);
      run = [];
    }
    run.push(bar);
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

type DrawTarget = Parameters<ICustomSeriesPaneRenderer["draw"]>[0];
type PriceToY = Parameters<ICustomSeriesPaneRenderer["draw"]>[1];

class ProjectionRenderer implements ICustomSeriesPaneRenderer {
  private bars: ProjectionBar[] = [];
  private options: ProjectionSeriesOptions | null = null;

  update(data: PaneRendererCustomData<Time, ProjectionDatum>, options: ProjectionSeriesOptions): void {
    this.options = options;
    this.bars = data.bars.map((b) => ({
      x: b.x,
      logicalIndex: b.time,
      entry: b.originalData.entry,
      stop: b.originalData.stop,
      take: b.originalData.take,
    }));
  }

  draw(target: DrawTarget, priceToY: PriceToY): void {
    const options = this.options;
    if (options === null || this.bars.length === 0) return;
    const runs = splitRuns(this.bars);
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const lines = [
        ["entry", options.entryColor],
        ["stop", options.stopColor],
        ["take", options.takeColor],
      ] as const;
      ctx.lineWidth = options.lineWidth * hr;
      ctx.lineJoin = "round";
      for (const [key, color] of lines) {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        for (const run of runs) {
          const points = run.map((b) => ({ x: b.x * hr, y: (priceToY(b[key]) ?? 0) * vr }));
          if (points.length > 1) {
            ctx.beginPath();
            points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
            ctx.stroke();
          }
          for (const p of points) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, options.pointRadius * hr, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    });
  }
}

/** One custom series draws all three projection lines, so its cost does not depend on the number of runs. */
export class ProjectionSeriesView implements ICustomSeriesPaneView<Time, ProjectionDatum, ProjectionSeriesOptions> {
  private readonly rendererImpl = new ProjectionRenderer();

  renderer(): ICustomSeriesPaneRenderer {
    return this.rendererImpl;
  }

  update(data: PaneRendererCustomData<Time, ProjectionDatum>, options: ProjectionSeriesOptions): void {
    this.rendererImpl.update(data, options);
  }

  priceValueBuilder(row: ProjectionDatum): CustomSeriesPricePlotValues {
    return [Math.min(row.entry, row.stop, row.take), Math.max(row.entry, row.stop, row.take), row.entry];
  }

  isWhitespace(data: ProjectionDatum | CustomSeriesWhitespaceData<Time>): data is CustomSeriesWhitespaceData<Time> {
    return (data as Partial<ProjectionDatum>).entry === undefined;
  }

  defaultOptions(): ProjectionSeriesOptions {
    return {
      ...customSeriesDefaultOptions,
      lastValueVisible: false,
      priceLineVisible: false,
      entryColor: "#52514e",
      stopColor: "#d75352",
      takeColor: "#2f9e44",
      lineWidth: 2,
      pointRadius: 2,
    };
  }
}
