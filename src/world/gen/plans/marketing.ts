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
 * - Landing: the cove pier + megaphone kiosk; ad buoys in the lee water;
 * - the Carnival Broadcasters culture (M19 TASK-423, `carnival`): the mascot crab and the SHOW
 *   sign at the fair entrance, confetti cannons and searchlights at the stage, popcorn carts, prize
 *   booths and balloon masts round the fair (the launch mast is a story spot), LIVE / NEW signs on
 *   the Ad Boulevard, a selfie deck by the Broadcast Tower, poster rolls at the print shop and
 *   megaphone stands at the media offices, plus the story spots.
 * - M22 quick wins (TASK-481, `quickWins`): the carnival gate across the pier mouth, marquee bulb
 *   strings over the boulevard, a transmitter on every sea stack, the lit ad-buoy chain at the bay
 *   mouth, the party pontoon, and the straight red-carpet boulevard (district kind 'carpet').
 * Stairs climb the earth walls between the shelves (stair links hub → hub, in switchbacks).
 * Random draws come from labelled forks of `rng`; tuning lives in MARKETING_PLAN.
 */
import { MARKETING_CULTURE_SITES as CS } from '../../../content/cultures/marketing.ts';
import {
  DOCK,
  FIXTURE_RADIUS,
  FLATTEN,
  LOT_FOOTPRINT,
  VILLAGE,
} from '../../../content/settlements.ts';
import { OFFICE_DEFS } from '../../../content/offices.ts';
import { MARKETING_PLAN as P, MARKETING_QUICK as Q } from '../../../content/themes/marketing.ts';
import { THEMES } from '../../../content/themes/index.ts';
import type { Rng } from '../../../core/rng.ts';
import { THEME_IDS, Zone, type IslandData, type StorySpot, type XZ } from '../../types.ts';
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
  sdfAt,
  segDist,
  seedHub,
  shapeCorners,
  shapesOverlap,
  shapeDist,
  siteFree,
  tryLot,
  unit,
  type DockSite,
  type LinkReq,
  type Shape,
  type SiteCtx,
} from '../sites.ts';
import { reserveBeaconAnchors } from './marketing-anchors.ts';
import { placeBeaconKit } from './marketing-m27.ts';
import type { ThemePlanner } from './types.ts';

const TAU = Math.PI * 2;
const xz = (p: XZ): [number, number] => [p.x, p.z];
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
  // M7 (TASK-481): the terrain shader lays a crisp straight carpet over this rectangle
  plan.districts.push({
    islandId: isl.id,
    kind: 'carpet',
    x: mid.x,
    z: mid.z,
    rotY: ang(u.x, u.z),
    w: P.boulevard.width,
    d: L,
  });
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
  // ---- Carnival Broadcasters culture (M19 TASK-423): before the links, so the paths route round it
  plan.stories = carnival(ctx, isl, rng.fork('culture'), {
    fair: fair ? { c: fair.p, r: FR, level: heightAt(ctx.h, fair.p.x, fair.p.z) } : null,
    entry: site?.root ?? landing,
    lh,
    summit: anchor,
    top,
    levels,
    ledge0: ledges[0] ?? null,
    street: { a: access, u, len: L },
  });
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
  // ---- M22 quick wins (TASK-481): after everything else, from their own forks, so the rest of
  // the plan keeps its layout
  quickWins(ctx, isl, rng.fork('quick'), { site, street: { a: access, u, len: L } });
  // ---- M27 anchors (TASK-516): late, on the final ground (pads levelled, paths carved), so every
  // piece above keeps its place and the cliff / stack faces are the ones rendered
  plan.finish = (paths) => {
    reserveBeaconAnchors(ctx, isl, lh, heightAt(ctx.h, lh.x, lh.z), paths);
    // M27 kit on the anchors (TASK-518)
    placeBeaconKit(ctx, isl);
  };
  return plan;
};

interface QuickSite {
  /** The landing pier (null: no dock found). */
  site: DockSite | null;
  /** The Ad Boulevard: from `a` along `u` for `len` u. */
  street: { a: XZ; u: XZ; len: number };
}

