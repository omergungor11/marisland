/**
 * Marketing island culture kit "Karnaval Yayıncıları / Carnival Broadcasters" (M19 TASK-413,
 * ISLAND_CULTURES §2.4). Geometry only (placement is a later wave); defs:
 * content/props-themes/marketing.ts (MARKETING_CULTURE_PROP_DEFS), ledger:
 * content/cultures/marketing.ts.
 *
 *   mascotStatue    T1  2.7 u foam-suit crab on a plinth, one claw waving, one holding a megaphone
 *   marqueeSign     T2  bulb-bordered sign on two posts, 3 words (SHOW / LIVE / NEW), lit letters
 *   popcornCart     T2  striped cart, glass case heaped with popcorn, striped canopy (2 colourways)
 *   balloonMast     T2  striped mooring mast, winch, guy ropes; v1 carries a bunch of balloons
 *   confettiCannon  T2  wheeled striped cannon; v1 is mid-blast (frozen confetti), v0 trails streamers
 *   searchlightPair T2  two drum projectors + generator (v0 splayed, v1 vertical); beam = hook only
 *   prizeBooth      T2  plush game booth (v0 plush wall + crab, v1 giant duck), a NEW def (see below)
 *   selfieSpot      T2  railed deck with a photo frame (v0 arch, v1 heart) and a phone on a tripod
 *   posterRoll      T3  rolled posters with lilac straps: basket / lying stack / leaning boards
 *   megaphoneStand  T3  striped horn on a tripod (v0) or on a drum (v1)
 *
 * prizeBooth is its own def, not fairBooth v2: fairBooth is a tier-2 def whose existing settlements
 * roll its variants, so a third variant would shift what they already show (ISLAND_CULTURES B10
 * allowed it, hard rule 4 forbids silent changes). It reuses the booth proportions (MEDIA_ROCK.booth).
 *
 * Marquee bulbs and sign letters are emissive 1 (lit like windows); the border bulbs carry the
 * `marquee` surface tag (LED chase, TASK-440; near LOD only). Every part is a primitive, vertex-coloured; pivots on the ground;
 * 1 u = 1 m. Everything stays < 2.85 u tall and < 3 u in one plan extent so no def is promoted to
 * tier 0 by the batcher (isLargeStructure, 5 % margin) - the mascot included.
 */
import * as THREE from 'three';
import { EMISSIVE, FLOWERS, ROCK, ROOFS, WALLS, WOOD } from '../../content/palette.ts';
import { MEDIA_ROCK } from '../../content/themes/marketing.ts';
import { createNoise } from '../../core/noise.ts';
import type { Acc } from '../kit.ts';
import { blob, col, qEuler, qFromTo } from '../kit.ts';
import { TAU, V, baseBox, cylB, jitterAcc, put, ropePoints, tubeAlong } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { addGlyph, type GlyphId } from './glyphs.ts';
import { addHook } from './hq.ts';
import { tagMarquee } from './surface-tags.ts';

const K = MEDIA_ROCK.colors;
const RED = K.accent;
const RED_DEEP = ROOFS[0];
const CREAM = K.cream;
const GOLD = K.gold;
const SKY = K.sky;
const MINT = K.mint;
const LILAC = K.lilac;
const DARK = K.bezel;
const CHROME = ROCK[0];
const AMBER = EMISSIVE.lantern;
const ROPE = '#D9C3A0';
const PINK = FLOWERS[0];
const POP = WALLS[3];
const Y = V(0, 1, 0);
const lit = { emissive: 1, aoAmt: 0, ao: () => 1 } as const;

/** Every part is rigid unless it carries `windAbs`; the def's windy flag lets those parts sway. */
const finish = (acc: Acc, rng: BuildOpts['rng']): THREE.BufferGeometry =>
  acc.finish(rng, false, true);

const sphere = (w: number, h: number): THREE.SphereGeometry => new THREE.SphereGeometry(1, w, h);

/** Ellipsoid centred on `at` with radii `r`. */
function ell(
  acc: Acc,
  at: THREE.Vector3 | [number, number, number],
  r: [number, number, number],
  color: THREE.Color | string | ((p: THREE.Vector3) => THREE.Color),
  seg: [number, number],
  o: { q?: THREE.Quaternion; aoAmt?: number; emissive?: number; windAbs?: number } = {},
): void {
  put(acc, sphere(seg[0], seg[1]), at, color as string, { s: r, aoAmt: 0.1, ...o });
}

/** Square beam from a to b (thickness `th`). */
function bar(
  acc: Acc,
  a: THREE.Vector3,
  b: THREE.Vector3,
  th: number,
  color: string,
  o: { windAbs?: number } = {},
): void {
  const d = b.clone().sub(a);
  put(acc, baseBox(th, d.length(), th), a, color, { q: qFromTo(Y, d), aoAmt: 0, ...o });
}

/** Warm bulb (octahedron, emissive 1). */
function bulb(acc: Acc, at: THREE.Vector3, r: number, color: string = AMBER): void {
  put(acc, new THREE.OctahedronGeometry(r, 0), at, color, lit);
}

/** Colour of a face by its angle round the vertical axis through `c`: n alternating stripes. */
const wedges =
  (c: THREE.Vector3, n: number, a: string, b: string) =>
  (p: THREE.Vector3): THREE.Color => {
    const t = (Math.atan2(p.z - c.z, p.x - c.x) + Math.PI) / TAU;
    return col(Math.floor(t * n) % 2 === 0 ? a : b);
  };

/** Cylinder (axis along `dir`) from `at` for `len`. */
function cylDir(
  acc: Acc,
  at: THREE.Vector3,
  dir: THREE.Vector3,
  rb: number,
  rt: number,
  len: number,
  seg: number,
  color: string,
  o: { emissive?: number; aoAmt?: number } = {},
): void {
  put(acc, cylB(rb, rt, len, seg), at, color, { q: qFromTo(Y, dir), aoAmt: 0.08, ...o });
}

/* ------------------------------- stroke letters ------------------------------- */

