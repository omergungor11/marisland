/**
 * Research "Tide-Lab" M31 signature kit (TASK-533, D-114; study mar-plans/study/harbours.html and
 * marketing-research.md §2.3 R5 / R6 / R7 / R19): numbers and palette of the stilt marine lab
 * (`tideLab`, Research's one tier-1 def), the yellow submersible (`tideSub`, a mover geo with no
 * PropDef), the tide gauge (`tideGauge`) and the half-sunken ancient city (`sunkenCity`, 8 variants).
 * Geometry: geo/themes/research-m31.ts; defs: content/props-themes/research-m31.ts. Lengths in u,
 * pivot on the ground (the lab / sub / gauge: see each frame). Colours come from the existing
 * Research tables (CAMPUS_PALETTE / RESEARCH_CULTURE_KIT / BIODOME_PALETTE); the ruin tints are new.
 */
import { RESEARCH_CULTURE_KIT as K } from '../props-themes/research.ts';
import { BIODOME_PALETTE as BP, CAMPUS_PALETTE as CP } from './research.ts';

export const RESEARCH_M31_PAL = {
  white: CP.trim,
  teal: K.teal,
  tealDeep: K.tealDeep,
  roofTeal: K.roofTeal,
  wood: K.wood,
  woodDark: K.woodDark,
  woodDeep: K.woodDeep,
  steel: K.steel,
  steelDark: K.steelDark,
  brass: K.brass,
  copper: K.copper,
  stone: K.stone,
  stoneDark: K.stoneDark,
  lens: K.lens,
  /** Window / porthole glow (emissive < 1: window class). */
  window: CP.window,
  /** Tide-tank glass: pale aqua / lilac panes (BIODOME_PALETTE.paneHigh), faint glow. */
  tankGlass: ['#C9F1EE', '#B4E9E8', '#D8EEF6'] as readonly string[],
  tankFloor: '#9FE3E6',
  /** Submersible. */
  sub: BP.sub,
  subDeep: '#E5AE2E',
  subTrim: CP.trim,
  /** Lamp glow (emissive 1: the Research lamp set). */
  lamp: K.lampWarm,
  /** Tide gauge. */
  gaugeRed: '#E4604F',
  floatOrange: '#FF9A5C',
  /** Ruins: weathered sandstone, bleached top, algae / moss toward the foot. */
  sandstone: ['#D9BF93', '#CFB487', '#E0C9A2', '#C8AB7E'],
  sandstoneDark: '#B39467',
  bleach: '#EAD9B8',
  algae: ['#6BA48F', '#5C9A8C', '#79AC96'],
  moss: ['#7FB06A', '#8CBB72'],
  weed: '#3E9A6A',
  /** Dark openings in the ruins (door, arrow slit). */
  shadow: '#5A4A3A',
} as const;

export const RESEARCH_M31 = {
  /**
   * Stilt lab. Local frame: pivot = waterline (y = 0), pile feet at y = -pileDepth, the deck top at
   * `deckY`; +z is the PIER side (the door, the gangway landing). The lab cabin stands at -x, the
   * glass tide tank at +x on the same deck.
   */
  lab: {
    deck: { w: 6.4, d: 4.6, y: 1.0, thick: 0.14 },
    pileDepth: 1.0,
    pileR: 0.15,
    /** Cabin: x/z centre, size, wall height. */
    cabin: { x: -1.25, z: -0.35, w: 3.0, d: 2.4, wallH: 1.85 },
    roofRise: 0.5,
    porthole: { r: 0.2, y: 1.15, count: 2 },
    dish: { r: 0.42, mast: 0.5, at: [-2.05, -0.8] as const },
    tank: { x: 2.0, z: -0.15, w: 2.1, d: 1.7, h: 1.5, strips: 5, rim: 0.1 },
    door: { w: 0.72, h: 1.3 },
    /** Gangway landing on +z: width, depth beyond the deck edge. */
    landing: { w: 1.3, depth: 0.9 },
    footprint: 3.9,
    heightNominal: 4.16,
  },
  /**
   * Submersible. Local frame: bow +z, keel y = 0 (hull axis at hullY), pivot like every boat; hooks
   * give the waterline (local y that sits at sea level when surfaced).
   */
  sub: {
    length: 3.0,
    r: 0.5,
    hullY: 0.5,
    waterline: 0.72,
    tower: { z: 0.1, w: 0.46, h: 0.55, d: 0.78 },
    heightNominal: 1.93,
    footprint: 1.7,
  },
  /** Tide gauge: 2.5 u striped pole on a pile, a float that rides the swell. */
  gauge: {
    poleH: 2.5,
    poleR: 0.07,
    stripes: 10,
    base: { r: 0.3, h: 0.5 },
    float: { r: 0.17, restY: 1.1, travel: [-0.55, 0.55] as const, arm: 0.42 },
    footprint: 0.7,
    heightNominal: 2.75,
  },
  /**
   * Sunken city kit (one def, 8 variants, all under STRUCTURE_MIN_SIZE so the def stays tier 2).
   * Local frame: y = 0 is the foot of the piece; `waterline` is the local y the sea surface should
   * sit at when the piece is placed 'sea' (instance y = sea - waterline); a 'floor' piece rests on
   * the lagoon bed. The colour gradient (algae -> sandstone -> bleached/moss) is built around that
   * y, so the stone reads old both under the turquoise water and above it.
   */
  city: {
    variants: [
      'column',
      'columnBroken',
      'arch',
      'archBroken',
      'paving',
      'stairs',
      'towerTop',
      'statue',
    ] as const,
    /** Per variant: nominal height, footprint radius, waterline (local y), 'sea' | 'floor'. */
    spec: [
      { h: 2.76, r: 0.7, waterline: 1.0, sit: 'sea' },
      { h: 1.94, r: 1.0, waterline: 0.8, sit: 'sea' },
      { h: 2.75, r: 1.7, waterline: 1.0, sit: 'sea' },
      { h: 2.59, r: 1.6, waterline: 0.9, sit: 'sea' },
      { h: 0.2, r: 1.7, waterline: 0.2, sit: 'floor' },
      { h: 1.15, r: 1.2, waterline: 0.6, sit: 'floor' },
      { h: 2.47, r: 1.5, waterline: 1.1, sit: 'sea' },
      { h: 0.63, r: 1.4, waterline: 0.3, sit: 'floor' },
    ] as const,
    /** The weathering ramp: algae below waterline - fade, bare sandstone, bleached tops. */
    fade: 0.55,
    footprint: 1.7,
  },
} as const;
