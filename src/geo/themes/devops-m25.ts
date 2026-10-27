/**
 * DevOps M25 signature kit geometry (TASK-504, D-084). Numbers / palette: content/themes/devops-m25.ts;
 * defs: content/props-themes/devops-m25.ts. Vertex colours only, merged single geometry per prop,
 * pivot on the ground, 1 u = 1 m.
 *
 * New defs: funicularRail (3 pitch variants), funicularCar (2 liveries), geyserCone, oreBucket.
 * Variants of existing defs (wrappers, the stock builder keeps every older variant):
 *   rackShed 2     funicular station: shed + track stub + roof cable wheel + platform lamp
 *   onsenHouse 1/2 bath house on stilts over the pool (2 adds the towel lines)
 *   goodsStall 7   smith's stall: hanging tools, anvil block, gear sign
 *   mailLine 2/3   ore cableway: 2 = mid-line pylon (two sheaves), 3 = furnace-end station
 * antennaMast v2 (the watch tower, devops-m22.ts) gets the beam head + hooks.
 *
 * Hooks (userData.hooks, local frame, scale 1):
 *  - funicularRail.rail: { length, pitch, startY, endY, railX } (rail-top height over the ground at the
 *    low / high end of the piece; the next piece starts at endY).
 *  - funicularCar.car: { length, pitchRef, cabins: [z, z], lamps: [[x,y,z]...], grip }; the mover pitches
 *    the whole mesh about x by atan(slope) (cabins are counter-tilted for `pitchRef`).
 *  - oreBucket.bucket: { grip } the carrier wheel centre over the ground pivot (the mover hangs the grip
 *    on the cable), cable axis = local z. Variant 1 carries glowing ore.
 *  - mailLine v2/v3 cable: { anchor, back? } (same shape as the HQ pylon), v3 also `ore: { at }` (the
 *    hopper where buckets load / tip).
 *  - geyserCone.spout / emitter: the vent top for the steam / water column emitter.
 *  - antennaMast v2: bell { at }, beam { at } (the existing M22 culture movers use the same heights).
 *  - rackShed v2: track { start, pitch, length }, wheel { center, axis, r }.
 *  - onsenHouse v1/v2: emitter (shifted up by the stilt height), v2 towels { first, count } by position.
 */
import * as THREE from 'three';
import { createRng, type Rng } from '../../core/rng.ts';
import { DEVOPS_M25 as F, M25_PAL as P, railHeight } from '../../content/themes/devops-m25.ts';
import { mailCablePoint, mailCableSag, type Vec3Like } from '../../content/props-themes/m20.ts';
import { Acc, createNoise, mat, qEuler, qFromTo } from '../kit.ts';
import { Spin, finishSpin } from '../office-kit.ts';
import { V, baseBox, cylB, put, tubeAlong } from '../parts.ts';
import type { BuildOpts, Lod, PropBuilder, PropGeoDef } from '../types.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addGlyph } from './glyphs.ts';
import { addHook } from './hq.ts';

const Y = V(0, 1, 0);
type Pt = THREE.Vector3;
const lit = { emissive: 1, ao: () => 1, aoAmt: 0 } as const;

/** Square beam from a to b (thickness `th`). */
function beam(acc: Acc, a: Pt, b: Pt, th: number, color: string, o: { aoAmt?: number } = {}): void {
  const d = b.clone().sub(a);
  put(acc, baseBox(th, d.length(), th), a, color, { q: qFromTo(Y, d), aoAmt: 0, ...o });
}

