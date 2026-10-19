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

/** One open-position bar: its line segment, the stop and the take (`null`: no Take point). */
export type OpenTradeDatum = CustomData<Time> & { segment: number; stop: number; take: number | null };

export type OpenTradeSeriesOptions = CustomSeriesOptions & {
  stopColor: string;
  takeColor: string;
  lineWidth: number;
  pointRadius: number;
};

export type OpenTradeBar = { x: number; logicalIndex: number; segment: number; value: number | null };

/**
 * Runs of bars one line may join: consecutive time-scale positions of the same segment, each with a
 * value. A gap, a segment change (another trade, even on the adjacent bar) or a missing value breaks it.
 */
export function splitOpenTradeRuns(bars: readonly OpenTradeBar[]): { x: number; value: number }[][] {
  const runs: { x: number; value: number }[][] = [];
  let run: { x: number; value: number }[] = [];
  let last: OpenTradeBar | null = null;
  for (const bar of bars) {
    const joins = last !== null && bar.logicalIndex === last.logicalIndex + 1 && bar.segment === last.segment;
    if (!joins || bar.value === null) {
      if (run.length > 0) runs.push(run);
      run = [];
    }
    if (bar.value !== null) run.push({ x: bar.x, value: bar.value });
    last = bar;
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

type DrawTarget = Parameters<ICustomSeriesPaneRenderer["draw"]>[0];
type PriceToY = Parameters<ICustomSeriesPaneRenderer["draw"]>[1];
type RawBar = { x: number; logicalIndex: number; segment: number; stop: number; take: number | null };

class OpenTradeRenderer implements ICustomSeriesPaneRenderer {
  private bars: RawBar[] = [];
  private options: OpenTradeSeriesOptions | null = null;

  update(data: PaneRendererCustomData<Time, OpenTradeDatum>, options: OpenTradeSeriesOptions): void {
    this.options = options;
    this.bars = data.bars.map((b) => ({
      x: b.x,
      logicalIndex: b.time,
      segment: b.originalData.segment,
      stop: b.originalData.stop,
      take: b.originalData.take,
    }));
  }

  draw(target: DrawTarget, priceToY: PriceToY): void {
    const options = this.options;
    if (options === null || this.bars.length === 0) return;
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const lines = [
        ["stop", options.stopColor],
        ["take", options.takeColor],
      ] as const;
      ctx.lineWidth = options.lineWidth * hr;
      ctx.lineJoin = "round";
      for (const [key, color] of lines) {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        const runs = splitOpenTradeRuns(this.bars.map((b) => ({ x: b.x, logicalIndex: b.logicalIndex, segment: b.segment, value: b[key] })));
        for (const run of runs) {
          const points = run.map((b) => ({ x: b.x * hr, y: (priceToY(b.value) ?? 0) * vr }));
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

/** One custom series draws Engine's open-position Stop and Take lines in the projection line style. */
export class OpenTradeSeriesView implements ICustomSeriesPaneView<Time, OpenTradeDatum, OpenTradeSeriesOptions> {
  private readonly rendererImpl = new OpenTradeRenderer();

  renderer(): ICustomSeriesPaneRenderer {
    return this.rendererImpl;
  }

  update(data: PaneRendererCustomData<Time, OpenTradeDatum>, options: OpenTradeSeriesOptions): void {
    this.rendererImpl.update(data, options);
  }

  priceValueBuilder(row: OpenTradeDatum): CustomSeriesPricePlotValues {
    const values = row.take === null ? [row.stop] : [row.stop, row.take];
    return [Math.min(...values), Math.max(...values), row.stop];
  }

  isWhitespace(data: OpenTradeDatum | CustomSeriesWhitespaceData<Time>): data is CustomSeriesWhitespaceData<Time> {
    return (data as Partial<OpenTradeDatum>).stop === undefined;
  }

  defaultOptions(): OpenTradeSeriesOptions {
    return {
      ...customSeriesDefaultOptions,
      lastValueVisible: false,
      priceLineVisible: false,
      stopColor: "#d75352",
      takeColor: "#2f9e44",
      lineWidth: 2,
      pointRadius: 2,
    };
  }
}
