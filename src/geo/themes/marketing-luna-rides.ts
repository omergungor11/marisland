/**
 * Deniz Üstü Lunapark rides (M53 TASK-670): the static bases and their moving parts.
 *
 *   lunaRide v0  chain swing ride: step, mint disc, striped tower, bearing collar (static)
 *   lunaRide v1  drop tower: plinth, striped square column, gold rails, cap, star topper (static)
 *   lunaRide v2  carousel: plinth, gold centre pole, posts, striped roof + fascia, finial (static)
 *   lunaSwingTop     geo-only mover: canopy + arms + chains + chairs; origin on the tower axis at the
 *                    hinge (`swing.hingeY` over the base pivot); turns about +y
 *   lunaDropCar      geo-only mover: the gondola ring + 4 outward seats; origin on the column axis at
 *                    the ring's centre; travels along +y between `drop.lo` and `drop.hi`
 *   lunaCarouselTop  geo-only mover: platform + drum + gold poles + 8 horses; origin on the axis at
 *                    the platform top (`carousel.platform.y`); turns about +y, horses bob (static pose
 *                    alternates +/- `bob`)
 * Frames: base pivot on the plank top (the ride stands at the deck's `top`), front = +z. The wheel is
 * the land fair's `ferrisWheel` (no geometry here). Numbers: content/themes/marketing-luna-look.ts.
 */
import * as THREE from 'three';
import { LUNA_LOOK } from '../../content/themes/marketing-luna-look.ts';
import type { Acc } from '../kit.ts';
import { qEuler } from '../kit.ts';
import { TAU, V, baseBox, cylB, jitterAcc, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { P, bulb, candyPole, canopy, cloth, lit, rod, wedge } from './marketing-luna-parts.ts';

const SW = LUNA_LOOK.swing;
const DR = LUNA_LOOK.drop;
const CA = LUNA_LOOK.carousel;
const CY = LUNA_LOOK.cycle;
const BU = LUNA_LOOK.bulbs;

/* ----------------------------------- swing ----------------------------------- */

function swingBase({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.006);
  const seg = hi ? 14 : 7;
  put(acc, cylB(SW.step.r, SW.step.r - 0.1, SW.step.h, seg), [0, 0, 0], P.cream, { aoAmt: 0.2 });
  if (!hi) {
    put(acc, cylB(SW.tower.r0, SW.tower.r1, SW.tower.h + SW.step.h, 5), [0, 0, 0], P.coral, {
      aoAmt: 0.1,
    });
    put(
      acc,
      cylB(SW.collar.r, SW.collar.r, SW.collar.h, 5),
      [0, SW.hingeY - 0.3, 0],
      SW.collar.color,
      { aoAmt: 0 },
    );
    return acc.finish(rng, false, true);
  }
  put(acc, cylB(SW.disc.r, SW.disc.r, 0.03, seg), [0, SW.step.h, 0], SW.disc.color, { aoAmt: 0 });
  candyPole(
    acc,
    [0, SW.step.h, 0],
    SW.tower.r0,
    SW.tower.r1,
    SW.tower.h,
    hi ? SW.tower.bands : 3,
    [P.coral, P.cream],
    hi ? 10 : 6,
    'metal',
  );
  put(
    acc,
    cylB(SW.collar.r, SW.collar.r, SW.collar.h, hi ? 10 : 6),
    [0, SW.hingeY - 0.3, 0],
    SW.collar.color,
    {
      aoAmt: 0,
      cls: 'metal',
    },
  );
  if (hi)
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      bulb(
        acc,
        V(Math.cos(a) * (SW.step.r - 0.12), SW.step.h + 0.08, Math.sin(a) * (SW.step.r - 0.12)),
        0.075,
        BU[k % 3],
      );
    }
  return acc.finish(rng, false, true);
}

