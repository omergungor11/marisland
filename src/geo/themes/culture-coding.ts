/**
 * Coding island culture kit "Rüzgâr Bahçeleri / Wind Gardens" (M19 TASK-411, ISLAND_CULTURES §2.2).
 * Geometry only (placement is TASK-421); defs: content/props-themes/coding.ts, ledger:
 * content/cultures/coding.ts.
 *
 *   rubberDuck   T3  desk duck, 3 variants (plain / headphones / party hat), noShadow
 *   kite         T2  pole + line + 4-panel kite + bow tail, 3 colour sets, windy (tail flutters)
 *   pergolaDesk  T2  `< </> >` pergola, awning, desk, laptop + duck, two chairs, fairy bulbs
 *   hammock      T2  two posts + striped sausage hammock (sleeper+laptop / book)
 *   kiteRack     T2  roofed rack with 6 kites (variant 1: one slot empty = the stuck kite)
 *   giantDuck    T1  3 u inflatable pool duck with sunglasses, the island's one tier-1 def
 *   whiteboardA  T3  easel whiteboard with doodles (flow / bug + ? / </> + tick), noShadow
 *   mugStack     T3  snack crate with mugs, noShadow
 * plus two variants of existing coding defs (their geometry lives in coding.ts, helpers here):
 *   hedge v2 `bracketHedge`   a clipped hedge in the shape of `{`
 *   windTurbine v3 `windChimeTower`   hero turbine with a hexagon chime pagoda round its foot
 *
 * All colours come from palette tables (content/palette.ts, CODING_COLORS); every part is built
 * from primitives and vertex-coloured; all pivots on the ground; 1 u = 1 m.
 */
import * as THREE from 'three';
import { EMISSIVE, FLOWERS, GRASS, ROCK, ROOFS, WALLS, WOOD } from '../../content/palette.ts';
import { CODING_COLORS as K } from '../../content/props-themes/coding.ts';
import { Acc, col, qEuler } from '../kit.ts';
import {
  TAU,
  V,
  V2,
  baseBox,
  bevBox,
  cylB,
  jitterAcc,
  put,
  ropePoints,
  tubeAlong,
} from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { addGlyph } from './glyphs.ts';

const CREAM = WALLS[1];
const DUCK = FLOWERS[1];
const DUCK_DEEP = ROOFS[3];
const BEAK = FLOWERS[4];
const BLUE = K.accent;
const BLUE_DEEP = K.accentDeep;
const SKY = ROOFS[5];
const TEAL = ROOFS[2];
const BRASS = '#E0B050';

const finish = (acc: Acc, rng: BuildOpts['rng'], windy = false): THREE.BufferGeometry =>
  acc.finish(rng, windy, true);

const sphere = (w: number, h: number): THREE.SphereGeometry => new THREE.SphereGeometry(1, w, h);

/** Ellipsoid centred on `at` with radii `r`. */
function ell(
  acc: Acc,
  at: THREE.Vector3 | [number, number, number],
  r: [number, number, number],
  color: THREE.Color | string | ((p: THREE.Vector3) => THREE.Color),
  seg: [number, number],
  o: { q?: THREE.Quaternion; aoAmt?: number; noJitter?: boolean; emissive?: number } = {},
): void {
  put(acc, sphere(seg[0], seg[1]), at, color as string, { s: r, aoAmt: 0.1, ...o });
}

/* ---------------------------------- ducks ---------------------------------- */

type Hat = 'none' | 'party' | 'phones' | 'shades';

interface DuckOpts {
  at: THREE.Vector3;
  /** Uniform scale of the 1.45 u tall unit duck. */
  s: number;
  yaw: number;
  hi: boolean;
  seg: [number, number];
  hat: Hat;
  valve?: boolean;
}

