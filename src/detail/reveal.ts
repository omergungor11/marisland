import type { Lod } from '../geo/types.ts';
import { GROUND_COVER_FADE, LOD_HANDOFF, TIER_FADE, type PropDef } from '../content/props.ts';
import { PropFlag } from '../world/prop-store.ts';

/**
 * Continuous detail reveal (TASK-611, D-161). The orbit tier only ARMS prop groups; what is seen
 * is decided per instance by the dither band of its material (camera → instance origin), so a
 * slow dolly reveals detail continuously instead of at a tier switch.
 *
 * Fade bands are the shader's `(uFadeNear, uFadeFar)` pair: `vFade = 1 − clamp((d − near) /
 * (far − near))`. `near < far` fades OUT with distance (opaque inside `near`); `near > far` is the
 * inverted ramp, fading out as the camera comes CLOSER (opaque past `near`, gone inside `far`) —
 * the LOD1 side of the hand-over.
 */
export type FadeBand = readonly [number, number];

/** The T0 cluster proxy (batcher): drawn at T0 only, never fades. */
const isClusterProxy = (def: PropDef): boolean => def.id === 'treeBlob';

/** A def drawn as LOD1 in far views (tier 0–1 structures, trees, rocks; not interiors). */
export function hasLod1View(def: PropDef): boolean {
  return def.tier <= 1 && !def.interior && !isClusterProxy(def);
}

/**
 * First orbit tier at which a def's groups are armed: tier 0–1 defs at their tier, tier 2–3 one
 * tier ahead so their dither band (TIER_FADE) opens while the camera is still in the tier before.
 */
export function armTier(def: PropDef): number {
  return def.tier <= 1 ? def.tier : def.tier - 1;
}

/** True when a group of `def` at `lod` is armed (may draw) at orbit tier `t`. */
export function lodArmed(def: PropDef, lod: Lod, groundCover: boolean, t: number): boolean {
  if (isClusterProxy(def)) return t === 0;
  if (t < armTier(def)) return false;
  if ((def.flags & PropFlag.clusterable) !== 0 && t === 0) return false; // T0: cluster blobs
  if (groundCover) return true;
  // LOD1 only for defs with a far view; LOD0 from T1 (T0 is all past the hand-over band)
  return lod === 1 ? hasLod1View(def) : t >= 1;
}

/** The dither band of a def's material at `lod`. */
export function fadeBand(def: PropDef, lod: Lod, groundCover: boolean): FadeBand {
  if (groundCover || (def.flags & PropFlag.groundCover) !== 0) return def.fade ?? GROUND_COVER_FADE;
  const own = def.fade ?? TIER_FADE[def.tier] ?? TIER_FADE[0];
  if (!hasLod1View(def)) return own;
  if (lod === 0) return LOD_HANDOFF.band;
  // LOD1: the inverted ramp just inside the hand-over band. Trees keep their far fade instead
  // (TREE_FADE: the far forests of T1 views); their LOD1 canopy sits inside LOD0, so it hides
  // behind it close up. Every other LOD1 must leave: a LOD0 with openings (dock slats, lattices)
  // would show the solid LOD1 through them. Their old far fade (TIER_FADE[1], T1 only) goes.
  if (own[1] < 1e8 && (def.flags & PropFlag.clusterable) !== 0) return own;
  const n = LOD_HANDOFF.band[0];
  return [n, n - LOD_HANDOFF.lod1Out];
}

/** True for the inverted (LOD1 hand-over) ramp. */
export const isInverted = (b: FadeBand): boolean => b[0] > b[1];

/** CPU twin of the shader ramp: vFade at distance `d`. */
export function fadeAt(d: number, b: FadeBand): number {
  const x = (d - b[0]) / (b[1] - b[0]);
  return 1 - Math.min(1, Math.max(0, x));
}

/**
 * True when some instance between `nearest` and `farthest` u from the camera can be visible
 * (vFade > 0): the group / merged-mesh skip test (TASK-405) for both ramp directions.
 */
export function bandReaches(nearest: number, farthest: number, b: FadeBand): boolean {
  return isInverted(b) ? farthest > b[1] : nearest < b[1];
}

/**
 * TASK-652: true when a LOD0 group of `def` whose instances are all at least `nearest` u away can
 * leave its shadow to LOD1 (LOD1 casts at T0–T1 only, see the batcher): past the cast cut of the
 * hand-over (half of LOD1's inverted ramp, D-161) LOD1 is still opaque and casts wherever LOD0
 * would. Trees qualify too: their LOD1 keeps the far fade and casts through the whole LOD0 band
 * (its canopy sits inside LOD0's, a shadow a pixel or two smaller at that distance).
 */
export function lod1CastsPast(def: PropDef, nearest: number): boolean {
  if (!hasLod1View(def)) return false;
  const cut = LOD_HANDOFF.band[0] - 0.5 * LOD_HANDOFF.lod1Out;
  if (nearest <= cut) return false;
  const b = fadeBand(def, 1, false);
  const half = 0.5 * (b[0] + b[1]);
  return isInverted(b) ? half <= cut : half >= 0.5 * (LOD_HANDOFF.band[0] + LOD_HANDOFF.band[1]);
}

/** The shadow pass discards below half fade: true when some caster can pass it. */
export function bandCasts(nearest: number, farthest: number, b: FadeBand): boolean {
  const half = 0.5 * (b[0] + b[1]);
  return isInverted(b) ? farthest > half : nearest < half;
}
