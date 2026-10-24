/**
 * Research island culture kit "Yıldız Akademisi / Star Academy" (M19 TASK-416, ISLAND_CULTURES
 * §2.7). Scholarly and warm-lamplit against the campus' cool slate: oak, brass, chalk and teal
 * enamel. Geometry only (placement is a later wave); defs: content/props-themes/research.ts
 * (RESEARCH_CULTURE_PROP_DEFS), colours: RESEARCH_CULTURE_KIT, ledger: content/cultures/research.ts.
 * Local frame: ground at y = 0, the front faces +z, 1 u = 1 m.
 *
 *   tripodTelescope      T2  oak tripod, fork mount, hanging lantern; v0 brass refractor, v1 teal reflector
 *   chalkboard           T2  outdoor easel board; v0 comet + "?", v1 equations, v2 star chart (glows)
 *   orrery               T2  upright brass orrery on a pillar; planet wheel SPINS (aSpin hub); v1 star disc
 *   lectureSteps         T2  kit prefab: 3 tiers + oak seats + lectern + lamp; v0 half-round, v1 straight
 *   teaTrolley           T2  two-tier trolley, teapot / cups / cake stand, oil lamp; v1 urn + books
 *   weatherBalloonCart   T2  hand cart with gas bottles, reel and a tethered balloon; v1 = launched
 *   owlBox               T2  nest box on a pole with a lantern; v1 has glowing eyes in the hole
 *   pigeonPerch          T3  T-perch with three pigeons (v0) / bird-bath pillar (v1)
 *   bookCart             T3  library cart (v0), cart with a pile (v1), loose book steps (v2)
 *   miniVolcanoTerrarium T3  glass cloche on a stand with a mini Emberpeak (v0) / Wardian case (v1)
 *
 * Research glass is CLEAR, pale aqua (#8EEBE0) and FLAT: panes are thin aqua frames with a glint
 * strip, so the contents stay visible through them (no tinted opaque panels, no facets: that is
 * Design's language). Every part is a primitive with vertex colour; none of the defs reaches
 * isLargeStructure (< 2.85 u high, smaller plan extent < 2.85 u), so no def is promoted to tier 0.
 * Emissive 1 parts (lamp flames, owl eyes, star dots, lava) glow at night with the lamps ramp.
 */
import * as THREE from 'three';
import { RESEARCH_CULTURE_KIT as K, RESEARCH_M22 } from '../../content/props-themes/research.ts';
import type { Rng } from '../../core/rng.ts';
import { qEuler, qFromTo, type Acc } from '../kit.ts';
import { Spin, finishSpin } from '../office-kit.ts';
import { TAU, V, baseBox, cylB, lathe, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { cultureAcc } from './culture-devops.ts';
import { addGlyph } from './glyphs.ts';
import { specimenPlate } from './research-m22.ts';

const Y = V(0, 1, 0);
const PI = Math.PI;
const lit = { emissive: 1, ao: () => 1, aoAmt: 0 } as const;
const finish = (acc: Acc, rng: Rng): THREE.BufferGeometry => acc.finish(rng, false, true);

type P3 = [number, number, number];
const v3 = (p: P3): THREE.Vector3 => V(p[0], p[1], p[2]);
type PutO = NonNullable<Parameters<typeof put>[4]>;

/** Box with its base centre at (x, y, z). */
function bx(
  acc: Acc,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: string,
  o: PutO = {},
): void {
  put(acc, baseBox(w, h, d), [x, y, z], color, { aoAmt: 0.12, ...o });
}

/** Square beam from a to b (thickness `th`), overlapping its ends by `ext`. */
function bar(
  acc: Acc,
  a: P3 | THREE.Vector3,
  b: P3 | THREE.Vector3,
  th: number,
  color: string,
  o: PutO = {},
): void {
  const pa = Array.isArray(a) ? v3(a as P3) : (a as THREE.Vector3).clone();
  const pb = Array.isArray(b) ? v3(b as P3) : (b as THREE.Vector3).clone();
  const d = pb.clone().sub(pa);
  put(acc, baseBox(th, d.length(), th), pa, color, { q: qFromTo(Y, d), aoAmt: 0, ...o });
}

/** Round rod / frustum from a to b (radius r0 at a, r1 at b). */
function rod(
  acc: Acc,
  a: P3 | THREE.Vector3,
  b: P3 | THREE.Vector3,
  r0: number,
  r1: number,
  seg: number,
  color: string,
  o: PutO = {},
): void {
  const pa = Array.isArray(a) ? v3(a as P3) : (a as THREE.Vector3).clone();
  const pb = Array.isArray(b) ? v3(b as P3) : (b as THREE.Vector3).clone();
  const d = pb.clone().sub(pa);
  put(acc, cylB(r0, r1, d.length(), seg), pa, color, { q: qFromTo(Y, d), aoAmt: 0.06, ...o });
}

/** Ellipsoid centred on `at`. */
function ell(
  acc: Acc,
  at: P3 | THREE.Vector3,
  r: P3,
  color: string,
  seg: [number, number],
  o: PutO = {},
): void {
  put(acc, new THREE.SphereGeometry(1, seg[0], seg[1]), at, color, {
    s: [r[0], r[1], r[2]],
    aoAmt: 0.08,
    ...o,
  });
}

const ball = (
  acc: Acc,
  at: P3 | THREE.Vector3,
  r: number,
  color: string,
  seg = 8,
  o: PutO = {},
): void => ell(acc, at, [r, r, r], color, [seg, Math.max(3, seg >> 1)], o);

/** Wheel with its axis along z (cart wheels): rim, hub and (hi) four spokes. */
function wheel(
  acc: Acc,
  at: P3,
  r: number,
  w: number,
  rim: string,
  hub: string,
  hi: boolean,
  axis: 'z' | 'x' = 'z',
): void {
  const q = axis === 'z' ? qEuler(PI / 2, 0, 0) : qEuler(0, 0, PI / 2);
  if (!hi) {
    put(acc, new THREE.CylinderGeometry(r, r, w, 7), at, rim, { q, aoAmt: 0 });
    return;
  }
  // open spoked wheel: torus rim, brass hub, three crossing spokes
  const qt = axis === 'z' ? qEuler(0, 0, 0) : qEuler(0, PI / 2, 0);
  const tube = Math.max(0.02, w * 0.55);
  put(acc, new THREE.TorusGeometry(r - tube, tube, 4, 16), at, rim, { q: qt, aoAmt: 0 });
  put(acc, new THREE.CylinderGeometry(r * 0.24, r * 0.24, w * 1.4, 6), at, hub, { q, aoAmt: 0 });
  for (let k = 0; k < 3; k++) {
    const a = k * (PI / 3) + 0.4;
    const d = axis === 'z' ? V(Math.cos(a), Math.sin(a), 0) : V(0, Math.sin(a), Math.cos(a));
    bar(
      acc,
      v3(at).addScaledVector(d, -(r - tube)),
      v3(at).addScaledVector(d, r - tube),
      Math.max(0.02, w * 0.5),
      rim,
    );
  }
}

/** Small brass lantern (cage, warm flame) centred at `at`; `s` scales it. */
function lantern(acc: Acc, at: THREE.Vector3, s: number, hi: boolean): void {
  put(acc, new THREE.OctahedronGeometry(0.07 * s, 0), at, K.lamp, lit);
  if (!hi) return;
  put(acc, cylB(0.075 * s, 0.075 * s, 0.025 * s, 6), at.clone().add(V(0, -0.08 * s, 0)), K.brass, {
    aoAmt: 0,
  });
  put(
    acc,
    new THREE.ConeGeometry(0.09 * s, 0.06 * s, 6),
    at.clone().add(V(0, 0.09 * s, 0)),
    K.brass,
    {
      aoAmt: 0,
    },
  );
  for (const [sx, sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const)
    bar(
      acc,
      at.clone().add(V(sx * 0.065 * s, -0.07 * s, sz * 0.065 * s)),
      at.clone().add(V(sx * 0.065 * s, 0.07 * s, sz * 0.065 * s)),
      0.014 * s,
      K.brass,
    );
  put(
    acc,
    new THREE.TorusGeometry(0.035 * s, 0.01 * s, 3, 6),
    at.clone().add(V(0, 0.14 * s, 0)),
    K.brass,
    {
      aoAmt: 0,
    },
  );
}

/** Flat pane of clear pale aqua glass: thin frame + a glint strip, open in between (see-through). */
function pane(
  acc: Acc,
  c: THREE.Vector3,
  yaw: number,
  w: number,
  h: number,
  hi: boolean,
  frame = 0.03,
): void {
  const q = qEuler(0, yaw, 0);
  const at = (x: number, y: number): THREE.Vector3 => c.clone().add(V(x, y, 0).applyQuaternion(q));
  const t = frame;
  bar(acc, at(-w / 2, -h / 2), at(-w / 2, h / 2), t, K.glassFrame);
  bar(acc, at(w / 2, -h / 2), at(w / 2, h / 2), t, K.glassFrame);
  bar(acc, at(-w / 2, -h / 2), at(w / 2, -h / 2), t, K.glassFrame);
  bar(acc, at(-w / 2, h / 2), at(w / 2, h / 2), t, K.glassFrame);
  if (hi) {
    // aqua sill band + the cartoon glint (two short parallel strokes near the top corner)
    bar(acc, at(-w / 2 + t, -h / 2 + 0.05), at(w / 2 - t, -h / 2 + 0.05), t * 1.8, K.glass);
    bar(acc, at(-w * 0.3, h * 0.2), at(-w * 0.12, h * 0.4), t * 0.75, K.glass);
    bar(acc, at(-w * 0.14, h * 0.12), at(w * 0.02, h * 0.3), t * 0.55, K.glass);
  }
}

/** Ring sector (inner radius r0, outer r1, azimuth a0..a1 as in `az`) from y to y + h. */
function arcSlab(
  acc: Acc,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
  y: number,
  h: number,
  color: string,
  n: number,
  o: PutO = {},
): void {
  const sh = new THREE.Shape();
  // shape (X, Y) maps to world (X, -Y) -> z after rotateX(-90 deg): use Y = -z
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const p = [Math.sin(a) * r1, -Math.cos(a) * r1] as const;
    if (i === 0) sh.moveTo(p[0], p[1]);
    else sh.lineTo(p[0], p[1]);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    sh.lineTo(Math.sin(a) * r0, -Math.cos(a) * r0);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, steps: 1 });
  g.rotateX(-PI / 2);
  put(acc, g, [0, y, 0], color, { aoAmt: 0.15, ...o });
}

