import * as THREE from 'three';
import { EMISSIVE, ROCK, ROOFS, WALLS, WOOD } from '../content/palette.ts';
import type { Rng } from '../core/rng.ts';
import { col, frustum, mat, qEuler, type Acc } from './kit.ts';
import {
  TAU,
  jitterAcc,
  V,
  V2,
  baseBox,
  bevBox,
  compose,
  cycle,
  cylB,
  doorAt,
  lathe,
  prism,
  put,
  windowAt,
} from './parts.ts';
import type { BuildOpts, Lod } from './types.ts';

/** Gable roof (V slab) + wall-coloured gable triangles; ridge along z, eave at y = top. */
export function gabledRoof(
  acc: Acc,
  o: {
    top: number;
    halfW: number;
    wallHalfW: number;
    rise: number;
    length: number;
    wallLen: number;
    roof: string;
    wall: string;
    lod: Lod;
    overhang?: number;
  },
): void {
  const { top, rise, roof, wall } = o;
  const X = o.halfW;
  const t = 0.22;
  const roofFn = (p: THREE.Vector3): THREE.Color =>
    col(roof).multiplyScalar(0.92 + 0.14 * Math.min(1, Math.max(0, (p.y - top) / rise)));
  if (o.lod === 1) {
    put(acc, prism([V2(-X, 0), V2(X, 0), V2(0, rise)], o.length), [0, top, 0], roofFn, {
      aoAmt: 0.1,
    });
    return;
  }
  const slab = prism(
    [V2(-X, 0), V2(0, rise), V2(X, 0), V2(X, -t), V2(0, rise - t), V2(-X, -t)],
    o.length,
  );
  put(acc, slab, [0, top, 0], roofFn, { aoAmt: 0.05 });
  const w2 = o.wallHalfW;
  const yu = Math.max(0, rise - t - (rise / X) * w2 + 0.1) - t * 0.0;
  const tri = prism(
    [V2(-w2, -t), V2(w2, -t), V2(w2, yu), V2(0, rise - t + 0.1), V2(-w2, yu)],
    o.wallLen,
  );
  put(acc, tri, [0, top, 0], wall, { aoAmt: 0.1 });
}

export interface HouseOpts {
  rng: Rng;
  lod: Lod;
  w: number;
  d: number;
  /** y of the floor line (wall base). */
  y0: number;
  wallH: number;
  rise: number;
  wall: string;
  roof: string;
  trim: string;
  /** Total windows (front pair first, then sides). */
  nWin: number;
  chimney: boolean;
  foundation: boolean;
  /** Door x offset on the front (+z) wall. */
  doorX?: number;
}

/** Shared cottage body: walls, gable roof, door, windows, chimney, foundation. */
export function house(acc: Acc, o: HouseOpts): void {
  const { w, d, y0, wallH, lod } = o;
  const top = y0 + wallH;
  if (o.foundation && lod === 0) {
    put(acc, baseBox(w + 0.24, y0 + 0.1, d + 0.24), [0, 0, 0], col(ROCK[0]), { aoAmt: 0.25 });
  }
  if (lod === 0) {
    put(acc, bevBox(w, wallH, d, 0.12), [0, y0 + wallH / 2, 0], o.wall, { aoAmt: 0.18 });
  } else {
    put(acc, new THREE.BoxGeometry(w, wallH, d), [0, y0 + wallH / 2, 0], o.wall, { aoAmt: 0.15 });
  }
  gabledRoof(acc, {
    top,
    halfW: w / 2 + 0.25,
    wallHalfW: w / 2,
    rise: o.rise,
    length: d + 0.5,
    wallLen: d - 0.02,
    roof: o.roof,
    wall: o.wall,
    lod,
  });
  if (lod === 1) return;
  const dx = o.doorX ?? 0;
  doorAt(acc, V(dx, y0, d / 2), 0, WOOD.dark, o.trim);
  put(acc, baseBox(1.3, 0.14, 0.4), [dx, 0.0, d / 2 + 0.2], col(ROCK[1]), { aoAmt: 0.2 });
  const winY = y0 + 1.3;
  const glow = col(EMISSIVE.window);
  const spots: Array<[THREE.Vector3, number]> = [
    [V(dx + (dx > -0.2 ? -1 : 1) * (w / 2 - 0.5), winY, d / 2), 0],
    [V(dx + (dx > -0.2 ? 1 : -1) * (w / 2 - 0.5), winY, d / 2), 0],
    [V(w / 2, winY, 0), Math.PI / 2],
    [V(-w / 2, winY, 0.1), -Math.PI / 2],
  ];
  // Door at x=0 -> first two windows flank it; keep inside the wall.
  for (let i = 0; i < Math.min(o.nWin, 4); i++) {
    const [at, yaw] = spots[i];
    windowAt(acc, { at, yaw, frame: o.trim, glow, sill: yaw === 0 });
  }
  if (o.chimney) {
    const cx = w * 0.25;
    const cz = -d * 0.18;
    const hTop = top + o.rise * 0.6 + 0.55;
    const chim = baseBox(0.5, hTop - (top + 0.2), 0.5);
    put(acc, chim, [cx, top + 0.2, cz], col(ROCK[1]), { aoAmt: 0.12 });
    put(acc, baseBox(0.64, 0.14, 0.64), [cx, hTop, cz], col(ROCK[0]), { aoAmt: 0 });
  }
}

