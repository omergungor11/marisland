/**
 * Marketing "Deniz Üstü Lunapark" (M53 TASK-671, D-172): the sea-top fun park beside the ferry pier,
 * replacing the Carnival Pier's small deck and 0.6 wheel. Pure data, no rng. `planLunaPark` runs right
 * after the harbour skeleton (marketing.ts, where `planCarnivalPier` ran) and reserves the platform,
 * the coaster's sea half and the gangway; `placeLunaPark` runs in the plan's `finish`. When no tier
 * fits, the plan falls back to the small Carnival deck (`planCarnivalPier`). Numbers: LUNA_SITE
 * (content/themes/marketing-harbour.ts); pieces and the suggested layout: LUNA_KIT / `lunaLayout`
 * (content/themes/marketing-luna.ts).
 *
 * Fit. The platform (`LUNA_KIT.deck[tier]`, w across the pier × d along it) stands square to the pier
 * on its open side (away from the breakwater arm; the arm side is tried second), its pier edge outside
 * the ferry's approach corridor. A straight gangway of whole `dock` pieces runs from the T crossbar's
 * end to the gate in the middle of that edge (the rail's entry gap), at most `skewDeg` off square, so
 * the platform may slide along the pier. Tiers: M, then S; within a tier the shortest gangway first.
 * Rejected where the seabed under the ring / pool / coaster's sea half is too high, land lies within
 * `dry`, another island within `clearOther`, or a reserved site within `gap`. The chosen site's bed is
 * filled up to `shoal.y` under the platform (a shoal on piles: couriers, which read only the depth,
 * sail round it; boat routes and seamarks keep off by `lunaKeepOut`).
 *
 * Frames. Deck frame = lunaLayout's: origin at the platform centre on the water, +z = the sea side (the
 * pier heading), +x away from the pier. World = centre + X · (mx · x) + U · z with U the pier heading
 * and X = (U.z, −U.x) (a fixture's local +x at rotY = the pier heading); `mx` = −1 mirrors the layout
 * when the pier lies on X's side. A local THREE yaw φ becomes the store's rotY = heading − mx · φ
 * (store rotY = the xz heading (cos, sin) of the piece's +z; three's rotation.y = π/2 − rotY). The
 * deck piece itself is not mirrorable: mirrored, it is turned half round (its entry gap still meets
 * the pier, the boats' landing gap then faces the shore).
 *
 * Anchor contract (world u; rotY = xz heading (cos, sin) unless said; `y` = world height; `…Size` =
 * two numbers, not a position). Missing when the seed has no park (plans-marketing-luna.test fit table).
 * - `lunaDeck` + `lunaDeckSize`: the platform's pivot (centre, on the water, y 0), rotY = the pier
 *   heading (the deck frame's +z, the sea side); size { x: w across the pier, z: d along it }.
 *   `lunaDeckFrame` = { x: mx (+1 / −1, see Frames), z: LUNA_KIT.deck index, rotY 0 } (numbers).
 * - `lunaPool` + `lunaPoolSize`: the open water inside the ring (= lunaDeck's centre, y 0, rotY the
 *   pier heading); size { x, z } = LUNA_KIT.deck[i].pool { w, d }.
 * - `lunaBoat0..4`: the bumper boats' start spots on the pool (y 0), rotY = bow heading (store).
 * - `lunaSwing`, `lunaDrop`, `lunaCarousel`, `lunaWheel`: the rides' pivots on the plank top
 *   (y = deck), rotY = the base fixture's store rotY; a mover's matrix = the base's matrix ·
 *   translate(LUNA_KIT.ride.*.at) · motion. `lunaWheel` = `carnivalWheel` (the 1.0 `ferrisWheel`).
 * - `lunaCoaster` + `lunaCoasterSize`: the coaster's pivot (loop centre on the platform's shore edge,
 *   y = deck), rotY = its store rotY (always the pier heading: the loop is never mirrored); the train
 *   rides `createCoasterSpline(lunaCoasterPoints(LUNA_KIT.coasterLengths[i]), { closed: true })` in
 *   that frame. Size { x: w, z: d } of the coaster piece.
 * - `lunaGate`: the gate's pivot (between the towers, y = deck), rotY = the sign's front (to the pier).
 * - `lunaGangway0` / `lunaGangway1`: the walkway's ends on the planks (y = deck): 0 on the T
 *   crossbar's end, 1 at the gate's mouth; rotY = heading 0 → 1.
 * - `lunaStall0..N`: browse spots `stall.front` u in front of the booth, the carts and the prize stall
 *   (y = deck), rotY = facing the stand. `lunaStallKind0..N` = { x: the LUNA_KIT stand variant (0
 *   booth, 1–3 carts, 4 prize), z: 0, rotY: 0 } (numbers).
 * - `lunaStroll0..K`: a closed walking loop round the ring (y = deck), clear of the rides, stands and
 *   furniture, rotY = heading toward the next point (the last: toward 0).
 * The Carnival anchors keep their meaning on the park: `carnivalDeck` + `carnivalDeckSize` = the
 * platform's centre (y = deck) and size, rotY = the pier heading (the `site:carnivalDeck:` cams keep
 * their frame: x across the pier, z along it); `carnivalWheel` = the big wheel; `carnivalScreen` = the
 * WELCOME screen on the platform's sea edge, front to the sea; `carnivalCannon0/1` stay on the T crossbar.
 */
