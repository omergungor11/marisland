/**
 * Themed office shells (TASK-303, ART_BIBLE §5 + phase-3 §4.2): 18 defs × 2 variants × LOD0/1
 * plus the shared `officeLod1` proxy and the research `telescope`. Shells are hollow with window
 * openings so the tier-2 `officeInterior` (geo/interiors.ts) is visible through them. Lot-local
 * frame: +z = door side, footprints from content/offices.ts OFFICE_DEFS. Emissive 2 = screen /
 * LED class (TASK-305), 1 = window / lamp glow, fractions = soft glow.
 */
import * as THREE from 'three';
import { THEMES } from '../content/themes.ts';
import { OFFICE_COLORS as C, OFFICE_PAL, type OfficePal } from '../content/palette-offices.ts';
import type { ThemeId } from '../world/types.ts';
import { col, frustum, qEuler, type Acc } from './kit.ts';
import { gabledRoof } from './buildings.ts';
import {
  FLOOR_Y,
  STILT_FLOOR,
  Spin,
  boxShell,
  dish,
  domeCap,
  door,
  easel,
  fan,
  finishSpin,
  flatRoof,
  glyph,
  plant,
  rack,
  sawtoothRoof,
  sculpture,
  solarRow,
  trafficCone,
  vent,
  win,
  winRow,
  type Opening,
  type ShellOpts,
} from './office-kit.ts';
import { TAU, V, V2, baseBox, cylB, jitterAcc, prism, put } from './parts.ts';
import type { BuildOpts, Lod } from './types.ts';

const pal = (theme: ThemeId, variant: number): OfficePal => OFFICE_PAL[theme][variant % 2];
const accentOf = (theme: ThemeId): string => THEMES[theme].accent;
const lighten = (hex: string, k: number): string =>
  `#${col(hex).lerp(new THREE.Color('#FFFFFF'), k).getHexString()}`;

/** Emissive wide strip on a wall face (outside, facing `yaw`). */
function band(
  acc: Acc,
  at: THREE.Vector3,
  yaw: number,
  w: number,
  h: number,
  color: string,
  emissive = 1,
): void {
  put(acc, new THREE.PlaneGeometry(w, h), at, color, {
    q: qEuler(0, yaw, 0),
    emissive,
    aoAmt: 0,
    ao: () => 1,
  });
}

/** Thin vertical bars across an opening (glass-front mullions). */
function mullions(
  acc: Acc,
  z: number,
  xs: readonly number[],
  y0: number,
  y1: number,
  color: string,
): void {
  for (const x of xs) put(acc, baseBox(0.06, y1 - y0, 0.1), [x, y0, z], color, { aoAmt: 0 });
}

/** Megaphone speaker: short neck + flared horn along +z of `yaw`. */
function megaphone(acc: Acc, at: THREE.Vector3, yaw: number, color: string, lod: Lod): void {
  const q = qEuler(0, yaw, 0);
  put(acc, cylB(0.04, 0.04, 0.3, 4, true), at, C.steel, { aoAmt: 0 });
  const horn = new THREE.CylinderGeometry(0.26, 0.09, 0.42, lod === 0 ? 8 : 5, 1, true);
  const hp = at.clone().add(V(0, 0.34, 0.21).applyQuaternion(q));
  put(acc, horn, hp, color, {
    q: q.clone().multiply(qEuler(Math.PI / 2, 0, 0)),
    double: true,
    aoAmt: 0.05,
  });
  put(
    acc,
    new THREE.CylinderGeometry(0.1, 0.1, 0.12, 6),
    at.clone().add(V(0, 0.34, -0.02).applyQuaternion(q)),
    C.dark,
    {
      q: q.clone().multiply(qEuler(Math.PI / 2, 0, 0)),
      aoAmt: 0,
    },
  );
}

/** Mast with a lamp ball on top (emissive 1). */
function beacon(acc: Acc, at: THREE.Vector3, h: number, lamp: string, lod: Lod): void {
  put(acc, cylB(0.05, 0.04, h, 4, true), at, C.steel, { aoAmt: 0 });
  put(
    acc,
    new THREE.IcosahedronGeometry(lod === 0 ? 0.2 : 0.17, lod === 0 ? 1 : 0),
    at.clone().add(V(0, h + 0.1, 0)),
    lamp,
    {
      emissive: 1,
      ao: () => 1,
    },
  );
}

/* ---------------------- LOD1 helpers (TASK-378, D-031/D-032) ---------------------- */

/** Frame width of a LOD0 opening (office-kit wallSlab `f`): the frame colour is part of the window's mean. */
const FRAME_W = 0.07;

/** LOD1 openings: one flat emissive-tinted quad per opening on the outer wall face (2 tris each). */
function farWindows(acc: Acc, s: ShellOpts, inside?: string): void {
  const t = s.t ?? 0.16;
  const base = (s.y0 ?? 0) + (s.noFloor ? 0 : FLOOR_Y);
  const hh = s.h - (s.noFloor ? 0 : FLOOR_Y);
  const walls: Array<[readonly Opening[] | undefined, number, THREE.Vector3]> = [
    [s.front, 0, V(0, base, s.d / 2 - t / 2)],
    [s.back, Math.PI, V(0, base, -s.d / 2 + t / 2)],
    [s.right, Math.PI / 2, V(s.w / 2 - t / 2, base, 0)],
    [s.left, -Math.PI / 2, V(-s.w / 2 + t / 2, base, 0)],
  ];
  for (const [ops, yaw, at] of walls) {
    const q = qEuler(0, yaw, 0);
    for (const o of ops ?? []) {
      const y1 = Math.min(o.y1, hh);
      const h = y1 - o.y0;
      if (h <= 0.05) continue;
      const p = V((o.x0 + o.x1) / 2, o.y0 + h / 2, t / 2 + 0.02)
        .applyQuaternion(q)
        .add(at);
      // what the hole shows at LOD0: the pale interior, framed by the roof-coloured jambs
      const w = o.x1 - o.x0;
      const frameA = (2 * (w + h) * FRAME_W) / (w * h + 2 * (w + h) * FRAME_W);
      const c = col(s.inner);
      if (s.glow !== false) {
        // the lit band on the inner back wall (boxShell: 0.5 high, centred 1.25 above the floor line)
        const ov = Math.max(0, Math.min(o.y1, 1.5) - Math.max(o.y0, 1.0)) / h;
        c.lerp(col(s.glow ?? '#FFC870'), Math.min(1, ov * 1.6) * (s.noFloor ? 0 : 1));
      }
      if (s.frame) c.lerp(col(s.frame), frameA);
      if (inside) c.lerp(col(inside), 0.5);
      put(acc, new THREE.PlaneGeometry(w, h), p, `#${c.getHexString()}`, {
        q,
        emissive: 0.4,
        aoAmt: 0,
        ao: () => 1,
      });
    }
  }
}

/** `boxShell`, plus (LOD1) the window quads so the far block keeps its window band. */
function shell(acc: Acc, s: ShellOpts, lod: Lod, inside?: string): void {
  boxShell(acc, s, lod);
  if (lod === 1) farWindows(acc, s, inside);
}

/** `flatRoof`, plus (LOD1) the parapet's top face as flat quads: from above it is part of the roof colour mix. */
function roofFlat(acc: Acc, o: Parameters<typeof flatRoof>[1]): void {
  flatRoof(acc, o);
  if (o.lod === 0 || !o.parapet) return;
  const over = o.over ?? 0.12;
  const wx = o.w + over * 2;
  const wz = o.d + over * 2;
  const y = o.y + (o.thick ?? 0.18) + o.parapet + 0.005;
  const q = qEuler(-Math.PI / 2, 0, 0);
  const flat = { q, aoAmt: 0, ao: () => 1 };
  put(acc, new THREE.PlaneGeometry(wx, 0.1), [0, y, wz / 2 - 0.05], o.trim, flat);
  put(acc, new THREE.PlaneGeometry(wx, 0.1), [0, y, -wz / 2 + 0.05], o.trim, flat);
  put(acc, new THREE.PlaneGeometry(0.1, wz - 0.2), [wx / 2 - 0.05, y, 0], o.trim, flat);
  put(acc, new THREE.PlaneGeometry(0.1, wz - 0.2), [-wx / 2 + 0.05, y, 0], o.trim, flat);
}

/* ----------------------------------- HQ ----------------------------------- */