const cottagePalette = [
  { wall: WALLS[0], roof: ROOFS[0] },
  { wall: WALLS[2], roof: ROOFS[2] },
  { wall: WALLS[3], roof: ROOFS[4] },
] as const;

export function cottage({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('cottage');
  const acc = jitterAcc(rng);
  const p = cycle(cottagePalette, variant);
  house(acc, {
    rng: r,
    lod,
    w: 3,
    d: 3,
    y0: 0.25,
    wallH: 2.0,
    rise: 1.35,
    wall: p.wall,
    roof: p.roof,
    trim: WOOD.planks,
    nWin: 2 + (variant % 3) + r.int(0, 0),
    chimney: variant !== 1,
    foundation: true,
    doorX: 0,
  });
  return acc.finish(rng, false, true);
}

export function stiltHut({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('stilt');
  const acc = jitterAcc(rng);
  const six = variant % 2 === 1;
  const deckTop = 1.2;
  const px = six ? [-1.45, 0, 1.45] : [-1.45, 1.45];
  const posts: Array<[number, number]> = [];
  for (const x of px) for (const z of [-1.45, 1.45]) posts.push([x, z]);
  for (const [x, z] of posts) {
    const tilt = lod === 0 ? r.range(-0.03, 0.03) : 0;
    put(acc, cylB(0.17, 0.13, deckTop, lod === 0 ? 6 : 4, true), [x, 0, z], col(WOOD.logs), {
      q: qEuler(tilt, 0, tilt),
      aoAmt: 0.3,
    });
    if (lod === 0) put(acc, cylB(0.2, 0.2, 0.1, 6), [x, 0, z], col(WOOD.dark), { aoAmt: 0.3 });
  }
  const deckW = 3.5;
  if (lod === 0)
    put(acc, bevBox(deckW, 0.24, deckW + 0.4, 0.06), [0, deckTop - 0.1, 0.2], col(WOOD.planks), {
      aoAmt: 0.1,
    });
  else put(acc, baseBox(deckW, 0.24, deckW + 0.4), [0, deckTop - 0.22, 0.2], col(WOOD.planks));
  const pal = cycle(cottagePalette, variant + 1);
  house(acc, {
    rng: r,
    lod,
    w: 2.7,
    d: 2.5,
    y0: deckTop + 0.02,
    wallH: 2.0,
    rise: 1.25,
    wall: pal.wall,
    roof: pal.roof,
    trim: WOOD.planks,
    nWin: 3,
    chimney: variant === 0,
    foundation: false,
    doorX: 0,
  });
  if (lod === 0) {
    // ladder at the front-left of the deck
    const lx = -1.3;
    const top = V(lx, deckTop, 1.95);
    const bot = V(lx, 0, 2.55);
    for (const dx of [-0.2, 0.2]) {
      const s = frustum(
        top.clone().add(V(dx, 0.35, 0)),
        bot.clone().add(V(dx, 0, 0)),
        0.05,
        0.05,
        4,
      );
      acc.add(s.geo, { m: s.m, color: col(WOOD.dark), windMul: 0, aoAmt: 0.1 });
    }
    for (let i = 0; i < 5; i++) {
      const t = (i + 0.6) / 5.4;
      const p = bot.clone().lerp(top, t);
      put(acc, new THREE.BoxGeometry(0.46, 0.06, 0.07), p, col(WOOD.planks), { aoAmt: 0 });
    }
  }
  return acc.finish(rng, false, true);
}

export function towerHouse({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng);
  const wall = cycle([WALLS[1], WALLS[2], WALLS[3]], variant);
  const roof = cycle([ROOFS[5], ROOFS[1], ROOFS[2]], variant);
  const H = 3.9;
  if (lod === 0) {
    put(acc, baseBox(2.9, 0.3, 2.9), [0, 0, 0], col(ROCK[0]), { aoAmt: 0.25 });
    put(acc, bevBox(2.5, H - 0.2, 2.5, 0.12), [0, 0.3 + (H - 0.2) / 2, 0], wall, { aoAmt: 0.2 });
  } else {
    put(acc, baseBox(2.5, H, 2.5), [0, 0, 0], wall, { aoAmt: 0.2 });
  }
  // cone roof, 8 sided, wide overhang
  put(
    acc,
    new THREE.ConeGeometry(2.05, 2.3, lod === 0 ? 8 : 6),
    [0, H + 1.15, 0],
    (p) => col(roof).multiplyScalar(0.9 + 0.2 * Math.min(1, (p.y - H) / 2.3)),
    { aoAmt: 0.05, q: qEuler(0, TAU / 16, 0) },
  );
  // balcony ring (disc + railing posts + rail)
  const by = 2.05;
  put(acc, cylB(1.85, 1.85, 0.16, lod === 0 ? 10 : 6), [0, by, 0], col(WOOD.planks), {
    aoAmt: 0.1,
  });
  if (lod === 0) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      put(
        acc,
        cylB(0.05, 0.05, 0.55, 4, true),
        [Math.cos(a) * 1.78, by + 0.16, Math.sin(a) * 1.78],
        col(WOOD.logs),
        { aoAmt: 0.1 },
      );
    }
    put(acc, cylB(1.82, 1.82, 0.08, 10, true), [0, by + 0.68, 0], col(WOOD.dark), {
      double: true,
      aoAmt: 0,
    });
    doorAt(acc, V(0, 0.3, 1.25), 0, WOOD.dark, WOOD.planks);
    const glow = col(EMISSIVE.window);
    const spots: Array<[THREE.Vector3, number]> = [
      [V(1.25, 1.15, 0.0), Math.PI / 2],
      [V(-1.25, 1.15, 0.0), -Math.PI / 2],
      [V(0, 3.2, 1.25), 0],
      [V(1.25, 3.2, 0), Math.PI / 2],
      [V(-1.25, 3.2, 0), -Math.PI / 2],
      [V(0, 3.2, -1.25), Math.PI],
    ];
    for (const [at, yaw] of spots)
      windowAt(acc, { at, yaw, frame: WOOD.planks, glow, w: 0.5, h: 0.7 });
  }
  return acc.finish(rng, false, true);
}

