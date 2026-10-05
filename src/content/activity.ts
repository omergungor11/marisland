/**
 * Living close-up II (M14c TASK-384): animated surfaces and drone couriers. Data only — the lit
 * program (render/materials/factory.ts) bakes these numbers into its GLSL, the theme geometry
 * (geo/themes, geo/interiors) writes the tags, render/drones.ts flies the couriers.
 *
 * Tag channel (no new attribute, D-016 / 16-attribute cap): `aSpin.w` of the lit program.
 *   0          static (default)
 *   1          spin about the hub `aSpin.xyz` (windmill blades, anemometer — unchanged)
 *   2          yaw head: rotates about the object y axis into the wind (turbine nacelle)
 *   3          yaw head + spin (turbine rotor: spin about the hub first, then yaw)
 *   4          sun tracker: rotate about the x axis through the pivot `aSpin.xyz` (solar panels)
 *   −k (k ≥ 1) animated surface of kind `k` (SURFACE): screens / LED strips carry
 *              (u, v, aspect, −k) with uv ∈ [0, 1] over the patch (u right, v up seen from the
 *              front); LED strips put `cols + seed` in z (integer part = dot columns, fraction =
 *              per-strip hash); pipes carry (axis xyz, −k) with the tube axis in object space.
 * Billboard art glyphs carry the board's uv with a negative aspect (`−aspect`): they show the
 * brand slide only and take the current slide's colour otherwise (seamless with the board).
 */
import { OFFICE_COLORS } from './palette-offices.ts';
import { FLOWERS, WALLS } from './palette.ts';
import { THEMES } from './themes/index.ts';
import type { ThemeId } from '../world/types.ts';

/** Surface kinds (`aSpin.w = −kind`). */
export const SURFACE = {
  code: 1,
  chart: 2,
  canvas: 3,
  checklist: 4,
  terminal: 5,
  spectrum: 6,
  led: 7,
  slides: 8,
  pulse: 9,
} as const;
export type SurfaceKind = keyof typeof SURFACE;

/** Spin-channel motion tags (`aSpin.w` > 0). */
export const MOTION_TAG = { spin: 1, yaw: 2, yawSpin: 3, tracker: 4 } as const;

/** Monitor content per department (interiors, theme props). */
export const THEME_SCREEN: Readonly<Record<ThemeId, SurfaceKind>> = {
  hq: 'chart',
  coding: 'code',
  marketing: 'chart',
  design: 'canvas',
  qa: 'checklist',
  devops: 'terminal',
  research: 'spectrum',
};

/**
 * Screen content inks (linear conversion happens in the shader builder). Dark-background kinds
 * (code, terminal, spectrum) glow with bright ink at night; light kinds keep the cool-white screen.
 * Peak ink ≤ the screen white so the day glow stays at the pre-TASK-384 level (bloom threshold).
 */
export const SCREEN_INK = {
  /** Dark screen background (code / terminal / spectrum). */
  dark: '#26304A',
  /** Light screen background (chart / checklist): the existing screen colour. */
  light: OFFICE_COLORS.screen,
  /** Canvas paper. */
  paper: WALLS[0],
  /** Syntax colours (code). */
  code: ['#7CC4FF', '#FFC870', '#7CFFB0', '#FF8FB1'] as const,
  /** Terminal text + meter bars. */
  terminal: ['#7CFFB0', THEMES.devops.accent] as const,
  /** Chart bars + trend line. */
  chart: [THEMES.hq.accent, '#5DA9E9'] as const,
  /** Checklist: done tick, open box, failing item, text bar. */
  checklist: [THEMES.qa.accent, '#A9AEB8', '#E35D6A', '#6F7685'] as const,
  /** Canvas strokes (pastels) — the flower palette. */
  canvas: FLOWERS,
  /** Spectrum fill + scan line. */
  spectrum: [THEMES.research.accent, '#FFF6C2'] as const,
} as const;