type Pt = readonly [number, number];
/** Block letters as polylines in a [0,1] x [0,1] cell (+y up). */
const FONT: Readonly<Record<string, ReadonlyArray<ReadonlyArray<Pt>>>> = {
  // chamfered corners and open ends (TASK-423: the square S read as a 5 / 9 next to the H)
  S: [
    [
      [1, 0.86],
      [0.82, 1],
      [0.18, 1],
      [0, 0.84],
      [0, 0.66],
      [0.18, 0.52],
      [0.82, 0.48],
      [1, 0.34],
      [1, 0.16],
      [0.82, 0],
      [0.18, 0],
      [0, 0.14],
    ],
  ],
  H: [
    [
      [0, 0],
      [0, 1],
    ],
    [
      [1, 0],
      [1, 1],
    ],
    [
      [0, 0.5],
      [1, 0.5],
    ],
  ],
  O: [
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
  ],
  // flat feet and a tall middle (TASK-423: the sharp V feet overshot into spikes)
  W: [
    [
      [0, 1],
      [0.14, 0],
      [0.34, 0],
      [0.5, 0.7],
      [0.66, 0],
      [0.86, 0],
      [1, 1],
    ],
  ],
  L: [
    [
      [0, 1],
      [0, 0],
      [1, 0],
    ],
  ],
  I: [
    [
      [0.15, 1],
      [0.85, 1],
    ],
    [
      [0.5, 1],
      [0.5, 0],
    ],
    [
      [0.15, 0],
      [0.85, 0],
    ],
  ],
  V: [
    [
      [0, 1],
      [0.5, 0],
      [1, 1],
    ],
  ],
  E: [
    [
      [1, 1],
      [0, 1],
      [0, 0],
      [1, 0],
    ],
    [
      [0, 0.5],
      [0.8, 0.5],
    ],
  ],
  N: [
    [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
  ],
};

/** A word of stroke letters centred on `at` (x), `h` tall, facing +z; `th` stroke thickness. */
function addWord(
  acc: Acc,
  word: string,
  at: THREE.Vector3,
  maxW: number,
  h: number,
  th: number,
  color: string,
): void {
  const n = word.length;
  const gapK = 0.36;
  const lw = Math.min(h * 0.72, maxW / (n + gapK * (n - 1)));
  // narrow letters (4-letter words) get thinner strokes so their counters stay open
  th = Math.min(th, lw * 0.21);
  const total = n * lw + (n - 1) * lw * gapK;
  const x0 = at.x - total / 2;
  [...word].forEach((ch, i) => {
    const ox = x0 + i * lw * (1 + gapK);
    for (const line of FONT[ch] ?? [])
      for (let k = 0; k + 1 < line.length; k++) {
        const a = V(ox + line[k][0] * lw, at.y - h / 2 + line[k][1] * h, at.z);
        const b = V(ox + line[k + 1][0] * lw, at.y - h / 2 + line[k + 1][1] * h, at.z);
        const d = b.clone().sub(a);
        const len = d.length() + th * 0.9;
        put(
          acc,
          new THREE.BoxGeometry(th, len, th * 0.9),
          a.clone().add(b).multiplyScalar(0.5),
          color,
          {
            q: qEuler(0, 0, Math.atan2(-d.x, d.y)),
            ...lit,
          },
        );
      }
  });
}

/* ---------------------------------- popcornCart ---------------------------------- */

const POPCORN_COLORWAYS: ReadonlyArray<readonly [string, string]> = [
  [GOLD, RED],
  [RED, CREAM],
];

function popcornCart({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.02);
  const [c0, c1] = POPCORN_COLORWAYS[variant % POPCORN_COLORWAYS.length];
  const r = rng.fork('cart');
  // wheels (axle along x)
  for (const sx of [-1, 1]) {
    put(
      acc,
      new THREE.CylinderGeometry(0.3, 0.3, 0.11, hi ? 14 : 7),
      [sx * 0.62, 0.3, 0.05],
      DARK,
      {
        q: qEuler(0, 0, Math.PI / 2),
        aoAmt: 0.1,
      },
    );
    if (hi)
      put(acc, new THREE.CylinderGeometry(0.13, 0.13, 0.14, 8), [sx * 0.62, 0.3, 0.05], GOLD, {
        q: qEuler(0, 0, Math.PI / 2),
        aoAmt: 0,
      });
  }
  // striped body
  if (hi) {
    const n = 6;
    const w = 1.1 / n;
    for (let i = 0; i < n; i++)
      put(acc, baseBox(w, 0.55, 0.78), [-0.55 + w * (i + 0.5), 0.32, 0], i % 2 ? c1 : c0, {
        aoAmt: 0.12,
      });
  } else put(acc, baseBox(1.1, 0.55, 0.78), [0, 0.32, 0], c0, { aoAmt: 0.12 });
  put(acc, baseBox(1.2, 0.09, 0.88), [0, 0.87, 0], CHROME, { aoAmt: 0 });
  // glass case: glowing cream box with chrome corner posts, popcorn heaped above the rim
  put(acc, baseBox(1.0, 0.5, 0.7), [0, 0.96, 0], POP, { emissive: 0.35, aoAmt: 0 });
  ell(acc, [0, 1.5, 0], [0.56, 0.34, 0.4], POP, hi ? [10, 6] : [6, 4], { aoAmt: 0.05 });
  if (hi) {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        put(acc, cylB(0.03, 0.03, 0.54, 5), [sx * 0.5, 0.96, sz * 0.35], CHROME, { aoAmt: 0 });
    for (let k = 0; k < 14; k++) {
      const a = r.range(0, TAU);
      const rr = r.range(0, 0.45);
      put(
        acc,
        new THREE.IcosahedronGeometry(r.range(0.05, 0.08), 0),
        [Math.cos(a) * rr, 1.74 + r.range(-0.03, 0.1) - rr * 0.3, Math.sin(a) * rr * 0.7],
        k % 3 === 0 ? GOLD : CREAM,
        { aoAmt: 0 },
      );
    }
    // canopy posts, scalloped valance, bulb row, finial pennant
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        put(acc, cylB(0.03, 0.03, 0.5, 5), [sx * 0.5, 0.96 + 0.5, sz * 0.36], CHROME, {
          aoAmt: 0,
        });
  }
  const canopyY = 1.96;
  const cc = V(0, canopyY, 0);
  put(
    acc,
    new THREE.ConeGeometry(0.92, 0.45, hi ? 8 : 6, 1, true).translate(0, 0.225, 0),
    cc,
    wedges(cc, hi ? 8 : 6, c0, c1),
    { aoAmt: 0, double: true, noJitter: true },
  );
  if (hi) {
    for (let k = 0; k < 8; k++) {
      const a = ((k + 0.5) / 8) * TAU;
      const g = new THREE.BufferGeometry();
      const w = (TAU * 0.92) / 8 / 2;
      g.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0, -0.17, 0], 3),
      );
      put(acc, g, [Math.sin(a) * 0.9, canopyY + 0.02, Math.cos(a) * 0.9], k % 2 ? c1 : c0, {
        q: qEuler(0, a, 0),
        double: true,
        aoAmt: 0,
        ao: () => 1,
      });
      if (k % 2 === 0) bulb(acc, V(Math.sin(a) * 0.9, canopyY - 0.12, Math.cos(a) * 0.9), 0.055);
    }
    // popcorn tubs on the front ledge
    for (const x of [-0.3, 0.1, 0.4]) {
      put(acc, cylB(0.09, 0.12, 0.26, 8), [x, 0.91, 0.5], x > 0 ? c0 : c1, { aoAmt: 0.05 });
      ell(acc, [x, 1.2, 0.5], [0.12, 0.08, 0.12], POP, [6, 4], { aoAmt: 0 });
    }
    // handle + prop stand
    bar(acc, V(0, 0.5, -0.4), V(0, 0.62, -1.0), 0.07, WOOD.dark);
    put(acc, cylB(0.05, 0.05, 0.3, 6), [0, 0.5, -1.0], WOOD.logs, {
      q: qEuler(0, 0, Math.PI / 2),
      aoAmt: 0,
    });
    put(acc, new THREE.IcosahedronGeometry(0.1, 0), [0, canopyY + 0.52, 0], GOLD, {
      aoAmt: 0,
      windAbs: 0.04,
    });
    const flag = new THREE.BufferGeometry();
    flag.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0.1, 0, 0, -0.1, 0, 0.5, 0, 0], 3),
    );
    put(acc, flag, [0, canopyY + 0.5, 0], c1, {
      double: true,
      aoAmt: 0,
      ao: () => 1,
      windAbs: (p) => Math.min(1, 0.15 + p.x * 1.5),
    });
    bar(acc, V(0, canopyY + 0.4, 0), V(0, canopyY + 0.57, 0), 0.04, CHROME);
  } else {
    put(acc, cylB(0.04, 0.04, 0.7, 4), [0, canopyY + 0.42, 0], CHROME, { aoAmt: 0 });
  }
  return finish(acc, rng);
}

/* --------------------------------- confettiCannon --------------------------------- */

const CONFETTI = [RED, GOLD, SKY, MINT, LILAC, PINK, CREAM] as const;

