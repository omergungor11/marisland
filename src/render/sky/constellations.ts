import * as THREE from 'three';
import { THEME_IDS, type IslandData, type ThemeId } from '../../world/types.ts';
import {
  CONSTELLATIONS,
  CONSTELLATION_LOOK as LOOK,
  CONSTELLATION_MAX as MAX,
} from '../../content/constellations.ts';
import { moonDir } from '../../env/env-state.ts';

/**
 * Culture constellations (TASK-491, `W:G4`): placement (pure) and the sky's glyph data texture.
 * Drawn by the sky dome program (sky.glsl.ts), 0 extra programs / draw calls.
 */

const DEG = Math.PI / 180;
/** Texels per glyph row: star slots, then line slots. */
export const CONST_ROW = MAX.stars + MAX.lines;
/** Empty slot position (glyph units): far outside every cap, contributes nothing. */
const FAR = 1e4;

export interface ConstellationPlacement {
  theme: ThemeId;
  /** Unit direction of the glyph centre on the sky (y up). */
  dir: THREE.Vector3;
  bearingDeg: number;
  elevationDeg: number;
}

const dirOf = (bearingDeg: number, elDeg: number, out: THREE.Vector3): THREE.Vector3 =>
  out.set(
    Math.cos(elDeg * DEG) * Math.cos(bearingDeg * DEG),
    Math.sin(elDeg * DEG),
    Math.cos(elDeg * DEG) * Math.sin(bearingDeg * DEG),
  );

/** Glyph bounding radius in glyph units (farthest star + one unit margin). */
export function glyphRadius(theme: ThemeId): number {
  let r = 0;
  for (const [x, y] of CONSTELLATIONS[theme].stars) r = Math.max(r, Math.hypot(x, y));
  return r + 1;
}

/** Hours the moon is up at night, sampled for the keep-away check. */
const MOON_HOURS = [19.75, 20.5, 21.25, 22, 23, 0, 1, 2, 3, 4];
const _m = { x: 0, y: 0, z: 0 };

/**
 * Each themed island's glyph sits on the bearing from the archipelago centre (mean of the island
 * centres) to the island, at atan(skyHeight / distance) clamped to `elevationDeg`; HQ (the centre)
 * rides higher (`hq.elevationDeg`) in the middle of the widest gap between the others' bearings
 * (`hq.bearingDeg` when it is alone). A glyph whose disc would come within `moonClearDeg` of the moon at any
 * night hour steps down (1° at a time, not below the low clamp).
 */
export function placeConstellations(
  islands: readonly Pick<IslandData, 'theme' | 'cx' | 'cz'>[],
): ConstellationPlacement[] {
  if (islands.length === 0) return [];
  let mx = 0;
  let mz = 0;
  for (const i of islands) {
    mx += i.cx;
    mz += i.cz;
  }
  mx /= islands.length;
  mz /= islands.length;
  // HQ (the centre) takes the middle of the widest bearing gap between the other glyphs
  const others = islands
    .filter((i) => i.theme !== 'hq')
    .map((i) => Math.atan2(i.cz - mz, i.cx - mx) / DEG)
    .sort((a, b) => a - b);
  let hqBearing = LOOK.hq.bearingDeg;
  let widest = -1;
  others.forEach((b, k) => {
    const next = k + 1 < others.length ? others[k + 1] : others[0] + 360;
    if (next - b > widest) {
      widest = next - b;
      hqBearing = ((b + (next - b) / 2 + 540) % 360) - 180;
    }
  });
  const out: ConstellationPlacement[] = [];
  const seen = new Set<ThemeId>();
  for (const isl of islands) {
    if (seen.has(isl.theme)) continue;
    seen.add(isl.theme);
    let bearing: number;
    let el: number;
    if (isl.theme === 'hq') {
      bearing = hqBearing;
      el = LOOK.hq.elevationDeg;
    } else {
      const dx = isl.cx - mx;
      const dz = isl.cz - mz;
      bearing = Math.atan2(dz, dx) / DEG;
      const dist = Math.max(Math.hypot(dx, dz), 1);
      el = Math.atan(LOOK.skyHeight / dist) / DEG;
      el = Math.min(LOOK.elevationDeg[1], Math.max(LOOK.elevationDeg[0], el));
    }
    const dir = new THREE.Vector3();
    const clear = glyphRadius(isl.theme) * LOOK.scaleDeg + LOOK.moonClearDeg;
    for (;;) {
      dirOf(bearing, el, dir);
      let near = 180;
      for (const h of MOON_HOURS) {
        moonDir(h, _m);
        const c = dir.x * _m.x + dir.y * _m.y + dir.z * _m.z;
        near = Math.min(near, Math.acos(Math.min(1, Math.max(-1, c))) / DEG);
      }
      if (near >= clear || el <= LOOK.elevationDeg[0]) break;
      el = Math.max(LOOK.elevationDeg[0], el - 1);
    }
    out.push({ theme: isl.theme, dir, bearingDeg: bearing, elevationDeg: el });
  }
  return out;
}

/**
 * RGBA float rows, one per theme (THEME_IDS order): texels 0..stars−1 = (x, y, brightness, 0),
 * then lines = (x0, y0, x1, y1), in glyph units. Empty slots sit at FAR with brightness 0.
 */
export function constellationTexels(): Float32Array {
  const data = new Float32Array(CONST_ROW * THEME_IDS.length * 4).fill(FAR);
  THEME_IDS.forEach((theme, row) => {
    const g = CONSTELLATIONS[theme];
    const base = row * CONST_ROW * 4;
    for (let j = 0; j < MAX.stars; j++) {
      const o = base + j * 4;
      const s = g.stars[j];
      data[o + 2] = s ? s[2] : 0;
      data[o + 3] = 0;
      if (s) {
        data[o] = s[0];
        data[o + 1] = s[1];
      }
    }
    for (let j = 0; j < g.lines.length; j++) {
      const o = base + (MAX.stars + j) * 4;
      const a = g.stars[g.lines[j][0]];
      const b = g.stars[g.lines[j][1]];
      data[o] = a[0];
      data[o + 1] = a[1];
      data[o + 2] = b[0];
      data[o + 3] = b[1];
    }
  });
  return data;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Hour window 0..1: fades in over `hours.in`, full 21:00–04:00, out over `hours.out`. */
export function constellationWindow(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  return h >= 12
    ? smooth(LOOK.hours.in[0], LOOK.hours.in[1], h)
    : 1 - smooth(LOOK.hours.out[0], LOOK.hours.out[1], h);
}

/** Comet Night lift 0..1 over the Research ritual phase (eased in and out). */
export function cometLift(phase: number): number {
  if (phase < 0 || phase > 1) return 0;
  return smooth(0, 0.1, phase) * (1 - smooth(0.85, 1, phase));
}
