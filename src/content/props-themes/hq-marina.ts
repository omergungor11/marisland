/**
 * HQ yacht marina and star fort defs (M29 TASK-505, D-085; geometry geo/themes/hq-marina.ts, numbers
 * content/themes/hq-marina.ts). Appended at the very end of PROP_DEFS (the TASK-505 block) so no
 * existing defId shifts. Both are planner-pinned fixtures on the water (FLOATING_FIXTURES, never
 * rolled); they are the 13th and 14th defs of the HQ culture ledger (content/cultures/hq.ts, cap 14 /
 * tier-1 1 in budgets.ts `cultureCapOverride.hq`). The moored fleet is the existing `sailboat` def
 * (variants 6-8, see props-buildings.ts), not a def of its own.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { windy, noShadow } = PropFlag;

export const HQ_MARINA_PROP_DEFS: readonly PropDef[] = [
  // 0 finger 12 u, 1 finger 8 u, 2 spine piece, 3 breakwater piece, 4 breakwater head (green light);
  // a comb of 0.5 u decks is below the size rule, but the marina reads from T0 as one element
  {
    id: 'marinaPier',
    geo: 'marinaPier',
    tier: 2,
    variants: 5,
    rollVariants: 1,
    footprint: 6.5,
    flags: noShadow,
    fromT0: true,
  },
  // the cove-mouth star bastion (tier 1: 12 u with the flag; > 3 u, so drawn from T0 by size)
  { id: 'starFort', geo: 'starFort', tier: 1, variants: 1, footprint: 7.5, flags: windy },
];

/** The marina showcase (`?gallery=1&ids=marina`, scripts/gallery-shots.ts). */
export const HQ_MARINA_PROP_IDS: readonly string[] = ['marinaPier', 'starFort', 'sailboat'];
