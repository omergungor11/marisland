/**
 * DevOps M26 lava-pack geometry (TASK-509b, D-092). Numbers / palette: content/themes/devops-m26.ts;
 * defs: content/props-themes/devops-m26.ts. Vertex colours only, merged single geometry per prop,
 * pivot on the ground (or the waterline), 1 u = 1 m. Nothing here is placed: TASK-509c does that.
 *
 * New defs:
 *   emberBridge        D3  v0 footbridge, v1 rail bridge; spans local z over the lava strip, lava-seamed stone
 *   craterDeck         D6  octagonal rim viewing platform: caged rail, 2 benches, telescope, 2 lava lanterns
 *   glassKiln          D17 beehive kiln (glowing mouth, chimney) + a rack of lava-glass lanterns
 *   obsidianShard      D10 v0 shard cluster, v1 sea stack, v2 tide-pool slab, v3 cairn
 *   devopsBreakwater   D18 v0 straight 8 u, v1 short 5 u, v2 head 6 u with the red harbour light
 * Variant of an older def: sailboat 9 = the tug (`tugBoat`, registry.ts), bow +z, keel y = 0.
 *
 * Emissive: lamp glass (night lamps ramp) = 1; lava seams and the furnace mouth = 1.6 (the molten class:
 * glows dimly by day too). Glass pieces on the rack are 1 so they light up with the lamps (D17 wow).
 *
 * Hooks (userData.hooks, local frame, scale 1, y from the pivot):
 *  - emberBridge.span `{ length, clear, width, deckY, axis: 'z' }`; .channel `{ halfWidth, floorY }` the
 *    lava under the arch; .lamps `[[x,y,z]...]`; v1 also .track `{ from, to, y, gauge }` (rail top y).
 *  - craterDeck.view `[0,0,1]` (toward the crater); .seats `[[x,y,z]...]` (seat tops, the "couple looking in");
 *    .scope `{ at, dir }`; .lamps; .entry `{ at }`; .floor `{ y, r }`.
 *  - glassKiln.mouth `{ at, size }` (furnace mouth); .smoke / .chimney `{ at }` (top of the stack);
 *    .lamps `[[x,y,z]...]` the hung rack lanterns; .front `[0,0,1]`.
 *  - obsidianShard: none (decor); v2 .pool `{ at, r }` the turquoise water.
 *  - devopsBreakwater.crest `{ y, width, length }`; v2 .light `{ at }` (red lens), .end `{ at }`.
 *  - sailboat 9 (tug): .smoke `{ at }` funnel top, .tow `{ at }` the towing bitt, .bow `{ at }`, .lamp `{ at }`,
 *    .route `{ speed, lead }` hints for the mover.
 */
