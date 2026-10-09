/**
 * EMA stack episode layers on the candle pane (`research-workbench-ema-stack-episodes-v1`), drawn as
 * one series primitive: band, zones and false breaks behind the candles; false-break depth, zone
 * numbers, waves and the forming wave above them; episode lanes in a strip at the bottom of the pane.
 * Every coordinate comes from an Engine field; nothing is computed beyond placing it on the canvas.
 */

import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  Logical,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from "lightweight-charts";

import type { Episode, EpisodeSide, EpisodeWave } from "@/api/episodes";
import type { EpisodeHistory } from "@/features/episodes/episodeHistory";
import { allEpisodes, formingWave, lanePhaseAt, type LanePhase } from "@/features/episodes/episodeLookup";

export type EpisodeLayerToggles = {
  band: boolean;
  zones: boolean;
  falseBreaks: boolean;
  waves: boolean;
  forming: boolean;
};

export type EpisodeHighlight = { side: EpisodeSide; startMs: number; number: number } | null;

export type EpisodeLayersState = {
  histories: Partial<Record<EpisodeSide, EpisodeHistory>>;
  sides: EpisodeSide[];
  layers: EpisodeLayerToggles;
  /** Candle times of the render window, Unix seconds ascending. */
  times: number[];
  stepSec: number;
  highlight: EpisodeHighlight;
};

export const EPISODE_COLORS = {
  bandLong: "rgba(63, 178, 127, 0.07)",
  bandShort: "rgba(224, 96, 90, 0.07)",
  headerLong: "#3fd08f",
  headerShort: "#f08a80",
  zone: "rgba(90, 169, 230, 0.13)",
  zoneEdge: "#5aa9e6",
  falseBreak: "rgba(224, 96, 90, 0.16)",
  falseBreakEdge: "#e0605a",
  up: "#3fd08f",
  down: "#f08a80",
  forming: "#8794a3",
  laneBg: "#1b2330",
  laneAway: "rgba(63, 208, 143, 0.45)",
  stackBreak: "#e0605a",
  text: "#d9e0e8",
  muted: "#8794a3",
} as const;

const LANE_HEIGHT = 10;
const LANE_GAP = 4;
const LANE_LABEL_W = 44;
/** Bottom strip height reserved for the two lanes (price scale bottom margin is set from it). */
export const EPISODE_LANES_STRIP_PX = 2 * LANE_HEIGHT + 3 * LANE_GAP + 12;

const OUTCOME_LABEL: Record<string, string> = { comeback: "comeback", stack_break: "stack break" };

function fmt(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

type Scene = {
  chart: IChartApi;
  series: ISeriesApi<SeriesType>;
  state: EpisodeLayersState;
};

/** Fractional logical index of a time (ms) on the render window, extrapolated outside it. */
function logicalOfMs(times: number[], stepSec: number, ms: number): number {
  const t = ms / 1000;
  const n = times.length;
  if (n === 0) return 0;
  if (t <= times[0]!) return (t - times[0]!) / stepSec;
  if (t >= times[n - 1]!) return n - 1 + (t - times[n - 1]!) / stepSec;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= t) lo = mid;
    else hi = mid;
  }
  const span = times[hi]! - times[lo]!;
  return lo + (span > 0 ? (t - times[lo]!) / span : 0);
}

class Drawer {
  private readonly visibleFrom: number;
  private readonly visibleTo: number;
  private readonly halfBar: number;

  constructor(private readonly scene: Scene) {
    const range = scene.chart.timeScale().getVisibleLogicalRange();
    this.visibleFrom = range ? range.from - 1 : -Infinity;
    this.visibleTo = range ? range.to + 1 : Infinity;
    this.halfBar = scene.chart.timeScale().options().barSpacing / 2;
  }

  logical(ms: number): number {
    const { times, stepSec } = this.scene.state;
    return logicalOfMs(times, stepSec, ms);
  }

  x(ms: number): number | null {
    const coordinate = this.scene.chart.timeScale().logicalToCoordinate(this.logical(ms) as Logical);
    return coordinate === null ? null : coordinate;
  }

  y(price: number | null): number | null {
    if (price === null) return null;
    const coordinate = this.scene.series.priceToCoordinate(price);
    return coordinate === null ? null : coordinate;
  }

  visible(startMs: number, endMs: number | null): boolean {
    const from = this.logical(startMs);
    const to = endMs === null ? Infinity : this.logical(endMs);
    return to >= this.visibleFrom && from <= this.visibleTo;
  }

