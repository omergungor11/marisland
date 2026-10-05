/**
 * qa theme structures (M14b): PropDefs appended to PROP_DEFS after PROP_DEFS_BUILDINGS
 * (content/props.ts, fixed theme order). Geometry: geo/themes/qa.ts.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded } = PropFlag;

export const QA_PROP_DEFS: readonly PropDef[] = [
  // checkpoint every ~25 u on the ring path: spans ~3 u, so T0 (reads as a red/white tick mark)
  { id: 'barrierGate', geo: 'barrierGate', tier: 0, variants: 2, footprint: 2.0, flags: grounded },
  { id: 'trafficCone', geo: 'trafficCone', tier: 3, variants: 2, footprint: 0.3, flags: grounded },
  {
    id: 'checklistBoard',
    geo: 'checklistBoard',
    tier: 1,
    variants: 2,
    footprint: 1.0,
    flags: grounded,
  },
  // floats: pivot = water level, no contact blob (like buoy)
  { id: 'inspectionBuoy', geo: 'inspectionBuoy', tier: 2, variants: 2, footprint: 0.45, flags: 0 },
];
