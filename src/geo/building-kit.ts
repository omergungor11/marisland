/**
 * Building kit v2 (TASK-598): reusable roof / window / door / trim pieces for the styled building
 * variants (content/building-variants.ts). No dependency on geo/buildings.ts (that file imports the
 * styled builders through geo/building-v2.ts). Frames: +z = door side, ridge along z unless noted.
 * Single-sided sheets are wound outward (polyGeo) so no part is thinner than the eave plate (0.12).
 */
import * as THREE from 'three';
import {
  BUILDING_K as K,
  type BuildingStyle,
  type ChimneyKind,
  type DoorKind,
  type WindowPattern,
} from '../content/building-variants.ts';
import { EMISSIVE, ROCK } from '../content/palette.ts';
import { col, type Acc } from './kit.ts';
import { V, V2, baseBox, bevBox, cylB, doorAt, prism, put, windowAt } from './parts.ts';
import type { Lod } from './types.ts';

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Convex solid / sheet from planar faces, every face wound to look away from `inside`. */
export function polyGeo(faces: THREE.Vector3[][], inside: THREE.Vector3): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const f of faces) {
    const c = f.reduce((a, p) => a.add(p), V(0, 0, 0)).multiplyScalar(1 / f.length);
    const out = c.sub(inside);
    for (let i = 1; i < f.length - 1; i++) {
      const a = f[0];
      let b = f[i];
      let d = f[i + 1];
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
      if (n.dot(out) < 0) [b, d] = [d, b];
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** Hip roof sheet, eave rectangle (+-hx, +-hz) at y = 0, ridge along z of half-length rr (0 = pyramid). */
export function hipGeo(hx: number, hz: number, rr: number, rise: number): THREE.BufferGeometry {
  const A = V(-hx, 0, hz);
  const B = V(hx, 0, hz);
  const C = V(hx, 0, -hz);
  const D = V(-hx, 0, -hz);
  const R1 = V(0, rise, rr);
  const R2 = V(0, rise, -rr);
  return polyGeo(
    [
      [A, B, R1],
      [C, D, R2],
      [B, C, R2, R1],
      [D, A, R1, R2],
    ],
    V(0, rise * 0.3, 0),
  );
}

/** Mansard sheet: steep lower band (inset, hLow) then a low hip cap (hTop), eave rectangle at y = 0. */
export function mansardGeo(
  hx: number,
  hz: number,
  inset: number,
  hLow: number,
  hTop: number,
): THREE.BufferGeometry {
  const mx = hx - inset;
  const mz = hz - inset;
  const e = [V(-hx, 0, hz), V(hx, 0, hz), V(hx, 0, -hz), V(-hx, 0, -hz)];
  const m = [V(-mx, hLow, mz), V(mx, hLow, mz), V(mx, hLow, -mz), V(-mx, hLow, -mz)];
  const rr = Math.max(0, mz - mx);
  const R1 = V(0, hLow + hTop, rr);
  const R2 = V(0, hLow + hTop, -rr);
  const faces: THREE.Vector3[][] = [];
  for (let i = 0; i < 4; i++) faces.push([e[i], e[(i + 1) % 4], m[(i + 1) % 4], m[i]]);
  faces.push([m[0], m[1], R1], [m[2], m[3], R2], [m[1], m[2], R2, R1], [m[3], m[0], R1, R2]);
  return polyGeo(faces, V(0, hLow * 0.4, 0));
}

/** BoxGeometry without its -z face (and optionally without the bottom): 10 / 8 tris. */
export function boxOpen(w: number, h: number, d: number, bottom = true): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const p = g.getAttribute('position');
  const keep: number[] = [];
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (2 tris each)
  for (let f = 0; f < 6; f++) {
    if (f === 5 || (f === 3 && !bottom)) continue;
    for (let i = 0; i < 6; i++) keep.push(p.getX(f * 6 + i), p.getY(f * 6 + i), p.getZ(f * 6 + i));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  return out;
}

export interface RoofOpts {
  top: number;
  /** Wall half extents. */
  hx: number;
  hz: number;
  rise: number;
  roof: string;
  lod: Lod;
}

const roofShade =
  (roof: string, top: number, rise: number) =>
  (p: THREE.Vector3): THREE.Color =>
    col(roof).multiplyScalar(0.92 + 0.14 * clamp01((p.y - top) / rise));

/** Eave plate (flat slab under a thin sheet): rim thickness + dark soffit. */
export function eavePlate(
  acc: Acc,
  o: { top: number; hx: number; hz: number; roof: string },
): void {
  const t = K.plate.thick;
  put(
    acc,
    new THREE.BoxGeometry(2 * o.hx, t, 2 * o.hz),
    [0, o.top - t / 2 + 0.02, 0],
    (p) => col(o.roof).multiplyScalar(p.y > o.top - 0.01 ? 0.86 : 0.7),
    { ao: (p) => (p.y < o.top - t / 2 ? K.plate.soffitAo : 0.96), noJitter: false },
  );
}

/** Hip roof over a wall box. Returns the roof height (world y) above (x, z). */
export function addHipRoof(acc: Acc, o: RoofOpts): (x: number, z: number) => number {
  const ov = K.overhang.hip;
  const ex = o.hx + ov;
  const ez = o.hz + ov;
  const rise = o.rise * K.hip.riseMul;
  const rr = Math.max(0, ez - ex);
  eavePlate(acc, { top: o.top, hx: ex, hz: ez, roof: o.roof });
  put(acc, hipGeo(ex, ez, rr, rise), [0, o.top + 0.04, 0], roofShade(o.roof, o.top, rise), {
    aoAmt: 0.06,
  });
  return (x, z) => {
    const t = Math.max(Math.abs(x) / ex, Math.max(0, Math.abs(z) - rr) / (ez - rr || 1));
    return o.top + 0.04 + rise * (1 - Math.min(1, t));
  };
}

/** Mansard roof over a wall box. */
export function addMansardRoof(acc: Acc, o: RoofOpts): (x: number, z: number) => number {
  const ov = K.overhang.mansard;
  const ex = o.hx + ov;
  const ez = o.hz + ov;
  const hLow = o.rise * K.mansard.lowMul;
  const hTop = o.rise * K.mansard.topMul;
  eavePlate(acc, { top: o.top, hx: ex, hz: ez, roof: o.roof });
  put(
    acc,
    mansardGeo(ex, ez, K.mansard.inset, hLow, hTop),
    [0, o.top + 0.04, 0],
    roofShade(o.roof, o.top, hLow + hTop),
    { aoAmt: 0.06 },
  );
  const mx = ex - K.mansard.inset;
  const mz = ez - K.mansard.inset;
  return (x, z) => {
    const ax = Math.abs(x);
    const az = Math.abs(z);
    if (ax > mx || az > mz) {
      const t = Math.max((ax - mx) / K.mansard.inset, (az - mz) / K.mansard.inset);
      return o.top + 0.04 + hLow * (1 - clamp01(t));
    }
    return o.top + 0.04 + hLow + hTop * (1 - Math.max(ax / (mx || 1), az / (mz || 1)) * 0.6);
  };
}

/** Small gabled dormers on the +-x slopes of a ridge-along-z roof (slab upper surface y(x) = top + rise (1 - |x| / X)). */
export function addDormers(
  acc: Acc,
  o: {
    top: number;
    X: number;
    rise: number;
    z: number;
    roof: string;
    wall: string;
    trim: string;
    sides: readonly (1 | -1)[];
    lod: Lod;
  },
): void {
  if (o.lod === 1) return;
  const k = K.dormer;
  const xf = o.X * k.at;
  const yAt = o.top + o.rise * (1 - xf / o.X);
  const base = yAt - 0.3;
  const wh = yAt + k.wallH - base;
  for (const s of o.sides) {
    const cx = s * (xf - k.depth / 2);
    put(acc, new THREE.BoxGeometry(k.depth, wh, k.w), [cx, base + wh / 2, o.z], o.wall, {
      aoAmt: 0.1,
    });
    const roofG = prism(
      [V2(-k.w / 2 - 0.1, 0), V2(k.w / 2 + 0.1, 0), V2(0, k.rise)],
      k.depth + 0.12,
    ).rotateY(Math.PI / 2);
    put(
      acc,
      roofG,
      [s * (xf - k.depth / 2 + 0.06), yAt + k.wallH, o.z],
      col(o.roof).multiplyScalar(1.12),
      { aoAmt: 0.05 },
    );
    windowAt(acc, {
      at: V(s * xf, yAt + k.wallH * 0.5, o.z),
      yaw: s * (Math.PI / 2),
      w: k.window,
      h: k.window,
      frame: o.trim,
      glow: col(EMISSIVE.window),
    });
  }
}

/** Gambrel-free window row on a wall: local x runs left to right as seen from outside. */
export function windowRow(
  acc: Acc,
  o: {
    centre: THREE.Vector3;
    yaw: number;
    xs: readonly number[];
    y: number;
    w?: number;
    h?: number;
    trim: string;
    shutters?: string;
    flowerBox?: boolean;
    sill?: boolean;
  },
): void {
  const right = V(Math.cos(o.yaw), 0, -Math.sin(o.yaw));
  const out = V(Math.sin(o.yaw), 0, Math.cos(o.yaw));
  const w = o.w ?? 0.6;
  const h = o.h ?? 0.7;
  for (const x of o.xs) {
    const at = o.centre.clone().addScaledVector(right, x).setY(o.y);
    windowAt(acc, {
      at,
      yaw: o.yaw,
      w,
      h,
      frame: o.trim,
      glow: col(EMISSIVE.window),
      sill: o.sill && !o.flowerBox,
    });
    if (o.shutters) {
      for (const s of [-1, 1]) {
        const p = at
          .clone()
          .addScaledVector(right, s * (w / 2 + 0.07 + K.shutter.w / 2 + 0.01))
          .addScaledVector(out, 0.03);
        put(acc, boxOpen(K.shutter.w, h + 0.14, K.shutter.d), p, o.shutters, {
          q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), o.yaw),
          aoAmt: 0,
        });
      }
    }
    if (o.flowerBox) {
      const p = at
        .clone()
        .addScaledVector(out, 0.12)
        .add(V(0, -(h / 2 + 0.07 + K.flowerBox.h / 2), 0));
      const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), o.yaw);
      put(acc, boxOpen(w + 0.24, K.flowerBox.h, K.flowerBox.d, false), p, o.trim, {
        q,
        aoAmt: 0.1,
      });
      const bw = w + 0.18;
      const top = new THREE.PlaneGeometry(bw, K.flowerBox.d - 0.04, 4, 1).rotateX(-Math.PI / 2);
      const fol = K.flowerBox.foliage;
      put(
        acc,
        top,
        p.clone().add(V(0, K.flowerBox.h / 2 + 0.05, 0)),
        (v) => {
          const lp = v.clone().sub(p);
          const along = lp.dot(right);
          const i = Math.min(3, Math.max(0, Math.floor((along / bw + 0.5) * 4)));
          return col(fol[i]);
        },
        { q, ao: () => 0.97, noJitter: true },
      );
    }
  }
}

