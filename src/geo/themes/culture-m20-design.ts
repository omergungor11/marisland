/**
 * M20 Design "Glass Conservatory" kit (TASK-465, D-057). Geometry only, nothing is placed here.
 * Defs and dimensions: content/props-themes/m20.ts; ledger: content/cultures/design.ts (entries 11-15).
 *
 *   conservatory     T1  octagonal Victorian glass house: 4 open door bays, glazed walls, mansard
 *                        ring, faceted dome, coloured lantern; palms, a pond and beds inside
 *   glasshouse       T2  small gabled glasshouse, 5 pane tints (variant), flower beds inside
 *   glassBridge      T2  arched footbridge with glass balustrade panes (span / width: GLASS_BRIDGE)
 *   prismArch        T2  slender walk-through arch topped by a glass prism (`hooks.pool`)
 *   stainedWindmill  T2  small windmill, 4 stained-glass sails (aSpin rotor, `hooks.rotor`)
 *
 * Glass is the Design glass of culture-design.ts: saturated palette hues (DESIGN_CULTURE_KIT.glass),
 * `emissive: 1` panes (lamp class, switch on with the lamps ramp), double sided, never the aqua.
 * At LOD0 the fixed glass is tagged `stained` (the existing stained-glass surface kind of the Atelier
 * Tree canopy and the stained screen: `tagStained`); the spinning windmill sails cannot be (the spin
 * channel is taken) and stay plain lit glass. LOD1 is never tagged (D-049: keeps the far merge).
 */
import * as THREE from 'three';
import {
  CONSERVATORY as CONS,
  GLASSHOUSE,
  GLASSHOUSE_HUES,
  GLASS_BRIDGE as BRIDGE,
  PRISM_ARCH as ARCH,
  glassBridgeDeckY,
  STAINED_WINDMILL as MILL,
} from '../../content/props-themes/m20.ts';
import { DESIGN_CULTURE_KIT as K } from '../../content/props-themes/design.ts';
import { EMISSIVE, FLOWERS, FOLIAGE, ROOFS, WOOD } from '../../content/palette.ts';
import { createNoise, qEuler, qFromTo, blob, type Acc } from '../kit.ts';
import { Spin, finishSpin } from '../office-kit.ts';
import { V, baseBox, cylB, lathe, put } from '../parts.ts';
import type { BuildOpts, Lod, PropGeoDef } from '../types.ts';
import { cultureAcc } from './culture-devops.ts';
import { beam } from './culture-hq.ts';
import { facets } from './culture-design.ts';
import { tagStained } from './surface-tags.ts';

const G = K.glass;
const FRAME = K.paper;
const lit = (e = 1) => ({ emissive: e, ao: () => 1, aoAmt: 0 }) as const;
const ball = (r: number): THREE.BufferGeometry => new THREE.IcosahedronGeometry(r, 0);
const lathePts = (...p: [number, number][]): ReadonlyArray<readonly [number, number]> => p;

/** Conservatory glass: mostly pale violet / sky / pink / mint, every 7th pane a jewel tone. */
const CONS_GLASS = [
  G.lavender,
  G.sky,
  G.violet,
  G.pink,
  G.mint,
  G.sky,
  G.lavender,
  G.pink,
] as const;
const JEWELS = [G.ruby, G.amber, G.sun, G.orange] as const;