const OCT = TAU / 8;
/** Body wall lean (rad): taper 0.8 u over 6.5 u, projected on an octagon facet. */
const WM_LEAN = 0.113;
const wmRadius = (y: number): number => 1.85 - (0.8 * (y - 0.5)) / 6.5;

export function windmill({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng);
  const wall = cycle([WALLS[0], WALLS[1]], variant);
  const roof = cycle([ROOFS[1], ROOFS[5]], variant);
  const seg = lod === 0 ? 8 : 6;
  const body = lathe(
    lod === 0
      ? [
          [2.1, 0],
          [2.1, 0.5],
          [wmRadius(0.5), 0.5],
          [wmRadius(7), 7],
        ]
      : [
          [2.0, 0],
          [wmRadius(7), 7],
        ],
    seg,
  ).rotateY(-OCT / 2);
  put(acc, body, [0, 0, 0], (p) => (p.y < 0.52 ? col(ROCK[0]) : col(wall)), { aoAmt: 0.22 });
  // dome cap
  put(
    acc,
    new THREE.SphereGeometry(1.5, seg, lod === 0 ? 3 : 2, 0, TAU, 0, Math.PI / 2),
    [0, 6.95, 0],
    col(roof),
    {
      aoAmt: 0.05,
    },
  );
  const hubY = 6.3;
  const apo = wmRadius(hubY) * Math.cos(OCT / 2);
  const hub = V(0, hubY, 1.55);
  if (lod === 0) {
    put(acc, cylB(0.12, 0.12, 1.4, 5, true), [0, hubY, apo - 0.2], col(WOOD.dark), {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0,
    });
    put(
      acc,
      new THREE.CylinderGeometry(0.16, 0.16, 1.3, 5, 1, true),
      [0, hubY, apo + 0.45],
      col(WOOD.dark),
      { q: qEuler(Math.PI / 2, 0, 0), aoAmt: 0 },
    );
    put(acc, new THREE.IcosahedronGeometry(0.34, 0), hub, col(WOOD.logs), { windAbs: 2, aoAmt: 0 });
    // door (+x face) and two windows
    doorAt(
      acc,
      V(wmRadius(0.5) * Math.cos(OCT / 2) - 0.04, 0.5, 0),
      Math.PI / 2,
      WOOD.dark,
      WOOD.planks,
      0.9,
      1.6,
      WM_LEAN,
    );
    const glow = col(EMISSIVE.window);
    windowAt(acc, {
      at: V(-wmRadius(3.6) * Math.cos(OCT / 2), 3.6, 0),
      yaw: -Math.PI / 2,
      frame: WOOD.planks,
      glow,
      w: 0.5,
      h: 0.65,
      lean: WM_LEAN,
    });
    windowAt(acc, {
      at: V(wmRadius(4.6) * Math.cos(OCT / 2), 4.6, 0),
      yaw: Math.PI / 2,
      frame: WOOD.planks,
      glow,
      w: 0.5,
      h: 0.65,
      lean: WM_LEAN,
    });
  }
  // blades: arms along local +y, sail lattice on local +x; rotated about the hub z axis
  const bladeCol = col(WOOD.planks);
  const sailCol = col(WALLS[1]);
  for (let k = 0; k < 4; k++) {
    const M = mat(hub, qEuler(0, 0, k * (TAU / 4) + 0.35));
    const part = (g: THREE.BufferGeometry, p: [number, number, number], c: THREE.Color): void => {
      acc.add(g, { m: compose(M, mat(p)), color: c, windAbs: 2, aoAmt: 0, ao: () => 0.97 });
    };
    if (lod === 0) {
      part(new THREE.BoxGeometry(0.2, 3.25, 0.14), [0, 1.875, 0], bladeCol);
      part(new THREE.BoxGeometry(0.13, 2.55, 0.12), [1.0, 2.25, 0.05], bladeCol);
      for (let i = 0; i < 4; i++) {
        part(new THREE.BoxGeometry(0.95, 0.12, 0.1), [0.55, 1.1 + i * 0.8, 0.05], sailCol);
      }
      for (const y of [2.3, 3.1]) {
        part(new THREE.BoxGeometry(0.8, 0.66, 0.04), [0.55, y, 0.02], sailCol);
      }
    } else {
      part(new THREE.BoxGeometry(0.22, 3.4, 0.12), [0, 1.8, 0], bladeCol);
      part(new THREE.BoxGeometry(0.9, 2.4, 0.08), [0.5, 2.2, 0.05], sailCol);
    }
  }
  const g = acc.finish(rng, false, true);
  const sc = acc.xf?.elements ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  g.userData.hub = [hub.x * sc[0], hub.y * sc[5], hub.z * sc[10]];
  // Blade spin (MAR_SPIN): aSpin = (hub xyz, 1) on blade + hub-cap vertices, 0 elsewhere.
  // Rotation axis is local +z (the blade plane faces +z, like the door-less front).
  // Blades get wind = 0 so they spin instead of swaying.
  const windA = g.getAttribute('wind') as THREE.BufferAttribute;
  const spin = new Float32Array(windA.count * 4);
  const [hx, hy, hz] = g.userData.hub as number[];
  for (let i = 0; i < windA.count; i++) {
    if (windA.getX(i) >= 1.5) {
      spin.set([hx, hy, hz, 1], i * 4);
      windA.setX(i, 0);
    }
  }
  g.setAttribute('aSpin', new THREE.BufferAttribute(spin, 4));
  g.userData.spinAxis = [0, 0, 1];
  return g;
}

