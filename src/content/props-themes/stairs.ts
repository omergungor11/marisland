/**
 * Stair flight (TASK-485): one shared def, the look and the rise are the variant
 * (content/stairs.ts, geo/themes/stairs.ts). Appended at the very end of PROP_DEFS so no existing
 * defId shifts. Planner-pinned, never rolled.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';
import { STAIR_FLIGHT } from '../stairs.ts';

const { grounded } = PropFlag;

export const STAIR_PROP_DEFS: readonly PropDef[] = [
  {
    id: 'stairFlight',
    geo: 'stairFlight',
    tier: 2,
    variants: STAIR_FLIGHT.looks.length * STAIR_FLIGHT.rises.length,
    rollVariants: 1,
    footprint: 1.2,
    flags: grounded,
  },
];
