/**
 * marketing theme structures (M14b): PropDefs appended to PROP_DEFS after PROP_DEFS_BUILDINGS
 * (content/props.ts, fixed theme order). Geometry: geo/themes/marketing.ts.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded, windy } = PropFlag;

export const MARKETING_PROP_DEFS: readonly PropDef[] = [
  // T0: must read from the far tier (billboard face = emissive-2 screen class; M14c slideshow)
  { id: 'billboardV2', geo: 'billboardV2', tier: 0, variants: 2, footprint: 2.6, flags: grounded },
  // clifftop stage deck (T0 structure >= 3 u)
  { id: 'stage', geo: 'stage', tier: 0, variants: 2, footprint: 3.2, flags: grounded | windy },
  {
    id: 'bannerPole',
    geo: 'bannerPole',
    tier: 1,
    variants: 2,
    footprint: 0.6,
    flags: grounded | windy,
  },
  {
    id: 'megaphoneKiosk',
    geo: 'megaphoneKiosk',
    tier: 1,
    variants: 2,
    footprint: 1.4,
    flags: grounded,
  },
  // floats: pivot = water level, no contact blob (like buoy)
  { id: 'adBuoy', geo: 'adBuoy', tier: 2, variants: 2, footprint: 0.4, flags: 0 },
];
