/**
 * Coding island M22 quick wins (TASK-479, WORLD_PLAN §4.3): the wind made visible.
 * Geometry only; defs: content/props-themes/coding.ts (CODING_M22_PROP_DEFS), ledger entries 9-10:
 * content/cultures/coding.ts.
 *
 *   windsock      T2  C11 windsock avenue: 2.3 u pole, ring, five-band sock streaming along local +x
 *                     (the plan points +x downwind); the tail flutters with the gusts
 *   fairyWreath   T2  C13 fairy-light grove: the bulbs of a string of lights round a `roundTree`
 *                     canopy. Built from the roundTree builder under the roundTree rng (`rngAs`), so
 *                     variant k sits exactly on the k-th tree and sways with it
 * plus one variant of an existing def:
 *   kite v3 `pinwheel`  C4 pinwheel meadow: a garden stake with a four-vane paper pinwheel that
 *                     spins about its hub (aSpin tag; faces local +z, the plan points it into the wind)
 *
 * The devPod weather vane (variants 2 / 3) is built in geo/offices.ts (`addVane`), the turbine tip
 * lamps in geo/themes/coding.ts. Colours from palette tables only; pivots on the ground; 1 u = 1 m.
 */
import * as THREE from 'three';
import { EMISSIVE, FLOWERS, ROCK, ROOFS, WALLS, WOOD } from '../../content/palette.ts';
import { CODING_COLORS as K } from '../../content/props-themes/coding.ts';
import { Acc } from '../kit.ts';
import { Spin, finishSpin } from '../office-kit.ts';
import { roundTree } from '../trees.ts';
import { V, V2, baseBox, cylB, jitterAcc, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';

const BLUE = K.accent;
const CREAM = WALLS[1];
const CORAL = ROOFS[0];
const TEAL = ROOFS[2];
const YELLOW = FLOWERS[1];
const PINK = FLOWERS[0];

/* --------------------------------- windsock --------------------------------- */

/** Sock band colours per variant: blue / cream, coral / cream. */
const SOCK_SETS: readonly (readonly [string, string])[] = [
  [BLUE, CREAM],
  [CORAL, CREAM],
];
export const SOCK = {
  poleH: 2.3,
  length: 1.45,
  rNear: 0.27,
  rFar: 0.1,
  bands: 5,
  droop: 0.12,
} as const;

function windsock({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.015);
  const set = SOCK_SETS[variant % SOCK_SETS.length];
  const top = SOCK.poleH + 0.1;
  // stone footing + tapered steel pole (rigid)
  put(acc, cylB(0.26, 0.22, 0.12, hi ? 7 : 3), [0, 0, 0], ROCK[1], { aoAmt: 0.3, windAbs: 0 });
  put(acc, cylB(0.075, 0.045, SOCK.poleH, hi ? 6 : 3), [0, 0.1, 0], K.steel, {
    aoAmt: 0.2,
    windAbs: 0,
  });
  // the ring the sock hangs from, on a short arm off the pole top (+x = downwind)
  const ringX = 0.16;
  const fl = (x: number): number => Math.min(1, 0.22 + 0.62 * (x / (SOCK.length + ringX)));
  if (hi) {
    put(acc, baseBox(0.18, 0.05, 0.05), [0.04, top - 0.06, 0], K.steel, {
      aoAmt: 0,
      windAbs: 0.05,
    });
    put(
      acc,
      new THREE.TorusGeometry(SOCK.rNear + 0.02, 0.028, 4, 10).rotateY(Math.PI / 2),
      [ringX, top - SOCK.rNear - 0.02, 0],
      K.steel,
      { aoAmt: 0, windAbs: 0.1 },
    );
  }
  // sock: open tapered bands along +x, drooping a little toward the tail
  const n = hi ? SOCK.bands : 2;
  const len = SOCK.length / n;
  const cy = top - SOCK.rNear - 0.02;
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const r0 = SOCK.rNear + (SOCK.rFar - SOCK.rNear) * t0;
    const r1 = SOCK.rNear + (SOCK.rFar - SOCK.rNear) * t1;
    const x = ringX + len * (i + 0.5);
    // CylinderGeometry(top, bottom): rotateZ(-π/2) turns +y into +x, so `top` is the far end
    const g = new THREE.CylinderGeometry(r1, r0, len * 1.02, hi ? 8 : 4, 1, true).rotateZ(
      -Math.PI / 2,
    );
    put(acc, g, [x, cy - SOCK.droop * (x - ringX), 0], i % 2 === 0 ? set[0] : set[1], {
      aoAmt: 0,
      double: true,
      noJitter: true,
      windAbs: fl(x),
    });
  }
  return acc.finish(rng, true, true);
}

/* ------------------------------- fairy wreath ------------------------------- */

/** Bulb rings round the canopy: [y0, y1] as fractions of the tree height, bulb count. */
const WREATH_RINGS: readonly (readonly [number, number, number])[] = [
  [0.4, 0.56, 12],
  [0.6, 0.8, 9],
];
const WREATH_RINGS_LOD1: readonly (readonly [number, number, number])[] = [[0.45, 0.7, 6]];
const BULB_COLORS = [
  EMISSIVE.window,
  EMISSIVE.window,
  EMISSIVE.lantern,
  PINK,
  EMISSIVE.window,
  TEAL,
];