import { CARNIVAL_PIER as K, LUNA_SITE as S } from '../../../content/themes/marketing-harbour.ts';
import {
  LUNA_KIT,
  lunaLayout,
  type LunaPlacement,
  type LunaRef,
} from '../../../content/themes/marketing-luna.ts';
import { DOCK } from '../../../content/settlements.ts';
import { smoothstep } from '../../../core/math/index.ts';
import { heightAt, type IslandData, type XZ } from '../../types.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
import {
  addShape,
  ang,
  cellOf,
  clear,
  discShape,
  dist,
  rectShape,
  shapeDist,
  shapesOverlap,
  type Shape,
  type SiteCtx,
} from '../sites.ts';
import { framePoint, harbourParams, type Harbour } from './harbour.ts';
import * as dm from '../../../core/math/dmath.ts';

type Tier = 0 | 1 | 2;

/** A planned park. */
export interface LunaPark {
  hb: Harbour;
  tier: Tier;
  /** Layout mirror sign (see the header's Frames). */
  mx: 1 | -1;
  /** Platform centre (on the water) and the T crossbar end / gate mouth of the gangway. */
  c: XZ;
  e0: XZ;
  e1: XZ;
  pieces: number;
}

/** The local deck frame's world axes. */
const axisX = (hb: Harbour): XZ => ({ x: hb.u.z, z: -hb.u.x });

/** World point of deck-frame (x, z). */
export function lunaPoint(pk: LunaPark, x: number, z: number): XZ {
  const X = axisX(pk.hb);
  const U = pk.hb.u;
  return {
    x: pk.c.x + X.x * pk.mx * x + U.x * z,
    z: pk.c.z + X.z * pk.mx * x + U.z * z,
  };
}

/** Store rotY of a deck-frame THREE yaw. */
const lunaRot = (pk: LunaPark, yaw: number): number => pk.hb.rotY - pk.mx * yaw;

/** Deck-frame footprint of a placement (rect along its yaw; round rides a disc). */
function footprint(p: LunaPlacement): Shape {
  const R = LUNA_KIT.ride;
  if (p.key === 'swing')
    return discShape(p.x, p.z, Math.max(R.swing.base.w, R.swing.base.d, R.swing.top.w) / 2);
  if (p.key === 'carousel')
    return discShape(p.x, p.z, Math.max(R.carousel.base.w, R.carousel.base.d) / 2);
  if (p.key === 'coaster') {
    // the deck half only (the sea half hangs over the water past the shore edge)
    const half = p.ref.d / 2;
    return rectShape(p.x, p.z + half / 2, 0, p.ref.w, half);
  }
  const s = p.scale ?? 1;
  return rectShape(p.x, p.z, Math.PI / 2 - p.rotY, p.ref.w * s, p.ref.d * s);
}

/**
 * The site's layout: `lunaLayout(tier)` with the adjustments the site needs (kit feedback in the
 * TASK-671 report): the boats are anchors only (movers); the WELCOME screen joins the sea strip in the
 * widest gap between the stands (the cotton candy / popcorn carts close up toward the carousel first,
 * the popcorn cart gives way when still too narrow); the booth leaves the pier strip when the gate or a
 * corner ride crowds it; furniture overlapping a bigger piece is dropped.
 */