/** Acc scaled a hair in x / z by the seed (y untouched, so heights and hooks stay exact). */
function seedAcc(rng: Rng, amt: number): Acc {
  const acc = new Acc();
  const r = rng.fork('jit');
  acc.xf = mat([0, 0, 0], null, [1 + r.range(-amt, amt), 1, 1 + r.range(-amt, amt)]);
  return acc;
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

/** Merge extra parts onto a stock geometry (same attribute set: pass `spin` for spinner stock). */
function mergeOnto(
  base: THREE.BufferGeometry,
  extra: THREE.BufferGeometry,
  keepHooks = true,
): THREE.BufferGeometry {
  const merged = mergeGeometries([base, extra], false);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  merged.userData = {
    ...(keepHooks ? base.userData : {}),
    tris: merged.getAttribute('position').count / 3,
  };
  return merged;
}

/* ------------------------------- funicularRail ------------------------------- */

/**
 * One rail piece, `rail.piece` u of horizontal run along +z from the pivot (low end, centred on x):
 * two steel rails and a rope between them on timber stringers and sleepers, carried by two pylons
 * that stand on the ground at both ends (the high pylon is the taller). Variant = pitch step.
 */
function funicularRail({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const R = F.rail;
  const t = R.pitches[variant];
  const L = R.piece;
  const hi = lod === 0;
  const th = Math.atan(t);
  const acc = seedAcc(rng, 0.01);
  const top = (z: number): number => R.clearance + t * z;
  for (const sx of [-1, 1]) {
    beam(
      acc,
      V(sx * R.railX, top(0) - 0.1, 0),
      V(sx * R.railX, top(L) - 0.1, L),
      hi ? 0.15 : 0.24,
      P.woodDark,
    );
    beam(
      acc,
      V(sx * R.railX, top(0) + 0.03, 0),
      V(sx * R.railX, top(L) + 0.03, L),
      0.09,
      P.steelPale,
    );
  }
  const n = hi ? Math.round(L / R.sleeper) : 0;
  for (let i = 0; i < n; i++) {
    const z = hi ? (i + 0.5) * R.sleeper : (i + 0.5) * (L / n);
    bx(acc, R.railX * 2 + 0.4, 0.07, hi ? 0.2 : 0.4, 0, top(z) - 0.17, z, P.wood, {
      q: qEuler(-th, 0, 0),
      aoAmt: 0,
    });
  }
  if (hi) {
    // the rope between the rails, with a guide roller under it every metre
    beam(acc, V(0, top(0) - 0.02, 0), V(0, top(L) - 0.02, L), 0.05, P.iron);
    for (const z of [0.6, 1.5, 2.4])
      put(
        acc,
        new THREE.CylinderGeometry(0.07, 0.07, 0.3, 6).rotateZ(Math.PI / 2),
        [0, top(z) - 0.1, z],
        P.steel,
        {
          aoAmt: 0,
        },
      );
  }
  for (const z of R.pylonZ) {
    const hp = top(z) - 0.12;
    for (const sx of [-1, 1])
      beam(
        acc,
        V(sx * (R.railX + 0.2), 0, z),
        V(sx * (R.railX + 0.02), hp, z),
        hi ? 0.15 : 0.22,
        P.wood,
        {
          aoAmt: 0.15,
        },
      );
    if (hi) bx(acc, R.railX * 2 + 0.3, 0.11, 0.2, 0, hp - 0.02, z, P.orange, { aoAmt: 0 });
    if (hi) {
      beam(
        acc,
        V(-R.railX - 0.1, 0.06, z),
        V(R.railX + 0.1, Math.max(0.2, hp - 0.12), z),
        0.07,
        P.woodDark,
      );
      for (const sx of [-1, 1])
        bx(acc, 0.34, 0.05, 0.34, sx * (R.railX + 0.2), 0, z, P.basaltLight, { aoAmt: 0 });
    }
  }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'rail', {
    length: L,
    pitch: t,
    startY: R.clearance,
    endY: top(L),
    railX: R.railX,
    height: railHeight(variant),
  });
}

/* ------------------------------- funicularCar ------------------------------- */

/**
 * The funicular car in the rail frame (+z along the track, y = 0 on the rail tops): an iron chassis on
 * four wheels carrying two stepped compartments, each tilted back by `pitchRef` so its floor is level
 * on the slope, lit windows and end lamps (emissive). Variant = livery (0 orange, 1 teal).
 */
function funicularCar({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const C = F.car;
  const hi = lod === 0;
  const liv = C.livery[variant % C.livery.length];
  const acc = seedAcc(rng, 0.008);
  const th = Math.atan(C.pitchRef);
  const Rq = qEuler(th, 0, 0);
  const chY = 0.34;
  const chH = 0.2;
  // far: one block down to the rails (no wheels)
  put(acc, baseBox(C.width, hi ? chH : chY + chH, C.length), [0, hi ? chY : 0, 0], P.iron, {
    aoAmt: 0.2,
  });
  if (hi) {
    for (const sx of [-1, 1])
      for (const z of [-1.6, 1.6]) {
        put(
          acc,
          new THREE.CylinderGeometry(0.2, 0.2, 0.12, 8).rotateZ(Math.PI / 2),
          [sx * C.railX, 0.2, z],
          P.steelPale,
          {
            aoAmt: 0,
          },
        );
        put(
          acc,
          new THREE.CylinderGeometry(0.1, 0.1, 0.5, 5).rotateZ(Math.PI / 2),
          [sx * (C.railX - 0.2), 0.2, z],
          P.steel,
          {
            aoAmt: 0,
          },
        );
      }
  }
  const K = C.cabin;
  const lamps: number[][] = [];
  const cabP = (zc: number, lift: number): Pt => V(0, chY + chH + lift, zc);
  const lift = (K.d / 2) * Math.sin(th);
  for (const sz of [-1, 1]) {
    const Pc = cabP(sz * K.z, lift);
    const at = (x: number, y: number, z: number): Pt =>
      Pc.clone().add(V(x, y, z).applyQuaternion(Rq));
    // posts from the chassis up to the cabin's four corners (the cabin floor is level, the chassis is not)
    for (const cx of hi ? [-0.55, 0.55] : [0])
      for (const dz of [-0.8, 0.8]) {
        const c = at(cx, 0, dz);
        const h = c.y - (chY + chH);
        if (h > 0.02) bx(acc, 0.12, h, 0.12, c.x, chY + chH, c.z, P.steel, { aoAmt: 0.1 });
      }
    put(acc, baseBox(K.w, K.h, K.d), Pc, liv.body, { q: Rq, aoAmt: 0.12 });
    put(acc, baseBox(K.w + 0.14, 0.1, K.d + 0.14), at(0, K.h, 0), liv.roof, { q: Rq, aoAmt: 0 });
    if (hi)
      put(acc, baseBox(K.w + 0.02, 0.14, K.d + 0.02), at(0, 0.18, 0), liv.stripe, {
        q: Rq,
        aoAmt: 0,
      });
    for (const sx of [-1, 1]) {
      const zs = hi ? [-0.6, 0, 0.6] : [0];
      for (const z of zs)
        put(
          acc,
          baseBox(0.03, 0.5, hi ? 0.42 : 1.5),
          at(sx * (K.w / 2 + 0.008), 0.72, z),
          P.window,
          {
            q: Rq,
            ...lit,
          },
        );
    }
    // end lamps (both ends, the car runs both ways) and an end window
    for (const ez of [-1, 1]) {
      const lp = at(0, 0.38, ez * (K.d / 2 + 0.02));
      if (hi) put(acc, baseBox(0.34, 0.16, 0.05), lp, P.glow, { q: Rq, ...lit });
      lamps.push([lp.x, lp.y + 0.08, lp.z]);
      if (hi)
        put(acc, baseBox(0.8, 0.45, 0.03), at(0, 0.72, ez * (K.d / 2 + 0.008)), P.window, {
          q: Rq,
          ...lit,
        });
    }
    if (hi) put(acc, new THREE.IcosahedronGeometry(0.1, 0), at(0, K.h + 0.2, 0), P.red, { ...lit });
  }
  const g = acc.finish(rng, false, true);
  addHook(g, 'car', {
    length: C.length,
    pitchRef: C.pitchRef,
    cabins: [-K.z, K.z],
    lamps,
    grip: [0, chY, 0],
  });
  return g;
}

/* -------------------------------- geyserCone -------------------------------- */

/**
 * Sinter mound: seven stepped terraces in cream / ochre bands (noise-displaced, seeded), a copper
 * crust round a bowl-shaped vent on top with a teal pool in it, scalloped teal pools on the lowest
 * ledge. `hooks.spout` / `emitter` = the vent top (the 6 u water column and the steam burst start there).
 */
function geyserCone({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const G = F.geyser;
  const hi = lod === 0;
  const acc = new Acc();
  const noise = createNoise(rng.fork('n'));
  const off = rng.fork('o').range(0, 50);
  const prof: [number, number][] = [
    ...G.profile.filter((_, i) => hi || i % 2 === 0 || i === G.profile.length - 1),
  ].map(([r, y]) => [r, y]);
  const topY = G.profile[G.profile.length - 1][1];
  prof.push([G.ventR * 0.8, topY - 0.08], [G.ventR * 0.45, topY - 0.28]);
  prof.push([0.001, topY - 0.34]);
  const geo = new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(r, y)),
    hi ? 14 : 7,
  );
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k =
      y < 0.01
        ? 1
        : 1 + (y > topY - 0.4 ? 0.04 : 0.1) * noise.n3(x * 1.1 + off, y * 0.9, z * 1.1 - off);
    p.setXYZ(i, x * k, y, z * k);
  }
  const bands = G.sinter;
  const c0 = new THREE.Color(bands[0]);
  const c1 = new THREE.Color(bands[1]);
  const crust = new THREE.Color(bands[2]);
  const pool = new THREE.Color(bands[3]);
  acc.add(geo, {
    color: (q) =>
      Math.hypot(q.x, q.z) < G.ventR * 0.95 && q.y < topY - 0.05
        ? pool
        : q.y > topY - 0.45
          ? crust
          : Math.floor(q.y / 0.46) % 2
            ? c1
            : c0,
    windMul: 0,
    aoAmt: 0.2,
    groundClamp: true,
  });
  if (hi) {
    for (let i = 0; i < 3; i++) {
      const a = 0.7 + i * 2.1 + noise.n3(i, off, 0.3);
      put(acc, cylB(0.2, 0.17, 0.05, 7), [Math.cos(a) * 1.02, 0.46, Math.sin(a) * 1.02], pool, {
        aoAmt: 0,
      });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + off;
      put(
        acc,
        new THREE.IcosahedronGeometry(0.1, 0),
        [Math.cos(a) * 0.36, topY - 0.06, Math.sin(a) * 0.36],
        P.copper,
        {
          s: [1, 0.7, 1],
          aoAmt: 0,
        },
      );
    }
  }
  const g = acc.finish(rng, false, true);
  g.userData.hooks = {
    spout: { at: [0, topY, 0], radius: G.ventR, column: G.column },
    emitter: [0, topY, 0],
  };
  return g;
}

