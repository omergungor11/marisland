/**
 * Office building kit (TASK-303): hollow shells with real window openings (holes, not glass, so
 * the tier-2 interior shows through), roofs, signature rooftop gear and the `aSpin` tagging used
 * by fans / beacon rings. Everything goes through `put()` + `Acc` so every geometry carries the
 * cottage attribute set (position / normal / color / wind / ao / emissive) plus `aSpin` where used.
 *
 * Lot-local frame: +z = door side. A wall's `yaw` is the yaw of its outward normal (0 = +z).
 */
import * as THREE from 'three';
import { OFFICE_COLORS as C } from '../content/palette-offices.ts';
import { THEMES } from '../content/themes.ts';
import type { ThemeId } from '../world/types.ts';
import { col, qEuler, type Acc } from './kit.ts';
import { TAU, V, V2, baseBox, cylB, prism, put } from './parts.ts';

/** Top of the thin floor slab inside every shell; interiors stand on it. */
export const FLOOR_Y = 0.08;
/** Wall thickness of hollow shells. */
export const WALL_T = 0.16;
/** Floor line of the testLabStilt hut (deck top 1.2 + 0.02): its interior and workers lift by this. */
export const STILT_FLOOR = 1.22;

export interface Opening {
  /** Wall-local x range, measured from the wall centre (right-hand when facing the wall from outside). */
  x0: number;
  x1: number;
  /** Height above the floor line. */
  y0: number;
  y1: number;
}

export interface WallOpts {
  len: number;
  h: number;
  t: number;
  /** Wall centre at floor level. */
  at: THREE.Vector3;
  /** Yaw of the outward normal. */
  yaw: number;
  outer: string;
  inner: string;
  openings?: readonly Opening[];
  /** Trim colour: draws sill / lintel / jamb frames around each opening (LOD0 only). */
  frame?: string;
  aoAmt?: number;
}

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Strip decomposition of a wall with rectangular holes (adjacent equal strips merge). */
function solidRects(len: number, h: number, openings: readonly Opening[]): Rect[] {
  const half = len / 2;
  const cl = (x: number): number => Math.min(half, Math.max(-half, x));
  const xs = new Set<number>([-half, half]);
  for (const o of openings) {
    xs.add(cl(o.x0));
    xs.add(cl(o.x1));
  }
  const sorted = [...xs].sort((a, b) => a - b);
  const strips: Array<{ xa: number; xb: number; segs: Array<[number, number]> }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const xa = sorted[i];
    const xb = sorted[i + 1];
    if (xb - xa < 1e-4) continue;
    const cuts = openings
      .filter((o) => o.x0 <= xa + 1e-6 && o.x1 >= xb - 1e-6)
      .map((o): [number, number] => [Math.max(0, o.y0), Math.min(h, o.y1)])
      .sort((a, b) => a[0] - b[0]);
    const segs: Array<[number, number]> = [];
    let y = 0;
    for (const [a, b] of cuts) {
      if (a > y + 1e-4) segs.push([y, a]);
      y = Math.max(y, b);
    }
    if (y < h - 1e-4) segs.push([y, h]);
    const last = strips[strips.length - 1];
    if (last && JSON.stringify(last.segs) === JSON.stringify(segs)) last.xb = xb;
    else strips.push({ xa, xb, segs });
  }
  const out: Rect[] = [];
  for (const s of strips)
    for (const [a, b] of s.segs) out.push({ x0: s.xa, x1: s.xb, y0: a, y1: b });
  return out;
}

