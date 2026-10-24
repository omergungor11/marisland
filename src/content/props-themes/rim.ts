/**
 * Shared rim walkway post (TASK-480, WORLD_PLAN §3.5): one def for every island's rim walkway, the
 * island style is the variant (content/rim-walkway.ts RIM_POST_LOOKS, geo/themes/rim.ts). Appended
 * at the very end of PROP_DEFS so no existing defId shifts. Planner-pinned, never rolled.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';
import { RIM_POST_LOOKS } from '../rim-walkway.ts';

const { grounded } = PropFlag;

export const RIM_PROP_DEFS: readonly PropDef[] = [
  {
    id: 'rimPost',
    geo: 'rimPost',
    tier: 2,
    variants: RIM_POST_LOOKS.length * 2,
    rollVariants: 1,
    footprint: 0.3,
    flags: grounded,
  },
];