/**
 * Marketing quick wins (M22 TASK-481): carnival gate, marquee bulb strings, sea-stack
 * transmitters, the lit ad-buoy chain and the party pontoon. Every number is MARKETING_QUICK;
 * every draw comes from a sub-fork of `rng`; a piece that finds no room is skipped.
 */
function quickWins(ctx: SiteCtx, isl: IslandData, rng: Rng, s: QuickSite): void {
  const push = (defId: string, p: XZ, rotY: number, variant: number): void => {
    ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id, variant });
  };
  const waterOk = (p: XZ, depth: number, shore: number): boolean =>
    heightAt(ctx.h, p.x, p.z) <= -depth && sdfAt(ctx, p.x, p.z) <= -shore;

  // ---- M11 carnival gate: the HQ `cultureGate` (Marketing variant) over the way in from the pier
  const G = Q.gate;
  if (s.site) {
    const { root, dir } = s.site;
    const perp = { x: -dir.z, z: dir.x };
    const rot = ang(dir.x, dir.z);
    const variant = THEME_IDS.indexOf('marketing');
    gate: for (let t = G.inland[0]; t <= G.inland[1] + 1e-6; t += G.step)
      for (const off of G.lateral) {
        const p = add(add(root, dir, -t), perp, off);
        const sh = rectShape(p.x, p.z, rot, G.w, G.d);
        if (!onLand(ctx, isl, sh, P.shelfMinShore) || relief(ctx, sh) > G.relief) continue;
        // planned lanes and the fair paving may run through it, only obstacles keep it out
        if (
          ctx.shapes[isl.id].some((o) => o.tag !== 'plaza' && shapesOverlap(o, sh, 0.3)) ||
          !siteFree(ctx, isl, sh)
        )
          continue;
        // walkable (block: false: the way runs through it); the pad levels the foot of both posts
        fixture(ctx, isl, 'cultureGate', p, rot, sh, {
          block: false,
          pad: FLATTEN.discMargin,
          variant,
        });
        break gate;
      }
  }

  // ---- M5 marquee bulb strings across the boulevard (bunting v4)
  const B = Q.bulbString;
  {
    const { a, u, len } = s.street;
    const br = rng.fork('bulbs');
    const rot = ang(u.x, u.z);
    const nrm = { x: -u.z, z: u.x };
    const want = br.int(B.count[0], B.count[1]);
    const lo = B.edge;
    const hi = len - B.edge;
    const taken: number[] = [];
    for (let k = 0; k < want; k++) {
      const target = lo + ((hi - lo) * (k + 0.5)) / want;
      for (const d of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2, -2]) {
        const t = target + d;
        if (t < lo || t > hi || taken.some((o) => Math.abs(o - t) < B.spacing)) continue;
        if (Math.abs(t - len / 2) < B.hub) continue;
        const c = add(a, u, t);
        const feet = [1, -1].map((sd) => discShape(...xz(add(c, nrm, sd * B.poleX)), B.pole));
        if (feet.some((f) => !onLand(ctx, isl, f, 1, 0.1) || !clear(ctx, isl, f, 0.15, true)))
          continue;
        push('bunting', c, rot, B.variant);
        for (const f of feet) addShape(ctx, isl, f, true);
        taken.push(t);
        break;
      }
    }
  }

  // ---- M2 transmitters: the highest cell on each windward sea stack takes a mast
  const T = Q.transmitter;
  const tr = rng.fork('transmitters');
  for (let k = 0; isl.anchors[`stack${k}`]; k++) {
    const an = isl.anchors[`stack${k}`];
    let best: XZ | null = null;
    let bestH: number = T.minRise;
    for (let dz = -T.search; dz <= T.search + 1e-6; dz += 0.5)
      for (let dx = -T.search; dx <= T.search + 1e-6; dx += 0.5) {
        if (dx * dx + dz * dz > T.search * T.search) continue;
        const p = { x: an.x + dx, z: an.z + dz };
        const h = heightAt(ctx.h, p.x, p.z);
        if (h > bestH + 1e-6) {
          best = p;
          bestH = h;
        }
      }
    const rot = tr.fork('rot', k).range(0, TAU);
    if (best)
      fixture(ctx, isl, 'antennaTower', best, rot, discShape(best.x, best.z, 1.1), {
        variant: T.variant,
      });
  }

  // ---- M17 lit ad-buoy chain across the bay mouth, M8 party pontoon beside the pier
  if (!s.site) return;
  const { root, dir, segments } = s.site;
  const perp = { x: -dir.z, z: dir.x };
  const end = add(root, dir, segments * DOCK.segment);
  const C = Q.buoyChain;
  {
    let bestRun: XZ[] = [];
    search: for (let beyond = C.beyond[0]; beyond <= C.beyond[1] + 1e-6; beyond += 1.5)
      for (const shift of [0, 3, -3, 6, -6]) {
        const c = add(add(end, dir, beyond), perp, shift);
        const pts: XZ[] = [];
        for (let j = 0; j < C.count; j++)
          pts.push(add(c, perp, (j - (C.count - 1) / 2) * C.spacing));
        let run: XZ[] = [];
        let longest: XZ[] = [];
        for (const p of pts) {
          if (waterOk(p, C.minDepth, C.minShore) && clear(ctx, isl, discShape(p.x, p.z, 0.6), 0.8))
            run = [...run, p];
          else run = [];
          if (run.length > longest.length) longest = run;
        }
        if (longest.length > bestRun.length) bestRun = longest;
        if (bestRun.length === C.count) break search;
      }
    if (bestRun.length >= 3) {
      const rot = ang(perp.x, perp.z);
      bestRun.forEach((p, j) => {
        const last = j === bestRun.length - 1;
        const v = last ? C.end : C.variants[j % C.variants.length];
        fixture(ctx, isl, 'adBuoy', p, rot, discShape(p.x, p.z, 0.5), { variant: v });
      });
    }
  }
  const O = Q.pontoon;
  {
    const rot = ang(dir.x, dir.z);
    let best: { p: XZ; score: number } | null = null;
    for (const side of [1, -1])
      for (let along = O.along[0]; along <= O.along[1] + 1e-6; along += 1.5)
        for (let off = O.off[0]; off <= O.off[1] + 1e-6; off += 1) {
          const p = add(add(root, dir, along), perp, side * off);
          const sh = rectShape(p.x, p.z, rot, O.w, O.l);
          if (!waterOk(p, O.minDepth, O.minShore)) continue;
          if (shapeCorners(sh).some((q) => heightAt(ctx.h, q.x, q.z) > -O.minDepth)) continue;
          if (!clear(ctx, isl, sh, 1.2)) continue;
          const score = off + 0.25 * Math.abs(along - 14);
          if (!best || score < best.score) best = { p, score };
        }
    if (best)
      fixture(ctx, isl, 'sailboat', best.p, rot, rectShape(best.p.x, best.p.z, rot, O.w, O.l), {
        variant: O.variant,
      });
  }
}