/** Door with a step. Door base on the wall at `at` (y = floor line). Returns the door half width incl. frame. */
export function addDoor(
  acc: Acc,
  kind: DoorKind,
  at: THREE.Vector3,
  yaw: number,
  c: { door: string; frame: string; step?: string; w?: number; h?: number },
): number {
  const out = V(Math.sin(yaw), 0, Math.cos(yaw));
  const h = c.h ?? 1.6;
  const w = c.w ?? (kind === 'double' ? 1.3 : 0.9);
  if (kind === 'plain') doorAt(acc, at, yaw, c.door, c.frame, w, h);
  else if (kind === 'double') {
    const right = V(Math.cos(yaw), 0, -Math.sin(yaw));
    const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw);
    put(
      acc,
      new THREE.BoxGeometry(w + 0.22, h + 0.14, 0.1),
      at.clone().add(V(0, (h + 0.14) / 2, 0)),
      c.frame,
      {
        q,
        aoAmt: 0,
      },
    );
    for (const s of [-1, 1])
      put(
        acc,
        new THREE.BoxGeometry(w / 2 - 0.03, h, 0.08),
        at
          .clone()
          .addScaledVector(right, s * (w / 4 + 0.005))
          .add(V(0, h / 2, 0))
          .addScaledVector(out, 0.04),
        c.door,
        { q, aoAmt: 0.05 },
      );
  } else {
    const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw);
    put(
      acc,
      new THREE.BoxGeometry(w + 0.22, h + 0.14, 0.1),
      at.clone().add(V(0, (h + 0.14) / 2, 0)),
      c.frame,
      {
        q,
        aoAmt: 0,
      },
    );
    const r = w / 2;
    const sh = new THREE.Shape();
    sh.moveTo(-r, 0);
    sh.lineTo(r, 0);
    sh.lineTo(r, h - r);
    sh.absarc(0, h - r, r, 0, Math.PI, false);
    sh.lineTo(-r, 0);
    const arch = new THREE.ExtrudeGeometry(sh, {
      depth: 0.08,
      bevelEnabled: false,
      curveSegments: 3,
    });
    put(acc, arch, at.clone().addScaledVector(out, 0.0), c.door, { q, aoAmt: 0.05 });
  }
  if (c.step) {
    const sw = w + 0.4;
    put(acc, baseBox(sw, 0.14, 0.4), at.clone().addScaledVector(out, 0.2).setY(0), c.step, {
      q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw),
      aoAmt: 0.2,
    });
  }
  return w / 2 + 0.11;
}

