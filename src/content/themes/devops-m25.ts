/**
 * DevOps "Ember Smiths" M25 signature kit (TASK-504, D-084): numbers and palette of the funicular
 * (D4), the ore cableway (D13), the geyser cone (D7), the onsen stilt houses (D9) and the smiths'
 * lane stall (D14). Geometry: geo/themes/devops-m25.ts; defs: content/props-themes/devops-m25.ts.
 * Lengths in u (1 u = 1 m), local frames: ground at y = 0, a rail piece / car runs along +z.
 * Colours come only from the existing DevOps tables (DEVOPS_CULTURE_KIT).
 */
import { DEVOPS_CULTURE_KIT as K } from '../props-themes/devops.ts';

export const M25_PAL = {
  steel: K.steel,
  steelLight: K.steelLight,
  steelPale: K.steelPale,
  iron: K.iron,
  basalt: K.basalt,
  basaltLight: K.basaltLight,
  wood: K.wood,
  woodLight: K.woodLight,
  woodDark: K.woodDark,
  orange: K.orange,
  orangeDeep: K.orangeDeep,
  teal: K.teal,
  cream: K.cream,
  paper: K.paper,
  red: K.red,
  hazard: K.hazard,
  copper: K.copper,
  brass: K.brass,
  lava: K.lava,
  glow: K.glow,
  window: K.window,
  coral: K.coral,
} as const;

export const DEVOPS_M25 = {
  /** D4 funicular rail piece: `piece` u of horizontal run per instance, pitched variants. */
  rail: {
    piece: 3,
    /** rise / run per variant: 0 level, then about 17 and 31 degrees (a fall is the climb turned round). */
    pitches: [0, 0.3, 0.6] as const,
    /** Rail-top height over the pylon-foot line at z = 0, and the rail x offset (gauge / 2). */
    clearance: 0.55,
    railX: 0.42,
    /** Pylon positions along the piece (z), sleeper spacing. */
    pylonZ: [0.35, 2.65] as const,
    sleeper: 0.5,
  },
  /** D4 funicular car: two stepped compartments, each counter-tilted so its floor is level at `pitchRef`. */
  car: {
    length: 4.7,
    width: 1.5,
    railX: 0.42,
    /** Slope (rise / run) at which the cabins stand upright; the mover pitches the whole car. */
    pitchRef: 0.45,
    cabin: { w: 1.4, h: 1.45, d: 1.95, z: 1.15 },
    livery: [
      { body: M25_PAL.red, roof: M25_PAL.orangeDeep, stripe: M25_PAL.iron },
      { body: M25_PAL.teal, roof: M25_PAL.orange, stripe: M25_PAL.iron },
    ] as const,
  },
  /** D13 ore cableway: mailLine variants 2 (mid-line pylon) and 3 (furnace station) + the bucket def. */
  ore: {
    /** Pylon variants (mailLine) and their heights; anchors are the cable seat on the cross arm. */
    pylonVariants: [2, 3] as const,
    height: [6.4, 5.2] as const,
    /** Cable anchor per variant (local, +z toward the other pylon); variant 2 also has `back`. */
    anchor: [
      [0, 6.62, 0.85],
      [0, 5.42, 0.8],
    ] as const,
    back: [0, 6.62, -0.85] as const,
    /** Bucket: pivot on the ground, the carrier wheel (cable grip) at `grip`. */
    bucket: { r0: 0.34, r1: 0.43, h: 0.72, grip: 1.5, loadedCount: 5 },
  },
  /** D7 sinter mound with the vent on top; the 6 u water column is the life task's. */
  geyser: {
    radius: 1.42,
    height: 2.1,
    ventR: 0.3,
    /** Terrace rings: [radius, y] from the apron to the rim. */
    profile: [
      [1.42, 0],
      [1.36, 0.14],
      [1.18, 0.2],
      [1.1, 0.46],
      [0.94, 0.52],
      [0.86, 0.9],
      [0.7, 0.96],
      [0.62, 1.4],
      [0.46, 1.5],
      [0.4, 1.9],
      [0.34, 2.1],
    ] as const,
    column: 6,
    sinter: [M25_PAL.cream, M25_PAL.woodLight, M25_PAL.copper, M25_PAL.teal] as const,
  },
  /** D9 onsen houses: variant 1 = on stilts over the pool, variant 2 = stilts + towel lines. */
  onsen: {
    variants: [1, 2] as const,
    stilt: 1.15,
    deck: { w: 5.2, d: 3.4, x: 0.3 },
    towels: {
      poleH: 1.7,
      span: 3.2,
      colors: [M25_PAL.orange, M25_PAL.cream, M25_PAL.coral] as const,
    },
  },
  /** D14 smiths' lane: goodsStall variant 7 = a smith's stall (hanging tools, anvil block, gear sign). */
  smith: { variant: 7, anvil: { w: 0.5, h: 0.42, d: 0.26 }, gearR: 0.5 },
  /** D5 summit watch beam head: lens ring + cap around the existing beacon lamp. */
  beamHead: { ringR: 0.38, capH: 0.3 },
  /** D4 station = rackShed variant 2: track stub leaving the front, cable wheel above the roof. */
  station: { variant: 2, wheelR: 0.55, wheelY: 3.2, trackY: 0.45, trackZ: 1.3, stub: 0.7 },
} as const;

/** Nominal height of rail variant `v` (rail top at the high end + rail + the lamp stub). */
export function railHeight(v: number): number {
  const R = DEVOPS_M25.rail;
  return R.clearance + R.pitches[v] * R.piece + 0.16;
}