/** A wall slab with holes. The inside faces take `inner`, everything else `outer`. */
export function wallSlab(acc: Acc, o: WallOpts, lod: 0 | 1 = 0): void {
  const q = qEuler(0, o.yaw, 0);
  const inv = q.clone().invert();
  const invXf = acc.xf ? acc.xf.clone().invert() : new THREE.Matrix4();
  const base = o.at.clone();
  const outer = col(o.outer);
  const inner = col(o.inner);
  const colorFn = (p: THREE.Vector3): THREE.Color => {
    const l = p.clone().applyMatrix4(invXf).sub(base).applyQuaternion(inv);
    return l.z < -o.t * 0.35 ? inner : outer;
  };
  const openings = o.openings ?? [];
  for (const r of solidRects(o.len, o.h, openings)) {
    const w = r.x1 - r.x0;
    const hh = r.y1 - r.y0;
    const c = V((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 0)
      .applyQuaternion(q)
      .add(base);
    put(acc, new THREE.BoxGeometry(w, hh, o.t), c, colorFn, { q, aoAmt: o.aoAmt ?? 0.08 });
  }
  if (!o.frame || lod === 1) return;
  const fc = col(o.frame);
  const f = 0.07;
  for (const op of openings) {
    const w = op.x1 - op.x0;
    const cx = (op.x0 + op.x1) / 2;
    const place = (x: number, y: number): THREE.Vector3 => V(x, y, 0).applyQuaternion(q).add(base);
    const ft = o.t + 0.08;
    if (op.y0 > 0.05)
      put(acc, new THREE.BoxGeometry(w + f * 2, f, ft), place(cx, op.y0 - f / 2), fc, {
        q,
        aoAmt: 0,
      });
    if (op.y1 < o.h - 0.05)
      put(acc, new THREE.BoxGeometry(w + f * 2, f, ft), place(cx, op.y1 + f / 2), fc, {
        q,
        aoAmt: 0,
      });
    for (const sx of [op.x0 - f / 2, op.x1 + f / 2])
      put(acc, new THREE.BoxGeometry(f, op.y1 - op.y0, ft), place(sx, (op.y0 + op.y1) / 2), fc, {
        q,
        aoAmt: 0,
      });
  }
}

export interface ShellOpts {
  w: number;
  d: number;
  h: number;
  outer: string;
  inner: string;
  frame?: string;
  front?: readonly Opening[];
  back?: readonly Opening[];
  left?: readonly Opening[];
  right?: readonly Opening[];
  t?: number;
  /** Floor slab colour (default wood). */
  floor?: string;
  /** Lift of the whole shell above the pivot (stilt huts, tower cabins). */
  y0?: number;
  /** Back-wall lit band colour (default warm window); `false` = none. */
  glow?: string | false;
  glowEmissive?: number;
  /** Skip the floor slab (stacked cabins on an existing deck). */
  noFloor?: boolean;
}

/** Four hollow walls on a thin floor slab. Roof is added separately. LOD1 = one solid box. */
export function boxShell(acc: Acc, s: ShellOpts, lod: 0 | 1): void {
  const t = s.t ?? WALL_T;
  const y0 = s.y0 ?? 0;
  const fy = s.noFloor ? 0 : FLOOR_Y;
  if (lod === 1) {
    put(acc, baseBox(s.w, s.h, s.d), [0, y0, 0], s.outer, { aoAmt: 0.18 });
    return;
  }
  if (!s.noFloor)
    put(acc, baseBox(s.w + 0.1, fy, s.d + 0.1), [0, y0, 0], s.floor ?? C.floor, { aoAmt: 0.1 });
  const hh = s.h - fy;
  const base = y0 + fy;
  const common = { t, h: hh, outer: s.outer, inner: s.inner, frame: s.frame };
  wallSlab(
    acc,
    { ...common, len: s.w, at: V(0, base, s.d / 2 - t / 2), yaw: 0, openings: s.front },
    lod,
  );
  wallSlab(
    acc,
    { ...common, len: s.w, at: V(0, base, -s.d / 2 + t / 2), yaw: Math.PI, openings: s.back },
    lod,
  );
  const sl = s.d - 2 * t;
  wallSlab(
    acc,
    { ...common, len: sl, at: V(s.w / 2 - t / 2, base, 0), yaw: Math.PI / 2, openings: s.right },
    lod,
  );
  wallSlab(
    acc,
    { ...common, len: sl, at: V(-s.w / 2 + t / 2, base, 0), yaw: -Math.PI / 2, openings: s.left },
    lod,
  );
  // lit-room band on the inside of the back wall: reads through the openings at night
  if (s.glow !== false) {
    const w = Math.min(s.w - 2 * t - 0.4, 5.2);
    put(
      acc,
      new THREE.PlaneGeometry(w, 0.5),
      [0, base + 1.25, -s.d / 2 + t + 0.01],
      s.glow ?? '#FFC870',
      { emissive: s.glowEmissive ?? 1, aoAmt: 0, ao: () => 1 },
    );
  }
}

/** Opening helpers. */
export const door = (cx = 0, w = 0.95, h = 1.75): Opening => ({
  x0: cx - w / 2,
  x1: cx + w / 2,
  y0: 0,
  y1: h,
});
export const win = (cx: number, w: number, y0: number, y1: number): Opening => ({
  x0: cx - w / 2,
  x1: cx + w / 2,
  y0,
  y1,
});
/** n equal windows centred in [xa, xb]. */
export function winRow(
  xa: number,
  xb: number,
  n: number,
  gap: number,
  y0: number,
  y1: number,
): Opening[] {
  const w = (xb - xa - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({
    x0: xa + i * (w + gap),
    x1: xa + i * (w + gap) + w,
    y0,
    y1,
  }));
}

/** Flat roof slab with an optional parapet rim (LOD0). `y` = top of the walls. */
export function flatRoof(
  acc: Acc,
  o: {
    w: number;
    d: number;
    y: number;
    roof: string;
    trim: string;
    over?: number;
    parapet?: number;
    lod: 0 | 1;
    thick?: number;
  },
): void {
  const over = o.over ?? 0.12;
  const th = o.thick ?? 0.18;
  put(acc, baseBox(o.w + over * 2, th, o.d + over * 2), [0, o.y, 0], o.roof, { aoAmt: 0.05 });
  if (o.lod === 1 || !o.parapet) return;
  const p = o.parapet;
  const wx = o.w + over * 2;
  const wz = o.d + over * 2;
  const y = o.y + th;
  put(acc, baseBox(wx, p, 0.1), [0, y, wz / 2 - 0.05], o.trim, { aoAmt: 0.1 });
  put(acc, baseBox(wx, p, 0.1), [0, y, -wz / 2 + 0.05], o.trim, { aoAmt: 0.1 });
  put(acc, baseBox(0.1, p, wz - 0.2), [wx / 2 - 0.05, y, 0], o.trim, { aoAmt: 0.1 });
  put(acc, baseBox(0.1, p, wz - 0.2), [-wx / 2 + 0.05, y, 0], o.trim, { aoAmt: 0.1 });
}

/**
 * North-light sawtooth roof: `teeth` rows stacked along z, each a wedge running along x. The
 * vertical glazing faces +z (door side) and is emissive. `y` = top of the walls.
 */
export function sawtoothRoof(
  acc: Acc,
  o: {
    w: number;
    d: number;
    y: number;
    teeth: number;
    rise: number;
    roof: string;
    glass: string;
    lod: 0 | 1;
    over?: number;
  },
): void {
  const over = o.over ?? 0.1;
  const len = o.w + over * 2;
  const pitch = (o.d + over * 2) / o.teeth;
  const z0 = -(o.d + over * 2) / 2;
  for (let i = 0; i < o.teeth; i++) {
    // profile x -> -z after rotateY(pi/2): vertical face at profile x = 0 faces +z
    const wedge = prism([V2(0, 0), V2(pitch, 0), V2(0, o.rise)], len).rotateY(Math.PI / 2);
    const zFront = z0 + (i + 1) * pitch;
    put(acc, wedge, [0, o.y, zFront], o.roof, { aoAmt: 0.05 });
    if (o.lod === 0) {
      put(
        acc,
        new THREE.PlaneGeometry(len - 0.2, o.rise * 0.8),
        [0, o.y + o.rise * 0.46, zFront + 0.01],
        o.glass,
        { emissive: 1, ao: () => 1 },
      );
    }
  }
  // flat base slab under the teeth
  put(acc, baseBox(len, 0.14, o.d + over * 2), [0, o.y - 0.05, 0], o.roof, { aoAmt: 0.05 });
}

/** Hemispherical dome cap, base centre at `at`. */
export function domeCap(
  acc: Acc,
  at: THREE.Vector3,
  r: number,
  color: string,
  lod: 0 | 1,
  slit?: string,
): void {
  const seg = lod === 0 ? 10 : 6;
  put(acc, new THREE.SphereGeometry(r, seg, lod === 0 ? 4 : 2, 0, TAU, 0, Math.PI / 2), at, color, {
    aoAmt: 0.08,
  });
  if (slit && lod === 0) {
    // observation slit: a dark wedge on the +z face of the dome
    put(
      acc,
      new THREE.BoxGeometry(r * 0.34, r * 0.9, 0.06),
      [at.x, at.y + r * 0.55, at.z + r * 0.8],
      slit,
      { q: qEuler(-0.5, 0, 0), aoAmt: 0 },
    );
  }
}

/** Tagging for `aSpin` parts: windAbs ≥ 2 marks a spinner, `2 + k` = hub k. */
export class Spin {
  readonly hubs: THREE.Vector3[] = [];
  tag(hub: THREE.Vector3): number {
    this.hubs.push(hub.clone());
    return 2 + this.hubs.length - 1;
  }
}

/** Convert spinner tags into `aSpin` (hub xyz, 1) + zero wind; hubs are transformed by `acc.xf`. */
export function finishSpin(g: THREE.BufferGeometry, acc: Acc, spin: Spin): THREE.BufferGeometry {
  const windA = g.getAttribute('wind') as THREE.BufferAttribute;
  const hubs = spin.hubs.map((h) => (acc.xf ? h.clone().applyMatrix4(acc.xf) : h.clone()));
  const a = new Float32Array(windA.count * 4);
  for (let i = 0; i < windA.count; i++) {
    const w = windA.getX(i);
    if (w >= 1.5) {
      const h = hubs[Math.min(hubs.length - 1, Math.max(0, Math.round(w) - 2))];
      a.set([h.x, h.y, h.z, 1], i * 4);
      windA.setX(i, 0);
    }
  }
  g.setAttribute('aSpin', new THREE.BufferAttribute(a, 4));
  if (hubs.length) {
    g.userData.hub = [hubs[0].x, hubs[0].y, hubs[0].z];
    g.userData.hubs = hubs.map((h) => [h.x, h.y, h.z]);
    g.userData.spinAxis = [0, 0, 1];
  }
  return g;
}

/** Wall fan facing +z: static housing + 3 blades that spin about the hub (z axis). */
export function fan(
  acc: Acc,
  spin: Spin,
  at: THREE.Vector3,
  r: number,
  housing: string,
  blade: string,
  lod: 0 | 1,
): void {
  const tag = spin.tag(at);
  put(acc, cylB(r + 0.1, r + 0.1, 0.1, lod === 0 ? 8 : 6), [at.x, at.y, at.z - 0.04], housing, {
    q: qEuler(Math.PI / 2, 0, 0),
    aoAmt: 0.05,
  });
  put(
    acc,
    new THREE.CylinderGeometry(r * 0.96, r * 0.96, 0.02, 8),
    [at.x, at.y, at.z + 0.02],
    C.dark,
    {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0,
    },
  );
  const n = lod === 0 ? 3 : 2;
  for (let k = 0; k < n; k++) {
    const q = qEuler(0, 0, (k * Math.PI) / n + 0.3);
    put(acc, new THREE.BoxGeometry(r * 1.75, r * 0.3, 0.04), [at.x, at.y, at.z + 0.06], blade, {
      q,
      windAbs: tag,
      aoAmt: 0,
      ao: () => 0.97,
    });
  }
  put(acc, new THREE.IcosahedronGeometry(r * 0.2, 0), [at.x, at.y, at.z + 0.09], C.steelLight, {
    windAbs: tag,
    aoAmt: 0,
  });
}

/** Parabolic dish on a short mast. `yaw` turns it about y; faces +z (yaw 0) tilted up by `elev`. */
export function dish(
  acc: Acc,
  at: THREE.Vector3,
  o: { r: number; yaw: number; elev: number; color: string; mast: number; lod: 0 | 1 },
): void {
  const { r, yaw, elev, mast } = o;
  const a = Math.PI / 2 - elev;
  const qy = qEuler(0, yaw, 0);
  put(acc, cylB(0.09, 0.07, mast, 5, true), at, C.steel, { aoAmt: 0.1 });
  const theta = 1.05;
  const R = r / Math.sin(theta);
  const bowl = new THREE.SphereGeometry(
    R,
    o.lod === 0 ? 10 : 6,
    o.lod === 0 ? 3 : 2,
    0,
    TAU,
    Math.PI - theta,
    theta,
  );
  // bottom cap of a sphere: bring the rim plane to y = 0 (opening faces +y)
  bowl.translate(0, R * Math.cos(theta), 0);
  const cen = at.clone().add(V(0, mast + R * (1 - Math.cos(theta)) * 0.5 + 0.1, 0));
  const q = qy.clone().multiply(qEuler(a, 0, 0));
  put(acc, bowl, cen, o.color, { q, double: true, aoAmt: 0.05 });
  const axis = V(0, 1, 0).applyQuaternion(q);
  if (o.lod === 0) {
    put(
      acc,
      new THREE.CylinderGeometry(0.025, 0.025, r * 0.9, 3),
      cen.clone().add(axis.clone().multiplyScalar(r * 0.45)),
      C.steelLight,
      {
        q,
        aoAmt: 0,
      },
    );
    put(
      acc,
      new THREE.IcosahedronGeometry(0.075, 0),
      cen.clone().add(axis.clone().multiplyScalar(r * 0.92)),
      C.gold,
      {
        aoAmt: 0,
      },
    );
  }
}

/** Roof vent / steam stack: pipe + flared cap. `top` = height of the cap above `at`. */
export function vent(
  acc: Acc,
  at: THREE.Vector3,
  top: number,
  r: number,
  color: string,
  lod: 0 | 1,
): void {
  const seg = lod === 0 ? 8 : 5;
  put(acc, cylB(r, r, top - 0.1, seg, true), at, color, { aoAmt: 0.15 });
  put(acc, cylB(r * 1.35, r * 1.2, 0.12, seg), at.clone().setY(at.y + top - 0.12), C.dark, {
    aoAmt: 0,
  });
  if (lod === 0)
    put(acc, cylB(r * 1.5, r * 1.5, 0.05, seg), at.clone().setY(at.y + 0.0), C.steelLight, {
      aoAmt: 0,
    });
}

/** Row of tilted solar panels (n across x), base centre `at`. */
export function solarRow(
  acc: Acc,
  at: THREE.Vector3,
  n: number,
  pw: number,
  pd: number,
  lod: 0 | 1,
): void {
  const tilt = -0.42;
  const x0 = -((n - 1) * (pw + 0.12)) / 2;
  for (let i = 0; i < n; i++) {
    const p = at.clone().add(V(x0 + i * (pw + 0.12), 0.3, 0));
    put(acc, new THREE.BoxGeometry(pw, 0.05, pd), p, C.solar, { q: qEuler(tilt, 0, 0), aoAmt: 0 });
    if (lod === 0) {
      put(
        acc,
        new THREE.BoxGeometry(pw * 0.92, 0.012, pd * 0.12),
        p.clone().add(V(0, 0.032, 0)),
        C.solarLine,
        {
          q: qEuler(tilt, 0, 0),
          aoAmt: 0,
        },
      );
      put(
        acc,
        cylB(0.03, 0.03, 0.3, 3),
        at.clone().add(V(x0 + i * (pw + 0.12), 0, -pd * 0.25)),
        C.steel,
        { aoAmt: 0 },
      );
    }
  }
}

/** Traffic cone (orange, white band). */
export function trafficCone(acc: Acc, at: THREE.Vector3, s: number, lod: 0 | 1): void {
  put(acc, baseBox(0.28 * s, 0.03 * s, 0.28 * s), at, C.dark, { aoAmt: 0 });
  put(
    acc,
    new THREE.ConeGeometry(0.11 * s, 0.4 * s, lod === 0 ? 6 : 4).translate(0, 0.2 * s, 0),
    at.clone().add(V(0, 0.03 * s, 0)),
    C.cone,
    {
      aoAmt: 0.1,
    },
  );
  if (lod === 0)
    put(acc, cylB(0.075 * s, 0.062 * s, 0.07 * s, 6), at.clone().add(V(0, 0.17 * s, 0)), C.white, {
      aoAmt: 0,
    });
}

/** Server rack with LED dots (emissive 2). Front faces +z in local frame (rotate with q). */
export function rack(
  acc: Acc,
  at: THREE.Vector3,
  yaw: number,
  o: { w?: number; h?: number; d?: number; body: string; seed: number; lod: 0 | 1 },
): void {
  const w = o.w ?? 0.6;
  const h = o.h ?? 1.7;
  const d = o.d ?? 0.55;
  const q = qEuler(0, yaw, 0);
  put(acc, baseBox(w, h, d), at, o.body, { q, aoAmt: 0.15 });
  const rows = o.lod === 0 ? 5 : 3;
  for (let i = 0; i < rows; i++) {
    const y = h * (0.18 + (0.72 * i) / Math.max(1, rows - 1));
    const p = at.clone().add(V(0, y, d / 2 + 0.01).applyQuaternion(q));
    put(acc, new THREE.PlaneGeometry(w * 0.78, h * 0.11), p, C.bezel, { q, aoAmt: 0, ao: () => 1 });
    const lc = C.led[(o.seed + i) % C.led.length];
    const lp = at
      .clone()
      .add(V(-w * 0.28 + ((o.seed + i) % 3) * 0.04, y, d / 2 + 0.02).applyQuaternion(q));
    put(acc, new THREE.PlaneGeometry(w * 0.1, h * 0.05), lp, lc, {
      q,
      emissive: 2,
      aoAmt: 0,
      ao: () => 1,
    });
    if (o.lod === 0) {
      const lp2 = at.clone().add(V(w * 0.22, y, d / 2 + 0.02).applyQuaternion(q));
      put(acc, new THREE.PlaneGeometry(w * 0.2, h * 0.04), lp2, C.led[(o.seed + i + 1) % 3], {
        q,
        emissive: 2,
        aoAmt: 0,
        ao: () => 1,
      });
    }
  }
}

/** Potted plant (pot + leaf blob). */
export function plant(acc: Acc, at: THREE.Vector3, s: number, lod: 0 | 1): void {
  if (lod === 1) return;
  put(acc, cylB(0.16 * s, 0.12 * s, 0.22 * s, lod === 0 ? 6 : 4), at, C.pot, { aoAmt: 0.15 });
  put(acc, new THREE.IcosahedronGeometry(0.22 * s, 0), at.clone().add(V(0, 0.38 * s, 0)), C.plant, {
    aoAmt: 0.1,
  });
}

/** Flat panel (monitor): body + emissive-2 screen facing +z of `yaw`. Centre at `at` (screen centre). */
export function monitor(
  acc: Acc,
  at: THREE.Vector3,
  yaw: number,
  w: number,
  h: number,
  screen: string,
  lod: 0 | 1,
): void {
  const q = qEuler(0, yaw, 0);
  if (lod === 0)
    put(acc, new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.04), at, C.bezel, { q, aoAmt: 0 });
  const sp = at.clone().add(V(0, 0, 0.025).applyQuaternion(q));
  put(acc, new THREE.PlaneGeometry(w, h), sp, screen, { q, emissive: 2, aoAmt: 0, ao: () => 1 });
}