/** Striped awning over a door: sloped sheet + valance, `stripes` alternating colours, end caps. */
export function addAwning(
  acc: Acc,
  o: {
    at: THREE.Vector3;
    yaw: number;
    width: number;
    y: number;
    colours: readonly [string, string];
  },
): void {
  const { depth, drop, valance, stripes } = K.awning;
  const right = V(Math.cos(o.yaw), 0, -Math.sin(o.yaw));
  const out = V(Math.sin(o.yaw), 0, Math.cos(o.yaw));
  const sw = o.width / stripes;
  const P = (x: number, y: number, z: number): THREE.Vector3 =>
    o.at.clone().addScaledVector(right, x).addScaledVector(out, z).setY(y);
  const x0 = -o.width / 2;
  const yBack = o.y + drop * 0.5;
  const yFront = o.y - drop * 0.5;
  for (let i = 0; i < stripes; i++) {
    const a = x0 + i * sw;
    const b = a + sw;
    const c = o.colours[i % 2];
    const hint = out.clone().add(V(0, 1, 0));
    acc.addPoly([P(a, yBack, 0), P(b, yBack, 0), P(b, yFront, depth), P(a, yFront, depth)], hint, {
      color: col(c),
      windMul: 0,
      ao: () => 1,
    });
    acc.addPoly(
      [
        P(a, yFront, depth),
        P(b, yFront, depth),
        P(b, yFront - valance, depth),
        P(a, yFront - valance, depth),
      ],
      out,
      { color: col(c), windMul: 0, ao: () => 0.92 },
    );
  }
  for (const s of [-1, 1]) {
    const x = s * (o.width / 2);
    acc.addPoly(
      [P(x, yBack, 0), P(x, yFront, depth), P(x, yFront - valance, depth)],
      right.clone().multiplyScalar(s),
      {
        color: col(o.colours[0]),
        windMul: 0,
        ao: () => 0.9,
      },
    );
  }
}

