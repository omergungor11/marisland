/**
 * Coding M33 defs (TASK-543, D-117; D-116 Bot Foundry + Drone Port + Data Lake; geometry
 * geo/themes/coding-m33.ts, numbers content/themes/coding-m33.ts). A self-contained block appended at
 * the very end of PROP_DEFS (content/props.ts) so no existing defId shifts. Ten new defs: ledger
 * entries 13-22 of the Coding culture (cap override 22 / tier-1 2 in budgets.ts, no new tier-1).
 * All are planner-pinned fixtures (never rolled): `rollVariants: 1` keeps any random roll on v0.
 *
 * Tier: `foundryPart` is tier 3 (crates + bots, small); the rest tier 2. The large ones (dronePad
 * 3.8 u disc, cloudBalloon 8.4 u, quantumPavilion 4.9 u plinth) are drawn from T0 by size (D-031).
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded, noShadow } = PropFlag;

export const CODING_M33_PROP_DEFS: readonly PropDef[] = [
  {
    id: 'conveyorLine',
    geo: 'conveyorLine',
    tier: 2,
    variants: 2,
    rollVariants: 1,
    footprint: 2.2,
    flags: grounded,
  },
  {
    id: 'assemblyArm',
    geo: 'assemblyArm',
    tier: 2,
    variants: 6,
    rollVariants: 1,
    footprint: 1.6,
    flags: grounded,
  },
  {
    id: 'foundryPart',
    geo: 'foundryPart',
    tier: 3,
    variants: 6,
    rollVariants: 1,
    footprint: 0.75,
    flags: grounded | noShadow,
  },
  {
    id: 'dronePad',
    geo: 'dronePad',
    tier: 2,
    variants: 1,
    footprint: 1.9,
    flags: grounded | noShadow,
  },
  {
    id: 'chargeMast',
    geo: 'chargeMast',
    tier: 2,
    variants: 2,
    rollVariants: 1,
    footprint: 0.5,
    flags: grounded,
  },
  { id: 'droneHangar', geo: 'droneHangar', tier: 2, variants: 1, footprint: 2.0, flags: grounded },
  {
    id: 'botCourse',
    geo: 'botCourse',
    tier: 2,
    variants: 4,
    rollVariants: 1,
    footprint: 1.3,
    flags: grounded,
  },
  { id: 'serverPod', geo: 'serverPod', tier: 2, variants: 1, footprint: 1.4, flags: grounded },
  {
    id: 'cloudBalloon',
    geo: 'cloudBalloon',
    tier: 2,
    variants: 2,
    rollVariants: 1,
    footprint: 0.7,
    flags: grounded,
  },
  {
    id: 'quantumPavilion',
    geo: 'quantumPavilion',
    tier: 2,
    variants: 1,
    footprint: 2.4,
    flags: grounded,
  },
];

/** The M33 showcase (`?gallery=1&ids=coding33`, scripts/gallery-shots.ts). */
export const CODING_M33_PROP_IDS: readonly string[] = CODING_M33_PROP_DEFS.map((d) => d.id);
