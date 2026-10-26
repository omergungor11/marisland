/**
 * Stair flight (TASK-485; placed by world/gen/stair-flights.ts, numbers in content/stairs.ts).
 * `stairFlight`: pivot at the foot of the flight on the ground, climbing along local +z for
 * STAIR_FLIGHT.run u to the rise of its variant (variant = look × rises + rise index). Treads are
 * blocks with a skirt below (cream riser faces, red tread caps), sloped stringers and a hand rail on
 * both sides. LOD1: one sloped slab and the two rails. Def: content/props-themes/stairs.ts.
 */
import * as THREE from 'three';
import { STAIR_FLIGHT as S } from '../../content/stairs.ts';
import { qEuler } from '../kit.ts';
import { baseBox, jitterAcc, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';

function stairFlight({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const nr = S.rises.length;
  const L = S.looks[Math.min(S.looks.length - 1, Math.floor(variant / nr))];
  const rise = S.rises[variant % nr];
  const run = S.run;
  const len = Math.hypot(run, rise);
  // pitch about x: local +z tilts up toward +y
  const q = qEuler(-Math.atan2(rise, run), 0, 0);
  const mid = (y: number): [number, number, number] => [0, rise / 2 + y, run / 2];
  const side = L.width / 2 + 0.05;
  // the flight must meet the path ends: a hair of scale jitter only
  const acc = jitterAcc(rng, 0.004);
  const flat = { aoAmt: 0.05 } as const;
  // sloped bar of section w x h through the flight's middle, offset (x, y) off its centre line
  const bar = (x: number, y: number, w: number, h: number, color: string): void =>
    put(acc, new THREE.BoxGeometry(w, h, len), [x, mid(y)[1], mid(y)[2]], color, { q, ...flat });
  if (lod !== 0) {
    bar(0, -0.12, L.width, 0.3, L.tread);
    for (const s of [-1, 1]) bar(s * side, L.railY, L.railR * 2, L.railR * 2, L.rail);
    return acc.finish(rng, false, true);
  }
  const n = Math.max(2, Math.round(rise / S.step));
  const d = run / n;
  const h = rise / n;
  for (let k = 0; k < n; k++) {
    const top = (k + 1) * h;
    const z = (k + 0.5) * d;
    // riser block (skirt below), tread cap with a small nosing
    put(acc, baseBox(L.width, h + L.skirt, d), [0, top - h - L.skirt, z], L.riser, flat);
    put(acc, baseBox(L.width + 0.04, 0.06, d + 0.06), [0, top - 0.03, z + 0.03], L.tread, flat);
  }
  for (const s of [-1, 1]) {
    bar(s * side, 0.05, 0.1, 0.32, L.stringer);
    bar(s * side, L.railY, L.railR * 2, L.railR * 2, L.rail);
    for (const [y, z] of [
      [0, 0],
      [rise / 2, run / 2],
      [rise, run],
    ])
      put(acc, baseBox(L.railR * 2, L.railY, L.railR * 2), [s * side, y, z], L.stringer, flat);
  }
  return acc.finish(rng, false, true);
}

export const STAIR_GEO: readonly PropGeoDef[] = [
  {
    id: 'stairFlight',
    variants: S.looks.length * S.rises.length,
    build: stairFlight,
    footprint: 1.2,
    height: 2.5,
    // per variant: the rise plus the hand rail
    heights: S.looks.flatMap((L) => S.rises.map((r) => r + L.railY)),
    windy: false,
  },
];
