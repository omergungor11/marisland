/**
 * Marketing island plan — the Media Rock (Beacon Rock; TASK-403, replaces the M14b sea-stack plan
 * of TASK-365). The archetype gives the stack with the summit (`lighthouse` anchor), three lee
 * shelves stepping down to the landing cove (`ledge0` upper ledge, `ledge1` middle ledge,
 * `ledge2` fair ground; rotY = the terrace axis) and the `landing` cove. The theme builds:
 * - Summit, the Ad Boulevard: the Broadcast Tower (THEMES.marketing.landmarks) at the windward
 *   end, a paved street (Zone.plaza) along the terrace axis to the giant screen on the lee rim,
 *   its frontage of billboards, flag poles, a broadcast studio, the billboard office and a café;
 *   the street's hub disc seeds the island network;
 * - Media campus on the upper and middle ledges: the antenna tower, layered media offices, the
 *   photo studio and the print shop, broadcast studio lots — fronts to the view, backs to the wall;
 * - Fair ground on the low shelf: a paved disc ringed by tents and game booths, the ferris wheel
 *   (its rotor turns in render/movers.ts), the stage and banner poles;
 * - Landing: the cove pier + megaphone kiosk; ad buoys in the lee water.
 * Stairs climb the earth walls between the shelves (stair links hub → hub, in switchbacks).
 * Random draws come from labelled forks of `rng`; tuning lives in MARKETING_PLAN.
 */
import { FLATTEN, LOT_FOOTPRINT, VILLAGE } from '../../../content/settlements.ts';
import { OFFICE_DEFS } from '../../../content/offices.ts';
import { MARKETING_PLAN as P } from '../../../content/themes/marketing.ts';
import { THEMES } from '../../../content/themes/index.ts';
import { Zone, type IslandData, type XZ } from '../../types.ts';
import { heightAt } from '../../types.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
import {
  add,
  addPad,
  addShape,
  ang,
  bestSample,
  clear,
  dirOf,
  discShape,
  dist,
  dockWithLink,
  findDock,
  landmarkAccess,
  linkLot,
  newPlan,
  onLand,
  placeBuoys,
  pushLandmark,
  rectShape,
  relief,
  seedHub,
  shapeCorners,
  shapeDist,
  siteFree,
  tryLot,
  unit,
  type LinkReq,
  type Shape,
  type SiteCtx,
} from '../sites.ts';
import type { ThemePlanner } from './types.ts';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** A fixed prop (not a lot) with its own obstacle shape; `pad` flattens the ground under it. */
function fixture(
  ctx: SiteCtx,
  isl: IslandData,
  defId: string,
  p: XZ,
  rotY: number,
  sh: Shape,
  o: { block?: boolean; pad?: number; variant?: number } = {},
): void {
  ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id });
  if (o.variant !== undefined) ctx.fixtures[ctx.fixtures.length - 1].variant = o.variant;
  addShape(ctx, isl, sh, o.block ?? true);
  if (o.pad !== undefined) addPad(ctx, isl, sh, o.pad);
}

/** Write `zone` on this island's land samples inside `sh`. */
function paintZone(ctx: SiteCtx, isl: IslandData, sh: Shape, zone: number): void {
  const R = (sh.r > 0 ? sh.r : Math.hypot(sh.hw, sh.hd)) + 1;
  const [x0, x1] = gridRange(sh.x - R, sh.x + R);
  const [z0, z1] = gridRange(sh.z - R, sh.z + R);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) continue;
      if (shapeDist(sh, cellX(ix), cellZ(iz)) <= 0) ctx.zone[i] = zone;
    }
}

