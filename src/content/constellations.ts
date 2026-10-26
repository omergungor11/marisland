import type { ThemeId } from '../world/types.ts';

/**
 * Culture constellations (TASK-491, `W:G4`, D-064): each department's glyph drawn in the night sky
 * as 6–9 bright stars plus thin connecting lines, in the sky direction above its island.
 *
 * Glyph points are in glyph units (x right, y up toward the zenith, roughly ±5); `scaleDeg`
 * turns one unit into degrees on the sky. `b` = relative star brightness (1 = the glyph's lead
 * stars). `lines` join star indices. At most `CONSTELLATION_MAX.stars` stars and
 * `CONSTELLATION_MAX.lines` lines per glyph (the sky's data texture has that many slots).
 */
export interface ConstellationGlyph {
  name: string;
  stars: readonly (readonly [x: number, y: number, b: number])[];
  lines: readonly (readonly [a: number, b: number])[];
}

export const CONSTELLATION_MAX = { stars: 9, lines: 9 } as const;

export const CONSTELLATIONS: Readonly<Record<ThemeId, ConstellationGlyph>> = {
  // HQ bell: crown knob, shoulders, waist, flared lip, the clapper hanging below
  hq: {
    name: 'The Bell',
    stars: [
      [0, 4.2, 0.8],
      [-1.3, 3, 0.9],
      [1.3, 3, 0.75],
      [-1.7, 0.4, 0.7],
      [1.7, 0.4, 0.85],
      [-3.1, -1.9, 1],
      [3.1, -1.9, 0.95],
      [0, -3.3, 0.9],
    ],
    lines: [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 4],
      [3, 5],
      [4, 6],
      [5, 6],
    ],
  },
  // Coding `</>`
  coding: {
    name: 'The Brackets',
    stars: [
      [-3.2, 2.6, 0.85],
      [-5, 0, 1],
      [-3.2, -2.6, 0.8],
      [0.9, 3.2, 0.9],
      [-0.9, -3.2, 0.75],
      [3.2, 2.6, 0.8],
      [5, 0, 1],
      [3.2, -2.6, 0.85],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [3, 4],
      [5, 6],
      [6, 7],
    ],
  },
  // DevOps hammer: head block, the haft dropping from under its middle
  devops: {
    name: 'The Hammer',
    stars: [
      [-3.4, 3.4, 1],
      [2.2, 3.4, 0.85],
      [2.2, 1.6, 0.7],
      [-0.6, 1.6, 0.75],
      [-3.4, 1.8, 0.8],
      [-0.6, -1, 0.7],
      [-0.6, -3.8, 0.95],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 0],
      [3, 5],
      [5, 6],
    ],
  },
  // Marketing megaphone: mouthpiece left, bell opening right, grip below, one "shout" star
  marketing: {
    name: 'The Megaphone',
    stars: [
      [-3.8, 0.8, 0.8],
      [-3.8, -0.8, 0.75],
      [2.6, 3.2, 1],
      [2.6, -3.2, 0.9],
      [-1.4, -0.4, 0.6],
      [-1.4, -2.6, 0.75],
      [5, 0.3, 0.85],
    ],
    lines: [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
      [4, 5],
    ],
  },
  // QA tick: short down-stroke, long up-stroke
  qa: {
    name: 'The Tick',
    stars: [
      [-3.6, 0.6, 0.85],
      [-2.3, -1.1, 0.7],
      [-1.1, -2.8, 1],
      [0.6, -0.5, 0.7],
      [2.2, 1.7, 0.8],
      [3.8, 4, 0.95],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ],
  },
  // Design prism: triangle, a beam entering on the left, two rays fanning out on the right
  design: {
    name: 'The Prism',
    stars: [
      [0, 3.4, 1],
      [-3.2, -2.4, 0.85],
      [3.2, -2.4, 0.85],
      [-6, 0.6, 0.7],
      [-1.6, 0.5, 0.55],
      [1.7, 0.2, 0.55],
      [5.8, 1.8, 0.8],
      [6, -1.4, 0.75],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 0],
      [3, 4],
      [5, 6],
      [5, 7],
    ],
  },
  // Research telescope: tube on a tripod, aimed at a lone star
  research: {
    name: 'The Telescope',
    stars: [
      [-3.6, -0.6, 0.8],
      [-0.4, 1, 0.85],
      [3.4, 2.9, 1],
      [-2.6, -3.8, 0.75],
      [0.2, -3.8, 0.7],
      [2.2, -3.4, 0.7],
      [5.4, 4.6, 0.9],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [1, 3],
      [1, 4],
      [1, 5],
    ],
  },
};

/**
 * Placement and look. Each glyph sits on the bearing from the archipelago centre to its island, at
 * the elevation the island's "sky above it" has for an observer at the centre:
 * atan(`skyHeight` / distance), clamped to `elevationDeg` — far islands sit lower. HQ is the centre,
 * so it rides at `hq.elevationDeg` in the widest gap between the other glyphs' bearings
 * (`hq.bearingDeg` — deg, 0 = +x, 90 = +z — if HQ is alone). The moon runs on the −z side at
 * 26–45°; any glyph steps down until it clears it by `moonClearDeg`.
 *
 * Visibility: × the star alpha (night ramp, veil) × an hour window: fades in over `hours.in`, out over
 * `hours.out` (game hours; full 21:00–04:00). Lines are a plain alpha mix of `lineColor` (≤ 0.15, D-064
 * "not kitsch"); on Comet Night (Research 22:00 relay step) they rise to `lineAlphaComet`.
 */
export const CONSTELLATION_LOOK = {
  skyHeight: 50,
  elevationDeg: [11, 26] as const,
  hq: { bearingDeg: 90, elevationDeg: 28 },
  /** Gap kept between a glyph's disc and the moon centre at every night hour (deg). */
  moonClearDeg: 6,
  /** Degrees on the sky per glyph unit. */
  scaleDeg: 0.95,
  hours: { in: [19.75, 21] as const, out: [4, 5] as const },
  /** Star radius (deg; never below `minPx` screen pixels) and HDR intensity per quality. */
  starDeg: 0.16,
  starMinPx: 1.8,
  starIntensity: { low: 2.6, medium: 2.6, high: 2.6 },
  /** Soft halo around each glyph star (× the core), and how much the hashed stars dim inside a glyph's disc. */
  starHalo: 0.18,
  backgroundDim: 0.6,
  starColor: '#F4F2FF',
  /** Line half width in screen pixels, gap left around each star (deg). */
  linePx: 0.8,
  lineGapDeg: 0.45,
  lineAlpha: 0.1,
  lineAlphaComet: 0.15,
  lineColor: '#C9D6FF',
} as const;
