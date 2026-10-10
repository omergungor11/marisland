/**
 * QA Test Factory structures (M17b TASK-401): testHangar (sawtooth roof, chimneys, lit windows),
 * conveyor (one 2 u belt segment on legs; bridges are rows of them), testTrack (the crash-test
 * loop track, centreline from qa-track.ts) and qaTower (the hero landmark: a giant green check on
 * a lattice mast). Plus the crate-cart mesh the movers ride (not a prop). Sizes and colours:
 * content/themes/qa.ts QA_FACTORY. Defs: content/props-themes/qa.ts.
 *
 * Hooks (userData.hooks): testHangar.door `{ center, normal }`; conveyor.belt `{ top, length }`.
 */
import * as THREE from 'three';
import { QA_FACTORY as F } from '../../content/themes/qa.ts';
import { Acc, qEuler, qFromTo, type ColorFn } from '../kit.ts';
import { glyph, sawtoothRoof } from '../office-kit.ts';
import { V, baseBox, cylB, jitterAcc, put, windowAt } from '../parts.ts';
import type { BuildOpts } from '../types.ts';
import { addHook } from './hq.ts';
import { trackPath } from './qa-track.ts';
import { createRng } from '../../core/rng.ts';

const Y = V(0, 1, 0);

/** Square beam from a to b (thickness `th`). */
function beam(acc: Acc, a: THREE.Vector3, b: THREE.Vector3, th: number, color: string): void {
  const d = b.clone().sub(a);
  put(acc, baseBox(th, d.length(), th), a, color, { q: qFromTo(Y, d), aoAmt: 0 });
}

/* --------------------------------- testHangar --------------------------------- */

/**
 * Chunky test hangar, door (+z) to the factory yard: plinth, pastel walls, a 3-row sawtooth roof
 * with warm north-light glazing, big yellow door with a hazard band, window rows, short candy
 * chimneys (FIXTURE_EMITTERS steam), a QA check over the door.
 */
