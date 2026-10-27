/**
 * QA Proving Grounds kit defs (M24 TASK-499; geometry geo/themes/qa-proving.ts, numbers
 * content/themes/qa-proving.ts). Appended at the very end of PROP_DEFS so no existing defId shifts.
 * All three are planner-pinned fixtures (never rolled); they are the 10th-12th defs of the QA culture
 * ledger (content/cultures/qa.ts, cap 12 / tier-1 1 in budgets.ts `cultureCapOverride.qa`).
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded, windy } = PropFlag;

export const QA_PROVING_PROP_DEFS: readonly PropDef[] = [
  // the island's second silhouette: a 10 u lattice (tier 1, drawn from T0 by size, D-031)
  // v0 = crate parked at the top, v1 = empty cradle for the TASK-501 lift/drop mover
  {
    id: 'dropTower',
    geo: 'dropTower',
    tier: 1,
    variants: 2,
    rollVariants: 1,
    footprint: 1.9,
    flags: grounded,
  },
  // the blades turn (aSpin); the dummy pole's streamers flutter
  { id: 'testFan', geo: 'testFan', tier: 2, variants: 1, footprint: 1.6, flags: grounded | windy },
  // 0 hurdle, 1 tyre stack, 2 balance beam, 3 slalom cones (the plan places a course of them)
  {
    id: 'obstacle',
    geo: 'obstacle',
    tier: 2,
    variants: 4,
    rollVariants: 1,
    footprint: 1.4,
    flags: grounded,
  },
];

/** The Proving Grounds showcase (`?gallery=1&ids=qa24`, scripts/gallery-shots.ts). */
export const QA_M24_PROP_IDS: readonly string[] = ['dropTower', 'testFan', 'obstacle'];