export function barn({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng);
  const wall = variant % 2 === 0 ? ROOFS[1] : WALLS[3];
  const roof = variant % 2 === 0 ? ROOFS[5] : ROOFS[0];
  const trim = WALLS[1];
  const y0 = 0.2;
  const wh = 2.4;
  const top = y0 + wh;
  if (lod === 0) {
    put(acc, baseBox(6.2, 0.3, 4.2), [0, 0, 0], col(ROCK[0]), { aoAmt: 0.25 });
    put(acc, bevBox(6, wh, 4, 0.12), [0, y0 + wh / 2, 0], wall, { aoAmt: 0.18 });
  } else {
    put(acc, baseBox(6, wh + y0, 4), [0, 0, 0], wall, { aoAmt: 0.18 });
  }
  // gambrel profile across z, extruded along x
  const hw = 2.3;
  const pts = [
    V2(-hw, -0.16),
    V2(hw, -0.16),
    V2(hw, 0.05),
    V2(1.5, 1.35),
    V2(0, 2.1),
    V2(-1.5, 1.35),
    V2(-hw, 0.05),
  ];
  const roofG = prism(pts, 6.7).rotateY(Math.PI / 2);
  put(
    acc,
    roofG,
    [0, top, 0],
    (p) => col(roof).multiplyScalar(0.92 + 0.14 * Math.min(1, (p.y - top) / 2.1)),
    { aoAmt: 0.05 },
  );
  if (lod === 1) return acc.finish(rng, false, true);
  // gable-end fill (wall coloured), slightly inside the roof
  const fill = prism(
    [
      V2(-2, -0.2),
      V2(2, -0.2),
      V2(2, 0.1),
      V2(1.45, 1.2),
      V2(0, 1.95),
      V2(-1.45, 1.2),
      V2(-2, 0.1),
    ],
    5.98,
  ).rotateY(Math.PI / 2);
  put(acc, fill, [0, top, 0], wall, { aoAmt: 0.1 });
  // X doors on the +x gable end
  const dx = 3.0;
  put(acc, new THREE.BoxGeometry(0.1, 2.2, 2.3), [dx + 0.01, y0 + 1.1, 0], col(trim), { aoAmt: 0 });
  for (const s of [-1, 1]) {
    put(
      acc,
      new THREE.BoxGeometry(0.1, 2.0, 1.05),
      [dx + 0.06, y0 + 1.1, s * 0.55],
      col(WOOD.planks),
      { aoAmt: 0.05 },
    );
    put(acc, new THREE.BoxGeometry(0.08, 2.1, 0.14), [dx + 0.12, y0 + 1.1, s * 0.55], col(trim), {
      q: qEuler(s * 0.46, 0, 0),
      aoAmt: 0,
    });
    put(acc, new THREE.BoxGeometry(0.08, 2.1, 0.14), [dx + 0.12, y0 + 1.1, s * 0.55], col(trim), {
      q: qEuler(-s * 0.46, 0, 0),
      aoAmt: 0,
    });
  }
  const glow = col(EMISSIVE.window);
  windowAt(acc, { at: V(3.0, top + 1.0, 0), yaw: Math.PI / 2, frame: trim, glow, w: 0.6, h: 0.7 });
  windowAt(acc, { at: V(-1.4, y0 + 1.4, 2.0), yaw: 0, frame: trim, glow });
  windowAt(acc, { at: V(1.4, y0 + 1.4, 2.0), yaw: 0, frame: trim, glow });
  windowAt(acc, {
    at: V(-3.0, top + 1.0, 0),
    yaw: -Math.PI / 2,
    frame: trim,
    glow,
    w: 0.6,
    h: 0.7,
  });
  return acc.finish(rng, false, true);
}