import * as THREE from 'three';
import type { Rng } from '../../core/rng.ts';
import { DEVOPS_M26 as F, M26_PAL as P } from '../../content/themes/devops-m26.ts';
import { hullShape } from '../coastal.ts';
import { Acc, blob, col, createNoise, mat, qEuler, qFromTo } from '../kit.ts';
import { V, V2, baseBox, cylB, lathe, prism, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { addHook } from './hq.ts';

type Pt = THREE.Vector3;
const Y = V(0, 1, 0);
const molten = { emissive: 1.6, aoAmt: 0, ao: () => 1, noJitter: true } as const;
const lamp = { emissive: 1, aoAmt: 0, ao: () => 1, noJitter: true } as const;

/** Square beam from a to b (thickness `th`). */
function beam(acc: Acc, a: Pt, b: Pt, th: number, color: string, o: { aoAmt?: number } = {}): void {
  const d = b.clone().sub(a);
  put(acc, baseBox(th, d.length(), th), a, color, { q: qFromTo(Y, d), aoAmt: 0, ...o });
}

const bx = (
  acc: Acc,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: string,
  o: Parameters<typeof put>[4] = {},
): void => put(acc, baseBox(w, h, d), [x, y, z], color, { aoAmt: 0.12, ...o });

/** Acc scaled a hair in x / z by the seed (y untouched, so heights and hooks stay exact). */
function seedAcc(rng: Rng, amt: number): Acc {
  const acc = new Acc();
  const r = rng.fork('jit');
  acc.xf = mat([0, 0, 0], null, [1 + r.range(-amt, amt), 1, 1 + r.range(-amt, amt)]);
  return acc;
}

const finish = (acc: Acc, rng: Rng): THREE.BufferGeometry => acc.finish(rng, false, true);

/** An emissive lamp lens (icosahedron at LOD0, octahedron at LOD1). */
function lens(acc: Acc, at: [number, number, number], r: number, color: string, hi: boolean): void {
  put(
    acc,
    hi ? new THREE.IcosahedronGeometry(r, 0) : new THREE.OctahedronGeometry(r, 0),
    at,
    color,
    lamp,
  );
}

/** Lava lantern on a post: iron post, amber lens, orange cap. Returns the lens centre. */
function lanternPost(
  acc: Acc,
  hi: boolean,
  x: number,
  y0: number,
  z: number,
  h: number,
  r: number,
): [number, number, number] {
  put(acc, cylB(0.05, 0.045, h, hi ? 5 : 3), [x, y0, z], P.iron, { aoAmt: 0 });
  const at: [number, number, number] = [x, y0 + h + r * 0.7, z];
  lens(acc, at, r, P.glow, hi);
  if (hi)
    put(acc, new THREE.ConeGeometry(r + 0.06, 0.16, 6), [x, y0 + h + r * 1.6, z], P.orange, {
      aoAmt: 0,
    });
  return at;
}

/* ------------------------------- emberBridge ------------------------------- */

/**
 * D3: a stone bridge with a shallow arch over the lava strip. The body is one extruded (z, y)
 * profile; the lava glows on the soffit and in a few cracks. v0 has an iron rail + lantern posts,
 * v1 carries a ballast bed with one steel track along z (the ore train) and low stone parapets.
 */
function emberBridge({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const B = F.bridge;
  const hi = lod === 0;
  const acc = seedAcc(rng, 0.01);
  const half = B.length / 2;
  const ch = B.clear / 2;
  const w = B.width;
  const top = B.deckY;
  const sk = B.skirt;
  // body profile (z, y): U-shaped outline with a segmental arch, one concave polygon
  const pts: THREE.Vector2[] = [V2(-half, -sk), V2(-ch, -sk), V2(-ch, B.springY)];
  const n = hi ? 8 : 3;
  for (let i = 1; i < n; i++) {
    const a = Math.PI - (i / n) * Math.PI;
    pts.push(V2(Math.cos(a) * ch, B.springY + Math.sin(a) * (B.crownY - B.springY)));
  }
  pts.push(V2(ch, B.springY), V2(ch, -sk), V2(half, -sk), V2(half, top), V2(-half, top));
  const body = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
    depth: w,
    bevelEnabled: false,
    curveSegments: 1,
  })
    .translate(0, 0, -w / 2)
    .rotateY(Math.PI / 2);
  put(acc, body, [0, 0, 0], P.basaltLight, { aoAmt: 0.18 });
  // deck slab, a hair wider than the body
  bx(acc, w + 0.12, 0.1, B.length + 0.12, 0, top, 0, P.steelLight, { aoAmt: 0 });
  const deckTop = top + 0.1;
  const lamps: Array<[number, number, number]> = [];
  const track = B.track;
  const pw = B.parapet;
  if (variant === 0) {
    // footbridge: stone curbs, iron rail posts, an orange top rail and a mid rail
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.08);
      bx(acc, 0.16, 0.14, B.length - 0.2, x, deckTop, 0, P.basalt, { aoAmt: 0 });
      const rail = B.rail;
      const nPost = Math.max(3, Math.round((B.length - 0.6) / rail.every) + 1);
      if (hi)
        for (let i = 0; i < nPost; i++) {
          const z = -half + 0.3 + (i * (B.length - 0.6)) / (nPost - 1);
          bx(acc, rail.post, rail.h, rail.post, x, deckTop, z, P.iron, { aoAmt: 0 });
        }
      bx(acc, 0.09, 0.07, B.length - 0.2, x, deckTop + rail.h, 0, P.orange, { aoAmt: 0 });
      if (hi)
        bx(acc, 0.05, 0.05, B.length - 0.2, x, deckTop + rail.h * 0.5, 0, P.iron, { aoAmt: 0 });
      else bx(acc, 0.07, rail.h, 0.07, x, deckTop, 0, P.iron, { aoAmt: 0 });
    }
    if (hi)
      for (let i = 0; i < 13; i++)
        bx(acc, w - 0.5, 0.02, 0.05, 0, deckTop, -half + 0.35 + i * 0.7, P.basalt, {
          aoAmt: 0,
          ao: () => 1,
        });
  } else {
    // rail bridge: parapets, a ballast bed, one track along z with sleepers
    for (const sx of [-1, 1])
      bx(acc, pw.w, pw.h, B.length - 0.1, sx * (w / 2 - pw.w / 2), deckTop, 0, P.basalt, {
        aoAmt: 0.1,
      });
    bx(acc, w - 0.6, track.ballast, B.length - 0.1, 0, deckTop, 0, '#7C7682', { aoAmt: 0.05 });
    const ty = deckTop + track.ballast;
    for (const sx of [-1, 1])
      bx(acc, 0.08, track.rail, B.length - 0.1, (sx * track.gauge) / 2, ty, 0, P.steelPale, {
        aoAmt: 0,
      });
    if (hi)
      for (let i = 0; i < 17; i++)
        bx(acc, track.gauge + 0.42, 0.06, 0.2, 0, ty - 0.02, -half + 0.35 + i * 0.5, P.wood, {
          aoAmt: 0,
        });
  }
  // lantern posts at the four deck corners
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      if (hi || sx * sz > 0)
        lamps.push(
          lanternPost(
            acc,
            hi,
            sx * (w / 2 - 0.1),
            deckTop,
            sz * (half - 0.35),
            B.lantern.h,
            B.lantern.r,
          ),
        );
  // stone courses on the abutment faces
  if (hi)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        for (const y of [0.2, 0.5, 0.8])
          bx(
            acc,
            0.03,
            0.05,
            half - ch - 0.1,
            sx * (w / 2 + 0.01),
            y,
            sz * ((half + ch) / 2),
            P.basalt,
            { aoAmt: 0 },
          );
  // keystones on both faces
  if (hi)
    for (const sx of [-1, 1])
      bx(acc, 0.06, 0.3, 0.5, sx * (w / 2 + 0.02), B.crownY - 0.05, 0, P.steelLight, { aoAmt: 0 });
  // lava light on the soffit, and a few glowing cracks in the abutments (day + night)
  bx(acc, w - 0.5, 0.03, 2.0, 0, B.crownY - 0.05, 0, P.lava, molten);
  const r = rng.fork('seams');
  const nSeam = hi ? B.seams : 0;
  for (let i = 0; i < nSeam; i++) {
    const sx = i % 2 === 0 ? -1 : 1;
    const sz = i % 4 < 2 ? -1 : 1;
    const z = sz * r.range(ch + 0.35, half - 0.4);
    const y = r.range(-0.1, top - 0.3);
    const len = r.range(0.5, 0.9);
    bx(acc, 0.05, 0.08, len, sx * (w / 2 + 0.015), y, z, P.lava, {
      ...molten,
      q: qEuler(r.range(-0.9, 0.9), 0, 0),
    });
  }
  const g = finish(acc, rng);
  addHook(g, 'span', { length: B.length, clear: B.clear, width: w, deckY: deckTop, axis: 'z' });
  addHook(g, 'channel', { halfWidth: 1.5, floorY: -sk });
  addHook(g, 'lamps', { list: lamps.map((l) => [...l]) });
  if (variant === 1)
    addHook(g, 'track', {
      from: [0, deckTop + track.ballast + track.rail, -half],
      to: [0, deckTop + track.ballast + track.rail, half],
      y: deckTop + track.ballast + track.rail,
      gauge: track.gauge,
    });
  return g;
}

/* ------------------------------- craterDeck ------------------------------- */

/**
 * D6: an octagonal viewing platform. A stone drum (reaching below the pivot into the slope), a plank
 * floor with an orange kerb, a caged rail on the front half (+z, toward the crater), an open entry
 * with two steps at the back, two benches facing the view, a telescope on a pedestal and two lava
 * lanterns on the front-corner posts.
 */
