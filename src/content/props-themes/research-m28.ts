/**
 * Research M28 signature def (TASK-525, D-106; geometry geo/themes/research-m28.ts, numbers
 * content/themes/research-m28.ts). Appended at the very end of PROP_DEFS (content/props.ts) so no
 * existing defId shifts. `sundial` is the 11th Research ledger entry (cap override 11 / tier-1 1
 * in budgets.ts), tier 2 and planner-pinned; as a 6 u disc it is a large structure, so the batcher
 * draws it from T0 by size. The rim telescope deck (tripodTelescope v2) and the teal stair lantern
 * (lanternPost v3) are VARIANTS (no ledger entry, no new def; their PropDef edits live with the old
 * defs: variants + rollVariants so random rolls keep the old variants).
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded } = PropFlag;

export const RESEARCH_M28_PROP_DEFS: readonly PropDef[] = [
  { id: 'sundial', geo: 'sundial', tier: 2, variants: 1, footprint: 3.0, flags: grounded },
];

/** The Research M28 showcase (`?gallery=1&ids=research28`, scripts/gallery-shots.ts). */
export const RESEARCH_M28_PROP_IDS: readonly string[] = [
  'sundial',
  'tripodTelescope',
  'lanternPost',
];
