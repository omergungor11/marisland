/**
 * Rim walkway posts (TASK-480, WORLD_PLAN §3.5 shared primitive; placed by world/gen/rim-walkway.ts).
 * `rimPost`: one post at the origin, front (+z) to the walk; even variants also carry the rails to
 * the next post along local +x (`railLen` u, = the placer's chord spacing), odd variants close a run.
 * Look per style (variant >> 1): content/rim-walkway.ts RIM_POST_LOOKS. Def: content/props-themes/rim.ts.
 */
import * as THREE from 'three';
import { RIM_POST_LOOKS } from '../../content/rim-walkway.ts';
import { qEuler } from '../kit.ts';
import { baseBox, jitterAcc, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';

function rimPost({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const L = RIM_POST_LOOKS[Math.min(RIM_POST_LOOKS.length - 1, variant >> 1)];
  const rails = (variant & 1) === 0;
  const hi = lod === 0;
  // a hair of scale jitter only (the rails must still meet the next post)
  const acc = jitterAcc(rng, 0.006);
  const w = L.half * 2;
  if (!hi) {
    // far proxy: one post, the lamp, the top rail as a bar
    put(acc, baseBox(w, L.height, w), [0, 0, 0], L.bands[0], { aoAmt: 0.05 });
    if (L.lamp)
      put(acc, new THREE.OctahedronGeometry(L.half, 0), [0, L.height + 0.08, 0], L.lamp, {
        emissive: 1,
        aoAmt: 0,
        ao: () => 1,
      });
    if (rails)
      put(
        acc,
        baseBox(L.railLen - w, L.railR * 2, L.railR * 2),
        [L.railLen / 2, L.railY[0], 0],
        L.rail,
        {
          aoAmt: 0,
        },
      );
    return acc.finish(rng, false, true);
  }
  put(acc, baseBox(w + 0.12, 0.12, w + 0.12), [0, 0, 0], L.foot, { aoAmt: 0.2 });
  const n = Math.ceil((L.height - 0.12) / L.band);
  for (let k = 0; k < n; k++) {
    const y0 = 0.12 + k * L.band;
    const h = Math.min(L.band, L.height - y0);
    put(acc, baseBox(w, h, w), [0, y0, 0], L.bands[k % L.bands.length], { aoAmt: 0.05 });
  }
  put(acc, baseBox(w + 0.05, 0.06, w + 0.05), [0, L.height, 0], L.cap, { aoAmt: 0 });
  if (L.lamp)
    put(acc, new THREE.IcosahedronGeometry(L.half * 0.9, 0), [0, L.height + 0.1, 0], L.lamp, {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
  if (rails)
    for (const y of L.railY)
      put(
        acc,
        new THREE.CylinderGeometry(L.railR, L.railR, L.railLen - w, 6),
        [L.railLen / 2, y, 0],
        L.rail,
        { q: qEuler(0, 0, Math.PI / 2), aoAmt: 0 },
      );
  return acc.finish(rng, false, true);
}

export const RIM_GEO: readonly PropGeoDef[] = [
  {
    id: 'rimPost',
    variants: RIM_POST_LOOKS.length * 2,
    build: rimPost,
    footprint: 0.3,
    height: 1.3,
    windy: false,
  },
];