/** Polyline in a plane: board-space (u, v) -> world via `at`. */
type At = (u: number, v: number) => THREE.Vector3;

function chalkPoly(
  acc: Acc,
  at: At,
  pts: ReadonlyArray<readonly [number, number]>,
  color: string,
  th = 0.045,
  em = 0,
): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = at(pts[i][0], pts[i][1]);
    const b = at(pts[i + 1][0], pts[i + 1][1]);
    const d = b.clone().sub(a);
    const ext = d
      .clone()
      .normalize()
      .multiplyScalar(th * 0.45);
    bar(acc, a.clone().sub(ext), b.clone().add(ext), th, color, {
      ao: () => 1,
      emissive: em,
    });
  }
}

const ngon = (cx: number, cy: number, rx: number, ry: number, n: number, a0 = 0, a1 = TAU) =>
  Array.from({ length: n + 1 }, (_, i): readonly [number, number] => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });

/* ------------------------------- tripodTelescope ------------------------------- */

/**
 * Lawn telescope on an oak tripod: three splayed legs, a fork mount and a lantern hanging from a
 * leg. v0 brass-banded refractor (cream tube, dew shield, finder scope, counterweight) aiming at
 * the sky; v1 fat teal Newtonian reflector with a side eyepiece. ~1.5 u high.
 */