function craterDeck({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const D = F.deck;
  const hi = lod === 0;
  const acc = seedAcc(rng, 0.008);
  const n = D.sides;
  const r = D.r;
  const fy = D.floorY;
  put(
    acc,
    new THREE.CylinderGeometry(r + 0.05, r + 0.18, fy + D.skirt - 0.12, n).translate(
      0,
      (fy + D.skirt - 0.12) / 2 - D.skirt,
      0,
    ),
    [0, 0, 0],
    P.basaltLight,
    { aoAmt: 0.2 },
  );
  if (hi) put(acc, cylB(r + 0.06, r + 0.06, 0.07, n), [0, fy - 0.19, 0], P.orange, { aoAmt: 0 });
  put(acc, cylB(r, r, 0.12, n), [0, fy - 0.12, 0], P.woodLight, { aoAmt: 0.05 });
  if (hi)
    for (let i = 0; i < 4; i++)
      bx(acc, 0.03, 0.02, r * 1.9, 0, fy, 0, P.wood, {
        aoAmt: 0,
        ao: () => 1,
        q: qEuler(0, (i * Math.PI) / 4, 0),
      });
  // vertices of the rail octagon: a vertex points at +z (the view); the entry vertex is k = n / 2
  const rr = r - 0.07;
  const vx = (k: number): Pt =>
    V(rr * Math.sin((k * Math.PI * 2) / n), fy, rr * Math.cos((k * Math.PI * 2) / n));
  const entry = n / 2;
  const open = (k: number): boolean => Math.abs((((k % n) + n) % n) - entry) <= D.entry - 0;
  const lampAt: Array<[number, number, number]> = [];
  for (let k = 0; k < n; k++) {
    if (open(k)) continue;
    const a = vx(k);
    const corner = k === 1 || k === n - 1;
    if (corner) lampAt.push(lanternPost(acc, hi, a.x, fy, a.z, D.lantern.h - fy, D.lantern.r));
    else if (hi || k === 0) {
      bx(acc, 0.08, D.railH, 0.08, a.x, fy, a.z, P.iron, { aoAmt: 0 });
      if (hi) bx(acc, 0.13, 0.05, 0.13, a.x, fy + D.railH, a.z, P.orange, { aoAmt: 0 });
    }
    const b = vx(k + 1);
    if (open(k + 1)) continue;
    const front = a.z + b.z > -0.01;
    beam(acc, a.clone().setY(fy + D.railH), b.clone().setY(fy + D.railH), 0.08, P.orange);
    if (hi)
      beam(
        acc,
        a.clone().setY(fy + D.railH * 0.5),
        b.clone().setY(fy + D.railH * 0.5),
        0.05,
        P.iron,
      );
    if (hi)
      for (let i = 1; i <= (front ? 3 : 2); i++) {
        const p = a.clone().lerp(b, i / (front ? 4 : 3));
        bx(acc, 0.035, D.railH * 0.5, 0.035, p.x, fy + D.railH * 0.5, p.z, P.iron, { aoAmt: 0 });
      }
  }
  // back steps
  bx(acc, 1.5, 0.22, 0.5, 0, 0, -r - 0.2, P.basaltLight, { aoAmt: 0.2 });
  if (hi) bx(acc, 1.5, 0.22, 0.4, 0, 0.22, -r + 0.0, P.steelLight, { aoAmt: 0.1 });
  // two benches side by side, seats toward +z, backs toward the entry
  const seats: Array<[number, number, number]> = [];
  const Bn = D.bench;
  for (const sx of [-1, 1]) {
    const x = sx * Bn.x;
    if (hi) {
      for (let i = 0; i < 3; i++)
        bx(
          acc,
          Bn.w,
          0.06,
          Bn.d / 3 - 0.02,
          x,
          fy + Bn.seatH,
          Bn.z - Bn.d / 3 + i * (Bn.d / 3),
          P.woodLight,
          { aoAmt: 0.05 },
        );
      for (let i = 0; i < 2; i++)
        bx(
          acc,
          Bn.w,
          0.1,
          0.05,
          x,
          fy + Bn.seatH + 0.1 + i * 0.16,
          Bn.z - Bn.d / 2 + 0.03,
          P.wood,
          { aoAmt: 0.05 },
        );
    } else {
      bx(acc, Bn.w, 0.07, Bn.d, x, fy + Bn.seatH, Bn.z, P.woodLight, { aoAmt: 0.05 });
    }
    if (hi)
      for (const lx of [-1, 1])
        bx(acc, 0.07, Bn.seatH, Bn.d - 0.08, x + lx * (Bn.w / 2 - 0.1), fy, Bn.z, P.iron, {
          aoAmt: 0,
        });
    seats.push([x, fy + Bn.seatH + 0.07, Bn.z]);
  }
  // telescope on a pedestal at the front centre
  const S = D.scope;
  put(acc, cylB(0.16, 0.1, S.h * 0.8, hi ? 6 : 4), [0, fy, S.z], P.steel, { aoAmt: 0.1 });
  put(acc, cylB(0.12, 0.12, 0.1, hi ? 6 : 4), [0, fy + S.h * 0.8, S.z], P.iron, { aoAmt: 0 });
  const tq = qEuler(Math.PI / 2 + S.tilt, 0, 0);
  const tubeAt: [number, number, number] = [0, fy + S.h * 0.8 + 0.18, S.z + 0.05];
  put(acc, new THREE.CylinderGeometry(0.075, 0.09, S.len, hi ? 6 : 4), tubeAt, P.steelPale, {
    q: tq,
    aoAmt: 0,
  });
  if (hi) {
    // coin box and brass plaque on the pedestal
    bx(acc, 0.2, 0.22, 0.12, 0, fy + 0.35, S.z - 0.15, P.orange, { aoAmt: 0 });
    bx(acc, 0.12, 0.08, 0.02, 0, fy + 0.46, S.z - 0.22, P.brass, { aoAmt: 0 });
    put(
      acc,
      new THREE.CylinderGeometry(0.1, 0.1, 0.06, 6),
      [
        tubeAt[0],
        tubeAt[1] - Math.sin(S.tilt) * (S.len / 2),
        tubeAt[2] + Math.cos(S.tilt) * (S.len / 2),
      ],
      P.brass,
      { q: tq, aoAmt: 0 },
    );
  }
  const g = finish(acc, rng);
  addHook(g, 'view', { dir: [0, 0, 1] });
  addHook(g, 'seats', { list: seats });
  addHook(g, 'scope', { at: tubeAt, dir: [0, -Math.sin(S.tilt), Math.cos(S.tilt)] });
  addHook(g, 'lamps', { list: lampAt });
  addHook(g, 'entry', { at: [0, fy, -r] });
  addHook(g, 'floor', { y: fy, r });
  return g;
}

/* ------------------------------- glassKiln ------------------------------- */

/** Radius of the kiln dome at height y over its base (piecewise linear through `kiln.dome`). */
function domeR(y: number): number {
  const d = F.kiln.dome;
  for (let i = 1; i < d.length; i++)
    if (y <= d[i][1])
      return d[i - 1][0] + ((y - d[i - 1][1]) / (d[i][1] - d[i - 1][1])) * (d[i][0] - d[i - 1][0]);
  return d[d.length - 1][0];
}

/**
 * D17: a terracotta beehive kiln on a basalt base, front +z: a glowing furnace mouth in an iron frame
 * with a hot apron, a chimney with an orange band, a log stack, and to the right a timber rack with
 * lava-glass lanterns hanging from the top bar and pieces on the shelf (DevOps accents, lit at night).
 */
function glassKiln({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const K = F.kiln;
  const hi = lod === 0;
  const acc = seedAcc(rng, 0.008);
  const kx = K.base.x;
  const bh = K.base.h;
  bx(acc, K.base.w, bh, K.base.d, kx, 0, 0, P.basalt, { aoAmt: 0.2 });
  if (hi)
    bx(acc, K.base.w + 0.1, 0.07, K.base.d + 0.1, kx, bh - 0.07, 0, P.basaltLight, { aoAmt: 0 });
  put(
    acc,
    lathe(K.dome, hi ? 10 : 6),
    [kx, bh, 0],
    (p) => col(p.y - bh > 1.5 ? P.orangeDeep : P.copper),
    {
      aoAmt: 0.2,
      noJitter: false,
    },
  );
  if (hi)
    for (const y of [0.45, 1.05]) {
      const rb = domeR(y) + 0.03;
      put(acc, cylB(rb, rb, 0.07, 10), [kx, bh + y, 0], P.iron, { aoAmt: 0 });
    }
  // chimney
  const C = K.chimney;
  const cy = bh + K.dome[K.dome.length - 1][1] - 0.05;
  put(acc, cylB(C.r0, C.r1, C.h, hi ? 8 : 5), [kx, cy, 0], P.copper, { aoAmt: 0.1 });
  if (hi)
    put(acc, cylB(C.r1 + 0.05, C.r1 + 0.05, 0.12, 8), [kx, cy + C.h - 0.4, 0], P.orange, {
      aoAmt: 0,
    });
  put(acc, cylB(C.r1 + 0.08, C.r1 + 0.08, 0.1, hi ? 8 : 5), [kx, cy + C.h - 0.08, 0], P.iron, {
    aoAmt: 0,
  });
  const top = cy + C.h + 0.1;
  // furnace mouth: iron frame, molten fill, a hotter core, orange lintel, a hot apron
  const M = K.mouth;
  const my = bh + M.y;
  const mz = domeR(M.y) * 0.96;
  bx(acc, M.w + 0.28, M.h + 0.2, 0.34, kx, my - 0.1, mz, P.iron, { aoAmt: 0.05 });
  bx(acc, M.w, M.h, 0.06, kx, my, mz + 0.19, P.lava, molten);
  if (hi) bx(acc, M.w * 0.55, M.h * 0.6, 0.06, kx, my + M.h * 0.15, mz + 0.22, P.glow, molten);
  if (hi) bx(acc, M.w + 0.34, 0.1, 0.38, kx, my + M.h + 0.1, mz, P.orange, { aoAmt: 0 });
  bx(acc, 1.7, 0.1, 1.3, kx, 0, mz + 0.55, P.basaltLight, { aoAmt: 0.1 });
  if (hi) bx(acc, 1.1, 0.03, 0.8, kx, 0.1, mz + 0.5, P.lava, lamp);
  // logs beside the kiln (front left)
  if (hi)
    for (const [dx, dy] of [
      [0, 0],
      [0.19, 0],
      [0.095, 0.17],
    ] as const)
      put(
        acc,
        new THREE.CylinderGeometry(0.09, 0.09, 0.8, 5).rotateZ(Math.PI / 2),
        [kx - 1.7 + dx * 0, 0.09 + dy, 1.0 + dx * 2],
        P.wood,
        { aoAmt: 0.1, q: qEuler(0, Math.PI / 2, 0) },
      );
  // glass rack: two posts, a top bar under a small orange canopy, a shelf, hung lanterns, pieces
  const R = K.rack;
  const rz = R.z;
  for (const sx of [-1, 1])
    bx(acc, 0.13, R.h, 0.13, R.x + (sx * R.w) / 2, 0, rz, P.woodDark, { aoAmt: 0.15 });
  if (hi) bx(acc, R.w + 0.3, 0.11, 0.16, R.x, R.h - 0.11, rz, P.woodDark, { aoAmt: 0 });
  bx(acc, R.w + 0.5, 0.06, R.d + 0.4, R.x, R.h, rz, P.orange, { aoAmt: 0, q: qEuler(0.1, 0, 0) });
  if (hi) bx(acc, R.w, 0.07, R.d, R.x, 0.95, rz, P.wood, { aoAmt: 0.05 });
  const lamps: Array<[number, number, number]> = [];
  const nL = hi ? K.lanterns : 3;
  for (let i = 0; i < nL; i++) {
    const x = R.x - R.w / 2 + 0.2 + (i * (R.w - 0.4)) / Math.max(1, nL - 1);
    const y = R.h - 0.5 - (i % 2) * 0.12;
    const c = P.glass[i % P.glass.length];
    if (!hi) {
      lamps.push([x, y + 0.18, rz + 0.05]);
      continue;
    }
    bx(acc, 0.02, R.h - 0.11 - y - 0.36, 0.02, x, y + 0.36, rz + 0.05, P.iron, { aoAmt: 0 });
    put(acc, cylB(0.16, 0.14, 0.36, 6), [x, y, rz + 0.05], c, lamp);
    put(acc, new THREE.ConeGeometry(0.15, 0.1, 6), [x, y + 0.41, rz + 0.05], P.iron, { aoAmt: 0 });
    lamps.push([x, y + 0.18, rz + 0.05]);
  }
  // LOD1: one lit slab stands for the hung lanterns and the pieces
  if (!hi) bx(acc, R.w - 0.3, 0.4, 0.3, R.x, R.h - 0.7, rz + 0.05, P.glass[0], lamp);
  const nP = hi ? K.pieces : 0;
  for (let i = 0; i < nP; i++) {
    const x = R.x - R.w / 2 + 0.3 + (i * (R.w - 0.6)) / Math.max(1, nP - 1);
    const c = P.glass[(i + 2) % P.glass.length];
    put(
      acc,
      lathe(
        [
          [0.001, 0],
          [0.14, 0.04],
          [0.17, 0.18],
          [0.09, 0.34],
          [0.07, 0.44],
        ],
        hi ? 6 : 4,
      ),
      [x, 0.98, rz],
      c,
      lamp,
    );
  }
  // work bench in front of the rack with two hot gathers and a blowpipe
  if (hi) {
    bx(acc, 1.7, 0.08, 0.55, R.x, 0.72, 1.35, P.woodLight, { aoAmt: 0.05 });
    for (const sx of [-1, 1])
      bx(acc, 0.1, 0.72, 0.4, R.x + sx * 0.75, 0, 1.35, P.woodDark, { aoAmt: 0.15 });
    for (const dx of [-0.35, 0.3])
      put(acc, new THREE.IcosahedronGeometry(0.13, 0), [R.x + dx, 0.93, 1.35], P.lava, molten);
    beam(acc, V(R.x - 0.7, 0.86, 1.2), V(R.x + 0.7, 0.9, 1.5), 0.03, P.steel);
  }
  const g = finish(acc, rng);
  addHook(g, 'mouth', { at: [kx, my + M.h * 0.4, mz + 0.25], size: [M.w, M.h] });
  addHook(g, 'smoke', { at: [kx, top, 0] });
  addHook(g, 'chimney', { at: [kx, top, 0] });
  addHook(g, 'lamps', { list: lamps });
  addHook(g, 'front', { dir: [0, 0, 1] });
  return g;
}

/* ------------------------------- obsidianShard ------------------------------- */

/** Displace x / z (and y above the foot) of an indexed or flat geometry by 3D noise. */
function rough(
  g: THREE.BufferGeometry,
  noise: ReturnType<typeof createNoise>,
  amp: number,
  freq = 1.6,
): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = noise.n3(v.x * freq + 3.1, v.y * freq, v.z * freq - 1.7) * amp;
    p.setXYZ(i, v.x + k, v.y + (v.y > 0.3 ? k * 0.6 : 0), v.z + k * 0.8);
  }
  return g;
}

