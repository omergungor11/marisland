/**
 * Pennant & signage kit (M19 TASK-409): PropDefs appended to PROP_DEFS after the theme structures
 * (content/props.ts). Geometry: geo/themes/signage.ts. Tier 2 each (B4: culture detail lives at
 * T2/T3, W11 +0 calls); variants: pennantLine/cargoCrate 0..6 = THEME_IDS order (hq, coding,
 * marketing, qa, design, devops, research), pierSignpost 0..2 = fan presets (7 / 4 / 2 boards).
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded, windy } = PropFlag;

export const SIGNAGE_PROP_DEFS: readonly PropDef[] = [
  // two poles 6 u apart: footprint = half the span, no contact blob (poles are thin)
  { id: 'pennantLine', geo: 'pennantLine', tier: 2, variants: 7, footprint: 3.2, flags: windy },
  {
    id: 'pierSignpost',
    geo: 'pierSignpost',
    tier: 2,
    // v3 / v4 = harbour timetable board (neutral / Research, M31 TASK-533): pinned, never rolled
    variants: 5,
    rollVariants: 3,
    footprint: 1.0,
    flags: grounded,
  },
  { id: 'cargoCrate', geo: 'cargoCrate', tier: 2, variants: 7, footprint: 0.5, flags: grounded },
];