/** Unit rubber duck (beak toward +z, feet on y = 0), scaled and yawed about `at`. */
function addDuck(acc: Acc, o: DuckOpts): void {
  const { s, hi, seg } = o;
  const qy = qEuler(0, o.yaw, 0);
  const P = (x: number, y: number, z: number): THREE.Vector3 =>
    V(x * s, y * s, z * s)
      .applyQuaternion(qy)
      .add(o.at);
  const R = (x: number, y: number, z: number): [number, number, number] => [x * s, y * s, z * s];
  const belly = col(WALLS[3]);
  const yel = col(DUCK);
  const body = (p: THREE.Vector3): THREE.Color => {
    const t = Math.min(1, Math.max(0, ((p.y - o.at.y) / s - 0.05) / 0.5));
    return belly.clone().lerp(yel, t * t * (3 - 2 * t));
  };
  ell(acc, P(0, 0.42, 0), R(0.55, 0.42, 0.72), body, seg, { q: qy });
  ell(acc, P(0, 0.72, -0.66), R(0.15, 0.13, 0.36), DUCK, hi ? [8, 5] : [5, 3], {
    q: qy.clone().multiply(qEuler(1.0, 0, 0)),
  });
  ell(acc, P(0, 0.9, 0.34), R(0.3, 0.36, 0.3), DUCK, hi ? [9, 6] : [5, 3], { q: qy });
  ell(acc, P(0, 1.1, 0.42), R(0.36, 0.34, 0.36), DUCK, seg, { q: qy });
  ell(acc, P(0, 1.03, 0.8), R(0.22, 0.075, 0.2), BEAK, hi ? [8, 4] : [5, 3], {
    q: qy,
    aoAmt: 0,
  });
  if (hi) {
    for (const sx of [-1, 1]) {
      ell(acc, P(sx * 0.53, 0.52, -0.02), R(0.1, 0.23, 0.34), DUCK_DEEP, [8, 5], {
        q: qy.clone().multiply(qEuler(0, 0, sx * 0.3)),
      });
      if (o.hat !== 'shades')
        ell(acc, P(sx * 0.18, 1.19, 0.68), R(0.06, 0.075, 0.05), K.dark, [6, 4], {
          q: qy,
          aoAmt: 0,
        });
    }
  }
  if (o.valve)
    put(acc, cylB(0.1 * s, 0.1 * s, 0.07 * s, 7), P(0, 0.8, -0.25), BEAK, {
      q: qy.clone().multiply(qEuler(-0.4, 0, 0)),
      aoAmt: 0,
    });
  if (!hi) return;
  switch (o.hat) {
    case 'party': {
      put(acc, new THREE.ConeGeometry(0.17 * s, 0.42 * s, 7), P(0, 1.62, 0.36), ROOFS[0], {
        q: qy.clone().multiply(qEuler(0.2, 0, 0)),
        aoAmt: 0,
      });
      ell(acc, P(0, 1.84, 0.3), R(0.07, 0.07, 0.07), CREAM, [6, 4], { aoAmt: 0 });
      break;
    }
    case 'phones': {
      put(acc, new THREE.TorusGeometry(0.4 * s, 0.05 * s, 5, 12, Math.PI), P(0, 1.1, 0.42), BLUE, {
        q: qy,
        aoAmt: 0,
      });
      for (const sx of [-1, 1])
        put(acc, cylB(0.13 * s, 0.13 * s, 0.12 * s, 8), P(sx * 0.4, 1.1, 0.42), BLUE_DEEP, {
          q: qy.clone().multiply(qEuler(0, 0, Math.PI / 2)),
          aoAmt: 0,
        });
      break;
    }
    case 'shades': {
      for (const sx of [-1, 1])
        ell(acc, P(sx * 0.17, 1.19, 0.73), R(0.14, 0.11, 0.06), K.dark, [8, 5], {
          q: qy,
          aoAmt: 0,
        });
      put(acc, new THREE.BoxGeometry(0.4 * s, 0.035 * s, 0.045 * s), P(0, 1.21, 0.76), K.dark, {
        q: qy,
        aoAmt: 0,
      });
      for (const sx of [-1, 1])
        put(
          acc,
          new THREE.BoxGeometry(0.035 * s, 0.035 * s, 0.34 * s),
          P(sx * 0.31, 1.2, 0.52),
          K.dark,
          {
            q: qy,
            aoAmt: 0,
          },
        );
      break;
    }
    default:
  }
}

const DUCK_HATS: readonly Hat[] = ['none', 'phones', 'party'];