/* -------------------------------- oreBucket -------------------------------- */

/**
 * Ore cableway bucket on its hanger (pivot = the bucket's base on the ground, as it rests in the
 * station); the carrier wheel at `hooks.bucket.grip` rides the cable along local z. Variant 0 empty,
 * variant 1 loaded with glowing ore.
 */
function oreBucket({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const B = F.ore.bucket;
  const hi = lod === 0;
  const seg = hi ? 8 : 5;
  const acc = seedAcc(rng, 0.03);
  put(
    acc,
    new THREE.CylinderGeometry(B.r1, B.r0, B.h, seg).translate(0, B.h / 2 + 0.04, 0),
    [0, 0, 0],
    P.orangeDeep,
    {
      aoAmt: 0.15,
    },
  );
  if (hi)
    put(acc, cylB(B.r1 + 0.03, B.r1 + 0.03, 0.08, seg), [0, B.h - 0.04, 0], P.iron, { aoAmt: 0 });
  if (hi) put(acc, cylB(B.r0 + 0.02, B.r0 + 0.02, 0.07, seg), [0, 0.02, 0], P.iron, { aoAmt: 0 });
  if (hi)
    for (const sx of [-1, 1])
      beam(acc, V(sx * B.r1, B.h, 0), V(sx * 0.04, B.grip - 0.12, 0), 0.05, P.iron);
  else beam(acc, V(0, B.h, 0), V(0, B.grip - 0.12, 0), 0.09, P.iron);
  if (hi)
    put(
      acc,
      new THREE.CylinderGeometry(0.15, 0.15, 0.09, 8).rotateZ(Math.PI / 2),
      [0, B.grip, 0],
      P.steelPale,
      {
        aoAmt: 0,
      },
    );
  else bx(acc, 0.1, 0.24, 0.24, -0.05, B.grip - 0.12, -0.12, P.steelPale, { aoAmt: 0 });
  if (hi) bx(acc, 0.1, 0.16, 0.1, -0.05, B.grip - 0.22, -0.05, P.iron, { aoAmt: 0 });
  if (variant === 1) {
    const r = rng.fork('ore');
    for (let i = 0; i < (hi ? B.loadedCount : 1); i++) {
      const a = (i / B.loadedCount) * Math.PI * 2 + r.range(0, 1);
      const d = i === 0 ? 0 : B.r1 * 0.5;
      put(
        acc,
        new THREE.IcosahedronGeometry(r.range(0.11, 0.17), 0),
        [Math.cos(a) * d, B.h + 0.02 + (i === 0 ? 0.08 : 0), Math.sin(a) * d],
        i % 2 ? P.lava : P.coral,
        { emissive: 1, ao: () => 1, aoAmt: 0 },
      );
    }
  }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'bucket', { grip: [0, B.grip, 0], axis: [0, 0, 1], height: B.h });
}

