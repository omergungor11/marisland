/**
 * research theme structures (M14b): PropDefs appended to PROP_DEFS after PROP_DEFS_BUILDINGS
 * (content/props.ts, fixed theme order). Geometry: geo/themes/research.ts.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded } = PropFlag;

export const RESEARCH_PROP_DEFS: readonly PropDef[] = [
  // anemometer rotor spins via aSpin (wind = 0 on all vertices, so not `windy`)
  { id: 'weatherMast', geo: 'weatherMast', tier: 1, variants: 2, footprint: 0.8, flags: grounded },
  // T0 structure (white dome + teal slit reads from far)
  { id: 'observatory', geo: 'observatory', tier: 0, variants: 2, footprint: 1.9, flags: grounded },
  // floats: pivot = water level, no contact blob (like buoy)
  { id: 'instrumentBuoy', geo: 'instrumentBuoy', tier: 2, variants: 2, footprint: 0.4, flags: 0 },
];