/** Glass colour: a dark body brightening up the shard, a turquoise glint on the tip, an ember foot. */
function glassColour(h: number, ember: boolean, glint: boolean): (p: Pt) => THREE.Color {
  const [d0, d1, d2] = P.obsidian;
  return (p) => {
    const t = Math.min(1, Math.max(0, p.y / h));
    if (ember && p.y < 0.14) return col(P.ember);
    const c = col(d0).lerp(col(t < 0.55 ? d1 : d2), t < 0.55 ? t / 0.55 : (t - 0.55) / 0.45);
    if (glint && t > 0.9) c.lerp(col(P.glint), 0.3);
    return c;
  };
}

function obsidianShard({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const O = F.obsidian;
  const hi = lod === 0;
  const acc = new Acc();
  const r = rng.fork('obs');
  const noise = createNoise(r.fork('n'));
  const ground = { groundClamp: true, noJitter: false } as const;
  if (variant === 0) {
    // shard cluster: tilted faceted spikes, one with an ember foot, a few flakes
    const C = O.cluster;
    const n = hi ? C.n : 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r.range(-0.4, 0.4);
      const d = i === 0 ? 0 : C.spread * r.range(0.4, 1);
      const h = (i === 0 ? C.h[1] : r.range(C.h[0], C.h[1] * 0.8)) * (hi ? 1 : 1.05);
      const rad = r.range(C.r[0], C.r[1]) * (i === 0 ? 1.15 : 1);
      const cone = new THREE.ConeGeometry(
        rad,
        h,
        hi ? 6 : 4,
        hi ? 2 : 1,
        !hi ? true : false,
      ).translate(0, h / 2, 0);
      if (hi) rough(cone, noise, O.noise * 0.5, 2.2);
      const lean = r.range(0.1, C.lean);
      const q = qEuler(Math.cos(a + 1.6) * lean, r.range(0, 6.28), Math.sin(a + 1.6) * lean);
      put(
        acc,
        cone,
        [Math.cos(a) * d, 0, Math.sin(a) * d],
        glassColour(h, hi && i % 3 === 0, true),
        {
          q,
          aoAmt: 0.1,
          ...ground,
        },
      );
    }
    if (hi)
      for (let i = 0; i < 5; i++) {
        const a = r.range(0, 6.28);
        const d = r.range(0.5, 1.15);
        const fh = r.range(0.1, 0.22);
        put(
          acc,
          new THREE.ConeGeometry(r.range(0.05, 0.09), fh, 4, 1).translate(0, fh / 2, 0),
          [Math.cos(a) * d, 0, Math.sin(a) * d],
          P.obsidian[1],
          {
            q: qEuler(r.range(-0.5, 0.5), r.range(0, 6), r.range(-0.5, 0.5)),
            ...ground,
            aoAmt: 0,
          },
        );
      }
  } else if (variant === 1) {
    // sea stack: a leaning faceted pillar with a broken top, rubble at the foot and an ember crack
    const S = O.stack;
    const seg = hi ? S.sides : 5;
    const pil = new THREE.CylinderGeometry(S.r * 0.55, S.r, S.h, seg, hi ? 4 : 1).translate(
      0,
      S.h / 2,
      0,
    );
    // broken top: slope the upper ring
    const p = pil.getAttribute('position');
    for (let i = 0; i < p.count; i++)
      if (p.getY(i) > S.h - 0.01) p.setY(i, S.h - 0.35 + (p.getX(i) / S.r + 1) * 0.3);
    rough(pil, noise, O.noise * 1.3, 1.1);
    put(acc, pil, [0, 0, 0], glassColour(S.h, false, true), {
      q: qEuler(0.05, 0, -0.04),
      aoAmt: 0.2,
      ...ground,
    });
    const nS = hi ? 3 : 1;
    for (let i = 0; i < nS; i++) {
      const a = 1.2 + i * 2.1 + r.range(-0.3, 0.3);
      const h = r.range(0.7, 1.2);
      put(
        acc,
        rough(new THREE.ConeGeometry(0.28, h, hi ? 5 : 4, 1).translate(0, h / 2, 0), noise, 0.05),
        [Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05],
        glassColour(h, false, true),
        {
          q: qEuler(r.range(-0.3, 0.3), 0, r.range(-0.3, 0.3)),
          ...ground,
        },
      );
    }
    if (hi) {
      for (let i = 0; i < 3; i++) {
        const a = 3.3 + i * 1.3;
        put(
          acc,
          blob(0.42 + 0.1 * i, 0, noise, 0.25),
          [Math.cos(a) * 1.15, 0.05, Math.sin(a) * 1.15],
          glassColour(0.9, false, false),
          {
            s: [1, 0.6, 1],
            ...ground,
            aoAmt: 0.1,
          },
        );
      }
      // a lit crack running up the sunward face
      const pts = [0, 0.35, 0.8, 1.25, 1.7, 2.05];
      pts.forEach((y, i) => {
        if (i === pts.length - 1) return;
        const x0 = (i % 2 === 0 ? 0.06 : -0.1) + 0.0;
        const x1 = i % 2 === 0 ? -0.1 : 0.06;
        const rad = S.r * (1 - 0.45 * (y / S.h)) * 0.86;
        beam(
          acc,
          V(x0, y, rad),
          V(x1, pts[i + 1], rad - 0.08 * (pts[i + 1] / S.h)),
          0.05,
          P.lava,
          molten,
        );
      });
    }
  } else if (variant === 2) {
    // tide-pool slab: a ring of black glass round a turquoise pool, ember pebbles on the rim
    const L = O.slab;
    if (!hi) {
      put(acc, cylB(L.r, L.r * 0.92, L.h, 6), [0, 0, 0], P.obsidian[0], { aoAmt: 0.15, ...ground });
      put(
        acc,
        new THREE.CircleGeometry(L.pool, 5).rotateX(-Math.PI / 2),
        [0, L.h + 0.01, 0],
        P.glint,
        { aoAmt: 0, ao: () => 1, noJitter: true },
      );
      put(
        acc,
        new THREE.ConeGeometry(0.1, 0.5, 4, 1, true).translate(0, 0.25, 0),
        [L.r - 0.12, L.h * 0.8, 0],
        P.obsidian[2],
        { aoAmt: 0, ...ground },
      );
      return finish(acc, rng);
    }
    const shape = new THREE.Shape();
    shape.absarc(0, 0, L.r, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, L.pool, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const ring = new THREE.ExtrudeGeometry(shape, {
      depth: L.h,
      bevelEnabled: false,
      curveSegments: hi ? 9 : 5,
    }).rotateX(-Math.PI / 2);
    const rp = ring.getAttribute('position');
    for (let i = 0; i < rp.count; i++) {
      const k = noise.n2(rp.getX(i) * 1.7, rp.getZ(i) * 1.7);
      if (rp.getY(i) > L.h - 0.01) rp.setY(i, L.h + k * 0.09);
      rp.setX(i, rp.getX(i) * (1 + k * 0.08));
      rp.setZ(i, rp.getZ(i) * (1 + k * 0.08));
    }
    put(acc, ring, [0, 0, 0], (p) => col(P.obsidian[p.y > L.h * 0.75 ? 1 : 0]), {
      aoAmt: 0.15,
      ...ground,
    });
    put(
      acc,
      new THREE.CircleGeometry(L.pool + 0.04, hi ? 12 : 6).rotateX(-Math.PI / 2),
      [0, L.h * 0.5, 0],
      P.glint,
      {
        aoAmt: 0,
        ao: () => 1,
        noJitter: true,
      },
    );
    const nS = hi ? 3 : 1;
    for (let i = 0; i < nS; i++) {
      const a = 0.8 + i * 2.3;
      const h = r.range(0.3, 0.55);
      put(
        acc,
        new THREE.ConeGeometry(0.1, h, 5, 1).translate(0, h / 2, 0),
        [Math.cos(a) * (L.r - 0.12), L.h * 0.8, Math.sin(a) * (L.r - 0.12)],
        glassColour(h, false, true),
        {
          q: qEuler(r.range(-0.3, 0.3), 0, r.range(-0.3, 0.3)),
          ...ground,
        },
      );
    }
    if (hi)
      put(
        acc,
        new THREE.IcosahedronGeometry(0.07, 0),
        [L.r * 0.6, L.h + 0.05, -L.r * 0.5],
        P.ember,
        { aoAmt: 0, noJitter: true },
      );
  } else {
    // cairn: stacked flat black stones, an ember bead on top
    const Cn = O.cairn;
    if (!hi) {
      put(acc, blob(Cn.r * 0.8, 0, noise, 0.15), [0, Cn.r * 0.9, 0], P.obsidian[1], {
        s: [1, 1.5, 1],
        aoAmt: 0.12,
        ...ground,
      });
      return finish(acc, rng);
    }
    let y = 0;
    const nSt = Cn.n;
    for (let i = 0; i < nSt; i++) {
      const rad = Cn.r * (1 - (i / nSt) * 0.62) * r.range(0.92, 1.08);
      const hh = rad * 0.55;
      put(
        acc,
        blob(rad, 0, noise, 0.22, 1.5, i * 2.1),
        [r.range(-0.04, 0.04), y + hh * 0.5, r.range(-0.04, 0.04)],
        P.obsidian[i % 3],
        {
          s: [1, 0.55, 1],
          q: qEuler(0, r.range(0, 6), 0),
          aoAmt: 0.12,
          groundClamp: i === 0,
        },
      );
      y += hh * 0.85;
    }
    put(acc, new THREE.IcosahedronGeometry(0.08, 0), [0, y + 0.07, 0], P.ember, {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
      noJitter: true,
    });
  }
  const g = finish(acc, rng);
  if (variant === 2) addHook(g, 'pool', { at: [0, O.slab.h * 0.5, 0], r: O.slab.pool });
  return g;
}

/* ------------------------------- devopsBreakwater ------------------------------- */

/**
 * D18: a rubble mole of dark basalt along z (centred), a pale stone crest with orange kerbs and iron
 * bollards, tilted armour boulders on both flanks. v1 is a short piece with a ladder, v2 the head:
 * a round end with an orange-banded stone tower carrying the red harbour light.
 */
function devopsBreakwater({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const K = F.breakwater;
  const hi = lod === 0;
  const acc = new Acc();
  const L = K.length[variant];
  const hw = K.crestW / 2;
  const fw = K.footW / 2;
  const cy = K.crestY;
  const r = rng.fork('bw');
  const noise = createNoise(r.fork('n'));
  const isHead = variant === 2;
  const bodyL = isHead ? L - 2.2 : L;
  const bz = isHead ? -1.1 : 0;
  const slope = (fw - hw) / (cy - K.footY);
  const halfAt = (y: number): number => hw + (cy - y) * slope;
  put(
    acc,
    prism(
      [V2(-fw, K.footY), V2(fw, K.footY), V2(hw + 0.12, cy - 0.12), V2(-hw - 0.12, cy - 0.12)],
      bodyL,
    ),
    [0, 0, bz],
    P.basalt,
    { aoAmt: 0.1 },
  );
  bx(acc, K.crestW, 0.12, bodyL, 0, cy - 0.12, bz, P.basaltLight, { aoAmt: 0 });
  for (const sx of [-1, 1])
    bx(acc, 0.13, 0.08, bodyL, sx * (hw - 0.07), cy, bz, P.orange, { aoAmt: 0 });
  const endZ = L / 2 - 1.1;
  if (isHead) {
    // round end: a frustum cap one tower wide
    put(
      acc,
      new THREE.CylinderGeometry(hw + 0.12, fw, cy - K.footY - 0.12, hi ? 10 : 5).translate(
        0,
        (cy - 0.12 + K.footY) / 2,
        0,
      ),
      [0, 0, endZ],
      P.basalt,
      { aoAmt: 0.1 },
    );
    put(acc, cylB(hw, hw, 0.12, hi ? 10 : 6), [0, cy - 0.12, endZ], P.basaltLight, { aoAmt: 0 });
    // tower with a gallery and the red lens
    const T = K.light;
    put(acc, cylB(0.62, 0.46, 1.25, hi ? 8 : 5), [0, cy, endZ], P.paper, { aoAmt: 0.15 });
    put(acc, cylB(0.64, 0.64, 0.22, hi ? 8 : 5), [0, cy + 0.55, endZ], P.orange, { aoAmt: 0 });
    put(acc, cylB(0.62, 0.62, 0.1, hi ? 8 : 5), [0, cy + 1.25, endZ], P.iron, { aoAmt: 0 });
    lens(acc, [0, cy + 1.25 + 0.1 + T.r, endZ], T.r + 0.1, P.red, hi);
    put(
      acc,
      new THREE.ConeGeometry(T.r + 0.26, 0.38, hi ? 8 : 5),
      [0, cy + 1.3 + T.r * 2 + 0.32, endZ],
      P.orange,
      { aoAmt: 0 },
    );
  }
  if (isHead && hi)
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      if (Math.sin(a) < -0.55) continue;
      const y = r.range(0, 0.7);
      const rad = r.range(0.4, 0.55);
      const d = halfAt(y) + 0.1;
      put(
        acc,
        blob(rad, 0, noise, 0.28, 1.4, i * 2.3),
        [Math.cos(a) * d, y, endZ + Math.sin(a) * d],
        [P.basalt, P.basaltLight, P.steel][i % 3],
        { s: [1, 0.78, 1], aoAmt: 0.12 },
      );
    }
  // iron bollards down the crest, alternating sides
  if (hi) {
    const nB = Math.max(2, Math.round(bodyL / 2.4));
    for (let i = 0; i < nB; i++) {
      const z = bz - bodyL / 2 + 0.7 + (i * (bodyL - 1.4)) / Math.max(1, nB - 1);
      put(
        acc,
        cylB(K.bollard.r, K.bollard.r * 0.8, K.bollard.h, 6),
        [(i % 2 ? 1 : -1) * (hw - 0.4), cy, z],
        P.iron,
        { aoAmt: 0 },
      );
    }
  }
  // armour boulders on both flanks
  const nA = hi ? Math.max(3, Math.round(bodyL / 0.8)) : 0;
  for (const sx of [-1, 1])
    for (let i = 0; i < nA; i++) {
      const z =
        bz - bodyL / 2 + 0.5 + (i * (bodyL - 1)) / Math.max(1, nA - 1) + r.range(-0.15, 0.15);
      const y = r.range(0.0, 1.0);
      const rad = r.range(0.42, 0.62);
      put(
        acc,
        blob(rad, 0, noise, 0.28, 1.4, i * 1.7 + sx),
        [sx * (halfAt(y) + 0.02), y, z],
        [P.basalt, P.basaltLight, P.steel][(i + (sx > 0 ? 1 : 0)) % 3],
        {
          s: [1, 0.78, 1],
          aoAmt: 0.12,
        },
      );
    }
  if (variant === 1 && hi) {
    // iron ladder down the +x flank
    for (const dz of [-0.2, 0.2])
      beam(acc, V(hw - 0.1, cy + 0.35, dz), V(hw + 1.2, -0.7, dz), 0.05, P.iron);
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      beam(
        acc,
        V(hw - 0.1 + t * 1.3, cy + 0.2 - t * 1.75, -0.2),
        V(hw - 0.1 + t * 1.3, cy + 0.2 - t * 1.75, 0.2),
        0.04,
        P.steelPale,
      );
    }
  }
  const g = finish(acc, rng);
  addHook(g, 'crest', { y: cy, width: K.crestW, length: L });
  if (isHead) {
    addHook(g, 'light', { at: [0, cy + 1.35 + K.light.r, endZ] });
    addHook(g, 'end', { at: [0, cy, endZ + hw] });
  }
  return g;
}

