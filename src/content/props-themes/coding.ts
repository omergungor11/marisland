/**
 * coding theme structures (M14b, TASK-376): PropDefs appended to PROP_DEFS after PROP_DEFS_BUILDINGS
 * (content/props.ts, fixed theme order). Geometry: geo/themes/coding.ts.
 *
 * Colours here are data: the accent family comes from THEMES.coding / OFFICE_PAL.coding, the rest
 * are theme-local tints (tidy lawn greens, light concrete, solar glass) used by geometry + LOD1 alike.
 */
import { PropFlag } from '../../world/prop-store.ts';
import { OFFICE_PAL } from '../palette-offices.ts';
import { THEMES } from '../themes/index.ts';
import type { PropDef } from '../props.ts';

const { grounded, windy, noShadow } = PropFlag;

export const CODING_COLORS = {
  /** Turbine / panel frame white (OFFICE_PAL.coding wall family). */
  white: OFFICE_PAL.coding[1].wall,
  /** Turbine blade tips, nacelle stripe: THEMES.coding.accent. */
  accent: THEMES.coding.accent,
  accentDeep: OFFICE_PAL.coding[0].roof,
  /** Tower shading band near the foot. */
  towerFoot: '#DDE5EF',
  nacelle: '#EEF3FA',
  dark: '#4F4A5E',
  steel: '#8A909C',
  lamp: '#FF5A4A',
  /** Solar glass + cell lines (palette-offices solar family). */
  solar: '#335A9C',
  solarLine: '#6FA0E0',
  /** Tidy hedge (clipped box) tones. */
  hedge: '#4E9C4B',
  hedgeTop: '#69B857',
  /** Light concrete kerb of the reflecting pool. */
  kerb: '#D6D3CB',
  kerbTop: '#E7E4DC',
  /** Bike rack steel + the one parked bike's frame. */
  rack: '#8A909C',
  bikeFrame: '#E35D6A',
  tyre: '#3A3F4D',
} as const;

/** TASK-393: hero landmark height gain over the original 15 / 12 / 10 u turbines. */
export const TURBINE_RISE = 1.6;
/** Turbine nominal heights per variant (tip-top at rest, u). */
export const TURBINE_HEIGHTS = [24, 19, 16] as const;

export const CODING_PROP_DEFS: readonly PropDef[] = [
  // T0 signature: white tapered tower, slim blades with blue tips; blades turn via aSpin
  // v3 windChimeTower and hedge v2 bracketHedge are Wind Gardens pieces (TASK-421): never rolled
  {
    id: 'windTurbine',
    geo: 'windTurbine',
    tier: 0,
    variants: 4,
    rollVariants: 3,
    footprint: 1.3,
    flags: grounded,
  },
  // T0 (TASK-463): a solar field is a district-sized blue block; at tier 1 its gravel pads read grey
  // from T0 and the rows popped in at 380 u (L-pairs-marketing 380 blob)
  { id: 'solarRow', geo: 'solarRow', tier: 0, variants: 2, footprint: 2.3, flags: grounded },
  // tier 1 since M22 (TASK-479 C9): the `{ < / > }` glyph letters of hedge pieces read from 240 u
  {
    id: 'hedge',
    geo: 'hedge',
    tier: 1,
    variants: 3,
    rollVariants: 2,
    footprint: 1.1,
    flags: grounded,
  },
  { id: 'bikeRack', geo: 'bikeRack', tier: 3, variants: 2, footprint: 0.8, flags: grounded },
  {
    id: 'reflectingPoolEdge',
    geo: 'reflectingPoolEdge',
    tier: 2,
    variants: 2,
    footprint: 1.1,
    flags: grounded,
  },
];

/**
 * M19 TASK-411 "Wind Gardens" kit (geo/themes/culture-coding.ts; ledger: content/cultures/coding.ts).
 * Registered at the END of PROP_DEFS (content/props.ts, after the signage kit) so no existing def
 * index moves. windTurbine v3 = windChimeTower and hedge v2 = bracketHedge are variants above.
 */
export const CODING_CULTURE_PROP_DEFS: readonly PropDef[] = [
  {
    id: 'rubberDuck',
    geo: 'rubberDuck',
    tier: 3,
    variants: 3,
    footprint: 0.3,
    flags: grounded | noShadow,
  },
  // v3 = the M22 pinwheel (TASK-479, C4): a garden stake with a spinning paper pinwheel, never a kite
  { id: 'kite', geo: 'kite', tier: 2, variants: 4, footprint: 1.2, flags: grounded | windy },
  {
    id: 'pergolaDesk',
    geo: 'pergolaDesk',
    tier: 2,
    variants: 2,
    footprint: 1.9,
    flags: grounded | windy,
  },
  { id: 'hammock', geo: 'hammock', tier: 2, variants: 2, footprint: 1.9, flags: grounded | windy },
  {
    id: 'kiteRack',
    geo: 'kiteRack',
    tier: 2,
    variants: 2,
    footprint: 1.9,
    flags: grounded | windy,
  },
  { id: 'giantDuck', geo: 'giantDuck', tier: 1, variants: 1, footprint: 1.6, flags: grounded },
  {
    id: 'whiteboardA',
    geo: 'whiteboardA',
    tier: 3,
    variants: 3,
    footprint: 0.9,
    flags: grounded | noShadow,
  },
  {
    id: 'mugStack',
    geo: 'mugStack',
    tier: 3,
    variants: 2,
    footprint: 0.45,
    flags: grounded | noShadow,
  },
];

/**
 * M22 TASK-479 Coding quick wins, ledger entries 9-10 (content/cultures/coding.ts). Registered at the
 * very END of PROP_DEFS (content/props.ts) so no existing defId shifts. Variants of existing defs
 * (kite v3 pinwheel, devPod v2 / v3 weather vane, hedge glyph pieces) are not ledger entries.
 */
export const CODING_M22_PROP_DEFS: readonly PropDef[] = [
  // C11 windsock avenue: variant = band colours (blue / coral on cream); the plan points +x downwind
  {
    id: 'windsock',
    geo: 'windsock',
    tier: 2,
    variants: 2,
    footprint: 0.5,
    flags: grounded | windy,
  },
  // C13 fairy-light grove: the bulbs of a roundTree (variant k dresses the k-th tree); no blob, no shadow
  {
    id: 'fairyWreath',
    geo: 'fairyWreath',
    tier: 2,
    variants: 3,
    footprint: 1.2,
    flags: windy | noShadow,
  },
];

/** The M22 Coding showcase (`?gallery=1&ids=coding22`, scripts/gallery-shots.ts): new defs + the variants / tips. */
export const CODING_M22_SHOWCASE_IDS: readonly string[] = [
  'windsock',
  'fairyWreath',
  'kite',
  'devPod',
  'windTurbine',
  'roundTree',
];