function confettiCannon({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.02);
  const r = rng.fork('boom');
  const fired = variant === 1;
  const shell = variant === 1 ? [SKY, CREAM] : [RED, CREAM];
  // wheeled carriage
  for (const sx of [-1, 1]) {
    put(
      acc,
      new THREE.CylinderGeometry(0.3, 0.3, 0.12, hi ? 14 : 7),
      [sx * 0.42, 0.3, -0.05],
      DARK,
      {
        q: qEuler(0, 0, Math.PI / 2),
        aoAmt: 0.1,
      },
    );
    if (hi)
      put(acc, new THREE.CylinderGeometry(0.14, 0.14, 0.15, 8), [sx * 0.42, 0.3, -0.05], GOLD, {
        q: qEuler(0, 0, Math.PI / 2),
        aoAmt: 0,
      });
    // cheek plate rising to the trunnion
    put(acc, baseBox(0.1, 0.55, 0.62), [sx * 0.3, 0.2, -0.05], WOOD.logs, { aoAmt: 0.12 });
  }
  if (hi)
    put(acc, new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), [0, 0.3, -0.05], CHROME, {
      q: qEuler(0, 0, Math.PI / 2),
      aoAmt: 0,
    });
  // barrel: striped segments along dir, flared muzzle
  const dir = V(0, 0.74, 0.67).normalize();
  const pivot = V(0, 0.62, -0.05);
  const segs = [
    { s: -0.55, l: 0.45, r0: 0.17, r1: 0.22, c: shell[0] },
    { s: -0.1, l: 0.45, r0: 0.22, r1: 0.24, c: shell[1] },
    { s: 0.35, l: 0.45, r0: 0.24, r1: 0.26, c: shell[0] },
  ];
  for (const sgm of hi ? segs : [{ s: -0.55, l: 1.25, r0: 0.18, r1: 0.26, c: shell[0] }])
    cylDir(
      acc,
      pivot.clone().addScaledVector(dir, sgm.s),
      dir,
      sgm.r0,
      sgm.r1,
      sgm.l,
      hi ? 12 : 7,
      sgm.c,
      {
        aoAmt: 0.05,
      },
    );
  cylDir(acc, pivot.clone().addScaledVector(dir, 0.8), dir, 0.27, 0.34, 0.12, hi ? 12 : 7, GOLD);
  cylDir(acc, pivot.clone().addScaledVector(dir, 0.9), dir, 0.27, 0.27, 0.03, hi ? 12 : 5, DARK, {
    aoAmt: 0,
  });
  ell(
    acc,
    pivot.clone().addScaledVector(dir, -0.58),
    [0.18, 0.18, 0.18],
    GOLD,
    hi ? [8, 5] : [5, 3],
  );
  if (hi) {
    for (const s of [-0.12, 0.33])
      cylDir(acc, pivot.clone().addScaledVector(dir, s - 0.03), dir, 0.265, 0.265, 0.06, 12, GOLD, {
        aoAmt: 0,
      });
    // star plate on the carriage front
    addGlyph(acc, 'star', V(0, 0.52, 0.28), {
      size: 0.34,
      color: GOLD,
      depth: 0.12,
      q: qEuler(-0.3, 0, 0),
    });
  }
  const muzzle = pivot.clone().addScaledVector(dir, 0.95);
  if (!hi) {
    if (fired)
      put(acc, new THREE.ConeGeometry(0.5, 0.9, 5, 1, true), muzzle, CONFETTI[1], {
        q: qFromTo(Y, dir),
        double: true,
        aoAmt: 0,
      });
    return finish(acc, rng);
  }
  if (fired) {
    // frozen blast: tilted paper flakes fanned in a cone round the barrel direction
    for (let k = 0; k < 34; k++) {
      const dist = r.range(0.25, 1.15);
      const spread = 0.12 + dist * 0.32;
      const ax = r.range(-spread, spread);
      const az = r.range(-spread, spread);
      const d2 = dir
        .clone()
        .add(V(ax, 0, az))
        .normalize();
      const p = muzzle
        .clone()
        .addScaledVector(d2, dist)
        .add(V(0, -dist * dist * 0.12, 0));
      const g = new THREE.BufferGeometry();
      const s = r.range(0.07, 0.11);
      g.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([-s, -s * 0.6, 0, s, -s * 0.6, 0, s * 0.2, s * 0.8, 0], 3),
      );
      put(acc, g, p, CONFETTI[k % CONFETTI.length], {
        q: qEuler(r.range(0, TAU), r.range(0, TAU), r.range(0, TAU)),
        double: true,
        aoAmt: 0,
        ao: () => 1,
        emissive: 0.25,
        windAbs: 0.4,
      });
    }
    // two curling streamers
    for (const [i, sx] of [-1, 1].entries()) {
      const pts = [0, 0.25, 0.5, 0.75, 1].map((t) =>
        muzzle
          .clone()
          .addScaledVector(dir, 0.15 + t * 0.9)
          .add(
            V(
              sx * Math.sin(t * 5) * 0.18,
              Math.sin(t * 3) * 0.1 - t * t * 0.3,
              Math.cos(t * 4) * 0.12,
            ),
          ),
      );
      put(acc, tubeAlong(pts, 0.025, 3), [0, 0, 0], CONFETTI[i * 2], { aoAmt: 0, windAbs: 0.35 });
    }
  } else {
    // loaded: streamers dangle from the muzzle, a few flakes caught on the rim
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU;
      const base = muzzle.clone().add(V(Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16));
      const tip = base.clone().add(V(Math.cos(a) * 0.2, 0.15 + (k % 2) * 0.12, Math.sin(a) * 0.2));
      put(
        acc,
        tubeAlong(ropePoints(base, tip, -0.1, 3), 0.03, 3),
        [0, 0, 0],
        CONFETTI[(k * 2) % 7],
        {
          aoAmt: 0,
          windAbs: 0.3,
        },
      );
    }
  }
  return finish(acc, rng);
}

/* ---------------------------------- posterRoll ---------------------------------- */

const PAPER = [WALLS[1], WALLS[2], ROOFS[6], WALLS[3]] as const;

/** A rolled poster (cylinder along `dir`, `len` long, base at `at`) with a lilac strap or two. */
function roll(
  acc: Acc,
  at: THREE.Vector3,
  dir: THREE.Vector3,
  len: number,
  rad: number,
  color: string,
  hi: boolean,
): void {
  cylDir(acc, at, dir, rad, rad, len, hi ? 8 : 4, color, { aoAmt: 0.05 });
  if (!hi) return;
  // dark spiral end
  put(acc, cylB(rad * 0.55, rad * 0.55, 0.02, 6), at.clone().addScaledVector(dir, len), RED_DEEP, {
    q: qFromTo(Y, dir),
    aoAmt: 0,
  });
  if (hi)
    for (const t of [0.3, 0.72])
      cylDir(
        acc,
        at.clone().addScaledVector(dir, len * t),
        dir,
        rad * 1.18,
        rad * 1.18,
        0.07,
        8,
        LILAC,
        {
          aoAmt: 0,
        },
      );
}

function posterRoll({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.03);
  const r = rng.fork('rolls');
  if (variant === 0) {
    // wicker basket of upright rolls
    put(acc, cylB(0.26, 0.3, 0.4, hi ? 10 : 6), [0, 0, 0], WOOD.planks, { aoAmt: 0.2 });
    if (hi) {
      put(acc, cylB(0.31, 0.31, 0.05, 10), [0, 0.15, 0], WOOD.logs, { aoAmt: 0 });
      put(acc, cylB(0.31, 0.31, 0.05, 10), [0, 0.34, 0], WOOD.logs, { aoAmt: 0 });
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + r.range(-0.2, 0.2);
      const rr = k === 5 ? 0 : 0.13;
      const lean = qEuler(Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12);
      const d = V(0, 1, 0).applyQuaternion(lean);
      roll(
        acc,
        V(Math.sin(a) * rr, 0.3, Math.cos(a) * rr),
        d,
        0.55 + r.range(0, 0.3),
        0.075,
        PAPER[k % 4],
        hi,
      );
    }
  } else if (variant === 1) {
    // lying stack (3 + 2 + 1) with a paste bucket and brush
    let n = 0;
    for (let row = 0; row < 3; row++)
      for (let k = 0; k < 3 - row; k++) {
        roll(
          acc,
          V(-0.45 + r.range(-0.03, 0.03), 0.1 + row * 0.155, (k - (2 - row) / 2) * 0.2),
          V(1, 0, 0),
          0.9,
          0.085,
          PAPER[n++ % 4],
          hi,
        );
      }
    put(acc, cylB(0.12, 0.1, 0.22, 8), [0.72, 0, 0.12], CHROME, { aoAmt: 0.15 });
    if (hi) {
      ell(acc, [0.72, 0.22, 0.12], [0.1, 0.03, 0.1], CREAM, [6, 3], { aoAmt: 0 });
      bar(acc, V(0.72, 0.05, 0.4), V(0.9, 0.05, 0.62), 0.05, WOOD.logs);
      put(acc, baseBox(0.12, 0.05, 0.18), [0.95, 0.05, 0.7], K.warm, { aoAmt: 0 });
    }
  } else {
    // three posters leaning on a crate (each a 0.12 slab with a glyph)
    put(acc, baseBox(0.6, 0.38, 0.5), [0, 0, -0.2], WOOD.planks, { aoAmt: 0.2 });
    const faces: ReadonlyArray<readonly [string, GlyphId]> = [
      [CREAM, 'star'],
      [SKY, 'megaphone'],
      [PINK, 'star'],
    ];
    faces.forEach(([c, gl], i) => {
      const x = (i - 1) * 0.42;
      const q = qEuler(-0.2, (i - 1) * -0.12, 0);
      put(acc, baseBox(0.38, 0.95, 0.12), [x, 0, 0.12], c, { q, aoAmt: 0.05 });
      if (hi)
        addGlyph(acc, gl, V(x, 0.55, 0.2 + i * 0.01), {
          size: 0.26,
          color: i === 0 ? RED : GOLD,
          depth: 0.06,
          q,
        });
    });
    if (hi) roll(acc, V(0.5, 0.38, -0.25), V(0.2, 0.15, -1).normalize(), 0.6, 0.075, LILAC, true);
  }
  return finish(acc, rng);
}

