/**
 * Research "Summit Observatory" M28 signature kit (TASK-525, D-106; study marketing-research.md
 * §2.3 R2 / R3 / R4): numbers and palette of the meridian sundial (new def `sundial`), the rim
 * telescope deck (`tripodTelescope` variant 2) and the teal Star Stair lantern (`lanternPost`
 * variant 3). Geometry: geo/themes/research-m28.ts; defs: content/props-themes/research-m28.ts.
 * Lengths in u (1 u = 1 m), pivot on the ground. Colours come from the existing Research tables
 * (CAMPUS_PALETTE / RESEARCH_CULTURE_KIT); nothing new is invented.
 */
import { RESEARCH_CULTURE_KIT as K } from '../props-themes/research.ts';
import { CAMPUS_PALETTE as CP } from './research.ts';

export const RESEARCH_M28_PAL = {
  stoneDark: K.stoneDark,
  stone: K.stone,
  cream: K.cream,
  white: CP.trim,
  brass: K.brass,
  gold: CP.gold,
  ink: K.lens,
  copper: K.copper,
  teal: K.teal,
  tealDeep: K.tealDeep,
  roofTeal: K.roofTeal,
  wood: K.wood,
  woodDark: K.woodDark,
  steel: K.steel,
  /** Lamp glow (emissive 1: the Research lamp set). */
  lamp: K.lampWarm,
} as const;

export const RESEARCH_M28 = {
  /**
   * Meridian sundial. Local frame: the gnomon blade lies in the plane x = 0 along +z, its high end
   * (`northZ`) at +z; XII and the brass noon line are on +z too. Hour plates run clockwise seen
   * from above with XII at +z and III at -x (the shadow of a northern-hemisphere dial turns the
   * same way), every numeral 30 deg apart (a stylised clock face, only the noon line is exact).
   */
  sundial: {
    /** Stepped dial: [radius, top y, colour key] bottom to top. */
    steps: [
      [3.0, 0.16, 'stoneDark'],
      [2.86, 0.3, 'stone'],
      [2.74, 0.325, 'brass'],
      [2.66, 0.34, 'cream'],
      [1.86, 0.352, 'brass'],
      [1.78, 0.36, 'stone'],
    ] as const,
    /** Plate field top (the outer cream ring) and the inner field top (where the gnomon stands). */
    ringTop: 0.34,
    fieldTop: 0.36,
    plate: { radius: 2.28, tangent: 0.78, radial: 0.62, thick: 0.05 },
    glyph: { height: 0.34, stroke: 0.06, thick: 0.02, narrow: 0.07, wide: 0.2, gap: 0.05 },
    noon: { width: 0.16, top: 0.385, southZ: -1.6, inner: 1.97 },
    gnomon: {
      /** Height of the blade tip above the dial field (the brief's 2.5 u). */
      height: 2.5,
      northZ: 0.45,
      southZ: -1.6,
      thick: 0.12,
      block: { w: 0.34, h: 0.2 },
      edge: 0.05,
    },
    footprint: 3.0,
    heightNominal: 2.95,
  },
  /**
   * Rim telescope deck: 3 (x) x 2 (z) wooden platform on stone footings. Front (+z) is the step,
   * the sea side is -z (rails on -z and both sides). The scope stands at (`scope.x`, `scope.z`)
   * aimed to -z at `scope.elev` rad; the bot stands behind the eyepiece.
   */
  deck: {
    variant: 2,
    w: 3,
    d: 2,
    top: 0.42,
    boards: 6,
    rail: 0.78,
    post: 0.05,
    scope: { x: 0.2, z: -0.35, elev: 0.55 },
    bot: { x: 0.2, z: 0.5 },
    step: { w: 1.0, depth: 0.38 },
    pennant: { len: 0.75, w: 0.4 },
    footprint: 1.5,
    heightNominal: 2.0,
  },
  /** Star Stair lantern (lanternPost variant 3): one lamp slot, 1.6 to 2 u. */
  lantern: {
    variant: 3,
    lampY: 1.34,
    lampR: 0.17,
    cage: 0.12,
    heightNominal: 1.96,
  },
} as const;