export function lunaSiteLayout(tier: Tier): LunaPlacement[] {
  const D = LUNA_KIT.deck[tier];
  const hx = D.w / 2;
  const hz = D.d / 2;
  const ix = hx - D.ring;
  let out = lunaLayout(tier).filter((p) => p.on === 'deck');
  const at = (key: string): LunaPlacement | undefined => out.find((p) => p.key === key);
  // the sea strip: compact the left carts toward the carousel pad, then find the screen's gap
  const Sc = K.screen;
  const boardW = Sc.w + 2 * Sc.frame + 2 * S.screen.pad;
  const sea = ['cart0', 'cart1', 'prize', 'cart2'];
  let edge = -ix + S.screen.edge;
  for (const key of ['cart0', 'cart1']) {
    const p = at(key);
    if (!p) continue;
    p.x = edge + p.ref.w / 2;
    edge += p.ref.w + S.booth.gap;
  }
  const gapOf = (): { a: number; b: number } => {
    const iv = sea
      .map((k) => at(k))
      .filter((p): p is LunaPlacement => !!p)
      .map((p) => [p.x - p.ref.w / 2, p.x + p.ref.w / 2] as const)
      .sort((a, b) => a[0] - b[0]);
    let best = { a: 0, b: 0 };
    let from = -ix;
    for (const [a, b] of [...iv, [ix, ix] as const]) {
      if (a - from > best.b - best.a) best = { a: from, b: a };
      from = Math.max(from, b);
    }
    return best;
  };
  let g = gapOf();
  if (g.b - g.a < boardW) {
    out = out.filter((p) => p.key !== S.screen.dropCart);
    g = gapOf();
  }
  const screenX = (g.a + g.b) / 2;
  const scr: LunaPlacement = {
    key: 'screen',
    ref: {
      defId: 'billboardV2',
      variant: Sc.variant,
      w: Sc.w + 2 * Sc.frame,
      d: 0.6,
      h: Sc.height,
    },
    x: screenX,
    z: hz - Sc.back,
    rotY: 0,
    on: 'deck',
  };
  out.push(scr);
  // the booth faces into the park (the kit's faces the rail): beside the gate on the pier strip where
  // the gate and the corner rides leave room, else off the far strip facing the pool
  const booth = at('booth');
  const gate = at('gate');
  const furniture = (p: LunaPlacement): boolean => p.ref.defId === 'lunaDecor';
  if (booth && gate) {
    const bench = at('bench1');
    const zGate = gate.ref.w / 2 + S.booth.gap + booth.ref.d / 2;
    const zFar = (bench ? bench.z + bench.ref.w / 2 : 0) + S.booth.gap + booth.ref.d / 2;
    const tries: (readonly [number, number, number])[] = [
      [booth.x, booth.z, Math.PI / 2],
      [booth.x, zGate, Math.PI / 2],
      [booth.x, -zGate, Math.PI / 2],
      [hx - S.booth.far, zFar, -Math.PI / 2],
    ];
    const ok = tries.some(([x, z, r]) => {
      Object.assign(booth, { x, z, rotY: r });
      return !out.some(
        (o) =>
          o !== booth &&
          !furniture(o) &&
          shapesOverlap(footprint(o), footprint(booth), S.booth.gap),
      );
    });
    if (!ok) out = out.filter((p) => p !== booth);
  }
  // furniture that overlaps a ride, the coaster, the gate, the screen or a stand gives way
  out = out.filter(
    (p) =>
      !furniture(p) ||
      !out.some((o) => o !== p && !furniture(o) && shapesOverlap(footprint(o), footprint(p), 0.1)),
  );
  return out;
}

