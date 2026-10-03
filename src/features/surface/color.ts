/** Heatmap colours (dark theme of the workbench). Pure helpers, no data semantics. */
export const GREY = "#262d38";

export type Scale = { min: number; max: number; diverging: boolean };

export function makeScale(values: number[]): Scale | null {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, diverging: min < 0 && max > 0 };
}

function mix(a: number[], b: number[], t: number): string {
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const NEUTRAL = [38, 45, 56];
const GOOD = [46, 160, 90];
const BAD = [200, 70, 70];
const LOW = [30, 58, 95];
const HIGH = [96, 165, 250];

export function colorFor(value: number | null, scale: Scale | null): string {
  if (value === null || scale === null) return GREY;
  if (scale.diverging) {
    return value >= 0 ? mix(NEUTRAL, GOOD, value / scale.max) : mix(NEUTRAL, BAD, value / scale.min);
  }
  const span = scale.max - scale.min;
  return mix(LOW, HIGH, span === 0 ? 0.5 : (value - scale.min) / span);
}