function rubberDuck({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = new Acc();
  const r = rng.fork('duck');
  addDuck(acc, {
    at: V(0, 0, 0),
    s: 0.42,
    yaw: r.range(-0.3, 0.3),
    hi,
    seg: hi ? [10, 7] : [6, 4],
    hat: hi ? DUCK_HATS[variant % DUCK_HATS.length] : 'none',
  });
  return finish(acc, rng);
}

function giantDuck({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.015);
  addDuck(acc, {
    at: V(0, 0, 0),
    s: 1.95,
    yaw: 0,
    hi,
    seg: hi ? [18, 12] : [8, 5],
    hat: hi ? 'shades' : 'none',
    valve: hi,
  });
  return finish(acc, rng);
}

/* ----------------------------------- kite ----------------------------------- */

/** [panel A, panel B] per variant: blue/cream, coral/yellow, pink/teal. */
const KITE_SETS: readonly (readonly [string, string])[] = [
  [BLUE, CREAM],
  [ROOFS[0], FLOWERS[1]],
  [FLOWERS[0], TEAL],
];

const KITE_W = 0.62;
const KITE_TOP = 0.85;
const KITE_BOT = -0.95;
const KITE_SIDE_Y = 0.22;
const KITE_THICK = 0.12;

/** The four triangular panels of a kite diamond, centred on the cross point, front face +z. */
function kitePanels(): THREE.BufferGeometry[] {
  const top = V2(0, KITE_TOP);
  const bot = V2(0, KITE_BOT);
  const l = V2(-KITE_W, KITE_SIDE_Y);
  const r = V2(KITE_W, KITE_SIDE_Y);
  const c = V2(0, KITE_SIDE_Y);
  return [
    [top, l, c],
    [top, c, r],
    [l, bot, c],
    [c, bot, r],
  ].map((tri) =>
    new THREE.ExtrudeGeometry(new THREE.Shape(tri), {
      depth: KITE_THICK,
      bevelEnabled: false,
    }).translate(0, -KITE_SIDE_Y, -KITE_THICK / 2),
  );
}

/** Adds a flying kite (panels, spars, bridle, bow tail) centred on `at`. */
export function addKite(
  acc: Acc,
  at: THREE.Vector3,
  q: THREE.Quaternion,
  s: number,
  colors: readonly [string, string],
  hi: boolean,
  wind?: number,
): void {
  if (!hi) {
    // far: one diamond slab in the lead colour
    const d = new THREE.Shape([
      V2(0, KITE_TOP),
      V2(-KITE_W, KITE_SIDE_Y),
      V2(0, KITE_BOT),
      V2(KITE_W, KITE_SIDE_Y),
    ]);
    const g = new THREE.ExtrudeGeometry(d, { depth: KITE_THICK, bevelEnabled: false }).translate(
      0,
      -KITE_SIDE_Y,
      -KITE_THICK / 2,
    );
    put(acc, g, at, colors[0], { q, s, aoAmt: 0, windAbs: wind });
    return;
  }
  const panels = kitePanels();
  panels.forEach((g, i) => {
    const c = i === 0 || i === 3 ? colors[0] : colors[1];
    put(acc, g, at, c, { q, s, aoAmt: 0, windAbs: wind });
  });
  // cross spars (slightly proud of the panels)
  put(
    acc,
    new THREE.BoxGeometry(0.07 * s, (KITE_TOP - KITE_BOT) * s, 0.05 * s),
    at
      .clone()
      .add(V(0, ((KITE_TOP + KITE_BOT) / 2 - KITE_SIDE_Y) * s, 0.07 * s).applyQuaternion(q)),
    WOOD.dark,
    {
      q,
      aoAmt: 0,
      windAbs: wind,
    },
  );
  put(
    acc,
    new THREE.BoxGeometry(KITE_W * 2 * s, 0.07 * s, 0.05 * s),
    at.clone().add(V(0, 0, 0.07 * s).applyQuaternion(q)),
    WOOD.dark,
    {
      q,
      aoAmt: 0,
      windAbs: wind,
    },
  );
}

function kite({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.015);
  const r = rng.fork('kite');
  const set = KITE_SETS[variant % KITE_SETS.length];
  const poleH = 1.6;
  // pole, stone footing, reel, brass ring at the top
  put(acc, cylB(0.5, 0.42, 0.2, hi ? 7 : 4), [0, 0, 0], ROCK[1], { aoAmt: 0.3 });
  put(acc, cylB(0.17, 0.11, poleH, hi ? 6 : 4), [0, 0.15, 0], WOOD.dark, { aoAmt: 0.2 });
  if (hi) {
    put(acc, cylB(0.3, 0.3, 0.14, 8), [0, 0.8, 0.22], WOOD.planks, {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0,
    });
    put(acc, new THREE.TorusGeometry(0.2, 0.05, 4, 8), [0, poleH + 0.2, 0], BRASS, { aoAmt: 0 });
  }
  // kite hovers up-wind of the pole, leaning back
  const kc = V(1.25, 2.1, 0.3);
  const kq = qEuler(-0.45, 0.35, -0.25 + r.range(-0.05, 0.05));
  const s = 0.62;
  addKite(acc, kc, kq, s, set, hi, 0.18);
  // line pole top -> bridle point (kite's lower face), sagging a little
  const a = V(0, poleH + 0.3, 0);
  const b = kc.clone().add(V(0, -0.1, 0.1).applyQuaternion(kq));
  if (hi)
    put(acc, tubeAlong(ropePoints(a, b, 0.55, 7), 0.04, 3), [0, 0, 0], CREAM, {
      aoAmt: 0,
      windAbs: 0.05,
    });
  // bow tail: string + small diamonds, flutter grows toward the end
  const tailTop = kc.clone().add(V(0, KITE_BOT * s - 0.02, 0).applyQuaternion(kq));
  const nb = hi ? 6 : 1;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= nb; i++) {
    const t = i / nb;
    pts.push(tailTop.clone().add(V(0.25 * Math.sin(t * 5) * t, -1.15 * t, -0.25 * t)));
  }
  if (hi)
    put(acc, tubeAlong(pts, 0.035, 3), [0, 0, 0], CREAM, {
      aoAmt: 0,
      windAbs: (p) => Math.min(1, 0.25 + (tailTop.y - p.y) * 0.7),
    });
  const bow = new THREE.OctahedronGeometry(0.15, 0).scale(1, 1, 0.8);
  for (let i = 1; i <= nb; i++) {
    const p = pts[i];
    put(acc, bow.clone(), p, i % 2 ? set[0] : set[1], {
      q: qEuler(0, 0.4, (i % 2 ? 0.5 : -0.5) + r.range(-0.2, 0.2)),
      aoAmt: 0,
      windAbs: Math.min(1, 0.25 + (tailTop.y - p.y) * 0.7),
      noJitter: !hi,
    });
  }
  const g = finish(acc, rng, true);
  g.userData.hooks = { pole: { top: [0, poleH + 0.3, 0] }, kite: { centre: [kc.x, kc.y, kc.z] } };
  return g;
}

/* ---------------------------------- kiteRack ---------------------------------- */

const RACK_W = 3.4;
const SIGN_FLAG = 0.12;

function kiteRack({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.02);
  const r = rng.fork('rack');
  const D = 0.7;
  const half = RACK_W / 2;
  // low trough with slot dividers, two tall end posts with brass balls, bunting on top
  put(
    acc,
    hi ? bevBox(RACK_W, 0.5, D, 0.05).translate(0, 0.25, 0) : baseBox(RACK_W, 0.5, D),
    [0, 0, 0],
    WOOD.planks,
    { aoAmt: 0.25 },
  );
  for (const sx of [-1, 1]) {
    put(acc, baseBox(0.22, 2.15, 0.22), [sx * (half + 0.1), 0, 0], WOOD.logs, { aoAmt: 0.25 });
    if (hi) {
      put(acc, new THREE.IcosahedronGeometry(0.15, 1), [sx * (half + 0.1), 2.27, 0], BRASS, {
        aoAmt: 0,
      });
      put(acc, cylB(0.34, 0.3, 0.12, 6), [sx * (half + 0.1), 0, 0], ROCK[1], { aoAmt: 0.2 });
    }
  }
  if (hi) {
    for (let i = 1; i < 6; i++)
      put(acc, baseBox(0.09, 0.3, D * 0.9), [-half + (i * RACK_W) / 6, 0.5, 0], WOOD.dark, {
        aoAmt: 0,
      });
    // `</>` plaque on the front of the trough
    put(acc, bevBox(1.0, 0.34, 0.1, 0.03), [0, 0.28, D / 2 + 0.03], BLUE, { aoAmt: 0 });
    addGlyph(acc, 'code', V(0, 0.28, D / 2 + 0.1), { size: 0.3, color: CREAM, depth: 0.04 });
    // bunting between the posts
    const a = V(-half - 0.1, 2.2, 0);
    const b = V(half + 0.1, 2.2, 0);
    put(acc, tubeAlong(ropePoints(a, b, 0.3, 8), 0.03, 3), [0, 0, 0], CREAM, { aoAmt: 0 });
    const flag = new THREE.ExtrudeGeometry(
      new THREE.Shape([V2(-0.14, 0), V2(0.14, 0), V2(0, -0.34)]),
      { depth: SIGN_FLAG, bevelEnabled: false },
    ).translate(0, 0, -SIGN_FLAG / 2);
    const flagCols = [BLUE, CREAM, FLOWERS[1], ROOFS[0], TEAL, FLOWERS[0], CREAM, BLUE];
    for (let i = 0; i < 8; i++) {
      const t = (i + 0.5) / 8;
      const p = a.clone().lerp(b, t);
      p.y -= 0.3 * 4 * t * (1 - t) + 0.02;
      put(acc, flag.clone(), p, flagCols[i], { aoAmt: 0, windAbs: 0.25 });
    }
  }
  // six kites standing in the slots, fanned out; variant 1 has one slot empty (the one that is
  // stuck in the hedge)
  const sets = [KITE_SETS[0], KITE_SETS[1], KITE_SETS[2], KITE_SETS[1], KITE_SETS[0], KITE_SETS[2]];
  const s = 0.8;
  for (let i = 0; i < 6; i++) {
    if (variant % 2 === 1 && i === 3) continue;
    const x = -half + (i + 0.5) * (RACK_W / 6);
    const z = (i % 2 ? 1 : -1) * 0.1;
    const q = qEuler(-0.16 + r.range(-0.04, 0.04), (i % 2 ? 1 : -1) * 0.55 + r.range(-0.1, 0.1), 0);
    addKite(acc, V(x, 0.5 + 0.8 * s, z), q, s, sets[i], hi);
  }
  return finish(acc, rng);
}

