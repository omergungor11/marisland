/**
 * Skerry beacon (M23 TASK-490, W:B1): the mini lighthouse on a sea stack, ~6 u tall. Same read as the
 * Marketing lighthouse (banded shaft, gallery, glowing lamp room) at a third of the size; the beam mesh
 * (render/night/beacons.ts) turns at `BEACON_NET.tower.lampY`. Pivot on the rock; def in
 * content/props-themes/beacon.ts.
 */
import * as THREE from 'three';
import { BEACON_NET } from '../../content/signature.ts';
import { EMISSIVE, ROCK, ROOFS, WALLS } from '../../content/palette.ts';
import { col } from '../kit.ts';
import { TAU, cylB, jitterAcc, lathe, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';

const T = BEACON_NET.tower;
const BANDS = 5;

function beaconTower({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const seg = lod === 0 ? 10 : 5;
  const bands = lod === 0 ? BANDS : 3;
  const H = T.height;
  const red = col(ROOFS[0]);
  const white = col(WALLS[1]);
  const rOf = (y: number): number => T.rBase + (T.rTop - T.rBase) * (y / H);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= bands; i++) pts.push([rOf((i * H) / bands), (i * H) / bands]);
  const body = lathe(pts, seg).rotateY(-Math.PI / seg);
  put(acc, body, [0, 0, 0], (p) => (Math.floor((p.y / H) * bands) % 2 === 0 ? red : white), {
    aoAmt: 0.2,
  });
  if (lod === 0)
    put(acc, cylB(T.rBase + 0.3, T.rBase + 0.2, 0.3, seg), [0, 0, 0], col(ROCK[1]), {
      aoAmt: 0.25,
    });
  put(acc, cylB(T.rTop + 0.38, T.rTop + 0.38, 0.16, seg), [0, H, 0], col(ROCK[2]), { aoAmt: 0.1 });
  // lamp room: the glowing core (the beam turns at lampY) under a red cap
  const lamp =
    lod === 0 ? new THREE.IcosahedronGeometry(0.4, 0) : new THREE.OctahedronGeometry(0.45, 0);
  put(acc, lamp, [0, T.lampY, 0], col(EMISSIVE.lantern), { emissive: 1, ao: () => 1 });
  put(acc, cylB(0.62, 0.05, 0.55, seg), [0, T.lampY + 0.42, 0], red, { aoAmt: 0 });
  if (lod === 0) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      put(
        acc,
        cylB(0.04, 0.04, 0.8, 4, true),
        [Math.cos(a) * 0.5, H + 0.16, Math.sin(a) * 0.5],
        white,
        { aoAmt: 0 },
      );
    }
  }
  return acc.finish(rng, false, true);
}

export const BEACON_GEO: readonly PropGeoDef[] = [
  {
    id: 'beaconTower',
    variants: 1,
    build: beaconTower,
    footprint: 1.2,
    height: T.lampY + 1,
    windy: false,
  },
];
