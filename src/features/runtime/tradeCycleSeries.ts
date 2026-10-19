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

import type { CycleSide, TradeCycles } from "@/features/runtime/runtimeTradeCycles";

/** The levels of one position period on one bar; `period` joins the bars of the same period. */
export type PeriodLevel = { period: number; entry: number; stop: number | null; take: number | null };

/** One bar: the fill arrows of that bar and the levels of every period covering it. */
export type TradeCycleDatum = CustomData<Time> & {
  arrows: { price: number; side: CycleSide }[];
  levels: PeriodLevel[];
};

export type TradeCycleSeriesOptions = CustomSeriesOptions & {
  entryColor: string;
  stopColor: string;
  takeColor: string;
  lineWidth: number;
  arrowSize: number;
};

type DrawTarget = Parameters<ICustomSeriesPaneRenderer["draw"]>[0];
type PriceToY = Parameters<ICustomSeriesPaneRenderer["draw"]>[1];

/** One datum per candle that has a fill arrow or lies inside a position period, in candle order. */
export function tradeCycleData(candleTimes: readonly number[], cycles: TradeCycles): (TradeCycleDatum & { time: Time })[] {
  const out: (TradeCycleDatum & { time: Time })[] = [];
  for (const time of candleTimes) {
    const arrows = cycles.opens.filter((o) => o.time === time).map((o) => ({ price: o.price, side: o.side }));
    const levels = cycles.periods.flatMap((p, period) =>
      p.fromTime <= time && time <= p.toTime ? [{ period, entry: p.entry, stop: p.stop, take: p.take }] : [],
    );
    if (arrows.length > 0 || levels.length > 0) out.push({ time: time as Time, arrows, levels });
  }
  return out;
}

class TradeCycleRenderer implements ICustomSeriesPaneRenderer {
  private bars: { x: number; datum: TradeCycleDatum }[] = [];
  private options: TradeCycleSeriesOptions | null = null;

  update(data: PaneRendererCustomData<Time, TradeCycleDatum>, options: TradeCycleSeriesOptions): void {
    this.options = options;
    this.bars = data.bars.map((b) => ({ x: b.x, datum: b.originalData }));
  }

  draw(target: DrawTarget, priceToY: PriceToY): void {
    const options = this.options;
    if (options === null || this.bars.length === 0) return;
    // The visible span of each period: its first and last visible bar.
    const spans = new Map<number, { x0: number; x1: number; level: PeriodLevel }>();
    for (const bar of this.bars) {
      for (const level of bar.datum.levels) {
        const span = spans.get(level.period);
        if (span === undefined) spans.set(level.period, { x0: bar.x, x1: bar.x, level });
        else span.x1 = bar.x;
      }
    }
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const hline = (x0: number, x1: number, value: number | null, color: string, dashed: boolean) => {
        if (value === null || x1 <= x0) return;
        const y = priceToY(value);
        if (y === null) return;
        ctx.strokeStyle = color;
        ctx.setLineDash(dashed ? [4 * hr, 3 * hr] : []);
        ctx.beginPath();
        ctx.moveTo(x0 * hr, y * vr);
        ctx.lineTo(x1 * hr, y * vr);
        ctx.stroke();
      };
      ctx.lineWidth = options.lineWidth * hr;
      for (const { x0, x1, level } of spans.values()) {
        hline(x0, x1, level.entry, options.entryColor, false);
        hline(x0, x1, level.stop, options.stopColor, true);
        hline(x0, x1, level.take, options.takeColor, true);
      }
      ctx.setLineDash([]);
      ctx.fillStyle = options.entryColor;
      const s = options.arrowSize;
      for (const bar of this.bars) {
        for (const arrow of bar.datum.arrows) {
          const y = priceToY(arrow.price);
          if (y === null) continue;
          const x = bar.x * hr;
          const py = y * vr;
          ctx.beginPath();
          if (arrow.side === null) {
            ctx.arc(x, py, (s / 2) * hr, 0, Math.PI * 2);
          } else {
            // The tip sits on the fill price; the body lies on the side the price came from.
            const dir = arrow.side === "long" ? 1 : -1;
            ctx.moveTo(x, py);
            ctx.lineTo(x - s * hr, py + dir * s * 1.4 * vr);
            ctx.lineTo(x + s * hr, py + dir * s * 1.4 * vr);
            ctx.closePath();
          }
          ctx.fill();
        }
      }
    });
  }
}

/** One custom series draws every fill arrow and every position period; the projection is untouched. */
export class TradeCycleSeriesView implements ICustomSeriesPaneView<Time, TradeCycleDatum, TradeCycleSeriesOptions> {
  private readonly rendererImpl = new TradeCycleRenderer();

  renderer(): ICustomSeriesPaneRenderer {
    return this.rendererImpl;
  }

  update(data: PaneRendererCustomData<Time, TradeCycleDatum>, options: TradeCycleSeriesOptions): void {
    this.rendererImpl.update(data, options);
  }

  priceValueBuilder(row: TradeCycleDatum): CustomSeriesPricePlotValues {
    const prices = [
      ...row.arrows.map((a) => a.price),
      ...row.levels.flatMap((l) => [l.entry, l.stop, l.take].filter((p): p is number => p !== null)),
    ];
    if (prices.length === 0) return [];
    return [Math.min(...prices), Math.max(...prices), prices[0]!];
  }

  isWhitespace(data: TradeCycleDatum | CustomSeriesWhitespaceData<Time>): data is CustomSeriesWhitespaceData<Time> {
    return (data as Partial<TradeCycleDatum>).arrows === undefined;
  }

  defaultOptions(): TradeCycleSeriesOptions {
    return {
      ...customSeriesDefaultOptions,
      lastValueVisible: false,
      priceLineVisible: false,
      entryColor: "#52514e",
      stopColor: "#d75352",
      takeColor: "#2f9e44",
      lineWidth: 1.5,
      arrowSize: 6,
    };
  }
}
