/**
 * Skerry beacon def (M23 TASK-490, W:B1): the mini lighthouse the scatter puts on up to
 * `BEACON_NET.skerries` skerries (content/placement.ts ISLET_SCATTER). Tier 0: it reads as a lamp
 * from the T0 postcard. Appended at the very end of PROP_DEFS so no existing defId shifts.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded } = PropFlag;

export const BEACON_PROP_DEFS: readonly PropDef[] = [
  { id: 'beaconTower', geo: 'beaconTower', tier: 0, variants: 1, footprint: 1.2, flags: grounded },
];
