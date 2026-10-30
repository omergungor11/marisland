/**
 * Coding M33 kit numbers + palette (TASK-543, D-117; D-116 directions B + C): the Bot Foundry
 * (conveyor line, assembly arm / gantry, part crates, bot stages), the Drone Port (H pad, charging
 * masts, hangar), the robot test track and the Data Lake kit (steam-cooled server pod, tethered
 * cloud balloon, glass quantum pavilion). Geometry: geo/themes/coding-m33.ts; defs:
 * content/props-themes/coding-m33.ts. Lengths in u (1 u = 1 m), pivot on the ground. Colours are
 * the existing Coding tables (CODING_COLORS, THEMES.coding, the worker + drone palettes) plus a
 * few theme-local tints (navy lake blues, gold, cloud lavender).
 */
import { CODING_COLORS as C } from '../props-themes/coding.ts';
import { DRONES } from '../activity.ts';
import { LAND } from '../life.ts';
import { WORKER_COLORS as W } from '../life.ts';
import { EMISSIVE, FLOWERS } from '../palette.ts';

export const CODING_M33_PAL = {
  white: C.white,
  cream: '#F3EFE4',
  accent: C.accent,
  accentDeep: C.accentDeep,
  steel: C.steel,
  steelDark: '#5F6675',
  dark: C.dark,
  concrete: C.kerb,
  concreteTop: C.kerbTop,
  asphalt: '#59607A',
  belt: '#3A3F4D',
  yellow: FLOWERS[1],
  orange: '#FF8A4A',
  teal: '#3FB8AF',
  wood: '#D2A679',
  woodDark: '#A9814F',
  red: C.lamp,
  /** Warm lamp (emissive 1, the island lamp set). */
  lamp: EMISSIVE.lantern,
  /** Cool server light (emissive 1). */
  led: '#7FD4FF',
  ledDeep: '#3D86E0',
  steam: '#F4F8FF',
  /** Data Lake: hull navy, pipe, gold, glass, cloud. */
  navy: '#2C3E72',
  navyDeep: '#22305A',
  glass: '#D2F1FB',
  glassFrame: '#E9F1F8',
  gold: '#F5C84C',
  goldDeep: '#D9A93B',
  cloud: '#FFFFFF',
  cloudShade: '#E2E4F8',
  cloudLow: '#BDBFEE',
  /** The world bot (life/geo/workers.ts): body tint here = Coding accent. */
  bot: {
    tint: C.accent,
    metal: W.metal,
    foot: W.foot,
    hand: W.hand,
    shell: W.shell,
    screen: W.screen,
    plate: W.plate,
    light: W.light,
    eye: W.eye,
    blush: W.blush,
    antenna: W.antenna,
  },
  drone: DRONES,
} as const;

/** The world bot is built ~1.0 u and drawn at `LAND.size.workers` (1.7): the line's stages match it. */
export const BOT_SCALE = LAND.size.workers;

export const CODING_M33 = {
  /**
   * Conveyor segment, runs along local +x centred on the origin, belt 1.04 wide at `beltY`. Variant 1
   * adds a chute at the +x end that slopes down to the ground (`ramp` long).
   */
  conveyor: {
    length: 4,
    width: 1.5,
    beltW: 1.08,
    beltY: 0.62,
    rail: 0.11,
    legs: 3,
    ramp: 1.7,
    footprint: 2.2,
    heights: [0.69, 0.8] as readonly number[],
  },
  /**
   * Assembly arm (v0 complete, v2 base only, v3 swing group only) and gantry (v1 complete, v4 frame,
   * v5 pendulum). Arm: the swing group yaws about the vertical axis through the origin; rest pose
   * points the forearm along +x; the gripper hangs over (`reach`, 0). Gantry: portal across z (the
   * belt runs under it along x), the pendulum hangs from the pivot under the beam and swings about
   * the beam axis (local x).
   */
  arm: {
    shoulderY: 0.86,
    reach: 1.35,
    forearmY: 1.78,
    gripY: 1.05,
    footprint: 1.0,
  },
  gantry: {
    span: 2.8,
    depth: 0.9,
    beamY: 2.5,
    pivotY: 2.38,
    pendulum: 1.3,
    footprint: 1.6,
  },
  crate: { w: 1.0, h: 0.62, d: 0.74 },
  /** Bot stages (v3 bare body, v4 + head, v5 complete); forward = +x like the world bot. */
  bot: { footprint: 0.7 },
  footprintPart: 0.75,
  pad: {
    radius: 1.7,
    top: 0.12,
    ringR: 1.34,
    lights: 12,
    lightR: 1.52,
    /** Height the drone body centre rests at on the pad (its legs-less belly + packet clear). */
    restY: 0.62,
    footprint: 1.9,
  },
  mast: { footprint: 0.5 },
  hangar: { w: 3.4, d: 2.5, wallH: 1.45, roofH: 1.05, footprint: 2.0 },
  track: { footprint: 1.3 },
  pod: { w: 2.0, d: 1.5, h: 1.9, footprint: 1.4 },
  cloud: {
    tetherH: 6.2,
    bodyY: 7.2,
    bodyR: 1.45,
    anchor: 0.9,
    footprint: 0.7,
  },
  pavilion: {
    sides: 8,
    radius: 1.9,
    plinth: 0.22,
    postH: 2.2,
    apex: 3.0,
    footprint: 2.4,
  },
} as const;