export function testHangar({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const H = F.hangar;
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const v = variant % 2;
  const { w, d, h } = H;
  const y0 = 0.25;
  put(acc, baseBox(w + 0.4, y0, d + 0.4), [0, 0, 0], H.plinth, { aoAmt: 0.2 });
  put(acc, baseBox(w, h, d), [0, y0, 0], H.walls[v], { aoAmt: 0.18 });
  put(acc, baseBox(w + 0.08, 0.7, d + 0.08), [0, y0, 0], H.bands[v], { aoAmt: 0.1 });
  // trim band at the wall top
  put(acc, baseBox(w + 0.12, 0.22, d + 0.12), [0, y0 + h - 0.22, 0], H.trim, { aoAmt: 0 });
  sawtoothRoof(acc, {
    w,
    d,
    y: y0 + h,
    teeth: H.teeth,
    rise: H.rise,
    roof: H.roofs[v],
    glass: H.window,
    lod,
  });
  // big door (yellow) with a hazard band and a check over it
  const dw = 3.2;
  const dh = 2.9;
  put(acc, baseBox(dw + 0.3, dh + 0.18, 0.12), [0, y0, d / 2], H.trim, { aoAmt: 0 });
  put(acc, baseBox(dw, dh, 0.1), [0, y0, d / 2 + 0.06], H.door, { aoAmt: 0.05 });
  if (hi) {
    for (let i = 0; i < 6; i++)
      put(
        acc,
        baseBox(dw / 6, 0.22, 0.04),
        [-dw / 2 + dw / 12 + (i * dw) / 6, y0 + 0.08, d / 2 + 0.12],
        i % 2 ? H.door : H.stripe,
        { aoAmt: 0 },
      );
    // door panel seams
    for (const x of [-dw / 4, 0, dw / 4])
      put(acc, baseBox(0.05, dh - 0.4, 0.03), [x, y0 + 0.35, d / 2 + 0.115], H.trim, { aoAmt: 0 });
    glyph(acc, 'qa', V(0, y0 + dh + 0.55, d / 2 + 0.08), 0, 0.55, H.trim);
    // front windows either side of the door, side and back rows
    for (const x of [-3.2, 3.2])
      windowAt(acc, {
        at: V(x, y0 + 2, d / 2),
        yaw: 0,
        w: 1.2,
        h: 1.0,
        frame: H.trim,
        glow: H.window,
      });
    for (const sx of [-1, 1])
      for (const z of [-2, 0, 2])
        windowAt(acc, {
          at: V((sx * w) / 2, y0 + 2.2, z),
          yaw: (sx * Math.PI) / 2,
          w: 0.9,
          h: 0.8,
          frame: H.trim,
          glow: H.window,
        });
    for (const x of [-3, -1, 1, 3])
      windowAt(acc, {
        at: V(x, y0 + 2.2, -d / 2),
        yaw: Math.PI,
        w: 1.0,
        h: 0.9,
        frame: H.trim,
        glow: H.window,
      });
    // bumpers and a lamp by the door
    for (const x of [-dw / 2 - 0.35, dw / 2 + 0.35])
      put(acc, baseBox(0.3, 0.5, 0.25), [x, y0, d / 2 + 0.14], H.stripe, { aoAmt: 0.1 });
    put(
      acc,
      new THREE.IcosahedronGeometry(0.16, 1),
      [dw / 2 + 0.45, y0 + dh + 0.2, d / 2 + 0.2],
      H.window,
      {
        emissive: 1,
        ao: () => 1,
      },
    );
  } else {
    // LOD1: the window rows as glow strips (same colour mass)
    put(acc, new THREE.PlaneGeometry(w - 0.6, 0.8), [0, y0 + 2.2, -d / 2 - 0.01], H.window, {
      q: qEuler(0, Math.PI, 0),
      emissive: 1,
      ao: () => 1,
    });
    for (const sx of [-1, 1])
      put(
        acc,
        new THREE.PlaneGeometry(d - 1.2, 0.8),
        [sx * (w / 2 + 0.01), y0 + 2.2, 0],
        H.window,
        {
          q: qEuler(0, (sx * Math.PI) / 2, 0),
          emissive: 1,
          ao: () => 1,
        },
      );
  }
  // short chimneys: white stack, red band, dark cap (steam: FIXTURE_EMITTERS)
  const seg = hi ? 10 : 6;
  const top = y0 + h;
  for (const c of H.chimneys[v]) {
    put(acc, cylB(H.chimneyR, H.chimneyR * 0.85, H.chimneyH, seg), [c.x, top, c.z], H.chimneyBody, {
      aoAmt: 0.1,
    });
    put(
      acc,
      cylB(H.chimneyR * 0.9, H.chimneyR * 0.9, 0.34, seg),
      [c.x, top + H.chimneyH - 0.62, c.z],
      H.chimneyBand,
      { aoAmt: 0, s: [1.04, 1, 1.04] },
    );
    put(
      acc,
      cylB(H.chimneyR + 0.06, H.chimneyR + 0.04, 0.16, seg),
      [c.x, top + H.chimneyH, c.z],
      H.stripe,
      {
        aoAmt: 0,
      },
    );
  }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'door', { center: [0, y0, d / 2 + 0.2], normal: [0, 0, 1] });
}

/** Steam spots of a hangar variant (local, above the pivot): the chimney tops. */
export function hangarChimneyTops(variant: number): { x: number; y: number; z: number }[] {
  const H = F.hangar;
  return H.chimneys[variant % 2].map((c) => ({
    x: c.x,
    y: 0.25 + H.h + H.chimneyH + 0.25,
    z: c.z,
  }));
}

/* ---------------------------------- conveyor ---------------------------------- */

/**
 * One conveyor bridge segment along local z (length F.belt.seg, centred): grey belt between
 * yellow side rails, rollers under it, a leg pair with feet and a cross brace. Rows of segments
 * make the bridge; crates ride it (render/movers.ts).
 */