/** Screen animation rates (s, lines/s …). All motion × uMotionScale (reduced motion). */
export const SCREEN_ANIM = {
  /** Code: text rows on the screen, scroll speed (rows/s), chars per row per unit aspect. */
  code: { rows: 6, scroll: 1.4, colsPerAspect: 10 },
  terminal: { rows: 7, scroll: 2.6, colsPerAspect: 12 },
  /** Chart: bar count, bar wobble rate (rad/s), trend scroll (rad/s). */
  chart: { bars: 6, rate: 1.7, trend: 2.4 },
  /** Canvas: seconds per painting (3 strokes drawn one after another). */
  canvas: { period: 6 },
  /** Checklist: rows and seconds per full pass (one tick every period / (rows + 1)). */
  checklist: { rows: 5, period: 5 },
  /** Spectrum: peak drift rate (rad/s), scan line seconds per sweep. */
  spectrum: { drift: 1.3, sweep: 2.2 },
} as const;

/** Rack / cabinet LED strips: dot rows; each dot picks a pattern by hash. */
export const LEDS = {
  rows: 2,
  /** Fraction of dots in fast "activity" blink, then slow heartbeat; the rest steady. */
  activity: 0.55,
  heartbeat: 0.25,
  /** Activity blink: slots per second, on-probability per slot. */
  rate: 7,
  onP: 0.55,
  heartbeatPeriod: 1.6,
  /** Albedo multiplier of an off dot (on = 1). */
  off: 0.18,
} as const;

/** Billboard slideshow: seconds per slide, wipe duration, slide count (slide 0 = brand art). */
export const SLIDES = {
  period: 3.5,
  wipe: 0.35,
  count: 4,
  /** Slide inks: chart bg / bars, product bg / disc, event stripes. */
  ink: {
    paper: WALLS[0],
    bars: [THEMES.marketing.accent, '#FFC870', '#5DA9E9', THEMES.qa.accent] as const,
    productBg: '#FFE45C',
    productDisc: THEMES.marketing.accent,
    stripes: ['#FF8FB1', WALLS[1]] as const,
    text: '#4F4A5E',
  },
} as const;

/** Data pulses along pipes (u, u/s). Day: albedo tint only; night: glow (× lamps). */
export const PULSE = {
  spacing: 3.2,
  speed: 2.6,
  width: 0.55,
  color: '#7CF6FF',
  dayTint: 0.85,
  nightGlow: 1.4,
} as const;

/** Wind turbine head yaw: into the wind plus a slow hunting wobble (deg, s). */
export const TURBINE_YAW = { wobbleDeg: 5, wobblePeriod: 19 } as const;

/** Single-axis solar trackers: max tilt (rad) and the stow angle when the sun is down. */
export const TRACKER = { maxTilt: 0.95, stow: 0.1 } as const;

/**
 * Lit-window occupancy at night: every facade (building × wall quadrant) of a lot whose lights
 * can go dark late (`lamps.lateOff`) re-rolls each `period` s; with `dark` probability it is
 * dimmed to `dim` over `fade` s. Faces nearer than `minDepth` u to the prop's vertical axis
 * (lamps, beacons) are left alone.
 */
export const OCCUPANCY = { period: 11, dark: 0.22, dim: 0.15, fade: 0.9, minDepth: 1.2 } as const;

/** Drone couriers between docks / HQ (render/drones.ts). Count per quality tier. */
export const DRONES = {
  count: { low: 0, medium: 6, high: 10 },
  /** Cruise altitude above sea level (u) and the hover height over a pad. */
  cruiseY: 22,
  padY: 3,
  speed: 9,
  /** Seconds hovering at each end (climb / descent included in the flight). */
  dwell: 2.5,
  climb: 4,
  /** Dither fade by camera distance (u): visible at T2 / T3 only. */
  fadeNear: 110,
  fadeFar: 150,
  /** Body + packet colours (packet glows: screen class). */
  body: WALLS[1],
  rotor: '#4F4A5E',
  packet: '#7CF6FF',
  /** Bob amplitude (u) and period (s); bank angle per u/s of speed (rad). */
  bob: 0.12,
  bobPeriod: 1.3,
  bank: 0.03,
  /** Uniform scale of the drone model (model is ≈ 1 u wide). */
  scale: 0.9,
} as const;