/* ---------------------------------- marqueeSign ---------------------------------- */

const MARQUEE_WORDS = ['SHOW', 'LIVE', 'NEW'] as const;

function marqueeSign({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.015);
  const word = MARQUEE_WORDS[variant % MARQUEE_WORDS.length];
  const face = [RED, DARK, GOLD][variant % 3];
  const letters = [CREAM, AMBER, RED][variant % 3];
  const W = 2.3;
  const Hc = 1.05;
  const y0 = 0.95;
  const cy = y0 + Hc / 2;
  // posts, foot plates and a base plank
  for (const sx of [-1, 1]) {
    put(acc, cylB(0.09, 0.11, y0 + 0.2, hi ? 7 : 4), [sx * (W / 2 - 0.2), 0, 0], CHROME, {
      aoAmt: 0.18,
    });
    put(acc, baseBox(0.42, 0.1, 0.42), [sx * (W / 2 - 0.2), 0, 0], ROCK[1], { aoAmt: 0.2 });
  }
  // cabinet, chrome frame, face
  put(acc, baseBox(W, Hc, 0.22), [0, y0, 0], RED_DEEP, { aoAmt: 0.1 });
  put(acc, baseBox(W - 0.24, Hc - 0.24, 0.05), [0, y0 + 0.12, 0.115], face, {
    emissive: 0.3,
    aoAmt: 0,
  });
  const t = 0.1;
  if (hi) {
    for (const sy of [0, 1])
      put(acc, baseBox(W + 0.1, t, 0.3), [0, y0 - t / 2 + sy * Hc, 0], CHROME, { aoAmt: 0 });
    for (const sx of [-1, 1])
      put(acc, baseBox(t, Hc + 0.1, 0.3), [sx * (W / 2 + t / 2 - 0.05), y0 - 0.05, 0], CHROME, {
        aoAmt: 0,
      });
    // lit letters
    addWord(acc, word, V(0, cy, 0.16), W - 0.5, Hc - 0.38, 0.1, letters);
  } else {
    // far: the word as one lit slab, the frame as one chrome back plate
    put(acc, baseBox(W + 0.1, Hc + 0.1, 0.1), [0, y0 - 0.05, -0.04], CHROME, { aoAmt: 0 });
    put(acc, baseBox(W * 0.62, 0.3, 0.1), [0, cy - 0.15, 0.16], letters, lit);
  }
  // bulb border (far: the four corners only)
  const step = hi ? 0.18 : 99;
  const rim = (len: number, fn: (s: number) => THREE.Vector3): THREE.Vector3[] => {
    const n = Math.max(1, Math.round(len / step));
    const at: THREE.Vector3[] = [];
    for (let k = 0; k < n; k++) {
      at.push(fn(k / n));
      bulb(acc, at[k], hi ? 0.058 : 0.1, k % 2 ? CREAM : AMBER);
    }
    return at;
  };
  const bx = W / 2 - 0.02;
  const by0 = y0 + 0.03;
  const by1 = y0 + Hc - 0.03;
  const bz = 0.2;
  const bottom = rim(W, (s) => V(-bx + s * 2 * bx, by0, bz));
  const top = rim(W, (s) => V(bx - s * 2 * bx, by1, bz));
  const left = rim(Hc, (s) => V(-bx, by1 - s * (by1 - by0), bz));
  const right = rim(Hc, (s) => V(bx, by0 + s * (by1 - by0), bz));
  // LED chase (TASK-440) runs round the border: bottom → right → top → left (near LOD only)
  const chase = hi
    ? [...bottom, ...right, ...top, ...left].map((c) =>
        acc.xf ? c.clone().applyMatrix4(acc.xf) : c,
      )
    : [];
  // crest: emblem on a short mast, side bulbs
  put(acc, cylB(0.07, 0.07, 0.3, hi ? 5 : 4), [0, y0 + Hc, 0], CHROME, { aoAmt: 0 });
  const crest: GlyphId = word === 'LIVE' ? 'megaphone' : 'star';
  const crestColor = word === 'LIVE' ? K.redLamp : GOLD;
  if (hi)
    addGlyph(acc, crest, V(0, y0 + Hc + 0.44, 0.02), {
      size: 0.52,
      color: crestColor,
      depth: 0.12,
      emissive: 1,
    });
  else bulb(acc, V(0, y0 + Hc + 0.44, 0.02), 0.22, crestColor);
  if (hi && word === 'LIVE') {
    put(acc, new THREE.IcosahedronGeometry(0.1, 0), [-0.85, y0 + Hc + 0.12, 0.16], K.redLamp, lit);
    bulb(acc, V(0.85, y0 + Hc + 0.12, 0.16), 0.08, CREAM);
  }
  if (hi && word !== 'LIVE')
    for (const sx of [-1, 1]) bulb(acc, V(sx * 0.8, y0 + Hc + 0.12, 0.16), 0.08, AMBER);
  const g = finish(acc, rng);
  if (hi) tagMarquee(g, chase, 0.08);
  return g;
}

/* ---------------------------------- balloonMast ---------------------------------- */

