/**
 * Research island sculptures and outdoor science (TASK-402a): atomSculpture, dnaHelix,
 * armillarySphere, scholarStatue, rocketMonument; radioDish, labPod. Colours: SCIENCE_PALETTE
 * (content/themes/research.ts). Defs: content/props-themes/research.ts.
 *
 * Conventions: pivot at the ground centre, front / door / dish tilt on local +z, 1 u = 1 m.
 * Porthole and window glass glows at night (emissive 1, same class as building windows).
 */
import * as THREE from 'three';
import { SCIENCE_PALETTE as S } from '../../content/themes/research.ts';
import { qEuler, qFromTo, type Acc } from '../kit.ts';
import { Spin, finishSpin } from '../office-kit.ts';
import { TAU, V, V2, baseBox, cylB, jitterAcc, prism, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { addHook } from './hq.ts';
import { launchGantry, weatherHead } from './research-m22.ts';
import { tagYawHead } from './surface-tags.ts';

const Y = V(0, 1, 0);
const PI = Math.PI;

/** Open thin cylinder from a to b. */
function strut(
  acc: Acc,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  color: string,
  sides = 4,
): void {
  const d = b.clone().sub(a);
  put(
    acc,
    new THREE.CylinderGeometry(r, r, d.length(), sides, 1, true),
    a.clone().add(b).multiplyScalar(0.5),
    color,
    {
      q: qFromTo(Y, d),
      aoAmt: 0,
    },
  );
}

/** Two-step stone plinth (radius r), top at y = h. */
function plinth(acc: Acc, r: number, h: number, lod: 0 | 1, color: string = S.plinth): number {
  const seg = lod === 0 ? 10 : 6;
  put(acc, cylB(r, r - 0.08, h * 0.45, seg), [0, 0, 0], S.plinthDark, { aoAmt: 0.25 });
  put(acc, cylB(r - 0.2, r - 0.28, h * 0.55, seg), [0, h * 0.45, 0], color, { aoAmt: 0.15 });
  return h;
}

/* ------------------------------ atomSculpture ------------------------------ */

/** Brass atom: nucleus cluster on a post, three tilted elliptical orbit rings with electron beads. */
function atomSculpture({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.01);
  const hi = lod === 0;
  const top = plinth(acc, 1.15, 0.7, lod);
  const cy = top + 2.15;
  put(acc, cylB(0.09, 0.09, cy - top, 5, true), [0, top, 0], S.brass, { aoAmt: 0.1 });
  // nucleus: 3 fused lumps
  const lumps: [number, number, number, number][] = [
    [0, 0, 0, 0.42],
    [0.26, 0.12, 0.1, 0.3],
    [-0.2, -0.14, 0.2, 0.3],
  ];
  lumps.forEach(([x, y, z, r], k) =>
    put(acc, new THREE.IcosahedronGeometry(r, hi ? 1 : 0), [x, cy + y, z], S.nucleus[k], {
      aoAmt: 0.05,
    }),
  );
  // three ellipse rings, 60 deg apart about y, each tilted 62 deg out of the horizontal
  const Rx = 1.35;
  const sq = 0.5;
  for (let k = 0; k < 3; k++) {
    const q = qEuler(0, (k * PI) / 3, 0)
      .multiply(qEuler(0, 0, 1.08))
      .multiply(qEuler(PI / 2, 0, 0));
    put(acc, new THREE.TorusGeometry(Rx, 0.05, hi ? 4 : 3, hi ? 36 : 8), [0, cy, 0], S.orbit, {
      q,
      s: [1, sq, 1],
      aoAmt: 0,
    });
    // electron bead on the ring (torus lies in the local xy plane before q)
    const t = 0.9 + k * 2.1;
    const p = V(Math.cos(t) * Rx, Math.sin(t) * Rx * sq, 0).applyQuaternion(q);
    put(acc, new THREE.IcosahedronGeometry(0.14, hi ? 1 : 0), p.add(V(0, cy, 0)), S.electron, {
      emissive: 0.5,
      aoAmt: 0,
    });
  }
  return acc.finish(rng, false, true);
}

/* --------------------------------- dnaHelix --------------------------------- */

/** Twisting double helix (teal + coral strands, two-tone rungs) on a stone plinth. */
function dnaHelix({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.01);
  const hi = lod === 0;
  const top = plinth(acc, 1.0, 0.6, lod);
  const H = 3.9;
  const r = 0.62;
  const turns = 2.1;
  const n = hi ? 26 : 12;
  const pt = (i: number, strand: number): THREE.Vector3 => {
    const t = i / n;
    const a = t * turns * TAU + strand * PI;
    return V(Math.cos(a) * r, top + 0.15 + t * H, Math.sin(a) * r);
  };
  for (let i = 0; i < n; i++)
    for (let s = 0; s < 2; s++)
      strut(acc, pt(i, s), pt(i + 1, s), hi ? 0.085 : 0.11, S.strand[s], hi ? 5 : 3);
  if (hi) {
    for (let s = 0; s < 2; s++)
      for (let i = 0; i <= n; i += 2)
        put(acc, new THREE.IcosahedronGeometry(0.13, 0), pt(i, s), S.strand[s], { aoAmt: 0 });
  }
  const step = hi ? 2 : 3;
  for (let i = 0; i <= n; i += step) {
    const a = pt(i, 0);
    const b = pt(i, 1);
    const m = a.clone().add(b).multiplyScalar(0.5);
    strut(acc, a, m, hi ? 0.04 : 0.06, S.rung[0], hi ? 4 : 3);
    strut(acc, m, b, hi ? 0.04 : 0.06, S.rung[1], hi ? 4 : 3);
  }
  // spine post hidden inside the helix (reads as a core at distance)
  put(acc, cylB(0.05, 0.05, H, 3, true), [0, top, 0], S.brass, { aoAmt: 0 });
  return acc.finish(rng, false, true);
}

/* ------------------------------ armillarySphere ------------------------------ */

/** Brass armillary sphere (rings around a tilted axis, earth ball) on a stone pedestal. */
function armillarySphere({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.01);
  const hi = lod === 0;
  const top = plinth(acc, 0.95, 0.8, lod);
  put(acc, cylB(0.35, 0.3, 0.7, hi ? 8 : 5), [0, top, 0], S.plinth, { aoAmt: 0.15 });
  put(acc, cylB(0.62, 0.45, 0.14, hi ? 10 : 6), [0, top + 0.7, 0], S.brass, { aoAmt: 0.1 });
  const cy = top + 0.84 + 1.25;
  const R = 1.1;
  const tilt = qEuler(0, 0, 0.41);
  const tube = 0.06;
  const ring = (q: THREE.Quaternion, r: number, c: string): void =>
    put(acc, new THREE.TorusGeometry(r, tube, hi ? 4 : 3, hi ? 32 : 8), [0, cy, 0], c, {
      q: tilt.clone().multiply(q),
      aoAmt: 0,
    });
  ring(qEuler(PI / 2, 0, 0), R, S.brass); // equator
  ring(qEuler(0, 0, 0), R, S.brass); // meridian
  ring(qEuler(0, PI / 2, 0), R * 0.98, S.brass); // second meridian
  ring(qEuler(PI / 2 + 0.41, 0, 0), R * 0.86, S.bronze); // ecliptic
  // axis rod through the poles + the earth
  put(acc, cylB(0.04, 0.04, 2 * R + 0.8, 4, true), [0, cy - R - 0.4, 0], S.bronzeDark, {
    q: tilt,
    aoAmt: 0,
  });
  put(acc, new THREE.IcosahedronGeometry(0.34, hi ? 1 : 0), [0, cy, 0], S.dishRing, {
    aoAmt: 0.05,
  });
  if (hi) {
    // horizon ring on four brackets
    put(acc, new THREE.TorusGeometry(R + 0.4, 0.05, 3, 28), [0, top + 0.84 + 0.35, 0], S.brass, {
      q: qEuler(PI / 2, 0, 0),
      aoAmt: 0,
    });
    for (let k = 0; k < 4; k++) {
      const a = (k * PI) / 2 + PI / 4;
      strut(
        acc,
        V(Math.sin(a) * 0.45, top + 0.8, Math.cos(a) * 0.45),
        V(Math.sin(a) * (R + 0.4), top + 1.19, Math.cos(a) * (R + 0.4)),
        0.03,
        S.bronzeDark,
      );
    }
    for (const sgn of [-1, 1])
      put(
        acc,
        new THREE.IcosahedronGeometry(0.09, 0),
        V(0, sgn * (R + 0.4), 0)
          .applyQuaternion(tilt)
          .add(V(0, cy, 0)),
        S.brass,
        {
          aoAmt: 0,
        },
      );
  }
  return acc.finish(rng, false, true);
}

/* ------------------------------ scholarStatue ------------------------------ */

/**
 * Chunky bronze scholar on a marble plinth, facing +z, mortarboard with a gold tassel. v0 holds an
 * open book, v1 raises a telescope.
 */
function scholarStatue({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const seg = hi ? 10 : 5;
  put(acc, baseBox(1.5, 0.3, 1.5), [0, 0, 0], S.plinthDark, { aoAmt: 0.25 });
  put(acc, baseBox(1.15, 0.8, 1.15), [0, 0.3, 0], S.marble, { aoAmt: 0.15 });
  put(acc, baseBox(1.3, 0.12, 1.3), [0, 1.1, 0], S.plinth, { aoAmt: 0.05 });
  const y0 = 1.22;
  // robe, shoulders, head, cap
  put(acc, cylB(0.62, 0.36, 1.45, seg), [0, y0, 0], S.bronze, { aoAmt: 0.15 });
  if (hi)
    put(acc, new THREE.SphereGeometry(0.4, seg, 4, 0, TAU, 0, PI / 2), [0, y0 + 1.4, 0], S.bronze, {
      aoAmt: 0.05,
    });
  put(acc, new THREE.IcosahedronGeometry(0.31, hi ? 1 : 0), [0, y0 + 1.82, 0.02], S.bronze, {
    aoAmt: 0,
  });
  if (hi) put(acc, cylB(0.26, 0.26, 0.14, seg), [0, y0 + 2.0, 0], S.bronzeDark, { aoAmt: 0 });
  put(acc, baseBox(0.78, 0.06, 0.78), [0, y0 + 2.12, 0], S.bronzeDark, { aoAmt: 0 });
  if (hi)
    put(acc, new THREE.IcosahedronGeometry(0.06, 0), [0.36, y0 + 2.07, 0.36], S.brass, {
      aoAmt: 0,
    });
  if (hi) {
    // face: two eyes + stubby nose
    for (const sx of [-1, 1])
      put(acc, new THREE.IcosahedronGeometry(0.035, 0), [sx * 0.11, y0 + 1.86, 0.3], S.bronzeDark, {
        aoAmt: 0,
      });
    put(acc, new THREE.IcosahedronGeometry(0.05, 0), [0, y0 + 1.78, 0.33], S.bronze, { aoAmt: 0 });
  }
  // arms (chunky stubs) + attribute
  if (variant === 0) {
    for (const sx of hi ? [-1, 1] : [])
      put(acc, cylB(0.12, 0.1, 0.55, 5), [sx * 0.42, y0 + 0.75, 0.2], S.bronze, {
        q: qEuler(1.1, 0, -sx * 0.25),
        aoAmt: 0.05,
      });
    // open book held at the chest
    for (const sx of hi ? [-1, 1] : [])
      put(acc, new THREE.BoxGeometry(0.32, 0.05, 0.4), [sx * 0.16, y0 + 1.05, 0.58], S.marble, {
        q: qEuler(-0.7, 0, sx * 0.25),
        aoAmt: 0,
      });
    if (hi)
      put(acc, new THREE.BoxGeometry(0.06, 0.08, 0.4), [0, y0 + 1.04, 0.56], S.bronzeDark, {
        q: qEuler(-0.7, 0, 0),
        aoAmt: 0,
      });
  } else {
    // right arm raised with a telescope pointing up and forward
    if (hi)
      put(acc, cylB(0.12, 0.1, 0.55, 5), [-0.42, y0 + 0.75, 0.2], S.bronze, {
        q: qEuler(1.1, 0, 0.25),
        aoAmt: 0.05,
      });
    const a = V(0.42, y0 + 1.0, 0.25);
    const d = V(0.15, 1, 0.55).normalize();
    if (hi)
      put(acc, cylB(0.13, 0.1, 0.55, 5), [0.42, y0 + 0.55, 0.12], S.bronze, {
        q: qEuler(0.4, 0, -0.2),
        aoAmt: 0.05,
      });
    put(
      acc,
      new THREE.CylinderGeometry(0.1, 0.07, 1.0, hi ? 6 : 4),
      a.clone().addScaledVector(d, 0.35),
      S.brass,
      {
        q: qFromTo(Y, d),
        aoAmt: 0,
      },
    );
    put(
      acc,
      new THREE.CylinderGeometry(0.15, 0.12, 0.2, hi ? 6 : 4),
      a.clone().addScaledVector(d, 0.85),
      S.bronzeDark,
      {
        q: qFromTo(Y, d),
        aoAmt: 0,
      },
    );
  }
  return acc.finish(rng, false, true);
}

/* ------------------------------ rocketMonument ------------------------------ */

/**
 * Retro finned rocket on a launch-ring plinth, held up by a cradle of struts. v1 (M22 R13): the
 * launch gantry, the rocket on a steam trench beside a red lattice tower (research-m22.ts).
 */
function rocketMonument({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.01);
  const hi = lod === 0;
  const gantry = variant === 1;
  const seg = hi ? 12 : 6;
  put(acc, cylB(1.9, 1.8, 0.3, hi ? 14 : 6), [0, 0, 0], S.plinthDark, { aoAmt: 0.25 });
  put(acc, cylB(1.5, 1.4, 0.25, hi ? 14 : 6), [0, 0.3, 0], S.plinth, { aoAmt: 0.15 });
  if (hi)
    put(acc, new THREE.TorusGeometry(1.15, 0.12, 4, 20), [0, 0.62, 0], S.brass, {
      q: qEuler(PI / 2, 0, 0),
      aoAmt: 0,
    });
  const by = 1.4;
  const bh = 3.0;
  const br = 0.55;
  // body, bands, nose, nozzle
  put(acc, cylB(br, br, bh, seg), [0, by, 0], S.rocketBody, { aoAmt: 0.1 });
  if (hi)
    put(acc, cylB(br + 0.02, br + 0.02, 0.28, seg), [0, by + 0.55, 0], S.rocketRed, { aoAmt: 0 });
  put(acc, cylB(br + 0.02, br + 0.02, 0.2, seg), [0, by + 2.2, 0], S.rocketBand, { aoAmt: 0 });
  put(acc, new THREE.ConeGeometry(br, 1.25, seg), [0, by + bh + 0.625, 0], S.rocketRed, {
    aoAmt: 0.05,
  });
  put(acc, cylB(0.42, 0.28, 0.35, seg), [0, by - 0.3, 0], S.nozzle, { aoAmt: 0.1 });
  if (hi)
    put(acc, new THREE.ConeGeometry(0.34, 0.6, 8, 1, true), [0, by - 0.55, 0], S.brass, {
      aoAmt: 0,
      double: true,
    });
  // four fins
  const nf = hi ? 4 : 3;
  for (let k = 0; k < nf; k++) {
    const a = (k / nf) * TAU + PI / 4;
    put(
      acc,
      prism([V2(0, 0), V2(0.9, -0.35), V2(0.9, 0.1), V2(0, 1.3)], 0.07),
      V(Math.sin(a) * (br - 0.03), by, Math.cos(a) * (br - 0.03)),
      S.rocketRed,
      {
        q: qEuler(0, a - PI / 2, 0),
        aoAmt: 0.05,
      },
    );
  }
  // portholes glow at night (front +z)
  for (const dy of hi ? [1.4, 0.85] : [1.2]) {
    put(acc, new THREE.CircleGeometry(0.17, 8), [0, by + dy + 0.8, br + 0.01], S.portholeGlow, {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
    if (hi)
      put(acc, new THREE.TorusGeometry(0.19, 0.035, 3, 8), [0, by + dy + 0.8, br + 0.01], S.brass, {
        aoAmt: 0,
      });
  }
  if (gantry) launchGantry(acc, lod, by);
  // cradle: 3 angled struts from the ring to the body
  for (let k = 0; hi && !gantry && k < 3; k++) {
    const a = (k / 3) * TAU + PI / 6;
    strut(
      acc,
      V(Math.sin(a) * 1.15, 0.6, Math.cos(a) * 1.15),
      V(Math.sin(a) * 0.5, by + 0.9, Math.cos(a) * 0.5),
      0.07,
      S.bronzeDark,
      5,
    );
  }
  return acc.finish(rng, false, true);
}

/* ------------------------------- radioDish ------------------------------- */

/**
 * Parabolic radio dish on a tilted mount. v0: the big dish (~7.5 u tall, 7.5 u across), v1: a small
 * one (~3.5 u). The bowl faces up and towards +z.
 */
function radioDish({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.01);
  const hi = lod === 0;
  const k = variant === 0 ? 1 : 0.46;
  const D = 3.75 * k; // rim radius
  const th = 1.0;
  const Rs = D / Math.sin(th);
  const hp = 2.9 * k + 0.4; // pivot height
  put(acc, cylB(1.3 * k + 0.3, 1.1 * k + 0.25, 0.45, hi ? 10 : 6), [0, 0, 0], S.plinthDark, {
    aoAmt: 0.25,
  });
  put(acc, cylB(0.55 * k + 0.1, 0.42 * k + 0.1, hp - 0.45, hi ? 8 : 5), [0, 0.45, 0], S.mount, {
    aoAmt: 0.15,
  });
  const phi = 0.85;
  const q = qEuler(phi, 0, 0);
  const axis = V(0, 1, 0).applyQuaternion(q);
  const piv = V(0, hp, 0);
  // yoke arms
  for (const sx of [-1, 1])
    put(
      acc,
      baseBox(0.14 * k + 0.05, 0.9 * k + 0.2, 0.3),
      [sx * (0.5 * k + 0.12), hp - 0.2, 0],
      S.mount,
      { aoAmt: 0.1 },
    );
  const cap = new THREE.SphereGeometry(Rs, hi ? 22 : 10, hi ? 6 : 3, 0, TAU, 0, th)
    .rotateX(PI)
    .translate(0, Rs, 0);
  const pole = piv.clone().addScaledVector(axis, -0.15);
  put(acc, cap, pole, S.dish, { q, aoAmt: 0.05, double: true });
  // rim + concentric rings inside the bowl + hub
  const rimAt = (h: number): THREE.Vector3 => pole.clone().addScaledVector(axis, h);
  put(
    acc,
    new THREE.TorusGeometry(D, 0.07 * k + 0.03, 3, hi ? 28 : 12),
    rimAt(Rs * (1 - Math.cos(th))),
    S.dishRing,
    {
      q: q.clone().multiply(qEuler(PI / 2, 0, 0)),
      aoAmt: 0,
    },
  );
  if (hi)
    for (const f of [0.45, 0.72]) {
      const a = Rs * Math.sin(th * f);
      put(
        acc,
        new THREE.TorusGeometry(a, 0.04 * k + 0.02, 3, 22),
        rimAt(Rs * (1 - Math.cos(th * f)) + 0.02),
        S.dishRing,
        {
          q: q.clone().multiply(qEuler(PI / 2, 0, 0)),
          aoAmt: 0,
        },
      );
    }
  put(
    acc,
    new THREE.CylinderGeometry(0.28 * k + 0.08, 0.35 * k + 0.1, 0.45, 8),
    pole.clone().addScaledVector(axis, -0.1),
    S.mount,
    {
      q,
      aoAmt: 0.05,
    },
  );
  // feed horn on three struts at the focus
  const focus = rimAt(Rs * 0.5);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    const e = V(Math.cos(a) * D * 0.9, Rs * (1 - Math.cos(th)) - 0.05, Math.sin(a) * D * 0.9)
      .applyQuaternion(q)
      .add(pole);
    strut(acc, e, focus, 0.04 * k + 0.02, S.mount);
  }
  put(acc, new THREE.ConeGeometry(0.2 * k + 0.07, 0.5 * k + 0.2, 6), focus, S.rocketRed, {
    q: q.clone().multiply(qEuler(PI, 0, 0)),
    aoAmt: 0,
  });
  put(
    acc,
    new THREE.IcosahedronGeometry(0.1 * k + 0.05, 0),
    focus.clone().addScaledVector(axis, 0.3 * k + 0.1),
    S.rocketBand,
    {
      emissive: 0.5,
      aoAmt: 0,
    },
  );
  if (hi && variant === 0) {
    // service cabin at the foot: door on +z, lit window
    put(acc, baseBox(1.5, 1.0, 1.0), [1.9, 0, 1.2], S.podBody, { aoAmt: 0.15 });
    put(acc, baseBox(1.6, 0.12, 1.1), [1.9, 1.0, 1.2], S.podBand, { aoAmt: 0 });
    put(acc, new THREE.PlaneGeometry(0.4, 0.4), [1.9, 0.55, 1.71], S.portholeGlow, {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
  }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'dish', { center: [piv.x, piv.y, piv.z], axis: [axis.x, axis.y, axis.z] });
}

/* -------------------------------- labPod -------------------------------- */

/**
 * Rounded modular lab pod: horizontal capsule on a cradle with glowing portholes, a round hatch on
 * +z, antenna and a solar panel. v0: single pod; v1: a pod with a spherical side module + tunnel.
 */
function labPod({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const r = 0.95;
  const len = variant === 0 ? 2.4 : 3.0;
  const cy = 0.55 + r;
  const body = new THREE.CapsuleGeometry(r, len, hi ? 4 : 1, hi ? 12 : 6).rotateZ(PI / 2);
  put(acc, baseBox(len + 1.6, 0.35, 2.1), [0, 0, 0], S.plinthDark, { aoAmt: 0.25 });
  for (const sx of [-1, 1])
    put(acc, baseBox(0.35, 0.55, 1.4), [sx * len * 0.35, 0.25, 0], S.podLeg, { aoAmt: 0.15 });
  put(acc, body, [0, cy, 0], S.podBody, { aoAmt: 0.1 });
  // teal bands around the capsule
  for (const x of hi ? [-len * 0.5, 0, len * 0.5] : [0])
    put(acc, new THREE.TorusGeometry(r + 0.01, 0.07, 3, hi ? 14 : 8), [x, cy, 0], S.podBand, {
      q: qEuler(0, PI / 2, 0),
      aoAmt: 0,
    });
  // portholes on +z (glow) and a round hatch
  const px = variant === 0 ? [-0.6, 0.6] : [-0.9, 0, 0.9];
  for (const x of px)
    for (const dy of hi ? [0.12] : [0.12]) {
      put(acc, new THREE.CircleGeometry(0.24, 10), [x, cy + dy, r - 0.02], S.portholeGlow, {
        emissive: 1,
        aoAmt: 0,
        ao: () => 1,
      });
      if (hi)
        put(acc, new THREE.TorusGeometry(0.26, 0.04, 3, 10), [x, cy + dy, r - 0.02], S.podLeg, {
          aoAmt: 0,
        });
    }
  if (variant === 0) {
    put(acc, new THREE.CircleGeometry(0.36, 10), [len * 0.5 + 0.55, cy, 0.3], S.podBand, {
      q: qEuler(0, PI / 2, 0),
      aoAmt: 0,
    });
  }
  // v2 (M22 R20 weather roof): the anemometer head replaces the solar panel and the antenna
  const spin = new Spin();
  let head: { first: number; count: number } | null = null;
  if (variant === 2) head = weatherHead(acc, spin, cy + r, lod);
  else {
    // solar panel on a bracket on top, antenna
    put(acc, baseBox(1.5, 0.05, 0.9), [-len * 0.2, cy + r + 0.45, -0.1], S.solar, {
      q: qEuler(-0.4, 0, 0),
      aoAmt: 0,
    });
    strut(acc, V(-len * 0.2, cy + r - 0.1, -0.1), V(-len * 0.2, cy + r + 0.4, -0.1), 0.04, S.mount);
    const ax = len * 0.3;
    strut(acc, V(ax, cy + r - 0.1, 0), V(ax, cy + r + 1.0, 0), 0.03, S.mount);
    put(acc, new THREE.IcosahedronGeometry(0.08, 0), [ax, cy + r + 1.05, 0], S.rocketRed, {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
    if (hi)
      put(acc, new THREE.CylinderGeometry(0.3, 0.05, 0.1, 8), [ax - 0.0, cy + r + 0.7, 0], S.dish, {
        aoAmt: 0,
        q: qEuler(0.9, 0, 0),
      });
  }
  if (variant === 1) {
    // side module: sphere on the -x end with a tunnel
    const sx = -(len / 2 + r + 0.9);
    put(
      acc,
      new THREE.CylinderGeometry(0.34, 0.34, 1.0, hi ? 8 : 5),
      [-(len / 2 + r) + 0.2, cy, 0],
      S.podBand,
      { q: qEuler(0, 0, PI / 2), aoAmt: 0.1 },
    );
    put(acc, new THREE.SphereGeometry(0.85, hi ? 12 : 6, hi ? 8 : 3), [sx, cy, 0], S.podBody, {
      aoAmt: 0.1,
    });
    put(acc, cylB(0.5, 0.6, 0.35, 6), [sx, 0, 0], S.podLeg, { aoAmt: 0.2 });
    put(acc, new THREE.CircleGeometry(0.2, 8), [sx, cy + 0.2, 0.83], S.portholeGlow, {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
    put(
      acc,
      new THREE.SphereGeometry(0.3, 6, 3, 0, TAU, 0, PI / 2),
      [sx, cy + 0.82, 0],
      S.podBand,
      { aoAmt: 0 },
    );
  }
  const g = acc.finish(rng, false, true);
  if (head) {
    finishSpin(g, acc, spin);
    tagYawHead(g, head);
  }
  return addHook(g, 'door', { center: [0, cy, r], normal: [0, 0, 1] });
}

export const SCIENCE_GEO: readonly PropGeoDef[] = [
  {
    id: 'atomSculpture',
    variants: 1,
    build: atomSculpture,
    footprint: 1.3,
    height: 4.1,
    windy: false,
  },
  { id: 'dnaHelix', variants: 1, build: dnaHelix, footprint: 1.1, height: 4.8, windy: false },
  {
    id: 'armillarySphere',
    variants: 1,
    build: armillarySphere,
    footprint: 1.6,
    height: 4.3,
    windy: false,
  },
  {
    id: 'scholarStatue',
    variants: 2,
    build: scholarStatue,
    footprint: 1.1,
    height: 3.4,
    windy: false,
  },
  {
    id: 'rocketMonument',
    variants: 2,
    build: rocketMonument,
    footprint: 1.9,
    height: 5.6,
    heights: [5.6, 5.7],
    windy: false,
  },
  {
    id: 'radioDish',
    variants: 2,
    build: radioDish,
    footprint: 3.2,
    height: 7,
    heights: [7.4, 3.6],
    windy: false,
  },
  {
    id: 'labPod',
    variants: 3,
    build: labPod,
    footprint: 2.8,
    height: 3.6,
    heights: [3.6, 3.6, 4.1],
    windy: false,
  },
];
