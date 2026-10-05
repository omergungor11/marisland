/**
 * hq theme structures (M14b): PropDefs appended to PROP_DEFS after PROP_DEFS_BUILDINGS
 * (content/props.ts, fixed theme order). Geometry: geo/themes/hq.ts.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded, windy } = PropFlag;

export const HQ_PROP_DEFS: readonly PropDef[] = [
  // T0 like every structure >= 3 u (D-031): stands in shallow water at the pier, pivot = water level
  { id: 'ferryOffice', geo: 'ferryOffice', tier: 0, variants: 2, footprint: 2.2, flags: windy },
  { id: 'banner', geo: 'banner', tier: 1, variants: 2, footprint: 0.5, flags: grounded | windy },
  // also the Design island's decor bed (themes/design.ts decor list): v1 = wildflower mix
  {
    id: 'flowerBed',
    geo: 'flowerBed',
    tier: 2,
    variants: 3,
    footprint: 0.9,
    flags: grounded | windy,
  },
];
