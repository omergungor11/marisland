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

const { grounded } = PropFlag;

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

/** Turbine nominal heights per variant (tip-top at rest, u). */
export const TURBINE_HEIGHTS = [15, 12, 10] as const;

export const CODING_PROP_DEFS: readonly PropDef[] = [
  // T0 signature: white tapered tower, slim blades with blue tips; blades turn via aSpin
  { id: 'windTurbine', geo: 'windTurbine', tier: 0, variants: 3, footprint: 1.3, flags: grounded },
  { id: 'solarRow', geo: 'solarRow', tier: 1, variants: 2, footprint: 2.3, flags: grounded },
  { id: 'hedge', geo: 'hedge', tier: 2, variants: 2, footprint: 1.1, flags: grounded },
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