function swingTop({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.006);
  const C = SW.canopy;
  canopy(acc, [0, 0, 0], C.r, C.rise, hi ? C.segs : 6, [P.coral, P.cream], 0.02, hi);
  put(acc, cylB(C.r, C.r * 0.96, 0.1, hi ? C.segs : 6), [0, -0.12, 0], P.warm, {
    ...lit,
    cls: 'metal',
  });
  if (hi) {
    put(acc, new THREE.SphereGeometry(SW.finial.r, 8, 6), [0, C.rise + SW.finial.pole, 0], P.gold, {
      aoAmt: 0,
      cls: 'metal',
    });
    rod(acc, V(0, C.rise - 0.05, 0), V(0, C.rise + SW.finial.pole, 0), 0.05, P.gold, 4, 'metal');
  } else {
    put(acc, new THREE.OctahedronGeometry(SW.finial.r, 0), [0, C.rise + 0.2, 0], P.gold, {
      aoAmt: 0,
    });
  }
  if (hi)
    for (let k = 0; k < C.bulbs; k++) {
      const a = (k / C.bulbs) * TAU;
      bulb(acc, V(Math.cos(a) * (C.r - 0.05), -0.18, Math.sin(a) * (C.r - 0.05)), 0.085, BU[k % 3]);
    }
  const A = SW.arms;
  const ch = SW.chain;
  const cr = SW.chair;
  for (let k = 0; k < A.n; k++) {
    const a = (k / A.n) * TAU;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const armY = -0.3;
    // the arm (hub to the chain hook) and the chair hanging out `tilt` rad
    const hook = V(dx * A.r, armY, dz * A.r);
    if (hi) rod(acc, V(0, armY, 0), hook, 0.06, P.steel, 4, 'metal');
    const seatC = V(
      dx * (A.r + Math.sin(ch.tilt) * ch.len),
      armY - Math.cos(ch.tilt) * ch.len,
      dz * (A.r + Math.sin(ch.tilt) * ch.len),
    );
    const colr = CY[k % CY.length];
    // chair frame: facing the direction of travel (local z = tangent), local x = outward (lateral)
    const q = qEuler(0, -a, 0);
    const out = V(dx, 0, dz);
    const tan = V(-dz, 0, dx);
    if (!hi) {
      // far: one octahedron per chair, hung from the rim
      put(acc, new THREE.OctahedronGeometry(0.42, 0), seatC.clone().add(V(0, 0.3, 0)), colr, {
        aoAmt: 0.1,
      });
      continue;
    }
    put(acc, baseBox(cr.w, cr.seat, cr.d), seatC, colr, { q, aoAmt: 0.1 });
    if (hi) {
      put(
        acc,
        baseBox(cr.w, cr.back, 0.08),
        seatC
          .clone()
          .add(tan.clone().multiplyScalar(-(cr.d / 2 - 0.04)))
          .add(V(0, cr.seat, 0)),
        colr,
        { q, aoAmt: 0.1 },
      );
      for (const s of [-1, 1]) {
        const topP = hook.clone().add(out.clone().multiplyScalar(s * ch.gap));
        const bot = seatC
          .clone()
          .add(out.clone().multiplyScalar(s * (cr.w / 2 - 0.04)))
          .add(V(0, cr.seat, 0));
        rod(acc, bot, topP, ch.w, P.steel, 3, 'metal');
      }
    }
  }
  return acc.finish(rng, false, true);
}

/* --------------------------------- drop tower --------------------------------- */