function balloonMast({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.02);
  const r = rng.fork('mast');
  const top = 1.7;
  // stone plinth, striped mast
  put(acc, cylB(0.42, 0.34, 0.2, hi ? 9 : 6), [0, 0, 0], ROCK[0], { aoAmt: 0.2 });
  const bands = hi ? 5 : 1;
  for (let i = 0; i < bands; i++)
    put(
      acc,
      cylB(0.12 - i * 0.012, 0.12 - (i + 1) * 0.012, (top - 0.2) / bands, 8),
      [0, 0.2 + ((top - 0.2) / bands) * i, 0],
      i % 2 ? CREAM : RED,
      {
        aoAmt: i === 0 ? 0.2 : 0,
      },
    );
  if (!hi) put(acc, cylB(0.12, 0.06, top - 0.2, 5), [0, 0.2, 0], RED, { aoAmt: 0.1 });
  // mooring ring + cross arm
  put(acc, new THREE.TorusGeometry(0.2, 0.045, 4, hi ? 12 : 7), [0, top - 0.25, 0], GOLD, {
    q: qEuler(Math.PI / 2, 0, 0),
    aoAmt: 0,
  });
  ell(acc, [0, top + 0.05, 0], [0.14, 0.14, 0.14], GOLD, hi ? [8, 5] : [5, 3], { aoAmt: 0 });
  // winch: drum on a small frame by the foot, rope wound on it
  const wz = 0.58;
  if (hi) {
    for (const sx of [-1, 1])
      put(acc, baseBox(0.07, 0.46, 0.34), [sx * 0.24, 0.1, wz], WOOD.logs, { aoAmt: 0.1 });
    put(acc, new THREE.CylinderGeometry(0.15, 0.15, 0.42, 10), [0, 0.38, wz], ROPE, {
      q: qEuler(0, 0, Math.PI / 2),
      aoAmt: 0,
    });
    put(acc, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10), [-0.25, 0.38, wz], DARK, {
      q: qEuler(0, 0, Math.PI / 2),
      aoAmt: 0,
    });
    bar(acc, V(0.24, 0.38, wz), V(0.36, 0.38, wz + 0.2), 0.05, DARK);
    put(acc, cylB(0.05, 0.05, 0.14, 5), [0.36, 0.38, wz + 0.2], WOOD.dark, { aoAmt: 0 });
    // guy ropes to stakes
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.5 + r.range(-0.15, 0.15);
      const foot = V(Math.sin(a) * 1.0, 0, Math.cos(a) * 1.0);
      put(
        acc,
        tubeAlong(ropePoints(V(0, top - 0.5, 0), foot.clone().setY(0.1), 0.05, 4), 0.02, 3),
        [0, 0, 0],
        ROPE,
        { aoAmt: 0 },
      );
      put(acc, baseBox(0.09, 0.22, 0.09), foot, WOOD.dark, { aoAmt: 0 });
    }
    // rope from the winch up to the ring
    put(
      acc,
      tubeAlong(ropePoints(V(0, 0.52, wz), V(0.04, top - 0.3, 0.2), 0.12, 4), 0.022, 3),
      [0, 0, 0],
      ROPE,
      { aoAmt: 0 },
    );
  }
  if (variant === 0) {
    // long red streamer pennant + a bunting pair
    const flag = new THREE.BufferGeometry();
    flag.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0.12, 0, 0, -0.12, 0, 0.85, 0, 0], 3),
    );
    put(acc, flag, [0, top + 0.12, 0], RED, {
      double: true,
      aoAmt: 0,
      ao: () => 1,
      windAbs: (p) => Math.min(1, 0.12 + p.x * 1.1),
    });
    if (hi)
      for (const [i, sx] of [-1, 1].entries()) {
        const g = new THREE.BufferGeometry();
        g.setAttribute(
          'position',
          new THREE.Float32BufferAttribute([0, 0, 0, 0.22, 0, 0, 0.11, -0.28, 0], 3),
        );
        put(acc, g, [sx * 0.2, top - 0.5 - i * 0.2, 0.05], i ? GOLD : SKY, {
          double: true,
          aoAmt: 0,
          ao: () => 1,
          windAbs: 0.2,
        });
      }
  } else {
    // a bunch of tethered balloons bobbing above the ring
    const cols = MEDIA_ROCK.podColors;
    const n = hi ? 7 : 4;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + r.range(-0.2, 0.2);
      const rr = k === 0 ? 0 : 0.2 + r.range(0, 0.06);
      const hgt = 0.45 + (k % 3) * 0.08 + r.range(0, 0.06);
      const base = V(0, top + 0.1, 0);
      const bc = V(Math.cos(a) * rr, top + 0.1 + hgt, Math.sin(a) * rr);
      const wind = 0.25 + 0.1 * (k % 3);
      ell(acc, bc, [0.19, 0.23, 0.19], cols[k % 6], hi ? [9, 7] : [5, 4], {
        aoAmt: 0,
        emissive: 0.15,
        windAbs: wind,
      });
      put(acc, new THREE.ConeGeometry(0.04, 0.08, 4), bc.clone().add(V(0, -0.27, 0)), cols[k % 6], {
        q: qEuler(Math.PI, 0, 0),
        aoAmt: 0,
        windAbs: wind,
      });
      put(acc, tubeAlong([base, bc.clone().add(V(0, -0.28, 0))], 0.014, 3), [0, 0, 0], CREAM, {
        aoAmt: 0,
        windAbs: wind,
      });
    }
  }
  return finish(acc, rng);
}

/* ---------------------------------- selfieSpot ---------------------------------- */

/** Heart outline (w wide) for the selfie cut-out; the hole is a smaller copy. */
function heartPath(path: THREE.Path | THREE.Shape, s: number): void {
  path.moveTo(0, -0.5 * s);
  path.bezierCurveTo(-0.9 * s, 0.05 * s, -0.55 * s, 0.6 * s, 0, 0.28 * s);
  path.bezierCurveTo(0.55 * s, 0.6 * s, 0.9 * s, 0.05 * s, 0, -0.5 * s);
}

function selfieSpot({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.02);
  const W = 2.3;
  const D = 1.8;
  // stone footing + plank deck
  put(acc, baseBox(W + 0.2, 0.12, D + 0.2), [0, 0, 0], ROCK[0], { aoAmt: 0.2 });
  const boards = hi ? 6 : 1;
  for (let i = 0; i < boards; i++) {
    const bw = D / boards;
    put(
      acc,
      baseBox(W, 0.14, bw - (hi ? 0.02 : 0)),
      [0, 0.12, -D / 2 + bw * (i + 0.5)],
      i % 2 ? WOOD.planks : WOOD.dock,
      { aoAmt: 0.08 },
    );
  }
  const deckY = 0.26;
  // steps at the front
  put(acc, baseBox(1.0, 0.13, 0.4), [0, 0, D / 2 + 0.3], ROCK[0], { aoAmt: 0.15 });
  // railing on the back and both sides, front open
  const posts: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    posts.push(
      V(sx * (W / 2 - 0.08), deckY, -D / 2 + 0.08),
      V(sx * (W / 2 - 0.08), deckY, D / 2 - 0.08),
    );
  }
  posts.push(V(0, deckY, -D / 2 + 0.08));
  posts.forEach((p, i) => {
    put(acc, cylB(0.055, 0.055, 0.8, hi ? 6 : 3), p, i % 2 ? CREAM : RED, { aoAmt: 0.1 });
    if (hi) ell(acc, p.clone().setY(deckY + 0.85), [0.08, 0.08, 0.08], GOLD, [6, 4], { aoAmt: 0 });
  });
  const rail = (a: THREE.Vector3, b: THREE.Vector3): void => {
    bar(acc, a.clone().setY(deckY + 0.72), b.clone().setY(deckY + 0.72), 0.07, CHROME);
    if (hi) bar(acc, a.clone().setY(deckY + 0.4), b.clone().setY(deckY + 0.4), 0.05, CHROME);
  };
  rail(posts[0], posts[4]);
  rail(posts[4], posts[2]);
  rail(posts[0], posts[1]);
  rail(posts[2], posts[3]);
  if (hi) {
    // string lights along the top rails
    for (const [a, b] of [
      [posts[0], posts[1]],
      [posts[2], posts[3]],
      [posts[0], posts[4]],
      [posts[4], posts[2]],
    ] as const)
      for (let k = 1; k < 4; k++)
        bulb(
          acc,
          a
            .clone()
            .lerp(b, k / 4)
            .setY(deckY + 0.78),
          0.05,
          k % 2 ? CREAM : AMBER,
        );
  }
  // photo frame at the back
  const fy = deckY + 0.95;
  const fz = -D / 2 + 0.3;
  if (variant === 0) {
    // arch frame: two posts + round-top ring
    for (const sx of [-1, 1])
      put(acc, baseBox(0.14, 1.25, 0.14), [sx * 0.62, deckY, fz], RED, { aoAmt: 0.1 });
    put(
      acc,
      new THREE.TorusGeometry(0.69, 0.07, hi ? 5 : 3, hi ? 14 : 5, Math.PI),
      [0, deckY + 1.25, fz],
      RED,
      { aoAmt: 0 },
    );
    if (hi)
      put(acc, new THREE.TorusGeometry(0.55, 0.035, 4, 12, Math.PI), [0, deckY + 1.25, fz], GOLD, {
        aoAmt: 0,
      });
    addGlyph(acc, 'star', V(0, fy + 0.85, fz + 0.02), {
      size: 0.3,
      color: GOLD,
      depth: 0.12,
      emissive: 1,
    });
  } else {
    // heart cut-out board on two legs
    const sh = new THREE.Shape();
    heartPath(sh, 1.9);
    const hole = new THREE.Path();
    heartPath(hole, 1.25);
    sh.holes.push(hole);
    put(
      acc,
      new THREE.ExtrudeGeometry(sh, {
        depth: 0.14,
        bevelEnabled: false,
        curveSegments: hi ? 8 : 4,
      }),
      [0, fy + 0.58, fz - 0.07],
      PINK,
      { aoAmt: 0 },
    );
    for (const sx of [-1, 1])
      put(acc, baseBox(0.1, 0.92, 0.12), [sx * 0.3, deckY, fz - 0.02], WOOD.logs, { aoAmt: 0.1 });
  }
  // gold shoe-print decals on the deck, and a phone on a tripod
  if (hi) {
    for (const sx of [-1, 1])
      ell(acc, [sx * 0.2, deckY + 0.01, 0.3], [0.1, 0.012, 0.17], GOLD, [8, 3], { aoAmt: 0 });
    const tp = V(0.85, deckY, 0.55);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.4;
      bar(
        acc,
        tp.clone().add(V(Math.sin(a) * 0.22, 0, Math.cos(a) * 0.22)),
        tp.clone().setY(deckY + 0.62),
        0.03,
        DARK,
      );
    }
    put(acc, baseBox(0.12, 0.22, 0.04), [0.85, deckY + 0.62, 0.55], DARK, {
      q: qEuler(0, -0.5, 0),
      aoAmt: 0,
    });
    put(acc, baseBox(0.09, 0.17, 0.02), [0.83, deckY + 0.64, 0.57], K.sky, {
      q: qEuler(0, -0.5, 0),
      aoAmt: 0,
      emissive: 0.4,
    });
  }
  return finish(acc, rng);
}