/** The visitor loop round the ring (deck frame), clear of the corner rides. */
export function lunaStroll(tier: Tier, layout: readonly LunaPlacement[]): XZ[] {
  const D = LUNA_KIT.deck[tier];
  const ix = D.w / 2 - D.ring + S.stroll.x;
  const iz = D.d / 2 - D.ring + S.stroll.z;
  const rides = layout
    .filter((p) => p.key === 'swing' || p.key === 'drop' || p.key === 'carousel')
    .map((p) => {
      const f = footprint(p);
      const r = f.r > 0 ? f.r : Math.hypot(f.hw, f.hd);
      return { x: p.x, z: p.z, r: r + S.stroll.rideGap };
    });
  const corners: XZ[] = [
    { x: -ix, z: -iz },
    { x: ix, z: -iz },
    { x: ix, z: iz },
    { x: -ix, z: iz },
  ];
  const out: XZ[] = [];
  for (let k = 0; k < 4; k++) {
    const a = corners[k];
    const b = corners[(k + 1) % 4];
    const n = Math.max(1, Math.round(dist(a, b) / S.stroll.step));
    for (let i = 0; i < n; i++) {
      let p = { x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n };
      for (const r of rides) {
        const d = Math.hypot(p.x - r.x, p.z - r.z);
        if (d < r.r) p = { x: r.x + ((p.x - r.x) / d) * r.r, z: r.z + ((p.z - r.z) / d) * r.r };
      }
      const last = out[out.length - 1];
      if (!last || dist(last, p) > 0.5) out.push(p);
    }
  }
  return out;
}

/** A fit candidate. */
interface Cand {
  tier: Tier;
  side: 1 | -1;
  du: number;
  pieces: number;
  vEdge: number;
  cost: number;
}

/** Plan the park beside the pier (null: no tier fits; the caller falls back to the Carnival deck). */
export function planLunaPark(ctx: SiteCtx, hb: Harbour): LunaPark | null {
  const G = S.gangway;
  const L = hb.site.segments * DOCK.segment;
  const headHalf = hb.P.pier.head.w / 2;
  const vMin = hb.P.berth.approach.half + S.approachGap;
  const maxSkew = (G.skewDeg * Math.PI) / 180;
  const cands: Cand[] = [];
  S.tiers.forEach((tier, ti) => {
    for (const side of [-1, 1] as const)
      for (let pieces = G.pieces[0]; pieces <= G.pieces[1]; pieces++)
        for (let du = G.slide[0]; du <= G.slide[1]; du++) {
          const len = pieces * DOCK.segment;
          if (Math.abs(du) > len * dm.sin(maxSkew)) continue;
          const vEdge = headHalf + Math.sqrt(len * len - du * du);
          if (vEdge < vMin) continue;
          // (tier first, the open side before the arm side, then the shortest, squarest gangway)
          const cost = ti * 1e4 + (side === -1 ? 0 : 1e3) + len + 0.5 * Math.abs(du);
          cands.push({ tier, side, du, pieces, vEdge, cost });
        }
  });
  cands.sort((a, b) => a.cost - b.cost);
  for (const k of cands) {
    const D = LUNA_KIT.deck[k.tier];
    const pk: LunaPark = {
      hb,
      tier: k.tier,
      mx: (-k.side * hb.sigma) as 1 | -1,
      c: framePoint(hb, L + k.du, k.side * (k.vEdge + D.w / 2)),
      e0: framePoint(hb, L, k.side * headHalf),
      e1: framePoint(hb, L + k.du, k.side * k.vEdge),
      pieces: k.pieces,
    };
    const shapes = parkShapes(pk);
    if (!fits(ctx, pk) || !shapes.every((sh) => clear(ctx, hb.isl, sh, S.gap))) continue;
    for (const sh of shapes) addShape(ctx, hb.isl, sh, false);
    raiseShoal(ctx, shapes.slice(0, 2));
    publishPlan(pk);
    return pk;
  }
  return null;
}

/** Fill the bed under the platform and the coaster's sea half up to `shoal.y` (fill only, water only). */
function raiseShoal(ctx: SiteCtx, shapes: readonly Shape[]): void {
  const Q = S.shoal;
  const R = Q.edge + Q.fall;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const sh of shapes) {
    const e = Math.hypot(sh.hw, sh.hd) + R;
    x0 = Math.min(x0, sh.x - e);
    x1 = Math.max(x1, sh.x + e);
    z0 = Math.min(z0, sh.z - e);
    z1 = Math.max(z1, sh.z + e);
  }
  const [ix0, ix1] = gridRange(x0, x1);
  const [iz0, iz1] = gridRange(z0, z1);
  for (let iz = iz0; iz <= iz1; iz++)
    for (let ix = ix0; ix <= ix1; ix++) {
      const i = iz * ctx.n + ix;
      const y = ctx.h.data[i];
      if (y >= Q.y) continue;
      const x = cellX(ix);
      const z = cellZ(iz);
      let d = Infinity;
      for (const sh of shapes) d = Math.min(d, shapeDist(sh, x, z));
      if (d >= R) continue;
      const w = 1 - smoothstep(Q.edge, R, d);
      ctx.h.data[i] = y + (Q.y - y) * w;
    }
}

