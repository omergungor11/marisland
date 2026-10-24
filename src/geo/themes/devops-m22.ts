/**
 * DevOps M22 quick-win variants (TASK-482; looks in content/props-themes/devops.ts DEVOPS_M22):
 * - `withWatchTower`: antennaMast v2 = the D5 summit watch tower (lattice legs + rings + X braces,
 *   a deck with a hip-roofed bell cab, the uptime bell under the roof, a red beacon on the mast).
 *   Lot-local frame, +z = door side. The bell rings and the rotating beam are culture movers.
 * - `withOpsShack`: cottage v3 = the R3-13 ops shack (the stock cottage body with cream walls, a
 *   low steel roof, an orange band under the eaves and a steel stack instead of the chimney).
 * Both keep the stock builders for every other variant (no existing geometry changes).
 */
import * as THREE from 'three';
import { DEVOPS_M22 } from '../../content/props-themes/devops.ts';
import { house } from '../buildings.ts';
import { col, frustum, qEuler, type Acc } from '../kit.ts';
import { V, baseBox, cylB, jitterAcc, lathe, put } from '../parts.ts';
import type { BuildOpts, PropBuilder } from '../types.ts';

/** antennaMast variant that is the watch tower (= DEVOPS_SITE.ridge.towerVariant). */
export const WATCH_TOWER_VARIANT = 2;
/** cottage variant that is the ops shack (= DEVOPS_SITE.lodgeVariant). */
export const OPS_SHACK_VARIANT = 3;

function strut(
  acc: Acc,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  color: string,
  radial = 4,
): void {
  const s = frustum(a, b, r, r, radial, true);
  acc.add(s.geo, { m: s.m, color: col(color), windMul: 0, aoAmt: 0.08 });
}

function watchTower({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const T = DEVOPS_M22.tower;
  const acc = jitterAcc(rng, 0.01);
  const hi = lod === 0;
  const half = (y: number): number => T.base + (T.top - T.base) * (y / T.deck);
  put(acc, baseBox(2.0, 0.14, 2.0), [0, 0, 0], T.steel, { aoAmt: 0.2 });
  // four tapered legs
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      strut(
        acc,
        V(sx * T.base, 0.14, sz * T.base),
        V(sx * T.top, T.deck, sz * T.top),
        hi ? T.leg : T.leg * 1.6,
        T.steel,
        hi ? 4 : 3,
      );
  // rings (orange trim every other) and X braces on each face
  const ys = [0.14, ...T.rings, T.deck];
  // far: the bars' top faces only (what shows from above), 2 tris per side
  const flat = { q: qEuler(-Math.PI / 2, 0, 0), aoAmt: 0, ao: () => 1 };
  const bar = (len: number, y: number, x: number, z: number, along: boolean, c: string): void =>
    hi
      ? put(acc, along ? baseBox(len, 0.07, 0.07) : baseBox(0.07, 0.07, len), [x, y, z], c, {
          aoAmt: 0,
        })
      : put(
          acc,
          new THREE.PlaneGeometry(along ? len : 0.07, along ? 0.07 : len),
          [x, y + 0.07, z],
          c,
          flat,
        );
  for (const [k, y] of T.rings.entries()) {
    const h = half(y);
    const c = k % 2 === 0 ? T.trim : T.lattice;
    for (const s of [-1, 1]) {
      bar(h * 2, y, 0, s * h, true, c);
      bar(h * 2, y, s * h, 0, false, c);
    }
  }
  if (hi)
    for (let i = 0; i + 1 < ys.length; i++) {
      const h0 = half(ys[i]);
      const h1 = half(ys[i + 1]);
      for (const s of [-1, 1]) {
        strut(acc, V(-h0, ys[i], s * h0), V(h1, ys[i + 1], s * h1), 0.03, T.lattice);
        strut(acc, V(h0, ys[i], s * h0), V(-h1, ys[i + 1], s * h1), 0.03, T.lattice);
        strut(acc, V(s * h0, ys[i], -h0), V(s * h1, ys[i + 1], h1), 0.03, T.lattice);
        strut(acc, V(s * h0, ys[i], h0), V(s * h1, ys[i + 1], -h1), 0.03, T.lattice);
      }
    }
  // deck + rail
  const D = T.top + 0.35;
  put(acc, baseBox(D * 2, 0.14, D * 2), [0, T.deck, 0], T.steel, { aoAmt: 0.1 });
  for (const s of [-1, 1]) {
    bar(D * 2, T.deck + 0.7, 0, s * D, true, T.trim);
    bar(D * 2, T.deck + 0.7, s * D, 0, false, T.trim);
  }
  // bell cab: four corner posts and a hip roof (4-sided cone)
  const cab = T.cab / 2;
  const roofY = T.deck + 0.14 + T.cabH;
  for (const sx of hi ? [-1, 1] : [])
    for (const sz of [-1, 1])
      put(acc, baseBox(0.1, T.cabH, 0.1), [sx * cab, T.deck + 0.14, sz * cab], T.lattice, {
        aoAmt: 0.05,
      });
  put(
    acc,
    new THREE.ConeGeometry(cab * 1.6, T.roofRise, 4, 1).rotateY(Math.PI / 4),
    [0, roofY + T.roofRise / 2, 0],
    T.roof,
    { aoAmt: 0.05 },
  );
  // uptime bell under the roof (a lathe cup, mouth down) + clapper
  if (hi)
    put(
      acc,
      lathe(
        [
          [0, 0.42],
          [0.12, 0.4],
          [0.2, 0.3],
          [0.24, 0.1],
          [T.bellR, 0],
          [T.bellR - 0.04, 0.02],
        ],
        8,
      ),
      [0, T.bellY - 0.25, 0],
      T.bell,
      { aoAmt: 0.1 },
    );
  // beacon mast + red lamp
  if (hi)
    put(acc, cylB(0.04, 0.03, T.mast, 4, true), [0, roofY + T.roofRise - 0.1, 0], T.steel, {
      aoAmt: 0,
    });
  put(acc, new THREE.IcosahedronGeometry(T.beaconR, hi ? 1 : 0), [0, T.beaconY, 0], T.beacon, {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
  return acc.finish(rng, false, true);
}

export function withWatchTower(base: PropBuilder): PropBuilder {
  return (o) => (o.variant === WATCH_TOWER_VARIANT ? watchTower(o) : base(o));
}

function opsShack({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const K = DEVOPS_M22.shack;
  const r = rng.fork('cottage');
  const acc = jitterAcc(rng);
  const y0 = 0.25;
  const wallH = 2.0;
  house(acc, {
    rng: r,
    lod,
    w: 3,
    d: 3,
    y0,
    wallH,
    rise: K.rise,
    wall: K.wall,
    roof: K.roof,
    trim: K.trim,
    nWin: 3,
    chimney: false,
    foundation: true,
    doorX: 0,
  });
  // orange band under the eaves (wraps the walls; reads from T1 as the DevOps trim)
  put(acc, baseBox(3.06, K.band, 3.06), [0, y0 + wallH - K.band - 0.05, 0], K.trim, { aoAmt: 0 });
  // steel stack on the roof slope
  put(acc, cylB(0.16, 0.14, 0.9, lod === 0 ? 6 : 4), [0.75, y0 + wallH + 0.2, -0.7], K.stack, {
    aoAmt: 0.05,
  });
  return acc.finish(rng, false, true);
}

export function withOpsShack(base: PropBuilder): PropBuilder {
  return (o) => (o.variant === OPS_SHACK_VARIANT ? opsShack(o) : base(o));
}