/* ---------------------------------- prizeBooth ---------------------------------- */

const PLUSH = [PINK, FLOWERS[1], LILAC, MINT, SKY, FLOWERS[2]] as const;

/** Plush ball with ears and two dot eyes, facing +z. */
function plush(acc: Acc, at: THREE.Vector3, s: number, color: string, hi: boolean): void {
  ell(acc, at, [s, s * 0.92, s * 0.9], color, hi ? [7, 5] : [4, 3], { aoAmt: 0.1 });
  if (!hi) return;
  for (const sx of [-1, 1]) {
    ell(
      acc,
      at.clone().add(V(sx * s * 0.62, s * 0.78, 0)),
      [s * 0.28, s * 0.28, s * 0.2],
      color,
      [5, 3],
      { aoAmt: 0 },
    );
    put(
      acc,
      new THREE.OctahedronGeometry(s * 0.13, 0),
      at.clone().add(V(sx * s * 0.34, s * 0.12, s * 0.84)),
      DARK,
      { aoAmt: 0 },
    );
  }
}

function prizeBooth({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.02);
  const r = rng.fork('plush');
  const B = MEDIA_ROCK.booth;
  const roofY = 1.85;
  // platform, back wall, counter
  put(acc, baseBox(B.w + 0.3, 0.1, B.d + 0.3), [0, 0, 0], '#E9D3B3', { aoAmt: 0.15 });
  put(acc, baseBox(B.w, roofY - 0.1, 0.14), [0, 0.1, -B.d / 2 + 0.07], K.blush, { aoAmt: 0.15 });
  put(acc, baseBox(B.w, B.h, 0.45), [0, 0.1, B.d / 2 - 0.25], CREAM, { aoAmt: 0.15 });
  put(acc, baseBox(B.w + 0.1, 0.1, 0.55), [0, 0.1 + B.h, B.d / 2 - 0.25], RED, { aoAmt: 0 });
  for (const sx of [-1, 1])
    put(
      acc,
      baseBox(0.12, roofY - 0.1, 0.12),
      [sx * (B.w / 2 - 0.06), 0.1, B.d / 2 - 0.06],
      sx < 0 ? RED : CREAM,
      {
        aoAmt: 0.05,
      },
    );
  for (const sx of [-1, 1])
    put(
      acc,
      baseBox(0.12, roofY - 0.1, 0.12),
      [sx * (B.w / 2 - 0.06), 0.1, -B.d / 2 + 0.06],
      sx < 0 ? CREAM : RED,
      {
        aoAmt: 0.05,
      },
    );
  // striped awning sloping forward
  const n = hi ? 8 : 1;
  const aw = (B.w + 0.3) / n;
  for (let i = 0; i < n; i++)
    put(
      acc,
      baseBox(aw, 0.07, B.d + 0.35),
      [-(B.w + 0.3) / 2 + aw * (i + 0.5), roofY, 0.2],
      hi && i % 2 ? CREAM : RED,
      {
        q: qEuler(0.16, 0, 0),
        aoAmt: 0,
      },
    );
  // shelves with plush toys
  const shelfZ = -B.d / 2 + 0.35;
  for (const [i, y] of [0.85, 1.4].entries()) {
    put(acc, baseBox(B.w - 0.25, 0.06, 0.4), [0, y, shelfZ], WOOD.dark, { aoAmt: 0 });
    if (variant === 1 && i === 1) continue;
    const cnt = hi ? 3 : 2;
    for (let k = 0; k < cnt; k++)
      plush(
        acc,
        V(-0.75 + k * (1.5 / (cnt - 1)), y + 0.2, shelfZ),
        0.2,
        PLUSH[(k + i * 2) % 6],
        hi,
      );
  }
  // counter: ring-toss bottles and a stack of small prizes
  if (hi) {
    for (let k = 0; k < 5; k++)
      put(
        acc,
        cylB(0.05, 0.035, 0.22, 6),
        [
          0.35 + (k % 3) * 0.18 + (k > 2 ? 0.09 : 0),
          0.2 + B.h,
          B.d / 2 - 0.15 - (k > 2 ? 0.14 : 0),
        ],
        k % 2 ? MINT : SKY,
        { aoAmt: 0 },
      );
    put(acc, new THREE.TorusGeometry(0.1, 0.025, 4, 9), [0.6, 0.32 + B.h, B.d / 2 - 0.15], GOLD, {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0,
    });
  }
  // a row of plush balls on the counter
  for (let k = 0; k < (hi ? 5 : 3); k++)
    plush(
      acc,
      V(
        -0.7 + (k % 3) * 0.27,
        0.1 + B.h + 0.17 + (k > 2 ? 0.28 : 0),
        B.d / 2 - 0.3 + r.range(-0.03, 0.03),
      ),
      0.17,
      PLUSH[(k + 1) % 6],
      hi,
    );
  // sign: a gold star board above the awning (left), ringed with bulbs, on two posts
  const sx0 = -0.4;
  const sy = roofY + 0.33;
  for (const sx of [-1, 1])
    put(acc, baseBox(0.07, 0.4, 0.07), [sx0 + sx * 0.28, roofY + 0.04, -0.2], CHROME, { aoAmt: 0 });
  addGlyph(acc, 'star', V(sx0, sy + 0.18, -0.08), {
    size: 0.62,
    color: GOLD,
    depth: 0.14,
    emissive: 1,
  });
  if (hi)
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      bulb(
        acc,
        V(sx0 + Math.cos(a) * 0.46, sy + 0.18 + Math.sin(a) * 0.46 * 0.7, -0.02),
        0.05,
        k % 2 ? CREAM : AMBER,
      );
    }
  // roof-top display so the plush read from above: v0 a crab + two bears, v1 a giant duck
  const rx = 0.6;
  const ry = roofY + 0.06;
  if (variant === 0) {
    ell(acc, [rx, ry + 0.22, 0], [0.3, 0.22, 0.24], RED, hi ? [8, 6] : [4, 3], { aoAmt: 0.05 });
    if (hi)
      for (const sx of [-1, 1]) {
        ell(acc, [rx + sx * 0.36, ry + 0.4, 0.02], [0.13, 0.16, 0.12], RED, [6, 4], { aoAmt: 0 });
        ell(acc, [rx + sx * 0.12, ry + 0.5, 0.1], [0.06, 0.06, 0.06], CREAM, [5, 4], { aoAmt: 0 });
      }
    plush(acc, V(rx + 0.02, ry + 0.64, -0.02), 0.17, PLUSH[0], hi);
    plush(acc, V(rx - 0.38, ry + 0.17, 0.05), 0.17, PLUSH[2], hi);
  } else {
    const at = V(rx, ry, 0);
    ell(acc, at.clone().add(V(0, 0.22, 0)), [0.3, 0.22, 0.26], FLOWERS[1], hi ? [9, 6] : [5, 4], {
      aoAmt: 0.1,
    });
    ell(
      acc,
      at.clone().add(V(0, 0.52, 0.1)),
      [0.19, 0.17, 0.17],
      FLOWERS[1],
      hi ? [8, 6] : [5, 4],
      {
        aoAmt: 0.05,
      },
    );
    ell(acc, at.clone().add(V(0, 0.5, 0.28)), [0.12, 0.04, 0.1], FLOWERS[4], hi ? [6, 4] : [4, 3], {
      aoAmt: 0,
    });
    if (hi)
      for (const sx of [-1, 1])
        put(
          acc,
          new THREE.OctahedronGeometry(0.03, 0),
          at.clone().add(V(sx * 0.09, 0.58, 0.24)),
          DARK,
          {
            aoAmt: 0,
          },
        );
  }
  return finish(acc, rng);
}