export function logCabin({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('cabin');
  const acc = jitterAcc(rng);
  const logs = variant % 2 === 0 ? [WOOD.logs, WOOD.dark] : [WOOD.dark, WOOD.logs];
  const roof = variant % 2 === 0 ? ROOFS[3] : ROOFS[6];
  const n = 6;
  const pitch = 0.4;
  const rad = 0.22;
  const radial = 5;
  if (lod === 1) {
    put(acc, baseBox(4.2, n * pitch + 0.2, 3.4), [0, 0, 0], col(logs[0]), { aoAmt: 0.2 });
    gabledRoof(acc, {
      top: 0.22 + n * pitch,
      halfW: 1.95,
      wallHalfW: 1.5,
      rise: 1.25,
      length: 4.9,
      wallLen: 4.2,
      roof,
      wall: logs[0],
      lod,
    });
    return acc.finish(rng, false, true);
  }
  for (let i = 0; i < n; i++) {
    const y = 0.22 + i * pitch;
    const c = col(logs[i % 2]);
    for (const s of [-1, 1]) {
      // front/back logs run along x and poke out past the corners
      const jx = lod === 0 ? r.range(-0.05, 0.05) : 0;
      put(acc, new THREE.CylinderGeometry(rad, rad, 4.5, radial, 1, false), [jx, y, s * 1.5], c, {
        q: qEuler(0, 0, Math.PI / 2),
        aoAmt: 0.1,
        cullY: -1,
      });
      // side logs run along z between them (open ends are hidden)
      put(
        acc,
        new THREE.CylinderGeometry(rad, rad, 3.0, radial, 1, true),
        [s * 1.9, y + pitch / 2, 0],
        c,
        {
          q: qEuler(Math.PI / 2, 0, 0),
          aoAmt: 0.1,
        },
      );
    }
  }
  const top = 0.22 + n * pitch;
  gabledRoof(acc, {
    top,
    halfW: 1.95,
    wallHalfW: 1.5,
    rise: 1.25,
    length: 4.9,
    wallLen: 4.2,
    roof,
    wall: logs[0],
    lod,
  });
  doorAt(acc, V(-0.7, 0.2, 1.74), 0, WOOD.planks, WALLS[1]);
  windowAt(acc, {
    at: V(1.1, 1.45, 1.76),
    yaw: 0,
    frame: WALLS[1],
    glow: col(EMISSIVE.window),
    sill: true,
  });
  windowAt(acc, {
    at: V(0, 1.45, -1.76),
    yaw: Math.PI,
    frame: WALLS[1],
    glow: col(EMISSIVE.window),
  });
  put(acc, baseBox(0.5, 1.4, 0.5), [1.4, top - 0.4, -0.4], col(ROCK[1]), { aoAmt: 0.12 });
  put(acc, baseBox(0.64, 0.14, 0.64), [1.4, top + 1.0, -0.4], col(ROCK[0]), { aoAmt: 0 });
  // porch step
  put(acc, baseBox(1.5, 0.14, 0.45), [-0.7, 0, 1.95], col(WOOD.planks), { aoAmt: 0.2 });
  return acc.finish(rng, false, true);
}

export function marketStall({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('stall');
  const acc = jitterAcc(rng);
  const a = cycle([ROOFS[0], ROOFS[2], ROOFS[3]], variant);
  const b = WALLS[1];
  const stripes = lod === 0 ? 6 : 2;
  const wTot = 2.2;
  const hBack = 2.4;
  const hFront = 2.0;
  const dep = 1.7;
  const slope = Math.atan2(hBack - hFront, dep);
  for (const [x, z, h] of [
    [-0.95, -0.65, hBack - 0.1],
    [0.95, -0.65, hBack - 0.1],
    [-0.95, 0.65, hFront - 0.1],
    [0.95, 0.65, hFront - 0.1],
  ] as const) {
    put(
      acc,
      lod === 0 ? cylB(0.08, 0.07, h, 5) : baseBox(0.12, h, 0.12),
      [x, 0, z],
      col(WOOD.logs),
      { aoAmt: 0.2 },
    );
  }
  const sw = wTot / stripes;
  for (let i = 0; i < stripes; i++) {
    const c = col(i % 2 === 0 ? a : b);
    const x = -wTot / 2 + sw * (i + 0.5);
    put(acc, new THREE.BoxGeometry(sw, 0.08, dep), [x, (hBack + hFront) / 2 + 0.02, 0], c, {
      q: qEuler(slope, 0, 0),
      aoAmt: 0,
    });
    if (lod === 0)
      put(acc, new THREE.BoxGeometry(sw, 0.26, 0.05), [x, hFront - 0.1, dep / 2 + 0.02], c, {
        aoAmt: 0,
      });
  }
  // counter crate + produce
  put(
    acc,
    lod === 0 ? bevBox(1.8, 0.8, 0.7, 0.05) : new THREE.BoxGeometry(1.8, 0.8, 0.7),
    [0, 0.4, 0.45],
    col(WOOD.planks),
    { aoAmt: 0.2 },
  );
  if (lod === 0) {
    put(acc, baseBox(1.9, 0.07, 0.8), [0, 0.8, 0.45], col(WOOD.logs), { aoAmt: 0 });
    const fruit = [ROOFS[0], ROOFS[3], ROOFS[1], ROOFS[6]];
    for (let i = 0; i < 4; i++) {
      put(
        acc,
        new THREE.IcosahedronGeometry(0.15, 0),
        [-0.65 + i * 0.43 + r.range(-0.04, 0.04), 1.0, 0.45],
        col(fruit[(i + variant) % 4]),
        { aoAmt: 0.1 },
      );
    }
  }
  return acc.finish(rng, false, true);
}