  /** x span of bars `startMs`..`endMs` (bar edges), `null` end = open to the right edge. */
  span(startMs: number, endMs: number | null, width: number): [number, number] | null {
    const x0 = this.x(startMs);
    const x1 = endMs === null ? width : this.x(endMs);
    if (x0 === null || x1 === null) return null;
    return [x0 - this.halfBar, endMs === null ? x1 : x1 + this.halfBar];
  }

  episodes(side: EpisodeSide): Episode[] {
    const history = this.scene.state.histories[side];
    if (!history) return [];
    return allEpisodes(history).filter((episode) =>
      this.visible(episode.start_ms, episode.stack_break_ms),
    );
  }

  isHighlighted(side: EpisodeSide, episode: Episode, number: number): boolean {
    const h = this.scene.state.highlight;
    return h !== null && h.side === side && h.startMs === episode.start_ms && h.number === number;
  }

  background(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const { sides, layers } = this.scene.state;
    for (const side of sides) {
      for (const episode of this.episodes(side)) {
        if (layers.band) {
          const s = this.span(episode.start_ms, episode.stack_break_ms, width);
          if (s) {
            ctx.fillStyle = side === "long" ? EPISODE_COLORS.bandLong : EPISODE_COLORS.bandShort;
            ctx.fillRect(s[0], 0, s[1] - s[0], height);
          }
        }
        if (layers.zones) {
          for (const zone of episode.zones) {
            const s = this.span(zone.start, zone.end, width);
            if (!s) continue;
            ctx.fillStyle = EPISODE_COLORS.zone;
            ctx.fillRect(s[0], 0, s[1] - s[0], height);
            if (this.isHighlighted(side, episode, zone.number)) {
              ctx.strokeStyle = EPISODE_COLORS.zoneEdge;
              ctx.lineWidth = 1;
              ctx.strokeRect(s[0], 0, s[1] - s[0], height);
            }
          }
        }
        if (layers.falseBreaks) {
          for (const fb of episode.false_breaks) {
            const s = this.span(fb.start, fb.end, width);
            if (!s) continue;
            ctx.fillStyle = EPISODE_COLORS.falseBreak;
            ctx.fillRect(s[0], 0, s[1] - s[0], height);
            if (this.isHighlighted(side, episode, fb.number)) {
              ctx.strokeStyle = EPISODE_COLORS.falseBreakEdge;
              ctx.lineWidth = 1;
              ctx.strokeRect(s[0], 0, s[1] - s[0], height);
            }
          }
        }
      }
    }
  }