/**
 * The reserved shapes: platform, the coaster's sea half, the gangway (from `gap` + the crossbar's half
 * depth off its end: a skewed run leaves the crossbar's corner within `gap`).
 */
function parkShapes(pk: LunaPark): Shape[] {
  const D = LUNA_KIT.deck[pk.tier];
  const Cst = LUNA_KIT.coaster[pk.tier];
  const rot = pk.hb.rotY;
  const deck = rectShape(pk.c.x, pk.c.z, rot, D.w, D.d);
  const sc = lunaPoint(pk, 0, -D.d / 2 - S.overhang / 2);
  const sea = rectShape(sc.x, sc.z, rot, Cst.w, S.overhang);
  const len = dist(pk.e0, pk.e1);
  const off = S.gap + pk.hb.P.pier.head.d / 2;
  const t = (len + off) / 2;
  const dir = { x: (pk.e1.x - pk.e0.x) / len, z: (pk.e1.z - pk.e0.z) / len };
  const m = { x: pk.e0.x + dir.x * t, z: pk.e0.z + dir.z * t };
  const way = rectShape(m.x, m.z, ang(dir.x, dir.z), 2 * S.gangway.half, len - off);
  return [deck, sea, way];
}

/** Seabed, dry margin and the other islands. */
function fits(ctx: SiteCtx, pk: LunaPark): boolean {
  const D = LUNA_KIT.deck[pk.tier];
  const hx = D.w / 2;
  const hz = D.d / 2;
  const cw = LUNA_KIT.coaster[pk.tier].w / 2;
  const H = (x: number, z: number): number => {
    const p = lunaPoint(pk, x, z);
    return heightAt(ctx.h, p.x, p.z);
  };
  for (let z = -hz; z <= hz + 1e-6; z += 1)
    for (let x = -hx; x <= hx + 1e-6; x += 1) if (H(x, z) > S.seabed.deck) return false;
  for (let z = -hz - S.overhang; z < -hz; z += 1)
    for (let x = -cw; x <= cw + 1e-6; x += 1) if (H(x, z) > S.seabed.coaster) return false;
  // the dry margin round the platform (the coaster's side: its sea half, checked above)
  const m = S.dry;
  for (let x = -hx - m; x <= hx + m + 1e-6; x += 1) if (H(x, hz + m) > 0) return false;
  for (let z = -hz; z <= hz + m + 1e-6; z += 1)
    for (const x of [-hx - m, hx + m]) if (H(x, z) > 0) return false;
  const R = S.clearOther;
  const own = pk.hb.isl.id + 1;
  for (let z = -hz - S.overhang - R; z <= hz + R + 1e-6; z += 2)
    for (let x = -hx - R; x <= hx + R + 1e-6; x += 2) {
      const p = lunaPoint(pk, x, z);
      const i = cellOf(ctx, p.x, p.z);
      if (i < 0) return false;
      // (islets, ids past the islands': the seabed and dry checks keep the platform off them)
      const o = ctx.islandMap[i];
      if (o !== 0 && o !== own && o <= ctx.islands.length && ctx.h.data[i] > 0) return false;
    }
  return true;
}

function publish(isl: IslandData, key: string, p: XZ, rotY: number, y?: number): void {
  isl.anchors[key] = y === undefined ? { x: p.x, z: p.z, rotY } : { x: p.x, z: p.z, rotY, y };
}

/** Plan-time anchors: the platform, its size and frame, the Carnival deck alias. */
function publishPlan(pk: LunaPark): void {
  const { isl } = pk.hb;
  const D = LUNA_KIT.deck[pk.tier];
  const y = LUNA_KIT.deckY;
  publish(isl, 'lunaDeck', pk.c, pk.hb.rotY, 0);
  publish(isl, 'lunaDeckSize', { x: D.w, z: D.d }, 0);
  publish(isl, 'lunaDeckFrame', { x: pk.mx, z: pk.tier }, 0);
  publish(isl, 'carnivalDeck', pk.c, pk.hb.rotY, y);
  publish(isl, 'carnivalDeckSize', { x: D.w, z: D.d }, 0);
}

