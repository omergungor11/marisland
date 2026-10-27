/**
 * QA Customs Port kit defs (M30 TASK-506, D-082; geometry geo/themes/qa-customs.ts, numbers
 * content/themes/qa-customs.ts). TASK-506 block: appended at the very end of PROP_DEFS (parallel
 * branches append too, the orchestrator reorders). All three are planner-pinned fixtures (never
 * rolled); they are the 13th-15th defs of the QA culture ledger (cap 15, tier-1 still 1:
 * budgets.ts `cultureCapOverride.qa`). Large pieces (> 3 u) draw from T0 by size (D-031).
 */
import type { PropDef } from '../props.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { QA_CUSTOMS as K } from '../themes/qa-customs.ts';

const { grounded } = PropFlag;

export const QA_CUSTOMS_PROP_DEFS: readonly PropDef[] = [
  // Q8 scanner arch over the cove-mouth channel (ship passes along local z)
  {
    id: 'scannerArch',
    geo: 'scannerArch',
    tier: 2,
    variants: 1,
    footprint: K.arch.footprint,
    flags: grounded,
  },
  // 0 quay crane (container on the spreader), 1 empty rig, 2 / 3 inspection line (check / cross lamp lit), 4 QA container stack
  {
    id: 'customsYard',
    geo: 'customsYard',
    tier: 2,
    variants: 5,
    rollVariants: 1,
    footprint: K.crane.footprint,
    flags: grounded,
  },
  // Q9: floats at the waterline (FLOATING_FIXTURES), no contact blob; 3 layouts, bobs as a whole
  {
    id: 'quarantinePontoon',
    geo: 'quarantinePontoon',
    tier: 2,
    variants: 3,
    rollVariants: 1,
    footprint: K.pontoon.footprint,
    flags: 0,
  },
];

/** The Customs Port showcase (`?gallery=1&ids=qa30`, scripts/gallery-shots.ts). */
export const QA_M30_PROP_IDS: readonly string[] = [
  'scannerArch',
  'customsYard',
  'quarantinePontoon',
];