  foreground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const { sides, layers } = this.scene.state;
    ctx.font = "10.5px ui-monospace, Menlo, monospace";
    ctx.textBaseline = "alphabetic";
    sides.forEach((side, sideIndex) => {
      for (const episode of this.episodes(side)) {
        if (layers.band) this.header(ctx, side, sideIndex, episode, width);
        if (layers.falseBreaks) this.falseBreakMarks(ctx, side, episode, width, height);
        if (layers.waves) {
          for (const wave of episode.waves) {
            if (wave.final) this.wave(ctx, wave, this.isHighlighted(side, episode, wave.number), side);
          }
        }
        if (layers.forming) {
          const forming = formingWave(episode);
          if (forming) this.forming(ctx, forming);
        }
        if (layers.zones) this.zoneNumbers(ctx, side, episode);
        if (layers.band && episode.stack_break_ms !== null) {
          const x = this.x(episode.stack_break_ms);
          if (x !== null) {
            ctx.strokeStyle = EPISODE_COLORS.stackBreak;
            ctx.lineWidth = 1.5;
            line(ctx, x, 0, x, height - EPISODE_LANES_STRIP_PX);
          }
        }
      }
    });
    this.lanes(ctx, width, height);
  }

  private header(
    ctx: CanvasRenderingContext2D,
    side: EpisodeSide,
    sideIndex: number,
    episode: Episode,
    width: number,
  ): void {
    const s = this.span(episode.start_ms, episode.stack_break_ms, width);
    if (!s) return;
    const x = Math.max(s[0], 0) + 4;
    const y = 14 + sideIndex * 14;
    const end = episode.stack_break_ms === null ? "running" : "stack break";
    const label = `${side.toUpperCase()} · S0 → ${end} · touches ${episode.touches} · false breaks ${episode.false_breaks_count}${episode.censored ? " · censored" : ""}`;
    ctx.save();
    ctx.beginPath();
    ctx.rect(s[0], 0, s[1] - s[0], y + 4);
    ctx.clip();
    ctx.fillStyle = side === "long" ? EPISODE_COLORS.headerLong : EPISODE_COLORS.headerShort;
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  private zoneNumbers(ctx: CanvasRenderingContext2D, side: EpisodeSide, episode: Episode): void {
    for (const zone of episode.zones) {
      const x = this.x(zone.start);
      const edge = this.y(side === "long" ? zone.low : zone.high);
      if (x === null || edge === null) continue;
      const cy = side === "long" ? edge + 16 : edge - 16;
      ctx.fillStyle = EPISODE_COLORS.zoneEdge;
      ctx.beginPath();
      ctx.arc(x, cy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0f131a";
      ctx.textAlign = "center";
      ctx.fillText(String(zone.number), x, cy + 4);
      ctx.textAlign = "left";
    }
  }

  private falseBreakMarks(
    ctx: CanvasRenderingContext2D,
    side: EpisodeSide,
    episode: Episode,
    width: number,
    height: number,
  ): void {
    for (const fb of episode.false_breaks) {
      const s = this.span(fb.start, fb.end, width);
      const zone = episode.zones.find((z) => z.number === fb.number);
      if (!s || !zone) continue;
      const zoneEdge = this.y(side === "long" ? zone.low : zone.high);
      const breakEdge = this.y(side === "long" ? fb.low : fb.high);
      ctx.strokeStyle = EPISODE_COLORS.falseBreakEdge;
      ctx.fillStyle = EPISODE_COLORS.falseBreakEdge;
      if (zoneEdge !== null && breakEdge !== null) {
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        line(ctx, s[0], zoneEdge, s[1] + 10, zoneEdge);
        line(ctx, s[0], breakEdge, s[1] + 10, breakEdge);
        ctx.setLineDash([]);
        ctx.lineWidth = 1.5;
        line(ctx, s[1] + 10, zoneEdge, s[1] + 10, breakEdge);
        ctx.fillText(`depth ${fmt(fb.depth)}`, s[1] + 14, (zoneEdge + breakEdge) / 2 + 4);
      }
      const outcome = fb.outcome === null ? "open" : OUTCOME_LABEL[fb.outcome] ?? fb.outcome;
      ctx.textAlign = "center";
      ctx.fillText(`false break · ${outcome}`, (s[0] + s[1]) / 2, height - EPISODE_LANES_STRIP_PX - 6);
      ctx.textAlign = "left";
    }
  }

  private wave(ctx: CanvasRenderingContext2D, wave: EpisodeWave, highlighted: boolean, side: EpisodeSide): void {
    const xo = wave.origin === null ? null : this.x(wave.origin);
    const xp = wave.peak === null ? null : this.x(wave.peak);
    const xt = wave.touch === null ? null : this.x(wave.touch);
    const yo = this.y(wave.origin_price);
    const yp = this.y(wave.peak_price);
    const yt = this.y(wave.touch_price);
    const width = highlighted ? 3.6 : 2.4;
    ctx.lineCap = "round";
    if (xo !== null && yo !== null && xp !== null && yp !== null) {
      ctx.strokeStyle = EPISODE_COLORS.up;
      ctx.lineWidth = width;
      line(ctx, xo, yo, xp, yp);
      if (xt !== null && yt !== null) {
        ctx.strokeStyle = EPISODE_COLORS.down;
        ctx.setLineDash([6, 4]);
        line(ctx, xp, yp, xt, yt);
        ctx.setLineDash([]);
      }
      const below = side === "long" ? 1 : -1;
      ctx.fillStyle = EPISODE_COLORS.up;
      dot(ctx, xo, yo);
      dot(ctx, xp, yp);
      ctx.textAlign = "center";
      ctx.fillText(`S*${wave.number}`, xo, yo + below * 15 + (below > 0 ? 0 : 4));
      ctx.fillText(`P${wave.number}`, xp, yp - below * 8 + (below > 0 ? 0 : 8));
      ctx.textAlign = "left";
    }
    ctx.lineCap = "butt";
  }

  private forming(ctx: CanvasRenderingContext2D, wave: EpisodeWave): void {
    const xo = wave.origin === null ? null : this.x(wave.origin);
    const xp = wave.peak === null ? null : this.x(wave.peak);
    const yo = this.y(wave.origin_price);
    const yp = this.y(wave.peak_price);
    if (xo === null || xp === null || yo === null || yp === null) return;
    ctx.strokeStyle = EPISODE_COLORS.forming;
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 4]);
    line(ctx, xo, yo, xp, yp);
    ctx.setLineDash([]);
    ctx.fillStyle = EPISODE_COLORS.forming;
    ctx.textAlign = "right";
    ctx.fillText(`wave ${wave.number} forming`, xp - 4, yp - 10);
    ctx.textAlign = "left";
  }

  private lanes(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const { histories, times } = this.scene.state;
    const top = height - EPISODE_LANES_STRIP_PX + 12;
    const timeScale = this.scene.chart.timeScale();
    const barW = Math.max(timeScale.options().barSpacing, 1);
    const from = Math.max(0, Math.floor(this.visibleFrom));
    const to = Math.min(times.length - 1, Math.ceil(this.visibleTo));
    (["long", "short"] as const).forEach((side, row) => {
      const y = top + row * (LANE_HEIGHT + LANE_GAP);
      ctx.fillStyle = EPISODE_COLORS.laneBg;
      ctx.fillRect(0, y, width, LANE_HEIGHT);
      const history = histories[side];
      if (history) {
        const episodes = allEpisodes(history);
        for (let i = from; i <= to; i += 1) {
          const phase = lanePhaseAt(episodes, times[i]! * 1000);
          if (phase === null) continue;
          const x = timeScale.logicalToCoordinate(i as Logical);
          if (x === null) continue;
          paintLaneCell(ctx, phase, x - barW / 2, y, barW + 0.3);
        }
        for (const episode of this.episodes(side)) {
          for (const zone of episode.zones) {
            const x = this.x(zone.start);
            if (x === null) continue;
            ctx.fillStyle = EPISODE_COLORS.zoneEdge;
            ctx.textAlign = "center";
            ctx.fillText(String(zone.number), x, y - 1);
            ctx.textAlign = "left";
          }
        }
      }
      ctx.fillStyle = EPISODE_COLORS.muted;
      ctx.fillText(side.toUpperCase(), Math.max(width - LANE_LABEL_W, 0), y + LANE_HEIGHT - 1);
    });
  }
}