/* ------------------------------ glyph signs ------------------------------ */

const poly = (pts: ReadonlyArray<readonly [number, number]>): THREE.Vector2[] =>
  pts.map(([x, y]) => V2(x, y));

/** Icon outlines in a [-0.5, 0.5] box, one list of Shapes per theme. */
function glyphShapes(theme: ThemeId): THREE.Shape[] {
  switch (theme) {
    case 'hq': {
      // hub: a hexagon ring with a hole
      const hex = (r: number): THREE.Vector2[] =>
        Array.from({ length: 6 }, (_, i) =>
          V2(Math.cos((i / 6) * TAU + Math.PI / 6) * r, Math.sin((i / 6) * TAU + Math.PI / 6) * r),
        );
      const s = new THREE.Shape(hex(0.5));
      s.holes.push(new THREE.Path(hex(0.24).reverse()));
      return [s, new THREE.Shape(hex(0.1))];
    }
    case 'coding': {
      const l = poly([
        [-0.2, 0.4],
        [-0.5, 0],
        [-0.2, -0.4],
        [-0.08, -0.28],
        [-0.3, 0],
        [-0.08, 0.28],
      ]);
      const r = poly([
        [0.2, 0.4],
        [0.5, 0],
        [0.2, -0.4],
        [0.08, -0.28],
        [0.3, 0],
        [0.08, 0.28],
      ]);
      const slash = poly([
        [0.07, 0.42],
        [0.17, 0.42],
        [-0.07, -0.42],
        [-0.17, -0.42],
      ]);
      return [new THREE.Shape(l), new THREE.Shape(r), new THREE.Shape(slash)];
    }
    case 'marketing':
      return [
        new THREE.Shape(
          poly([
            [-0.5, -0.12],
            [-0.5, 0.12],
            [-0.12, 0.12],
            [0.42, 0.44],
            [0.42, -0.44],
            [-0.12, -0.12],
          ]),
        ),
        new THREE.Shape(
          poly([
            [-0.38, -0.12],
            [-0.22, -0.12],
            [-0.12, -0.46],
            [-0.28, -0.46],
          ]),
        ),
      ];
    case 'qa':
      return [
        new THREE.Shape(
          poly([
            [-0.5, 0.02],
            [-0.34, -0.14],
            [-0.14, -0.0],
            [0.3, 0.46],
            [0.46, 0.3],
            [-0.14, -0.42],
          ]),
        ),
      ];
    case 'design': {
      // droplet
      return [
        new THREE.Shape([
          V2(0, 0.5),
          V2(0.36, -0.1),
          V2(0.3, -0.34),
          V2(0, -0.46),
          V2(-0.3, -0.34),
          V2(-0.36, -0.1),
        ]),
      ];
    }
    case 'devops': {
      // gear: 8 teeth, hole
      const out: THREE.Vector2[] = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        const r = i % 2 === 0 ? 0.5 : 0.36;
        out.push(V2(Math.cos(a) * r, Math.sin(a) * r));
      }
      const s = new THREE.Shape(out);
      s.holes.push(
        new THREE.Path(
          Array.from({ length: 8 }, (_, i) =>
            V2(Math.cos((i / 8) * TAU) * 0.15, Math.sin((i / 8) * TAU) * 0.15),
          ).reverse(),
        ),
      );
      return [s];
    }
    case 'research':
      return [
        new THREE.Shape(
          poly([
            [-0.12, 0.5],
            [0.12, 0.5],
            [0.12, 0.12],
            [0.46, -0.4],
            [0.38, -0.5],
            [-0.38, -0.5],
            [-0.46, -0.4],
            [-0.12, 0.12],
          ]),
        ),
      ];
  }
}