export function conveyor({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const B = F.belt;
  const acc = jitterAcc(rng, 0.0);
  const hi = lod === 0;
  const L = B.seg;
  const W = B.width;
  const top = B.top;
  // belt (top at `top`) + side rails rising 0.1 over it (hide the cart wheels)
  put(acc, baseBox(W, 0.24, L), [0, top - 0.24, 0], B.surface, { aoAmt: 0 });
  for (const sx of [-1, 1])
    put(acc, baseBox(0.12, 0.42, L), [sx * (W / 2 + 0.06), top - 0.32, 0], B.frame, {
      aoAmt: 0.05,
    });
  // legs at the segment middle
  const legX = W / 2 + 0.02;
  for (const sx of [-1, 1]) {
    put(acc, baseBox(0.16, top - 0.32, 0.16), [sx * legX, 0, 0], B.leg, { aoAmt: 0.2 });
    if (hi) put(acc, baseBox(0.36, 0.08, 0.36), [sx * legX, 0, 0], B.roller, { aoAmt: 0.2 });
  }
  if (hi) {
    put(acc, baseBox(W + 0.1, 0.12, 0.12), [0, top * 0.45, 0], B.leg, { aoAmt: 0 });
    for (const z of [-L / 3, 0, L / 3])
      put(acc, new THREE.CylinderGeometry(0.1, 0.1, W - 0.05, 8), [0, top - 0.33, z], B.roller, {
        q: qEuler(0, 0, Math.PI / 2),
        aoAmt: 0,
      });
    // belt slats (darker ridges across the surface)
    for (let k = 0; k < 5; k++)
      put(acc, baseBox(W - 0.02, 0.02, 0.06), [0, top, -L / 2 + (k + 0.5) * (L / 5)], B.roller, {
        aoAmt: 0,
      });
  }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'belt', { top, length: L });
}

/* ---------------------------------- testTrack --------------------------------- */