/* --------------------------------- searchlightPair --------------------------------- */

/** Two drum projectors; the `beams` hook lists each lens origin + direction for the later beam mover. */
function searchlightPair({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.015);
  const beams: Array<{ origin: number[]; dir: number[] }> = [];
  const pivotY = 1.3;
  const lean = variant === 0 ? 0.38 : 0.06;
  for (const sx of [-1, 1]) {
    const bx = sx * 1.05;
    // base plate, pedestal, yoke plates
    put(acc, cylB(0.4, 0.36, 0.12, hi ? 10 : 5), [bx, 0, 0], ROCK[1], { aoAmt: 0.2 });
    put(acc, cylB(0.17, 0.2, pivotY - 0.15, hi ? 8 : 4), [bx, 0.1, 0], CHROME, { aoAmt: 0.15 });
    for (const sz of hi ? [-1, 1] : [1]) {
      put(acc, baseBox(0.34, 0.5, hi ? 0.07 : 0.14), [bx, pivotY - 0.5, sz * 0.36], RED, {
        aoAmt: 0.05,
      });
      if (hi)
        put(acc, new THREE.CylinderGeometry(0.07, 0.07, 0.09, 6), [bx, pivotY, sz * 0.38], GOLD, {
          q: qEuler(Math.PI / 2, 0, 0),
          aoAmt: 0,
        });
    }
    const dir = V(sx * Math.sin(lean), Math.cos(lean), 0).normalize();
    const p = V(bx, pivotY, 0);
    // drum, red band, chrome rim, lit lens (far: one drum + lens)
    if (hi) {
      cylDir(acc, p.clone().addScaledVector(dir, -0.38), dir, 0.2, 0.3, 0.45, 12, DARK, {
        aoAmt: 0.05,
      });
      cylDir(acc, p.clone().addScaledVector(dir, 0.07), dir, 0.3, 0.3, 0.4, 12, CHROME, {
        aoAmt: 0.05,
      });
      cylDir(acc, p.clone().addScaledVector(dir, 0.25), dir, 0.305, 0.305, 0.1, 12, RED, {
        aoAmt: 0,
      });
      cylDir(acc, p.clone().addScaledVector(dir, 0.47), dir, 0.34, 0.34, 0.09, 12, CHROME, {
        aoAmt: 0,
      });
    } else {
      cylDir(acc, p.clone().addScaledVector(dir, -0.38), dir, 0.22, 0.32, 0.9, 5, CHROME, {
        aoAmt: 0.05,
      });
    }
    cylDir(
      acc,
      p.clone().addScaledVector(dir, 0.54),
      dir,
      0.27,
      0.27,
      0.05,
      hi ? 12 : 5,
      K.warm,
      lit,
    );
    if (hi) {
      cylDir(acc, p.clone().addScaledVector(dir, -0.45), dir, 0.1, 0.1, 0.12, 6, GOLD, {
        aoAmt: 0,
      });
      // two handles
      for (const sz of [-1, 1])
        bar(
          acc,
          p
            .clone()
            .addScaledVector(dir, -0.1)
            .add(V(0, 0, sz * 0.3)),
          p
            .clone()
            .addScaledVector(dir, -0.28)
            .add(V(0, 0, sz * 0.42)),
          0.04,
          DARK,
        );
    }
    beams.push({
      origin: p.clone().addScaledVector(dir, 0.52).toArray(),
      dir: dir.toArray(),
    });
  }
  // generator between them, cables to both bases
  put(acc, baseBox(0.8, 0.55, 0.55), [0, 0.04, -0.05], RED_DEEP, { aoAmt: 0.15 });
  put(acc, baseBox(0.84, 0.08, 0.6), [0, 0.59, -0.05], CHROME, { aoAmt: 0 });
  if (hi) {
    for (const k of [-1, 0, 1])
      put(acc, baseBox(0.05, 0.3, 0.02), [k * 0.2, 0.18, 0.24], DARK, { aoAmt: 0 });
    put(acc, cylB(0.05, 0.05, 0.16, 6), [0.28, 0.67, -0.05], DARK, { aoAmt: 0 });
    for (const sx of [-1, 1])
      put(
        acc,
        tubeAlong(ropePoints(V(sx * 0.42, 0.3, 0.22), V(sx * 0.82, 0.1, 0.22), 0.1, 4), 0.025, 3),
        [0, 0, 0],
        DARK,
        { aoAmt: 0 },
      );
  }
  const g = finish(acc, rng);
  return addHook(g, 'beams', { lights: beams });
}

/* ---------------------------------- megaphoneStand ---------------------------------- */

function megaphoneStand({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.03);
  const base = variant === 0 ? 0.85 : 0.5;
  if (!hi) {
    // far: one stand column + one horn frustum
    put(
      acc,
      cylB(variant === 0 ? 0.3 : 0.26, 0.08, base, 4),
      [0, 0, 0],
      variant === 0 ? WOOD.logs : RED,
      {
        aoAmt: 0.15,
      },
    );
    cylDir(acc, V(0, base + 0.06, -0.12), V(0, 0.45, 0.89), 0.1, 0.3, 0.65, 5, RED);
    return finish(acc, rng);
  }
  if (variant === 0) {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.3;
      const foot = V(Math.sin(a) * 0.36, 0, Math.cos(a) * 0.36);
      bar(acc, foot, V(0, base, 0), 0.06, WOOD.logs);
      put(acc, cylB(0.07, 0.07, 0.04, 6), foot, DARK, { aoAmt: 0 });
    }
    put(acc, cylB(0.09, 0.09, 0.08, 8), [0, base - 0.04, 0], DARK, { aoAmt: 0 });
  } else {
    put(acc, cylB(0.26, 0.24, base, 10), [0, 0, 0], RED, { aoAmt: 0.15 });
    for (const y of [0.12, 0.36])
      put(acc, cylB(0.27, 0.27, 0.07, 10), [0, y, 0], CREAM, { aoAmt: 0 });
    addGlyph(acc, 'star', V(0, 0.28, 0.27), { size: 0.26, color: GOLD, depth: 0.12 });
  }
  // horn tilted up and toward +z: neck, grip, four stripes of the cone, gold rim
  const dir = V(0, 0.45, 0.89).normalize();
  const p = V(0, base + 0.06, -0.12);
  cylDir(acc, p, dir, 0.08, 0.1, 0.22, 8, DARK);
  bar(acc, p.clone().addScaledVector(dir, 0.08), p.clone().add(V(0, -0.2, -0.1)), 0.06, DARK);
  const bands = [CREAM, RED, CREAM, RED];
  bands.forEach((c, i) => {
    const r0 = 0.1 + i * 0.05;
    cylDir(acc, p.clone().addScaledVector(dir, 0.2 + i * 0.1), dir, r0, r0 + 0.05, 0.1, 12, c);
  });
  cylDir(acc, p.clone().addScaledVector(dir, 0.6), dir, 0.3, 0.3, 0.07, 12, GOLD, { aoAmt: 0 });
  cylDir(acc, p.clone().addScaledVector(dir, 0.665), dir, 0.24, 0.24, 0.02, 12, DARK, { aoAmt: 0 });
  return finish(acc, rng);
}

/* ---------------------------------- mascotStatue ---------------------------------- */