export function hqOffice({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const p = pal('hq', variant);
  const acc1 = accentOf('hq');
  const hi = lod === 0;
  const W = 6;
  const D = 5;
  const H = 3.2;
  const t = 0.16;
  shell(
    acc,
    {
      w: W,
      d: D,
      h: H,
      outer: p.wall,
      inner: C.inner,
      frame: p.roof,
      front: [win(-2.4, 0.8, 0.8, 2.2), win(0, 3.0, 0, 2.4), win(2.4, 0.8, 0.8, 2.2)],
      back: winRow(-2.3, 2.3, 3, 0.5, 0.8, 2.2),
      left: [win(-1.2, 1.0, 0.8, 2.2), win(1.2, 1.0, 0.8, 2.2)],
      right: [win(-1.2, 1.0, 0.8, 2.2), win(1.2, 1.0, 0.8, 2.2)],
    },
    lod,
  );
  roofFlat(acc, { w: W, d: D, y: H, roof: p.roof, trim: p.trim, parapet: 0.22, lod });
  const ry = H + 0.18;
  if (hi) {
    mullions(acc, D / 2 - t / 2 + 0.02, [-0.75, 0, 0.75], FLOOR_Y, 2.4, p.roof);
    // entrance canopy + glyph sign
    put(acc, baseBox(3.4, 0.1, 0.9), [0, 2.5, D / 2 + 0.3], acc1, { aoAmt: 0.05 });
    for (const x of [-1.6, 1.6])
      put(acc, cylB(0.05, 0.05, 2.5, 4, true), [x, 0, D / 2 + 0.68], C.white, { aoAmt: 0 });
    glyph(acc, 'hq', V(0, 2.88, D / 2 + 0.05), 0, 0.5, acc1);
    put(acc, baseBox(3.2, 0.1, 0.5), [0, 0, D / 2 + 0.25], C.plinth, { aoAmt: 0.2 });
  }
  // penthouse + beacon
  put(acc, baseBox(2.2, 0.8, 1.6), [variant === 0 ? 0 : -1.4, ry, -0.6], p.trim, { aoAmt: 0.15 });
  put(acc, baseBox(2.4, 0.12, 1.8), [variant === 0 ? 0 : -1.4, ry + 0.8, -0.6], acc1, { aoAmt: 0 });
  beacon(acc, V(variant === 0 ? 0 : -1.4, ry + 0.92, -0.6), 0.9, lighten(acc1, 0.3), lod);
  if (hi) {
    band(acc, V(0, H - 0.25, D / 2 + 0.01), 0, 5.6, 0.12, lighten(acc1, 0.4), 0.6);
    if (variant === 1) {
      // flag pole + rooftop planters
      put(acc, cylB(0.04, 0.04, 1.6, 4, true), [2.5, ry, 1.9], C.steelLight, { aoAmt: 0 });
      put(acc, new THREE.PlaneGeometry(0.7, 0.4), [2.86, ry + 1.35, 1.9], acc1, {
        double: true,
        aoAmt: 0,
        ao: () => 1,
      });
      for (const x of [0.6, 1.4, 2.2])
        put(acc, baseBox(0.6, 0.2, 0.4), [x, ry, -1.8], C.plantDark, { aoAmt: 0.1 });
    } else {
      for (const x of [-2.4, 2.4]) plant(acc, V(x, ry, 1.9), 1.2, 0);
    }
  }
  return acc.finish(rng, false, true);
}

export function hqAnnex({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const p = pal('hq', variant);
  const acc1 = accentOf('hq');
  const hi = lod === 0;
  const W = 3;
  const H = 5.4;
  const bw = 2.6;
  put(acc, baseBox(W, 0.2, W), [0, 0, 0], C.plinth, { aoAmt: 0.2 });
  const band2: Opening[] = [win(0, 1.6, 4.1, 5.0)];
  shell(
    acc,
    {
      w: bw,
      d: bw,
      h: H,
      outer: p.wall,
      inner: C.inner,
      frame: p.roof,
      front: [door(0, 0.95, 1.8), win(0, 0.7, 2.5, 3.3), ...band2],
      back: [win(0, 0.7, 1.2, 2.3), ...band2],
      left: [win(0, 0.7, 1.2, 2.3), ...band2],
      right: [win(0, 0.7, 1.2, 2.3), ...band2],
    },
    lod,
  );
  // accent band + hip roof + lantern
  put(acc, baseBox(bw + 0.2, 0.2, bw + 0.2), [0, H - 0.1, 0], acc1, { aoAmt: 0.05 });
  const ry = H + 0.1;
  if (variant === 0) {
    put(acc, new THREE.ConeGeometry(2.0, 1.4, 4).translate(0, 0.7, 0), [0, ry, 0], p.roof, {
      q: qEuler(0, Math.PI / 4, 0),
      aoAmt: 0.05,
    });
    beacon(acc, V(0, ry + 1.3, 0), 0.8, lighten(acc1, 0.3), lod);
  } else {
    put(acc, baseBox(bw + 0.3, 0.14, bw + 0.3), [0, ry - 0.05, 0], p.roof, { aoAmt: 0.05 });
    put(acc, baseBox(1.0, 0.7, 1.0), [0, ry + 0.09, 0], lighten(acc1, 0.35), {
      emissive: 0.8,
      aoAmt: 0,
      ao: () => 1,
    });
    put(
      acc,
      new THREE.ConeGeometry(0.85, 0.7, 4).translate(0, 0.35, 0),
      [0, ry + 0.79, 0],
      p.roof,
      {
        q: qEuler(0, Math.PI / 4, 0),
        aoAmt: 0,
      },
    );
    beacon(acc, V(0, ry + 1.45, 0), 0.6, lighten(acc1, 0.3), lod);
  }
  if (hi) {
    glyph(acc, 'hq', V(0, 4.0, bw / 2 + 0.05), 0, 0.5, acc1);
    for (const y of [1.2, 2.4, 3.6])
      put(acc, baseBox(bw + 0.06, 0.07, bw + 0.06), [0, y, 0], p.trim, { aoAmt: 0 });
  } else {
    band(acc, V(0, 4.6, bw / 2 + 0.01), 0, 1.6, 0.8, lighten(acc1, 0.5), 1);
  }
  return acc.finish(rng, false, true);
}

export function meetingPavilion({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const p = pal('hq', variant);
  const acc1 = accentOf('hq');
  const hi = lod === 0;
  const PH = 2.4;
  put(acc, baseBox(4, 0.16, 4), [0, 0, 0], C.floor, { aoAmt: 0.15 });
  if (hi) put(acc, baseBox(4.2, 0.08, 4.2), [0, 0, 0], C.plinth, { aoAmt: 0.2 });
  for (const x of [-1.75, 1.75])
    for (const z of [-1.75, 1.75])
      put(acc, cylB(0.1, 0.1, PH, hi ? 6 : 4, true), [x, 0.16, z], p.trim, { aoAmt: 0.1 });
  if (hi) {
    // low rails: back + sides, accent top
    put(acc, baseBox(3.6, 0.5, 0.08), [0, 0.16, -1.8], p.wall, { aoAmt: 0.15 });
    put(acc, baseBox(0.08, 0.5, 3.4), [-1.8, 0.16, 0], p.wall, { aoAmt: 0.15 });
    put(acc, baseBox(0.08, 0.5, 3.4), [1.8, 0.16, 0], p.wall, { aoAmt: 0.15 });
    put(acc, baseBox(3.8, 0.1, 0.16), [0, 0.66, -1.8], acc1, { aoAmt: 0 });
    // header beam with glyph
    put(acc, baseBox(3.6, 0.22, 0.2), [0, PH + 0.1, 1.75], p.trim, { aoAmt: 0.05 });
    glyph(acc, 'hq', V(0, PH + 0.21, 1.87), 0, 0.3, acc1);
    // hanging lamp (emissive)
    put(acc, cylB(0.02, 0.02, 0.5, 3, true), [0, PH - 0.4, 0], C.steel, { aoAmt: 0 });
  } else {
    // low rails (back + sides) as double-sided quads: the open pavilion keeps its walls' colour mass
    const rail = { double: true, aoAmt: 0, ao: () => 1 };
    put(acc, new THREE.PlaneGeometry(3.6, 0.5), [0, 0.41, -1.8], p.wall, rail);
    for (const x of [-1.8, 1.8])
      put(acc, new THREE.PlaneGeometry(3.4, 0.5), [x, 0.41, 0], p.wall, {
        ...rail,
        q: qEuler(0, Math.PI / 2, 0),
      });
  }
  put(
    acc,
    hi ? new THREE.IcosahedronGeometry(0.22, 1) : new THREE.OctahedronGeometry(0.22, 0),
    [0, PH - 0.6, 0],
    lighten(acc1, 0.4),
    { emissive: 1, ao: () => 1 },
  );
  if (variant === 0) {
    put(acc, new THREE.ConeGeometry(2.95, 1.3, 4).translate(0, 0.65, 0), [0, PH + 0.2, 0], p.roof, {
      q: qEuler(0, Math.PI / 4, 0),
      aoAmt: 0.05,
    });
    put(acc, new THREE.IcosahedronGeometry(0.16, 0), [0, PH + 1.55, 0], acc1, { aoAmt: 0 });
  } else {
    put(
      acc,
      new THREE.ConeGeometry(2.7, 1.0, hi ? 10 : 6).translate(0, 0.5, 0),
      [0, PH + 0.2, 0],
      p.roof,
      { aoAmt: 0.05 },
    );
    put(acc, cylB(0.04, 0.04, 0.5, 4, true), [0, PH + 1.2, 0], C.steel, { aoAmt: 0 });
    put(acc, new THREE.PlaneGeometry(0.5, 0.3), [0.27, PH + 1.55, 0], acc1, {
      double: true,
      aoAmt: 0,
      ao: () => 1,
    });
  }
  return acc.finish(rng, false, true);
}

export function coffeeKiosk({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const p = pal('hq', variant);
  const acc1 = accentOf('hq');
  const hi = lod === 0;
  if (hi) put(acc, baseBox(2.1, 0.1, 1.6), [0, 0, 0], C.floor, { aoAmt: 0.15 });
  // back + side walls, counter
  put(acc, baseBox(2.0, 1.9, 0.12), [0, 0.1, -0.62], p.wall, { aoAmt: 0.15 });
  for (const x of [-0.94, 0.94])
    put(acc, baseBox(0.12, 1.9, 1.2), [x, 0.1, -0.06], p.wall, { aoAmt: 0.15 });
  put(acc, baseBox(1.9, 0.85, 0.5), [0, 0.1, 0.5], p.trim, { aoAmt: 0.2 });
  put(acc, baseBox(2.0, 0.07, 0.62), [0, 0.95, 0.5], C.desk, { aoAmt: 0 });
  // roof + striped awning
  put(acc, baseBox(2.2, 0.12, 1.4), [0, 2.0, -0.2], p.roof, { aoAmt: 0.05 });
  const n = hi ? 7 : 3;
  for (let i = 0; i < n; i++) {
    const w = 2.2 / n;
    put(
      acc,
      baseBox(w, 0.06, 0.8),
      [-1.1 + w * (i + 0.5), 1.88, 0.8],
      i % 2 === 0 ? p.roof : C.white,
      {
        q: qEuler(0.28, 0, 0),
        aoAmt: 0,
      },
    );
  }
  if (hi) {
    // menu board (soft glow) + cup sign on the roof
    band(acc, V(0, 1.45, -0.55), 0, 1.0, 0.5, C.screenWarm, 0.6);
    put(acc, cylB(0.2, 0.15, 0.3, 8), [0, 2.12, -0.2], C.white, { aoAmt: 0.05 });
    put(acc, new THREE.CylinderGeometry(0.18, 0.18, 0.02, 8), [0, 2.42, -0.2], '#7A4B2E', {
      aoAmt: 0,
    });
    put(acc, new THREE.TorusGeometry(0.1, 0.03, 4, 6), [0.25, 2.27, -0.2], C.white, { aoAmt: 0 });
    put(acc, new THREE.IcosahedronGeometry(0.07, 0), [0, 2.65, -0.2], lighten(acc1, 0.5), {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
    // cups on the counter
    for (const x of [-0.5, 0.2, 0.6])
      put(acc, cylB(0.06, 0.05, 0.1, 5), [x, 1.02, 0.55], C.white, { aoAmt: 0 });
  }
  return acc.finish(rng, false, true);
}

/* --------------------------------- Coding --------------------------------- */

export function devOffice({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const p = pal('coding', variant);
  const acc1 = accentOf('coding');
  const hi = lod === 0;
  const W = 7;
  const D = 4;
  const H = 2.7;
  shell(
    acc,
    {
      w: W,
      d: D,
      h: H,
      outer: p.wall,
      inner: C.inner,
      frame: p.roof,
      glow: C.screen,
      glowEmissive: 2,
      front: [...winRow(-3.25, 1.9, 4, 0.22, 0.65, 2.1), door(2.75, 0.95, 1.9)],
      back: winRow(-3.2, 3.2, 5, 0.25, 0.9, 2.0),
      left: [win(0, 1.6, 0.8, 2.0)],
      right: [win(0, 1.6, 0.8, 2.0)],
    },
    lod,
  );
  if (variant === 0) {
    roofFlat(acc, { w: W, d: D, y: H, roof: p.roof, trim: p.trim, parapet: 0.2, lod });
    const ry = H + 0.18;
    solarRow(acc, V(-1.4, ry, -0.9), 4, 1.2, 1.1, lod);
    solarRow(acc, V(1.6, ry, -0.9), 3, 1.2, 1.1, lod);
    // rooftop sign
    put(acc, baseBox(1.8, 0.8, 0.14), [-1.8, ry, 1.3], acc1, { aoAmt: 0.05 });
    if (hi) glyph(acc, 'coding', V(-1.8, ry + 0.4, 1.4), 0, 0.62, C.white);
    beacon(acc, V(3.0, ry, -1.4), 1.0, lighten(acc1, 0.4), lod);
  } else {
    // single-slope roof, solar laid on the slope
    const rise = 0.95;
    const dd = D / 2 + 0.2;
    put(
      acc,
      prism([V2(-dd, 0), V2(dd, 0), V2(dd, rise)], W + 0.3).rotateY(Math.PI / 2),
      [0, H, 0],
      p.roof,
      { aoAmt: 0.05 },
    );
    const alpha = Math.atan2(rise, 2 * dd);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x = -((n - 1) * 1.28) / 2 + i * 1.28;
      put(acc, new THREE.BoxGeometry(1.15, 0.05, 1.5), [x, H + rise * 0.5 + 0.05, 0.0], C.solar, {
        q: qEuler(alpha, 0, 0),
        aoAmt: 0,
      });
    }
    if (hi) {
      put(acc, baseBox(1.8, 0.7, 0.14), [-2.4, H + 0.01, D / 2 + 0.05], acc1, { aoAmt: 0.05 });
      glyph(acc, 'coding', V(-2.4, H + 0.36, D / 2 + 0.13), 0, 0.55, C.white);
      // patio standing desks
      for (const x of [-0.8, 0.9]) {
        put(acc, baseBox(0.8, 0.06, 0.4), [x, 0.95, D / 2 + 0.55], C.desk, { aoAmt: 0 });
        put(acc, cylB(0.04, 0.04, 0.95, 4, true), [x, 0, D / 2 + 0.55], C.steel, { aoAmt: 0 });
        put(acc, baseBox(0.34, 0.02, 0.24), [x, 1.01, D / 2 + 0.55], C.dark, { aoAmt: 0 });
      }
    }
  }
  // monitor-glow bands: LED lintel strip outside + glowing screens wall inside the back
  band(acc, V(-0.3, 2.42, D / 2 + 0.01), 0, 5.7, 0.14, lighten(acc1, 0.45), 1);
  return acc.finish(rng, false, true);
}

export function devPod({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const p = pal('coding', variant);
  const acc1 = accentOf('coding');
  const hi = lod === 0;
  const H = 2.4;
  shell(
    acc,
    {
      w: 3,
      d: 3,
      h: H,
      outer: p.wall,
      inner: C.inner,
      frame: p.roof,
      front: [door(-0.85, 0.8, 1.8), win(0.5, 1.6, 0.65, 1.95)],
      back: [win(0, 1.4, 0.8, 1.9)],
      left: [win(0, 1.2, 0.8, 1.9)],
      right: [win(0, 1.2, 0.8, 1.9)],
    },
    lod,
  );
  if (variant === 0) {
    roofFlat(acc, { w: 3, d: 3, y: H, roof: p.roof, trim: p.trim, parapet: 0.16, lod });
    solarRow(acc, V(0, H + 0.18, -0.4), 2, 1.2, 1.0, lod);
  } else {
    gabledRoof(acc, {
      top: H,
      halfW: 1.75,
      wallHalfW: 1.5,
      rise: 1.0,
      length: 3.3,
      wallLen: 2.98,
      roof: p.roof,
      wall: p.wall,
      lod,
    });
  }
  if (hi) {
    glyph(acc, 'coding', V(-0.85, 2.05, 1.55), 0, 0.4, acc1);
  }
  put(acc, baseBox(0.95, 0.1, 0.4), [-0.85, 0, 1.7], C.plinth, { aoAmt: 0.2 });
  band(acc, V(0.5, 2.15, 1.51), 0, 1.5, 0.1, lighten(acc1, 0.45), 1);
  return acc.finish(rng, false, true);
}

export function serverShed({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const spin = new Spin();
  const p = pal('coding', variant);
  const acc1 = accentOf('coding');
  const hi = lod === 0;
  const W = 3;
  const D = 2.5;
  const H = 2.4;
  shell(
    acc,
    {
      w: W,
      d: D,
      h: H,
      outer: p.wall,
      inner: '#DDE6F2',
      frame: p.roof,
      front: [win(0, 2.1, 0, 1.85)],
      left: [win(0, 1.0, 0.8, 1.7)],
      right: [win(0, 1.0, 0.8, 1.7)],
    },
    lod,
    C.steelLight,
  );
  roofFlat(acc, {
    w: W,
    d: D,
    y: H,
    roof: p.roof,
    trim: p.trim,
    parapet: variant === 0 ? 0.14 : 0,
    lod,
  });
  const ry = H + 0.18;
  vent(acc, V(0.8, ry, -0.5), 0.4, 0.15, C.steelLight, lod);
  put(acc, baseBox(0.9, 0.08, 0.5), [0, 0, D / 2 + 0.25], C.plinth, { aoAmt: 0.2 });
  if (hi) {
    fan(acc, spin, V(-0.85, 2.12, D / 2 + 0.02), 0.2, p.trim, C.white, lod);
    for (const [x, s] of [
      [-0.62, 0],
      [0.0, 1],
      [0.62, 2],
    ] as const)
      rack(acc, V(x, FLOOR_Y, -0.82), 0, {
        w: 0.56,
        h: 1.6,
        d: 0.5,
        body: C.steelLight,
        seed: s + variant,
        lod,
      });
    band(acc, V(0, 2.12, D / 2 + 0.01), 0, 1.0, 0.1, lighten(acc1, 0.45), 1);
  } else {
    for (const x of [-0.62, 0.62])
      rack(acc, V(x, FLOOR_Y, -0.82), 0, {
        w: 0.56,
        h: 1.6,
        d: 0.5,
        body: C.steelLight,
        seed: 0,
        lod,
      });
  }
  return finishSpin(acc.finish(rng, false, true), acc, spin);
}

/* -------------------------------- Marketing -------------------------------- */

export function broadcastStudio({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const p = pal('marketing', variant);
  const hi = lod === 0;
  const W = 4;
  const D = 3.5;
  const H = 2.8;
  shell(
    acc,
    {
      w: W,
      d: D,
      h: H,
      outer: p.wall,
      inner: C.inner,
      frame: p.roof,
      front: [win(-0.7, 1.7, 0.65, 2.1), door(1.2, 0.95, 1.9)],
      back: [win(0, 1.4, 0.9, 2.0)],
      left: [win(0, 1.4, 0.8, 2.0)],
      right: [win(0, 1.4, 0.8, 2.0)],
    },
    lod,
  );
  roofFlat(acc, { w: W, d: D, y: H, roof: p.roof, trim: p.trim, parapet: 0.2, lod });
  const ry = H + 0.18;
  // big dish, ON AIR lamp, megaphones, mast
  dish(acc, V(variant === 0 ? -1.0 : 1.0, ry, -0.8), {
    r: variant === 0 ? 0.85 : 1.0,
    yaw: variant === 0 ? 0.5 : -0.5,
    elev: 0.8,
    color: C.white,
    mast: 0.5,
    lod,
  });
  beacon(acc, V(variant === 0 ? 1.4 : -1.4, ry, -1.2), 1.4, '#FF6A6A', lod);
  // ON AIR sign over the door
  put(acc, baseBox(1.05, 0.34, 0.12), [1.2, 2.2, D / 2 + 0.01], C.dark, { aoAmt: 0.05 });
  band(acc, V(1.2, 2.37, D / 2 + 0.075), 0, 0.85, 0.2, C.onAir, 1);
  if (hi) {
    for (const x of [0.8, 1.6])
      put(acc, new THREE.IcosahedronGeometry(0.055, 0), [x, 2.37, D / 2 + 0.09], '#FFD0D0', {
        emissive: 1,
        aoAmt: 0,
        ao: () => 1,
      });
    megaphone(acc, V(-1.7, ry, 1.2), 0.3, p.trim, lod);
    megaphone(acc, V(1.7, ry, 1.2), -0.3, p.trim, lod);
    glyph(acc, 'marketing', V(-0.7, 2.62, D / 2 + 0.05), 0, 0.35, C.white);
    // striped awning over the door
    for (let i = 0; i < 5; i++)
      put(
        acc,
        baseBox(0.22, 0.05, 0.6),
        [0.85 + i * 0.22, 1.98, D / 2 + 0.3],
        i % 2 === 0 ? p.roof : C.white,
        {
          q: qEuler(0.35, 0, 0),
          aoAmt: 0,
        },
      );
  }
  return acc.finish(rng, false, true);
}

export function billboard({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const p = pal('marketing', variant);
  const acc1 = accentOf('marketing');
  const hi = lod === 0;
  const PW = 3.9;
  const PH = 1.9;
  const PY = 2.2;
  put(acc, baseBox(3.6, 0.14, 1.2), [0, 0, 0], C.plinth, { aoAmt: 0.2 });
  for (const x of [-1.5, 1.5]) {
    put(acc, cylB(0.12, 0.1, PY + 0.2, hi ? 6 : 4, true), [x, 0.14, 0], C.deskDark, { aoAmt: 0.2 });
    if (hi) put(acc, cylB(0.22, 0.22, 0.18, 6), [x, 0.14, 0], C.steel, { aoAmt: 0.1 });
  }
  // panel: frame + face
  put(acc, baseBox(PW + 0.2, PH + 0.2, 0.18), [0, PY - 0.1, -0.02], p.trim, { aoAmt: 0.1 });
  put(
    acc,
    new THREE.PlaneGeometry(PW, PH),
    [0, PY + PH / 2 - 0.1, 0.075],
    variant === 0 ? acc1 : p.roof,
    {
      emissive: 0.5,
      aoAmt: 0,
      ao: () => 1,
    },
  );
  glyph(acc, 'marketing', V(-0.9, PY + PH / 2 - 0.1, 0.1), 0, 1.3, C.white, 0.5);
  if (hi) {
    // copy lines on the board
    for (const [i, w] of [
      [0, 1.5],
      [1, 1.1],
      [2, 0.8],
    ] as const)
      put(
        acc,
        new THREE.PlaneGeometry(w, 0.2),
        [1.05 + ((w - 1.5) / 2) * -0.0 + 0.0 - (1.5 - w) / 2, PY + PH - 0.55 - i * 0.38, 0.1],
        C.white,
        { aoAmt: 0, ao: () => 1 },
      );
    // lamps on arms
    for (const x of [-1.2, 0, 1.2]) {
      put(acc, cylB(0.025, 0.025, 0.35, 3, true), [x, PY + PH + 0.1, 0.1], C.steel, {
        q: qEuler(0.9, 0, 0),
        aoAmt: 0,
      });
      put(acc, new THREE.ConeGeometry(0.1, 0.16, 5), [x, PY + PH + 0.42, 0.34], C.dark, {
        q: qEuler(Math.PI - 0.3, 0, 0),
        aoAmt: 0,
      });
      put(acc, new THREE.IcosahedronGeometry(0.05, 0), [x, PY + PH + 0.34, 0.4], C.screenWarm, {
        emissive: 1,
        aoAmt: 0,
        ao: () => 1,
      });
    }
    // back braces
    for (const x of [-1.5, 1.5])
      put(acc, cylB(0.04, 0.04, 1.6, 4, true), [x, 0.1, -0.15], C.deskDark, {
        q: qEuler(-0.55, 0, 0),
        aoAmt: 0,
      });
    // paint buckets
    for (const [x, c] of [
      [-0.9, acc1],
      [-0.55, C.gold],
    ] as const)
      put(acc, cylB(0.1, 0.09, 0.16, 6), [x, 0.14, 0.45], c, { aoAmt: 0.1 });
  }
  return acc.finish(rng, false, true);
}

/* ------------------------------------ QA ------------------------------------ */

/** Barrier gate: post + striped arm (arm raised a little). */
function barrier(acc: Acc, at: THREE.Vector3, len: number, lod: Lod): void {
  put(acc, baseBox(0.18, 0.9, 0.18), at, C.steel, { aoAmt: 0.1 });
  const n = lod === 0 ? 6 : 2;
  const seg = len / n;
  for (let i = 0; i < n; i++)
    put(
      acc,
      baseBox(seg, 0.1, 0.07),
      at.clone().add(V(0.09 + seg * (i + 0.5), 0.78 + i * 0.015, 0)),
      i % 2 === 0 ? C.red : C.white,
      {
        q: qEuler(0, 0, 0.06),
        aoAmt: 0,
      },
    );
}

/** Rooftop checklist board with check glyphs and bars. Face +z; base centre `at`. */
function checklistBoard(
  acc: Acc,
  at: THREE.Vector3,
  w: number,
  h: number,
  trim: string,
  accent: string,
  lod: Lod,
): void {
  for (const x of [-w * 0.35, w * 0.35])
    put(acc, cylB(0.05, 0.05, 0.5, 4, true), at.clone().add(V(x, 0, 0)), C.steel, { aoAmt: 0 });
  put(acc, baseBox(w + 0.14, h + 0.14, 0.1), at.clone().add(V(0, 0.45, 0)), trim, { aoAmt: 0.05 });
  put(
    acc,
    new THREE.PlaneGeometry(w, h),
    at.clone().add(V(0, 0.45 + h / 2 + 0.07, 0.055)),
    C.white,
    { aoAmt: 0, ao: () => 1 },
  );
  const rows = lod === 0 ? 3 : 2;
  for (let i = 0; i < rows; i++) {
    const y = 0.45 + h * (0.8 - (i * 0.6) / Math.max(1, rows - 1)) - 0.02;
    const bad = i === 1 && rows === 3;
    if (lod === 0) {
      glyph(
        acc,
        'qa',
        at.clone().add(V(-w * 0.34, y, 0.07)),
        0,
        h * 0.26,
        bad ? C.red : accent,
        0.4,
      );
      put(
        acc,
        new THREE.PlaneGeometry(w * 0.55, h * 0.1),
        at.clone().add(V(w * 0.08, y, 0.06)),
        C.chair,
        { aoAmt: 0, ao: () => 1 },
      );
    } else {
      put(acc, new THREE.PlaneGeometry(w * 0.7, h * 0.16), at.clone().add(V(0, y, 0.06)), accent, {
        aoAmt: 0,
        ao: () => 1,
      });
    }
  }
}

export function testLab({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const p = pal('qa', variant);
  const acc1 = accentOf('qa');
  const hi = lod === 0;
  const W = 5;
  const D = 4;
  const H = 2.8;
  shell(
    acc,
    {
      w: W,
      d: D,
      h: H,
      outer: p.wall,
      inner: C.inner,
      frame: p.roof,
      front: [win(-1.4, 1.3, 0.65, 2.1), win(0.5, 1.3, 0.65, 2.1), door(1.95, 0.95, 1.9)],
      back: winRow(-1.5, 1.5, 2, 0.4, 0.9, 2.0),
      left: [win(0, 1.5, 0.8, 2.0)],
      right: [win(0.8, 1.2, 0.8, 2.0)],
    },
    lod,
  );
  roofFlat(acc, { w: W, d: D, y: H, roof: p.roof, trim: p.trim, parapet: 0.2, lod });
  const ry = H + 0.18;
  checklistBoard(
    acc,
    V(variant === 0 ? -0.7 : 0.4, ry + 0.2, D / 2 - 0.4),
    2.6,
    1.4,
    p.trim,
    acc1,
    lod,
  );
  // hazard stripe band along the base of the front wall
  if (hi) {
    for (let i = 0; i < 10; i++)
      put(
        acc,
        baseBox(0.5, 0.26, 0.04),
        [-W / 2 + 0.3 + i * 0.5, 0.2, D / 2 + 0.01],
        i % 2 === 0 ? acc1 : C.dark,
        { aoAmt: 0 },
      );
    trafficCone(acc, V(-2.2, 0, D / 2 + 0.4), 1.2, lod);
    trafficCone(acc, V(2.2, 0, D / 2 + 0.45), 1.2, lod);
    trafficCone(acc, V(W / 2 + 0.35, 0, 0.9), 1.1, lod);
    barrier(acc, V(variant === 0 ? 1.0 : -0.2, 0, D / 2 + 0.55), 1.3, lod);
    glyph(acc, 'qa', V(1.95, 2.45, D / 2 + 0.05), 0, 0.4, acc1);
  } else {
    trafficCone(acc, V(-2.2, 0, D / 2 + 0.4), 1.2, lod);
  }
  band(acc, V(-0.45, 2.45, D / 2 + 0.01), 0, 3.0, 0.1, lighten(acc1, 0.5), 1);
  return acc.finish(rng, false, true);
}

export function inspectionTower({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const p = pal('qa', variant);
  const acc1 = accentOf('qa');
  const hi = lod === 0;
  const BW = 2.2;
  const BH = 3.5;
  put(acc, baseBox(2.5, 0.16, 2.5), [0, 0, 0], C.plinth, { aoAmt: 0.2 });
  shell(
    acc,
    {
      w: BW,
      d: BW,
      h: BH,
      outer: p.wall,
      inner: C.inner,
      frame: p.roof,
      front: [door(0, 0.95, 1.8), win(0, 0.6, 2.4, 3.1)],
      back: [win(0, 0.6, 1.4, 2.4)],
      left: [win(0, 0.6, 1.4, 2.4)],
      right: [win(0, 0.6, 1.4, 2.4)],
    },
    lod,
  );
  // stripes on the base
  if (hi) {
    for (const y of [0.9, 2.1])
      put(acc, baseBox(BW + 0.06, 0.4, BW + 0.06), [0, y, 0], acc1, { aoAmt: 0 });
  } else {
    put(acc, baseBox(BW + 0.06, 0.6, BW + 0.06), [0, 1.0, 0], acc1, { aoAmt: 0 });
  }
  // observation cabin on a slab, pyramid roof, lens lamp
  const cy = BH;
  put(acc, baseBox(2.6, 0.2, 2.6), [0, cy, 0], p.trim, { aoAmt: 0.1 });
  const CH = 1.2;
  const ow: Opening[] = [win(0, 1.5, 0.25, 0.95)];
  shell(
    acc,
    {
      w: 2.3,
      d: 2.3,
      h: CH,
      y0: cy + 0.2,
      noFloor: true,
      outer: p.wall,
      inner: C.inner,
      frame: p.roof,
      front: ow,
      back: ow,
      left: ow,
      right: ow,
    },
    lod,
  );
  const ty = cy + 0.2 + CH;
  put(acc, new THREE.ConeGeometry(1.85, 1.1, 4).translate(0, 0.55, 0), [0, ty, 0], p.roof, {
    q: qEuler(0, Math.PI / 4, 0),
    aoAmt: 0.05,
  });
  put(acc, new THREE.IcosahedronGeometry(0.2, hi ? 1 : 0), [0, ty + 1.25, 0], lighten(acc1, 0.4), {
    emissive: 1,
    ao: () => 1,
  });
  put(acc, cylB(0.04, 0.04, 0.5, 4, true), [0, ty + 0.9, 0], C.steel, { aoAmt: 0 });
  if (hi) {
    glyph(acc, 'qa', V(0, 2.9, BW / 2 + 0.05), 0, 0.5, C.white);
    // inspector's railing around the cabin slab
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      put(
        acc,
        cylB(0.03, 0.03, 0.4, 3, true),
        [Math.cos(a) * 1.22, cy + 0.2, Math.sin(a) * 1.22],
        C.steel,
        { aoAmt: 0 },
      );
    }
    trafficCone(acc, V(1.5, 0, 1.45), 1.0, lod);
  } else {
    band(acc, V(0, cy + 0.8, 1.16), 0, 1.5, 0.5, lighten(acc1, 0.5), 1);
  }
  return acc.finish(rng, false, true);
}

export function testLabStilt({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const p = pal('qa', variant);
  const acc1 = accentOf('qa');
  const hi = lod === 0;
  const deckTop = 1.2;
  for (const x of [-1.3, 1.3])
    for (const z of [-1.3, 1.3]) {
      put(acc, cylB(0.17, 0.13, deckTop, hi ? 6 : 4, true), [x, 0, z], C.deskDark, { aoAmt: 0.3 });
      if (hi) put(acc, cylB(0.2, 0.2, 0.1, 6), [x, 0, z], C.dark, { aoAmt: 0.3 });
    }
  put(acc, baseBox(3.0, 0.24, 3.0), [0, deckTop - 0.22, 0], '#D2A679', { aoAmt: 0.1 });
  const y0 = STILT_FLOOR;
  const H = 2.1;
  shell(
    acc,
    {
      w: 2.6,
      d: 2.3,
      h: H,
      y0,
      outer: p.wall,
      inner: C.inner,
      frame: p.roof,
      front: [win(-0.55, 0.8, 0.6, 1.7), win(0.6, 0.8, 0.6, 1.7)],
      back: [win(0, 1.0, 0.7, 1.7)],
      left: [win(0, 0.9, 0.7, 1.7)],
      right: [win(0, 0.9, 0.7, 1.7)],
    },
    lod,
  );
  gabledRoof(acc, {
    top: y0 + H,
    halfW: 1.55,
    wallHalfW: 1.3,
    rise: 1.0,
    length: 2.8,
    wallLen: 2.28,
    roof: p.roof,
    wall: p.wall,
    lod,
  });
  band(acc, V(0, y0 + H - 0.25, 1.16), 0, 2.2, 0.1, lighten(acc1, 0.5), 1);
  if (hi) {
    glyph(acc, 'qa', V(0, y0 + H + 0.45, 1.2), 0, 0.5, C.white);
    // clipboard sign on the front rail, cone, ladder
    const cx = variant === 0 ? -1.0 : 1.0;
    put(acc, baseBox(0.7, 0.9, 0.06), [cx, deckTop + 0.1, 1.48], C.deskDark, { aoAmt: 0.1 });
    put(acc, new THREE.PlaneGeometry(0.56, 0.72), [cx, deckTop + 0.55, 1.515], C.white, {
      aoAmt: 0,
      ao: () => 1,
    });
    glyph(acc, 'qa', V(cx, deckTop + 0.7, 1.53), 0, 0.3, acc1, 0.4);
    trafficCone(acc, V(-cx, deckTop + 0.02, 1.4), 1.0, lod);
    const lx = -cx * 1.1;
    const top = V(lx, deckTop, 1.55);
    const bot = V(lx, 0, 2.1);
    for (const dx of [-0.18, 0.18]) {
      const s = frustum(
        top.clone().add(V(dx, 0.3, 0)),
        bot.clone().add(V(dx, 0, 0)),
        0.04,
        0.04,
        4,
      );
      acc.add(s.geo, { m: s.m, color: col(C.deskDark), windMul: 0, aoAmt: 0.1 });
    }
    for (let i = 0; i < 4; i++)
      put(
        acc,
        new THREE.BoxGeometry(0.4, 0.05, 0.06),
        bot.clone().lerp(top, (i + 0.6) / 4.6),
        C.desk,
        {
          aoAmt: 0,
        },
      );
  }
  return acc.finish(rng, false, true);
}

/* ---------------------------------- Design ---------------------------------- */

const PASTELS = ['#FF8FB1', '#FFE45C', '#7FD8B3', '#B39DFF', '#5DA9E9'] as const;

export function atelier({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const p = pal('design', variant);
  const acc1 = accentOf('design');
  const hi = lod === 0;
  const W = 5;
  const D = 4;
  const H = 2.6;
  shell(
    acc,
    {
      w: W,
      d: D,
      h: H,
      outer: p.wall,
      inner: C.inner,
      frame: p.roof,
      front: [win(-1.5, 1.4, 0.65, 2.1), win(0.2, 1.2, 0.65, 2.1), door(1.8, 0.95, 1.9)],
      back: [win(-1.0, 1.2, 0.9, 2.0), win(1.0, 1.2, 0.9, 2.0)],
      left: [win(0, 1.6, 0.8, 2.0)],
      right: [win(0.8, 1.2, 0.8, 2.0)],
    },
    lod,
  );
  sawtoothRoof(acc, {
    w: W,
    d: D,
    y: H,
    teeth: 3,
    rise: variant === 0 ? 0.85 : 1.0,
    roof: p.roof,
    glass: lighten(acc1, 0.5),
    lod,
  });
  if (hi) {
    // colour-block panels, planters, sculpture
    for (let i = 0; i < 4; i++)
      put(
        acc,
        baseBox(0.3, 0.3, 0.05),
        [-2.05 + i * 0.28, 2.18 - (i % 2) * 0.12, D / 2 + 0.02],
        PASTELS[(i + variant) % PASTELS.length],
        { aoAmt: 0 },
      );
    for (let i = 0; i < 3; i++) {
      const x = -0.9 + i * 0.5;
      put(
        acc,
        cylB(0.13, 0.1, 0.2, 6),
        [x, 0, D / 2 + 0.3],
        PASTELS[(i * 2 + variant) % PASTELS.length],
        {
          aoAmt: 0.15,
        },
      );
      put(acc, new THREE.IcosahedronGeometry(0.13, 0), [x, 0.28, D / 2 + 0.3], C.plant, {
        aoAmt: 0.1,
      });
    }
    sculpture(acc, V(-W / 2 + 0.2, 0, D / 2 + 0.35), variant === 0 ? 0 : 1, [acc1, C.gold], lod);
    glyph(acc, 'design', V(1.8, 2.45, D / 2 + 0.05), 0, 0.35, acc1);
    put(acc, baseBox(1.3, 0.1, 0.4), [1.8, 0, D / 2 + 0.2], C.plinth, { aoAmt: 0.2 });
  } else {
    sculpture(acc, V(-W / 2 + 0.2, 0, D / 2 + 0.35), 0, [acc1, C.gold], lod);
  }
  return acc.finish(rng, false, true);
}

export function galleryPavilion({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const p = pal('design', variant);
  const acc1 = accentOf('design');
  const hi = lod === 0;
  const PH = 2.5;
  put(acc, baseBox(4, 0.16, 4), [0, 0, 0], '#F4EBDD', { aoAmt: 0.15 });
  if (hi) put(acc, baseBox(4.2, 0.08, 4.2), [0, 0, 0], C.plinth, { aoAmt: 0.2 });
  for (const x of [-1.8, 1.8])
    for (const z of [-1.8, 1.8])
      put(acc, cylB(0.09, 0.09, PH, hi ? 6 : 4, true), [x, 0.16, z], p.trim, { aoAmt: 0.1 });
  // back wall with hung art
  put(acc, baseBox(3.6, 2.3, 0.12), [0, 0.16, -1.85], p.wall, { aoAmt: 0.12 });
  const art = hi ? 3 : 2;
  for (let i = 0; i < art; i++) {
    const x = -1.1 + i * (2.2 / Math.max(1, art - 1));
    put(acc, baseBox(0.8, 0.8, 0.05), [x, 0.95, -1.78], C.white, { aoAmt: 0 });
    put(
      acc,
      new THREE.PlaneGeometry(0.62, 0.62),
      [x, 1.35, -1.745],
      PASTELS[(i + variant * 2) % PASTELS.length],
      {
        aoAmt: 0,
        ao: () => 1,
      },
    );
    put(acc, new THREE.PlaneGeometry(0.5, 0.06), [x, 1.74, -1.735], '#FFF4D6', {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
    if (hi)
      put(acc, new THREE.PlaneGeometry(0.28, 0.28), [x + 0.1, 1.28, -1.74], acc1, {
        aoAmt: 0,
        ao: () => 1,
      });
  }
  if (variant === 0) {
    const R = 2.7;
    const th = 0.55;
    const dome = new THREE.SphereGeometry(R, hi ? 12 : 6, hi ? 4 : 2, 0, TAU, 0, th).translate(
      0,
      -R * Math.cos(th),
      0,
    );
    put(acc, dome, [0, PH + 0.12, 0], p.roof, { aoAmt: 0.05 });
    put(acc, cylB(2.55, 2.55, 0.12, hi ? 12 : 6), [0, PH, 0], p.trim, { aoAmt: 0 });
  } else {
    gabledRoof(acc, {
      top: PH,
      halfW: 2.4,
      wallHalfW: 2.0,
      rise: 1.0,
      length: 4.4,
      wallLen: 3.9,
      roof: p.roof,
      wall: p.wall,
      lod,
    });
  }
  put(acc, new THREE.IcosahedronGeometry(0.15, 0), [0, PH + 1.0, 0], C.gold, { aoAmt: 0 });
  if (hi) {
    sculpture(acc, V(-0.3, 0.16, 1.35), 0, [acc1, C.gold], lod);
    sculpture(acc, V(-1.2, 0.16, -0.9), 1, [p.roof, acc1], lod);
    easel(acc, V(0.3, 0.16, -0.6), Math.PI / 2, PASTELS[2 + variant], 0.95);
    put(acc, baseBox(3.6, 0.1, 0.14), [0, PH + 0.06, 1.8], p.trim, { aoAmt: 0 });
    glyph(acc, 'design', V(0, PH + 0.1, 1.9), 0, 0.3, acc1);
  } else {
    sculpture(acc, V(-0.3, 0.16, 1.35), 0, [acc1, C.gold], lod);
  }
  return acc.finish(rng, false, true);
}

/* ---------------------------------- DevOps ---------------------------------- */

/** Straight pipe between two points. */
function pipe(
  acc: Acc,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  color: string,
  lod: Lod,
): void {
  const s = frustum(a, b, r, r, lod === 0 ? 6 : 4, false);
  acc.add(s.geo, { m: s.m, color: col(color), windMul: 0, aoAmt: 0.15 });
}

export function dataCenter({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const spin = new Spin();
  const p = pal('devops', variant);
  const acc1 = accentOf('devops');
  const hi = lod === 0;
  const W = 7;
  const D = 4;
  const H = 2.6;
  shell(
    acc,
    {
      w: W,
      d: D,
      h: H,
      outer: p.wall,
      inner: C.inner,
      frame: p.roof,
      front: [...winRow(-3.3, 1.8, 6, 0.2, 0.95, 1.8), door(2.75, 0.95, 1.9)],
      back: winRow(-3.2, 3.2, 6, 0.3, 1.0, 1.8),
      left: [win(0, 1.8, 0.95, 1.8)],
      right: [win(0, 1.8, 0.95, 1.8)],
    },
    lod,
  );
  roofFlat(acc, { w: W, d: D, y: H, roof: p.roof, trim: p.trim, parapet: 0.15, lod });
  const ry = H + 0.18;
  for (const x of [-2.2, 2.2]) vent(acc, V(x, ry, -1.0), 0.5, 0.2, C.steelLight, lod);
  if (variant === 1) vent(acc, V(0, ry, -1.0), 0.4, 0.17, C.steelLight, lod);
  if (hi) {
    fan(acc, spin, V(-2.6, 2.3, D / 2 + 0.02), 0.3, p.trim, C.white, lod);
    if (variant === 0) fan(acc, spin, V(-1.2, 2.3, D / 2 + 0.02), 0.3, p.trim, C.white, lod);
    // pipeline along the front base + riser up the right side
    pipe(acc, V(-3.3, 0.4, D / 2 + 0.2), V(1.4, 0.4, D / 2 + 0.2), 0.1, acc1, lod);
    for (const x of [-3.0, -1.0, 1.1])
      put(acc, baseBox(0.1, 0.4, 0.14), [x, 0.05, D / 2 + 0.2], C.steel, { aoAmt: 0 });
    pipe(acc, V(W / 2 + 0.2, 0.4, D / 2 - 0.1), V(W / 2 + 0.2, 0.4, -D / 2 + 0.1), 0.1, acc1, lod);
    pipe(
      acc,
      V(W / 2 + 0.2, 0.4, -D / 2 + 0.1),
      V(W / 2 + 0.2, ry + 0.3, -D / 2 + 0.1),
      0.1,
      acc1,
      lod,
    );
    glyph(acc, 'devops', V(2.75, 2.35, D / 2 + 0.05), 0, 0.4, acc1);
    put(acc, baseBox(1.3, 0.1, 0.4), [2.75, 0, D / 2 + 0.2], C.plinth, { aoAmt: 0.2 });
  } else {
    pipe(acc, V(-3.3, 0.4, D / 2 + 0.2), V(1.4, 0.4, D / 2 + 0.2), 0.1, acc1, lod);
  }
  // LED glow strip above the rack windows
  band(acc, V(-0.7, 2.18, D / 2 + 0.01), 0, 5.0, 0.12, lighten(acc1, 0.4), 1);
  return finishSpin(acc.finish(rng, false, true), acc, spin);
}

export function rackShed({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const spin = new Spin();
  const p = pal('devops', variant);
  const acc1 = accentOf('devops');
  const hi = lod === 0;
  const W = 3;
  const D = 2.5;
  const H = 2.4;
  shell(
    acc,
    {
      w: W,
      d: D,
      h: H,
      outer: p.wall,
      inner: '#E3E0D8',
      frame: p.roof,
      front: [win(0, 2.0, 0, 1.85)],
      left: [win(0, 1.0, 0.8, 1.7)],
      right: [win(0, 1.0, 0.8, 1.7)],
    },
    lod,
    C.steel,
  );
  roofFlat(acc, { w: W, d: D, y: H, roof: p.roof, trim: p.trim, parapet: 0.12, lod });
  const ry = H + 0.18;
  vent(acc, V(0.8, ry, -0.5), 0.4, 0.15, C.steelLight, lod);
  put(acc, baseBox(0.9, 0.08, 0.5), [0, 0, D / 2 + 0.25], C.plinth, { aoAmt: 0.2 });
  pipe(acc, V(-1.5, 0.35, D / 2 + 0.2), V(1.5, 0.35, D / 2 + 0.2), 0.08, acc1, lod);
  const xs = variant === 0 ? [-0.85, 0, 0.85] : [-0.7, 0.7];
  for (const [i, x] of xs.entries())
    rack(acc, V(x, FLOOR_Y, -0.82), 0, {
      w: 0.58,
      h: 1.65,
      d: 0.5,
      body: C.steel,
      seed: i + variant,
      lod,
    });
  if (hi) {
    fan(acc, spin, V(-0.8, 2.12, D / 2 + 0.02), 0.2, p.trim, C.white, lod);
    for (let i = 0; i < 6; i++)
      put(
        acc,
        baseBox(0.25, 0.22, 0.03),
        [-W / 2 + 0.3 + i * 0.5, 2.0, D / 2 + 0.01],
        i % 2 === 0 ? acc1 : C.dark,
        {
          aoAmt: 0,
        },
      );
  } else {
    band(acc, V(0, 2.1, D / 2 + 0.01), 0, 2.4, 0.15, lighten(acc1, 0.4), 1);
  }
  return finishSpin(acc.finish(rng, false, true), acc, spin);
}

function strut(acc: Acc, a: THREE.Vector3, b: THREE.Vector3, r: number, color: string): void {
  const s = frustum(a, b, r, r, 3, true);
  acc.add(s.geo, { m: s.m, color: col(color), windMul: 0, aoAmt: 0.1 });
}

export function antennaMast({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const p = pal('devops', variant);
  const acc1 = accentOf('devops');
  const hi = lod === 0;
  const TOP = variant === 0 ? 8.4 : 7.2;
  put(acc, baseBox(2.0, 0.14, 2.0), [0, 0, 0], C.plinth, { aoAmt: 0.2 });
  // 4 tapered legs
  const bx = 0.62;
  const tx = 0.14;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      strut(
        acc,
        V(sx * bx, 0.14, sz * bx - 0.2),
        V(sx * tx, TOP, sz * tx - 0.2),
        hi ? 0.05 : 0.07,
        acc1,
      );
  // cross rings
  const rings = [2.2, 4.0, 5.8];
  const flatRing = { q: qEuler(-Math.PI / 2, 0, 0), aoAmt: 0, ao: () => 1 };
  for (const y of rings) {
    const k = 1 - (y / TOP) * 0.78;
    const half = bx * k + 0.02;
    for (const s of [-1, 1]) {
      if (hi) {
        put(acc, baseBox(half * 2, 0.05, 0.05), [0, y, s * half - 0.2], p.trim, { aoAmt: 0 });
        put(acc, baseBox(0.05, 0.05, half * 2), [s * half, y, -0.2], p.trim, { aoAmt: 0 });
      } else {
        // far: the frame's top face only (what shows from above), 2 tris per side
        put(
          acc,
          new THREE.PlaneGeometry(half * 2, 0.05),
          [0, y + 0.03, s * half - 0.2],
          p.trim,
          flatRing,
        );
        put(
          acc,
          new THREE.PlaneGeometry(0.05, half * 2),
          [s * half, y + 0.03, -0.2],
          p.trim,
          flatRing,
        );
      }
    }
  }
  if (hi) {
    for (let i = 0; i < rings.length; i++) {
      const y0 = i === 0 ? 0.14 : rings[i - 1];
      const y1 = rings[i];
      const k0 = 1 - (y0 / TOP) * 0.78;
      const k1 = 1 - (y1 / TOP) * 0.78;
      strut(
        acc,
        V(-bx * k0, y0, bx * k0 - 0.2),
        V(bx * k1, y1, bx * k1 - 0.2),
        0.025,
        C.steelLight,
      );
    }
  }
  // top gear: dishes, whip, red lamp
  dish(acc, V(0, TOP - 1.6, 0), { r: 0.5, yaw: 0.7, elev: 0.5, color: C.white, mast: 0.01, lod });
  if (hi)
    dish(acc, V(0, TOP - 2.8, 0), {
      r: 0.4,
      yaw: -0.8,
      elev: 0.3,
      color: C.white,
      mast: 0.01,
      lod,
    });
  put(acc, cylB(0.03, 0.02, 1.2, 4, true), [0, TOP, -0.2], C.steelLight, { aoAmt: 0 });
  put(
    acc,
    new THREE.IcosahedronGeometry(0.17, hi ? 1 : 0),
    [0, TOP + 1.25, -0.2],
    variant === 0 ? '#FF5A4A' : '#FFD25A',
    {
      emissive: 1,
      ao: () => 1,
    },
  );
  // equipment cabinet + gear sign at the base
  put(acc, baseBox(0.9, 1.1, 0.7), [-0.45, 0.14, -0.45], p.wall, { aoAmt: 0.2 });
  put(acc, baseBox(0.96, 0.1, 0.76), [-0.45, 1.24, -0.45], p.roof, { aoAmt: 0 });
  if (hi) {
    put(acc, new THREE.PlaneGeometry(0.4, 0.5), [-0.45, 0.6, -0.09], C.bezel, {
      aoAmt: 0,
      ao: () => 1,
    });
    put(acc, new THREE.PlaneGeometry(0.1, 0.06), [-0.55, 0.78, -0.085], C.led[0], {
      emissive: 2,
      aoAmt: 0,
      ao: () => 1,
    });
    put(acc, new THREE.PlaneGeometry(0.1, 0.06), [-0.35, 0.78, -0.085], C.led[1], {
      emissive: 2,
      aoAmt: 0,
      ao: () => 1,
    });
    glyph(acc, 'devops', V(0.5, 0.8, 0.93), 0, 0.4, acc1);
    put(acc, cylB(0.04, 0.04, 0.8, 4, true), [0.5, 0.14, 0.9], C.steel, { aoAmt: 0 });
  }
  return acc.finish(rng, false, true);
}

/* --------------------------------- Research --------------------------------- */

export function researchHut({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const spin = new Spin();
  const p = pal('research', variant);
  const acc1 = accentOf('research');
  const hi = lod === 0;
  const W = 3;
  const D = 3;
  const H = 2.2;
  shell(
    acc,
    {
      w: W,
      d: D,
      h: H,
      outer: p.wall,
      inner: C.inner,
      frame: p.roof,
      front: [win(-0.55, 0.9, 0.7, 1.8), door(0.7, 0.9, 1.8)],
      back: [win(0, 1.0, 0.8, 1.8)],
      left: [win(0, 1.0, 0.8, 1.8)],
      right: [win(0, 1.0, 0.8, 1.8)],
    },
    lod,
  );
  put(acc, baseBox(W + 0.3, 0.16, D + 0.3), [0, H, 0], p.trim, { aoAmt: 0.05 });
  const ry = H + 0.16;
  // observatory dome (+ slit), offset back so the vane reads beside it
  domeCap(acc, V(0, ry, -0.35), variant === 0 ? 1.15 : 1.3, p.roof, lod, C.dark);
  // anemometer pinwheel on a mast (spins), front-right
  const mx = 1.05;
  const mz = 0.95;
  const hubY = ry + 1.5;
  put(acc, cylB(0.05, 0.04, 1.5, 4, true), [mx, ry, mz], C.steel, { aoAmt: 0 });
  const hub = V(mx, hubY, mz + 0.1);
  const tag = spin.tag(hub);
  for (let k = 0; k < (hi ? 2 : 1); k++)
    put(acc, new THREE.BoxGeometry(0.95, 0.06, 0.05), hub, C.steelLight, {
      q: qEuler(0, 0, k * (Math.PI / 2) + 0.4),
      windAbs: tag,
      aoAmt: 0,
      ao: () => 0.97,
    });
  for (let k = 0; k < (hi ? 4 : 0); k++) {
    const a = k * (Math.PI / 2) + 0.4;
    put(
      acc,
      new THREE.SphereGeometry(0.13, 5, 3, 0, TAU, 0, Math.PI / 2),
      hub.clone().add(V(Math.cos(a) * 0.47, Math.sin(a) * 0.47, 0)),
      k === 0 ? C.red : acc1,
      { q: qEuler(Math.PI / 2, 0, 0), windAbs: tag, aoAmt: 0, double: true },
    );
  }
  if (hi) put(acc, new THREE.IcosahedronGeometry(0.1, 0), hub, C.gold, { windAbs: tag, aoAmt: 0 });
  // deck + solar panel are part of the far silhouette too
  put(acc, baseBox(2.2, 0.1, 0.5), [0, 0, D / 2 + 0.25], C.desk, { aoAmt: 0.15 });
  put(acc, baseBox(0.7, 0.04, 0.5), [-1.0, ry + 0.2, 0.9], C.solar, {
    q: qEuler(-0.5, 0, 0),
    aoAmt: 0,
  });
  if (hi) {
    // rain gauge, antenna
    put(acc, cylB(0.08, 0.08, 0.3, 6), [-1.0, 0, D / 2 + 0.3], C.glass, { aoAmt: 0.1 });
    put(acc, cylB(0.025, 0.02, 1.1, 3, true), [-1.2, ry, -1.0], C.steelLight, { aoAmt: 0 });
    glyph(acc, 'research', V(0, 1.95, D / 2 + 0.05), 0, 0.3, acc1);
  }
  band(acc, V(0, H - 0.2, D / 2 + 0.01), 0, 2.4, 0.1, lighten(acc1, 0.5), 1);
  return finishSpin(acc.finish(rng, false, true), acc, spin);
}

/** Fixture prop: tripod telescope (decor for the research island). */
export function telescope({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.03);
  const hi = lod === 0;
  const tube = variant === 0 ? C.white : '#86D9DD';
  const ring = variant === 0 ? C.gold : '#4FC3C9';
  const headY = 1.0;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.5;
    strut(
      acc,
      V(0, headY, 0),
      V(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42),
      hi ? 0.03 : 0.04,
      C.deskDark,
    );
  }
  if (hi)
    put(acc, new THREE.CylinderGeometry(0.07, 0.07, 0.12, 6), [0, headY, 0], C.steel, {
      aoAmt: 0.1,
    });
  const q = qEuler(0.95, 0, 0);
  const dir = V(0, 1, 0).applyQuaternion(q);
  const c = V(0, headY + 0.12, 0).add(dir.clone().multiplyScalar(0.2));
  put(acc, new THREE.CylinderGeometry(0.1, 0.1, 0.9, hi ? 8 : 5), c, tube, { q, aoAmt: 0.1 });
  if (hi) {
    put(
      acc,
      new THREE.CylinderGeometry(0.125, 0.125, 0.1, hi ? 8 : 5),
      c.clone().add(dir.clone().multiplyScalar(0.45)),
      ring,
      {
        q,
        aoAmt: 0,
      },
    );
    put(
      acc,
      new THREE.CylinderGeometry(0.1, 0.1, 0.02, 6),
      c.clone().add(dir.clone().multiplyScalar(0.5)),
      '#9FE3FF',
      {
        q,
        emissive: 0.4,
        aoAmt: 0,
        ao: () => 1,
      },
    );
  }
  if (hi) {
    put(
      acc,
      new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4),
      c
        .clone()
        .add(dir.clone().multiplyScalar(-0.1))
        .add(V(0, 0.15, 0)),
      ring,
      {
        q,
        aoAmt: 0,
      },
    );
    put(
      acc,
      new THREE.CylinderGeometry(0.035, 0.035, 0.14, 5),
      c.clone().add(dir.clone().multiplyScalar(-0.5)),
      C.dark,
      {
        q,
        aoAmt: 0,
      },
    );
  }
  return acc.finish(rng, false, true);
}

/* ------------------------------ shared LOD1 proxy ------------------------------ */

/** Native size of each proxy class (u): the engine scales an instance to its shell's footprint. */
export const OFFICE_PROXY = [
  { w: 3.2, d: 3.0, h: 2.4, roof: 'gable' },
  { w: 5.4, d: 4.4, h: 2.9, roof: 'flat' },
  { w: 7.0, d: 4.0, h: 2.6, roof: 'flat' },
  { w: 2.3, d: 2.3, h: 5.6, roof: 'pyramid' },
] as const;

/**
 * Shared far proxy (4 size classes: S / M / L / tower): closed box + roof + emissive window band,
 * neutral tones (a per-instance tint can colour it by theme). LOD0 here is the slightly richer
 * variant (door, plinth, windows); the batcher uses the LOD1 build (<= 45 tris) at distance.
 */
export function officeLod1({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.02);
  const s = OFFICE_PROXY[variant % OFFICE_PROXY.length];
  const hi = lod === 0;
  const wall = '#F6EFE2';
  const roof = '#B9AA95';
  put(acc, baseBox(s.w, s.h, s.d), [0, 0, 0], wall, { aoAmt: 0.18 });
  if (s.roof === 'gable') {
    put(
      acc,
      prism([V2(-s.w / 2 - 0.2, 0), V2(s.w / 2 + 0.2, 0), V2(0, 1.0)], s.d + 0.3),
      [0, s.h, 0],
      roof,
      {
        aoAmt: 0.05,
      },
    );
  } else if (s.roof === 'flat') {
    put(acc, baseBox(s.w + 0.25, 0.3, s.d + 0.25), [0, s.h, 0], roof, { aoAmt: 0.05 });
  } else {
    put(acc, new THREE.ConeGeometry(s.w * 0.8, 1.2, 4).translate(0, 0.6, 0), [0, s.h, 0], roof, {
      q: qEuler(0, Math.PI / 4, 0),
      aoAmt: 0.05,
    });
  }
  const by = s.roof === 'pyramid' ? 4.2 : s.h * 0.52;
  const bh = s.roof === 'pyramid' ? 0.9 : 0.6;
  const bw = s.roof === 'pyramid' ? s.w * 0.6 : s.w * 0.8;
  for (const [z, yaw] of [
    [s.d / 2 + 0.02, 0],
    [-s.d / 2 - 0.02, Math.PI],
  ] as const)
    put(acc, new THREE.PlaneGeometry(bw, bh), [0, by, z], '#FFE0A0', {
      q: qEuler(0, yaw, 0),
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
  if (hi) {
    put(acc, baseBox(s.w + 0.2, 0.15, s.d + 0.2), [0, 0, 0], C.plinth, { aoAmt: 0.2 });
    put(acc, baseBox(0.8, 1.5, 0.08), [s.w * 0.28, 0, s.d / 2 + 0.02], C.deskDark, { aoAmt: 0 });
    put(acc, baseBox(1.0, 1.6, 0.05), [s.w * 0.28, 0, s.d / 2 + 0.01], C.white, { aoAmt: 0 });
    put(acc, baseBox(s.w + 0.1, 0.12, s.d + 0.1), [0, s.h * 0.62, 0], C.white, { aoAmt: 0 });
    put(acc, baseBox(0.4, 0.8, 0.4), [-s.w * 0.3, s.h, s.d * 0.2], C.plinth, { aoAmt: 0.1 });
    put(acc, baseBox(0.5, 0.2, 0.5), [-s.w * 0.3, s.h + 0.8, s.d * 0.2], C.dark, { aoAmt: 0 });
    for (const [x, yaw] of [
      [s.w / 2 + 0.02, Math.PI / 2],
      [-s.w / 2 - 0.02, -Math.PI / 2],
    ] as const)
      put(acc, new THREE.PlaneGeometry(Math.min(1.4, s.d * 0.4), 0.7), [x, by, 0], '#FFE0A0', {
        q: qEuler(0, yaw, 0),
        emissive: 1,
        aoAmt: 0,
        ao: () => 1,
      });
    put(
      acc,
      baseBox(0.5, 0.7, 0.5),
      [s.w * 0.25, s.h + (s.roof === 'flat' ? 0.3 : 0.4), -s.d * 0.2],
      C.plinth,
      {
        aoAmt: 0.1,
      },
    );
  }
  return acc.finish(rng, false, true);
}