/** Extruded theme icon facing +z (yaw turns it), `size` u across, 0.1 u deep. Centre at `at`. */
export function glyph(
  acc: Acc,
  theme: ThemeId,
  at: THREE.Vector3,
  yaw: number,
  size: number,
  color: string,
  emissive = 0,
): void {
  const q = qEuler(0, yaw, 0);
  for (const sh of glyphShapes(theme)) {
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false, curveSegments: 3 });
    g.translate(0, 0, -0.05);
    put(acc, g, at, color, {
      q,
      s: [size, size, 1],
      aoAmt: 0,
      emissive,
      ao: emissive ? () => 1 : undefined,
    });
  }
}

/** Free-standing easel (two legs + rest + canvas facing +z of `yaw`). */
export function easel(
  acc: Acc,
  at: THREE.Vector3,
  yaw: number,
  canvas: string,
  s = 1,
  lod: 0 | 1 = 0,
): void {
  const q = qEuler(0, yaw, 0);
  if (lod === 1) {
    put(
      acc,
      new THREE.BoxGeometry(0.62 * s, 1.1 * s, 0.1 * s),
      at.clone().add(V(0, 0.65 * s, 0).applyQuaternion(q)),
      canvas,
      { q, aoAmt: 0.1 },
    );
    return;
  }
  const P = (x: number, y: number, z: number): THREE.Vector3 =>
    at.clone().add(V(x * s, y * s, z * s).applyQuaternion(q));
  for (const x of [-0.28, 0.28])
    put(acc, new THREE.BoxGeometry(0.05 * s, 1.35 * s, 0.05 * s), P(x, 0.67, -0.05), C.deskDark, {
      q: q.clone().multiply(qEuler(-0.1, 0, 0)),
      aoAmt: 0.1,
    });
  put(acc, new THREE.BoxGeometry(0.06 * s, 1.2 * s, 0.05 * s), P(0, 0.6, -0.22), C.deskDark, {
    q: q.clone().multiply(qEuler(0.25, 0, 0)),
    aoAmt: 0.1,
  });
  put(acc, new THREE.BoxGeometry(0.7 * s, 0.05 * s, 0.1 * s), P(0, 0.45, 0.02), C.deskDark, {
    q,
    aoAmt: 0,
  });
  put(acc, new THREE.BoxGeometry(0.62 * s, 0.82 * s, 0.04 * s), P(0, 0.93, 0.03), C.white, {
    q,
    aoAmt: 0,
  });
  put(acc, new THREE.PlaneGeometry(0.5 * s, 0.34 * s), P(0, 1.0, 0.055), canvas, {
    q,
    aoAmt: 0,
    ao: () => 1,
  });
  put(acc, new THREE.PlaneGeometry(0.24 * s, 0.18 * s), P(0.1, 0.78, 0.055), C.gold, {
    q,
    aoAmt: 0,
    ao: () => 1,
  });
}