/* ------------------------------ ore cableway pylons ------------------------------ */

/**
 * mailLine variants 2 / 3 (the HQ pylon dressed for the ore line): steel lattice legs on a basalt
 * plinth. 2 = mid-line pylon with a cross arm along z and two sheave wheels (the cable passes over,
 * `anchor` front / `back`); 3 = furnace-end station: lower, one sheave, an ore hopper in front with a
 * glowing pile. Front = +z toward the other pylon.
 */
function orePylon({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const O = F.ore;
  const hi = lod === 0;
  const vi = variant - O.pylonVariants[0];
  const H = O.height[vi];
  const anchor = O.anchor[vi];
  const acc = new Acc(); // no scale jitter: the anchors match content DEVOPS_M25.ore exactly
  const jit = rng.fork('jit'); // seed variety: leg thickness only
  const base = vi === 0 ? 0.7 : 0.62;
  const topH = 0.2;
  const corner = (sx: number, sz: number, y: number): Pt => {
    const h = topH + (base - topH) * (1 - y / H);
    return V(sx * h, y, sz * h);
  };
  put(acc, baseBox(1.8, 0.2, 1.8), [0, 0, 0], P.basaltLight, { aoAmt: 0.25 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      beam(
        acc,
        corner(sx, sz, 0.2),
        corner(sx, sz, H - 0.1),
        (hi ? 0.15 : 0.22) + jit.range(-0.015, 0.015),
        P.steel,
        { aoAmt: 0.1 },
      );
  if (hi)
    for (const y of [0.9, 1.9, 2.9, 3.9, 4.9].filter((y) => y < H - 0.7)) {
      const cs: [number, number][] = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
      for (let e = 0; e < 4; e++) {
        const [ax, az] = cs[e];
        const [bx2, bz2] = cs[(e + 1) % 4];
        beam(acc, corner(ax, az, y), corner(bx2, bz2, y), 0.08, P.steelLight);
        if (e % 2 === 0) beam(acc, corner(ax, az, y), corner(bx2, bz2, y + 1), 0.06, P.steelLight);
      }
    }
  // head: orange cap, cross arm along z, sheaves
  bx(acc, 0.6, 0.3, 0.6, 0, H - 0.2, 0, P.orange, { aoAmt: 0.05 });
  const armLen = vi === 0 ? 2.0 : 1.2;
  bx(acc, 0.2, 0.2, armLen, 0, H + 0.1, vi === 0 ? 0 : armLen / 2 - 0.3, P.orangeDeep, {
    aoAmt: 0,
  });
  const sheaves = vi === 0 ? [-0.85, 0.85] : [0.8];
  for (const z of sheaves) {
    put(
      acc,
      new THREE.CylinderGeometry(0.24, 0.24, 0.1, hi ? 10 : 6).rotateZ(Math.PI / 2),
      [0, H + 0.4, z],
      P.steelPale,
      {
        aoAmt: 0,
      },
    );
    if (hi)
      put(
        acc,
        new THREE.CylinderGeometry(0.07, 0.07, 0.16, 5).rotateZ(Math.PI / 2),
        [0, H + 0.4, z],
        P.brass,
        { aoAmt: 0 },
      );
  }
  let ore: number[] | null = null;
  if (vi === 1) {
    // hopper in front: a basalt trough with a chute and a glowing pile; buckets tip here
    bx(acc, 1.5, 0.5, 1.1, 0, 0, 1.15, P.basalt, { aoAmt: 0.2 });
    bx(acc, 1.3, 0.16, 0.9, 0, 0.5, 1.15, P.iron, { aoAmt: 0 });
    if (hi) {
      for (const [x, z, r] of [
        [-0.3, 1.1, 0.26],
        [0.25, 1.25, 0.22],
        [0.0, 0.95, 0.2],
      ] as const)
        put(acc, new THREE.IcosahedronGeometry(r, 0), [x, 0.62, z], P.lava, {
          emissive: 1,
          ao: () => 1,
          aoAmt: 0,
        });
    } else
      put(acc, new THREE.IcosahedronGeometry(0.3, 0), [0, 0.62, 1.1], P.lava, {
        emissive: 1,
        ao: () => 1,
        aoAmt: 0,
      });
    ore = [0, 0.7, 1.15];
  } else if (hi) {
    // pylon number plate
    bx(acc, 0.4, 0.3, 0.05, 0, 1.2, 0.7, P.hazard, { aoAmt: 0 });
  }
  const g = acc.finish(rng, false, true);
  const hooks: Record<string, unknown> = { anchor: [...anchor] };
  if (vi === 0) hooks.back = [...O.back];
  addHook(g, 'cable', hooks);
  if (ore) addHook(g, 'ore', { at: ore });
  return g;
}

/** The ore cableway cable between two world points: the HQ mail-line parabola in steel, no flags. */
export function buildOreCable(rng: Rng, a: Vec3Like, b: Vec3Like, lod: Lod): THREE.BufferGeometry {
  const acc = new Acc();
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const n = Math.max(4, Math.ceil(len / (lod === 0 ? 1.4 : 3)));
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const p = mailCablePoint(a, b, i / n);
    return V(p.x, p.y, p.z);
  });
  put(acc, tubeAlong(pts, 0.05, lod === 0 ? 4 : 3), [0, 0, 0], P.iron, {
    aoAmt: 0,
    ao: () => 1,
    noJitter: true,
  });
  const g = acc.finish(rng, false, true);
  g.userData.hooks = {
    cable: { from: [a.x, a.y, a.z], to: [b.x, b.y, b.z], sag: mailCableSag(len) },
  };
  return g;
}

/* ------------------------------- existing-def variants ------------------------------- */

function extend(
  def: PropGeoDef,
  variants: number,
  heights: readonly number[],
  build: PropBuilder,
  lod1Of?: Record<number, number>,
): PropGeoDef {
  const own = def.heights ?? Array.from({ length: def.variants }, () => def.height);
  return {
    ...def,
    variants,
    heights: [...own, ...heights],
    build,
    lod1Of: { ...def.lod1Of, ...lod1Of },
  };
}

/** mailLine 2 / 3: the ore cableway pylons. */
export function withOrePylons(def: PropGeoDef): PropGeoDef {
  const [v2] = F.ore.pylonVariants;
  return extend(
    def,
    def.variants + 2,
    F.ore.height.map((h) => h + 0.65),
    (o) => (o.variant >= v2 ? orePylon(o) : def.build(o)),
  );
}

/** rackShed 2: funicular station. */
export function withFunicularStation(def: PropGeoDef): PropGeoDef {
  const S = F.station;
  const station: PropBuilder = (o) => {
    const base = def.build({ ...o, variant: 0 });
    const hi = o.lod === 0;
    const acc = new Acc();
    const t = 0.3;
    const th = Math.atan(t);
    const z0 = S.trackZ;
    const z1 = z0 + S.stub;
    const y = (z: number): number => S.trackY + (z - z0) * t;
    for (const sx of [-1, 1]) {
      beam(
        acc,
        V(sx * 0.42, y(z0) - 0.1, z0),
        V(sx * 0.42, y(z1) - 0.1, z1),
        hi ? 0.15 : 0.22,
        P.woodDark,
      );
      beam(acc, V(sx * 0.42, y(z0) + 0.03, z0), V(sx * 0.42, y(z1) + 0.03, z1), 0.09, P.steelPale);
      if (hi)
        beam(
          acc,
          V(sx * 0.46, 0, z1 - 0.2),
          V(sx * 0.44, y(z1 - 0.2) - 0.1, z1 - 0.2),
          0.15,
          P.wood,
        );
    }
    if (hi)
      for (let i = 0; i < 2; i++) {
        const z = z0 + 0.2 + i * 0.3;
        bx(acc, 1.24, 0.07, 0.2, 0, y(z) - 0.17, z, P.wood, { q: qEuler(-th, 0, 0), aoAmt: 0 });
      }
    // boarding platform with an orange edge and a lamp post
    bx(acc, 1.2, 0.3, 0.7, -1.55, 0, 1.65, P.basaltLight, { aoAmt: 0.2 });
    bx(acc, 0.1, 0.05, 0.7, -0.92, 0.3, 1.65, P.orange, { aoAmt: 0 });
    if (hi) {
      put(acc, cylB(0.05, 0.04, 1.5, 5), [-1.95, 0.3, 1.8], P.iron, { aoAmt: 0 });
      put(acc, new THREE.IcosahedronGeometry(0.15, 0), [-1.95, 1.9, 1.8], P.glow, {
        emissive: 1,
        ao: () => 1,
        aoAmt: 0,
      });
    }
    // cable wheel above the roof on an A-frame, spokes at LOD0
    const wr = S.wheelR;
    const wy = S.wheelY;
    if (hi)
      for (const sx of [-1, 1]) beam(acc, V(sx * 0.4, 2.55, 0), V(sx * 0.1, wy, 0), 0.09, P.steel);
    else beam(acc, V(0, 2.5, 0), V(0, wy, 0), 0.12, P.steel);
    put(
      acc,
      new THREE.CylinderGeometry(wr, wr, 0.14, hi ? 14 : 7).rotateZ(Math.PI / 2),
      [0, wy, 0],
      P.orange,
      {
        aoAmt: 0,
      },
    );
    if (hi) {
      put(
        acc,
        new THREE.CylinderGeometry(0.1, 0.1, 0.26, 6).rotateZ(Math.PI / 2),
        [0, wy, 0],
        P.brass,
        { aoAmt: 0 },
      );
      for (let i = 0; i < 3; i++)
        put(acc, baseBox(0.09, wr * 1.9, 0.07), [0, wy - wr * 0.95, 0], P.iron, {
          q: qEuler((i * Math.PI) / 3, 0, 0),
          aoAmt: 0,
        });
    }
    const extra = finishSpin(
      acc.finish(createRng(504).fork('station', o.lod), false, true),
      acc,
      new Spin(),
    );
    const g = mergeOnto(base, extra);
    addHook(g, 'track', {
      start: [0, S.trackY, z0],
      end: [0, y(z1), z1],
      pitch: t,
      length: z1 - z0,
    });
    return addHook(g, 'wheel', { center: [0, wy, 0], axis: [1, 0, 0], r: wr });
  };
  // own far shape (the wheel, the platform and the track stub read from T0): one more far group
  return extend(def, def.variants + 1, [def.height + 1.2], (o) =>
    o.variant === S.variant ? station(o) : def.build(o),
  );
}

/** onsenHouse 1 / 2: the bath house on stilts over the pool, 2 with towel lines. */
export function withOnsenStilts(def: PropGeoDef): PropGeoDef {
  const O = F.onsen;
  const S = O.stilt;
  const build: PropBuilder = (o) => {
    const base = def.build({ ...o, variant: 0 });
    base.translate(0, S, 0);
    const hooks = base.userData.hooks as { emitter?: number[] } | undefined;
    if (hooks?.emitter) hooks.emitter = [hooks.emitter[0], hooks.emitter[1] + S, hooks.emitter[2]];
    const hi = o.lod === 0;
    const rng = createRng(504).fork('onsen', o.variant, o.lod);
    const acc = new Acc();
    const D = O.deck;
    const dy = S - 0.16;
    bx(acc, D.w, 0.16, D.d, D.x, dy, 0, P.woodDark, { aoAmt: 0.2 });
    if (hi) bx(acc, D.w + 0.12, 0.05, D.d + 0.12, D.x, dy + 0.12, 0, P.wood, { aoAmt: 0 });
    const xs = hi ? [-2.1, 0.3, 2.7] : [-2.1, 2.7];
    for (const x of xs)
      for (const z of [-1.45, 1.45]) {
        put(acc, cylB(0.12, 0.1, dy, hi ? 6 : 4), [x, 0, z], P.wood, { aoAmt: 0.2 });
        if (hi) put(acc, cylB(0.2, 0.2, 0.06, 6), [x, 0, z], P.basaltLight, { aoAmt: 0 });
      }
    if (hi)
      for (const z of [-1.45, 1.45])
        beam(acc, V(-2.1, 0.3, z), V(2.7, dy - 0.2, z), 0.06, P.woodDark);
    // steps down the front
    const n = hi ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const h = (dy * (n - 1 - i)) / n + 0.08;
      bx(acc, 1.1, h, 0.34, -0.2, 0, D.d / 2 + 0.1 + i * 0.34, P.wood, { aoAmt: 0.1 });
    }
    // railing on the pool side
    if (hi)
      for (const sx of [-1, 1]) {
        bx(acc, 0.08, 0.7, 0.08, D.x + sx * (D.w / 2 - 0.05), S, -D.d / 2 + 0.1, P.woodDark, {
          aoAmt: 0,
        });
        bx(acc, 0.08, 0.7, 0.08, D.x + sx * (D.w / 2 - 0.05), S, D.d / 2 - 0.1, P.woodDark, {
          aoAmt: 0,
        });
        bx(acc, 0.06, 0.06, D.d - 0.2, D.x + sx * (D.w / 2 - 0.05), S + 0.66, 0, P.woodDark, {
          aoAmt: 0,
        });
      }
    if (o.variant === O.variants[1] && hi) {
      // two towel lines on the pool side: poles at the deck corners, towels sway
      const T = O.towels;
      for (const [k, x] of [-2.5, -1.9].entries()) {
        const z0 = -T.span / 2 + 0.1 + k * 0.0;
        for (const sz of [-1, 1])
          bx(acc, 0.07, T.poleH, 0.07, x, S, sz * (T.span / 2), P.woodDark, { aoAmt: 0 });
        beam(
          acc,
          V(x, S + T.poleH - 0.05, -T.span / 2),
          V(x, S + T.poleH - 0.05, T.span / 2),
          0.025,
          P.steel,
        );
        const cnt = 5;
        for (let i = 0; i < cnt; i++) {
          const z = z0 + 0.35 + (i * (T.span - 0.5)) / cnt + rng.range(-0.03, 0.03);
          const h = 0.55 + rng.range(-0.08, 0.1);
          bx(
            acc,
            0.04,
            h,
            0.42,
            x,
            S + T.poleH - 0.05 - h,
            z,
            T.colors[(i + k) % T.colors.length],
            {
              aoAmt: 0,
              windAbs: 0.7,
              double: true,
            },
          );
        }
      }
    }
    const extra = acc.finish(rng, true, true);
    const g = mergeOnto(base, extra);
    return g;
  };
  return extend(
    def,
    3,
    [def.height + S, def.height + S],
    (o) => (o.variant >= 1 ? build(o) : def.build(o)),
    { 2: 1 },
  );
}

