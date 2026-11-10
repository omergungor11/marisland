/**
 * Deniz Üstü Lunapark mini coaster, its worm train and the bumper boats (M53 TASK-670).
 *
 *   lunaCoaster v0-2  a closed stadium loop (15 / 21 / 27 u long, 6 u across) of cream rails, a coral
 *                     spine, sky ties and gold columns; one camelback over the deck straight (z > 0) and
 *                     two lower hills over the sea straight (z < 0). Pivot on the plank top at the loop's
 *                     centre; the columns on the sea side go down under the water (`groundSea`).
 *   lunaTrain v0-1    geo-only mover: v0 the worm head (face, antennae), v1 a passenger car. Origin = rail
 *                     top centre, front +z (as the QA coasterCar); the train rides the loop's spline
 *                     (`lunaCoasterPoints(length)` through world/coaster-spline.ts).
 *   lunaBoat v0-2     geo-only mover: a bumper boat (tube ring, cabin, pennant mast, night lamp) in
 *                     coral / sky / gold; origin on the water line at the centre.
 * Numbers: content/themes/marketing-luna-look.ts.
 */
import * as THREE from 'three';
import { LUNA_LOOK, lunaCoasterPoints } from '../../content/themes/marketing-luna-look.ts';
import {
  createCoasterSpline,
  newCoasterSample,
  sampleCoaster,
  type CoasterSample,
} from '../../world/coaster-spline.ts';
import type { Acc } from '../kit.ts';
import { qEuler } from '../kit.ts';
import { TAU, V, baseBox, cylB, jitterAcc, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { addHook } from './hq.ts';
import { P, bulb, flat, lit } from './marketing-luna-parts.ts';

const K = LUNA_LOOK.coaster;
const T = LUNA_LOOK.train;
const B = LUNA_LOOK.boat;

type V3 = readonly [number, number, number];

/** A ring of `sides` points (side, up) round (cx, cy). */
const ring = (cx: number, cy: number, r: number, sides: number): Array<[number, number]> =>
  Array.from({ length: sides }, (_, k) => [
    cx + r * Math.cos((k / sides) * TAU),
    cy + r * Math.sin((k / sides) * TAU),
  ]);

/** Sweep a ring along frames (open ends; neighbours cap the tubes). */
function sweep(
  acc: Acc,
  frames: CoasterSample[],
  rg: Array<[number, number]>,
  color: string,
  cls?: 'metal',
): void {
  const pos: number[] = [];
  const at = (f: CoasterSample, k: number): V3 => [
    f.pos[0] + f.side[0] * rg[k][0] + f.up[0] * rg[k][1],
    f.pos[1] + f.side[1] * rg[k][0] + f.up[1] * rg[k][1],
    f.pos[2] + f.side[2] * rg[k][0] + f.up[2] * rg[k][1],
  ];
  for (let i = 0; i + 1 < frames.length; i++)
    for (let k = 0; k < rg.length; k++) {
      const k1 = (k + 1) % rg.length;
      const a0 = at(frames[i], k);
      const a1 = at(frames[i], k1);
      const b0 = at(frames[i + 1], k);
      const b1 = at(frames[i + 1], k1);
      pos.push(...a0, ...a1, ...b1, ...a0, ...b1, ...b0);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  acc.add(g, { color: new THREE.Color(color), aoAmt: 0.05, windMul: 0, cls });
}

const groundAt = (_x: number, z: number): number => (z > 0.4 ? K.groundDeck : K.groundSea);

function lunaCoaster({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const length = K.lengths[variant];
  const points = lunaCoasterPoints(length);
  const sp = createCoasterSpline(points, { closed: true, step: 0.25 });
  const acc = jitterAcc(rng, 0.006);
  const step = hi ? K.step[0] : K.step[1];
  const n = Math.max(8, Math.round(sp.length / step));
  const frames: CoasterSample[] = [];
  for (let i = 0; i <= n; i++)
    frames.push(sampleCoaster(sp, (i / n) * sp.length, newCoasterSample()));
  for (const sx of [-1, 1])
    sweep(
      acc,
      frames,
      ring(sx * K.gauge * 0.5, -K.rail.r, hi ? K.rail.r : K.rail.r * 1.3, 3),
      K.rail.color,
      'metal',
    );
  sweep(acc, frames, ring(0, -K.spine.drop, K.spine.r, hi ? 4 : 3), K.spine.color);
  const tie = K.tie;
  if (hi) {
    const tr = rng.fork('ties');
    const tmp = newCoasterSample();
    for (let s = tie.every * 0.5; s < sp.length; s += tie.every) {
      sampleCoaster(sp, s, tmp);
      const m = new THREE.Matrix4().makeBasis(V(...tmp.side), V(...tmp.up), V(...tmp.tangent));
      m.setPosition(
        tmp.pos[0] + tmp.up[0] * (-K.rail.r * 2 - tie.h / 2),
        tmp.pos[1] + tmp.up[1] * (-K.rail.r * 2 - tie.h / 2),
        tmp.pos[2] + tmp.up[2] * (-K.rail.r * 2 - tie.h / 2),
      );
      m.multiply(new THREE.Matrix4().makeRotationY(tr.range(-0.04, 0.04)));
      acc.add(new THREE.BoxGeometry(tie.len, tie.h, tie.w), {
        m,
        color: new THREE.Color(tie.color),
        aoAmt: 0.05,
        windMul: 0,
      });
    }
  }
  // columns under the spine, ending at the deck or under the water
  const C = K.column;
  const every = hi ? C.every : C.every * 1.6;
  const tmp = newCoasterSample();
  for (let s = every * 0.5; s < sp.length; s += every) {
    sampleCoaster(sp, s, tmp);
    const top = tmp.pos[1] - K.spine.drop - K.spine.r;
    const g0 = groundAt(tmp.pos[0], tmp.pos[2]);
    if (top - g0 < C.minClear) continue;
    put(acc, cylB(C.r0, C.r1, top - g0, hi ? 6 : 4, true), [tmp.pos[0], g0, tmp.pos[2]], C.color, {
      aoAmt: 0.25,
      cls: 'metal',
    });
    if (hi && g0 === K.groundDeck)
      put(acc, baseBox(C.foot, 0.12, C.foot), [tmp.pos[0], g0, tmp.pos[2]], C.color, {
        aoAmt: 0.1,
      });
    if (hi)
      bulb(
        acc,
        V(tmp.pos[0] + tmp.side[0] * 0.55, top + 0.05, tmp.pos[2] + tmp.side[2] * 0.55),
        0.06,
        LUNA_LOOK.bulbs[Math.round(s / every) % 3],
      );
  }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'track', {
    length: sp.length,
    closed: true,
    gauge: K.gauge,
    points: points.length,
  });
}

/* ------------------------------------- train ------------------------------------- */

/** Wheels of a car: four small drums under the body (rail top = y 0). */
function bogies(acc: Acc, len: number, w: number, hi: boolean): void {
  if (!hi) return;
  for (const z of [-len * 0.3, len * 0.3])
    for (const s of [-1, 1])
      put(
        acc,
        new THREE.CylinderGeometry(0.1, 0.1, 0.07, 6).rotateZ(Math.PI / 2),
        [s * (K.gauge / 2), 0.1, z],
        P.ink,
        { aoAmt: 0 },
      );
  put(acc, baseBox(w * 0.7, 0.08, len * 0.8), [0, 0.1, 0], P.ink, { aoAmt: 0.1 });
}

function lunaTrain({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.006);
  if (variant === 0) {
    const H = T.head;
    bogies(acc, H.len, H.w, hi);
    // body tub and the big round head
    put(acc, baseBox(H.w, 0.5, H.len * 0.55), [0, 0.12, -H.len * 0.22], H.color, { aoAmt: 0.1 });
    put(acc, new THREE.IcosahedronGeometry(0.58, hi ? 1 : 0), [0, 0.72, H.len * 0.2], H.color, {
      aoAmt: 0.1,
    });
    // seat
    put(acc, baseBox(H.w * 0.7, 0.08, 0.5), [0, 0.64, -H.len * 0.3], P.cream, { aoAmt: 0 });
    // eyes (white, dark pupil), nose, smile
    for (const s of [-1, 1]) {
      put(
        acc,
        new THREE.IcosahedronGeometry(0.19, hi ? 1 : 0),
        [s * 0.23, 0.98, H.len * 0.2 + 0.4],
        P.white,
        { aoAmt: 0, noJitter: true },
      );
      put(
        acc,
        new THREE.IcosahedronGeometry(0.09, 0),
        [s * 0.23, 0.98, H.len * 0.2 + 0.54],
        P.ink,
        { aoAmt: 0, noJitter: true },
      );
      if (hi) {
        // antennae
        put(acc, cylB(0.03, 0.03, 0.45, 3, true), [s * 0.2, 1.22, H.len * 0.2 - 0.1], P.ink, {
          aoAmt: 0,
          q: qEuler(0, 0, -s * 0.35),
        });
        put(
          acc,
          new THREE.IcosahedronGeometry(0.1, 0),
          [s * 0.34, 1.7, H.len * 0.2 - 0.1],
          P.gold,
          lit,
        );
      }
    }
    if (hi) {
      put(acc, new THREE.IcosahedronGeometry(0.11, 0), [0, 0.74, H.len * 0.2 + 0.58], P.pink, {
        aoAmt: 0,
        noJitter: true,
      });
      put(acc, baseBox(0.3, 0.05, 0.05), [0, 0.5, H.len * 0.2 + 0.55], P.ink, { aoAmt: 0 });
    }
    return addHook(acc.finish(rng, false, true), 'train', {
      len: H.len,
      coupler: { back: -H.len / 2 },
    });
  }
  const C = T.car;
  bogies(acc, C.len, C.w, hi);
  const colr = T.colors[(variant - 1) % T.colors.length];
  put(acc, baseBox(C.w, C.h, C.len), [0, 0.12, 0], colr, { aoAmt: 0.1 });
  // cream rim round the open tub and a bench with a back
  if (hi) {
    put(acc, baseBox(C.w + 0.06, 0.07, C.len + 0.04), [0, 0.12 + C.h, 0], P.cream, { aoAmt: 0 });
    put(acc, baseBox(C.w * 0.8, 0.08, 0.45), [0, 0.42, -0.05], P.cream, { aoAmt: 0 });
    put(acc, baseBox(C.w * 0.8, 0.42, 0.08), [0, 0.5, -C.len / 2 + 0.2], colr, { aoAmt: 0.1 });
    for (const s of [-1, 1]) {
      bulb(
        acc,
        V(s * (C.w / 2 + 0.03), 0.12 + C.h + 0.1, 0.5),
        0.05,
        LUNA_LOOK.bulbs[(variant + (s > 0 ? 1 : 0)) % 3],
      );
      // cream spots down the sides: the worm's body
      for (const z of [-0.4, 0.3])
        put(
          acc,
          new THREE.IcosahedronGeometry(0.11, 0),
          [s * (C.w / 2 + 0.01), 0.12 + C.h * 0.5, z],
          P.cream,
          { aoAmt: 0, noJitter: true },
        );
    }
  }
  return addHook(acc.finish(rng, false, true), 'train', { len: C.len });
}

/* ------------------------------------- boats ------------------------------------- */

function lunaBoat({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.006);
  const c = B.colors[variant % B.colors.length];
  put(
    acc,
    new THREE.TorusGeometry(B.r, B.tube, hi ? 6 : 4, hi ? 14 : 8).rotateX(Math.PI / 2),
    [0, B.y, 0],
    c,
    { aoAmt: 0.1 },
  );
  if (hi)
    put(acc, cylB(B.r - 0.05, B.r - 0.05, 0.06, 14), [0, B.y - 0.04, 0], P.cream, { aoAmt: 0.1 });
  else
    put(acc, new THREE.CircleGeometry(B.r, 6).rotateX(-Math.PI / 2), [0, B.y + 0.1, 0], P.cream, {
      aoAmt: 0.1,
    });
  // the pilot's bench and a little windscreen
  if (hi) {
    put(acc, baseBox(0.55, 0.22, 0.4), [0, B.y + 0.02, -0.1], P.white, { aoAmt: 0.1 });
    put(acc, baseBox(0.62, 0.34, 0.08), [0, B.y + 0.1, -0.34], c, { aoAmt: 0.1 });
    put(acc, new THREE.PlaneGeometry(0.55, 0.3), [0, B.y + 0.5, 0.2], P.sky, {
      ...flat,
      double: true,
      cls: 'glass',
      noJitter: true,
      q: qEuler(-0.4, 0, 0),
    });
    // bow eyes: the boat looks at you
    for (const s of [-1, 1]) {
      put(acc, new THREE.IcosahedronGeometry(0.13, 0), [s * 0.22, B.y + 0.3, B.r + 0.18], P.white, {
        aoAmt: 0,
        noJitter: true,
      });
      put(acc, new THREE.IcosahedronGeometry(0.06, 0), [s * 0.22, B.y + 0.3, B.r + 0.29], P.ink, {
        aoAmt: 0,
        noJitter: true,
      });
    }
  }
  // pennant mast with a night lamp
  if (hi) put(acc, cylB(0.03, 0.025, B.mast, 3, true), [0, B.y + 0.2, -0.5], P.ink, { aoAmt: 0 });
  bulb(acc, V(0, B.y + 0.2 + B.mast + 0.05, -0.5), 0.09, LUNA_LOOK.bulbs[variant % 3]);
  if (hi) {
    const tri = new THREE.BufferGeometry();
    tri.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0.1, 0, 0, -0.1, 0, 0.4, 0, 0], 3),
    );
    put(acc, tri, [0, B.y + B.mast - 0.1, -0.5], P.pink, { ...flat, double: true, noJitter: true });
  }
  return acc.finish(rng, false, true);
}

export const LUNA_COASTER_GEO: readonly PropGeoDef[] = [
  {
    id: 'lunaCoaster',
    variants: K.lengths.length,
    build: lunaCoaster,
    footprint: 0.6,
    height: K.base + K.hillDeck.rise,
    windy: false,
  },
  {
    id: 'lunaTrain',
    variants: 4,
    build: lunaTrain,
    footprint: 0.8,
    height: 1.8,
    heights: [1.79, 0.92, 0.92, 0.92],
    windy: false,
  },
  {
    id: 'lunaBoat',
    variants: B.colors.length,
    build: lunaBoat,
    footprint: 1.3,
    height: B.mast + 0.5,
    windy: false,
  },
];