function tripodTelescope({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const refr = variant === 0;
  const yaw = refr ? 0.35 : -0.55;
  const e = refr ? 0.95 : 0.7;
  const R = 0.62;
  const topY = 0.85;
  // legs, spreader, feet
  const feet: THREE.Vector3[] = [];
  for (let k = 0; k < 3; k++) {
    const a = yaw + 0.55 + (k * TAU) / 3;
    const foot = V(Math.sin(a) * R, 0, Math.cos(a) * R);
    feet.push(foot);
    rod(
      acc,
      V(Math.sin(a) * 0.05, topY, Math.cos(a) * 0.05),
      foot,
      0.034,
      0.026,
      hi ? 6 : 4,
      K.wood,
      {
        aoAmt: 0.1,
      },
    );
    if (hi) {
      put(acc, new THREE.ConeGeometry(0.036, 0.07, 5), foot.clone().add(V(0, 0.035, 0)), K.brass, {
        q: qEuler(PI, 0, 0),
        aoAmt: 0,
      });
      const col = foot.clone().lerp(V(0, topY, 0), 0.82);
      put(acc, cylB(0.04, 0.04, 0.05, 6), col, K.brass, { aoAmt: 0 });
    }
  }
  if (hi)
    for (let k = 0; k < 3; k++) {
      const a = feet[k].clone().lerp(V(0, topY, 0), 0.52);
      const b = feet[(k + 1) % 3].clone().lerp(V(0, topY, 0), 0.52);
      bar(acc, a, b, 0.022, K.woodDark);
    }
  // head plate, column, fork
  put(acc, cylB(0.14, 0.11, 0.07, hi ? 8 : 5), [0, topY - 0.03, 0], K.steelDark, { aoAmt: 0.1 });
  put(acc, cylB(0.1, 0.1, 0.04, hi ? 8 : 5), [0, topY + 0.04, 0], K.brass, { aoAmt: 0 });
  put(acc, cylB(0.045, 0.04, 0.22, hi ? 6 : 4), [0, topY + 0.08, 0], K.brass, { aoAmt: 0.1 });
  const P = V(0, topY + 0.34, 0);
  const side = V(Math.cos(yaw), 0, -Math.sin(yaw));
  const d = V(Math.sin(yaw) * Math.cos(e), Math.sin(e), Math.cos(yaw) * Math.cos(e));
  const up = V(-Math.sin(yaw) * Math.sin(e), Math.cos(e), -Math.cos(yaw) * Math.sin(e));
  for (const s of [-1, 1])
    bar(
      acc,
      V(0, topY + 0.22, 0).addScaledVector(side, s * 0.07),
      P.clone().addScaledVector(side, s * (refr ? 0.115 : 0.17)),
      0.04,
      K.brass,
    );
  const body = refr ? K.white : K.teal;
  const rb = refr ? 0.062 : 0.115;
  const L = refr ? 0.95 : 0.8;
  const back = 0.38;
  const a0 = P.clone().addScaledVector(d, -back);
  const a1 = P.clone().addScaledVector(d, L - back);
  rod(acc, a0, a1, rb * 0.9, rb, hi ? 10 : 6, body, { aoAmt: 0.05 });
  if (refr) {
    // dew shield + lens, brass bands, eyepiece, finder, counterweight
    rod(
      acc,
      a1.clone().addScaledVector(d, -0.18),
      a1.clone().addScaledVector(d, 0.04),
      0.085,
      0.092,
      hi ? 10 : 6,
      K.cream,
      {
        aoAmt: 0,
      },
    );
    put(
      acc,
      new THREE.CircleGeometry(0.075, hi ? 8 : 5),
      a1.clone().addScaledVector(d, 0.045),
      K.lens,
      {
        q: qFromTo(V(0, 0, 1), d),
        aoAmt: 0,
      },
    );
    if (hi) {
      for (const t of [0.12, 0.45, 0.7])
        put(
          acc,
          new THREE.CylinderGeometry(rb + 0.012, rb + 0.012, 0.05, 10),
          P.clone().addScaledVector(d, t - back),
          K.brass,
          {
            q: qFromTo(Y, d),
            aoAmt: 0,
          },
        );
      rod(acc, a0.clone().addScaledVector(d, -0.14), a0, 0.028, 0.034, 6, K.brass, { aoAmt: 0 });
      ball(acc, a0.clone().addScaledVector(d, -0.16), 0.032, K.lens, 5);
      // finder scope on two rings
      const f0 = P.clone().addScaledVector(d, 0.05).addScaledVector(up, 0.11);
      rod(acc, f0, f0.clone().addScaledVector(d, 0.32), 0.022, 0.026, 6, K.brass);
      for (const t of [0.07, 0.27])
        bar(
          acc,
          P.clone()
            .addScaledVector(d, 0.05 + t)
            .addScaledVector(up, 0.05),
          f0.clone().addScaledVector(d, t),
          0.014,
          K.brass,
        );
      // counterweight on a short rod
      const c0 = P.clone().addScaledVector(d, -0.3);
      rod(
        acc,
        c0,
        c0.clone().addScaledVector(d, -0.18).addScaledVector(up, -0.1),
        0.014,
        0.014,
        4,
        K.steel,
      );
      ball(acc, c0.clone().addScaledVector(d, -0.2).addScaledVector(up, -0.12), 0.055, K.brass, 7);
    }
  } else {
    // open mouth ring, side eyepiece + red-dot finder
    put(
      acc,
      new THREE.CylinderGeometry(rb + 0.01, rb + 0.01, 0.045, hi ? 10 : 6, 1, true),
      a1,
      K.white,
      {
        q: qFromTo(Y, d),
        aoAmt: 0,
        double: true,
      },
    );
    put(
      acc,
      new THREE.CircleGeometry(rb * 0.95, hi ? 10 : 6),
      a1.clone().addScaledVector(d, -0.04),
      K.lens,
      {
        q: qFromTo(V(0, 0, 1), d),
        aoAmt: 0,
      },
    );
    if (hi) {
      put(
        acc,
        new THREE.TorusGeometry(rb + 0.012, 0.014, 3, 12),
        P.clone().addScaledVector(d, 0.1 + (L - back) * 0.5),
        K.white,
        {
          q: qFromTo(V(0, 0, 1), d),
          aoAmt: 0,
        },
      );
      const ep = P.clone()
        .addScaledVector(d, L - back - 0.12)
        .addScaledVector(up, rb);
      rod(acc, ep, ep.clone().addScaledVector(up, 0.16), 0.03, 0.026, 6, K.brass, { aoAmt: 0 });
      ball(acc, ep.clone().addScaledVector(up, 0.17), 0.03, K.lens, 5);
      const fn = P.clone()
        .addScaledVector(d, L - back - 0.3)
        .addScaledVector(up, rb + 0.03);
      put(acc, baseBox(0.05, 0.07, 0.1), fn, K.rocketRed, { q: qFromTo(Y, up), aoAmt: 0 });
    }
  }
  // trunnions
  if (hi)
    for (const s of [-1, 1])
      put(
        acc,
        new THREE.CylinderGeometry(0.035, 0.035, 0.05, 6),
        P.clone().addScaledVector(side, s * (refr ? 0.12 : 0.175)),
        K.brass,
        {
          q: qFromTo(Y, side),
          aoAmt: 0,
        },
      );
  // lantern on a leg
  const lp = feet[0].clone().lerp(V(0, topY, 0), 0.5);
  lantern(
    acc,
    lp.add(V(0, -0.08, 0).addScaledVector(feet[0].clone().setY(0).normalize(), 0.09)),
    1.0,
    hi,
  );
  return finish(acc, rng);
}

/* ---------------------------------- chalkboard ---------------------------------- */

/**
 * Outdoor easel board on oak legs with a tray (chalks, eraser). v0 a comet with a long tail, an
 * orbit and a "?"; v1 chalk equations (sigma, fraction, a sine, an orbit diagram); v2 a star chart:
 * the Plough in glowing gold stars, a glowing Pole Star, a crescent (emissive 1: it lights at night).
 */
function chalkboard({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  // v3: the R9 arboretum specimen plate (M22 TASK-483)
  if (variant === RESEARCH_M22.plate.variant) {
    specimenPlate(acc, hi);
    return finish(acc, rng);
  }
  const cy = 1.38;
  // easel: two front legs, rear prop leg, cross rails
  for (const s of [-1, 1]) {
    bar(acc, [s * 0.66, 0, 0.1], [s * 0.6, 2.0, 0.02], 0.075, K.woodDark, { aoAmt: 0.18 });
  }
  bar(acc, [0, 1.92, -0.04], [0, 0, -0.78], 0.065, K.woodDark);
  bx(acc, 1.3, 0.07, 0.07, 0, 1.9, 0.02, K.woodDark, { aoAmt: 0 });
  if (hi) {
    bar(acc, [-0.64, 0.45, 0.08], [0, 0.55, -0.34], 0.04, K.woodDark);
    bar(acc, [0.64, 0.45, 0.08], [0, 0.55, -0.34], 0.04, K.woodDark);
    for (const s of [-1, 1])
      put(acc, new THREE.ConeGeometry(0.05, 0.08, 5), [s * 0.66, 0.04, 0.1], K.brass, {
        q: qEuler(PI, 0, 0),
        aoAmt: 0,
      });
  }
  // board: oak frame + slate
  const fw = 1.5;
  const fh = 1.05;
  const t = 0.09;
  bx(acc, fw, t, 0.08, 0, cy - fh / 2, 0.07, K.boardFrame, { aoAmt: 0 });
  bx(acc, fw, t, 0.08, 0, cy + fh / 2 - t, 0.07, K.boardFrame, { aoAmt: 0 });
  for (const s of [-1, 1])
    bx(acc, t, fh, 0.08, s * (fw / 2 - t / 2), cy - fh / 2, 0.07, K.boardFrame, { aoAmt: 0 });
  bx(acc, fw - 2 * t + 0.02, fh - 2 * t + 0.02, 0.04, 0, cy - fh / 2 + t - 0.01, 0.07, K.board, {
    aoAmt: 0,
  });
  // chalk tray, chalks, eraser
  bx(acc, fw, 0.04, 0.16, 0, cy - fh / 2 - 0.04, 0.12, K.boardFrame, { aoAmt: 0 });
  bx(acc, fw, 0.07, 0.025, 0, cy - fh / 2 - 0.04, 0.2, K.boardFrame, { aoAmt: 0 });
  if (hi) {
    for (const [x, c] of [
      [-0.5, K.chalk],
      [-0.4, K.chalkTeal],
      [-0.3, K.chalkGold],
    ] as const)
      put(acc, cylB(0.016, 0.016, 0.09, 5), [x, cy - fh / 2, 0.14], c, {
        q: qEuler(0, 0.5, PI / 2),
        aoAmt: 0,
      });
    bx(acc, 0.13, 0.04, 0.06, 0.45, cy - fh / 2, 0.12, K.woodDark, { aoAmt: 0 });
    bx(acc, 0.13, 0.015, 0.06, 0.45, cy - fh / 2 + 0.04, 0.12, K.roofSlate, { aoAmt: 0 });
  }
  if (!hi) return finish(acc, rng);
  // chalk art on the slate (front face z = 0.092)
  const at: At = (u, v) => V(u, cy + v, 0.1);
  const ch = K.chalk;
  const star = (u: number, v: number, s: number, c: string = ch, em = 0): void => {
    chalkPoly(
      acc,
      at,
      [
        [u - s, v],
        [u + s, v],
      ],
      c,
      0.032,
      em,
    );
    chalkPoly(
      acc,
      at,
      [
        [u, v - s],
        [u, v + s],
      ],
      c,
      0.032,
      em,
    );
  };
  if (variant === 0) {
    // comet: glowing head, three tail streaks, orbit, "?" and stars
    ball(acc, at(0.32, 0.14).add(V(0, 0, 0.02)), 0.075, K.chalkGold, 7, {
      emissive: 0.8,
      ao: () => 1,
    });
    chalkPoly(
      acc,
      at,
      [
        [0.27, 0.12],
        [-0.06, -0.06],
      ],
      ch,
      0.05,
    );
    chalkPoly(
      acc,
      at,
      [
        [0.3, 0.07],
        [0.0, -0.2],
      ],
      K.chalkTeal,
      0.05,
    );
    chalkPoly(
      acc,
      at,
      [
        [0.24, 0.17],
        [-0.12, 0.06],
      ],
      ch,
      0.04,
    );
    chalkPoly(acc, at, ngon(-0.02, -0.18, 0.5, 0.1, 14, 0.15, PI - 0.1), K.chalkTeal, 0.035);
    chalkPoly(
      acc,
      at,
      [
        [-0.52, 0.2],
        [-0.5, 0.28],
        [-0.43, 0.31],
        [-0.36, 0.28],
        [-0.34, 0.21],
        [-0.4, 0.14],
        [-0.43, 0.07],
      ],
      K.chalkPink,
      0.055,
    );
    ball(acc, at(-0.43, -0.03).add(V(0, 0, 0.01)), 0.032, K.chalkPink, 5, { ao: () => 1 });
    star(0.5, 0.3, 0.05);
    star(-0.15, 0.3, 0.04, K.chalkGold);
    star(0.1, 0.34, 0.035);
    chalkPoly(
      acc,
      at,
      [
        [-0.55, -0.37],
        [-0.2, -0.37],
      ],
      ch,
      0.035,
    );
  } else if (variant === 1) {
    // equations: sigma, fraction, equals, a sine wave and an orbit diagram
    chalkPoly(
      acc,
      at,
      [
        [-0.5, 0.32],
        [-0.34, 0.32],
        [-0.46, 0.19],
        [-0.34, 0.06],
        [-0.5, 0.06],
      ],
      ch,
      0.055,
    );
    chalkPoly(
      acc,
      at,
      [
        [-0.26, 0.19],
        [0.04, 0.19],
      ],
      ch,
      0.04,
    );
    chalkPoly(
      acc,
      at,
      [
        [-0.25, 0.29],
        [-0.18, 0.34],
        [-0.1, 0.27],
        [-0.02, 0.32],
      ],
      K.chalkGold,
      0.04,
    );
    chalkPoly(
      acc,
      at,
      [
        [-0.25, 0.09],
        [-0.18, 0.14],
        [-0.09, 0.07],
      ],
      K.chalkGold,
      0.04,
    );
    chalkPoly(
      acc,
      at,
      [
        [0.13, 0.22],
        [0.3, 0.22],
      ],
      ch,
      0.04,
    );
    chalkPoly(
      acc,
      at,
      [
        [0.13, 0.15],
        [0.3, 0.15],
      ],
      ch,
      0.04,
    );
    chalkPoly(
      acc,
      at,
      [
        [0.4, 0.3],
        [0.5, 0.2],
        [0.42, 0.1],
        [0.52, 0.07],
      ],
      K.chalkPink,
      0.045,
    );
    const wave = Array.from({ length: 19 }, (_, i): readonly [number, number] => [
      -0.58 + i * 0.066,
      -0.1 + Math.sin(i * 0.7) * 0.1,
    ]);
    chalkPoly(acc, at, wave, K.chalkTeal, 0.04);
    chalkPoly(acc, at, ngon(0.4, -0.31, 0.11, 0.11, 10), ch, 0.035);
    ball(acc, at(0.4, -0.31).add(V(0, 0, 0.01)), 0.032, K.chalkGold, 5, { ao: () => 1 });
    chalkPoly(
      acc,
      at,
      [
        [-0.55, -0.3],
        [-0.45, -0.3],
        [-0.5, -0.4],
        [-0.4, -0.4],
      ],
      ch,
      0.04,
    );
    chalkPoly(
      acc,
      at,
      [
        [-0.3, -0.3],
        [-0.1, -0.3],
      ],
      ch,
      0.035,
    );
  } else {
    // star chart: the Plough, Pole Star, crescent
    const pts: Array<[number, number]> = [
      [-0.5, 0.22],
      [-0.33, 0.28],
      [-0.17, 0.2],
      [-0.05, 0.12],
      [0.0, -0.02],
      [0.18, -0.04],
      [0.2, 0.14],
    ];
    chalkPoly(acc, at, [...pts, pts[3]], ch, 0.03, 0.55);
    for (const [u, v] of pts)
      put(
        acc,
        new THREE.OctahedronGeometry(0.05, 0),
        at(u, v).add(V(0, 0, 0.03)),
        K.chalkGold,
        lit,
      );
    put(
      acc,
      new THREE.OctahedronGeometry(0.075, 0),
      at(0.4, 0.3).add(V(0, 0, 0.03)),
      K.chalkTeal,
      lit,
    );
    star(0.4, 0.3, 0.12, K.chalkTeal, 0.8);
    chalkPoly(
      acc,
      at,
      [
        [0.2, 0.14],
        [0.3, 0.22],
        [0.4, 0.3],
      ],
      ch,
      0.025,
      0.4,
    );
    chalkPoly(acc, at, ngon(-0.4, -0.24, 0.13, 0.13, 10, 0.9, TAU - 0.9), ch, 0.045, 0.45);
    chalkPoly(acc, at, ngon(-0.34, -0.24, 0.1, 0.1, 8, 1.1, TAU - 1.1), ch, 0.03, 0.2);
    for (const [u, v] of [
      [0.1, -0.3],
      [0.3, -0.22],
      [0.5, -0.1],
      [-0.1, 0.36],
      [0.55, 0.08],
    ] as const)
      put(acc, new THREE.OctahedronGeometry(0.028, 0), at(u, v).add(V(0, 0, 0.02)), K.chalk, lit);
  }
  return finish(acc, rng);
}

/* ------------------------------------ orrery ------------------------------------ */

/**
 * Upright brass orrery facing +z: pillar on a stone plinth, a fixed zodiac ring with gold ticks,
 * orbit tracks and a glowing sun; the PLANET WHEEL (arms, planets, moons) spins about the hub
 * (aSpin, z axis). v1 backs the wheel with a pale aqua star disc studded with glowing stars.
 */
function orrery({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const spin = new Spin();
  const hub = V(0, 1.38, 0);
  const RZ = 0.9;
  // plinth, base, pillar, ring cradle
  bx(acc, 1.1, 0.16, 0.6, 0, 0, 0, K.stone, { aoAmt: 0.25 });
  bx(acc, 0.9, 0.1, 0.46, 0, 0.16, 0, K.stoneDark, { aoAmt: 0.1 });
  put(acc, cylB(0.2, 0.15, 0.14, hi ? 10 : 6), [0, 0.26, 0], K.bronzeDark, { aoAmt: 0.1 });
  put(acc, cylB(0.075, 0.06, 0.5, hi ? 8 : 5), [0, 0.4, 0], K.brass, { aoAmt: 0.1 });
  // fixed zodiac ring (+ ticks) held on the pillar, axle through the hub
  put(acc, new THREE.TorusGeometry(RZ, 0.032, hi ? 4 : 3, hi ? 28 : 14), hub, K.brass, {
    aoAmt: 0,
  });
  put(acc, new THREE.TorusGeometry(RZ - 0.1, 0.018, 3, hi ? 28 : 12), hub, K.bronze, { aoAmt: 0 });
  put(acc, cylB(0.03, 0.03, 0.34, 5), [0, 1.38, -0.17], K.brass, {
    q: qEuler(PI / 2, 0, 0),
    aoAmt: 0,
  });
  bar(acc, [0, 0.8, 0], [0, 0.4, 0], 0.07, K.brass);
  if (hi) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      put(
        acc,
        baseBox(0.045, 0.1, 0.05),
        hub.clone().add(V(Math.sin(a) * (RZ - 0.04), Math.cos(a) * (RZ - 0.04), 0)),
        k % 3 === 0 ? K.chalkGold : K.brass,
        {
          q: qEuler(0, 0, -a),
          aoAmt: 0,
        },
      );
    }
    // braces from the pillar to the ring
    for (const s of [-1, 1]) bar(acc, [0, 0.55, 0], [s * 0.34, hub.y - 0.74, 0], 0.035, K.brass);
    // name plaque
    bx(acc, 0.38, 0.08, 0.025, 0, 0.17, 0.235, K.brass, { aoAmt: 0 });
  }
  // orbit tracks (fixed)
  const tracks = [0.3, 0.52, 0.74];
  if (hi)
    for (const r of tracks)
      put(acc, new THREE.TorusGeometry(r, 0.01, 3, 24), hub.clone().add(V(0, 0, -0.01)), K.bronze, {
        aoAmt: 0,
      });
  // sun (glows)
  ball(acc, hub.clone().add(V(0, 0, 0.0)), 0.16, K.chalkGold, hi ? 8 : 5, {
    emissive: 0.85,
    ao: () => 1,
  });
  if (variant === 1) {
    // pale aqua star disc behind the wheel, studded with glowing stars
    put(
      acc,
      new THREE.CylinderGeometry(RZ - 0.06, RZ - 0.06, 0.03, hi ? 24 : 10),
      hub.clone().add(V(0, 0, -0.1)),
      K.glass,
      {
        q: qEuler(PI / 2, 0, 0),
        aoAmt: 0,
        noJitter: true,
      },
    );
    if (hi)
      for (let k = 0; k < 9; k++) {
        const a = k * 2.4;
        const r = 0.2 + ((k * 0.37) % 1) * 0.6;
        put(
          acc,
          new THREE.OctahedronGeometry(0.03, 0),
          hub.clone().add(V(Math.cos(a) * r, Math.sin(a) * r, -0.075)),
          K.chalkGold,
          lit,
        );
      }
  }
  // the spinning planet wheel
  const tag = spin.tag(hub);
  const w = { windAbs: tag, aoAmt: 0, ao: () => 0.97 } as const;
  const arms = variant === 0 ? [0.5, 2.6, 4.4, 5.6] : [0.9, 2.2, 3.7, 5.2];
  const radii = [tracks[0], tracks[1], tracks[2], tracks[1]];
  arms.forEach((a, i) => {
    const r = radii[i];
    const p = hub.clone().add(V(Math.cos(a) * r, Math.sin(a) * r, 0.03));
    const tip = hub.clone().add(V(Math.cos(a) * (r - 0.03), Math.sin(a) * (r - 0.03), 0.03));
    bar(acc, hub.clone().add(V(0, 0, 0.03)), tip, 0.03, K.brass, w);
    const big = variant === 1 && i === 2;
    ball(
      acc,
      p,
      big ? 0.115 : 0.07 + (i % 2) * 0.025,
      K.planets[(i + variant * 2) % K.planets.length],
      hi ? 8 : 5,
      w,
    );
    if (big && hi)
      put(acc, new THREE.TorusGeometry(0.19, 0.016, 3, 14), p, K.chalkGold, {
        q: qEuler(1.1, 0.3, 0),
        ...w,
      });
    if (hi && i % 2 === 0)
      ball(
        acc,
        p.clone().add(V(Math.cos(a + 2) * 0.14, Math.sin(a + 2) * 0.14, 0.01)),
        0.03,
        K.chalk,
        5,
        w,
      );
  });
  put(
    acc,
    new THREE.CylinderGeometry(0.05, 0.05, 0.12, 6),
    hub.clone().add(V(0, 0, 0.1)),
    K.brass,
    { q: qEuler(PI / 2, 0, 0), ...w },
  );
  return finishSpin(finish(acc, rng), acc, spin);
}

/* ----------------------------------- lectureSteps ----------------------------------- */

/**
 * Lawn amphitheatre prefab: three stone tiers with oak seat strips, a lectern with an open book and
 * a reading lamp, and a lantern post. v0 is a half-round (audience on the -z side looking at the
 * lectern in front, +z); v1 is straight tiers with cheek walls. ~0.9 u high plus the lamp post.
 */
function lectureSteps({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const n = hi ? 14 : 7;
  const tiers = 3;
  const th = 0.3;
  if (variant === 0) {
    const r0 = 0.8;
    const dr = 0.42;
    const a0 = PI * 0.56;
    const a1 = PI * 1.44;
    for (let i = 0; i < tiers; i++) {
      const ri = r0 + i * dr;
      arcSlab(acc, ri, ri + dr, a0, a1, 0, th * (i + 1), i % 2 === 0 ? K.stone : K.stoneDark, n);
      // oak seat strip on the tier's outer edge
      if (hi)
        arcSlab(
          acc,
          ri + dr * 0.42,
          ri + dr * 0.86,
          a0 + 0.07,
          a1 - 0.07,
          th * (i + 1),
          0.06,
          K.wood,
          n,
          { aoAmt: 0 },
        );
    }
    if (hi)
      for (const s of [a0, a1]) {
        const p = V(
          Math.sin(s) * (r0 + 0.5 * dr * tiers),
          0,
          Math.cos(s) * (r0 + 0.5 * dr * tiers),
        );
        bx(acc, 0.22, 0.3, 0.22, p.x, th * tiers, p.z, K.stoneDark, { aoAmt: 0.1 });
        put(acc, new THREE.ConeGeometry(0.15, 0.2, 4), [p.x, th * tiers + 0.4, p.z], K.roofTeal, {
          q: qEuler(0, PI / 4, 0),
          aoAmt: 0,
        });
      }
  } else {
    const w = 3.4;
    for (let i = 0; i < tiers; i++) {
      const zc = -0.55 - i * 0.55;
      const h = th * (i + 1);
      bx(acc, w, h, 0.56, 0, 0, zc, i % 2 === 0 ? K.stone : K.stoneDark, { aoAmt: 0.15 });
      if (hi) bx(acc, w - 0.5, 0.06, 0.26, 0, h, zc - 0.08, K.wood, { aoAmt: 0 });
    }
    for (const s of [-1, 1]) {
      bx(acc, 0.18, 1.0, 1.7, s * (w / 2 + 0.1), 0, -1.15, K.stoneDark, { aoAmt: 0.2 });
      if (hi)
        put(
          acc,
          new THREE.ConeGeometry(0.15, 0.22, 4),
          [s * (w / 2 + 0.1), 1.0, -0.4],
          K.roofTeal,
          { q: qEuler(0, PI / 4, 0), aoAmt: 0 },
        );
    }
  }
  // lectern at the front: pedestal, sloped desk, open book, lamp
  const lz = variant === 0 ? 0.15 : 0.3;
  bx(acc, 0.42, 0.78, 0.3, 0, 0, lz, K.wood, { aoAmt: 0.2 });
  put(acc, baseBox(0.54, 0.05, 0.44), [0, 0.78, lz], K.woodDark, {
    q: qEuler(-0.25, 0, 0),
    aoAmt: 0,
  });
  if (hi) {
    put(acc, baseBox(0.24, 0.025, 0.3), [-0.12, 0.835, lz + 0.01], K.chalk, {
      q: qEuler(-0.25, 0.04, 0.05),
      aoAmt: 0,
    });
    put(acc, baseBox(0.24, 0.025, 0.3), [0.12, 0.835, lz + 0.01], K.chalk, {
      q: qEuler(-0.25, -0.04, -0.05),
      aoAmt: 0,
    });
    bar(acc, [0.26, 0.82, lz - 0.1], [0.3, 1.1, lz - 0.1], 0.02, K.brass);
    bar(acc, [0.3, 1.1, lz - 0.1], [0.17, 1.14, lz - 0.02], 0.02, K.brass);
    lantern(acc, V(0.13, 1.13, lz - 0.0), 0.7, true);
    bx(acc, 0.44, 0.03, 0.04, 0, 0.5, lz + 0.155, K.chalkTeal, { aoAmt: 0 });
    addGlyph(acc, 'telescope', V(0, 0.45, lz + 0.155), {
      size: 0.22,
      color: K.chalkGold,
      depth: 0.03,
    });
  }
  // lantern post by the lectern
  const px = variant === 0 ? 0.95 : 1.15;
  const pz = variant === 0 ? 0.38 : 0.45;
  put(acc, cylB(0.05, 0.065, 1.55, hi ? 6 : 4), [px, 0, pz], K.bronzeDark, { aoAmt: 0.2 });
  put(acc, cylB(0.12, 0.12, 0.1, hi ? 6 : 4), [px, 0, pz], K.stoneDark, { aoAmt: 0.1 });
  lantern(acc, V(px, 1.7, pz), 1.4, hi);
  if (hi) bar(acc, [px, 1.55, pz], [px, 1.62, pz], 0.05, K.brass);
  return finish(acc, rng);
}

/* ---------------------------------- teaTrolley ---------------------------------- */

/** Teapot on a tray: body, lid, knob, spout, handle (axis x). */
function teapot(
  acc: Acc,
  at: THREE.Vector3,
  s: number,
  hi: boolean,
  body: string,
  band: string,
): void {
  ell(
    acc,
    at.clone().add(V(0, 0.085 * s, 0)),
    [0.1 * s, 0.085 * s, 0.1 * s],
    body,
    hi ? [9, 6] : [6, 3],
    { aoAmt: 0.12 },
  );
  if (!hi) return;
  put(
    acc,
    new THREE.TorusGeometry(0.098 * s, 0.014 * s, 3, 12),
    at.clone().add(V(0, 0.09 * s, 0)),
    band,
    { q: qEuler(PI / 2, 0, 0), aoAmt: 0 },
  );
  put(acc, new THREE.ConeGeometry(0.06 * s, 0.05 * s, 8), at.clone().add(V(0, 0.18 * s, 0)), body, {
    aoAmt: 0,
  });
  ball(acc, at.clone().add(V(0, 0.22 * s, 0)), 0.02 * s, band, 4);
  rod(
    acc,
    at.clone().add(V(0.08 * s, 0.08 * s, 0)),
    at.clone().add(V(0.2 * s, 0.17 * s, 0)),
    0.03 * s,
    0.014 * s,
    5,
    body,
    { aoAmt: 0 },
  );
  put(
    acc,
    new THREE.TorusGeometry(0.045 * s, 0.01 * s, 3, 8, PI * 1.4),
    at.clone().add(V(-0.1 * s, 0.09 * s, 0)),
    body,
    { q: qEuler(0, 0, 0.7), aoAmt: 0 },
  );
}

function cup(acc: Acc, at: THREE.Vector3, color: string, hi: boolean): void {
  put(acc, cylB(0.032, 0.048, 0.06, hi ? 8 : 5), at, color, { aoAmt: 0.05 });
  if (hi) {
    put(acc, cylB(0.062, 0.062, 0.008, 8), at, K.chalk, { aoAmt: 0 });
    put(
      acc,
      new THREE.TorusGeometry(0.02, 0.006, 3, 6, PI),
      at.clone().add(V(0.048, 0.034, 0)),
      color,
      { q: qEuler(0, 0, -PI / 2), aoAmt: 0 },
    );
  }
}

/**
 * Two-tier oak tea trolley on two big wheels and two casters, a brass push handle. v0: teapot,
 * three cups, a tiered cake stand and an oil lamp; v1: a brass tea urn, cups, a stack of books and
 * the lamp. ~1.1 u high.
 */
function teaTrolley({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const lowY = 0.3;
  const upY = 0.64;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      bar(acc, [sx * 0.42, 0.12, sz * 0.2], [sx * 0.42, 0.9, sz * 0.2], 0.04, K.woodDeep, {
        aoAmt: 0.1,
      });
  for (const y of [lowY, upY]) {
    bx(acc, 0.98, 0.035, 0.52, 0, y, 0, K.wood, { aoAmt: 0.05 });
    if (hi) {
      bx(acc, 0.98, 0.04, 0.025, 0, y + 0.035, 0.245, K.woodDark, { aoAmt: 0 });
      bx(acc, 0.98, 0.04, 0.025, 0, y + 0.035, -0.245, K.woodDark, { aoAmt: 0 });
      bx(acc, 0.025, 0.04, 0.46, 0.475, y + 0.035, 0, K.woodDark, { aoAmt: 0 });
    }
  }
  // brass handle at the -x end, big wheels, casters
  bar(acc, [-0.42, 0.9, 0.2], [-0.6, 0.84, 0.2], 0.03, K.brass);
  bar(acc, [-0.42, 0.9, -0.2], [-0.6, 0.84, -0.2], 0.03, K.brass);
  bar(acc, [-0.6, 0.84, 0.21], [-0.6, 0.84, -0.21], 0.032, K.brass);
  for (const sz of [-1, 1]) {
    wheel(acc, [-0.28, 0.19, sz * 0.31], 0.19, 0.04, K.woodDeep, K.brass, hi);
    wheel(acc, [0.36, 0.08, sz * 0.25], 0.08, 0.035, K.woodDeep, K.brass, false);
  }
  if (hi)
    put(acc, cylB(0.02, 0.02, 0.58, 5), [-0.28, 0.19, 0], K.steelDark, {
      q: qEuler(PI / 2, 0, 0),
      aoAmt: 0,
    });
  const topY = upY + 0.035;
  const lowTop = lowY + 0.035;
  if (variant === 0) {
    teapot(acc, V(-0.22, topY, -0.03), 1, hi, K.chalk, K.teal);
    for (let k = 0; k < 3; k++)
      cup(acc, V(0.0 + k * 0.13, topY, 0.13 - k * 0.04), k === 1 ? K.teal : K.chalk, hi);
    // tiered cake stand on the lower shelf
    const stand = lathe(
      [
        [0.01, 0],
        [0.04, 0.02],
        [0.03, 0.12],
        [0.16, 0.14],
        [0.17, 0.155],
        [0.01, 0.155],
      ],
      hi ? 10 : 6,
    );
    put(acc, stand, [0.2, lowTop, 0], K.chalk, { aoAmt: 0.05, double: true });
    put(acc, cylB(0.12, 0.12, 0.03, 8), [0.2, lowTop + 0.16, 0], K.copper, { aoAmt: 0 });
    if (hi) {
      for (const [x, z, c] of [
        [0.14, 0.03, K.rocketRed],
        [0.24, -0.04, K.chalkGold],
        [0.2, 0.08, K.flowers[0]],
      ] as const)
        ball(acc, V(x, lowTop + 0.2, z), 0.035, c, 5);
      ball(acc, V(-0.3, lowTop + 0.05, 0.08), 0.05, K.cream, 6);
      put(acc, cylB(0.06, 0.06, 0.07, 7), [-0.28, lowTop, -0.09], K.copperLight, { aoAmt: 0 });
    }
  } else {
    // brass urn with a tap on the top shelf
    const urn = lathe(
      [
        [0.001, 0],
        [0.09, 0.0],
        [0.13, 0.08],
        [0.14, 0.2],
        [0.1, 0.3],
        [0.06, 0.33],
        [0.001, 0.35],
      ],
      hi ? 10 : 6,
    );
    put(acc, urn, [-0.2, topY, 0], K.brass, { aoAmt: 0.1, double: true });
    if (hi) {
      put(acc, cylB(0.025, 0.02, 0.08, 6), [-0.2 + 0.14, topY + 0.09, 0], K.brass, {
        q: qEuler(0, 0, -PI / 2),
        aoAmt: 0,
      });
      ball(acc, V(-0.2, topY + 0.37, 0), 0.025, K.bronzeDark, 4);
      put(
        acc,
        new THREE.TorusGeometry(0.06, 0.008, 3, 8, PI),
        [-0.2, topY + 0.34, 0],
        K.bronzeDark,
        { aoAmt: 0 },
      );
    }
    for (let k = 0; k < 3; k++)
      cup(acc, V(0.12 + k * 0.12, topY, 0.12 - k * 0.07), k === 1 ? K.chalkGold : K.chalk, hi);
    // book stack on the lower shelf
    for (let k = 0; k < 4; k++)
      bx(
        acc,
        0.26 - k * 0.02,
        0.045,
        0.19,
        0.1 + k * 0.01,
        lowTop + k * 0.045,
        0.02,
        K.books[(k * 3) % K.books.length],
        { q: qEuler(0, k * 0.2 - 0.2, 0), aoAmt: 0 },
      );
    if (hi) {
      teapot(acc, V(-0.2, lowTop, 0.08), 0.8, true, K.copper, K.chalkGold);
      bx(acc, 0.1, 0.1, 0.1, 0.3, lowTop, -0.1, K.cream, { aoAmt: 0 });
    }
  }
  // oil lamp on the top shelf
  const lx = variant === 0 ? 0.38 : 0.4;
  put(acc, cylB(0.05, 0.05, 0.03, 6), [lx, topY, -0.17], K.brass, { aoAmt: 0 });
  lantern(acc, V(lx, topY + 0.13, -0.17), 0.75, hi);
  return finish(acc, rng);
}

/* ------------------------------ weatherBalloonCart ------------------------------ */

/** Gas balloon outline (r, y) from the neck at y = 0 up to 1.45. */
const BALLOON = [
  [0.001, 0],
  [0.05, 0.02],
  [0.09, 0.1],
  [0.3, 0.3],
  [0.5, 0.58],
  [0.58, 0.88],
  [0.5, 1.15],
  [0.3, 1.36],
  [0.001, 1.45],
] as const;

/**
 * Meteorologists' hand cart: two big wheels, a tow bar, a rack of teal gas bottles, a tether reel
 * with a crank, a styrofoam radiosonde box. v0 has a white balloon tethered above it (2.6 u); v1 is
 * the cart after the 06:00 launch (slack tether, folded tarp).
 */
function weatherBalloonCart({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const bedY = 0.34;
  bx(acc, 1.3, 0.08, 0.74, 0, bedY, 0, K.wood, { aoAmt: 0.1 });
  if (hi) {
    for (const sz of [-1, 1])
      bx(acc, 1.3, 0.12, 0.05, 0, bedY + 0.08, sz * 0.345, K.woodDark, { aoAmt: 0 });
    bx(acc, 0.05, 0.12, 0.64, -0.625, bedY + 0.08, 0, K.woodDark, { aoAmt: 0 });
  }
  for (const sz of [-1, 1]) wheel(acc, [0.0, 0.26, sz * 0.43], 0.26, 0.06, K.woodDeep, K.brass, hi);
  if (hi)
    put(acc, cylB(0.025, 0.025, 0.84, 5), [0, 0.26, 0], K.steelDark, {
      q: qEuler(PI / 2, 0, 0),
      aoAmt: 0,
    });
  // tow bar + prop leg
  bar(acc, [0.55, bedY + 0.04, 0.2], [1.2, 0.55, 0.14], 0.045, K.woodDark);
  bar(acc, [0.55, bedY + 0.04, -0.2], [1.2, 0.55, -0.14], 0.045, K.woodDark);
  bar(acc, [1.2, 0.55, 0.16], [1.2, 0.55, -0.16], 0.045, K.brass);
  bar(acc, [-0.62, bedY, 0.0], [-0.72, 0.0, 0.0], 0.05, K.woodDark);
  // gas bottle rack
  for (const [x, z] of [
    [-0.42, 0.14],
    [-0.42, -0.14],
  ] as const) {
    put(acc, cylB(0.09, 0.09, 0.72, hi ? 9 : 5), [x, bedY + 0.08, z], K.teal, { aoAmt: 0.15 });
    ell(acc, [x, bedY + 0.8, z], [0.09, 0.07, 0.09], K.teal, hi ? [9, 4] : [5, 3], { aoAmt: 0 });
    if (hi) {
      put(acc, cylB(0.035, 0.035, 0.07, 5), [x, bedY + 0.86, z], K.brass, { aoAmt: 0 });
      put(acc, cylB(0.092, 0.092, 0.04, 9), [x, bedY + 0.3, z], K.chalk, { aoAmt: 0 });
    }
  }
  if (hi) {
    bar(acc, [-0.58, bedY + 0.55, 0.04], [-0.58, bedY + 0.55, -0.04], 0.04, K.brass);
    bar(acc, [-0.5, bedY + 0.5, 0.14], [-0.5, bedY + 0.5, -0.14], 0.03, K.steelDark);
    // reel: frame, drum, wound line, crank
    for (const sz of [-1, 1])
      bx(acc, 0.05, 0.3, 0.03, 0.18, bedY + 0.08, sz * 0.17, K.woodDark, { aoAmt: 0 });
    put(acc, new THREE.CylinderGeometry(0.09, 0.09, 0.3, 10), [0.18, bedY + 0.3, 0], K.copper, {
      q: qEuler(PI / 2, 0, 0),
      aoAmt: 0,
    });
    put(
      acc,
      new THREE.CylinderGeometry(0.15, 0.15, 0.025, 12),
      [0.18, bedY + 0.3, 0.15],
      K.woodDark,
      { q: qEuler(PI / 2, 0, 0), aoAmt: 0 },
    );
    put(
      acc,
      new THREE.CylinderGeometry(0.15, 0.15, 0.025, 12),
      [0.18, bedY + 0.3, -0.15],
      K.woodDark,
      { q: qEuler(PI / 2, 0, 0), aoAmt: 0 },
    );
    bar(acc, [0.18, bedY + 0.3, 0.2], [0.3, bedY + 0.42, 0.2], 0.03, K.brass);
    ball(acc, V(0.3, bedY + 0.43, 0.2), 0.035, K.rocketRed, 5);
  } else {
    bx(acc, 0.3, 0.2, 0.3, 0.18, bedY + 0.08, 0, K.copper, { aoAmt: 0.1 });
  }
  if (variant === 0) {
    // payload box under the balloon, tether to the reel, balloon
    const bc = V(0.05, 0, 0);
    const pb = V(bc.x, 1.1, 0);
    bx(acc, 0.24, 0.18, 0.2, pb.x, pb.y, 0, K.chalk, { aoAmt: 0.1 });
    if (hi) {
      bx(acc, 0.26, 0.03, 0.22, pb.x, pb.y + 0.18, 0, K.chalkTeal, { aoAmt: 0 });
      bar(acc, [pb.x, pb.y + 0.2, 0], [pb.x, pb.y + 0.45, 0], 0.012, K.steelDark);
      put(acc, new THREE.OctahedronGeometry(0.03, 0), [pb.x, pb.y + 0.1, 0.105], K.lamp, lit);
    }
    // tether: payload -> reel
    bar(acc, [pb.x, pb.y, 0], [0.18, bedY + 0.4, 0], hi ? 0.012 : 0.02, K.cream, { aoAmt: 0 });
    // balloon: string + body
    const base = V(bc.x, 1.55, 0);
    for (const [sx, sz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      bar(
        acc,
        [pb.x + sx * 0.08, pb.y + 0.18, sz * 0.07],
        [base.x + sx * 0.05, base.y + 0.01, sz * 0.05],
        0.01,
        K.cream,
        { aoAmt: 0 },
      );
    put(
      acc,
      lathe(BALLOON as unknown as ReadonlyArray<readonly [number, number]>, hi ? 14 : 8),
      base,
      K.chalk,
      { s: [0.92, 0.78, 0.92], aoAmt: 0.1, noJitter: true },
    );
    if (hi) {
      put(
        acc,
        new THREE.TorusGeometry(0.34, 0.02, 3, 14),
        base.clone().add(V(0, 0.33, 0)),
        K.teal,
        { q: qEuler(PI / 2, 0, 0), aoAmt: 0 },
      );
      put(
        acc,
        new THREE.TorusGeometry(0.28, 0.02, 3, 14),
        base.clone().add(V(0, 0.8, 0)),
        K.chalkGold,
        { q: qEuler(PI / 2, 0, 0), aoAmt: 0 },
      );
      put(acc, cylB(0.05, 0.04, 0.07, 6), base.clone().add(V(0, -0.035, 0)), K.brass, { aoAmt: 0 });
    }
  } else if (hi) {
    // after the launch: folded tarp, a slack line coiled on the bed, an empty box lid
    bx(acc, 0.4, 0.08, 0.3, 0.15, bedY + 0.08 + 0.3, 0, K.chalk, { aoAmt: 0.1 });
    bx(acc, 0.34, 0.06, 0.25, 0.14, bedY + 0.46, 0, K.cream, { aoAmt: 0 });
    put(acc, new THREE.TorusGeometry(0.07, 0.014, 3, 8), [0.3, bedY + 0.1, -0.2], K.cream, {
      q: qEuler(PI / 2, 0, 0),
      aoAmt: 0,
    });
    bx(acc, 0.24, 0.1, 0.2, 0.15, bedY + 0.08, 0.2, K.chalk, { aoAmt: 0.1 });
    bar(acc, [0.1, bedY + 0.4, 0.0], [0.5, bedY + 0.1, 0.24], 0.012, K.cream, { aoAmt: 0 });
  }
  return finish(acc, rng);
}

/* ------------------------------------ owlBox ------------------------------------ */

/**
 * Barn-owl nest box on a pole: oak box, round entrance with a brass trim ring, a perch peg, a gabled
 * teal roof, a hanging lantern and pole pegs. v1 has an owl inside: two glowing eyes in the hole
 * and a cream feather tuft. ~2.5 u high.
 */
function owlBox({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const boxY = 1.65;
  const bw = 0.62;
  const bh = 0.66;
  const bd = 0.55;
  // pole, base stone, braces
  bx(acc, 0.12, boxY + 0.05, 0.12, 0, 0, 0, K.woodDark, { aoAmt: 0.2 });
  put(acc, cylB(0.22, 0.26, 0.12, hi ? 8 : 5), [0, 0, 0], K.stoneDark, { aoAmt: 0.2 });
  if (hi) {
    for (const [sx, sz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      bar(acc, [sx * 0.34, 0.08, sz * 0.34], [sx * 0.05, 0.85, sz * 0.05], 0.045, K.woodDark);
    for (let k = 0; k < 4; k++) {
      const y = 0.9 + k * 0.2;
      bar(acc, [0.06, y, 0.06], [0.2, y, 0.06], 0.035, K.wood);
    }
  }
  // the box: floor, walls (front board has the hole)
  bx(acc, bw + 0.08, 0.06, bd + 0.08, 0, boxY, 0, K.woodDark, { aoAmt: 0.05 });
  bx(acc, bw, bh, bd, 0, boxY + 0.06, 0, K.wood, { aoAmt: 0.1 });
  // entrance: dark disc, brass ring, perch
  const hole = V(0, boxY + 0.42, bd / 2 + 0.012);
  put(acc, new THREE.CircleGeometry(0.15, hi ? 14 : 8), hole, K.lens, { aoAmt: 0, ao: () => 0.8 });
  if (hi) {
    put(
      acc,
      new THREE.TorusGeometry(0.16, 0.025, 3, 14),
      hole.clone().add(V(0, 0, 0.012)),
      K.brass,
      { aoAmt: 0 },
    );
    put(acc, cylB(0.02, 0.02, 0.28, 5), [0, boxY + 0.18, bd / 2 + 0.1], K.brass, {
      q: qEuler(0, 0, PI / 2),
      aoAmt: 0,
    });
    for (const s of [-1, 1])
      bar(
        acc,
        [s * 0.12, boxY + 0.18, bd / 2],
        [s * 0.12, boxY + 0.18, bd / 2 + 0.1],
        0.025,
        K.brass,
      );
    // plank lines + corner trims
    for (const s of [-1, 1])
      bx(acc, 0.04, bh, 0.04, s * (bw / 2), boxY + 0.06, bd / 2 + 0.01, K.woodDark, { aoAmt: 0 });
    addGlyph(acc, 'star', V(0, boxY + 0.14, bd / 2 + 0.012), {
      size: 0.12,
      color: K.chalkGold,
      depth: 0.02,
    });
  }
  // roof (ridge along z)
  const roof = new THREE.ExtrudeGeometry(
    new THREE.Shape([
      new THREE.Vector2(-0.46, 0),
      new THREE.Vector2(0.46, 0),
      new THREE.Vector2(0, 0.26),
    ]),
    { depth: bd + 0.18, bevelEnabled: false },
  ).translate(0, 0, -(bd + 0.18) / 2);
  put(acc, roof, [0, boxY + 0.06 + bh, 0], K.roofTeal, { aoAmt: 0 });
  if (hi) ball(acc, V(0, boxY + 0.06 + bh + 0.3, 0), 0.04, K.brass, 5);
  // hanging lantern on a bracket
  bar(acc, [0.06, 1.35, 0], [0.34, 1.35, 0], 0.03, K.brass);
  bar(acc, [0.34, 1.35, 0], [0.34, 1.28, 0], 0.012, K.brass, { aoAmt: 0 });
  lantern(acc, V(0.34, 1.18, 0), 1.0, hi);
  if (variant === 1) {
    // the owl is in: eyes glow in the hole, a feather tuft hangs over the rim
    for (const s of [-1, 1]) {
      ball(acc, hole.clone().add(V(s * 0.055, 0.0, 0.02)), 0.04, K.chalkGold, hi ? 6 : 4, lit);
      if (hi) ball(acc, hole.clone().add(V(s * 0.055, 0.0, 0.055)), 0.017, K.lens, 4, { aoAmt: 0 });
    }
    if (hi) {
      ell(acc, hole.clone().add(V(0, -0.1, 0.05)), [0.12, 0.05, 0.05], K.owlCream, [7, 4], {
        aoAmt: 0,
      });
      for (const s of [-1, 1])
        put(
          acc,
          new THREE.ConeGeometry(0.035, 0.09, 4),
          hole.clone().add(V(s * 0.1, 0.15, 0.0)),
          K.owlBrown,
          { q: qEuler(0, 0, -s * 0.5), aoAmt: 0 },
        );
    }
  }
  return finish(acc, rng);
}

/* ----------------------------------- pigeonPerch ----------------------------------- */

/** A chunky pigeon facing +z at `at` (feet position), turned by `yaw`; `s` scales it. */
function pigeon(acc: Acc, at: THREE.Vector3, yaw: number, s: number, hi: boolean, tone = 0): void {
  const q = qEuler(0, yaw, 0);
  const p = (x: number, y: number, z: number): THREE.Vector3 =>
    at.clone().add(V(x * s, y * s, z * s).applyQuaternion(q));
  const body = tone === 0 ? K.pigeon : K.pigeonDark;
  ell(acc, p(0, 0.075, 0), [0.065 * s, 0.06 * s, 0.1 * s], body, hi ? [8, 5] : [4, 2], {
    q,
    aoAmt: 0.05,
  });
  ball(acc, p(0, 0.13, 0.085), 0.04 * s, body, hi ? 6 : 4, { aoAmt: 0 });
  if (!hi) return;
  ell(acc, p(0, 0.105, 0.07), [0.052 * s, 0.045 * s, 0.045 * s], K.teal, [6, 4], { q, aoAmt: 0 });
  put(acc, new THREE.ConeGeometry(0.014 * s, 0.04 * s, 4), p(0, 0.125, 0.14), K.chalkGold, {
    q: qEuler(PI / 2, 0, 0).premultiply(q),
    aoAmt: 0,
  });
  put(acc, new THREE.ConeGeometry(0.04 * s, 0.1 * s, 4), p(0, 0.08, -0.14), K.pigeonDark, {
    q: qEuler(-PI / 2 - 0.25, 0, 0).premultiply(q),
    s: [1, 1, 0.4],
    aoAmt: 0,
  });
  for (const sx of [-1, 1])
    ell(acc, p(sx * 0.058, 0.09, -0.01), [0.014 * s, 0.045 * s, 0.075 * s], K.pigeonDark, [5, 3], {
      q,
      aoAmt: 0,
    });
  for (const sx of [-1, 1])
    bar(acc, p(sx * 0.02, 0.0, 0), p(sx * 0.02, 0.035, 0), 0.012 * s, K.rocketRed, { aoAmt: 0 });
}

/**
 * v0: oak T-perch on a stone footing with a brass cap and three pigeons; v1: a short stone pillar
 * with a bird-bath bowl and two pigeons (one drinking). The pigeons are what the gull landing
 * spot snaps to. ~1.3 / 0.95 u high.
 */
function pigeonPerch({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  if (variant === 0) {
    put(acc, cylB(0.2, 0.24, 0.1, hi ? 8 : 5), [0, 0, 0], K.stoneDark, { aoAmt: 0.2 });
    put(acc, cylB(0.04, 0.05, 1.12, hi ? 6 : 4), [0, 0.08, 0], K.woodDark, { aoAmt: 0.15 });
    bar(acc, [-0.42, 1.14, 0], [0.42, 1.14, 0], 0.05, K.wood);
    if (hi) {
      for (const s of [-1, 1]) ball(acc, V(s * 0.44, 1.14, 0), 0.04, K.brass, 5);
      // small teal canopy on two brass posts, above the birds
      for (const sx of [-1, 1])
        bar(acc, [sx * 0.42, 1.16, 0], [sx * 0.42, 1.52, 0], 0.025, K.brass);
      put(acc, new THREE.ConeGeometry(0.58, 0.16, 4), [0, 1.6, 0], K.roofTeal, {
        q: qEuler(0, PI / 4, 0),
        s: [1, 1, 0.55],
        aoAmt: 0,
      });
      ball(acc, V(0, 1.7, 0), 0.04, K.brass, 5);
    }
    pigeon(acc, V(-0.27, 1.165, 0), 0.4, 1, hi);
    pigeon(acc, V(0.04, 1.165, 0), -0.3, 1.1, hi, 1);
    pigeon(acc, V(0.3, 1.165, 0), 1.2, 0.95, hi);
    if (hi)
      put(acc, new THREE.CylinderGeometry(0.1, 0.07, 0.04, 8), [0.0, 0.1, 0.32], K.copper, {
        aoAmt: 0,
      });
  } else {
    bx(acc, 0.42, 0.1, 0.42, 0, 0, 0, K.stoneDark, { aoAmt: 0.2 });
    bx(acc, 0.28, 0.62, 0.28, 0, 0.1, 0, K.stone, { aoAmt: 0.2 });
    bx(acc, 0.4, 0.07, 0.4, 0, 0.72, 0, K.stoneDark, { aoAmt: 0.1 });
    const bowl = lathe(
      [
        [0.001, 0],
        [0.13, 0.02],
        [0.3, 0.1],
        [0.34, 0.15],
        [0.3, 0.14],
        [0.001, 0.07],
      ],
      hi ? 12 : 5,
    );
    put(acc, bowl, [0, 0.79, 0], K.stone, { aoAmt: 0.1, double: hi });
    put(acc, new THREE.CylinderGeometry(0.26, 0.26, 0.01, hi ? 12 : 5), [0, 0.89, 0], K.glass, {
      aoAmt: 0,
    });
    pigeon(acc, V(0.26, 0.93, 0.1), -2.2, 1, hi);
    pigeon(acc, V(-0.1, 0.93, 0.28), 3.3, 0.9, hi, 1);
    if (hi) ball(acc, V(0, 0.85, 0), 0.04, K.pigeonDark, 5);
  }
  return finish(acc, rng);
}

/* ------------------------------------- bookCart ------------------------------------- */

/** A row of upright books along x on a shelf top `y`, spines facing +z; leaning end book. */
function bookRow(
  acc: Acc,
  x0: number,
  x1: number,
  y: number,
  z: number,
  maxH: number,
  seed: number,
  hi: boolean,
): void {
  if (!hi) {
    bx(acc, x1 - x0, maxH * 0.8, 0.2, (x0 + x1) / 2, y, z, K.books[seed % K.books.length], {
      aoAmt: 0.05,
    });
    return;
  }
  let x = x0;
  let i = seed;
  while (x < x1 - 0.06) {
    const h = maxH * (0.72 + (((i * 37) % 11) / 11) * 0.28);
    const w = 0.04 + (((i * 17) % 5) / 5) * 0.035;
    const lean = x + w > x1 - 0.12 ? 0.28 : 0;
    bx(acc, w, h, 0.2, x + w / 2, y, z, K.books[i % K.books.length], {
      q: qEuler(0, 0, -lean),
      aoAmt: 0.05,
    });
    x += w + 0.004;
    i += 3;
  }
}

/**
 * Library trolley. v0: oak cart with three shelves of books, brass rail and handle, four casters;
 * v1: the same with a pile and an open book on top; v2: no cart, a staggered pile of big books with
 * an open one on top (the step stool beside the tripod). ~1.0 / 1.0 / 0.55 u.
 */
function bookCart({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  if (variant === 2) {
    const sizes = [
      [0.62, 0.1, 0.44, 0.0],
      [0.55, 0.09, 0.4, 0.3],
      [0.5, 0.09, 0.36, -0.25],
      [0.42, 0.08, 0.32, 0.45],
      [0.36, 0.07, 0.28, -0.1],
    ] as const;
    let y = 0;
    sizes.forEach(([w, h0, d, yaw], i) => {
      if (!hi && i % 2 === 1) return;
      // far look: every second book is skipped, its height goes to the one below
      const h = hi ? h0 : h0 + (sizes[i + 1]?.[1] ?? 0);
      bx(acc, w, h, d, (i % 2) * 0.03, y, 0, K.books[(i * 3 + 1) % K.books.length], {
        q: qEuler(0, yaw, 0),
        aoAmt: 0.05,
      });
      if (hi)
        bx(acc, w - 0.02, h * 0.55, d - 0.02, (i % 2) * 0.03, y + h * 0.2, 0.012, K.chalk, {
          q: qEuler(0, yaw, 0),
          aoAmt: 0,
        });
      y += h;
    });
    if (hi) {
      put(acc, baseBox(0.17, 0.02, 0.24), [-0.1, y, 0], K.chalk, {
        q: qEuler(-0.1, 0.1, 0.12),
        aoAmt: 0,
      });
      put(acc, baseBox(0.17, 0.02, 0.24), [0.08, y, 0], K.chalk, {
        q: qEuler(-0.1, -0.05, -0.12),
        aoAmt: 0,
      });
      bar(acc, [0.0, y + 0.03, 0.1], [0.04, y - 0.12, 0.34], 0.012, K.rocketRed, { aoAmt: 0 });
    }
    return finish(acc, rng);
  }
  const L = 1.04;
  const D = 0.46;
  for (const sx of [-1, 1])
    bx(acc, 0.045, 0.86, D, sx * (L / 2 - 0.02), 0.1, 0, K.wood, { aoAmt: 0.1 });
  const shelves = [0.14, 0.44, 0.74];
  for (const y of shelves) bx(acc, L, 0.035, D, 0, y, 0, K.woodDark, { aoAmt: 0.1 });
  if (hi) {
    bx(acc, L - 0.1, 0.03, 0.03, 0, 0.7, D / 2 + 0.005, K.woodDark, { aoAmt: 0 });
    bar(
      acc,
      [-L / 2 + 0.03, 0.96, D / 2 - 0.03],
      [L / 2 - 0.03, 0.96, D / 2 - 0.03],
      0.025,
      K.brass,
    );
    bar(
      acc,
      [-L / 2 + 0.03, 0.96, -D / 2 + 0.03],
      [L / 2 - 0.03, 0.96, -D / 2 + 0.03],
      0.025,
      K.brass,
    );
    // push handle
    bar(acc, [-L / 2, 0.88, 0.17], [-L / 2 - 0.18, 0.8, 0.17], 0.03, K.brass);
    bar(acc, [-L / 2, 0.88, -0.17], [-L / 2 - 0.18, 0.8, -0.17], 0.03, K.brass);
    bar(acc, [-L / 2 - 0.18, 0.8, 0.18], [-L / 2 - 0.18, 0.8, -0.18], 0.03, K.brass);
    addGlyph(acc, 'star', V(0.0, 0.84, D / 2 + 0.01), {
      size: 0.1,
      color: K.chalkGold,
      depth: 0.02,
    });
  }
  if (hi)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        wheel(acc, [sx * 0.4, 0.07, sz * 0.2], 0.07, 0.04, K.woodDeep, K.brass, false);
  else for (const sz of [-1, 1]) bx(acc, 0.9, 0.12, 0.06, 0, 0, sz * 0.2, K.woodDeep, { aoAmt: 0 });
  // books: bottom, middle, top rows
  bookRow(acc, -L / 2 + 0.05, L / 2 - 0.05, shelves[0] + 0.035, 0.0, 0.26, 1, hi);
  bookRow(acc, -L / 2 + 0.05, L / 2 - 0.05, shelves[1] + 0.035, 0.0, 0.25, 4, hi);
  bookRow(
    acc,
    -L / 2 + 0.05,
    variant === 1 ? 0.0 : L / 2 - 0.05,
    shelves[2] + 0.035,
    0.0,
    0.24,
    7,
    hi,
  );
  if (variant === 1) {
    // a pile and an open book on the top shelf
    for (let k = 0; k < (hi ? 4 : 2); k++)
      bx(
        acc,
        0.3 - k * 0.025,
        0.05,
        0.22,
        0.28,
        shelves[2] + 0.035 + k * 0.05,
        0,
        K.books[(k * 2 + 1) % K.books.length],
        { q: qEuler(0, k * 0.25 - 0.3, 0), aoAmt: 0.05 },
      );
    if (hi) {
      put(acc, baseBox(0.15, 0.02, 0.21), [0.15, shelves[2] + 0.255, 0.02], K.chalk, {
        q: qEuler(-0.05, 0.2, 0.15),
        aoAmt: 0,
      });
      put(acc, baseBox(0.15, 0.02, 0.21), [0.31, shelves[2] + 0.255, 0.02], K.chalk, {
        q: qEuler(-0.05, 0.2, -0.15),
        aoAmt: 0,
      });
    }
  }
  return finish(acc, rng);
}

/* ------------------------------- miniVolcanoTerrarium ------------------------------- */

/** Mini Emberpeak: basalt cone, lava crater and rivulets, ferns, a pebble. Returns the crater top. */
function miniVolcano(acc: Acc, base: THREE.Vector3, s: number, hi: boolean): THREE.Vector3 {
  put(
    acc,
    new THREE.ConeGeometry(0.2 * s, 0.3 * s, hi ? 8 : 5, 1, true),
    base.clone().add(V(0, 0.15 * s, 0)),
    K.basalt,
    { aoAmt: 0.1 },
  );
  put(
    acc,
    new THREE.CylinderGeometry(0.06 * s, 0.07 * s, 0.025 * s, hi ? 8 : 5),
    base.clone().add(V(0, 0.31 * s, 0)),
    K.lava,
    lit,
  );
  if (hi) {
    put(
      acc,
      new THREE.TorusGeometry(0.065 * s, 0.018 * s, 3, 8),
      base.clone().add(V(0, 0.315 * s, 0)),
      K.basalt,
      { q: qEuler(PI / 2, 0, 0), aoAmt: 0 },
    );
    bar(
      acc,
      base.clone().add(V(0.03 * s, 0.3 * s, 0.06 * s)),
      base.clone().add(V(0.07 * s, 0.1 * s, 0.17 * s)),
      0.024 * s,
      K.lava,
      lit,
    );
    bar(
      acc,
      base.clone().add(V(-0.04 * s, 0.3 * s, 0.03 * s)),
      base.clone().add(V(-0.12 * s, 0.14 * s, 0.1 * s)),
      0.02 * s,
      K.lava,
      lit,
    );
  }
  return base.clone().add(V(0, 0.34 * s, 0));
}

/**
 * Mini Emberpeak under glass. v0: a hexagonal cloche (pale aqua flat panes as thin frames + glint,
 * so the cone stays visible) on an oak stand; v1: a Wardian case (box with a gabled glass roof) on
 * a stone slab with two volcanoes and a palm. Lava glows at night; `hooks.emitter` = steam spot.
 */
function miniVolcanoTerrarium({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const hooks: number[] = [];
  if (variant === 0) {
    const sy = 0.36;
    const R = 0.34;
    for (const [sx, sz] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ] as const)
      bar(acc, [sx * 0.26, 0, sz * 0.26], [sx * 0.3, sy, sz * 0.3], 0.05, K.woodDark, {
        aoAmt: 0.15,
      });
    if (hi) bx(acc, 0.5, 0.025, 0.5, 0, 0.13, 0, K.wood, { aoAmt: 0 });
    put(acc, cylB(R + 0.06, R + 0.06, 0.06, 6), [0, sy, 0], K.wood, { aoAmt: 0.1 });
    put(acc, cylB(R - 0.02, R - 0.02, 0.07, 6), [0, sy + 0.04, 0], K.soil, { aoAmt: 0 });
    const top = miniVolcano(acc, V(0, sy + 0.1, 0), 1, hi);
    hooks.push(top.x, top.y + 0.04, top.z);
    if (hi) {
      // a fern and a palm in the corners, a pebble
      put(acc, new THREE.ConeGeometry(0.05, 0.16, 4), [0.2, sy + 0.18, -0.12], K.fern[0], {
        s: [1, 1, 0.5],
        aoAmt: 0,
      });
      put(acc, new THREE.ConeGeometry(0.05, 0.12, 4), [-0.18, sy + 0.16, 0.14], K.fern[1], {
        s: [0.6, 1, 1],
        aoAmt: 0,
      });
      ball(acc, V(-0.2, sy + 0.12, -0.12), 0.04, K.pigeonDark, 5);
    }
    // six flat panes + roof panes, ring frame, brass finial
    const H = 0.5;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + PI / 6;
      const yaw = a;
      const c = V(Math.sin(a) * R * 0.87, sy + 0.1 + H / 2, Math.cos(a) * R * 0.87);
      if (hi) pane(acc, c, yaw, R * 0.98, H, hi, 0.03);
    }
    put(
      acc,
      cylB(R + 0.01, R + 0.02, 0.03, 6).rotateY(PI / 6),
      [0, sy + 0.1 + H, 0],
      K.glassFrame,
      { aoAmt: 0 },
    );
    // roof: hex pyramid, panes as frames
    const apex = V(0, sy + 0.1 + H + 0.22, 0);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + PI / 6;
      const p0 = V(Math.sin(a) * R, sy + 0.1 + H + 0.02, Math.cos(a) * R);
      bar(acc, p0, apex, 0.028, K.glassFrame);
    }
    put(
      acc,
      new THREE.ConeGeometry(R * 0.98, 0.2, 6, 1, true),
      apex.clone().add(V(0, -0.1, 0)),
      K.glass,
      { q: qEuler(0, PI / 6, 0), aoAmt: 0, double: true, noJitter: true, ao: () => 1 },
    );
    ball(acc, apex.clone().add(V(0, 0.03, 0)), 0.04, K.brass, 6);
  } else {
    bx(acc, 0.86, 0.1, 0.62, 0, 0, 0, K.stone, { aoAmt: 0.2 });
    bx(acc, 0.8, 0.07, 0.56, 0, 0.1, 0, K.woodDark, { aoAmt: 0.1 });
    bx(acc, 0.72, 0.06, 0.48, 0, 0.17, 0, K.soil, { aoAmt: 0 });
    const t1 = miniVolcano(acc, V(-0.12, 0.2, 0), 1.2, hi);
    hooks.push(t1.x, t1.y + 0.04, t1.z);
    if (hi) {
      miniVolcano(acc, V(0.24, 0.2, 0.08), 0.65, true);
      put(acc, cylB(0.018, 0.012, 0.3, 4), [0.3, 0.2, -0.12], K.woodDark, {
        q: qEuler(0.15, 0, 0.1),
        aoAmt: 0,
      });
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        put(
          acc,
          new THREE.ConeGeometry(0.03, 0.2, 4),
          [0.3 + Math.sin(a) * 0.1, 0.52, -0.1 + Math.cos(a) * 0.1],
          K.fern[k % 3],
          { q: qEuler(Math.cos(a) * 1.0, 0, -Math.sin(a) * 1.0), s: [1.6, 1, 0.4], aoAmt: 0 },
        );
      }
      ball(acc, V(-0.33, 0.22, 0.14), 0.045, K.pigeonDark, 5);
    }
    // glass: four walls + gabled roof as flat aqua panes
    const gy = 0.23;
    const gh = 0.46;
    if (hi) pane(acc, V(0, gy + gh / 2, 0.27), 0, 0.72, gh, hi, 0.03);
    if (hi) pane(acc, V(0, gy + gh / 2, -0.27), PI, 0.72, gh, hi, 0.03);
    if (hi) pane(acc, V(0.38, gy + gh / 2, 0), PI / 2, 0.52, gh, hi, 0.03);
    if (hi) pane(acc, V(-0.38, gy + gh / 2, 0), -PI / 2, 0.52, gh, hi, 0.03);
    const ridge = gy + gh + 0.22;
    for (const sz of [-1, 1]) {
      bar(acc, [-0.38, gy + gh, sz * 0.27], [0, ridge, 0], 0.03, K.glassFrame);
      bar(acc, [0.38, gy + gh, sz * 0.27], [0, ridge, 0], 0.03, K.glassFrame);
      put(acc, new THREE.BoxGeometry(0.76, 0.014, 0.35), [0, gy + gh + 0.11, sz * 0.135], K.glass, {
        q: qEuler(sz * 0.684, 0, 0),
        aoAmt: 0,
        noJitter: true,
        ao: () => 1,
      });
    }
    bar(acc, [-0.4, ridge - 0.01, 0], [0.4, ridge - 0.01, 0], 0.035, K.brass);
    for (const sx of [-1, 1])
      bar(acc, [sx * 0.38, gy + gh, 0.27], [sx * 0.38, gy + gh, -0.27], 0.03, K.glassFrame);
    put(acc, baseBox(0.8, 0.03, 0.03), [0, gy + gh, 0.27], K.glassFrame, { aoAmt: 0 });
    put(acc, baseBox(0.8, 0.03, 0.03), [0, gy + gh, -0.27], K.glassFrame, { aoAmt: 0 });
  }
  const g = finish(acc, rng);
  g.userData.hooks = { emitter: hooks };
  return g;
}

/* --------------------------------- registry --------------------------------- */

export const RESEARCH_CULTURE_GEO: readonly PropGeoDef[] = [
  {
    id: 'tripodTelescope',
    variants: 2,
    build: tripodTelescope,
    footprint: 0.9,
    height: 1.55,
    windy: false,
  },
  {
    id: 'chalkboard',
    variants: 4,
    build: chalkboard,
    footprint: 1.0,
    height: 2.0,
    heights: [2.0, 2.0, 2.0, RESEARCH_M22.plate.height],
    windy: false,
    lod1Of: { 1: 0, 2: 0 },
  },
  {
    id: 'orrery',
    variants: 2,
    build: orrery,
    footprint: 1.2,
    height: 2.3,
    windy: false,
    lod1Of: { 1: 0 },
  },
  {
    id: 'lectureSteps',
    variants: 2,
    build: lectureSteps,
    footprint: 2.4,
    height: 1.75,
    heights: [1.85, 1.9],
    windy: false,
  },
  {
    id: 'teaTrolley',
    variants: 2,
    build: teaTrolley,
    footprint: 0.7,
    height: 1.1,
    windy: false,
    lod1Of: { 1: 0 },
  },
  {
    id: 'weatherBalloonCart',
    variants: 2,
    build: weatherBalloonCart,
    footprint: 1.0,
    height: 2.4,
    heights: [2.5, 1.2],
    windy: false,
  },
  {
    id: 'owlBox',
    variants: 2,
    build: owlBox,
    footprint: 0.6,
    height: 2.5,
    windy: false,
    lod1Of: { 1: 0 },
  },
  {
    id: 'pigeonPerch',
    variants: 2,
    build: pigeonPerch,
    footprint: 0.6,
    height: 1.2,
    heights: [1.7, 1.0],
    windy: false,
  },
  {
    id: 'bookCart',
    variants: 3,
    build: bookCart,
    footprint: 0.7,
    height: 0.9,
    heights: [1.0, 1.0, 0.55],
    windy: false,
  },
  {
    id: 'miniVolcanoTerrarium',
    variants: 2,
    build: miniVolcanoTerrarium,
    footprint: 0.6,
    height: 1.1,
    heights: [1.35, 1.0],
    windy: false,
  },
];