function fairyWreath({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  // the same stream the roundTree def draws (registry `rngAs`): the same tree, bulb for bulb
  const tree = roundTree({ rng, lod, variant });
  const pos = tree.getAttribute('position');
  tree.computeBoundingBox();
  const maxY = tree.boundingBox?.max.y ?? 5;
  const acc = new Acc();
  const bulb =
    lod === 0 ? new THREE.OctahedronGeometry(0.1, 0) : new THREE.TetrahedronGeometry(0.17, 0);
  const used = new Set<number>();
  let n = 0;
  // the far proxy keeps one ring of six
  (lod === 0 ? WREATH_RINGS : WREATH_RINGS_LOD1).forEach(([f0, f1, count], ri) => {
    for (let k = 0; k < count; k++) {
      const a = ((k + 0.5 * (ri % 2)) / count) * Math.PI * 2;
      const cx = Math.cos(a);
      const sz = Math.sin(a);
      // the canopy vertex farthest out along this bearing inside the height band
      let best = -1;
      let bs = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y < f0 * maxY || y > f1 * maxY) continue;
        const s = pos.getX(i) * cx + pos.getZ(i) * sz;
        if (s > bs) {
          bs = s;
          best = i;
        }
      }
      if (best < 0 || bs < 0.6 || used.has(best)) continue;
      used.add(best);
      const out = V(cx, 0.15, sz).normalize().multiplyScalar(0.1);
      const p = V(pos.getX(best), pos.getY(best), pos.getZ(best)).add(out);
      const c = BULB_COLORS[n++ % BULB_COLORS.length];
      put(acc, bulb.clone(), p, c, {
        emissive: 1,
        ao: () => 1,
        aoAmt: 0,
        noJitter: true,
        // the tree's own sway weight at this height: bulbs ride the canopy
        windAbs: Math.min(1, (p.y / maxY) ** 2),
      });
    }
  });
  return acc.finish(rng, true, true);
}

/* --------------------------------- weather vane --------------------------------- */

/** Vertices emitted so far (Acc keeps its buffers private; ranges are exact, degenerate tris never land). */
const accVerts = (acc: Acc): number => (acc as unknown as { pos: number[] }).pos.length / 3;

/**
 * Weather vane for the devPod roof (variants 2 / 3, C11): a mast on the roof centre and an arrow
 * whose head is local +z. Returns the arrow's vertex range, to be yaw-tagged (`tagYawHead`) once the
 * geometry is finished: the shader turns it about the object's y axis into the wind, and the mast
 * stands on the object origin, so it turns on the mast.
 */
export function addVane(acc: Acc, y0: number): { first: number; count: number } {
  put(acc, cylB(0.03, 0.02, 0.55, 5), [0, y0, 0], K.steel, { aoAmt: 0.1 });
  put(acc, new THREE.SphereGeometry(0.05, 5, 4), [0, y0 + 0.56, 0], K.steel, { aoAmt: 0 });
  const first = accVerts(acc);
  const y = y0 + 0.56;
  put(acc, baseBox(0.06, 0.06, 0.78).translate(0, -0.03, 0), [0, y, 0], BLUE, { aoAmt: 0 });
  put(acc, new THREE.ConeGeometry(0.11, 0.26, 5).rotateX(Math.PI / 2), [0, y, 0.5], BLUE, {
    aoAmt: 0,
  });
  put(acc, baseBox(0.03, 0.3, 0.28), [0, y - 0.15, -0.36], CREAM, { aoAmt: 0 });
  return { first, count: accVerts(acc) - first };
}

/* -------------------------------- pinwheel -------------------------------- */

/** Pinwheel blade colours (roof / flower palette): coral, yellow, blue, cream. */
const VANES = [CORAL, YELLOW, BLUE, CREAM] as const;
export const PINWHEEL_VARIANT = 3;
const PIN = { stake: 1.3, hubZ: 0.11, r: 0.56 } as const;

/** A flat pinwheel vane: right triangle (0,0) → (r,0) → (r, 0.9 r), spanning the xy plane. */
const vaneGeo = (): THREE.BufferGeometry =>
  new THREE.ShapeGeometry(
    new THREE.Shape([V2(0.015, 0.015), V2(PIN.r, 0.015), V2(PIN.r, PIN.r * 0.92)]),
  );

export function pinwheel({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = new Acc();
  const spin = new Spin();
  // garden stake (a little sway weight at the top) + the hub bead
  put(acc, cylB(0.04, 0.028, PIN.stake, hi ? 6 : 3, !hi), [0, 0, 0], WOOD.planks, {
    aoAmt: 0.2,
    windAbs: 0.03,
  });
  const hub = V(0, PIN.stake + 0.04, PIN.hubZ);
  if (hi)
    put(acc, new THREE.SphereGeometry(0.05, 8, 6), hub, K.steel, {
      aoAmt: 0,
      windAbs: 0.03,
    });
  const tag = spin.tag(hub);
  const g = vaneGeo();
  for (let k = 0; k < 4; k++)
    put(acc, g.clone(), hub.clone().add(V(0, 0, 0.02)), VANES[k], {
      q: new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), (k * Math.PI) / 2),
      double: true,
      noJitter: true,
      aoAmt: 0,
      ao: () => 1,
      windAbs: tag,
    });
  return finishSpin(acc.finish(rng, true, true), acc, spin);
}

/* --------------------------------- registry --------------------------------- */

export const CODING_M22_GEO: readonly PropGeoDef[] = [
  { id: 'windsock', variants: 2, build: windsock, footprint: 0.5, height: 2.45, windy: true },
  {
    id: 'fairyWreath',
    variants: 3,
    build: fairyWreath,
    footprint: 1.2,
    height: 3.6,
    heights: [3.1, 3.3, 4.3],
    windy: true,
    rngAs: 'roundTree',
  },
];