/** goodsStall 7: the smith's stall (devops goods + hanging tools, anvil block, gear sign). */
export function withSmithStall(def: PropGeoDef, devopsVariant: number): PropGeoDef {
  const S = F.smith;
  const build: PropBuilder = (o) => {
    const base = def.build({ ...o, variant: devopsVariant });
    const hi = o.lod === 0;
    const acc = new Acc();
    // tool rail under the awning edge, tools hanging off it
    beam(acc, V(-1.05, 2.0, 0.76), V(1.05, 2.0, 0.76), 0.05, P.iron);
    if (hi) {
      const tool = (x: number, kind: number): void => {
        const z = 0.78;
        if (kind === 0) {
          bx(acc, 0.05, 0.55, 0.05, x, 1.45, z, P.wood, { aoAmt: 0 });
          bx(acc, 0.22, 0.11, 0.11, x, 1.95 - 0.12, z, P.steel, { aoAmt: 0 });
        } else if (kind === 1) {
          for (const s of [-1, 1]) beam(acc, V(x, 1.97, z), V(x + s * 0.08, 1.4, z), 0.04, P.iron);
        } else if (kind === 2) {
          bx(acc, 0.32, 0.17, 0.03, x, 1.62, z, P.steelPale, { aoAmt: 0 });
          bx(acc, 0.05, 0.3, 0.05, x - 0.17, 1.62, z, P.wood, { aoAmt: 0 });
        } else {
          bx(acc, 0.06, 0.5, 0.04, x, 1.45, z, P.steel, { aoAmt: 0 });
          put(acc, new THREE.TorusGeometry(0.1, 0.03, 4, 8), [x, 1.97 - 0.08, z], P.steel, {
            aoAmt: 0,
          });
        }
      };
      [-0.95, -0.7, 0.5, 0.72, 0.95].forEach((x, i) => tool(x, i % 4));
    }
    // hanging gear sign
    bx(acc, 0.56, 0.56, 0.05, 0, 1.2, 0.78, P.cream, { aoAmt: 0 });
    if (hi) addGlyph(acc, 'gear', V(0, 1.48, 0.82), { size: 0.46, color: P.orange, depth: 0.03 });
    // anvil block at the counter end
    const A = S.anvil;
    bx(acc, A.w, 0.16, A.d, 0.78, 0.98, 0.3, P.iron, { aoAmt: 0.1 });
    bx(acc, A.w * 0.5, A.h - 0.3, A.d * 0.8, 0.78, 1.14, 0.3, P.iron, { aoAmt: 0.1 });
    bx(acc, A.w * 1.2, 0.1, A.d, 0.78, 1.14 + A.h - 0.3, 0.3, P.steel, { aoAmt: 0 });
    // a glowing workpiece on the anvil
    bx(acc, 0.22, 0.05, 0.07, 0.8, 1.14 + A.h - 0.2, 0.3, P.lava, lit);
    const extra = acc.finish(createRng(504).fork('smith', o.lod), true, true);
    return mergeOnto(base, extra);
  };
  return extend(
    def,
    def.variants + 1,
    [def.heights?.[devopsVariant] ?? def.height],
    (o) => (o.variant === S.variant ? build(o) : def.build(o)),
    {
      [S.variant]: devopsVariant,
    },
  );
}

/* ---------------------------------- registry ---------------------------------- */

export const DEVOPS_M25_GEO: readonly PropGeoDef[] = [
  {
    id: 'funicularRail',
    variants: 3,
    build: funicularRail,
    footprint: 1.5,
    height: railHeight(0),
    heights: [0, 1, 2].map(railHeight),
    windy: false,
  },
  {
    id: 'funicularCar',
    variants: 2,
    build: funicularCar,
    footprint: 2.4,
    height: 2.6,
    windy: false,
  },
  { id: 'geyserCone', variants: 1, build: geyserCone, footprint: 1.6, height: 2.1, windy: false },
  { id: 'oreBucket', variants: 2, build: oreBucket, footprint: 0.5, height: 1.65, windy: false },
];