/** Abstract sculpture: stacked spheres on a plinth, or a ring. */
export function sculpture(
  acc: Acc,
  at: THREE.Vector3,
  kind: 0 | 1,
  colors: readonly [string, string],
  lod: 0 | 1,
): void {
  put(acc, baseBox(0.5, 0.4, 0.5), at, C.white, { aoAmt: 0.15 });
  const top = at.clone().add(V(0, 0.4, 0));
  if (kind === 0) {
    put(
      acc,
      new THREE.IcosahedronGeometry(0.28, lod === 0 ? 1 : 0),
      top.clone().add(V(0, 0.28, 0)),
      colors[0],
      { aoAmt: 0.1 },
    );
    put(
      acc,
      new THREE.IcosahedronGeometry(0.19, lod === 0 ? 1 : 0),
      top.clone().add(V(0.04, 0.72, 0.02)),
      colors[1],
      { aoAmt: 0 },
    );
    if (lod === 0)
      put(acc, new THREE.IcosahedronGeometry(0.11, 0), top.clone().add(V(-0.03, 1.02, 0)), C.gold, {
        aoAmt: 0,
      });
  } else {
    put(
      acc,
      new THREE.TorusGeometry(0.34, 0.1, 5, lod === 0 ? 10 : 6),
      top.clone().add(V(0, 0.46, 0)),
      colors[0],
      {
        q: qEuler(0.3, 0.6, 0),
        aoAmt: 0.05,
      },
    );
    put(acc, new THREE.IcosahedronGeometry(0.15, 0), top.clone().add(V(0, 0.46, 0)), colors[1], {
      aoAmt: 0,
    });
  }
}