/** Chimney through a roof: `roofY` is the roof height at (x, z). */
export function addChimney(
  acc: Acc,
  kind: ChimneyKind,
  o: { x: number; z: number; top: number; roofY: number },
): void {
  if (kind === 'none') return;
  if (kind === 'brick') {
    const hTop = o.roofY + 0.7;
    put(acc, baseBox(0.5, hTop - (o.top + 0.2), 0.5), [o.x, o.top + 0.2, o.z], col(ROCK[1]), {
      aoAmt: 0.12,
    });
    put(acc, baseBox(0.64, 0.14, 0.64), [o.x, hTop, o.z], col(ROCK[0]), { aoAmt: 0 });
  } else {
    const h = o.roofY + 0.75 - (o.top + 0.2);
    put(acc, cylB(K.pipe.rb, K.pipe.rt, h, K.pipe.radial), [o.x, o.top + 0.2, o.z], col(ROCK[2]), {
      aoAmt: 0.12,
    });
  }
}

/** Front window layout of a ~3 u wide wall (door at `dx`). */
export function frontWindowXs(pattern: WindowPattern, wallW: number): number[] {
  if (pattern === 1) return [-(wallW / 2 - 0.45), wallW / 2 - 0.45];
  if (pattern === 2) return [-(wallW / 2 - 0.85)];
  return [-(wallW / 2 - 0.5), wallW / 2 - 0.5];
}

export const windowSize = (pattern: WindowPattern): { w: number; h: number } =>
  pattern === 1
    ? { w: K.slimWindow.w, h: K.slimWindow.h }
    : pattern === 2
      ? { w: K.wideWindow.w, h: K.wideWindow.h }
      : { w: 0.6, h: 0.7 };

export interface StyledHouse {
  lod: Lod;
  w: number;
  d: number;
  y0: number;
  wallH: number;
  rise: number;
  foundation: boolean;
  /** Floor level door step / awning in the lot frame (stilt huts stand on a deck). */
  step: boolean;
}

/**
 * The shared styled cottage body (walls, plinth, roof by style, door, windows by pattern, trims,
 * chimney). LOD0 only; LOD1 stays the legacy `house()` in the row colours.
 */
