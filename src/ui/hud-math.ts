/**
 * Pure HUD helpers (no DOM, no three) so they run under vitest's node environment.
 * Dial convention: noon at the top, midnight at the bottom, clockwise — the sun rises on the
 * left, crosses the top and sets on the right.
 */
import type { WeatherName } from '../core/params.ts';

const TAU = Math.PI * 2;
const wrap24 = (h: number): number => ((h % 24) + 24) % 24;
const wrapTau = (a: number): number => ((a % TAU) + TAU) % TAU;

/** Hour → dial angle in radians, clockwise from the top (12:00 = 0, 18:00 = π/2). */
export function hourToAngle(hour: number): number {
  return wrapTau(((wrap24(hour) - 12) / 24) * TAU);
}

/** Dial angle (radians, clockwise from the top) → hour [0, 24). */
export function angleToHour(angle: number): number {
  return wrap24((wrapTau(angle) / TAU) * 24 + 12);
}

/**
 * Pointer offset from the dial centre in screen pixels (y grows downward) → hour.
 * Returns NaN for a pointer exactly on the centre.
 */
export function pointerToHour(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return NaN;
  return angleToHour(Math.atan2(dx, -dy));
}

/** `HH:MM`, minutes floored. */
export function formatHour(hour: number): string {
  const h = wrap24(hour);
  let hh = Math.floor(h);
  let mm = Math.floor((h - hh) * 60 + 1e-6);
  if (mm >= 60) {
    mm -= 60;
    hh = (hh + 1) % 24;
  }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** The first time stop after `hour` (cyclic), skipping stops within `eps` hours of it. */
export function nextTimeStop(hour: number, stops: readonly number[], eps = 0.05): number {
  if (stops.length === 0) return wrap24(hour);
  const h = wrap24(hour);
  let best = stops[0];
  let bestD = Infinity;
  for (const s of stops) {
    let d = wrap24(s) - h;
    if (d <= eps) d += 24;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return wrap24(best);
}

/** Next weather state in the cycle (unknown → first). */
export function nextWeather(cur: WeatherName, cycle: readonly WeatherName[]): WeatherName {
  const i = cycle.indexOf(cur);
  return cycle[(i + 1) % cycle.length] ?? 'clear';
}

/** Exported PNG name: `marisland-<seed>-<HH>.png`. */
export function photoFilename(seed: number, hour: number): string {
  return `marisland-${seed >>> 0}-${String(Math.floor(wrap24(hour))).padStart(2, '0')}.png`;
}

/**
 * Compass needle rotation (deg, clockwise on screen) for a camera-controls azimuth (radians).
 * Azimuth θ puts the camera at (sin θ, ·, cos θ) around the target; north is −z, which then
 * appears θ clockwise from screen-up.
 */
export function compassDeg(azimuth: number): number {
  return (azimuth * 180) / Math.PI;
}

/** The azimuth equivalent to north that is closest to `azimuth` (no multi-turn spins). */
export function nearestNorth(azimuth: number): number {
  return Math.round(azimuth / TAU) * TAU;
}

/** True when the sun is up for the dial icon (sun vs moon). */
export function isDay(hour: number): boolean {
  const h = wrap24(hour);
  return h >= 6 && h < 19.5;
}

/** Conic-gradient stops for the dial ring from time-of-day keys: `[deg, colour]` sorted. */
export function dialStops(
  keys: readonly { hour: number; color: string }[],
): Array<{ deg: number; color: string }> {
  const ks = keys
    .map((k) => ({ hour: wrap24(k.hour), color: k.color }))
    .sort((a, b) => a.hour - b.hour);
  if (ks.length === 0) return [];
  const first = ks[0];
  const last = ks[ks.length - 1];
  // Colour at midnight: interpolate across the wrap.
  const span = first.hour + 24 - last.hour;
  const u = span > 0 ? (24 - last.hour) / span : 0;
  const mid = mixHex(last.color, first.color, u);
  // conic-gradient(from 180deg, …): 0deg = midnight (bottom), hour × 15 clockwise.
  return [
    { deg: 0, color: mid },
    ...ks.map((k) => ({ deg: Math.round(k.hour * 15 * 100) / 100, color: k.color })),
    { deg: 360, color: mid },
  ];
}

/** Linear mix of two `#RRGGBB` colours. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number): number => (p >> s) & 255;
  const out = [16, 8, 0].map((s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Signed smallest angle difference b − a in (−π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = wrapTau(b - a);
  if (d > Math.PI) d -= TAU;
  return d;
}

/** A placed label: centre and size in CSS px. */
export interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Gaps kept between label pills (px). */
const LABEL_PAD_X = 6;
const LABEL_PAD_Y = 4;
/** Screen-edge margin (px). */
const LABEL_EDGE = 8;

/** True when two label boxes (plus the gaps) overlap. */
export function labelsOverlap(a: LabelBox, b: LabelBox): boolean {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 + LABEL_PAD_X &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2 + LABEL_PAD_Y
  );
}

/** A wanted label centre; `cost` biases the choice between several (0 = preferred). */
export interface LabelSpot {
  x: number;
  y: number;
  cost: number;
}

/**
 * Width-aware label placement: the cheapest free spot near one of `spots`. Candidates are each
 * spot and the spots just clear of every placed box (above / below / left / right of it, and their
 * combinations), clamped to the screen; a candidate is free when it overlaps no placed box and
 * `blocked` (dock / edit panel) rejects it. Cost = spot cost + 1.5 × |dx| + |dy| upward or
 * 1.25 × dy downward, so labels nudge upward (off the island) first. When nothing is free the
 * first spot is returned clamped (overlap unavoidable).
 */
export function placeLabel(
  w: number,
  h: number,
  spots: readonly LabelSpot[],
  placed: readonly LabelBox[],
  view: { width: number; height: number },
  blocked: (b: LabelBox) => boolean = () => false,
): LabelBox {
  const minX = w / 2 + LABEL_EDGE;
  const maxX = Math.max(minX, view.width - w / 2 - LABEL_EDGE);
  const minY = h / 2 + LABEL_EDGE;
  const maxY = Math.max(minY, view.height - h / 2 - LABEL_EDGE);
  const cx = (x: number): number => Math.min(Math.max(x, minX), maxX);
  const cy = (y: number): number => Math.min(Math.max(y, minY), maxY);
  let best: LabelBox | null = null;
  let bestCost = Infinity;
  for (const s of spots) {
    const sx = cx(s.x);
    const sy = cy(s.y);
    const xs = [sx];
    const ys = [sy];
    for (const p of placed) {
      const ox = (p.w + w) / 2 + LABEL_PAD_X + 0.5;
      const oy = (p.h + h) / 2 + LABEL_PAD_Y + 0.5;
      xs.push(cx(p.x - ox), cx(p.x + ox));
      ys.push(cy(p.y - oy), cy(p.y + oy));
    }
    for (const x of xs)
      for (const y of ys) {
        const dy = y - s.y;
        const cost = s.cost + Math.abs(x - s.x) * 1.5 + (dy < 0 ? -dy : dy * 1.25);
        if (cost >= bestCost) continue;
        const b = { x, y, w, h };
        if (blocked(b) || placed.some((p) => labelsOverlap(p, b))) continue;
        best = b;
        bestCost = cost;
      }
  }
  const s0 = spots[0] ?? { x: view.width / 2, y: view.height / 2 };
  return best ?? { x: cx(s0.x), y: cy(s0.y), w, h };
}