/* --------------------------------- pergolaDesk --------------------------------- */

function chair(acc: Acc, x: number, z: number, color: string, hi: boolean, yaw: number): void {
  const q = qEuler(0, yaw, 0);
  const at = (dx: number, dy: number, dz: number): THREE.Vector3 =>
    V(dx, dy, dz)
      .applyQuaternion(q)
      .add(V(x, 0, z));
  put(
    acc,
    hi ? bevBox(0.52, 0.12, 0.52, 0.03) : new THREE.BoxGeometry(0.52, 0.12, 0.52),
    at(0, 0.5, 0),
    color,
    { q, aoAmt: 0 },
  );
  put(
    acc,
    hi ? bevBox(0.52, 0.5, 0.1, 0.03) : new THREE.BoxGeometry(0.52, 0.5, 0.1),
    at(0, 0.82, 0.22),
    color,
    { q, aoAmt: 0 },
  );
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      put(acc, baseBox(0.1, 0.45, 0.1), at(sx * 0.2, 0, sz * 0.2), WOOD.dark, { q, aoAmt: 0.2 });
}

function pergolaDesk({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.02);
  const H = 2.45;
  const X = 1.55;
  const Z = 1.05;
  const wood = WOOD.planks;
  const awning: readonly [string, string] = variant % 2 === 0 ? [BLUE, CREAM] : [TEAL, CREAM];
  // posts on stone plates, beams all round
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      if (hi) put(acc, cylB(0.28, 0.26, 0.1, 6), [sx * X, 0, sz * Z], ROCK[1], { aoAmt: 0.2 });
      put(acc, baseBox(0.2, H, 0.2), [sx * X, hi ? 0.08 : 0, sz * Z], wood, { aoAmt: 0.25 });
    }
  for (const sz of [-1, 1])
    put(acc, baseBox(X * 2 + 0.4, 0.2, 0.22), [0, H - 0.1, sz * Z], WOOD.logs, { aoAmt: 0 });
  for (const sx of [-1, 1])
    put(acc, baseBox(0.22, 0.2, Z * 2 + 0.3), [sx * X, H - 0.1, 0], WOOD.logs, { aoAmt: 0 });
  // rafters
  const nR = hi ? 7 : 3;
  for (let i = 0; i < nR; i++) {
    const x = -X + 0.2 + (i * (X * 2 - 0.4)) / (nR - 1);
    put(acc, baseBox(0.12, 0.14, Z * 2 + 0.7), [x, H + 0.1, 0], wood, { aoAmt: 0 });
  }
  // awning over the left bays: stripes with a scalloped front valance
  const nS = hi ? 6 : 1;
  const sw = hi ? 0.28 : 1.7;
  for (let i = 0; i < nS; i++) {
    const x = -X - 0.1 + sw / 2 + i * sw;
    const c = i % 2 === 0 ? awning[0] : awning[1];
    put(acc, new THREE.BoxGeometry(sw, 0.07, Z * 2 + 0.5), [x, H + 0.22, 0], c, {
      aoAmt: 0,
      noJitter: true,
      windAbs: 0.2,
    });
    if (hi)
      put(acc, new THREE.BoxGeometry(sw, 0.24, 0.07), [x, H + 0.1, Z + 0.28], c, {
        aoAmt: 0,
        noJitter: true,
        windAbs: 0.35,
      });
  }
  if (hi) {
    // `<` and `>` braces on the front and a `</>` plaque between them
    const brace = (sx: number): void => {
      const x0 = sx * (X - 0.02);
      const x1 = sx * (X - 0.6);
      put(
        acc,
        new THREE.BoxGeometry(0.75, 0.1, 0.14),
        [sx * (X - 0.37), H - 1.32, Z + 0.1],
        WOOD.logs,
        { aoAmt: 0 },
      );
      for (const dy of [-1, 1]) {
        const from = V(x0, H - 0.75, Z + 0.1);
        const to = V(x1, H - 0.75 + dy * 0.6, Z + 0.1);
        const mid = from.clone().add(to).multiplyScalar(0.5);
        const len = from.distanceTo(to);
        const ang = Math.atan2(to.y - from.y, to.x - from.x);
        put(acc, new THREE.BoxGeometry(len + 0.06, 0.15, 0.14), mid, BLUE_DEEP, {
          q: qEuler(0, 0, ang),
          aoAmt: 0,
        });
      }
    };
    brace(-1);
    brace(1);
    put(acc, bevBox(0.95, 0.46, 0.12, 0.03), [0, H - 0.5, Z + 0.1], BLUE, { aoAmt: 0 });
    addGlyph(acc, 'code', V(0, H - 0.5, Z + 0.17), { size: 0.34, color: CREAM, depth: 0.04 });
    // fairy bulbs along the front and the back beam
    for (const sz of [-1, 1]) {
      const a = V(-X + 0.1, H - 0.28, sz * (Z - 0.1));
      const b = V(X - 0.1, H - 0.28, sz * (Z - 0.1));
      if (sz === -1)
        put(acc, tubeAlong(ropePoints(a, b, 0.2, 8), 0.025, 3), [0, 0, 0], K.dark, { aoAmt: 0 });
      for (let i = 0; i < 6; i++) {
        const t = (i + 0.5) / 6;
        const p = a.clone().lerp(b, t);
        p.y -= 0.2 * 4 * t * (1 - t) + (sz === -1 ? 0.08 : 0);
        put(acc, new THREE.IcosahedronGeometry(0.07, 0), p, EMISSIVE.window, {
          emissive: 1,
          ao: () => 1,
          aoAmt: 0,
        });
      }
    }
    // climbing plant on the back-left post: green blobs + a few blossoms
    for (const [dy, dz, rr] of [
      [0.7, 0.12, 0.3],
      [1.3, 0.05, 0.27],
      [1.85, 0.1, 0.24],
    ] as const)
      ell(acc, [-X - 0.05, dy, -Z + dz], [rr, rr * 0.9, rr], GRASS[2], [6, 4], { aoAmt: 0.1 });
    for (const [dy, c] of [
      [0.95, FLOWERS[0]],
      [1.55, FLOWERS[1]],
      [2.0, FLOWERS[0]],
    ] as const)
      put(acc, new THREE.IcosahedronGeometry(0.07, 0), [-X + 0.12, dy, -Z + 0.2], c, { aoAmt: 0 });
  }
  // desk
  const dz = -0.15;
  put(
    acc,
    hi ? bevBox(2.0, 0.14, 0.95, 0.03).translate(0, 0.07, 0) : baseBox(2.0, 0.14, 0.95),
    [0, 0.68, dz],
    wood,
    { aoAmt: 0 },
  );
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      put(acc, baseBox(0.14, 0.7, 0.14), [sx * 0.85, 0, dz + sz * 0.35], WOOD.dark, { aoAmt: 0.2 });
  // laptop (screen glows at night) + duck + mug on the desk
  if (hi) {
    const lq = qEuler(0, -0.25, 0);
    put(acc, new THREE.BoxGeometry(0.56, 0.05, 0.38), [0.5, 0.85, dz], K.steel, {
      q: lq,
      aoAmt: 0,
    });
    const sq = lq.clone().multiply(qEuler(-0.35, 0, 0));
    put(
      acc,
      new THREE.BoxGeometry(0.56, 0.36, 0.04),
      V(0, 0.2, -0.17)
        .applyQuaternion(lq)
        .add(V(0.5, 0.85, dz)),
      K.dark,
      { q: sq, aoAmt: 0 },
    );
    put(
      acc,
      new THREE.BoxGeometry(0.48, 0.28, 0.02),
      V(0, 0.2, -0.14)
        .applyQuaternion(lq)
        .add(V(0.5, 0.85, dz))
        .add(V(0.0, 0, 0.0)),
      K.solarLine,
      {
        q: sq,
        emissive: 0.9,
        ao: () => 1,
        aoAmt: 0,
      },
    );
    addDuck(acc, {
      at: V(-0.6, 0.75, dz + 0.05),
      s: 0.3,
      yaw: 0.5,
      hi: true,
      seg: [7, 5],
      hat: 'none',
    });
    put(acc, cylB(0.09, 0.08, 0.17, 7), [0.0, 0.75, dz + 0.2], variant % 2 ? TEAL : CREAM, {
      aoAmt: 0,
    });
    put(
      acc,
      new THREE.TorusGeometry(0.05, 0.018, 4, 6),
      [0.1, 0.84, dz + 0.2],
      variant % 2 ? TEAL : CREAM,
      { aoAmt: 0 },
    );
  }
  chair(acc, -0.55, 0.78, TEAL, hi, 0.1);
  chair(acc, 0.5, 0.82, ROOFS[0], hi, -0.15);
  return finish(acc, rng, true);
}