export function styledHouse(
  acc: Acc,
  s: BuildingStyle,
  o: StyledHouse,
  gable: (top: number, X: number, rise: number) => void,
): void {
  const { w, d, y0, wallH } = o;
  const top = y0 + wallH;
  if (o.foundation) {
    if (s.plinth)
      put(
        acc,
        baseBox(w + K.plinth.grow, K.plinth.h, d + K.plinth.grow),
        [0, 0, 0],
        col(s.plinth),
        { aoAmt: 0.3 },
      );
    else put(acc, baseBox(w + 0.24, y0 + 0.1, d + 0.24), [0, 0, 0], col(ROCK[0]), { aoAmt: 0.25 });
  }
  // walls: ground AO + a darker band under the eaves
  put(acc, bevBox(w, wallH, d, 0.12), [0, y0 + wallH / 2, 0], s.wall, {
    ao: (p) =>
      Math.min(
        1,
        1 - 0.2 * (1 - smooth(y0, y0 + wallH * 0.45, p.y)) - 0.1 * smooth(top - 0.5, top, p.y),
      ),
  });
  let roofY: (x: number, z: number) => number;
  const hx = w / 2;
  const hz = d / 2;
  if (s.roof === 'hip')
    roofY = addHipRoof(acc, { top, hx, hz, rise: o.rise, roof: s.roofCol, lod: o.lod });
  else if (s.roof === 'mansard')
    roofY = addMansardRoof(acc, { top, hx, hz, rise: o.rise, roof: s.roofCol, lod: o.lod });
  else {
    const X = hx + K.overhang.gable;
    gable(top, X, o.rise);
    roofY = (x) => top + o.rise * (1 - Math.min(1, Math.abs(x) / X));
    if (s.roof === 'dormer')
      addDormers(acc, {
        top,
        X,
        rise: o.rise,
        z: 0.4,
        roof: s.roofCol,
        wall: s.wall,
        trim: s.trim,
        sides: s.dormers === 1 ? [1] : [1, -1],
        lod: o.lod,
      });
  }
  // door + step
  const pat = s.windows;
  const dHalfNominal = (s.door === 'double' ? 1.3 : 0.9) / 2 + 0.11;
  const dx = pat === 2 ? Math.min(0.7, w / 2 - dHalfNominal - 0.06) : 0;
  const dHalf = addDoor(acc, s.door, V(dx, y0, hz), 0, {
    door: s.doorCol,
    frame: s.trim,
    ...(o.step ? { step: ROCK[1] } : {}),
  });
  if (s.awning)
    addAwning(acc, {
      at: V(dx, y0, hz),
      yaw: 0,
      width: dHalf * 2 + 0.3,
      y: y0 + (s.door === 'double' ? 2.0 : 1.95),
      colours: s.awning,
    });
  // windows
  const { w: ww0, h: wh } = windowSize(pat);
  // pattern 2: the wide window fills the span left of the off-centre door
  const spanR = dx - dHalf - 0.12;
  const spanL = -w / 2 + 0.12;
  const ww = pat === 2 ? Math.min(ww0, spanR - spanL - 0.14) : ww0;
  const winY = y0 + 1.3 + (pat === 1 ? 0.12 : 0);
  windowRow(acc, {
    centre: V(0, 0, hz),
    yaw: 0,
    xs: pat === 2 ? [(spanL + spanR) / 2] : frontWindowXs(pat, w),
    y: winY,
    w: ww,
    h: wh,
    trim: s.trim,
    ...(s.shutters ? { shutters: s.shutters } : {}),
    ...(s.flowerBox ? { flowerBox: true } : {}),
    sill: true,
  });
  // sides: pattern 0 one window on +x, pattern 1 slim windows on both, pattern 2 one wide on -x
  if (pat === 0)
    windowRow(acc, { centre: V(hx, 0, 0), yaw: Math.PI / 2, xs: [0], y: winY, trim: s.trim });
  else if (pat === 1)
    for (const sg of [1, -1])
      windowRow(acc, {
        centre: V(sg * hx, 0, 0),
        yaw: sg * (Math.PI / 2),
        xs: [0],
        y: winY,
        w: ww,
        h: wh,
        trim: s.trim,
      });
  else
    windowRow(acc, {
      centre: V(-hx, 0, 0),
      yaw: -Math.PI / 2,
      xs: [0],
      y: winY,
      w: ww,
      h: wh,
      trim: s.trim,
    });
  addChimney(acc, s.chimney, {
    x: w * 0.25,
    z: -d * 0.18,
    top,
    roofY: roofY(w * 0.25, -d * 0.18),
  });
}