const RIDE_ANCHOR: Readonly<Record<string, string>> = {
  swing: 'lunaSwing',
  drop: 'lunaDrop',
  carousel: 'lunaCarousel',
  wheel: 'lunaWheel',
};

/** The park on the final anchors: platform, gangway, rides, coaster, gate, stands, furniture, screen, arches. */
export function placeLunaPark(ctx: SiteCtx, pk: LunaPark): void {
  const { hb } = pk;
  const { isl } = hb;
  const y = LUNA_KIT.deckY;
  const D = LUNA_KIT.deck[pk.tier];
  const fix = (r: LunaRef, p: XZ, rotY: number, fy?: number, scale?: number): void => {
    ctx.fixtures.push({
      defId: r.defId,
      x: p.x,
      z: p.z,
      rotY,
      islandId: isl.id,
      variant: r.variant,
      ...(fy === undefined ? {} : { y: fy }),
      ...(scale === undefined ? {} : { scale }),
    });
  };
  // the platform (a floating fixture: pivot on the water); mirrored = turned half round
  fix(LUNA_KIT.deck[pk.tier], pk.c, pk.mx === 1 ? hb.rotY : hb.rotY + Math.PI);
  // the gangway: whole dock pieces, planks along the run (the pier's own look, pivot y 0)
  const len = dist(pk.e0, pk.e1);
  const head = ang(pk.e1.x - pk.e0.x, pk.e1.z - pk.e0.z);
  const dir = { x: (pk.e1.x - pk.e0.x) / len, z: (pk.e1.z - pk.e0.z) / len };
  for (let k = 0; k < pk.pieces; k++) {
    const t = (k + 0.5) * DOCK.segment;
    ctx.fixtures.push({
      defId: 'dock',
      x: pk.e0.x + dir.x * t,
      z: pk.e0.z + dir.z * t,
      rotY: head + Math.PI / 2,
      islandId: isl.id,
      variant: 0,
      y: 0,
    });
  }
  publish(isl, 'lunaGangway0', pk.e0, head, y);
  publish(isl, 'lunaGangway1', pk.e1, head, y);
  // the deck pieces
  const layout = lunaSiteLayout(pk.tier);
  const stands: { p: LunaPlacement; front: XZ; at: XZ }[] = [];
  for (const p of layout) {
    const w = lunaPoint(pk, p.x, p.z);
    const rot = p.key === 'coaster' ? hb.rotY : lunaRot(pk, p.rotY);
    if (p.key === 'screen') {
      publish(isl, 'carnivalScreen', w, rot, y);
      fix(p.ref, w, rot, y);
      continue;
    }
    fix(p.ref, w, rot, y, p.scale);
    const ride = RIDE_ANCHOR[p.key];
    if (ride) publish(isl, ride, w, rot, y);
    if (p.key === 'wheel') publish(isl, 'carnivalWheel', w, rot, y);
    if (p.key === 'coaster') {
      publish(isl, 'lunaCoaster', w, rot, y);
      publish(isl, 'lunaCoasterSize', { x: p.ref.w, z: p.ref.d }, 0);
    }
    if (p.key === 'gate') publish(isl, 'lunaGate', w, rot, y);
    if (p.ref.defId === 'lunaStand') {
      const f = p.ref.d / 2 + S.stall.front;
      stands.push({
        p,
        at: w,
        front: lunaPoint(pk, p.x + dm.sin(p.rotY) * f, p.z + dm.cos(p.rotY) * f),
      });
    }
  }
  stands.forEach((s, k) => {
    publish(isl, `lunaStall${k}`, s.front, ang(s.at.x - s.front.x, s.at.z - s.front.z), y);
    publish(isl, `lunaStallKind${k}`, { x: s.p.ref.variant, z: 0 }, 0);
  });
  // the pool and the bumper boats' start spots (movers: anchors only)
  publish(isl, 'lunaPool', pk.c, hb.rotY, 0);
  publish(isl, 'lunaPoolSize', { x: D.pool.w, z: D.pool.d }, 0);
  lunaLayout(pk.tier)
    .filter((p) => p.on === 'water')
    .forEach((p, k) =>
      publish(isl, `lunaBoat${k}`, lunaPoint(pk, p.x, p.z), lunaRot(pk, p.rotY), 0),
    );
  // the stroll loop
  const loop = lunaStroll(pk.tier, layout).map((q) => lunaPoint(pk, q.x, q.z));
  loop.forEach((q, k) => {
    const n = loop[(k + 1) % loop.length];
    publish(isl, `lunaStroll${k}`, q, ang(n.x - q.x, n.z - q.z), y);
  });
  // bulb arches (bunting v5): over the gangway's middle, across the stroll on the far and sea strips
  const A = K.arch;
  const arch = (p: XZ, rot: number): void => {
    ctx.fixtures.push({
      defId: 'bunting',
      x: p.x,
      z: p.z,
      rotY: rot,
      islandId: isl.id,
      variant: A.variant,
      y,
    });
  };
  if (len >= S.arches.minGangway)
    arch({ x: (pk.e0.x + pk.e1.x) / 2, z: (pk.e0.z + pk.e1.z) / 2 }, head);
  const ix = D.w / 2 - D.ring;
  const iz = D.d / 2 - D.ring;
  arch(lunaPoint(pk, ix + S.stroll.x, 0), lunaRot(pk, 0));
  const scr = layout.find((p) => p.key === 'screen');
  arch(lunaPoint(pk, scr ? scr.x : 0, iz + S.stroll.z), lunaRot(pk, Math.PI / 2));
}

