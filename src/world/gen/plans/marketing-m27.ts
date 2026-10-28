/**
 * Beacon Rock M27 kit on its anchors (TASK-518, D-097): runs in the Marketing plan's `finish`
 * right after `reserveBeaconAnchors` (TASK-516) and never searches: every piece stands where an
 * anchor says (world/gen/plans/marketing-anchors.ts holds the contract).
 * - Cable car: a `mailLine` terminal (v7) on the first and last `cable…` anchor, a pylon (v4) on
 *   every mid one, pivot y = the anchor's ground; the loop's cable and the gondolas are drawn by
 *   render/beacon-lines.ts from the same anchors (`beaconTracks`).
 * - Sea billboard (`billboardV2` v2) and ON AIR (`billboardV2` v3) on their face planes: scaled to
 *   the anchor's rect, pushed out so the prop's rock plane (local z = −reach) lies on the anchor
 *   plane (the outermost rock), pivot y from the board / column centre.
 * - Dive tower and guyed transmitter (`antennaTower` v2) on their anchors at the published scale.
 * - The M22 quick-win mast (`antennaTower` v1) leaves every stack top that now carries one of
 *   these pieces.
 * Numbers: content/themes/marketing-m27-site.ts. Fixtures carry explicit variants and pivot y.
 */
import { MARKETING_M27 as K } from '../../../content/themes/marketing-m27.ts';
import { MARKETING_M27_SITE as S } from '../../../content/themes/marketing-m27-site.ts';
import { MARKETING_QUICK as Q } from '../../../content/themes/marketing.ts';
import type { FixtureData, IslandData, XZ } from '../../types.ts';
import type { SiteCtx } from '../sites.ts';

const clamp = (x: number, [lo, hi]: readonly [number, number]): number =>
  Math.min(hi, Math.max(lo, x));

/** Height of the ON AIR plate column (local, scale 1): five plates, four gaps, the word gap. */
export const ON_AIR_COLUMN =
  K.onAir.word.length * K.onAir.plate.h + (K.onAir.word.length - 1) * K.onAir.gap + K.onAir.wordGap;

export function placeBeaconKit(ctx: SiteCtx, isl: IslandData): void {
  const A = isl.anchors;
  const id = isl.id;
  const push = (f: Omit<FixtureData, 'islandId'>): void => {
    ctx.fixtures.push({ ...f, islandId: id });
  };
  // stack tops that now carry a piece
  const tops: { x: number; z: number; r: number }[] = [];
  for (const k of Object.keys(A))
    if (/^stackTop\d+$/.test(k)) tops.push({ x: A[k].x, z: A[k].z, r: A[`${k}Size`].x });
  const topOf = (p: XZ) => tops.find((t) => Math.hypot(p.x - t.x, p.z - t.z) <= t.r + 0.5) ?? null;
  const carried = new Set<(typeof tops)[number]>();
  // ---- cable car pieces
  let n = 0;
  while (A[`cable${n}`]) n++;
  if (n >= 2)
    for (let k = 0; k < n; k++) {
      const a = A[`cable${k}`];
      const end = k === 0 || k === n - 1;
      push({
        defId: 'mailLine',
        x: a.x,
        z: a.z,
        rotY: a.rotY,
        y: a.y,
        variant: end ? K.pylon.terminal : K.pylon.variant,
      });
      const t = k > 0 ? topOf(a) : null;
      if (t) carried.add(t);
    }
  // ---- dive tower and guyed transmitter
  const dv = A.diveTower;
  if (dv) {
    push({
      defId: 'diveTower',
      x: dv.x,
      z: dv.z,
      rotY: dv.rotY,
      y: dv.y,
      variant: 0,
      scale: A.diveTowerSize?.x ?? 1,
    });
    const t = topOf(dv);
    if (t) carried.add(t);
  }
  const tx = A.transmitter;
  if (tx) {
    push({
      defId: 'antennaTower',
      x: tx.x,
      z: tx.z,
      rotY: tx.rotY,
      y: tx.y,
      variant: K.guyed.variant,
      scale: A.transmitterSize?.x ?? 1,
    });
    const t = topOf(tx);
    if (t) carried.add(t);
  }
  // ---- face signs: the prop's rock plane (z = −reach × s) on the anchor plane
  const face = (key: string, variant: number, s: number, reach: number, centreY: number): void => {
    const a = A[key];
    const nx = Math.cos(a.rotY);
    const nz = Math.sin(a.rotY);
    push({
      defId: 'billboardV2',
      x: a.x + nx * reach * s,
      z: a.z + nz * reach * s,
      rotY: a.rotY,
      y: (a.y ?? 0) - centreY * s,
      variant,
      scale: s,
    });
  };
  const bb = A.seaBillboard;
  const bs = A.seaBillboardSize;
  if (bb && bs) {
    const B = K.seaBoard;
    const s = clamp(Math.min(bs.x / B.w, bs.z / B.h), S.seaBoard.scale);
    face('seaBillboard', B.variant, s, B.reach, B.y + B.h / 2);
  }
  const on = A.onAir;
  const os = A.onAirSize;
  if (on && os) {
    const O = K.onAir;
    const s = clamp(Math.min(os.z / ON_AIR_COLUMN, os.x / O.plate.w), S.onAir.scale);
    face('onAir', O.variant, s, O.reach, O.foot + ON_AIR_COLUMN / 2);
  }
  // ---- the M22 masts leave the stacks that carry a piece now
  const drop = (f: FixtureData): boolean =>
    f.islandId === id &&
    f.defId === 'antennaTower' &&
    f.variant === Q.transmitter.variant &&
    [...carried].some((t) => Math.hypot(f.x - t.x, f.z - t.z) <= t.r + S.dropAntenna);
  const keep = ctx.fixtures.filter((f) => !drop(f));
  ctx.fixtures.length = 0;
  ctx.fixtures.push(...keep);
}