/** Square tube along a track rail: centreline offset by `side` along r and `lift` along u. */
function railTube(
  acc: Acc,
  path: ReturnType<typeof trackPath>,
  side: number,
  lift: number,
  r: number,
  color: ColorFn,
): void {
  const N = path.p.length;
  const ring = (i: number): THREE.Vector3[] => {
    const p = path.p[i % N];
    const u = path.u[i % N];
    const rr = path.r[i % N];
    const c = V(
      p[0] + rr[0] * side + u[0] * lift,
      p[1] + rr[1] * side + u[1] * lift,
      p[2] + rr[2] * side + u[2] * lift,
    );
    const U = V(u[0], u[1], u[2]).multiplyScalar(r);
    const R = V(rr[0], rr[1], rr[2]).multiplyScalar(r);
    return [
      c.clone().add(U).add(R),
      c.clone().add(U).sub(R),
      c.clone().sub(U).sub(R),
      c.clone().sub(U).add(R),
    ];
  };
  const pos: number[] = [];
  let a = ring(0);
  for (let i = 1; i <= N; i++) {
    const b = ring(i);
    for (let k = 0; k < 4; k++) {
      const a0 = a[k];
      const a1 = a[(k + 1) % 4];
      const b0 = b[k];
      const b1 = b[(k + 1) % 4];
      pos.push(a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, b0.x, b0.y, b0.z);
      pos.push(a0.x, a0.y, a0.z, a1.x, a1.y, a1.z, b1.x, b1.y, b1.z);
    }
    a = b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // corners run +u+r → +u−r → …: (a0, b1, b0) faces outward
  acc.add(g, { color, aoAmt: 0, windMul: 0 });
}

/**
 * Crash-test loop track (local z = the long axis): concrete slab with a lawn infield, twin
 * rails with a green vertical loop on its A-frame, sleepers on the flat, a chequered start gate
 * and a red crash pad. The test cart (render/movers.ts) laps it.
 */
export function testTrack({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const T = F.track;
  const acc = new Acc();
  const hi = lod === 0;
  const path = trackPath(hi ? 0.4 : 1.1);
  const hx = path.halfX + 0.6;
  const hz = path.halfZ + 0.6;
  put(acc, baseBox(hx * 2, 0.1, hz * 2), [0, 0, 0], T.slab, { aoAmt: 0.15 });
  // lawn infield between the straights (trackPath centres the rails: straights at
  // x = −b − shift/2 and b ∓ shift/2, z offset −shift/4)
  const half = T.b - T.gauge / 2 - 0.35;
  put(acc, baseBox(half * 2, 0.12, T.a * 2), [-T.shift / 2, 0, -T.shift / 4], T.infield, {
    aoAmt: 0,
  });
  const railCol: ColorFn = (p) => new THREE.Color(p.y > T.railY + 0.15 ? T.loop : T.rails);
  if (hi) {
    for (const sd of [-T.gauge / 2, T.gauge / 2]) railTube(acc, path, sd, T.railY, T.rail, railCol);
    // sleepers on the flat
    path.p.forEach((p, i) => {
      if (i % 2 || p[1] > 0.02) return;
      const t = path.t[i];
      put(acc, baseBox(T.gauge + 0.34, 0.08, 0.18), [p[0], 0.1, p[2]], T.sleeper, {
        q: qEuler(0, Math.atan2(t[0], t[2]), 0),
        aoAmt: 0,
      });
    });
  } else {
    // LOD1: one fat rail (same colour split) on the same line
    railTube(acc, path, 0, T.railY, T.gauge / 2, railCol);
  }
  // the loop's A-frame: posts either side of the loop top, a beam over it
  const R = T.loopR;
  let top = 0;
  for (let i = 1; i < path.p.length; i++) if (path.p[i][1] > path.p[top][1]) top = i;
  const lt = path.p[top];
  const yTop = 2 * R + T.railY + 0.25;
  for (const sx of [-1, 1]) {
    const x = lt[0] + sx * (T.gauge / 2 + 0.45 + T.shift / 2);
    beam(acc, V(x, 0.1, lt[2] - 0.7), V(x, yTop, lt[2]), hi ? 0.16 : 0.24, T.post);
    if (hi) beam(acc, V(x, 0.1, lt[2] + 0.7), V(x, yTop, lt[2]), 0.16, T.post);
  }
  put(
    acc,
    baseBox(T.gauge + 0.9 + T.shift + 0.3, 0.18, 0.24),
    [lt[0], yTop - 0.05, lt[2]],
    T.post,
    {
      aoAmt: 0,
    },
  );
  // start gate over sample 0 (the cart waits here): two posts, chequered banner, green lamp
  const s0 = path.p[0];
  const gx = s0[0];
  const gz = s0[2];
  const gh = 1.7;
  for (const sx of [-1, 1])
    put(acc, baseBox(0.14, gh, 0.14), [gx + sx * (T.gauge / 2 + 0.35), 0.1, gz], T.flag, {
      aoAmt: 0.1,
    });
  const bw = T.gauge + 0.84;
  if (hi) {
    for (let k = 0; k < 8; k++)
      for (let row = 0; row < 2; row++)
        put(
          acc,
          baseBox(bw / 8, 0.16, 0.06),
          [gx - bw / 2 + (k + 0.5) * (bw / 8), 0.1 + gh - 0.36 + row * 0.16, gz],
          (k + row) % 2 ? T.rails : T.flag,
          { aoAmt: 0 },
        );
    put(acc, new THREE.IcosahedronGeometry(0.13, 1), [gx, 0.1 + gh + 0.12, gz], T.loop, {
      emissive: 1,
      ao: () => 1,
    });
    // crash pad off the far bend + a cone pair
    put(acc, baseBox(1.3, 0.6, 0.45), [0, 0.1, path.halfZ + 0.25], T.pad, { aoAmt: 0.1 });
    put(acc, baseBox(1.3, 0.12, 0.47), [0, 0.42, path.halfZ + 0.25], T.rails, { aoAmt: 0 });
  } else {
    put(acc, baseBox(bw, 0.32, 0.06), [gx, 0.1 + gh - 0.36, gz], T.flag, { aoAmt: 0 });
    put(acc, baseBox(1.3, 0.6, 0.45), [0, 0.1, path.halfZ + 0.25], T.pad, { aoAmt: 0.1 });
  }
  return acc.finish(rng, false, true);
}

/* ----------------------------------- qaTower ---------------------------------- */

/**
 * The QA tower (hero landmark, readable from T0): a tapered lattice mast on a plinth carrying a
 * giant white disc with a green check on both faces (glows at night) and a red air-warning lamp.
 */
export function qaTower({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const T = F.tower;
  const acc = jitterAcc(rng, 0.0);
  const hi = lod === 0;
  const y0 = 0.45;
  put(acc, cylB(T.base + 0.9, T.base + 0.7, y0, hi ? 10 : 6), [0, 0, 0], T.plinth, { aoAmt: 0.2 });
  const corner = (y: number): number => T.base + (T.top - T.base) * ((y - y0) / T.h);
  const legAt = (sx: number, sz: number, y: number): THREE.Vector3 =>
    V(sx * corner(y), y, sz * corner(y));
  const cs: [number, number][] = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];
  const yt = y0 + T.h;
  for (const [sx, sz] of cs)
    beam(acc, legAt(sx, sz, y0), legAt(sx, sz, yt), hi ? 0.26 : 0.34, T.leg);
  const bays = hi ? T.bays : 2;
  for (let k = 1; k <= bays; k++) {
    const ya = y0 + (T.h * (k - 1)) / bays;
    const yb = y0 + (T.h * k) / bays;
    for (let e = 0; e < 4; e++) {
      const [ax, az] = cs[e];
      const [bx, bz] = cs[(e + 1) % 4];
      beam(acc, legAt(ax, az, yb), legAt(bx, bz, yb), hi ? 0.14 : 0.2, T.brace);
      if (hi) {
        beam(acc, legAt(ax, az, ya), legAt(bx, bz, yb), 0.1, T.brace);
        beam(acc, legAt(bx, bz, ya), legAt(ax, az, yb), 0.1, T.brace);
      }
    }
  }
  // platform under the sign
  put(acc, baseBox(T.top * 2 + 0.8, 0.22, T.top * 2 + 0.8), [0, yt, 0], T.rim, { aoAmt: 0 });
  // the sign: white disc (faces ±z), green rim, a check on both faces
  const R = T.board;
  const cy = yt + 0.2 + R;
  const seg = hi ? 24 : 10;
  put(acc, new THREE.CylinderGeometry(R, R, 0.3, seg), [0, cy, 0], T.boardColor, {
    q: qEuler(Math.PI / 2, 0, 0),
    aoAmt: 0,
    ao: () => 1,
  });
  if (hi)
    put(acc, new THREE.TorusGeometry(R, 0.2, 6, seg), [0, cy, 0], T.rim, { aoAmt: 0, ao: () => 1 });
  // check strokes (board units → u): short arm down-right into the elbow, long arm up-right
  const S = T.stroke;
  const p0 = V(-0.62 * R, cy + 0.02 * R, 0);
  const p1 = V(-0.16 * R, cy - 0.48 * R, 0);
  const p2 = V(0.66 * R, cy + 0.5 * R, 0);
  for (const [a, b] of [
    [p0, p1],
    [p1, p2],
  ] as const) {
    const dvec = b.clone().sub(a);
    const len = dvec.length() + S * 0.5;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const ang = Math.atan2(dvec.y, dvec.x);
    put(acc, new THREE.BoxGeometry(len, S, 0.5), mid, T.check, {
      q: qEuler(0, 0, ang),
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
  }
  // air-warning lamp on a stub over the disc
  put(acc, cylB(0.09, 0.09, 0.5, 5), [0, cy + R, 0], T.leg, { aoAmt: 0 });
  put(acc, new THREE.IcosahedronGeometry(0.2, hi ? 1 : 0), [0, cy + R + 0.55, 0], T.lamp, {
    emissive: 1,
    ao: () => 1,
  });
  return acc.finish(rng, false, true);
}

/* --------------------------------- crate cart --------------------------------- */

/**
 * The mover mesh (render/movers.ts): a wheeled chassis carrying a wooden crate with a green check
 * sticker. On a belt the chassis sinks into the belt (hidden by its rails); on the track it is the
 * test cart. Pivot = the chassis floor centre, front +z.
 */
export function buildCrateCart(): THREE.BufferGeometry {
  const K = F.crate;
  const acc = new Acc();
  const s = K.size;
  const ch = K.chassis;
  put(acc, baseBox(s + 0.04, 0.07, s + 0.14), [0, ch - 0.08, 0], K.frame, { aoAmt: 0 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      put(
        acc,
        new THREE.CylinderGeometry(0.085, 0.085, 0.08, 8),
        [sx * (s / 2 - 0.02), 0.085, sz * (s / 2 - 0.06)],
        K.wheel,
        { q: qEuler(0, 0, Math.PI / 2), aoAmt: 0 },
      );
  put(acc, baseBox(s, s, s), [0, ch, 0], K.wood, { aoAmt: 0.12 });
  for (const y of [0.12, s - 0.18])
    put(acc, baseBox(s + 0.03, 0.07, s + 0.03), [0, ch + y, 0], K.band, { aoAmt: 0 });
  for (const sz of [-1, 1])
    put(
      acc,
      new THREE.PlaneGeometry(s * 0.42, s * 0.3),
      [0, ch + s * 0.55, sz * (s / 2 + 0.02)],
      K.sticker,
      {
        q: qEuler(0, sz > 0 ? 0 : Math.PI, 0),
        aoAmt: 0,
        ao: () => 1,
      },
    );
  put(acc, new THREE.PlaneGeometry(s * 0.5, s * 0.5), [0, ch + s + 0.01, 0], K.sticker, {
    q: qEuler(-Math.PI / 2, 0, 0),
    aoAmt: 0,
    ao: () => 1,
  });
  return acc.finish(createRng(401).fork('crate-cart'), false, true);
}