function dropBase({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.006);
  const K = DR.column;
  put(acc, baseBox(DR.plinth.w, DR.plinth.h, DR.plinth.w), [0, 0, 0], P.cream, { aoAmt: 0.2 });
  const bands = hi ? K.bands : 4;
  const hb = (K.to - K.from) / bands;
  for (let i = 0; i < bands; i++)
    put(acc, baseBox(K.w, hb, K.w), [0, K.from + i * hb, 0], i % 2 ? P.cream : P.lilac, {
      aoAmt: 0.1,
      cls: 'metal',
    });
  if (hi)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        put(
          acc,
          baseBox(DR.rail.w, K.to - K.from, DR.rail.w),
          [sx * DR.rail.off, K.from, sz * DR.rail.off],
          DR.rail.color,
          {
            aoAmt: 0,
            cls: 'metal',
          },
        );
  // cap, roof, star
  put(acc, baseBox(DR.cap.w, DR.cap.h, DR.cap.w), [0, K.to, 0], P.gold, {
    aoAmt: 0.05,
    cls: 'metal',
  });
  put(
    acc,
    new THREE.ConeGeometry(DR.roof.r, DR.roof.h, 4)
      .rotateY(Math.PI / 4)
      .translate(0, DR.roof.h / 2, 0),
    [0, K.to + DR.cap.h, 0],
    P.coral,
    { aoAmt: 0.05 },
  );
  put(
    acc,
    new THREE.OctahedronGeometry(DR.star.r, 0),
    [0, K.to + DR.cap.h + DR.star.y, 0],
    P.gold,
    lit,
  );
  if (hi) {
    // chase of bulbs up the four faces and round the cap
    for (let r = 0; r < DR.bulbRows; r++) {
      const y = K.from + 0.6 + (r * (K.to - K.from - 1.0)) / (DR.bulbRows - 1);
      for (const [sx, sz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        bulb(acc, V(sx * (K.w / 2 + 0.07), y, sz * (K.w / 2 + 0.07)), 0.06, BU[r % 3]);
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      bulb(acc, V(Math.cos(a) * 1.05, K.to + 0.1, Math.sin(a) * 1.05), 0.075, BU[k % 3]);
    }
    for (let i = 0; i < 3; i++)
      put(
        acc,
        baseBox(1.3, 0.12 * (i + 1), 0.3),
        [0, 0, DR.plinth.w / 2 + 0.3 * (2 - i)],
        P.cream,
        { aoAmt: 0.1 },
      );
  }
  return acc.finish(rng, false, true);
}

function dropCar({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.006);
  const C = DR.car;
  const half = C.hole / 2;
  const arm = (C.w - C.hole) / 2;
  // the square ring round the column (two long arms along x, two short along z)
  for (const s of [-1, 1]) {
    put(acc, new THREE.BoxGeometry(C.w, C.h, arm), [0, 0, s * (half + arm / 2)], P.coral, {
      aoAmt: 0.1,
      cls: 'metal',
    });
    put(acc, new THREE.BoxGeometry(arm, C.h, C.hole), [s * (half + arm / 2), 0, 0], P.coral, {
      aoAmt: 0.1,
      cls: 'metal',
    });
  }
  for (let k = 0; k < 4; k++) {
    const q = qEuler(0, (k * Math.PI) / 2, 0);
    const colr = [P.sky, P.gold, P.mint, P.pink][k];
    const o = (x: number, y: number, z: number): THREE.Vector3 => V(x, y, z).applyQuaternion(q);
    // seat facing out along local +z: seat plank, backrest against the ring, lap bar
    put(acc, baseBox(C.seatW, 0.14, C.seatD), o(0, -C.seatDrop, C.reach), colr, { q, aoAmt: 0.1 });
    if (hi) {
      put(
        acc,
        baseBox(C.seatW, 0.6, 0.1),
        o(0, -C.seatDrop + 0.14, C.reach - C.seatD / 2 + 0.05),
        colr,
        { q, aoAmt: 0.1 },
      );
      for (const sx of [-0.55, 0.55])
        put(
          acc,
          baseBox(0.08, C.seatDrop - 0.1, 0.08),
          o(sx, -C.seatDrop + 0.1, C.reach - C.seatD / 2 + 0.05),
          P.steel,
          {
            q,
            aoAmt: 0,
            cls: 'metal',
          },
        );
      put(
        acc,
        baseBox(C.seatW * 0.8, 0.07, 0.07),
        o(0, -C.seatDrop + 0.55, C.reach + C.seatD / 2 - 0.05),
        P.gold,
        {
          q,
          aoAmt: 0,
          cls: 'metal',
        },
      );
      bulb(acc, o(0, 0.05, C.w / 2 + 0.05), 0.07, BU[k % 3]);
    }
  }
  return acc.finish(rng, false, true);
}

/* ---------------------------------- carousel ---------------------------------- */

function carouselBase({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.006);
  const seg = hi ? CA.roof.segs : 7;
  if (hi)
    put(acc, cylB(CA.step.r, CA.step.r - 0.08, CA.step.h, seg), [0, 0, 0], P.cream, { aoAmt: 0.2 });
  put(acc, cylB(CA.plinth.r, CA.plinth.r - 0.05, CA.plinth.h, seg), [0, 0, 0], P.coral, {
    aoAmt: 0.15,
  });
  put(acc, cylB(CA.pole.r, CA.pole.r, CA.fascia.y, hi ? 10 : 4), [0, CA.plinth.h, 0], P.gold, {
    aoAmt: 0.05,
    cls: 'metal',
  });
  const F = CA.fascia;
  put(
    acc,
    new THREE.CylinderGeometry(F.r, F.r, F.h, seg, 1, true).translate(0, F.h / 2, 0),
    [0, F.y, 0],
    wedge(0, 0, seg, [P.coral, P.cream]),
    {
      ...cloth,
      double: hi,
    },
  );
  canopy(acc, [0, F.y + F.h, 0], CA.roof.r, CA.roof.rise, seg, [P.cream, P.coral], 0.02, hi);
  const top = F.y + F.h + CA.roof.rise;
  if (hi) {
    put(acc, new THREE.SphereGeometry(CA.finial.r, 8, 6), [0, top + CA.finial.pole, 0], P.gold, {
      aoAmt: 0,
      cls: 'metal',
    });
    rod(acc, V(0, top - 0.05, 0), V(0, top + CA.finial.pole, 0), 0.05, P.gold, 4, 'metal');
  } else {
    put(acc, new THREE.OctahedronGeometry(CA.finial.r, 0), [0, top + 0.3, 0], P.gold, { aoAmt: 0 });
  }
  if (hi) {
    for (let k = 0; k < CA.posts.n; k++) {
      const a = (k / CA.posts.n) * TAU + Math.PI / CA.posts.n;
      const x = Math.cos(a) * CA.posts.r;
      const z = Math.sin(a) * CA.posts.r;
      rod(acc, V(x, CA.plinth.h, z), V(x, F.y, z), CA.posts.rad, P.gold, 5, 'metal');
    }
    for (let k = 0; k < CA.bulbs; k++) {
      const a = (k / CA.bulbs) * TAU;
      bulb(
        acc,
        V(Math.cos(a) * (F.r + 0.02), F.y - 0.05, Math.sin(a) * (F.r + 0.02)),
        0.085,
        BU[k % 3],
      );
    }
    for (let i = 0; i < 3; i++)
      put(acc, baseBox(1.3, 0.1 * (i + 1), 0.3), [0, 0, CA.step.r - 0.1 + 0.3 * (2 - i)], P.cream, {
        aoAmt: 0.1,
      });
  }
  return acc.finish(rng, false, true);
}

/** One carousel horse, standing on y = `y`, facing local +z (x = across). */
function horse(
  acc: Acc,
  at: THREE.Vector3,
  yaw: number,
  coat: string,
  saddle: string,
  hi: boolean,
): void {
  const q = qEuler(0, yaw, 0);
  const o = (x: number, y: number, z: number): THREE.Vector3 =>
    V(x, y, z).applyQuaternion(q).add(at);
  if (!hi) {
    put(acc, baseBox(0.4, 1.0, 1.1), o(0, 0.1, 0.1), coat, { q, aoAmt: 0.1 });
    return;
  }
  put(acc, baseBox(0.36, 0.4, 0.9), o(0, 0.55, 0), coat, { q, aoAmt: 0.1 });
  put(acc, baseBox(0.4, 0.07, 0.4), o(0, 0.95, -0.05), saddle, { q, aoAmt: 0 });
  put(acc, baseBox(0.28, 0.6, 0.28), o(0, 0.9, 0.42), coat, {
    q: q.clone().multiply(qEuler(0.45, 0, 0)),
    aoAmt: 0.1,
  });
  put(acc, baseBox(0.26, 0.26, 0.52), o(0, 1.42, 0.68), coat, {
    q: q.clone().multiply(qEuler(-0.35, 0, 0)),
    aoAmt: 0.1,
  });
  put(acc, baseBox(0.07, 0.5, 0.07), o(0, 1.0, 0.3), saddle, {
    q: q.clone().multiply(qEuler(0.45, 0, 0)),
    aoAmt: 0,
  });
  put(acc, baseBox(0.09, 0.5, 0.09), o(0, 0.45, -0.52), saddle, {
    q: q.clone().multiply(qEuler(-0.3, 0, 0)),
    aoAmt: 0,
  });
  put(acc, baseBox(0.3, 0.55, 0.1), o(0, 0.02, 0.32), coat, {
    q: q.clone().multiply(qEuler(-0.35, 0, 0)),
    aoAmt: 0.1,
  });
  put(acc, baseBox(0.3, 0.55, 0.1), o(0, 0.02, -0.3), coat, {
    q: q.clone().multiply(qEuler(0.3, 0, 0)),
    aoAmt: 0.1,
  });
}

function carouselTop({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.006);
  const Pf = CA.platform;
  const seg = hi ? 16 : 7;
  put(acc, cylB(Pf.r, Pf.r, Pf.h, seg), [0, -Pf.h, 0], P.cream, { aoAmt: 0.1 });
  if (hi) put(acc, cylB(Pf.r - 0.45, Pf.r - 0.45, 0.02, seg), [0, 0, 0], P.coral, { aoAmt: 0 });
  // the drum: pastel panels, a gold cap
  put(
    acc,
    new THREE.CylinderGeometry(CA.drum.r, CA.drum.r, CA.drum.h, hi ? 12 : 6).translate(
      0,
      CA.drum.h / 2,
      0,
    ),
    [0, 0, 0],
    wedge(0, 0, hi ? 12 : 6, [P.blush, P.sky, P.mint, P.lilac]),
    { emissive: 1, aoAmt: 0.1, noJitter: true, cls: 'glass' },
  );
  if (hi)
    put(acc, cylB(CA.drum.r + 0.08, CA.drum.r + 0.08, 0.14, 12), [0, CA.drum.h, 0], P.gold, {
      aoAmt: 0,
      cls: 'metal',
    });
  const H = CA.horses;
  for (let k = 0; k < H.n; k++) {
    const a = (k / H.n) * TAU;
    const x = Math.cos(a) * H.r;
    const z = Math.sin(a) * H.r;
    const bob = k % 2 ? H.bob : -H.bob * 0.2;
    // facing the direction of travel (counter-clockwise seen from above)
    const yaw = -a;
    horse(acc, V(x, bob + 0.12, z), yaw, CY[k % CY.length], CY[(k + 3) % CY.length], hi);
    if (hi) rod(acc, V(x, 0, z), V(x, H.pole, z), 0.045, P.gold, 4, 'metal');
    else rod(acc, V(x, 0, z), V(x, H.pole, z), 0.07, P.gold, 3);
    if (hi && k % 2 === 0) bulb(acc, V(x, 0.18, z), 0.06, BU[k % 3]);
  }
  return acc.finish(rng, false, true);
}

/* ---------------------------------- registry ---------------------------------- */

const rideBuild = [swingBase, dropBase, carouselBase] as const;
/** The measured heights of the three bases (the tower tip, the finial). */
const BASE_H = [5.6, 10.04, 7.5];

export const LUNA_RIDES_GEO: readonly PropGeoDef[] = [
  {
    id: 'lunaRide',
    variants: 3,
    build: (o) => rideBuild[o.variant](o),
    footprint: 3.6,
    height: Math.max(...BASE_H),
    heights: BASE_H,
    windy: false,
  },
  // geo-only mover meshes (no PropDef): posed and driven by the motion task from the base's pivot
  { id: 'lunaSwingTop', variants: 1, build: swingTop, footprint: 3.8, height: 1.9, windy: false },
  { id: 'lunaDropCar', variants: 1, build: dropCar, footprint: 1.6, height: 0.2, windy: false },
  {
    id: 'lunaCarouselTop',
    variants: 1,
    build: carouselTop,
    footprint: 3.1,
    height: 3.7,
    windy: false,
  },
];
