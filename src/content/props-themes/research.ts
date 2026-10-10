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
  // TASK-400 Biodome Lab: the hero dome is the island's T0 landmark; the small domes read from
  // T0 too (D-031, ≥ 3 u wide); vent pinwheels spin via aSpin
  { id: 'biodomeHero', geo: 'biodomeHero', tier: 0, variants: 1, footprint: 3.2, flags: grounded },
  { id: 'biodome', geo: 'biodome', tier: 0, variants: 1, footprint: 1.8, flags: grounded },
  // rim outcrops (theme scatter), faintly glowing at night
  {
    id: 'crystalCluster',
    geo: 'crystalCluster',
    tier: 1,
    variants: 1,
    footprint: 0.7,
    flags: grounded,
  },
  // floats at the cove pier: pivot = water level, no contact blob (like instrumentBuoy)
  { id: 'researchVessel', geo: 'researchVessel', tier: 1, variants: 1, footprint: 1.3, flags: 0 },
];