/** 2.7 u foam-suit crab on a plinth: lumpy body, eye stalks, one waving claw, one holding a megaphone. */
function mascotStatue({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.012);
  const noise = createNoise(rng.fork('foam'));
  const seg = (a: number, b: number): [number, number] =>
    hi ? [Math.round(a * 0.75), Math.round(b * 0.75)] : [Math.ceil(a / 3), Math.ceil(b / 3)];
  // plinth: stone drum with a red band, gold rim and a star plaque
  put(acc, cylB(1.2, 1.1, 0.3, hi ? 16 : 8), [0, 0, 0], ROCK[0], { aoAmt: 0.2 });
  put(acc, cylB(1.12, 1.12, 0.08, hi ? 16 : 8), [0, 0.18, 0], RED, { aoAmt: 0 });
  put(acc, cylB(1.22, 1.22, 0.05, hi ? 16 : 8), [0, 0.3, 0], GOLD, { aoAmt: 0 });
  // body (foam lumps), belly patch, star badge
  put(acc, blob(1, hi ? 2 : 1, noise, 0.05, 1.1, 2), [0, 1.2, 0], RED, {
    s: [0.88, 0.82, 0.68],
    aoAmt: 0.12,
  });
  ell(acc, [0, 1.1, 0.34], [0.58, 0.56, 0.4], CREAM, seg(14, 10), { aoAmt: 0 });
  addGlyph(acc, 'star', V(0, 1.02, 0.745), { size: 0.5, color: GOLD, depth: 0.1, emissive: 0.3 });
  // legs: three stubby pairs, each a thigh and a foot
  for (const sx of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const z = (k - 1) * 0.3;
      const hip = V(sx * (0.62 + (k === 1 ? 0.08 : 0)), 0.62, z * 0.9);
      const foot = V(sx * (0.92 + (k === 1 ? 0.08 : 0)), 0.34, z * 1.1);
      bar(acc, hip, foot, 0.17, RED_DEEP);
      if (hi)
        ell(acc, foot.clone().add(V(0, -0.02, 0.04)), [0.17, 0.08, 0.2], RED_DEEP, [8, 5], {
          aoAmt: 0,
        });
    }
  // eye stalks + eyeballs + smile + cheeks
  for (const sx of [-1, 1]) {
    const a = V(sx * 0.26, 1.85, 0.12);
    const b = V(sx * 0.4, 2.2, 0.18);
    bar(acc, a, b, 0.14, RED);
    ell(acc, b.clone().add(V(0, 0.16, 0.02)), [0.24, 0.25, 0.24], CREAM, seg(12, 9), {
      aoAmt: 0.05,
    });
    ell(acc, b.clone().add(V(sx * -0.02, 0.17, 0.2)), [0.11, 0.12, 0.08], DARK, seg(8, 6), {
      aoAmt: 0,
    });
    if (hi) ell(acc, V(sx * 0.4, 1.62, 0.6), [0.14, 0.1, 0.05], PINK, [8, 5], { aoAmt: 0 });
  }
  if (hi)
    put(acc, new THREE.TorusGeometry(0.2, 0.04, 5, 10, Math.PI), [0, 1.55, 0.66], DARK, {
      q: qEuler(0, 0, Math.PI),
      aoAmt: 0,
    });
  // claws: pincer = main lobe + two tips, with a notch between
  const claw = (c: THREE.Vector3, tilt: number, s: number): void => {
    const q = qEuler(0, 0, tilt);
    const P = (x: number, y: number, z: number): THREE.Vector3 =>
      V(x * s, y * s, z * s)
        .applyQuaternion(q)
        .add(c);
    ell(acc, P(0, 0, 0), [0.4 * s, 0.34 * s, 0.3 * s], RED, seg(12, 9), { q, aoAmt: 0.1 });
    for (const t of [-1, 1])
      ell(acc, P(t * 0.2, 0.38, 0), [0.17 * s, 0.3 * s, 0.22 * s], RED, seg(8, 6), {
        q: q.clone().multiply(qEuler(0, 0, t * -0.25)),
        aoAmt: 0,
      });
    if (hi)
      ell(acc, P(0, 0.34, 0), [0.07 * s, 0.1 * s, 0.2 * s], RED_DEEP, [5, 4], { q, aoAmt: 0 });
  };
  // waving arm (screen-left, -x): shoulder to elbow to claw
  const sL = V(-0.78, 1.35, 0.02);
  const eL = V(-1.25, 1.75, 0.1);
  bar(acc, sL, eL, 0.2, RED);
  ell(acc, eL, [0.16, 0.16, 0.16], RED, seg(8, 6), { aoAmt: 0 });
  bar(acc, eL, V(-1.4, 1.95, 0.1), 0.18, RED);
  claw(V(-1.46, 2.05, 0.1), 0.3, 1.0);
  // megaphone arm (+x): claw forward at belly height holding a horn aimed up and out
  const sR = V(0.78, 1.25, 0.05);
  const eR = V(1.2, 1.25, 0.35);
  bar(acc, sR, eR, 0.2, RED);
  ell(acc, eR, [0.16, 0.16, 0.16], RED, seg(8, 6), { aoAmt: 0 });
  claw(V(1.32, 1.5, 0.5), -0.15, 0.85);
  const hd = V(0.35, 0.55, 0.76).normalize();
  const hp = V(1.18, 1.45, 0.5);
  cylDir(acc, hp, hd, 0.07, 0.1, 0.2, 7, DARK);
  cylDir(acc, hp.clone().addScaledVector(hd, 0.18), hd, 0.1, 0.22, 0.24, hi ? 12 : 7, GOLD);
  cylDir(acc, hp.clone().addScaledVector(hd, 0.42), hd, 0.22, 0.32, 0.24, hi ? 12 : 7, CREAM);
  cylDir(acc, hp.clone().addScaledVector(hd, 0.66), hd, 0.32, 0.32, 0.07, hi ? 12 : 7, RED_DEEP, {
    aoAmt: 0,
  });
  cylDir(acc, hp.clone().addScaledVector(hd, 0.725), hd, 0.25, 0.25, 0.02, hi ? 12 : 7, DARK, {
    aoAmt: 0,
  });
  // the little red visor cap on the crown (the residents' hat), between the eye stalks
  if (hi) {
    ell(acc, [0, 1.98, 0.05], [0.3, 0.12, 0.3], RED_DEEP, [10, 5], { aoAmt: 0 });
    put(acc, baseBox(0.36, 0.05, 0.3), [0, 1.9, 0.3], RED_DEEP, {
      q: qEuler(0.25, 0, 0),
      aoAmt: 0,
    });
  }
  return finish(acc, rng);
}

/* --------------------------------- registry --------------------------------- */

export const MARKETING_CULTURE_GEO: readonly PropGeoDef[] = [
  {
    id: 'mascotStatue',
    variants: 1,
    build: mascotStatue,
    footprint: 1.6,
    height: 2.78,
    windy: false,
  },
  {
    id: 'marqueeSign',
    variants: 3,
    build: marqueeSign,
    footprint: 1.3,
    height: 2.7,
    windy: false,
    lod1Of: { 1: 0, 2: 0 },
  },
  {
    id: 'popcornCart',
    variants: 2,
    build: popcornCart,
    footprint: 0.95,
    height: 2.5,
    windy: true,
    lod1Of: { 1: 0 },
  },
  {
    id: 'balloonMast',
    variants: 2,
    build: balloonMast,
    footprint: 1.0,
    height: 2.3,
    heights: [1.9, 2.7],
    windy: true,
  },
  {
    id: 'confettiCannon',
    variants: 2,
    build: confettiCannon,
    footprint: 0.8,
    height: 1.8,
    heights: [1.4, 2.1],
    windy: true,
  },
  {
    id: 'searchlightPair',
    variants: 2,
    build: searchlightPair,
    footprint: 1.5,
    height: 1.95,
    windy: false,
  },
  {
    id: 'prizeBooth',
    variants: 2,
    build: prizeBooth,
    footprint: 1.4,
    height: 2.75,
    windy: false,
    lod1Of: { 1: 0 },
  },
  {
    id: 'selfieSpot',
    variants: 2,
    build: selfieSpot,
    footprint: 1.5,
    height: 2.3,
    heights: [2.25, 2.45],
    windy: false,
  },
  {
    id: 'posterRoll',
    variants: 3,
    build: posterRoll,
    footprint: 0.5,
    height: 1.0,
    heights: [1.2, 0.5, 1.0],
    windy: false,
  },
  {
    id: 'megaphoneStand',
    variants: 2,
    build: megaphoneStand,
    footprint: 0.45,
    height: 1.3,
    heights: [1.45, 1.1],
    windy: false,
  },
];