/* ------------------------------- tugBoat (sailboat 9) ------------------------------- */

/** Half-width of the tug hull (`hullShape(4.6, 1.9)`) at z, for the bulwark posts. */
function tugHalf(z: number): number {
  const h = F.tug.length / 2;
  const w = F.tug.beam / 2;
  const a = -h * 0.4;
  const b = h * 0.35;
  if (z < a) return w * 0.7 + ((z + h) / (a + h)) * (w * 0.3);
  if (z < b) return w - ((z - a) / (b - a)) * (w * 0.06);
  return Math.max(0, w * 0.94 * (1 - (z - b) / (h - b)));
}

/**
 * D18 tug: sailboat variant 9. Graphite hull with an orange sheer stripe and a steel deck, cream
 * deckhouse with a lit wheelhouse, a red funnel with an orange band, a tyre fender on the bow, a
 * towing arch and bitts aft, a masthead lamp. Bow +z, keel at y = 0; LOD1 keeps hull, house, funnel.
 */
export function tugBoat({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const T = F.tug;
  const hi = lod === 0;
  const acc = seedAcc(rng, 0.02);
  const L = T.length;
  const W = T.beam;
  const hh = T.hullH;
  const ext = (depth: number): THREE.BufferGeometry =>
    new THREE.ExtrudeGeometry(hullShape(L, W), { depth, bevelEnabled: false }).rotateX(Math.PI / 2);
  const bands: ReadonlyArray<readonly [number, number, string]> = hi
    ? [
        [0, 0.24, P.iron],
        [0.24, 0.5, P.iron],
        [0.5, 0.6, P.orange],
        [0.6, hh, P.iron],
      ]
    : [
        [0, 0.5, P.iron],
        [0.5, hh, P.iron],
      ];
  for (const [y0, y1, c] of bands)
    put(
      acc,
      ext(y1 - y0),
      [0, y1, 0],
      (p) => (y1 === hh && p.y > hh - 0.01 ? col(P.steelLight) : col(c)),
      {
        aoAmt: 0.2,
        noJitter: true,
      },
    );
  const deck = hh;
  // deckhouse, wheelhouse on top (windows lit), roof
  bx(acc, 1.3, 0.75, 1.5, 0, deck, -0.4, P.cream, { aoAmt: 0.12 });
  bx(acc, 1.04, 0.5, 0.95, 0, deck + 0.75, -0.1, P.paper, { aoAmt: 0.1 });
  bx(acc, 1.28, 0.09, 1.2, 0, deck + 1.25, -0.1, P.orange, { aoAmt: 0.05 });
  if (hi) {
    // bulwark posts + a rope rail round the foredeck and the stern
    for (const sx of [-1, 1]) {
      const pts: Pt[] = [];
      for (const z of [0.55, 0.95, 1.35, 1.7, -1.55, -1.95]) {
        const x = sx * (tugHalf(z) - 0.07);
        bx(acc, 0.04, 0.3, 0.04, x, deck, z, P.iron, { aoAmt: 0 });
        pts.push(V(x, deck + 0.3, z));
      }
      beam(acc, pts[0], pts[3], 0.03, P.steelPale);
      beam(acc, pts[4], pts[5], 0.03, P.steelPale);
    }
    // lifebuoy on the house side
    put(acc, new THREE.TorusGeometry(0.15, 0.05, 3, 6), [0.67, deck + 0.45, -0.55], P.red, {
      q: qEuler(0, Math.PI / 2, 0),
      aoAmt: 0,
    });
    put(acc, new THREE.TorusGeometry(0.15, 0.05, 3, 6), [-0.67, deck + 0.45, -0.55], P.red, {
      q: qEuler(0, Math.PI / 2, 0),
      aoAmt: 0,
    });
  }
  if (hi) {
    bx(acc, 0.8, 0.26, 0.05, 0, deck + 0.9, 0.4, P.window, lamp);
    for (const sx of [-1, 1]) {
      bx(acc, 0.05, 0.26, 0.55, sx * 0.53, deck + 0.9, -0.1, P.window, lamp);
      bx(acc, 0.05, 0.25, 0.4, sx * 0.66, deck + 0.28, -0.4, P.window, lamp);
    }
  } else bx(acc, 0.9, 0.2, 0.06, 0, deck + 0.9, 0.38, P.window, lamp);
  // funnel behind the wheelhouse: red with an orange band and an iron cap
  const fz = T.funnelZ - 0.35;
  put(acc, cylB(0.27, 0.22, 0.95, hi ? 8 : 5), [0, deck + 0.75, fz], P.red, { aoAmt: 0.1 });
  if (hi) put(acc, cylB(0.28, 0.28, 0.14, 8), [0, deck + 1.28, fz], P.orange, { aoAmt: 0 });
  if (hi) put(acc, cylB(0.24, 0.24, 0.1, 8), [0, deck + 1.66, fz], P.iron, { aoAmt: 0 });
  const smoke: [number, number, number] = [0, deck + 1.78, fz];
  // mast and masthead lamp
  put(acc, cylB(0.035, 0.03, 0.5, 4, true), [0, deck + 1.34, 0.05], P.iron, { aoAmt: 0 });
  const lampAt: [number, number, number] = [0, deck + 1.9, 0.05];
  lens(acc, lampAt, 0.09, P.glow, hi);
  if (hi) {
    // square DevOps pennant streaming aft
    const flag = new THREE.ShapeGeometry(
      new THREE.Shape([V2(0, 0.13), V2(0.5, 0.13), V2(0.5, -0.13), V2(0, -0.13)]),
    );
    put(acc, flag, [0, deck + 1.72, 0.05], P.orange, {
      q: qEuler(0, Math.PI / 2, 0),
      double: true,
      aoAmt: 0,
      ao: () => 1,
      windAbs: (p) => Math.min(1, Math.max(0, (0.05 - p.z) / 0.5)) * 0.9 + 0.1,
    });
  }
  // bow: tyre fender and a bollard
  const bowZ = L / 2;
  if (hi) {
    for (const [x, z, ry] of [
      [0, bowZ - 0.1, 0],
      [0.3, bowZ - 0.42, 0.5],
      [-0.3, bowZ - 0.42, -0.5],
    ] as const)
      put(acc, new THREE.TorusGeometry(0.19, 0.085, 3, 6), [x, 0.4, z], P.iron, {
        q: qEuler(0, ry, 0),
        aoAmt: 0,
      });
    put(acc, cylB(0.09, 0.08, 0.24, 6), [0, deck, 1.4], P.steelPale, { aoAmt: 0 });
  } else bx(acc, 0.4, 0.3, 0.2, 0, 0.3, bowZ - 0.2, P.iron, { aoAmt: 0 });
  // aft: a towing arch over the deck and the twin bitts under it
  const az = T.bittZ + 0.3;
  if (hi)
    for (const sx of [-1, 1]) bx(acc, 0.08, 0.9, 0.08, sx * 0.55, deck, az, P.orange, { aoAmt: 0 });
  bx(acc, 1.2, 0.08, 0.1, 0, deck + 0.9, az, P.orange, { aoAmt: 0 });
  if (hi)
    for (const sx of [-1, 1])
      put(acc, cylB(0.1, 0.08, 0.26, 6), [sx * 0.35, deck, T.bittZ - 0.25], P.steelPale, {
        aoAmt: 0,
      });
  const g = acc.finish(rng, true, true);
  addHook(g, 'smoke', { at: smoke });
  addHook(g, 'tow', { at: [0, deck + 0.45, T.bittZ - 0.25] });
  addHook(g, 'bow', { at: [0, deck, bowZ - 0.05] });
  addHook(g, 'lamp', { at: lampAt });
  addHook(g, 'route', { speed: T.speed, lead: T.lead });
  return g;
}

/* ------------------------------- defs ------------------------------- */

export const DEVOPS_M26_GEO: readonly PropGeoDef[] = [
  {
    id: 'emberBridge',
    variants: 2,
    build: emberBridge,
    footprint: 4.6,
    height: 2.85,
    heights: [2.85, 2.85],
    windy: false,
  },
  { id: 'craterDeck', variants: 1, build: craterDeck, footprint: 2.6, height: 2.1, windy: false },
  { id: 'glassKiln', variants: 1, build: glassKiln, footprint: 3.4, height: 4.1, windy: false },
  {
    id: 'obsidianShard',
    variants: F.obsidian.variants,
    build: obsidianShard,
    footprint: 1.2,
    height: 1.5,
    heights: F.obsidian.heights,
    windy: false,
  },
  {
    id: 'devopsBreakwater',
    variants: 3,
    build: devopsBreakwater,
    footprint: 4,
    height: 2,
    heights: F.breakwater.heights,
    windy: false,
  },
];