interface CarnivalSite {
  /** The fair paving disc (centre, radius, shelf level). */
  fair: { c: XZ; r: number; level: number } | null;
  /** Where arrivals come from: the pier root (else the landing anchor). */
  entry: XZ;
  /** Broadcast Tower foot, the summit anchor and its height. */
  lh: XZ;
  summit: XZ;
  top: number;
  levels: readonly number[];
  ledge0: XZ | null;
  /** Ad Boulevard: from `a` along `u` for `len` u. */
  street: { a: XZ; u: XZ; len: number };
}

type Cand = { p: XZ; rot: number };

/** Candidates on rings round `c` (radii × angles from `phase`), facing `face(p)`. */
function ringCands(
  c: XZ,
  radii: readonly number[],
  n: number,
  phase: number,
  face: (p: XZ) => number,
): Cand[] {
  const out: Cand[] = [];
  for (const r of radii)
    for (let k = 0; k < n; k++) {
      const p = add(c, dirOf(phase + (k / n) * TAU), r);
      out.push({ p, rot: face(p) });
    }
  return out;
}

/** Candidates on a grid round `c` (within `radius`, `step` apart), nearest first. */
function nearCands(c: XZ, radius: number, step: number, rot: number): Cand[] {
  const out: Cand[] = [];
  for (let dz = -radius; dz <= radius + 1e-6; dz += step)
    for (let dx = -radius; dx <= radius + 1e-6; dx += step)
      if (dx * dx + dz * dz <= radius * radius + 1e-6)
        out.push({ p: { x: c.x + dx, z: c.z + dz }, rot });
  return out.sort((a, b) => dist(a.p, c) - dist(b.p, c));
}

