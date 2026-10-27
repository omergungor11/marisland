/**
 * HQ yacht marina and star fort geometry (M29 TASK-505, D-085): `marinaPier` (5 variants: comb
 * finger 12 u, short finger 8 u, spine piece 6 u, breakwater mole piece 8 u, mole head with the
 * green harbour light), `starFort` (a 5-pointed bastion with sloped walls, gun embrasures, a keep
 * with the red harbour light and a fluttering flag) and the extra sailboat variants of the marina
 * fleet (`marinaBoat`: 6 / 7 sloops with a mast-head lamp, 8 the tender). Sizes, palette and
 * placement: content/themes/hq-marina.ts; defs: content/props-themes/hq-marina.ts.
 *
 * Frames: every def stands on the waterline (pivot y = 0, the pile feet / plinth reach below).
 * Fingers run from z = 0 (root) to z = L; spine, mole pieces and the mole head are centred on z = 0
 * (the head's round end and tower sit towards +z, the open sea). The fort's landing is at local +z.
 * Boats: bow +z, keel y = 0, like every sailboat variant; LOD0 bobs (`tagBob`).
 *
 * Hooks (userData.hooks): starFort.flag `{ at }` (pole top), starFort.light `{ at }` (red lens).
 */
import * as THREE from 'three';
import {
  MARINA_BOATS as B,
  MARINA_PAL as P,
  MARINA_PIER as K,
  STAR_FORT as F,
} from '../../content/themes/hq-marina.ts';
import { gridSurface, hullShape } from '../coastal.ts';
import { blob, col, createNoise, qEuler, type Acc } from '../kit.ts';
import { V, V2, baseBox, cylB, jitterAcc, prism, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { addHook, pennant } from './hq.ts';
import { tagBob } from './surface-tags.ts';

type Pt = THREE.Vector3;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const glow = { aoAmt: 0, ao: () => 1, emissive: 1, noJitter: true } as const;

/** An emissive lens: an icosahedron (LOD0) or an octahedron (LOD1). */
function lens(acc: Acc, at: [number, number, number], r: number, color: string, hi: boolean): void {
  put(
    acc,
    hi ? new THREE.IcosahedronGeometry(r, 0) : new THREE.OctahedronGeometry(r, 0),
    at,
    color,
    glow,
  );
}

/* --------------------------------- marinaPier --------------------------------- */

/** Pile row: a post every `postEvery` u down both edges of a deck of width `w`, centred at z0 over `len`. */
function piles(acc: Acc, hi: boolean, w: number, z0: number, len: number): void {
  const n = Math.max(2, Math.round(len / K.postEvery) + 1);
  for (let i = 0; i < n; i++) {
    const z = z0 + (n === 1 ? 0 : (i / (n - 1)) * len);
    for (const sx of [-1, 1])
      put(
        acc,
        cylB(0.13, 0.1, K.deckY + K.postH - K.pileY, hi ? 6 : 4),
        [sx * (w / 2 + 0.05), K.pileY, z],
        K.post,
        { aoAmt: 0.2 },
      );
  }
}

/** Plank deck of width `w` from z0 to z0 + len, kerb boards along both edges, seams across (LOD0). */
function deck(acc: Acc, hi: boolean, w: number, z0: number, len: number): void {
  put(acc, baseBox(w, 0.16, len), [0, K.deckY - 0.16, z0 + len / 2], K.deck, { aoAmt: 0.1 });
  if (!hi) return;
  for (const sx of [-1, 1])
    put(acc, baseBox(0.1, 0.14, len - 0.4), [sx * (w / 2 - 0.05), K.deckY, z0 + len / 2], K.post, {
      aoAmt: 0,
    });
  for (let z = z0 + 0.8; z < z0 + len - 0.3; z += 0.8)
    put(acc, baseBox(w - 0.2, 0.025, 0.05), [0, K.deckY, z], K.plank, { aoAmt: 0, ao: () => 1 });
}

function finger(acc: Acc, hi: boolean, L: number): void {
  const w = K.deckW;
  // a wider apron where it meets the spine
  put(acc, baseBox(w + 0.9, 0.2, 1.3), [0, K.deckY - 0.26, 0.65], K.plank, { aoAmt: 0.1 });
  deck(acc, hi, w, 0, L);
  if (hi) piles(acc, hi, w, 0.6, L - 1.2);
  // end lantern: a pole, the lens and a coral cap (the lamp set: emissive 1)
  const T = K.lantern;
  put(acc, cylB(0.05, 0.05, T.h, 4, true), [0, K.deckY, L - 0.35], T.pole, { aoAmt: 0 });
  lens(acc, [0, K.deckY + T.h + 0.06, L - 0.35], T.r, T.lens, hi);
  put(
    acc,
    new THREE.ConeGeometry(T.r + 0.1, 0.2, hi ? 6 : 4),
    [0, K.deckY + T.h + 0.3, L - 0.35],
    P.coral,
    {
      aoAmt: 0,
    },
  );
}

function spine(acc: Acc, hi: boolean, L: number): void {
  const w = K.spine.w;
  deck(acc, hi, w, -L / 2, L);
  if (hi) piles(acc, hi, w, -L / 2 + 0.5, L - 1);
}

/** Armour blocks of the mole, tilted onto the flanks. */
function moleBody(acc: Acc, hi: boolean, L: number, rng: BuildOpts['rng'], zc = 0): void {
  const M = K.mole;
  const hw = M.crestW / 2;
  const fw = M.footW / 2;
  const core = [
    V2(-fw, M.footY),
    V2(fw, M.footY),
    V2(hw + 0.15, M.crestY - 0.25),
    V2(-hw - 0.15, M.crestY - 0.25),
  ];
  put(acc, prism(core, L), [0, 0, zc], M.block[1], { aoAmt: 0.1 });
  if (!hi) {
    put(acc, baseBox(M.crestW, 0.3, L), [0, M.crestY - 0.3, zc], M.cap, { aoAmt: 0 });
    return;
  }
  const r = rng.fork('mole');
  // crest: cream cap stones
  const nb = Math.max(2, Math.round(L / 1.3));
  for (let i = 0; i < nb; i++)
    put(
      acc,
      baseBox(M.crestW + 0.1, 0.45 + r.range(0, 0.12), L / nb - 0.06),
      [r.range(-0.05, 0.05), M.crestY - 0.55, zc - L / 2 + (i + 0.5) * (L / nb)],
      i % 2 === 0 ? M.cap : M.block[2],
      { aoAmt: 0.08, q: qEuler(0, r.range(-0.04, 0.04), 0) },
    );
  // flank rows of tilted armour blocks, two courses a side
  const rows: [number, number, number, number][] = [
    [1.55, 0.35, 1.05, 0.75],
    [2.25, -0.55, 1.25, 0.9],
  ];
  for (const [x, y, bw, bh] of rows) {
    const k = Math.max(2, Math.round(L / 1.6));
    for (const sx of [-1, 1])
      for (let i = 0; i < k; i++)
        put(
          acc,
          baseBox(bw, bh, L / k - 0.12 + r.range(-0.1, 0.1)),
          [sx * (x + r.range(-0.1, 0.1)), y, zc - L / 2 + (i + 0.5) * (L / k)],
          M.block[(i + (sx > 0 ? 1 : 0)) % 3],
          { aoAmt: 0.15, q: qEuler(0, 0, sx * -0.55 + r.range(-0.1, 0.1)) },
        );
  }
  // rubble boulders on the seaward side (noise-displaced icospheres)
  const noise = createNoise(r.fork('n'));
  for (let i = 0; i < M.rubble.n; i++) {
    const rad = r.range(M.rubble.r[0], M.rubble.r[1]);
    put(
      acc,
      blob(rad, 0, noise, M.rubble.amp, 1.6, i * 3.1),
      [
        (r.chance(0.5) ? 1 : -1) * r.range(2.3, 3.0),
        -0.2 + r.range(-0.2, 0.2),
        zc + r.range(-L / 2, L / 2),
      ],
      M.block[i % 3],
      { aoAmt: 0.2 },
    );
  }
}

function moleHead(acc: Acc, hi: boolean, rng: BuildOpts['rng']): void {
  const M = K.mole;
  const H = K.head;
  const bodyL = 3;
  const zc = 0.5;
  // body from the arm (centred at z = -1), then the round head (frustum from the foot to the crest)
  moleBody(acc, hi, bodyL, rng, -1);
  put(
    acc,
    cylB(H.r + 0.7, H.r, M.crestY - M.footY - 0.2, hi ? 10 : 6),
    [0, M.footY, zc],
    M.block[1],
    { aoAmt: 0.12 },
  );
  put(acc, cylB(H.r + 0.05, H.r + 0.05, 0.4, hi ? 10 : 6), [0, M.crestY - 0.6, zc], M.cap, {
    aoAmt: 0.05,
  });
  // the harbour-light tower: cream shaft, a blue band, the green lens in a lantern room, a coral roof
  const T = H.tower;
  const tz = zc;
  put(acc, cylB(T.r, T.r * 0.82, T.h, hi ? 8 : 5), [0, M.crestY - 0.2, tz], P.stone, {
    aoAmt: 0.15,
  });
  if (hi)
    put(acc, cylB(T.r + 0.06, T.r + 0.06, 0.28, 8), [0, M.crestY + 1.2, tz], P.blue, { aoAmt: 0 });
  lens(acc, [0, M.crestY - 0.2 + T.h + 0.28, tz], T.lensR, T.lens, hi);
  put(
    acc,
    new THREE.ConeGeometry(T.r + 0.35, 0.85, hi ? 8 : 5),
    [0, M.crestY - 0.2 + T.h + 0.82, tz],
    T.roof,
    { aoAmt: 0 },
  );
}

function marinaPier({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.01);
  const hi = lod === 0;
  switch (variant) {
    case 0:
    case 1:
      finger(acc, hi, K.length[variant]);
      break;
    case 2:
      spine(acc, hi, K.length[2]);
      break;
    case 3:
      moleBody(acc, hi, K.length[3], rng);
      break;
    default:
      moleHead(acc, hi, rng);
  }
  return acc.finish(rng, false, true);
}

/* ---------------------------------- starFort ---------------------------------- */

/** The 2n star outline points (tips at angle phi = 36° + 72° k from +z towards +x; valleys at k · 72°). */
function starRing(scale: number, y: number): Pt[] {
  const n = F.points;
  const out: Pt[] = [];
  for (let k = 0; k < 2 * n; k++) {
    const phi = (k * Math.PI) / n; // valley at phi = 0, tip at 36°
    const r = (k % 2 === 0 ? F.innerR : F.outerR) * scale;
    out.push(V(Math.sin(phi) * r, y, Math.cos(phi) * r));
  }
  return out;
}

/** The wall bands between two rings (outward normal hints from the quad centres). */
function band(acc: Acc, a: Pt[], b: Pt[], color: string): void {
  const m = a.length;
  for (let k = 0; k < m; k++) {
    const k1 = (k + 1) % m;
    const q = [a[k], a[k1], b[k1], b[k]];
    const c = q.reduce((s, p) => s.add(p), V(0, 0, 0)).multiplyScalar(0.25);
    const hint = V(c.x, 0.4, c.z).normalize();
    acc.addPoly(q, hint, { color: col(color), aoAmt: 0.12, windMul: 0 });
  }
}

/** A flat fan from the ring centre. */
function cap(acc: Acc, ring: Pt[], y: number, color: string): void {
  const c = V(0, y, 0);
  for (let k = 0; k < ring.length; k++)
    acc.addPoly([c, ring[k], ring[(k + 1) % ring.length]], V(0, 1, 0), {
      color: col(color),
      aoAmt: 0,
      windMul: 0,
      ao: () => 1,
    });
}

function starFort({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.008);
  const hi = lod === 0;
  const H = F.wallH;
  const foot = starRing(1.1, F.footY);
  const water = starRing(1.02, 0);
  const course = starRing(1.0, 0.45);
  const top = starRing(F.topScale, H);
  // plinth below the water, a darker stone course at the waterline, the cream battered wall
  band(acc, foot, water, P.stoneDark);
  band(acc, water, course, P.stoneShade);
  band(acc, course, top, F.stone);
  cap(acc, top, H, F.court.color);

  // keep (the flag tower): an octagonal shaft, windows, the lantern gallery with the red light, a coral roof
  const T = F.tower;
  const keepR = T.w / 2;
  put(acc, cylB(keepR, keepR * 0.9, T.h, hi ? 8 : 5), [0, H, 0], F.stone, { aoAmt: 0.15 });
  const roofY = H + T.h;
  put(acc, cylB(keepR + 0.18, keepR + 0.18, 0.3, hi ? 8 : 5), [0, roofY - 0.3, 0], F.trim, {
    aoAmt: 0,
  });
  const lensAt: [number, number, number] = [0, roofY + 0.45, 0];
  lens(acc, lensAt, F.light.r, F.light.color, hi);
  // the lantern gallery: four posts round the lens carry the roof
  for (const [dx, dz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ])
    put(
      acc,
      cylB(0.06, 0.06, 0.9, 4, true),
      [dx * keepR * 0.62, roofY, dz * keepR * 0.62],
      P.post,
      {
        aoAmt: 0,
      },
    );
  put(
    acc,
    new THREE.ConeGeometry(keepR + 0.45, T.roofH, hi ? 8 : 5),
    [0, roofY + 0.85 + T.roofH / 2, 0],
    F.roof,
    {
      aoAmt: 0,
    },
  );
  const poleTop = roofY + 0.85 + T.roofH + F.flag.poleH;
  put(acc, cylB(0.05, 0.04, F.flag.poleH, 4, true), [0, roofY + 0.85 + T.roofH, 0], P.post, {
    aoAmt: 0,
  });

  if (hi) {
    // keep windows (lit at night) on four sides
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      for (const wy of [T.h * 0.3, T.h * 0.62])
        put(
          acc,
          baseBox(dx !== 0 ? 0.08 : 0.34, 0.42, dz !== 0 ? 0.08 : 0.34),
          [dx * (keepR * 0.93), H + wy, dz * (keepR * 0.93)],
          P.window,
          { ...glow },
        );
    // parapet along every top edge: sill + merlons with an embrasure gap between, a gun in the first gap
    const m = top.length;
    const PA = F.parapet;
    for (let k = 0; k < m; k++) {
      const a = top[k];
      const b = top[(k + 1) % m];
      const e = b.clone().sub(a);
      const len = e.length();
      e.normalize();
      const out = V(e.z, 0, -e.x); // edge direction rotated -90° about y: outward for the CCW-from-above ring? tested below
      const mid = a.clone().add(b).multiplyScalar(0.5);
      // flip so `out` points away from the keep
      if (out.dot(mid) < 0) out.negate();
      const yaw = Math.atan2(-e.z, e.x);
      const inset = out.clone().multiplyScalar(-PA.d / 2 - 0.02);
      // sill
      put(acc, baseBox(len, 0.3, PA.d), mid.clone().add(inset), P.stoneLight, {
        q: qEuler(0, yaw, 0),
        aoAmt: 0.05,
      });
      const gap = Math.max(0.25, (len - PA.perFace * PA.w) / (PA.perFace - 1));
      for (let i = 0; i < PA.perFace; i++) {
        const t = -len / 2 + PA.w / 2 + i * (PA.w + gap);
        const p = mid.clone().add(inset).add(e.clone().multiplyScalar(t));
        put(acc, baseBox(PA.w, PA.h, PA.d), p.clone().setY(H + 0.3), P.stoneLight, {
          q: qEuler(0, yaw, 0),
          aoAmt: 0.08,
        });
      }
      // gun in the first gap
      const tg = -len / 2 + PA.w + gap / 2;
      const gp = mid.clone().add(inset).add(e.clone().multiplyScalar(tg));
      put(
        acc,
        cylB(F.gun.r, F.gun.r * 0.85, F.gun.len, 5),
        gp
          .clone()
          .add(out.clone().multiplyScalar(0.35))
          .setY(H + 0.55),
        F.slot,
        {
          q: new THREE.Quaternion().setFromUnitVectors(
            V(0, 1, 0),
            out.clone().setY(0.08).normalize(),
          ),
          aoAmt: 0,
        },
      );
    }
    // gun ports in the sloped walls: a dark slot at mid height of every face
    for (let k = 0; k < m; k++) {
      const a = course[k];
      const b = course[(k + 1) % m];
      const a2 = top[k];
      const b2 = top[(k + 1) % m];
      const c = a.clone().add(b).add(a2).add(b2).multiplyScalar(0.25);
      const e = b.clone().sub(a).normalize();
      const out = V(e.z, 0, -e.x);
      if (out.dot(c) < 0) out.negate();
      put(
        acc,
        baseBox(0.55, 0.4, 0.3),
        c
          .clone()
          .add(out.clone().multiplyScalar(0.02))
          .setY(H * 0.55),
        F.slot,
        {
          q: qEuler(0, Math.atan2(-e.z, e.x), 0),
          aoAmt: 0,
        },
      );
    }
    // the sea gate and landing at the valley facing +z, a timber deck out over the water
    const L = F.landing;
    put(acc, baseBox(L.w, 0.14, L.len), [0, 0.42, F.innerR + L.len / 2 - 0.1], P.deck, {
      aoAmt: 0.1,
    });
    for (const sx of [-1, 1])
      put(
        acc,
        cylB(0.11, 0.09, 1.7, 5),
        [sx * (L.w / 2 - 0.1), -1.2, F.innerR + L.len - 0.4],
        P.post,
        {
          aoAmt: 0.2,
        },
      );
    put(acc, baseBox(1.1, 1.5, 0.3), [0, 0.5, F.innerR * 0.97 + 0.22], F.slot, { aoAmt: 0 });
  }
  // flag: HQ coral swallowtail streaming from the pole top (the wind weight ramps along the flag)
  pennant(acc, V(0, poleTop - 0.25, 0), F.flag.len, F.flag.h, F.roof, Math.PI / 2);
  const g = acc.finish(rng, false, true);
  addHook(g, 'flag', { at: [0, poleTop - 0.25, 0] });
  addHook(g, 'light', { at: lensAt });
  return g;
}

/* ---------------------------------- boats ---------------------------------- */

/** Sloop (variants 6 / 7): white hull, coloured sheer stripe, cabin trunk, tall mast with a lamp at its head. */
function sloop({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const S = B.sloops[variant === B.firstVariant ? 0 : 1];
  const acc = jitterAcc(rng);
  const hi = lod === 0;
  const hullH = 0.78;
  const ext = (depth: number): THREE.BufferGeometry =>
    new THREE.ExtrudeGeometry(hullShape(5.2, 1.9), { depth, bevelEnabled: false }).rotateX(
      Math.PI / 2,
    );
  if (hi) {
    const lowH = hullH * 0.45;
    put(acc, ext(lowH).scale(0.9, 1, 0.96), [0, lowH, 0], S.boot, { aoAmt: 0.25 });
    put(
      acc,
      ext(hullH - lowH).scale(1.03, 1, 1),
      [0, hullH, 0],
      (p) => (p.y > hullH - 0.01 ? col(P.deck) : p.y > hullH - 0.22 ? col(S.stripe) : col(S.hull)),
      { aoAmt: 0.1 },
    );
  } else {
    put(acc, ext(hullH), [0, hullH, 0], (p) => (p.y > hullH * 0.6 ? col(S.stripe) : col(S.hull)), {
      aoAmt: 0.2,
    });
  }
  const mastZ = 0.45;
  const mastH = 5.4;
  put(acc, cylB(0.08, 0.05, mastH, hi ? 5 : 4, true), [0, hullH - 0.1, mastZ], P.post, {
    aoAmt: 0.1,
  });
  const top = hullH - 0.1 + mastH;
  lens(acc, [0, top + 0.12, mastZ], B.mastLamp.r, B.mastLamp.color, hi);
  // cabin trunk
  put(acc, baseBox(1.15, 0.34, 1.5), [0, hullH, -0.85], S.hull, { aoAmt: 0.12 });
  if (hi) {
    for (const sx of [-1, 1])
      put(acc, baseBox(0.04, 0.12, 0.5), [sx * 0.59, hullH + 0.19, -0.85], P.blue, {
        aoAmt: 0,
        ao: () => 1,
      });
    put(acc, new THREE.BoxGeometry(0.07, 0.07, 2.2), [0, hullH + 0.6, mastZ - 1.1], P.post, {
      aoAmt: 0,
    });
  }
  const y0 = hullH + 0.7;
  const Hs = 3.9;
  const Ls = 2.2;
  const nu = hi ? 4 : 1;
  const nv = hi ? 4 : 1;
  const main = gridSurface(nu, nv, (u, v) =>
    V(
      0.4 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * (variant % 2 ? -1 : 1) + 0.04,
      y0 + v * Hs * (1 - 0.92 * u),
      mastZ - 0.06 - u * Ls,
    ),
  );
  put(acc, main, [0, 0, 0], S.sail, {
    double: true,
    aoAmt: 0,
    windAbs: (p) => clamp01((mastZ - p.z) / Ls),
    ao: () => 1,
  });
  if (hi) {
    const jib = gridSurface(2, 3, (u, v) =>
      V(
        0.2 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v),
        y0 + 0.2 + v * 3.1 * (1 - u),
        mastZ + 0.08 + u * 1.9,
      ),
    );
    put(acc, jib, [0, 0, 0], S.jib, {
      double: true,
      aoAmt: 0,
      windAbs: (p) => clamp01((p.z - mastZ) / 1.9),
      ao: () => 1,
    });
  }
  const g = acc.finish(rng, false, true);
  if (hi) tagBob(g);
  return g;
}

/** Tender (variant 8): a rowing dinghy with an anchor light on a short post. */
function tender({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const T = B.tender;
  const acc = jitterAcc(rng);
  const hi = lod === 0;
  const hh = 0.5;
  const ext = (depth: number): THREE.BufferGeometry =>
    new THREE.ExtrudeGeometry(hullShape(3.0, 1.35), { depth, bevelEnabled: false }).rotateX(
      Math.PI / 2,
    );
  put(
    acc,
    ext(hh),
    [0, hh, 0],
    (p) => (p.y > hh * 0.55 ? col(P.stoneLight) : col(B.sloops[0].stripe)),
    {
      aoAmt: 0.2,
    },
  );
  if (hi) {
    for (const z of [-0.5, 0.35])
      put(acc, baseBox(1.05, 0.06, 0.24), [0, hh - 0.14, z], P.deck, { aoAmt: 0.1 });
    put(acc, baseBox(0.5, 0.04, 0.9), [0, hh - 0.34, -0.1], P.plank, { aoAmt: 0 });
    // two oars shipped across the thwarts, a stern seat
    for (const sx of [-1, 1])
      put(acc, baseBox(0.05, 0.04, 1.5), [sx * 0.62, hh + 0.02, 0.05], P.post, {
        q: qEuler(0, sx * 0.2, sx * 0.08),
        aoAmt: 0,
      });
    put(acc, baseBox(0.9, 0.08, 0.28), [0, hh - 0.2, -1.05], P.deck, { aoAmt: 0.1 });
  }
  if (hi) put(acc, cylB(0.04, 0.035, T.post, 4, true), [0, hh - 0.1, 0.9], P.post, { aoAmt: 0 });
  lens(acc, [0, hh - 0.1 + T.post + 0.08, 0.9], 0.12, T.lamp, hi);
  // a small pennant under the lamp (the wind weight: it flutters)
  if (hi) pennant(acc, V(0, hh - 0.1 + T.post - 0.05, 0.9), 0.45, 0.2, P.coral, Math.PI / 2);
  const g = acc.finish(rng, false, true);
  if (hi) tagBob(g);
  return g;
}

/** The new sailboat variants (registry: 6 / 7 sloop, 8 tender); the older variants stay in coastal.ts. */
export function marinaBoat(o: BuildOpts): THREE.BufferGeometry {
  return o.variant === B.tender.variant ? tender(o) : sloop(o);
}

export const HQ_MARINA_GEO: readonly PropGeoDef[] = [
  // 0 finger 12 u, 1 finger 8 u, 2 spine piece, 3 mole piece, 4 mole head with the green light
  {
    id: 'marinaPier',
    variants: 5,
    build: marinaPier,
    footprint: 6.5,
    height: 3.2,
    heights: [2.6, 2.6, 0.8, 1.3, 5.2],
    windy: false,
  },
  {
    id: 'starFort',
    variants: 1,
    build: starFort,
    footprint: 7.5,
    height: 12,
    windy: true,
  },
];
