/**
 * marketing theme structures (M14b): PropDefs appended to PROP_DEFS after PROP_DEFS_BUILDINGS
 * (content/props.ts, fixed theme order). Geometry: geo/themes/marketing.ts.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded, windy, noShadow } = PropFlag;

export const MARKETING_PROP_DEFS: readonly PropDef[] = [
  // T0: must read from the far tier (billboard face = emissive-2 screen class; M14c slideshow)
  { id: 'billboardV2', geo: 'billboardV2', tier: 0, variants: 2, footprint: 2.6, flags: grounded },
  // clifftop stage deck (T0 structure >= 3 u)
  { id: 'stage', geo: 'stage', tier: 0, variants: 2, footprint: 3.2, flags: grounded | windy },
  // TASK-403: one variant (the boulevard and fair hold many poles: one LOD0 group, not two)
  {
    id: 'bannerPole',
    geo: 'bannerPole',
    tier: 1,
    variants: 1,
    footprint: 0.6,
    flags: grounded | windy,
  },
  {
    id: 'megaphoneKiosk',
    geo: 'megaphoneKiosk',
    tier: 1,
    variants: 2,
    footprint: 1.4,
    flags: grounded,
  },
  // floats: pivot = water level, no contact blob (like buoy); v2 = the lit bay-mouth chain
  // (TASK-481), pinned by the plan, never rolled; noShadow (tiny floats, one pass less). Tier 1 (was 2): the lit chain frames the bay
  // from the T1 night views (W4), not only from 120 u
  {
    id: 'adBuoy',
    geo: 'adBuoy',
    tier: 1,
    variants: 3,
    rollVariants: 2,
    footprint: 0.4,
    flags: noShadow,
  },
  // TASK-403 Media Rock: structures >= 3 u read from T0 (D-031); one variant unless noted. The
  // ones standing on their own plinth / deck skip the contact blob (one draw call per LOD0 group)
  { id: 'giantScreen', geo: 'giantScreen', tier: 0, variants: 1, footprint: 4.2, flags: 0 },
  // v1 = the short transmitter on a sea stack (TASK-481), pinned by the plan
  {
    id: 'antennaTower',
    geo: 'antennaTower',
    tier: 0,
    variants: 2,
    rollVariants: 1,
    footprint: 1.7,
    flags: 0,
  },
  { id: 'mediaOffice', geo: 'mediaOffice', tier: 0, variants: 1, footprint: 3.2, flags: 0 },
  // v0 photo studio, v1 print shop (one LOD1 group)
  { id: 'mediaShop', geo: 'mediaShop', tier: 0, variants: 2, footprint: 2.0, flags: 0 },
  // the static frame; the rotor is a mover (render/movers.ts)
  { id: 'ferrisWheel', geo: 'ferrisWheel', tier: 0, variants: 1, footprint: 4.6, flags: 0 },
  {
    id: 'fairTent',
    geo: 'fairTent',
    tier: 0,
    variants: 1,
    footprint: 2.4,
    flags: grounded | windy,
  },
  // v0 game booth, v1 café (one LOD1 group)
  { id: 'fairBooth', geo: 'fairBooth', tier: 2, variants: 2, footprint: 1.4, flags: grounded },
];

/**
 * M19 TASK-413 "Carnival Broadcasters" kit (geo/themes/culture-marketing.ts; ledger:
 * content/cultures/marketing.ts). Registered at the END of PROP_DEFS (content/props.ts) so no
 * existing def index moves. prizeBooth is a separate def (not a fairBooth variant) so existing
 * settlements keep rolling the same fairBooth variants.
 */
export const MARKETING_CULTURE_PROP_DEFS: readonly PropDef[] = [
  {
    id: 'mascotStatue',
    geo: 'mascotStatue',
    tier: 1,
    variants: 1,
    footprint: 1.6,
    flags: grounded,
  },
  { id: 'marqueeSign', geo: 'marqueeSign', tier: 2, variants: 3, footprint: 1.3, flags: grounded },
  {
    id: 'popcornCart',
    geo: 'popcornCart',
    tier: 2,
    variants: 2,
    footprint: 0.95,
    flags: grounded | windy,
  },
  {
    id: 'balloonMast',
    geo: 'balloonMast',
    tier: 2,
    variants: 2,
    footprint: 1.0,
    flags: grounded | windy,
  },
  {
    id: 'confettiCannon',
    geo: 'confettiCannon',
    tier: 2,
    variants: 2,
    footprint: 0.8,
    flags: grounded | windy,
  },
  {
    id: 'searchlightPair',
    geo: 'searchlightPair',
    tier: 2,
    variants: 2,
    footprint: 1.5,
    flags: grounded,
  },
  { id: 'prizeBooth', geo: 'prizeBooth', tier: 2, variants: 2, footprint: 1.4, flags: grounded },
  { id: 'selfieSpot', geo: 'selfieSpot', tier: 2, variants: 2, footprint: 1.5, flags: grounded },
  {
    id: 'posterRoll',
    geo: 'posterRoll',
    tier: 3,
    variants: 3,
    footprint: 0.5,
    flags: grounded | noShadow,
  },
  {
    id: 'megaphoneStand',
    geo: 'megaphoneStand',
    tier: 3,
    variants: 2,
    footprint: 0.45,
    flags: grounded | noShadow,
  },
];
