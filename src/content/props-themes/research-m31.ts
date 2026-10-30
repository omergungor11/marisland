/**
 * Research M31 Tide-Lab defs (TASK-533, D-114; geometry geo/themes/research-m31.ts, numbers
 * content/themes/research-m31.ts). Appended at the very end of PROP_DEFS (content/props.ts, the
 * TASK-533 block) so no existing defId shifts. Ledger entries 12-14 of the Research culture
 * (`cultureCapOverride.research` = { 14, 1 } in budgets.ts): `tideLab` is Research's ONE tier-1 def
 * (the slot D-062 R3-16 kept), `tideGauge` and `sunkenCity` are tier 2.
 *
 * `tideSub` (the submersible) is NOT a def: it is a geo-only mover mesh built with
 * `buildProp('tideSub', seed, 0, lod)`. The shared harbour kit (light, shelter, booth, board, bollard)
 * is variants of old defs (content/props-buildings.ts, props-themes/signage.ts), no entry here.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded, noShadow, underwater } = PropFlag;

export const RESEARCH_M31_PROP_DEFS: readonly PropDef[] = [
  // stilt lab: pivot = waterline (piles reach below), so no contact blob; > 3 u, drawn from T0 by size
  { id: 'tideLab', geo: 'tideLab', tier: 1, variants: 1, footprint: 3.9, flags: 0 },
  // 0 pole + float, 1 pole only, 2 float only (the float mover); planner-pinned
  {
    id: 'tideGauge',
    geo: 'tideGauge',
    tier: 2,
    variants: 3,
    rollVariants: 1,
    footprint: 0.7,
    flags: grounded,
  },
  // the 8-piece ruin kit; stands on the lagoon bed (underwater: y = the bed; 'sea' pieces are lifted by TASK-534)
  {
    id: 'sunkenCity',
    geo: 'sunkenCity',
    tier: 2,
    variants: 8,
    rollVariants: 1,
    footprint: 1.7,
    flags: underwater | noShadow,
  },
];

/** The Research M31 showcase (`?gallery=1&ids=research31`, scripts/gallery-shots.ts). */
export const RESEARCH_M31_PROP_IDS: readonly string[] = [
  'tideLab',
  'tideSub',
  'tideGauge',
  'sunkenCity',
];

/** The shared harbour kit showcase (`?gallery=1&ids=harbours`): old defs, variants 3/4 etc. */
export const HARBOURS_PROP_IDS: readonly string[] = [
  'lighthouse',
  'marketStall',
  'dock',
  'pierSignpost',
  'barrel',
];