/**
 * Orchestrator Tower crown (clocktower variant 2): flat deck, drum, mast and a vertical beacon ring
 * that turns about its hub (aSpin, z axis) with 6 lit agent nodes. Returns the flag base y.
 */
export function beaconRing(
  acc: Acc,
  spin: Spin,
  o: { stageTop: number; wall: string; trim: string; lod: 0 | 1 },
): number {
  const { stageTop: st, lod } = o;
  const hi = lod === 0;
  const accent = THEMES.hq.accent;
  put(acc, baseBox(3.3, 0.14, 3.3), [0, st, 0], o.trim, { aoAmt: 0.05 });
  const dy = st + 0.14;
  if (hi) {
    for (const [x, z, w, d] of [
      [0, 1.6, 3.3, 0.1],
      [0, -1.6, 3.3, 0.1],
      [1.6, 0, 0.1, 3.1],
      [-1.6, 0, 0.1, 3.1],
    ] as const)
      put(acc, baseBox(w, 0.3, d), [x, dy, z], o.wall, { aoAmt: 0.1 });
  }
  put(acc, cylB(0.62, 0.5, 0.7, hi ? 8 : 5), [0, dy, 0], accent, { aoAmt: 0.1 });
  const hubY = st + 2.15;
  const fy = hubY + 1.45;
  put(acc, cylB(0.07, 0.05, fy - dy, 4, true), [0, dy, 0], C.steel, { aoAmt: 0 });
  const hub = V(0, hubY, 0);
  const tag = spin.tag(hub);
  const lit = `#${col(accent).lerp(new THREE.Color('#FFFFFF'), 0.45).getHexString()}`;
  put(acc, new THREE.TorusGeometry(1.2, 0.07, hi ? 5 : 4, hi ? 14 : 8), hub, C.gold, {
    windAbs: tag,
    aoAmt: 0,
    ao: () => 0.97,
  });
  put(acc, new THREE.IcosahedronGeometry(0.26, hi ? 1 : 0), hub, lit, {
    windAbs: tag,
    emissive: 1,
    ao: () => 1,
  });
  const n = hi ? 6 : 3;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + 0.3;
    put(
      acc,
      new THREE.IcosahedronGeometry(0.14, 0),
      V(Math.cos(a) * 1.2, hubY + Math.sin(a) * 1.2, 0),
      lit,
      {
        windAbs: tag,
        emissive: 1,
        ao: () => 1,
      },
    );
  }
  if (hi) {
    // spokes + static halo
    for (let k = 0; k < 3; k++)
      put(acc, new THREE.BoxGeometry(2.3, 0.04, 0.04), hub, C.steelLight, {
        q: qEuler(0, 0, (k * Math.PI) / 3 + 0.3),
        windAbs: tag,
        aoAmt: 0,
        ao: () => 0.97,
      });
    put(acc, new THREE.TorusGeometry(0.75, 0.035, 4, 12), hub.clone().setY(hubY - 0.0), accent, {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0,
    });
  }
  return fy;
}
