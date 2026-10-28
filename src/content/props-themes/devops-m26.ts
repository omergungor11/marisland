/**
 * DevOps M26 lava-pack defs (TASK-509b, D-092; geometry geo/themes/devops-m26.ts, numbers
 * content/themes/devops-m26.ts). Appended at the very end of PROP_DEFS in a marked TASK-509b block
 * (content/props.ts) so no existing defId shifts. The five new defs are the 15th-19th entries of the
 * Ember Smiths ledger (content/cultures/devops.ts, cap 19 / tier-1 1 in budgets.ts
 * `cultureCapOverride.devops`), all tier 2 and planner-pinned (never rolled).
 *
 * The tug is NOT a def: it is sailboat variant 9 (geo `tugBoat`; PropDef variants 10, rolls stay on
 * 0-1), so the boat movers read it like the ferry (v2) and the patrol boat (v3).
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded, noShadow } = PropFlag;

export const DEVOPS_M26_PROP_DEFS: readonly PropDef[] = [
  // D3: 0 footbridge, 1 rail bridge; 9 x 2.4 u, runs along local z
  { id: 'emberBridge', geo: 'emberBridge', tier: 2, variants: 2, footprint: 4.6, flags: grounded },
  // D6: octagonal rim platform (4.6 u: a large structure, drawn from T0 by size)
  { id: 'craterDeck', geo: 'craterDeck', tier: 2, variants: 1, footprint: 2.6, flags: grounded },
  // D17: kiln + glass rack, ~6 x 3 u, front +z
  { id: 'glassKiln', geo: 'glassKiln', tier: 2, variants: 1, footprint: 3.4, flags: grounded },
  // D10: 0 shard cluster, 1 sea stack, 2 tide-pool slab, 3 cairn
  {
    id: 'obsidianShard',
    geo: 'obsidianShard',
    tier: 2,
    variants: 4,
    footprint: 1.2,
    flags: grounded | noShadow,
  },
  // D18: 0 straight 8 u, 1 short 5 u + ladder, 2 head with the red light; stands in the water
  {
    id: 'devopsBreakwater',
    geo: 'devopsBreakwater',
    tier: 2,
    variants: 3,
    footprint: 4,
    flags: noShadow,
  },
];

/** The DevOps M26 showcase (`?gallery=1&ids=devops26`, scripts/gallery-shots.ts). */
export const DEVOPS_M26_PROP_IDS: readonly string[] = [
  'emberBridge',
  'craterDeck',
  'glassKiln',
  'obsidianShard',
  'devopsBreakwater',
  'sailboat',
];
