/**
 * DevOps M25 signature kit defs (TASK-504, D-084; geometry geo/themes/devops-m25.ts, numbers
 * content/themes/devops-m25.ts). Appended at the very end of PROP_DEFS in a marked TASK-504 block
 * (content/props.ts) so no existing defId shifts. The four new defs are the 11th-14th entries of the
 * Ember Smiths ledger (content/cultures/devops.ts, cap 14 / tier-1 1 in budgets.ts
 * `cultureCapOverride.devops`). All are planner-pinned fixtures or mover parts (never rolled).
 *
 * Variants of existing defs are NOT defs here (they are listed for the placement / life tasks):
 *   rackShed 2 (funicular station), onsenHouse 1 / 2 (stilt bath house, + towel lines),
 *   goodsStall 7 (smith's stall), mailLine 2 / 3 (ore pylon mid / furnace-end), antennaMast 2 (the
 *   watch tower, now with the beam head). Their PropDef edits (variants, rollVariants) are in place.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded, noShadow } = PropFlag;

export const DEVOPS_M25_PROP_DEFS: readonly PropDef[] = [
  // 3 pitch variants (level, ~17 deg, ~31 deg); 3 u pieces, each below the 3 u structure size (no T0 promotion)
  {
    id: 'funicularRail',
    geo: 'funicularRail',
    tier: 2,
    variants: 3,
    footprint: 1.5,
    flags: grounded,
  },
  // 2 liveries (orange, teal); a mover part, lit windows via the emissive path
  {
    id: 'funicularCar',
    geo: 'funicularCar',
    tier: 2,
    variants: 2,
    footprint: 2.4,
    flags: grounded,
  },
  // sinter mound with the vent on top (diameter < 3 u: not a large structure)
  { id: 'geyserCone', geo: 'geyserCone', tier: 2, variants: 1, footprint: 1.6, flags: grounded },
  // 0 empty, 1 loaded with glowing ore; the cableway movers draw it
  {
    id: 'oreBucket',
    geo: 'oreBucket',
    tier: 3,
    variants: 2,
    footprint: 0.5,
    flags: grounded | noShadow,
  },
];

/** The DevOps M25 showcase (`?gallery=1&ids=devops25`, scripts/gallery-shots.ts). */
export const DEVOPS_M25_PROP_IDS: readonly string[] = [
  'funicularRail',
  'funicularCar',
  'geyserCone',
  'oreBucket',
  'rackShed',
  'onsenHouse',
  'goodsStall',
  'mailLine',
  'antennaMast',
];