/* ---------------------------------- hammock ---------------------------------- */

/** Sausage hammock cloth: a closed loft along a sagging centre line. */
function hammockCloth(
  a: THREE.Vector3,
  b: THREE.Vector3,
  sag: number,
  nU: number,
  nV: number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= nU; i++) {
    const t = i / nU;
    const c = a.clone().lerp(b, t);
    c.y -= sag * 4 * t * (1 - t);
    const prof = Math.pow(Math.sin(Math.PI * t), 0.55);
    const rw = 0.06 + 0.42 * prof;
    const rh = 0.06 + 0.2 * prof;
    for (let j = 0; j < nV; j++) {
      const th = (j / nV) * TAU;
      // flatter on the bottom (belly), fuller on top
      pos.push(c.x, c.y + Math.sin(th) * rh, c.z + Math.cos(th) * rw);
    }
  }
  for (let i = 0; i < nU; i++)
    for (let j = 0; j < nV; j++) {
      const a0 = i * nV + j;
      const a1 = i * nV + ((j + 1) % nV);
      const b0 = (i + 1) * nV + j;
      const b1 = (i + 1) * nV + ((j + 1) % nV);
      idx.push(a0, a1, b0, a1, b1, b0);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function hammock({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.02);
  const half = 1.95;
  const topY = 1.75;
  const cloth: readonly [string, string] = variant % 2 === 0 ? [BLUE, CREAM] : [TEAL, WALLS[3]];
  for (const sx of [-1, 1]) {
    put(acc, cylB(0.34, 0.3, 0.12, hi ? 6 : 4), [sx * half, 0, 0], ROCK[1], { aoAmt: 0.2 });
    put(acc, cylB(0.17, 0.12, topY, hi ? 6 : 4), [sx * half, 0.08, 0], WOOD.dark, {
      q: qEuler(0, 0, -sx * 0.07),
      aoAmt: 0.25,
    });
    if (hi)
      put(
        acc,
        new THREE.TorusGeometry(0.1, 0.035, 4, 8),
        [sx * (half + 0.06), topY + 0.02, 0],
        K.steel,
        {
          q: qEuler(0, Math.PI / 2, 0),
          aoAmt: 0,
        },
      );
  }
  const a = V(-1.62, 1.22, 0);
  const b = V(1.62, 1.22, 0);
  const sag = 0.55;
  const geo = hammockCloth(a, b, sag, hi ? 10 : 4, hi ? 8 : 6);
  put(
    acc,
    geo,
    [0, 0, 0],
    (p) => (Math.floor((p.x + 2) / 0.4) % 2 === 0 ? col(cloth[0]) : col(cloth[1])),
    {
      aoAmt: 0.1,
      noJitter: true,
      windAbs: 0.08,
    },
  );
  if (hi) {
    for (const sx of [-1, 1]) {
      const from = V(sx * (half + 0.05), topY, 0);
      const to = sx < 0 ? a : b;
      put(
        acc,
        tubeAlong(
          [
            from,
            from
              .clone()
              .lerp(to, 0.5)
              .add(V(0, -0.1, 0)),
            to,
          ],
          0.035,
          3,
        ),
        [0, 0, 0],
        CREAM,
        { aoAmt: 0 },
      );
    }
    const yAt = (t: number): number => a.y - sag * 4 * t * (1 - t);
    const topAt = (t: number): number =>
      yAt(t) + 0.06 + 0.2 * Math.pow(Math.sin(Math.PI * t), 0.55);
    const xAt = (t: number): number => a.x + (b.x - a.x) * t;
    // pillow
    put(acc, bevBox(0.5, 0.18, 0.4, 0.05), [xAt(0.17), topAt(0.17) + 0.05, 0.02], WALLS[3], {
      q: qEuler(0, 0.1, -0.15),
      aoAmt: 0,
    });
    if (variant % 2 === 0) {
      // laptop on the belly, glowing; spilled mug on the ground
      put(
        acc,
        new THREE.BoxGeometry(0.5, 0.05, 0.36),
        [xAt(0.62), topAt(0.62) + 0.03, 0],
        K.steel,
        { q: qEuler(0, 0.2, 0.1), aoAmt: 0 },
      );
      put(
        acc,
        new THREE.BoxGeometry(0.42, 0.02, 0.28),
        [xAt(0.62), topAt(0.62) + 0.065, 0],
        K.solarLine,
        {
          q: qEuler(0, 0.2, 0.1),
          emissive: 0.9,
          ao: () => 1,
          aoAmt: 0,
        },
      );
      put(acc, cylB(0.1, 0.09, 0.2, 7), [1.0, 0.1, 0.85], CREAM, {
        q: qEuler(0, 0, Math.PI / 2),
        aoAmt: 0,
      });
      put(acc, new THREE.TorusGeometry(0.05, 0.018, 4, 6), [1.0, 0.18, 0.95], CREAM, { aoAmt: 0 });
    } else {
      // open book on the belly, sandals underneath
      put(
        acc,
        new THREE.BoxGeometry(0.44, 0.04, 0.32),
        [xAt(0.6), topAt(0.6) + 0.02, 0],
        ROOFS[0],
        { q: qEuler(0, -0.2, 0.1), aoAmt: 0 },
      );
      put(acc, new THREE.BoxGeometry(0.4, 0.05, 0.28), [xAt(0.6), topAt(0.6) + 0.05, 0], WALLS[0], {
        q: qEuler(0, -0.2, 0.1),
        aoAmt: 0,
      });
      for (const sz of [-1, 1])
        put(
          acc,
          bevBox(0.34, 0.07, 0.14, 0.02).translate(0, 0.035, 0),
          [0.3, 0, sz * 0.25],
          WOOD.logs,
          { q: qEuler(0, 0.3, 0), aoAmt: 0 },
        );
    }
  }
  const g = finish(acc, rng, true);
  g.userData.hooks = { sway: { pivot: [0, 1.22, 0] } };
  return g;
}

/* --------------------------------- whiteboardA --------------------------------- */

function questionMark(acc: Acc, at: THREE.Vector3, s: number, color: string): void {
  put(
    acc,
    new THREE.TorusGeometry(0.12 * s, 0.03 * s, 4, 8, Math.PI * 1.45),
    at.clone().add(V(0, 0.1 * s, 0)),
    color,
    {
      q: qEuler(0, 0, -0.3),
      aoAmt: 0,
    },
  );
  put(
    acc,
    new THREE.BoxGeometry(0.04 * s, 0.1 * s, 0.03),
    at.clone().add(V(0.02 * s, -0.08 * s, 0)),
    color,
    { aoAmt: 0 },
  );
  put(
    acc,
    new THREE.BoxGeometry(0.06 * s, 0.06 * s, 0.03),
    at.clone().add(V(0.02 * s, -0.22 * s, 0)),
    color,
    { aoAmt: 0 },
  );
}

function bar3(acc: Acc, a: THREE.Vector3, b: THREE.Vector3, w: number, color: string): void {
  const len = a.distanceTo(b);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  put(acc, new THREE.BoxGeometry(len, w, 0.03), a.clone().add(b).multiplyScalar(0.5), color, {
    q: qEuler(0, 0, ang),
    aoAmt: 0,
  });
}

function whiteboardA({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.02);
  const bw = 1.7;
  const bh = 1.1;
  const by = 0.62;
  const cy = by + bh / 2;
  // easel: two front legs lean back, one rear prop
  for (const sx of [-1, 1])
    put(acc, baseBox(0.12, 1.75, 0.12), [sx * 0.72, 0, 0.02], WOOD.planks, {
      q: qEuler(-0.12, 0, 0),
      aoAmt: 0.25,
    });
  put(acc, baseBox(0.12, 1.45, 0.12), [0, 0, -0.5], WOOD.dark, {
    q: qEuler(0.33, 0, 0),
    aoAmt: 0.25,
  });
  // board: frame + white face
  put(
    acc,
    hi
      ? bevBox(bw + 0.14, bh + 0.14, 0.12, 0.03)
      : new THREE.BoxGeometry(bw + 0.14, bh + 0.14, 0.12),
    [0, cy, 0],
    K.steel,
    { aoAmt: 0 },
  );
  put(acc, new THREE.BoxGeometry(bw, bh, 0.05), [0, cy, 0.055], CREAM, {
    aoAmt: 0,
    noJitter: true,
  });
  if (!hi) return finish(acc, rng);
  // marker tray with three markers
  put(acc, new THREE.BoxGeometry(bw * 0.8, 0.07, 0.16), [0, by - 0.12, 0.1], K.steel, { aoAmt: 0 });
  [BLUE, ROOFS[0], K.dark].forEach((c, i) =>
    put(acc, cylB(0.035, 0.035, 0.2, 5), [-0.3 + i * 0.16, by - 0.085, 0.12], c, {
      q: qEuler(0, 0, Math.PI / 2),
      aoAmt: 0,
    }),
  );
  const z = 0.1;
  const P = (x: number, y: number): THREE.Vector3 => V(x, cy + y, z);
  if (variant % 3 === 0) {
    // flow chart: three boxes joined by arrows
    for (const [x, c] of [
      [-0.55, BLUE],
      [0, BLUE],
      [0.55, ROOFS[0]],
    ] as const) {
      for (const [dx, dy, w, h] of [
        [0, 0.14, 0.34, 0.04],
        [0, -0.14, 0.34, 0.04],
        [-0.17, 0, 0.04, 0.32],
        [0.17, 0, 0.04, 0.32],
      ] as const)
        put(acc, new THREE.BoxGeometry(w, h, 0.03), P(x + dx, 0.15 + dy), c, { aoAmt: 0 });
    }
    for (const x of [-0.28, 0.27]) {
      bar3(acc, P(x - 0.06, 0.15), P(x + 0.06, 0.15), 0.035, K.dark);
      bar3(acc, P(x + 0.06, 0.15), P(x + 0.02, 0.19), 0.035, K.dark);
      bar3(acc, P(x + 0.06, 0.15), P(x + 0.02, 0.11), 0.035, K.dark);
    }
    bar3(acc, P(-0.5, -0.3), P(0.5, -0.3), 0.035, ROOFS[0]);
    bar3(acc, P(-0.5, -0.38), P(0.2, -0.38), 0.035, ROOFS[0]);
  } else if (variant % 3 === 1) {
    // a bug and a question mark
    ell(acc, P(-0.25, -0.02), [0.19, 0.15, 0.03], BEAK, [8, 5], { aoAmt: 0 });
    ell(acc, P(-0.46, -0.0), [0.08, 0.08, 0.03], K.dark, [6, 4], { aoAmt: 0 });
    for (const sy of [-1, 1])
      for (const dx of [-0.34, -0.25, -0.16]) {
        bar3(acc, P(dx, -0.02 + sy * 0.1), P(dx - 0.05, -0.02 + sy * 0.24), 0.03, K.dark);
      }
    bar3(acc, P(-0.5, 0.07), P(-0.58, 0.18), 0.025, K.dark);
    bar3(acc, P(-0.5, -0.07), P(-0.58, -0.18), 0.025, K.dark);
    questionMark(acc, P(0.35, 0), 1.9, BLUE);
    bar3(acc, P(-0.6, -0.4), P(0.1, -0.4), 0.035, BLUE);
  } else {
    // `</>` and a tick
    addGlyph(acc, 'code', P(-0.3, 0.05), { size: 0.62, color: BLUE, depth: 0.03 });
    addGlyph(acc, 'check', P(0.45, 0.05), { size: 0.42, color: GRASS[2], depth: 0.03 });
    bar3(acc, P(-0.6, -0.35), P(0.6, -0.35), 0.035, K.dark);
  }
  return finish(acc, rng);
}

/* ----------------------------------- mugStack ----------------------------------- */

function mug(
  acc: Acc,
  at: THREE.Vector3,
  color: string,
  hi: boolean,
  q?: THREE.Quaternion,
  handle = 1,
): void {
  put(acc, cylB(0.12, 0.115, 0.23, hi ? 8 : 5), at, color, { q, aoAmt: 0 });
  if (hi) {
    const off = V(0.13 * handle, 0.12, 0);
    if (q) off.applyQuaternion(q);
    put(
      acc,
      new THREE.TorusGeometry(0.07, 0.025, 4, 6, Math.PI * 1.3),
      at.clone().add(off),
      color,
      {
        q: (q ?? new THREE.Quaternion())
          .clone()
          .multiply(qEuler(0, 0, handle > 0 ? -Math.PI / 2 - 0.65 : Math.PI / 2 - 0.65)),
        aoAmt: 0,
      },
    );
  }
}

function mugStack({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.03);
  const r = rng.fork('mugs');
  // snack crate with slats
  put(
    acc,
    hi ? bevBox(0.8, 0.4, 0.55, 0.04).translate(0, 0.2, 0) : baseBox(0.8, 0.4, 0.55),
    [0, 0, 0],
    WOOD.planks,
    { aoAmt: 0.25 },
  );
  if (hi) {
    put(acc, new THREE.BoxGeometry(0.84, 0.07, 0.59), [0, 0.3, 0], WOOD.logs, { aoAmt: 0 });
    put(acc, new THREE.BoxGeometry(0.84, 0.07, 0.59), [0, 0.1, 0], WOOD.logs, { aoAmt: 0 });
    // snack bar peeking out of the crate
    put(acc, new THREE.BoxGeometry(0.26, 0.07, 0.15), [-0.18, 0.42, 0.15], ROOFS[3], {
      q: qEuler(0, 0.4, 0.1),
      aoAmt: 0,
    });
  }
  const colors = [BLUE, CREAM, DUCK];
  if (variant % 2 === 0) {
    mug(acc, V(-0.2, 0.4, -0.1), colors[0], hi);
    mug(acc, V(0.18, 0.4, -0.1), colors[1], hi, undefined, -1);
    mug(acc, V(0.0, 0.4, 0.14), colors[2], hi);
  } else {
    // a leaning tower of three mugs and one toppled on the crate edge
    mug(acc, V(-0.15, 0.4, 0), colors[0], hi);
    mug(acc, V(-0.15, 0.63, 0), colors[1], hi, qEuler(0, r.range(-0.2, 0.2), 0.08), -1);
    mug(acc, V(-0.15, 0.86, 0), colors[2], hi, qEuler(0, r.range(-0.2, 0.2), -0.08));
    mug(acc, V(0.25, 0.52, 0.1), TEAL, hi, qEuler(0, 0.3, Math.PI / 2));
  }
  return finish(acc, rng);
}

/* ------------------------- variants of existing coding defs ------------------------- */

/** `{`-shaped clipped hedge blocks as [x, z, w, d] (hedge.ts builds them). */
export const BRACKET_ARMS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 0.5, 1.2],
  [-0.55, 0, 0.6, 0.55],
  [0.3, -0.875, 1.1, 0.55],
  [0.3, 0.875, 1.1, 0.55],
];

