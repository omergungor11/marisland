/**
 * Coding Wind Tunnel defs (M24 TASK-498, `CO:C1`; D-088; geometry geo/themes/coding-tunnel.ts, numbers
 * content/themes/coding-tunnel.ts). Appended at the very end of PROP_DEFS in a marked TASK-498 block
 * (content/props.ts) so no existing defId shifts. They are the 11th-12th entries of the Wind Gardens
 * ledger (content/cultures/coding.ts, cap 12 / tier-1 2 in budgets.ts `cultureCapOverride.coding`:
 * the tunnel is the second tier-1 slot after the giant duck). Both are planner-pinned fixtures on the
 * `windTunnel` anchor (never rolled). The five windsocks are part of the tunnel mesh (lift tag).
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded } = PropFlag;

export const CODING_TUNNEL_PROP_DEFS: readonly PropDef[] = [
  // 14 u lattice half tube (tier 1, drawn from T0 by size, D-031); runs along local +x = downwind
  { id: 'windTunnel', geo: 'windTunnel', tier: 1, variants: 1, footprint: 3.2, flags: grounded },
  // the 3 u fan at the upwind mouth (blades turn with the wind: shared spin tag); faces local +z
  { id: 'tunnelFan', geo: 'tunnelFan', tier: 2, variants: 1, footprint: 1.4, flags: grounded },
];

/** The wind tunnel showcase (`?gallery=1&ids=coding24`, scripts/gallery-shots.ts). */
export const CODING_TUNNEL_IDS: readonly string[] = ['windTunnel', 'tunnelFan'];
