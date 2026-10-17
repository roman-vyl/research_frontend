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

import type { AppliedRing } from "@/features/runtime/runtimeAppliedOrders";

/** One bar with applied orders: the rings of every order of that bar. */
export type AppliedDatum = CustomData<Time> & { rings: AppliedRing[] };

export type AppliedSeriesOptions = CustomSeriesOptions & {
  entryColor: string;
  stopColor: string;
  takeColor: string;
  ringWidth: number;
  ringRadius: number;
};

type DrawTarget = Parameters<ICustomSeriesPaneRenderer["draw"]>[0];
type PriceToY = Parameters<ICustomSeriesPaneRenderer["draw"]>[1];

/** The non-null prices of a bar's rings. */
export function ringPrices(rings: readonly AppliedRing[]): number[] {
  return rings.flatMap((r) => [r.entry, r.stop, r.take].filter((p): p is number => p !== null));
}

class AppliedRenderer implements ICustomSeriesPaneRenderer {
  private bars: { x: number; rings: AppliedRing[] }[] = [];
  private options: AppliedSeriesOptions | null = null;

  update(data: PaneRendererCustomData<Time, AppliedDatum>, options: AppliedSeriesOptions): void {
    this.options = options;
    this.bars = data.bars.map((b) => ({ x: b.x, rings: b.originalData.rings }));
  }

  draw(target: DrawTarget, priceToY: PriceToY): void {
    const options = this.options;
    if (options === null || this.bars.length === 0) return;
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const keys = [
        ["entry", options.entryColor],
        ["stop", options.stopColor],
        ["take", options.takeColor],
      ] as const;
      ctx.lineWidth = options.ringWidth * hr;
      for (const bar of this.bars) {
        for (const ring of bar.rings) {
          for (const [key, color] of keys) {
            const value = ring[key];
            if (value === null) continue;
            const y = priceToY(value);
            if (y === null) continue;
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.arc(bar.x * hr, y * vr, options.ringRadius * hr, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
    });
  }
}

/** One custom series draws the rings of every applied order; no lines join them. */
export class AppliedSeriesView implements ICustomSeriesPaneView<Time, AppliedDatum, AppliedSeriesOptions> {
  private readonly rendererImpl = new AppliedRenderer();

  renderer(): ICustomSeriesPaneRenderer {
    return this.rendererImpl;
  }

  update(data: PaneRendererCustomData<Time, AppliedDatum>, options: AppliedSeriesOptions): void {
    this.rendererImpl.update(data, options);
  }

  priceValueBuilder(row: AppliedDatum): CustomSeriesPricePlotValues {
    const prices = ringPrices(row.rings);
    if (prices.length === 0) return [];
    return [Math.min(...prices), Math.max(...prices), prices[0]!];
  }

  isWhitespace(data: AppliedDatum | CustomSeriesWhitespaceData<Time>): data is CustomSeriesWhitespaceData<Time> {
    return (data as Partial<AppliedDatum>).rings === undefined;
  }

  defaultOptions(): AppliedSeriesOptions {
    return {
      ...customSeriesDefaultOptions,
      lastValueVisible: false,
      priceLineVisible: false,
      entryColor: "#52514e",
      stopColor: "#d75352",
      takeColor: "#2f9e44",
      ringWidth: 1.5,
      ringRadius: 5,
    };
  }
}
