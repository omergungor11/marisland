/**
 * HUD / intro timing and UI data (ART_BIBLE §8–§9, ARCHITECTURE §6). Pure data: the engine
 * reads these, it never hard-codes them.
 */
import type { WeatherName } from '../core/params.ts';

export interface IntroKey {
  t: number;
  /** Orbit distance (u); `null` = the overview preset's distance. */
  dist: number | null;
  /** Pitch (deg from horizontal); `null` = the overview preset's pitch. */
  pitch: number | null;
  /** Azimuth relative to the overview azimuth (deg). */
  azOffset: number;
  /** Target: fraction of the way from the archipelago centre to the hero island. */
  hero: number;
  /** Settle key: `null` distance minus `settleOvershoot` (the 2 % push before landing). */
  settle?: boolean;
}

/** Opening sequence (ART_BIBLE §8). Seconds; distances u; angles degrees. */
export const INTRO = {
  duration: 10,
  /** Clouds part at this time (shot 1 → 2). */
  curtainAt: 1.5,
  /** Cloud part duration (s), radial ease-out. */
  curtainSeconds: 1.2,
  /** Island labels pop in, staggered. */
  labelsAt: 5.5,
  labelStaggerMs: 120,
  /** HUD buttons pop in during the settle. */
  hudAt: 8.5,
  /** Any input: ease to the final pose. */
  skipSeconds: 0.4,
  /** The settle undershoots the overview distance by this fraction (2 % overshoot). */
  settleOvershoot: 0.02,
  keys: [
    // 0–1.5 s: inside the cloud curtain, slow descent (hidden), so the reveal starts at 900 u.
    { t: 0, dist: 980, pitch: 80, azOffset: -44, hero: 0 },
    { t: 1.5, dist: 930, pitch: 80, azOffset: -42, hero: 0 },
    { t: 3.0, dist: 900, pitch: 80, azOffset: -40, hero: 0 },
    { t: 6.5, dist: 420, pitch: 58, azOffset: 0, hero: 0 },
    { t: 8.5, dist: 300, pitch: 55, azOffset: 6, hero: 0.6 },
    { t: 9.7, dist: null, pitch: null, azOffset: 0, hero: 0, settle: true },
    { t: 10, dist: null, pitch: null, azOffset: 0, hero: 0 },
  ] as readonly IntroKey[],
} as const;

/** Loading-screen captions, rotated in order (ART_BIBLE §8; Phase 3 adds the agent-org lines). */
export const LOADER_CAPTIONS: readonly string[] = [
  'Raising islands…',
  'Booting agents…',
  'Planting palms…',
  'Spinning up servers…',
  'Teaching crabs to walk sideways…',
  'Filling the lagoon…',
  'Hanging the laundry…',
];

/** HUD (ART_BIBLE §9). */
export const HUD = {
  /** Time-dial click cycles these bible time stops (hours). */
  timeStops: [7, 12, 15, 17.75, 19.25, 22, 2] as readonly number[],
  /** Scroll on the dial: hours per wheel notch (deltaY 100). */
  dialWheelHours: 0.25,
  /** Weather button cycle (the shader agent renders the states). */
  weatherCycle: ['clear', 'cloudy', 'rain', 'fog'] as readonly WeatherName[],
  /**
   * Island labels sit above the island's top shelf edge (D2): the projected ring at land reach +
   * this (u), the pill's bottom `labelGapPx` above it (and never below the peak + 8 u anchor).
   */
  labelRingPad: 12,
  labelRingSamples: 12,
  labelGapPx: 4,
  /** Dock buttons pop in staggered by this (ms). */
  dockStaggerMs: 60,
  /** Photo mode: HUD fade (ms), shutter flash (ms), polaroid on screen (ms). */
  photoFadeMs: 200,
  flashMs: 120,
  polaroidMs: 2600,
  /** Hidden-HUD "show" button fades after this long without pointer movement (ms). */
  ghostButtonMs: 2000,
  /** Reduced-motion ambient amplitude scale (cute-motion skill). */
  reducedMotionScale: 0.3,
} as const;
