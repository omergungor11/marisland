/**
 * Marketing M27 signature def (TASK-517, D-096; geometry geo/themes/marketing-m27.ts, numbers
 * content/themes/marketing-m27.ts). Appended at the very end of PROP_DEFS (content/props.ts) so no
 * existing defId shifts. `diveTower` is the 11th Marketing ledger entry (cap override 11 / tier-1 1
 * in budgets.ts), tier 2 and planner-pinned; at ~6.6 u it is a large structure, so the batcher
 * draws it from T0 by size. The cable car, the sea billboard, the ON AIR neon and the guyed
 * transmitter are VARIANTS of mailLine / billboardV2 / antennaTower (no ledger entry, no new def).
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded, windy } = PropFlag;

export const MARKETING_M27_PROP_DEFS: readonly PropDef[] = [
  {
    id: 'diveTower',
    geo: 'diveTower',
    tier: 2,
    variants: 1,
    footprint: 1.6,
    flags: grounded | windy,
  },
];

/** The Marketing M27 showcase (`?gallery=1&ids=marketing27`, scripts/gallery-shots.ts). */
export const MARKETING_M27_PROP_IDS: readonly string[] = [
  'mailLine',
  'billboardV2',
  'antennaTower',
  'diveTower',
];