/** Candidates farthest from `others` first. */
function spreadFrom(cands: Cand[], others: readonly XZ[]): Cand[] {
  if (!others.length) return cands;
  return cands
    .map((c) => ({ c, d: Math.min(...others.map((o) => dist(o, c.p))) }))
    .sort((a, b) => b.d - a.d)
    .map((x) => x.c);
}

const toward = (from: XZ, to: XZ): number => {
  const f = unit(from, to);
  return ang(f.x, f.z);
};

/** Smallest angle between two bearings. */
const angGap = (a: number, b: number): number =>
  Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/**
 * Carnival Broadcasters (M19 TASK-423, ISLAND_CULTURES §2.4): the culture kit round the fair, the
 * stage, the boulevard, the summit and the media campus, plus its story spots. Every number is
 * MARKETING_CULTURE_SITES; every draw comes from a sub-fork of `rng`.
 */
function carnival(ctx: SiteCtx, isl: IslandData, rng: Rng, s: CarnivalSite): StorySpot[] {
  const stories: StorySpot[] = [];
  const story = (kind: string, p: XZ, rotY: number, defs: readonly string[]): void => {
    stories.push({ kind, islandId: isl.id, pos: { x: p.x, y: 0, z: p.z }, rotY, defs });
  };
  const rects: Readonly<Record<string, readonly [number, number]>> = CS.rect;
  const shapeOf = (defId: string, p: XZ, rot: number): Shape =>
    rects[defId]
      ? rectShape(p.x, p.z, rot, rects[defId][0], rects[defId][1])
      : discShape(p.x, p.z, FIXTURE_RADIUS[defId]);
  /** This island's fixtures of `defId` placed so far (the theme plan's own pieces). */
  const fixturesOf = (defId: string) =>
    ctx.fixtures.filter((f) => f.islandId === isl.id && f.defId === defId);
  /**
   * Place `defId` at the first candidate whose footprint fits: on the shelf `level` (`level` NaN:
   * on the summit plateau; −Infinity: any land with relief ≤ `tol`), clear of every obstacle by
   * `gap`; with a flatten pad.
   */
  const placeFirst = (
    defId: string,
    cands: readonly Cand[],
    level: number,
    variant: number,
    o: { gap?: number; inPlaza?: boolean; tol?: number; ok?: (sh: Shape) => boolean } = {},
  ): Cand | null => {
    for (const c of cands) {
      const sh = shapeOf(defId, c.p, c.rot);
      const ground = Number.isNaN(level)
        ? onSummit(ctx, isl, sh, s.top)
        : level === -Infinity
          ? onLand(ctx, isl, sh, P.shelfMinShore) && relief(ctx, sh) <= (o.tol ?? 1)
          : onShelf(ctx, isl, sh, level, o.tol ?? P.shelfTol);
      if (!ground || !clear(ctx, isl, sh, o.gap ?? 0.4, o.inPlaza)) continue;
      // the ground round the footprint is nearly level already: the pad then flattens it whole
      // (a pad leaves the shelf walls alone, so a footprint against one would keep a slope)
      const g = CS.level.grow;
      const grown =
        sh.r > 0 ? discShape(sh.x, sh.z, sh.r + g) : { ...sh, hw: sh.hw + g, hd: sh.hd + g };
      if (relief(ctx, grown) > CS.level.relief) continue;
      if (!siteFree(ctx, isl, sh) || (o.ok && !o.ok(sh))) continue;
      fixture(ctx, isl, defId, c.p, c.rot, sh, { pad: FLATTEN.discMargin, variant });
      return c;
    }
    return null;
  };

  // ---- the fair: entrance pair, stage dressing, popcorn, prize booths, balloon masts
  let mascot: Cand | null = null;
  const F = s.fair;
  if (F) {
    const { c: C, r: FR, level: lv } = F;
    const towardC = (p: XZ): number => toward(p, C);
    /** Fallback spots: anywhere `r0`–`r1` u from the fair centre on a 1 u grid, nearest first. */
    const around = (r0: number, r1: number): Cand[] =>
      nearCands(C, r1, 1, 0)
        .filter((c) => dist(c.p, C) >= r0)
        .map((c) => ({ p: c.p, rot: towardC(c.p) }));
    /** On the fair shelf, else on levelled land (beach, shelf foot) by the fair. */
    const shelfOrLand = (defId: string, cands: Cand[], variant: number, gap: number): Cand | null =>
      placeFirst(defId, cands, lv, variant, { inPlaza: true, gap }) ??
      placeFirst(defId, cands, -Infinity, variant, { inPlaza: true, gap, tol: CS.fallbackRelief });
    const FB = CS.fallback;
    const e = unit(C, s.entry);
    const perp = { x: -e.z, z: e.x };
    const E = CS.entrance;
    // the way in (pier root → fair centre) stays open
    const offWay = (sh: Shape): boolean =>
      samples(sh).every((q) => segDist(q, s.entry, C) >= E.keep);
    const side = rng.fork('entrance').chance(0.5) ? 1 : -1;
    const faceOut = ang(e.x, e.z); // fronts toward the arrivals
    // beside the way, nearest the fair first, the preferred side first at each step
    const wayLen = dist(C, s.entry);
    const flankCands = (out: number, half: number, k: number): Cand[] => {
      const cands: Cand[] = [];
      for (let t = FR + out; t <= Math.max(FR + out, wayLen - 1); t += E.step)
        for (const sd of [k, -k])
          for (let off = E.keep + half; off <= E.keep + half + E.search; off += E.step)
            cands.push({ p: add(add(C, e, t), perp, sd * off), rot: faceOut });
      return cands;
    };
    /** On the fair shelf; else on the ramp down to the pier (levelled by its pad). */
    const atEntrance = (defId: string, cands: Cand[], variant: number, gap: number): Cand | null =>
      placeFirst(defId, cands, lv, variant, { inPlaza: true, gap, ok: offWay }) ??
      placeFirst(defId, cands, -Infinity, variant, { inPlaza: true, gap, ok: offWay });
    // (fronts along the way: the width axis is across it)
    const mHalf = FIXTURE_RADIUS.mascotStatue;
    mascot = atEntrance('mascotStatue', flankCands(E.mascotOut, mHalf, side), 0, 0.4);
    const sHalf = CS.rect.marqueeSign[0] / 2;
    atEntrance('marqueeSign', flankCands(E.signOut, sHalf, -side), CS.marquee.show, 0.3);

    // stage: confetti cannons at its front corners (one mid-blast), the searchlights behind it
    const stage = fixturesOf('stage')[0];
    if (stage) {
      const fwd = dirOf(stage.rotY);
      const sd = { x: -fwd.z, z: fwd.x };
      const K = CS.confetti;
      for (const k of [-1, 1]) {
        const cands: Cand[] = [];
        // beside the stage's front corner, then out in front of it (toward the crowd)
        for (const df of K.along)
          for (const ds of K.out)
            cands.push({
              p: add(
                add(stage, sd, k * (P.stage.w / 2 + K.side + ds)),
                fwd,
                P.stage.d / 2 - K.back + df,
              ),
              rot: stage.rotY + k * K.splay,
            });
        placeFirst('confettiCannon', cands, lv, k === K.blastSide ? 1 : 0, {
          inPlaza: true,
          gap: 0.3,
        });
      }
      const L = CS.searchlight;
      const back: Cand[] = [];
      for (const db of [0, 0.8, 1.6])
        for (const ds of [0, 1.5, -1.5, 3, -3])
          back.push({
            p: add(add(stage, fwd, -(P.stage.d / 2 + L.back + db)), sd, ds),
            rot: stage.rotY,
          });
      for (const k of [1, -1])
        for (const df of [0, -1.2])
          back.push({
            p: add(add(stage, sd, k * (P.stage.w / 2 + 2.0)), fwd, df),
            rot: stage.rotY,
          });
      if (!placeFirst('searchlightPair', back, lv, L.variant, { inPlaza: true, gap: 0.4 }))
        shelfOrLand('searchlightPair', around(FR, FR + FB.searchlight), L.variant, FB.gap);
    }

    // popcorn carts on the paving rim, spread round it
    const pr = rng.fork('popcorn');
    const PC = CS.popcorn;
    const nPop = pr.int(PC.count[0], PC.count[1]);
    const popAt: XZ[] = [];
    for (let k = 0; k < nPop; k++) {
      const radii = PC.radii.map((d) => FR + d);
      const cands = spreadFrom(ringCands(C, radii, PC.angles, pr.range(0, TAU), towardC), popAt);
      const got =
        placeFirst('popcornCart', cands, lv, k % 2, { inPlaza: true, gap: 0.4 }) ??
        shelfOrLand('popcornCart', spreadFrom(around(0, FR + FB.popcorn), popAt), k % 2, FB.gap);
      if (!got) break;
      popAt.push(got.p);
    }
    if (popAt.length) story('popcornGulls', popAt[0], towardC(popAt[0]), ['popcornCart']);

    // prize booths outside the rim: the first holds the giant plush duck
    const zr = rng.fork('prize');
    const PZ = CS.prize;
    const nPrize = zr.int(PZ.count[0], PZ.count[1]);
    const prizeAt: XZ[] = [];
    for (let k = 0; k < nPrize; k++) {
      const radii = PZ.radii.map((d) => FR + d);
      const cands = spreadFrom(ringCands(C, radii, PZ.angles, zr.range(0, TAU), towardC), [
        ...popAt,
        ...prizeAt,
      ]);
      const v = k === 0 ? 1 : 0;
      const got =
        placeFirst('prizeBooth', cands, lv, v, { inPlaza: true, gap: 0.5 }) ??
        shelfOrLand(
          'prizeBooth',
          spreadFrom(around(FR + 1, FR + FB.prize), [...popAt, ...prizeAt]),
          v,
          FB.gap,
        );
      if (!got) break;
      if (k === 0) story('giftDuck', got.p, got.rot, ['prizeBooth']);
      prizeAt.push(got.p);
    }

    // balloon masts round the fair edge, away from the stage and from each other
    const br = rng.fork('masts');
    const M = CS.masts;
    const nMasts = br.int(M.count[0], M.count[1]);
    const avoid: number[] = stage ? [Math.atan2(stage.z - C.z, stage.x - C.x)] : [];
    const radii: number[] = [];
    for (let r = M.ring[0]; r <= M.ring[1] + 1e-6; r += 1) radii.push(FR + r);
    const phase = br.range(0, TAU);
    const bearing = (p: XZ): number => Math.atan2(p.z - C.z, p.x - C.x);
    for (let k = 0; k < nMasts; k++) {
      const spreadOut = (cands: Cand[]): Cand[] =>
        cands
          .map((c) => ({ c, g: Math.min(Math.PI, ...avoid.map((b) => angGap(bearing(c.p), b))) }))
          .sort((x, y) => y.g - x.g || dist(x.c.p, C) - dist(y.c.p, C))
          .map((x) => x.c);
      const v = k === 0 ? 0 : 1;
      const got =
        placeFirst('balloonMast', spreadOut(ringCands(C, radii, M.angles, phase, towardC)), lv, v, {
          gap: M.gap,
          inPlaza: true,
        }) ?? shelfOrLand('balloonMast', spreadOut(around(FR + 1, FR + FB.masts)), v, FB.gap);
      if (!got) break;
      avoid.push(bearing(got.p));
      if (k === 0) story('balloonLaunch', got.p, got.rot, ['balloonMast']);
    }

    // no room at the entrance: the mascot greets from the fair shelf, nearest the way in
    const eb = Math.atan2(e.z, e.x);
    const fr: number[] = [];
    for (let r = CS.mascotRing[0]; r <= CS.mascotRing[1]; r++) fr.push(FR + r);
    mascot ??= placeFirst(
      'mascotStatue',
      ringCands(C, fr, 24, eb, (p) => toward(C, p))
        .map((c) => ({ c, g: angGap(Math.atan2(c.p.z - C.z, c.p.x - C.x), eb) }))
        .sort((x, y) => x.g - y.g || dist(x.c.p, C) - dist(y.c.p, C))
        .map((x) => x.c),
      lv,
      0,
      { inPlaza: true, ok: offWay },
    );
  }

  // ---- the ferris wheel operator asleep in his cabin; a balloon snagged on the antenna
  const wheel = fixturesOf('ferrisWheel')[0];
  if (wheel) story('wheelNap', wheel, wheel.rotY, ['ferrisWheel']);
  const antenna = fixturesOf('antennaTower')[0];
  if (antenna) story('snaggedBalloon', antenna, antenna.rotY, ['antennaTower']);

  // ---- Ad Boulevard: LIVE by the giant screen, NEW at the street start (fronts to the street)
  const { a: A, u: U, len } = s.street;
  const nrm = { x: -U.z, z: U.x };
  const edge = P.boulevard.width / 2 + CS.boulevard.edge;
  /** Spots `off` u from the street axis, both sides, from `from` to `to` u along it. */
  const streetCands = (from: number, to: number, off: number): Cand[] => {
    const out: Cand[] = [];
    const step = from < to ? 1 : -1;
    for (let t = from; step > 0 ? t <= to : t >= to; t += step)
      for (const sd of [1, -1]) {
        const d = { x: nrm.x * sd, z: nrm.z * sd };
        out.push({ p: add(add(A, U, t), d, off), rot: ang(-d.x, -d.z) });
      }
    return out;
  };
  placeFirst('marqueeSign', streetCands(len - 1, len / 2, edge), NaN, CS.marquee.live, {
    gap: 0.3,
  });
  placeFirst('marqueeSign', streetCands(1, len / 2, edge), NaN, CS.marquee.fresh, { gap: 0.3 });
  // no fair room at all: the mascot stands on the boulevard, facing the street
  const mEdge = P.boulevard.width / 2 + CS.boulevard.edge + FIXTURE_RADIUS.mascotStatue;
  mascot ??= placeFirst('mascotStatue', streetCands(1, len - 1, mEdge), NaN, 0, { gap: 0.4 });
  if (mascot) story('mascotWave', mascot.p, mascot.rot, ['mascotStatue']);

  // ---- the poster crew pasting a new slide on the first billboard: leaning boards beside it
  const bb = fixturesOf('billboardV2')[0];
  if (bb) {
    const fwd = dirOf(bb.rotY);
    const sd = { x: -fwd.z, z: fwd.x };
    const half = P.billboard.w / 2 + CS.crewBoards;
    const boards: Cand[] = [];
    // beside it on the frontage line, else tucked behind its ends
    for (const k of [1, -1]) boards.push({ p: add(bb, sd, k * half), rot: bb.rotY });
    for (const k of [1, -1])
      boards.push({
        p: add(add(bb, sd, k * (P.billboard.w / 2 - CS.crewBoards)), fwd, -P.billboard.d / 2 - 0.7),
        rot: bb.rotY + Math.PI,
      });
    placeFirst('posterRoll', boards, NaN, 2, { gap: 0.2 });
    story('posterCrew', add(bb, fwd, P.billboard.d / 2 + 0.8), bb.rotY, [
      'billboardV2',
      'posterRoll',
    ]);
  }

  // ---- media campus: poster rolls at the print shop (else the photo studio), megaphone stands
  // at the media office fronts
  const shop = fixturesOf('mediaShop').sort((x, y) => (y.variant ?? 0) - (x.variant ?? 0))[0];
  if (shop) {
    const PS = CS.posters;
    const fwd = dirOf(shop.rotY);
    const sd = { x: -fwd.z, z: fwd.x };
    const lvl = heightAt(ctx.h, shop.x, shop.z);
    const spots: Cand[] = [];
    for (const k of [1, -1])
      spots.push({
        p: add(add(shop, fwd, P.shop.d / 2 + PS.front), sd, k * (P.shop.w / 2 - PS.inset)),
        rot: shop.rotY + k * 0.4,
      });
    for (const df of [0, -P.shop.d / 2 + PS.inset])
      for (const k of [1, -1])
        spots.push({
          p: add(add(shop, sd, k * (P.shop.w / 2 + PS.side)), fwd, df),
          rot: shop.rotY,
        });
    let v = 0;
    for (const c of spots)
      if (v <= 2 && placeFirst('posterRoll', [c], lvl, v, { gap: 0.2, tol: 0.5 })) v++;
  }
  const MG = CS.megaphones;
  let megas = 0;
  for (const office of fixturesOf('mediaOffice')) {
    if (megas >= MG.max) break;
    const fwd = dirOf(office.rotY);
    const sd = { x: -fwd.z, z: fwd.x };
    const lvl = heightAt(ctx.h, office.x, office.z);
    const cands = [1, -1].map((k) => ({
      p: add(add(office, fwd, P.office.d / 2 + MG.front), sd, k * (P.office.w / 2 - MG.inset)),
      rot: office.rotY + k * 0.5,
    }));
    if (placeFirst('megaphoneStand', cands, lvl, megas % 2, { gap: 0.2, tol: 0.5 })) megas++;
  }

  // ---- selfie deck by the Broadcast Tower, its back to the sea (else on the upper ledge's rim)
  const SF = CS.selfie;
  const byEdge = (cands: Cand[], maxShore: number = SF.maxShore): Cand[] =>
    cands
      .map((c) => ({ c, d: sdfAt(ctx, c.p.x, c.p.z) }))
      .filter((x) => x.d <= maxShore)
      .sort((x, y) => x.d - y.d || dist(x.c.p, s.lh) - dist(y.c.p, s.lh))
      .map((x) => x.c);
  const radii: number[] = [];
  for (let r = SF.ring[0]; r <= SF.ring[1]; r++) radii.push(r);
  const inland = (p: XZ): number => toward(p, s.summit);
  let selfie = placeFirst(
    'selfieSpot',
    byEdge(ringCands(s.lh, radii, SF.angles, 0, inland)),
    NaN,
    0,
    { gap: 0.6 },
  );
  const l0 = s.ledge0;
  if (!selfie && l0 && Number.isFinite(s.levels[0]))
    selfie = placeFirst(
      'selfieSpot',
      byEdge(nearCands(l0, SF.ledgeSearch, 1, 0).map((c) => ({ p: c.p, rot: toward(c.p, s.lh) }))),
      s.levels[0],
      1,
      { gap: 0.6 },
    );
  // else anywhere on the summit plateau, nearest its rim
  selfie ??= placeFirst(
    'selfieSpot',
    byEdge(
      nearCands(s.summit, SF.summitSearch, 1, 0).map((c) => ({ p: c.p, rot: inland(c.p) })),
      99,
    ),
    NaN,
    0,
    { gap: 0.6 },
  );
  if (selfie) story('lighthouseSelfie', selfie.p, selfie.rot, ['selfieSpot', 'lighthouse']);
  return stories;
}