function paintLaneCell(ctx: CanvasRenderingContext2D, phase: LanePhase, x: number, y: number, w: number): void {
  if (phase === "away") {
    ctx.fillStyle = EPISODE_COLORS.laneAway;
    ctx.fillRect(x, y + 3, w, LANE_HEIGHT - 6);
    return;
  }
  ctx.fillStyle = phase === "in_zone" ? EPISODE_COLORS.zoneEdge : EPISODE_COLORS.falseBreakEdge;
  ctx.fillRect(x, y, w, LANE_HEIGHT);
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

class LayerRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly scene: () => Scene | null,
    private readonly layer: "background" | "foreground",
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    if (this.layer === "foreground") this.paint(target);
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (this.layer === "background") this.paint(target);
  }

  private paint(target: CanvasRenderingTarget2D): void {
    const scene = this.scene();
    if (!scene || scene.state.times.length === 0) return;
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      const drawer = new Drawer(scene);
      if (this.layer === "background") drawer.background(context, mediaSize.width, mediaSize.height);
      else drawer.foreground(context, mediaSize.width, mediaSize.height);
    });
  }
}

class LayerView implements IPrimitivePaneView {
  private readonly rendererInstance: LayerRenderer;

  constructor(
    scene: () => Scene | null,
    private readonly layer: "background" | "foreground",
  ) {
    this.rendererInstance = new LayerRenderer(scene, layer);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return this.layer === "background" ? "bottom" : "top";
  }

  renderer(): IPrimitivePaneRenderer {
    return this.rendererInstance;
  }
}

export const EMPTY_EPISODE_LAYERS_STATE: EpisodeLayersState = {
  histories: {},
  sides: [],
  layers: { band: true, zones: true, falseBreaks: true, waves: true, forming: true },
  times: [],
  stepSec: 300,
  highlight: null,
};

export class EpisodeLayersPrimitive implements ISeriesPrimitive<Time> {
  private attachedParams: SeriesAttachedParameter<Time> | null = null;
  private state: EpisodeLayersState = EMPTY_EPISODE_LAYERS_STATE;
  private readonly views: LayerView[];

  constructor() {
    const scene = () =>
      this.attachedParams
        ? {
            chart: this.attachedParams.chart as IChartApi,
            series: this.attachedParams.series,
            state: this.state,
          }
        : null;
    this.views = [new LayerView(scene, "background"), new LayerView(scene, "foreground")];
  }

  attached(params: SeriesAttachedParameter<Time>): void {
    this.attachedParams = params;
  }

  detached(): void {
    this.attachedParams = null;
  }

  setState(state: EpisodeLayersState): void {
    this.state = state;
    this.attachedParams?.requestUpdate();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views;
  }
}