/**
 * Hexagon chime pagoda round the turbine foot (windChimeTower, windTurbine variant 3). `r0` is the
 * tower's foot radius; call BEFORE the head parts so the yaw hook range stays the tail.
 */
export function addChimePagoda(acc: Acc, r0: number): void {
  const R = 1.9;
  const topY = 3.05;
  const stone = col(ROCK[0]);
  put(acc, cylB(R + 0.3, R + 0.3, 0.14, 10), [0, 0, 0], stone, { aoAmt: 0.2 });
  const posts: THREE.Vector3[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    posts.push(V(Math.cos(a) * R, 0, Math.sin(a) * R));
  }
  for (const p of posts) {
    put(acc, cylB(0.17, 0.13, topY, 6), p.clone().setY(0.1), WOOD.planks, { aoAmt: 0.25 });
    put(acc, cylB(0.26, 0.2, 0.18, 6), p.clone().setY(0.1), ROCK[2], { aoAmt: 0.2 });
  }
  const chimeCols = [K.steel, CREAM, BLUE, BRASS, TEAL, K.steel];
  let n = 0;
  for (let k = 0; k < 6; k++) {
    const a = posts[k];
    const b = posts[(k + 1) % 6];
    const mid = a
      .clone()
      .add(b)
      .multiplyScalar(0.5)
      .setY(topY + 0.02);
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    put(acc, new THREE.BoxGeometry(R + 0.2, 0.22, 0.2), mid, WOOD.logs, {
      q: qEuler(0, ang + Math.PI / 2, 0),
      aoAmt: 0,
    });
    for (const t of [1 / 3, 2 / 3]) {
      const p = a.clone().lerp(b, t);
      const len = 0.55 + 0.5 * (((n * 5) % 4) / 3);
      put(
        acc,
        cylB(0.09, 0.09, len, 4),
        p.clone().setY(topY - 0.1 - len),
        chimeCols[n % chimeCols.length],
        { aoAmt: 0 },
      );
      n++;
    }
  }
  // hexagon roof sloping up to the tower
  put(acc, cylB(R + 0.5, r0 * 1.2, 0.95, 6), [0, topY + 0.12, 0], SKY, { aoAmt: 0.05 });
}

/* --------------------------------- registry --------------------------------- */

export const CODING_CULTURE_GEO: readonly PropGeoDef[] = [
  {
    id: 'rubberDuck',
    variants: 3,
    build: rubberDuck,
    footprint: 0.3,
    height: 0.6,
    heights: [0.6, 0.65, 0.8],
    windy: false,
  },
  { id: 'kite', variants: 3, build: kite, footprint: 1.2, height: 2.8, windy: true },
  { id: 'pergolaDesk', variants: 2, build: pergolaDesk, footprint: 1.9, height: 2.7, windy: true },
  { id: 'hammock', variants: 2, build: hammock, footprint: 1.9, height: 1.8, windy: true },
  { id: 'kiteRack', variants: 2, build: kiteRack, footprint: 1.9, height: 2.3, windy: true },
  { id: 'giantDuck', variants: 1, build: giantDuck, footprint: 1.6, height: 2.8, windy: false },
  { id: 'whiteboardA', variants: 3, build: whiteboardA, footprint: 0.9, height: 1.8, windy: false },
  {
    id: 'mugStack',
    variants: 2,
    build: mugStack,
    footprint: 0.45,
    height: 0.65,
    heights: [0.65, 1.1],
    windy: false,
  },
];