/** Footprint samples: centre, corners and edge mids (rect) or a ring (disc). */
function samples(sh: Shape): XZ[] {
  const pts: XZ[] = [{ x: sh.x, z: sh.z }];
  if (sh.r > 0) {
    for (let k = 0; k < 8; k++) pts.push(add(sh, dirOf((k / 8) * TAU), sh.r));
    return pts;
  }
  const cs = shapeCorners(sh);
  for (let k = 0; k < 4; k++) {
    const a = cs[k];
    const b = cs[(k + 1) % 4];
    pts.push(a, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
  }
  return pts;
}

/** The whole footprint on land and within `tol` u of the shelf `level` (no rim overhang). */
function onShelf(ctx: SiteCtx, isl: IslandData, sh: Shape, level: number, tol: number): boolean {
  if (!onLand(ctx, isl, sh, P.shelfMinShore)) return false;
  for (const p of samples(sh)) if (Math.abs(heightAt(ctx.h, p.x, p.z) - level) > tol) return false;
  return true;
}

/** On the summit plateau: on land, nearly flat, nowhere below `top − summitDrop` (no rim overhang). */
function onSummit(ctx: SiteCtx, isl: IslandData, sh: Shape, top: number): boolean {
  if (!onLand(ctx, isl, sh, P.shelfMinShore) || relief(ctx, sh) > P.summitRelief) return false;
  for (const p of samples(sh)) if (heightAt(ctx.h, p.x, p.z) < top - P.summitDrop) return false;
  return true;
}

interface Spot {
  p: XZ;
  rot: number;
  sh: Shape;
}

/**
 * Best clear spot on a shelf within `search` u of `near`: `make` gives the footprint (and its
 * facing) at a sample; scored by relief, distance to `near` and `extra`.
 */
function shelfSpot(
  ctx: SiteCtx,
  isl: IslandData,
  near: XZ,
  search: number,
  level: number,
  make: (p: XZ) => { rot: number; sh: Shape },
  o: {
    gap?: number;
    tol?: number;
    inPlaza?: boolean;
    extra?: (p: XZ) => number;
    /** Also the footprint grown by `u` u within `tol` of the level (lot pads reach the corners). */
    grow?: { u: number; tol: number };
  } = {},
): Spot | null {
  const p = bestSample(ctx, isl, near, search, (q) => {
    const { sh } = make(q);
    if (!onShelf(ctx, isl, sh, level, o.tol ?? P.shelfTol)) return Infinity;
    if (o.grow) {
      const g =
        sh.r > 0
          ? discShape(sh.x, sh.z, sh.r + o.grow.u)
          : { ...sh, hw: sh.hw + o.grow.u, hd: sh.hd + o.grow.u };
      if (
        samples(g).some(
          (s) => Math.abs(heightAt(ctx.h, s.x, s.z) - level) > (o.grow as { tol: number }).tol,
        )
      )
        return Infinity;
    }
    if (!clear(ctx, isl, sh, o.gap ?? 1, o.inPlaza) || !siteFree(ctx, isl, sh)) return Infinity;
    return relief(ctx, sh) + 0.05 * dist(q, near) + (o.extra?.(q) ?? 0);
  });
  if (!p) return null;
  return { p, ...make(p) };
}

/** Megaphone kiosk on land beside the pier root, facing the pier. */
function placeKiosk(ctx: SiteCtx, isl: IslandData, root: XZ): void {
  // second pass: closer to the waterline, on a steeper bit of the cove ramp
  for (const [shore, rel] of [
    [1.5, 1],
    [0.8, 1.8],
  ])
    for (let r = P.kioskRing[0]; r <= P.kioskRing[1]; r++)
      for (let k = 0; k < 12; k++) {
        const p = add(root, dirOf((k / 12) * TAU), r);
        const sh = discShape(p.x, p.z, P.kioskRadius);
        if (!onLand(ctx, isl, sh, shore, 0.4) || relief(ctx, sh) > rel) continue;
        if (!clear(ctx, isl, sh, 0.6)) continue;
        const f = unit(p, root);
        fixture(ctx, isl, 'megaphoneKiosk', p, ang(f.x, f.z), sh);
        return;
      }
}

/**
 * Giant screen on the summit's lee rim: the farthest spot along the terrace axis from the
 * lighthouse (± a little across it) where the whole footprint stays on the plateau. Its front
 * faces back up the boulevard (the back face is a second screen, toward the shelves below).
 */
function placeScreen(ctx: SiteCtx, isl: IslandData, lh: XZ, axis: XZ, top: number): Spot | null {
  const across = { x: -axis.z, z: axis.x };
  const rot = ang(-axis.x, -axis.z);
  for (let t = P.boulevard.len[1] + 4; t >= P.boulevard.len[0] + 2; t -= 1)
    for (const off of [0, 2, -2, 4, -4]) {
      const p = add(add(lh, axis, t), across, off);
      const sh = rectShape(p.x, p.z, rot, P.screen.w, P.screen.d);
      if (!onLand(ctx, isl, sh, P.shelfMinShore) || relief(ctx, sh) > P.screen.maxRelief) continue;
      if (samples(sh).some((q) => heightAt(ctx.h, q.x, q.z) < top - P.screen.drop)) continue;
      if (!clear(ctx, isl, sh, 1)) continue;
      return { p, rot, sh };
    }
  return null;
}

/** The summit spot farthest windward of `a` (back along the axis) that still holds the tower's lawn. */
function windwardLip(ctx: SiteCtx, isl: IslandData, a: XZ, axis: XZ, top: number): XZ | null {
  const across = { x: -axis.z, z: axis.x };
  const T = P.lighthouse;
  for (let t = T.back; t >= 0; t -= 1)
    for (const off of [0, 2, -2]) {
      const p = add(add(a, axis, -t), across, off);
      const sh = discShape(p.x, p.z, T.r);
      if (!onLand(ctx, isl, sh, T.minShore) || relief(ctx, sh) > T.maxRelief) continue;
      if (samples(sh).some((q) => heightAt(ctx.h, q.x, q.z) < top - T.drop)) continue;
      return p;
    }
  return null;
}

export const planMarketing: ThemePlanner = ({ ctx, isl, rng, sIdx }) => {
  // the Broadcast Tower on its anchor (the theme's landmark table)
  const lms = Object.entries(THEMES[isl.theme].landmarks).filter(([k]) => isl.anchors[k]);
  if (lms.length === 0) return null;
  const [anchorKey, spec] = lms[0];
  const anchor = isl.anchors[anchorKey];
  const ledges = [0, 1, 2].map((k) => isl.anchors[`ledge${k}`]);
  const axisA = ledges[0]?.rotY ?? ctx.windDir;
  const axis = dirOf(axisA);
  const across = { x: -axis.z, z: axis.x };
  const top = heightAt(ctx.h, anchor.x, anchor.z);
  // the tower stands on the windward lip, over the sheer cliff (the boulevard gets the summit)
  const lh = { ...(windwardLip(ctx, isl, anchor, axis, top) ?? anchor), rotY: anchor.rotY };
  const levels = ledges.map((a) => (a ? heightAt(ctx.h, a.x, a.z) : NaN));
  const landing = isl.anchors.landing ?? lh;
  /** Facing away from the stack (fronts to the view, backs to the wall). */
  const outward = (p: XZ): number => {
    const f = unit(lh, p);
    return ang(f.x, f.z);
  };

  const plan = newPlan('lighthouse', lh);
  const lhIndex = pushLandmark(ctx, isl, spec.kind, lh, lh.rotY);
  plan.landmarks.push(lhIndex);
  const access = landmarkAccess(ctx, lhIndex, add(lh, axis, 10));
  const lots: number[] = [];

  // ---- Summit: the giant screen on the lee rim, the Ad Boulevard from the lighthouse to it
  const screen = placeScreen(ctx, isl, lh, axis, top);
  const end = screen
    ? add(screen.p, axis, -(P.screen.d / 2 + P.boulevard.end))
    : add(access, axis, P.boulevard.len[0]);
  if (screen) fixture(ctx, isl, 'giantScreen', screen.p, screen.rot, screen.sh, { pad: 1 });
  const L = dist(access, end);
  const u = unit(access, end);
  const mid = add(access, u, L / 2);
  const street = rectShape(mid.x, mid.z, ang(u.x, u.z), P.boulevard.width, L);
  addShape(ctx, isl, street, false);
  addPad(ctx, isl, street, FLATTEN.discMargin);
  paintZone(ctx, isl, street, Zone.path); // the red-carpet street (theme path tiles)
  plan.plaza = { x: mid.x, z: mid.z, r: P.quadR };
  seedHub(ctx, isl, plan, mid);
  plan.hub = mid;
  plan.links.push({ pin: access, kind: 'path', done: () => undefined });

  // frontage: left / right of the walk, items in street order, a banner pole where one won't fit
  const nrm = { x: -u.z, z: u.x };
  const W2 = P.boulevard.width / 2;
  const front = (item: string, c: XZ, sd: XZ): boolean => {
    const rot = ang(-sd.x, -sd.z);
    if (OFFICE_DEFS[item]) {
      const [w, d] = LOT_FOOTPRINT[item];
      const p = add(c, sd, W2 + VILLAGE.lotGap + 0.2 + d / 2);
      if (!onSummit(ctx, isl, rectShape(p.x, p.z, rot, w, d), top)) return false;
      const li = tryLot(ctx, isl, item, p, rot, sIdx, { minShore: 1.5, maxRelief: 2.5 });
      if (li >= 0) lots.push(li);
      return li >= 0;
    }
    const [defId, w, d, variant] =
      item === 'cafe'
        ? ['fairBooth', P.cafe.w, P.cafe.d, 1]
        : item === 'billboardV2'
          ? ['billboardV2', P.billboard.w, P.billboard.d, 0]
          : ['bannerPole', 0, 0.5, 0];
    const p = add(c, sd, W2 + 1.1 + d / 2);
    const sh = w > 0 ? rectShape(p.x, p.z, rot, w, d) : discShape(p.x, p.z, d);
    if (!onSummit(ctx, isl, sh, top) || !clear(ctx, isl, sh, w > 0 ? 0.8 : 0.3)) return false;
    fixture(ctx, isl, defId, p, rot, sh, { pad: w > 0 ? FLATTEN.discMargin : undefined, variant });
    return true;
  };
  for (const [side, list] of [
    [1, P.frontage.left],
    [-1, P.frontage.right],
  ] as const) {
    const queue: string[] = [...list];
    const sd = { x: nrm.x * side, z: nrm.z * side };
    for (let s = P.boulevard.start + P.boulevard.slot / 2; s < L - 1.5 && queue.length;) {
      const c = add(access, u, s);
      if (front(queue[0], c, sd)) {
        queue.shift();
        s += P.boulevard.slot;
      } else {
        front('bannerPole', c, sd);
        s += P.boulevard.slot / 2;
      }
    }
  }

  // ---- the fair ground disc on the low shelf (it doubles as that shelf's stair hub)
  const F = P.fair;
  let fair: Spot | null = null;
  for (const r of [F.r, F.rMin])
    if (!fair && ledges[2] && Number.isFinite(levels[2]))
      fair = shelfSpot(
        ctx,
        isl,
        ledges[2],
        F.search,
        levels[2],
        (p) => ({ rot: 0, sh: discShape(p.x, p.z, r) }),
        { gap: 1.5, tol: F.maxRelief },
      );
  const FR = fair ? fair.sh.r : F.r;
  if (fair) {
    addShape(ctx, isl, { ...discShape(fair.p.x, fair.p.z, FR + 0.5), tag: 'plaza' }, false);
    addPad(ctx, isl, fair.sh, FLATTEN.discMargin);
    paintZone(ctx, isl, fair.sh, Zone.plaza);
  }
  // ---- stair hubs on the other shelves (kept clear for the switchbacks between them)
  const hubs: (XZ | null)[] = ledges.map((a, k) => {
    if (k === 2 && fair) return fair.p;
    if (!a || !Number.isFinite(levels[k])) return null;
    const s = shelfSpot(
      ctx,
      isl,
      a,
      P.hub.search,
      levels[k],
      (p) => ({ rot: 0, sh: discShape(p.x, p.z, P.hub.r) }),
      { extra: (p) => 0.04 * dist(p, end) },
    );
    if (!s) return null;
    addShape(ctx, isl, discShape(s.p.x, s.p.z, P.hub.clear), false);
    return s.p;
  });

  // ---- Media campus on the upper / middle ledges
  const lateral = (a: XZ, side: number, t: number): XZ => add(a, across, side * t);
  const sideOfLanding =
    (landing.x - (ledges[0]?.x ?? lh.x)) * across.x +
      (landing.z - (ledges[0]?.z ?? lh.z)) * across.z >
    0
      ? 1
      : -1;
  const place = (
    defId: string,
    k: number,
    near: XZ,
    w: number,
    d: number,
    search: number,
    variant?: number,
  ): boolean => {
    if (!Number.isFinite(levels[k])) return false;
    let s: Spot | null = null;
    // fronts to the view; on a tight ledge sideways (front along the shelf)
    for (const turn of w > 0 ? [0, Math.PI / 2, -Math.PI / 2] : [0])
      s ??= shelfSpot(
        ctx,
        isl,
        near,
        search,
        levels[k],
        (p) => {
          const rot = outward(p) + turn;
          return { rot, sh: w > 0 ? rectShape(p.x, p.z, rot, w, d) : discShape(p.x, p.z, d) };
        },
        { gap: 1.2 },
      );
    if (!s) return false;
    fixture(ctx, isl, defId, s.p, s.rot, s.sh, { pad: FLATTEN.discMargin, variant });
    return true;
  };
  // the antenna tower on the upper ledge, away from the cove side; the first layered office on
  // whichever ledge holds it (they are the campus' T0 read), then the desks, then the rest
  if (ledges[0])
    place(
      'antennaTower',
      0,
      lateral(ledges[0], -sideOfLanding, 6),
      0,
      P.antenna.r,
      P.antenna.search,
    );
  const office = (k: number, side: number): boolean =>
    !!ledges[k] &&
    place('mediaOffice', k, lateral(ledges[k], side, 8), P.office.w, P.office.d, P.office.search);
  const nOffices = rng.fork('offices').int(P.office.count[0], P.office.count[1]);
  let offices = office(0, sideOfLanding) || office(1, sideOfLanding) ? 1 : 0;
  // broadcast studio lots on the ledges (the campus desks), doors toward the shelf's stair hub
  const nLedgeLots = rng.fork('lots').int(P.ledgeLots[0], P.ledgeLots[1]);
  const [lw, ld] = LOT_FOOTPRINT.broadcastStudio;
  for (let o = 0; o < nLedgeLots; o++) {
    const k = o % 2;
    const a = ledges[k];
    const hub = hubs[k];
    if (!a || !hub || !Number.isFinite(levels[k])) continue;
    const s = shelfSpot(
      ctx,
      isl,
      lateral(a, o === 0 ? -sideOfLanding : sideOfLanding, 4),
      P.office.search,
      levels[k],
      (p) => {
        const f = unit(p, hub);
        const rot = ang(f.x, f.z);
        return { rot, sh: rectShape(p.x, p.z, rot, lw, ld) };
      },
      {
        gap: VILLAGE.lotGap,
        grow: P.lotGrow,
        extra: (p) => {
          const door = add(p, unit(p, hub), ld / 2 + 1);
          const ok = onShelf(ctx, isl, discShape(door.x, door.z, 0.6), levels[k], P.shelfTol);
          return ok ? 0.03 * dist(p, hub) : Infinity;
        },
      },
    );
    if (!s) continue;
    const li = tryLot(ctx, isl, 'broadcastStudio', s.p, s.rot, sIdx, {
      minShore: P.shelfMinShore,
      maxRelief: 2,
    });
    if (li >= 0) lots.push(li);
  }
  // the photo studio and the print shop (middle ledge, else the upper one), then more offices
  for (const [v, side, t] of [
    [0, -sideOfLanding, 10],
    [1, sideOfLanding, 14],
  ] as const)
    for (const k of [1, 0])
      if (
        ledges[k] &&
        place('mediaShop', k, lateral(ledges[k], side, t), P.shop.w, P.shop.d, P.shop.search, v)
      )
        break;
  for (let o = 1; o < nOffices + 1 && offices < nOffices; o++)
    if (office(o % 2, o < 2 ? -sideOfLanding : sideOfLanding)) offices++;
  // ---- Fair ground: ferris wheel at the back, stage facing the centre, tents and booths round it
  if (fair) {
    const C = fair.p;
    const lv = heightAt(ctx.h, C.x, C.z);
    const facing = (p: XZ): number => {
      const f = unit(p, C);
      return ang(f.x, f.z);
    };
    /** Keep a spot about `r` u from the fair centre (the shelf is a band: the ring bends with it). */
    const around = (r: number) => (p: XZ) => 0.4 * Math.abs(dist(p, C) - r);
    // ferris wheel just off the paving, its plane broadside to the view (normal = outward)
    const Wh = P.wheel;
    let wheel: Spot | null = null;
    for (const turn of [0, Math.PI / 2])
      wheel ??= shelfSpot(
        ctx,
        isl,
        C,
        F.search + 8,
        lv,
        (p) => {
          const rot = outward(p) + turn;
          return { rot, sh: rectShape(p.x, p.z, rot, Wh.w, Wh.d) };
        },
        { gap: Wh.gap, extra: around(FR + Wh.d / 2 + Wh.gap) },
      );
    if (wheel)
      fixture(ctx, isl, 'ferrisWheel', wheel.p, wheel.rot, wheel.sh, { pad: FLATTEN.discMargin });
    // stage on the rim facing the centre, away from the wheel
    const S = P.stage;
    const st = shelfSpot(
      ctx,
      isl,
      C,
      F.search + 8,
      lv,
      (p) => {
        const rot = facing(p);
        return { rot, sh: rectShape(p.x, p.z, rot, S.w, S.d) };
      },
      {
        gap: S.gap,
        tol: S.maxRelief,
        inPlaza: true,
        extra: (p) =>
          around(FR + S.d / 2 - 1)(p) + (wheel ? 0.3 * Math.max(0, 12 - dist(p, wheel.p)) : 0),
      },
    );
    if (st) fixture(ctx, isl, 'stage', st.p, st.rot, st.sh, { pad: FLATTEN.discMargin });
    const a0 = st ? Math.atan2(C.z - st.p.z, C.x - st.p.x) : 0;
    // striped tents half on the paving rim, spaced round it
    const fr = rng.fork('fair');
    const nTents = fr.int(P.tent.count[0], P.tent.count[1]);
    for (let t = 0; t < nTents; t++) {
      const tent = shelfSpot(
        ctx,
        isl,
        C,
        F.search + 8,
        lv,
        (p) => ({ rot: facing(p), sh: discShape(p.x, p.z, P.tent.r) }),
        {
          gap: P.tent.gap,
          inPlaza: true,
          extra: (p) => (dist(p, C) < FR + 0.6 ? Infinity : around(FR + 1.2)(p)),
        },
      );
      if (!tent) break;
      fixture(ctx, isl, 'fairTent', tent.p, tent.rot, tent.sh, { pad: FLATTEN.discMargin });
    }
    // the midway: game booths back to back round the fair centre, counters out to the tents
    const ringAt = (r: number, a: number): XZ => add(C, dirOf(a), r);
    const nBooths = fr.int(P.booth.count[0], P.booth.count[1]);
    for (let k = 0, placed = 0; k < P.booth.slots && placed < nBooths; k++) {
      const a = a0 + Math.PI / P.booth.slots + (k / P.booth.slots) * TAU;
      const p = ringAt(P.booth.ring, a);
      const sh = rectShape(p.x, p.z, a, P.booth.w, P.booth.d);
      if (!onShelf(ctx, isl, sh, lv, P.shelfTol) || !clear(ctx, isl, sh, 0.4, true)) continue;
      fixture(ctx, isl, 'fairBooth', p, a, sh, { block: false, variant: 0 });
      placed++;
    }
    // banner poles on the fair edge
    for (const da of P.bannerPoles) {
      const a = a0 + Math.PI + da * DEG;
      const p = ringAt(FR + 0.6, a);
      const sh = discShape(p.x, p.z, 0.5);
      if (!onLand(ctx, isl, sh, 1) || !clear(ctx, isl, sh, 0.3, true)) continue;
      fixture(ctx, isl, 'bannerPole', p, a + Math.PI, sh, { variant: 0 });
    }
  }

  // ---- Landing: the cove pier, its kiosk; stairs between the shelves (top-down), then lots
  const site = findDock(ctx, isl, {
    near: landing,
    maxDist: P.dockSearch,
    prefer: landing,
    carve: true,
  });
  dockWithLink(ctx, isl, plan, site, rng.fork('moorings'), { rowboats: 1, sailboats: 0 }, 'stair');
  const dockLink = site ? (plan.links.pop() as LinkReq) : null;
  if (site) placeKiosk(ctx, isl, site.root);
  let upper = mid;
  for (const h of hubs) {
    if (!h) continue;
    plan.links.push({
      pin: h,
      kind: 'stair',
      corridor: { a: h, b: upper, half: 7 },
      done: () => undefined,
    });
    upper = h;
  }
  if (dockLink && site) {
    dockLink.corridor = { a: site.root, b: upper, half: 7 };
    plan.links.push(dockLink);
  }
  lots.sort((a, b) => dist(ctx.lots[a], mid) - dist(ctx.lots[b], mid));
  for (const li of lots) linkLot(ctx, plan, li);

  // ad buoys (the buoy layout, recoloured)
  const f0 = ctx.fixtures.length;
  placeBuoys(ctx, isl, rng.fork('buoys'));
  for (let k = f0; k < ctx.fixtures.length; k++) ctx.fixtures[k].defId = 'adBuoy';
  return plan;
};
