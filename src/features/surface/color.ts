/**
 * Heatmap colours of the Surface view: a percentile-rank ramp over the theme tokens defined in
 * `surface.css` (so light and dark themes share one code path). Pure helpers, no data semantics.
 */
import type { MetricStyle } from "@/features/surface/model";

export type Tokens = {
  pos100: string; pos300: string; pos500: string; pos700: string;
  neg300: string; neg500: string; neg700: string;
  mid: string; ink: string; offBg: string; offInk: string;
};

export const LIGHT_TOKENS: Tokens = {
  pos100: "#dcf5dc", pos300: "#86d68b", pos500: "#2f9e44", pos700: "#14532d",
  neg300: "#ec9291", neg500: "#d75352", neg700: "#7a1a19",
  mid: "#f0efec", ink: "#0b0b0b", offBg: "#d9d8d3", offInk: "#8e8c85",
};

const VARS: Record<keyof Tokens, string> = {
  pos100: "--pos-100", pos300: "--pos-300", pos500: "--pos-500", pos700: "--pos-700",
  neg300: "--neg-300", neg500: "--neg-500", neg700: "--neg-700",
  mid: "--mid", ink: "--ink", offBg: "--off-bg", offInk: "--off-ink",
};

export function readTokens(el: Element): Tokens {
  const cs = getComputedStyle(el);
  const out = { ...LIGHT_TOKENS };
  for (const k of Object.keys(VARS) as (keyof Tokens)[]) {
    let v = cs.getPropertyValue(VARS[k]).trim();
    if (/^#[0-9a-f]{3}$/i.test(v)) v = `#${[...v.slice(1)].map((c) => c + c).join("")}`;
    if (/^#[0-9a-f]{6}$/i.test(v)) out[k] = v;
  }
  return out;
}

const hexToRgb = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${A.map((x, i) => Math.round(x + (B[i] - x) * k)).join(",")})`;
}

function ramp(stops: string[], t: number): string {
  const seg = Math.min(Math.floor(t * (stops.length - 1)), stops.length - 2);
  return mix(stops[seg], stops[seg + 1], t * (stops.length - 1) - seg);
}

/** Percentile rank of `v` among the sorted `s` (ties share the middle rank), in [0, 1]. */
export function rank(v: number, s: number[]): number {
  if (s.length <= 1) return 0.5;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (s[m] < v) lo = m + 1;
    else hi = m;
  }
  const first = lo;
  hi = s.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (s[m] <= v) lo = m + 1;
    else hi = m;
  }
  return (first + lo - 1) / 2 / (s.length - 1);
}

export type Domain = { all: number[]; pos: number[]; neg: number[]; center: number; seq: boolean; goodHigh: boolean };

/** Colour domain of one frame; `delta` frames diverge at 0 and ignore the metric's own centre. */
export function makeDomain(values: number[], style: MetricStyle, delta: boolean): Domain {
  const all = [...values].sort((a, b) => a - b);
  const center = delta ? 0 : style.center;
  return {
    all,
    pos: all.filter((v) => v >= center),
    neg: all.filter((v) => v < center),
    center,
    seq: style.seq && !delta,
    goodHigh: style.goodHigh && !delta,
  };
}

export function colorOf(v: number | null, d: Domain, t: Tokens): string {
  if (v === null) return t.offBg;
  if (d.seq) return ramp([t.pos100, t.pos300, t.pos500, t.pos700], rank(v, d.all));
  if (d.goodHigh) return ramp([t.neg500, t.mid, t.pos500], rank(v, d.all));
  if (v >= d.center) return ramp([t.mid, t.pos300, t.pos500, t.pos700], rank(v, d.pos));
  return ramp([t.mid, t.neg300, t.neg500, t.neg700], 1 - rank(v, d.neg));
}

/** Readable text colour on a cell background (ink on light cells, white on dark ones). */
export function textOn(bg: string, t: Tokens): string {
  const m = bg.match(/\d+/g);
  if (!m) return t.ink;
  const [r, g, b] = m.map(Number).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? t.ink : "#fff";
}