/** Boat-route / seamark keep-out discs over the platform, the coaster's sea half and the gangway. */
export function lunaKeepOut(
  islands: readonly IslandData[],
): { x: number; z: number; r: number; hard: number }[] {
  const out: { x: number; z: number; r: number; hard: number }[] = [];
  for (const isl of islands) {
    const c = isl.anchors.lunaDeck;
    const size = isl.anchors.lunaDeckSize;
    const hard = harbourParams(isl.theme)?.keepOut.hard;
    if (!c || !size || hard === undefined) continue;
    const U = { x: dm.cos(c.rotY), z: dm.sin(c.rotY) };
    const X = { x: U.z, z: -U.x };
    const g = S.disc;
    const r = (g * Math.SQRT2) / 2 + S.keepOut;
    const z0 = -size.z / 2 - S.overhang;
    const nx = Math.max(1, Math.round(size.x / g));
    const nz = Math.max(1, Math.round((size.z / 2 - z0) / g));
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const x = -size.x / 2 + ((i + 0.5) * size.x) / nx;
        const z = z0 + ((j + 0.5) * (size.z / 2 - z0)) / nz;
        out.push({ x: c.x + X.x * x + U.x * z, z: c.z + X.z * x + U.z * z, r, hard: S.hard });
      }
    const a = isl.anchors.lunaGangway0;
    const b = isl.anchors.lunaGangway1;
    if (a && b) {
      const L = dist(a, b);
      for (let t = 2; t <= L + 1e-6; t += 2)
        out.push({
          x: a.x + ((b.x - a.x) * t) / L,
          z: a.z + ((b.z - a.z) * t) / L,
          r: S.gangway.half + S.keepOut,
          hard,
        });
    }
  }
  return out;
}

/** Distance (u) from `p` to the park's platform + the coaster's sea half (Infinity without one). */
export function lunaDeckDist(isl: IslandData, p: XZ): number {
  const c = isl.anchors.lunaDeck;
  const size = isl.anchors.lunaDeckSize;
  const cs = isl.anchors.lunaCoasterSize;
  if (!c || !size) return Infinity;
  const deck = shapeDist(rectShape(c.x, c.z, c.rotY, size.x, size.z), p.x, p.z);
  if (!cs) return deck;
  const t = -size.z / 2 - S.overhang / 2;
  const sc = { x: c.x + dm.cos(c.rotY) * t, z: c.z + dm.sin(c.rotY) * t };
  return Math.min(deck, shapeDist(rectShape(sc.x, sc.z, c.rotY, cs.x, S.overhang), p.x, p.z));
}