/** Flat glass pane through `pts` (a quad or triangle, fan wound), shrunk a little so the frame shows. */
function pane(
  acc: Acc,
  pts: THREE.Vector3[],
  color: string,
  gap = 0.07,
  e = 1,
  extra: Parameters<typeof put>[4] = {},
): void {
  const c = pts.reduce((s, p) => s.add(p), V(0, 0, 0)).multiplyScalar(1 / pts.length);
  const q = pts.map((p) => p.clone().lerp(c, gap));
  const pos: number[] = [];
  for (let i = 1; i < q.length - 1; i++)
    pos.push(q[0].x, q[0].y, q[0].z, q[i].x, q[i].y, q[i].z, q[i + 1].x, q[i + 1].y, q[i + 1].z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  put(acc, g, [0, 0, 0], color, { ...lit(e), double: true, ...extra });
}

/* ================================== conservatory ================================ */

/** Thin triangular-section rib between two points, open ended (6 triangles instead of a box's 12). */
function rib(
  acc: Acc,
  a: THREE.Vector3,
  b: THREE.Vector3,
  w: number,
  color: string,
  _d?: number,
  _ao?: number,
): void {
  const dir = b.clone().sub(a);
  put(
    acc,
    new THREE.CylinderGeometry(w * 0.6, w * 0.6, dir.length(), 3, 1, true),
    a.clone().add(b).multiplyScalar(0.5),
    color,
    { q: qFromTo(V(0, 1, 0), dir), aoAmt: 0.05 },
  );
}

const SEG = Math.PI / 4;
/** Octagon vertex k at circumradius r, height y; face i (centre direction i * 45 deg from +z) joins k = i, i + 1. */
const vtx = (k: number, r: number, y: number): THREE.Vector3 => {
  const a = (k - 0.5) * SEG;
  return V(Math.sin(a) * r, y, Math.cos(a) * r);
};

/** Bilinear point on the face strip between a bottom ring (rb, yb) and a top ring (rt, yt). */
function strip(
  i: number,
  rb: number,
  yb: number,
  rt: number,
  yt: number,
): (u: number, v: number) => THREE.Vector3 {
  const b0 = vtx(i, rb, yb);
  const b1 = vtx(i + 1, rb, yb);
  const t0 = vtx(i, rt, yt);
  const t1 = vtx(i + 1, rt, yt);
  return (u, v) => b0.clone().lerp(b1, u).lerp(t0.clone().lerp(t1, u), v);
}

function palm(acc: Acc, x: number, z: number, h: number, yaw: number, hi: boolean): void {
  put(acc, cylB(0.13, 0.08, h, hi ? 5 : 4), [x, CONS.plinthH, z], WOOD.logs, { aoAmt: 0.2 });
  const top = V(x, CONS.plinthH + h, z);
  const n = hi ? 7 : 5;
  for (let f = 0; f < n; f++) {
    const a = yaw + (f / n) * Math.PI * 2;
    const q = qEuler(0, a, 0).multiply(qEuler(0.45, 0, 0));
    const d = V(Math.sin(a) * 0.75, -0.12, Math.cos(a) * 0.75);
    put(acc, new THREE.OctahedronGeometry(0.85, 0), top.clone().add(d), FOLIAGE.palm[f % 2], {
      q,
      s: [0.42, 0.1, 1.0],
      aoAmt: 0,
    });
  }
  put(acc, ball(0.16), top, WOOD.dark, { aoAmt: 0 });
}

/**
 * Victorian glass conservatory (T1 landmark, ~15 u across, 10.5 u tall). Plan: regular octagon,
 * circumradius `CONSERVATORY.radius`; local +z is bay 0, bays at 0 / 90 / 180 / 270 deg are open
 * doorways, the four diagonal faces are glazed. Stone plinth, brick low wall, white mullions and
 * transoms, a mansard ring and a three-tier faceted dome in violet / sky / pink glass with a few
 * jewel panes, a glowing amber / ruby lantern cupola with a violet cap. Inside (seen through the
 * bays): paved floor, a round pond, eight palms flanking the doors and bushes. LOD1 = the coloured
 * faceted silhouette (octagonal drum, mansard, dome tiers, lantern), same hues, no ribs.
 */
function conservatory({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const R = CONS.radius;
  const P0 = CONS.plinthH;
  const WALL = CONS.wallH;
  const LOW = 1.2;
  const MID = 2.4;
  const RR = CONS.ringR;
  const RY = CONS.ringY;
  const DOME: ReadonlyArray<readonly [number, number]> = [
    [RR, RY],
    [3.3, 6.75],
    [2.2, 7.85],
    [0.95, 8.55],
  ];
  const LANT_TOP = 9.55;
  let k = 0;
  const hue = (): string => {
    k++;
    return k % 7 === 0 ? JEWELS[(k / 7) % JEWELS.length] : CONS_GLASS[(k * 3) % CONS_GLASS.length];
  };
  const spinHue = (i: number): string => (i % 2 === 0 ? G.amber : G.ruby);
  const edge = 2 * R * Math.sin(SEG / 2);

  if (!hi) {
    // far silhouette: plinth, glazed drum, mansard, three dome tiers and the lantern, facet by facet
    const facet = (rb: number, rt: number, y0: number, y1: number, tone: readonly string[]) => {
      const f = (p: THREE.Vector3): THREE.Color => {
        const i = Math.floor(Math.atan2(p.x, p.z) / SEG + 0.5 + 8) % 8;
        return new THREE.Color(tone[(i * 3 + Math.round(y0)) % tone.length]);
      };
      put(acc, cylB(rb, rt, y1 - y0, 8).rotateY(SEG / 2), [0, y0, 0], f, { ...lit(1) });
    };
    put(acc, cylB(R + 0.4, R + 0.4, P0, 8).rotateY(SEG / 2), [0, 0, 0], K.stone, { aoAmt: 0.2 });
    facet(R, R, P0, WALL, [G.lavender, G.sky, G.pink, G.mint]);
    facet(R, RR, WALL, RY, [G.violet, G.lavender, G.sky, G.pink]);
    for (let t = 0; t + 1 < DOME.length; t++)
      facet(DOME[t][0], DOME[t + 1][0], DOME[t][1], DOME[t + 1][1], [
        G.violet,
        G.pink,
        G.sky,
        G.lavender,
        G.ruby,
      ]);
    facet(0.95, 0.8, DOME[3][1], LANT_TOP, [G.amber, G.ruby, G.sun, G.orange]);
    put(
      acc,
      new THREE.ConeGeometry(1.0, 0.7, 8).translate(0, 0.35, 0),
      [0, LANT_TOP, 0],
      ROOFS[4],
      { aoAmt: 0 },
    );
    put(acc, ball(0.14), [0, LANT_TOP + 0.74, 0], G.sun, { ...lit(1.3) });
    return acc.finish(rng, false, true);
  }

  // ----- plinth, floor, low brick wall
  put(acc, cylB(R + 0.4, R + 0.4, P0, 8).rotateY(SEG / 2), [0, 0, 0], K.stone, { aoAmt: 0.25 });
  put(acc, cylB(R - 0.3, R - 0.3, 0.04, 8).rotateY(SEG / 2), [0, P0, 0], K.cream, { aoAmt: 0 });
  const bay = (i: number): boolean => i % 2 === 0;
  const ub = (1 - CONS.bayWidth / edge) / 2;
  for (let i = 0; i < 8; i++) {
    const phi = i * SEG;
    const q = qEuler(0, phi, 0);
    const face = (rb: number, yb: number, rt: number, yt: number) => strip(i, rb, yb, rt, yt);
    const wall = face(R, P0, R, LOW);
    const segs = bay(i)
      ? ([
          [0, ub],
          [1 - ub, 1],
        ] as const)
      : ([[0, 1]] as const);
    for (const [u0, u1] of segs) {
      const mid = wall((u0 + u1) / 2, 0);
      put(acc, baseBox((u1 - u0) * edge, LOW - P0, 0.34), [mid.x, P0, mid.z], K.brick, {
        q,
        aoAmt: 0.2,
      });
      // glazed panels above the low wall, 3 columns per full face, 1 per bay shoulder
      const cols = bay(i) ? 1 : 3;
      const rows: ReadonlyArray<readonly [number, number]> = [
        [LOW, MID],
        [MID, WALL],
      ];
      for (let c = 0; c < cols; c++)
        for (const [y0, y1] of rows) {
          const a = u0 + ((u1 - u0) * c) / cols;
          const b = u0 + ((u1 - u0) * (c + 1)) / cols;
          const s0 = face(R, y0, R, y0);
          const s1 = face(R, y1, R, y1);
          pane(acc, [s0(a, 0), s0(b, 0), s1(b, 0), s1(a, 0)], hue());
        }
      if (!bay(i)) {
        for (const u of [1 / 3, 2 / 3])
          rib(acc, face(R, LOW, R, LOW)(u, 0), face(R, WALL, R, WALL)(u, 0), 0.11, FRAME, 0.11, 0);
      }
    }
    // transom
    rib(acc, vtx(i, R, MID), vtx(i + 1, R, MID), 0.1, FRAME, 0.12, 0);
    if (bay(i)) {
      // doorway: jambs, lintel, the glass transom over it
      const door = face(R, P0, R, WALL);
      const jambY = 3.0;
      for (const u of [ub, 1 - ub]) {
        const p = door(u, 0);
        put(acc, baseBox(0.28, jambY - P0, 0.3), [p.x, P0, p.z], FRAME, { q, aoAmt: 0.1 });
      }
      rib(
        acc,
        door(ub, 0).setY(jambY + 0.05),
        door(1 - ub, 0).setY(jambY + 0.05),
        0.2,
        FRAME,
        0.3,
        0,
      );
      const t0 = face(R, jambY + 0.15, R, jambY + 0.15);
      const t1 = face(R, WALL, R, WALL);
      pane(acc, [t0(ub, 0), t0(1 - ub, 0), t1(1 - ub, 0), t1(ub, 0)], hue());
      // porch lamp finial over the door
      const top = door(0.5, 0);
      put(acc, ball(0.16), [top.x * 1.03, WALL + 0.25, top.z * 1.03], G.sun, { ...lit(1.3) });
    }
  }
  // corner mullions + eave ring
  for (let kk = 0; kk < 8; kk++) {
    rib(acc, vtx(kk, R, P0), vtx(kk, R, WALL), 0.26, FRAME, 0.26, 0.05);
    rib(acc, vtx(kk, R + 0.05, WALL), vtx(kk + 1, R + 0.05, WALL), 0.22, FRAME, 0.34, 0);
  }
  // ----- mansard ring + dome tiers
  const tiers: Array<readonly [number, number, number, number, number, number]> = [
    [R, WALL, RR, RY, 3, 2],
  ];
  for (let t = 0; t + 1 < DOME.length; t++)
    tiers.push([DOME[t][0], DOME[t][1], DOME[t + 1][0], DOME[t + 1][1], 2, 1]);
  for (const [rb, yb, rt, yt, cols, rows] of tiers) {
    for (let i = 0; i < 8; i++) {
      const s = strip(i, rb, yb, rt, yt);
      for (let c = 0; c < cols; c++)
        for (let r = 0; r < rows; r++) {
          const u0 = c / cols;
          const u1 = (c + 1) / cols;
          const v0 = r / rows;
          const v1 = (r + 1) / rows;
          pane(acc, [s(u0, v0), s(u1, v0), s(u1, v1), s(u0, v1)], hue());
        }
      for (let c = 1; c < cols; c++) rib(acc, s(c / cols, 0), s(c / cols, 1), 0.11, FRAME, 0.11, 0);
      for (let r = 1; r < rows; r++) rib(acc, s(0, r / rows), s(1, r / rows), 0.1, FRAME, 0.12, 0);
    }
    for (let kk = 0; kk < 8; kk++) {
      rib(acc, vtx(kk, rb, yb), vtx(kk, rt, yt), 0.2, FRAME, 0.2, 0);
      rib(acc, vtx(kk, rt, yt), vtx(kk + 1, rt, yt), 0.18, FRAME, 0.22, 0);
    }
  }
  // ----- lantern cupola: glowing amber / ruby panes, violet cap, sun finial
  for (let i = 0; i < 8; i++) {
    const s = strip(i, 0.95, DOME[3][1], 0.8, LANT_TOP);
    pane(acc, [s(0, 0), s(1, 0), s(1, 1), s(0, 1)], spinHue(i), 0.05);
  }
  for (let kk = 0; kk < 8; kk++)
    rib(acc, vtx(kk, 0.95, DOME[3][1]), vtx(kk, 0.8, LANT_TOP), 0.12, FRAME, 0.12, 0);
  put(acc, new THREE.ConeGeometry(1.0, 0.7, 8).translate(0, 0.35, 0), [0, LANT_TOP, 0], ROOFS[4], {
    aoAmt: 0,
  });
  put(acc, ball(0.14), [0, LANT_TOP + 0.74, 0], G.sun, { ...lit(1.3) });

  // ----- inside: pond, palms flanking the doors, bushes (noise displaced)
  const noise = createNoise(rng.fork('plants'));
  put(acc, cylB(1.7, 1.7, 0.32, 10), [0, P0, 0], K.stone, { aoAmt: 0.2 });
  put(acc, cylB(1.45, 1.45, 0.06, 10), [0, P0 + 0.3, 0], G.sky, { ...lit(0.6) });
  put(acc, new THREE.OctahedronGeometry(0.5, 0), [0, P0 + 0.55, 0], G.lavender, {
    ...lit(1),
    s: [0.8, 1.4, 0.8],
  });
  const pr = rng.fork('palms');
  for (let b = 0; b < 4; b++)
    for (const s of [-1, 1]) {
      const a = b * (Math.PI / 2) + s * 0.34;
      palm(acc, Math.sin(a) * 4.9, Math.cos(a) * 4.9, pr.range(1.6, 2.2), pr.range(0, 6.2), hi);
    }
  for (let b = 0; b < 8; b++) {
    const a = (b + 0.5) * SEG;
    const r = 5.6 + (b % 2) * 0.3;
    put(
      acc,
      blob(0.8 + (b % 3) * 0.1, 0, noise, 0.18),
      [Math.sin(a) * r, P0 + 0.5, Math.cos(a) * r],
      FOLIAGE.deciduous[b % 3],
      { s: [1, 0.8, 1], aoAmt: 0.2 },
    );
  }
  for (let b = 0; b < 4; b++) {
    const a = b * (Math.PI / 2) + Math.PI / 4;
    put(
      acc,
      blob(0.55, 0, noise, 0.2),
      [Math.sin(a) * 2.6, P0 + 0.35, Math.cos(a) * 2.6],
      FLOWERS[b % FLOWERS.length],
      { aoAmt: 0.1 },
    );
  }
  const g = acc.finish(rng, false, true);
  tagStained(g);
  return g;
}

/* ================================== glasshouse ================================== */

/**
 * Small gabled glasshouse, 2.5 x 4 u (variant = pane tint, `GLASSHOUSE_HUES`): stone kerb, white
 * frame, glazed side walls and roof, glazed back gable, front gable open as a doorway so the
 * flower beds inside show. Ridge along z, door at +z. LOD1: tinted box + roof prism.
 */
function glasshouse({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const tint = G[GLASSHOUSE_HUES[variant % GLASSHOUSE_HUES.length]];
  const hw = GLASSHOUSE.width / 2;
  const hl = GLASSHOUSE.length / 2;
  const wh = GLASSHOUSE.wallH;
  const top = GLASSHOUSE.height;
  const kerb = 0.4;
  const light = new THREE.Color(tint).lerp(new THREE.Color('#FFFFFF'), 0.28).getHexString();
  const shade = (n: number): string => (n % 2 === 0 ? tint : `#${light}`);
  if (!hi) {
    put(acc, baseBox(GLASSHOUSE.width + 0.2, kerb, GLASSHOUSE.length + 0.2), [0, 0, 0], K.stone, {
      aoAmt: 0.2,
    });
    put(acc, baseBox(GLASSHOUSE.width, wh - kerb, GLASSHOUSE.length), [0, kerb, 0], tint, {
      ...lit(1),
    });
    const roof = new THREE.BufferGeometry();
    const A = [-hw, wh, -hl];
    const B = [hw, wh, -hl];
    const C = [0, top, -hl];
    const D = [-hw, wh, hl];
    const E = [hw, wh, hl];
    const F = [0, top, hl];
    const pos = [
      ...A,
      ...D,
      ...F,
      ...A,
      ...F,
      ...C,
      ...B,
      ...C,
      ...F,
      ...B,
      ...F,
      ...E,
      ...A,
      ...C,
      ...B,
      ...D,
      ...E,
      ...F,
    ];
    roof.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    put(acc, roof, [0, 0, 0], shade(1), { ...lit(1) });
    return acc.finish(rng, false, true);
  }
  // kerb ring, floor
  put(acc, baseBox(GLASSHOUSE.width + 0.16, kerb, 0.14), [0, 0, -hl], K.stone, { aoAmt: 0.2 });
  for (const s of [-1, 1])
    put(acc, baseBox(0.14, kerb, GLASSHOUSE.length + 0.16), [s * hw, 0, 0], K.stone, {
      aoAmt: 0.2,
    });
  for (const s of [-1, 1])
    put(acc, baseBox(0.5, kerb, 0.14), [s * (hw - 0.25), 0, hl], K.stone, { aoAmt: 0.2 });
  put(acc, baseBox(GLASSHOUSE.width, 0.08, GLASSHOUSE.length), [0, 0, 0], K.paper, { aoAmt: 0 });
  // frame: corner and mid posts, eave beams, ridge, rafters
  const zs = [-hl, -hl / 3, hl / 3, hl];
  for (const z of zs)
    for (const s of [-1, 1]) {
      beam(acc, V(s * hw, kerb, z), V(s * hw, wh, z), 0.12, FRAME, 0.12, 0.05);
      beam(acc, V(s * hw, wh, z), V(0, top, z), 0.11, FRAME, 0.11, 0);
    }
  for (const s of [-1, 1]) beam(acc, V(s * hw, wh, -hl), V(s * hw, wh, hl), 0.13, FRAME, 0.13, 0);
  beam(acc, V(0, top, -hl), V(0, top, hl), 0.16, FRAME, 0.16, 0);
  put(acc, ball(0.1), [0, top + 0.06, hl], G.sun, { ...lit(1.3) });
  put(acc, ball(0.1), [0, top + 0.06, -hl], G.sun, { ...lit(1.3) });
  // glass
  let n = 0;
  for (let c = 0; c < 3; c++) {
    const z0 = zs[c];
    const z1 = zs[c + 1];
    for (const s of [-1, 1]) {
      pane(
        acc,
        [V(s * hw, kerb, z0), V(s * hw, kerb, z1), V(s * hw, wh, z1), V(s * hw, wh, z0)],
        shade(n++),
      );
      pane(acc, [V(s * hw, wh, z0), V(s * hw, wh, z1), V(0, top, z1), V(0, top, z0)], shade(n++));
    }
  }
  pane(acc, [V(-hw, kerb, -hl), V(hw, kerb, -hl), V(hw, wh, -hl), V(-hw, wh, -hl)], shade(0));
  pane(acc, [V(-hw, wh, -hl), V(hw, wh, -hl), V(0, top, -hl)], shade(1));
  pane(acc, [V(-hw, wh, hl), V(hw, wh, hl), V(0, top, hl)], shade(2));
  for (const s of [-1, 1])
    pane(
      acc,
      [
        V(s * hw, kerb, hl),
        V(s * (hw - 0.5), kerb, hl),
        V(s * (hw - 0.5), wh, hl),
        V(s * hw, wh, hl),
      ],
      shade(3),
    );
  // door frame + lintel
  for (const s of [-1, 1])
    beam(acc, V(s * (hw - 0.5), 0, hl), V(s * (hw - 0.5), wh, hl), 0.13, FRAME, 0.13, 0);
  beam(acc, V(-hw + 0.5, wh, hl), V(hw - 0.5, wh, hl), 0.14, FRAME, 0.14, 0);
  // two raised flower beds inside + a pot, all in palette colours
  const fr = rng.fork('flowers');
  for (const s of [-1, 1]) {
    put(acc, baseBox(0.62, 0.3, GLASSHOUSE.length - 0.7), [s * 0.78, 0.08, -0.1], WOOD.dark, {
      aoAmt: 0.2,
    });
    put(acc, baseBox(0.54, 0.05, GLASSHOUSE.length - 0.8), [s * 0.78, 0.38, -0.1], WOOD.logs, {
      aoAmt: 0,
    });
    for (let f = 0; f < 11; f++) {
      const z = -hl + 0.5 + (f / 10) * (GLASSHOUSE.length - 1.1) + fr.range(-0.08, 0.08);
      const x = s * 0.78 + fr.range(-0.17, 0.17);
      const c = FLOWERS[(f + (s > 0 ? 2 : 0) + variant) % FLOWERS.length];
      put(acc, new THREE.OctahedronGeometry(0.12 + fr.range(0, 0.04), 0), [x, 0.5, z], c, {
        aoAmt: 0,
      });
      put(acc, ball(0.08), [x, 0.4, z], FOLIAGE.deciduous[f % 3], { aoAmt: 0 });
    }
  }
  const g = acc.finish(rng, false, true);
  tagStained(g);
  return g;
}

/* ================================== glassBridge ================================== */

/** Deck-top height at x along the bridge (pads flat, an arch over the span). */
const deckY = glassBridgeDeckY;

/**
 * Arched footbridge along local x (see GLASS_BRIDGE): plank deck on two arched stringers, stone
 * end pads, white posts + rail on both sides with glowing glass balustrade panes between them,
 * lantern finials. Pivot = ground at the centre; deck top is `endY` at the pad ends and `midY`
 * at mid-span. LOD1: three deck boxes, two rails, pads.
 */
function glassBridge({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const hs = BRIDGE.span / 2;
  const hz = BRIDGE.width / 2;
  const nSeg = hi ? 8 : 3;
  const dt = 0.16;
  for (const s of [-1, 1]) {
    const x0 = s * (hs + BRIDGE.pad / 2);
    put(acc, baseBox(BRIDGE.pad, BRIDGE.endY, BRIDGE.width), [x0, 0, 0], K.stone, { aoAmt: 0.25 });
    put(acc, baseBox(BRIDGE.pad + 0.1, 0.12, BRIDGE.width + 0.1), [x0, 0, 0], K.stoneDark, {
      aoAmt: 0,
    });
  }
  // deck segments along the arch
  const ptsX = Array.from({ length: nSeg + 1 }, (_, i) => -hs + (i / nSeg) * BRIDGE.span);
  for (let i = 0; i < nSeg; i++) {
    const a = V(ptsX[i], deckY(ptsX[i]) - dt / 2, 0);
    const b = V(ptsX[i + 1], deckY(ptsX[i + 1]) - dt / 2, 0);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    put(
      acc,
      new THREE.BoxGeometry(a.distanceTo(b) + 0.02, dt, BRIDGE.width - 0.3),
      mid,
      i % 2 ? K.woodLight : K.wood,
      { q: qEuler(0, 0, ang), aoAmt: 0.1 },
    );
    for (const s of [-1, 1])
      put(
        acc,
        new THREE.BoxGeometry(a.distanceTo(b) + 0.02, 0.2, 0.18),
        mid
          .clone()
          .add(V(0, -0.18, 0))
          .setZ(s * (hz - 0.2)),
        K.woodDark,
        { q: qEuler(0, 0, ang), aoAmt: 0.1 },
      );
  }
  // balustrade both sides
  const nPost = hi ? 5 : 2;
  for (const s of [-1, 1]) {
    const z = s * (hz - 0.1);
    const postX = Array.from(
      { length: nPost },
      (_, i) => -hs + 0.1 + (i / (nPost - 1)) * (BRIDGE.span - 0.2),
    );
    postX.forEach((x) => {
      const y = deckY(x);
      put(acc, baseBox(0.14, BRIDGE.railH, 0.14), [x, y - 0.05, z], FRAME, { aoAmt: 0.1 });
      if (hi) put(acc, ball(0.1), [x, y + BRIDGE.railH - 0.05 + 0.08, z], G.sun, { ...lit(1.3) });
    });
    for (let i = 0; i < nPost - 1; i++) {
      const xa = postX[i];
      const xb = postX[i + 1];
      const A = V(xa, deckY(xa) + BRIDGE.railH - 0.1, z);
      const B = V(xb, deckY(xb) + BRIDGE.railH - 0.1, z);
      beam(acc, A, B, 0.1, FRAME, 0.12, 0);
      if (hi) {
        beam(acc, V(xa, deckY(xa) + 0.12, z), V(xb, deckY(xb) + 0.12, z), 0.07, FRAME, 0.1, 0);
        const lo = (x: number): number => deckY(x) + 0.18;
        const hiY = (x: number): number => deckY(x) + BRIDGE.railH - 0.2;
        pane(
          acc,
          [V(xa, lo(xa), z), V(xb, lo(xb), z), V(xb, hiY(xb), z), V(xa, hiY(xa), z)],
          [G.violet, G.pink, G.sky, G.mint][i % 4],
          0.08,
        );
      } else {
        const lo = (x: number): number => deckY(x) + 0.15;
        pane(
          acc,
          [V(xa, lo(xa), z), V(xb, lo(xb), z), V(xb, lo(xb) + 0.5, z), V(xa, lo(xa) + 0.5, z)],
          [G.violet, G.pink][i % 2],
          0.04,
        );
      }
    }
  }
  const g = acc.finish(rng, false, true);
  g.userData.hooks = {
    walk: { span: BRIDGE.span, width: BRIDGE.width, endY: BRIDGE.endY, midY: BRIDGE.midY },
  };
  if (hi) tagStained(g);
  return g;
}

/* ================================== prismArch ================================== */

/**
 * Slender walk-through arch (path along z): stone feet, white square posts with a violet band, a
 * thin white half-ring, and a six-sided glass prism (a faceted bipyramid in the glass wheel) on
 * the crown. `hooks.pool` = { at, radius, source }: the ground light pool centre (under the arch
 * centre), its radius and the prism centre, for the TASK-468 shader.
 */
function prismArch({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const px = ARCH.postX;
  for (const s of hi ? [-1, 1] : []) {
    put(acc, baseBox(0.56, 0.2, 0.56), [s * px, 0, 0], K.stone, { aoAmt: 0.25 });
    put(acc, baseBox(0.26, ARCH.clearHeight - 0.2, 0.26), [s * px, 0.2, 0], FRAME, { aoAmt: 0.15 });
    put(acc, baseBox(0.31, 0.2, 0.31), [s * px, 0.55, 0], G.violet, { aoAmt: 0 });
  }
  const crownC = ARCH.crownY - px;
  if (!hi) {
    // far proxy: posts, a coarse half ring and the prism
    for (const s of [-1, 1])
      put(acc, baseBox(0.3, ARCH.clearHeight, 0.3), [s * px, 0, 0], FRAME, { aoAmt: 0.15 });
    put(acc, new THREE.TorusGeometry(px, 0.1, 3, 6, Math.PI), [0, crownC, 0], FRAME, {
      s: [1, 1, 1.15],
      aoAmt: 0.1,
    });
    const by1 = ARCH.crownY + 0.1;
    put(
      acc,
      lathe(lathePts([0, 0], [0.2, 0.16], [0.2, ARCH.prismH - 0.2], [0, ARCH.prismH - 0.1]), 6),
      [0, by1 + 0.06, 0],
      facets([G.ruby, G.amber, G.sun, G.mint, G.sky, G.violet, G.pink], by1, ARCH.prismH, 0.35),
      { ...lit(1) },
    );
    return acc.finish(rng, false, true);
  }
  put(
    acc,
    new THREE.TorusGeometry(px, 0.1, hi ? 5 : 4, hi ? 14 : 8, Math.PI),
    [0, crownC, 0],
    FRAME,
    { s: [1, 1, 1.15], aoAmt: 0.1 },
  );
  if (hi) {
    put(acc, new THREE.TorusGeometry(px - 0.2, 0.05, 4, 12, Math.PI), [0, crownC, 0], G.lavender, {
      aoAmt: 0,
    });
    for (const s of [-1, 1])
      put(acc, ball(0.1), [s * px, ARCH.clearHeight + 0.1, 0], G.sun, { ...lit(1.3) });
  }
  const by = ARCH.crownY + 0.1;
  put(acc, cylB(0.17, 0.17, 0.08, 6), [0, by - 0.02, 0], K.brass, { aoAmt: 0 });
  put(
    acc,
    lathe(lathePts([0, 0], [0.2, 0.16], [0.2, ARCH.prismH - 0.2], [0, ARCH.prismH - 0.1]), 6),
    [0, by + 0.06, 0],
    facets([G.ruby, G.amber, G.sun, G.mint, G.sky, G.violet, G.pink], by, ARCH.prismH, 0.35),
    { ...lit(1) },
  );
  const g = acc.finish(rng, false, true);
  g.userData.hooks = {
    pool: { at: [0, 0, 0], radius: ARCH.poolRadius, source: [0, by + 0.06 + ARCH.prismH / 2, 0] },
  };
  if (hi) tagStained(g);
  return g;
}

/* ================================ stainedWindmill ================================ */

/**
 * Small windmill: an octagonal cream tower on a stone ring with a violet band, a violet cap, a
 * glowing window and a plank door, and the rotor: a brass shaft + hub and four sails, each a wood
 * spar with three stained-glass panes. The rotor is the spinning part (`aSpin`, hub on
 * `userData.hub`, axis +z, like windTurbine / windmill); the shader turns it, nothing to drive on
 * the CPU. Sail glass is lit but cannot carry the `stained` tag (the spin channel is taken).
 */
function stainedWindmill({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const spin = new Spin();
  const hub = V(0, MILL.hubY, MILL.hubZ);
  const tag = spin.tag(hub);
  // rotor parts carry the spin tag; the static body follows
  if (hi) {
    put(
      acc,
      new THREE.CylinderGeometry(0.1, 0.1, MILL.hubZ - 0.4, 6).rotateX(Math.PI / 2),
      [0, MILL.hubY, (MILL.hubZ + 0.4) / 2],
      K.brass,
      { aoAmt: 0 },
    );
    put(acc, ball(0.2), hub, K.brass, { aoAmt: 0, windAbs: tag, ao: () => 0.97 });
  }
  const a0 = 0.35;
  for (let s = 0; s < 4; s++) {
    const q = qEuler(0, 0, a0 + (s * Math.PI) / 2);
    const at = (x: number, y: number, z = 0): THREE.Vector3 =>
      hub.clone().add(V(x, y, z).applyQuaternion(q));
    put(acc, baseBox(0.13, MILL.sailLength, 0.1), at(0, 0.15), K.wood, {
      q,
      windAbs: tag,
      aoAmt: 0,
      ao: () => 0.97,
    });
    const rows = hi ? 3 : 1;
    const y0 = 0.5;
    const len = MILL.sailLength - 0.6;
    for (let r = 0; r < rows; r++) {
      const ya = y0 + (len * r) / rows;
      const yb = y0 + (len * (r + 1)) / rows;
      const c = [G.ruby, G.sun, G.sky, G.pink, G.mint, G.violet][(s * 2 + r) % 6];
      pane(acc, [at(0.07, ya), at(0.62, ya), at(0.62, yb), at(0.07, yb)], c, 0.06, 1, {
        windAbs: tag,
      });
    }
    if (hi)
      put(acc, baseBox(0.66, 0.05, 0.08), at(0.35, MILL.sailLength - 0.1), K.came, {
        q,
        windAbs: tag,
        aoAmt: 0,
        ao: () => 0.97,
      });
  }
  // static body
  if (hi)
    put(acc, cylB(MILL.baseR + 0.2, MILL.baseR + 0.2, 0.3, 8), [0, 0, 0], K.stone, { aoAmt: 0.25 });
  const seg = hi ? 8 : 5;
  // cream body, lavender band at the top (each its own lathe: bands follow the rings, not the triangles)
  put(
    acc,
    lathe(
      lathePts(
        hi ? [MILL.baseR, 0.28] : [MILL.baseR + 0.12, 0],
        [MILL.baseR - 0.05, 1.0],
        [MILL.topR + 0.1, 2.3],
      ),
      seg,
    ).rotateY(SEG / 2),
    [0, 0, 0],
    K.cream,
    { aoAmt: 0.2 },
  );
  put(
    acc,
    lathe(lathePts([MILL.topR + 0.1, 2.3], [MILL.topR, MILL.towerH]), seg).rotateY(SEG / 2),
    [0, 0, 0],
    G.lavender,
    { aoAmt: 0.1 },
  );
  if (hi)
    put(
      acc,
      cylB(MILL.topR + 0.12, MILL.topR + 0.12, 0.18, 8),
      [0, MILL.towerH - 0.06, 0],
      G.violet,
      { aoAmt: 0 },
    );
  put(
    acc,
    new THREE.ConeGeometry(MILL.topR + 0.28, 0.95, seg).translate(0, 0.475, 0),
    [0, MILL.towerH + 0.1, 0],
    ROOFS[4],
    { aoAmt: 0.05 },
  );
  if (hi) {
    put(acc, ball(0.12), [0, MILL.towerH + 1.08, 0], G.sun, { ...lit(1.3) });
    // door and lit window on the +z face... (the rotor side), arched window on the flank
    put(acc, baseBox(0.5, 0.95, 0.12), [0, 0.28, 0.9], K.woodDark, { aoAmt: 0.1 });
    put(acc, baseBox(0.28, 0.4, 0.1), [0.0, 1.8, 0.8], EMISSIVE.window, { ...lit(1) });
    put(acc, baseBox(0.28, 0.4, 0.1), [0.8, 1.6, 0.0], EMISSIVE.window, {
      ...lit(1),
      q: qEuler(0, Math.PI / 2, 0),
    });
  }
  const g = finishSpin(acc.finish(rng, false, true), acc, spin);
  g.userData.hooks = { rotor: { hub: g.userData.hub, axis: [0, 0, 1], sails: 4 } };
  return g;
}

/* ----------------------------------- registry ----------------------------------- */

export const M20_DESIGN_GEO: readonly PropGeoDef[] = [
  {
    id: 'conservatory',
    variants: 1,
    build: conservatory,
    footprint: 8,
    height: CONS.height,
    windy: false,
  },
  {
    id: 'glasshouse',
    variants: 5,
    build: glasshouse,
    footprint: 2.4,
    height: GLASSHOUSE.height,
    windy: false,
  },
  {
    id: 'glassBridge',
    variants: 1,
    build: glassBridge,
    footprint: 4.3,
    height: BRIDGE.midY + BRIDGE.railH,
    windy: false,
  },
  {
    id: 'prismArch',
    variants: 1,
    build: prismArch,
    footprint: 0.8,
    height: ARCH.height,
    windy: false,
  },
  {
    id: 'stainedWindmill',
    variants: 1,
    build: stainedWindmill,
    footprint: 1.8,
    height: MILL.height,
    windy: false,
  },
];

export type { Lod };
