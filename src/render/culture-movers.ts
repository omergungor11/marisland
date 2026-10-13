import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import { hashInts } from '../core/hash.ts';
import { BEAM } from '../content/lighting.ts';
import { PROP_DEF_INDEX } from '../content/props.ts';
import { CULTURE_MOVERS as M } from '../content/cultures/movers.ts';
import type { CultureFestival, CultureState } from './culture-clock.ts';
import type { EnvState } from '../env/env-state.ts';
import { makeLifeMaterial } from '../life/life-material.ts';
import { PropFlag, type PropStore } from '../world/prop-store.ts';
import { heightAt, type ThemeId, type WorldData } from '../world/types.ts';
import { buildBeamGeometry } from './night/beam.ts';
import { createSkyProgramMaterial } from './sky/sky.ts';
import { SHARED } from './uniforms.ts';
import { PART, buildPartsGeometry, type PartKind } from './culture-mover-parts.ts';

/**
 * Culture movers (M19 TASK-431): closed-form scenes that make each island culture visibly alive.
 * Not agents. Every pose is a function of the sim time (`time`), the game hour (rituals) and the sun
 * direction only, so a capture replays it exactly. Rituals progress with the hour, ambient wobble
 * (rings, flutter, bob, ants) with the sim time; `uMotionScale` (reduced motion) calms the wobble.
 *
 * One InstancedMesh with one merged geometry (render/culture-mover-parts.ts) on the shared creature
 * material: one draw call and no program, whatever the scene count. It draws nothing while no scene
 * is active within `M.range` of the camera. The night searchlight sweeps are meshes of the
 * lighthouse beam (same program as the sky dome), one per projector, hidden by day.
 * Scenes are ADDITIVE: they add moving things next to the (static, batched) kit props.
 */

type V3 = readonly [number, number, number];

export interface CultureCtx {
  time: number;
  hour: number;
  /** Direction to the sun (true, may point below the horizon) and 0 day .. 1 night. */
  sun: { x: number; y: number; z: number };
  night: number;
  /** World wind: unit direction x / z and strength. */
  wind: { x: number; z: number; s: number };
  /** Reduced-motion scale 0..1 for the wobble terms. */
  motion: number;
  /** The ritual running on the scene's island now (culture clock), or null. */
  fest: CultureFestival | null;
}

/** One instance being written into the mesh buffers. */
class Writer {
  n = 0;
  private readonly _m = new THREE.Matrix4();
  private readonly _l = new THREE.Matrix4();
  private readonly _p = new THREE.Vector3();
  private readonly _q = new THREE.Quaternion();
  private readonly _s = new THREE.Vector3();
  private readonly _e = new THREE.Euler();
  private readonly _c = new THREE.Color();
  private readonly colours = new Map<string, THREE.Color>();
  /** Anchor pivot applied to local-frame parts (null = world frame). */
  pivot: THREE.Matrix4 | null = null;
  constructor(
    readonly mesh: THREE.InstancedMesh,
    private readonly gait: THREE.InstancedBufferAttribute,
  ) {}

  private colour(hex: string | undefined): THREE.Color {
    if (!hex) return this._c.setRGB(1, 1, 1);
    let c = this.colours.get(hex);
    if (!c) this.colours.set(hex, (c = new THREE.Color(hex)));
    return c;
  }

  private commit(kind: PartKind, hex: string | undefined): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    const m = this.pivot ? this._m.multiplyMatrices(this.pivot, this._l) : this._l;
    this.mesh.setMatrixAt(this.n, m);
    this.mesh.setColorAt(this.n, this.colour(hex));
    this.gait.setXYZ(this.n, 0, kind, 0);
    this.n++;
  }

  /** Part with Euler (x pitch, y yaw, z roll; order YXZ) and a per-axis scale. */
  put(kind: PartKind, p: V3, rot: V3, scale: number | V3, hex?: string): void {
    this._p.set(p[0], p[1], p[2]);
    this._q.setFromEuler(this._e.set(rot[0], rot[1], rot[2], 'YXZ'));
    if (typeof scale === 'number') this._s.setScalar(scale);
    else this._s.set(scale[0], scale[1], scale[2]);
    this._l.compose(this._p, this._q, this._s);
    this.commit(kind, hex);
  }

  /** Part with an explicit quaternion. */
  putQ(kind: PartKind, p: V3, q: THREE.Quaternion, scale: number | V3, hex?: string): void {
    this._p.set(p[0], p[1], p[2]);
    if (typeof scale === 'number') this._s.setScalar(scale);
    else this._s.set(scale[0], scale[1], scale[2]);
    this._l.compose(this._p, q, this._s);
    this.commit(kind, hex);
  }
}

const _up = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _x = new THREE.Vector3();
const _z = new THREE.Vector3();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _bm = new THREE.Matrix4();

/** Thin bar from A to B (the cable part is 1 u tall along +y). */
function cable(w: Writer, a: V3, b: V3, hex?: string): void {
  _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _a.length();
  if (len < 1e-4) return;
  _qa.setFromUnitVectors(_up, _a.divideScalar(len));
  w.putQ(PART.cable, a, _qa, [1, len, 1], hex);
}

const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const frac = (x: number): number => x - Math.floor(x);
/** Deterministic 0..1 per (a, b, salt). */
const rnd = (a: number, b: number, salt: number): number => hashInts(a, b, salt) / 4294967296;

/** Concentric sound ripples at `at`, facing `dir`, travelling `travel` along it as they widen. */
function rings(
  w: Writer,
  at: V3,
  dir: V3,
  c: { rings: number; period: number; r0: number; r1: number; color: string },
  travel: number,
  time: number,
): void {
  _b.set(dir[0], dir[1], dir[2]).normalize();
  _qb.setFromUnitVectors(_up, _b);
  for (let k = 0; k < c.rings; k++) {
    const ph = frac(time / c.period + k / c.rings);
    const r = c.r0 + (c.r1 - c.r0) * ph;
    const tube = Math.max(0.15, 1 - ph);
    w.putQ(
      PART.ring,
      [at[0] + _b.x * travel * ph, at[1] + _b.y * travel * ph, at[2] + _b.z * travel * ph],
      _qb,
      [r, r * tube, r],
      c.color,
    );
  }
}

/** A scene bound to one anchor (a prop instance or a story spot). */
interface Scene {
  theme: ThemeId;
  /** Centre in world space (distance gate). */
  cx: number;
  cy: number;
  cz: number;
  /** Max instances the scene can write. */
  max: number;
  pivot: THREE.Matrix4 | null;
  yaw: number;
  run(w: Writer, c: CultureCtx, s: Scene): void;
  /** Local-frame wind (unit xz) for this anchor's yaw, written by the driver. */
  wl: { x: number; z: number };
}

function pivotOf(s: PropStore, i: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(s.x[i], s.y[i], s.z[i]),
    new THREE.Quaternion().setFromAxisAngle(_up, s.rotY[i]),
    new THREE.Vector3(1, 1, 1).multiplyScalar(s.scale[i] || 1),
  );
}

function sceneAt(
  theme: ThemeId,
  pivot: THREE.Matrix4,
  yaw: number,
  localCentre: V3,
  max: number,
  run: Scene['run'],
): Scene {
  _a.set(...localCentre).applyMatrix4(pivot);
  return { theme, cx: _a.x, cy: _a.y, cz: _a.z, max, pivot, yaw, run, wl: { x: 1, z: 0 } };
}

/* ------------------------------------- scenes ------------------------------------- */

function bellScene(variant: number): Scene['run'] {
  const B = M.bell;
  const at = B.centre[variant % B.centre.length];
  return (w, c) => {
    if (c.fest?.id !== B.ritual) return;
    rings(w, at, [0, 1, 0], B, 0, c.time);
  };
}

function craneScene(variant: number, idx: number): Scene['run'] {
  const C = M.crane;
  const at = C.hang[variant % C.hang.length];
  return (w, c) => {
    const th = C.swing * c.motion * Math.sin((c.time / C.period) * Math.PI * 2 + idx * 1.7);
    const lat = 0.1 * c.motion * Math.sin((c.time / C.period) * Math.PI * 2 * 0.73 + idx);
    const e: V3 = [at[0] + Math.sin(th) * C.rope, at[1] - Math.cos(th) * C.rope, at[2] + lat];
    cable(w, at, e);
    w.put(PART.blob, [e[0], e[1] - C.sack[1] * 0.8, e[2]], [0, 0, 0], C.sack, C.sackColor);
  };
}

function kiteScene(variant: number, idx: number): Scene['run'] {
  const K = M.kites;
  return (w, c, s) => {
    if (c.fest?.id !== K.ritual) return;
    const ph = c.fest.phase;
    const e = ph < K.rise ? smooth(ph / K.rise) : ph > 1 - K.fall ? smooth((1 - ph) / K.fall) : 1;
    if (e <= 0) return;
    const gust = Math.min(1.2, Math.max(0.6, c.wind.s));
    let n = 0;
    for (const j of K.slots) {
      if (variant % 2 === 1 && j === 3) continue;
      const k = n++;
      const ax = K.slotX0 + (j + 0.5) * K.slotDx;
      const A: V3 = [ax, K.anchorY, 0];
      const H = K.height[k % K.height.length] * e * gust;
      const dx = s.wl.x;
      const dz = s.wl.z;
      const sway = K.sway * c.motion * e * Math.sin(c.time * 0.8 + k * 1.9 + idx);
      const bob = K.bob * c.motion * e * Math.sin(c.time * 1.7 + k * 2.3 + idx);
      const T: V3 = [
        ax + dx * H * K.drift - dz * sway,
        K.anchorY + H + bob,
        dz * H * K.drift + dx * sway,
      ];
      cable(w, A, T);
      // kite plane contains the tether, its face leans toward the rack
      _a.set(T[0] - A[0], T[1] - A[1], T[2] - A[2]).normalize();
      const sd = k % 2 ? 1 : -1;
      _z.set(-dx * 0.6 - dz * 0.9 * sd, 0.35, -dz * 0.6 + dx * 0.9 * sd).normalize();
      _x.crossVectors(_a, _z).normalize();
      _z.crossVectors(_x, _a);
      _bm.makeBasis(_x, _a, _z);
      _qa.setFromRotationMatrix(_bm);
      _qb.setFromAxisAngle(_a, 0.14 * c.motion * Math.sin(c.time * 2.1 + k * 1.3));
      _qa.premultiply(_qb);
      const col = K.colors[k % K.colors.length];
      w.putQ(PART.kite, T, _qa, K.size, col);
      // bow tail: a string with three ribbon bows swaying under the kite
      const top: V3 = [T[0], T[1] - 0.55 * K.size, T[2]];
      const ts = Math.sin(c.time * 2 + k) * 0.3 * c.motion;
      const tc = Math.cos(c.time * 1.7 + k) * 0.3 * c.motion;
      const end: V3 = [top[0] + ts, top[1] - K.tail, top[2] + tc];
      cable(w, top, end);
      for (let b = 1; b <= 3; b++) {
        const f = b / 3.2;
        w.put(
          PART.quad,
          [top[0] + ts * f, top[1] - K.tail * f, top[2] + tc * f],
          [0.4, c.time * 2 + b, b % 2 ? 0.6 : -0.6],
          0.3,
          b % 2 ? col : '#FFF4E0',
        );
      }
    }
  };
}

function liftScene(idx: number): Scene['run'] {
  const L = M.lift;
  return (w, c) => {
    const cyc = c.time / L.period + idx * 0.37;
    const n = Math.floor(cyc);
    const t = cyc - n;
    const [xa, xb] = n % 2 === 0 ? L.x : [L.x[1], L.x[0]];
    const rise = smooth((t - L.rise[0]) / (L.rise[1] - L.rise[0]));
    const swing = smooth((t - L.swing[0]) / (L.swing[1] - L.swing[0]));
    const lower = smooth((t - L.lower[0]) / (L.lower[1] - L.lower[0]));
    const cx = xa + (xb - xa) * swing;
    const lift = rise * (1 - lower);
    const y = L.ground + (L.top - L.ground) * lift;
    // the load rocks while it travels, calmer at rest
    const rock = c.motion * 0.05 * Math.sin(c.time * 1.6 + n) * lift;
    const [cl, ch, cw] = L.size;
    const yaw = 0.18 * (swing - 0.5) * c.motion;
    w.put(
      PART.box,
      [cx, y + ch / 2, L.z],
      [0, yaw, rock],
      [cl, ch, cw],
      L.colors[(n + idx) % L.colors.length],
    );
    const topY = y + ch;
    for (const s of [-1, 1]) cable(w, [s * L.beamX, L.cableTop, L.z], [cx + s * L.lugX, topY, L.z]);
    if (c.fest?.id === M.horn.lampRitual)
      w.put(
        PART.beacon,
        [cx, topY + 0.18, L.z],
        [0, 0, 0],
        0.22 + 0.06 * Math.sin(c.time * 6),
        L.lamp,
      );
  };
}

function hornScene(): Scene['run'] {
  const H = M.horn;
  return (w, c) => {
    if (!c.fest || !H.rituals.includes(c.fest.id)) return;
    for (const m of H.mouths) rings(w, m.at, m.dir, H, H.travel, c.time);
  };
}

function confettiScene(idx: number): Scene['run'] {
  const C = M.confetti;
  return (w, c) => {
    if (c.fest?.id !== C.ritual) return;
    const age = c.fest.phase * C.showSeconds;
    if (age >= C.life) return;
    const e = 1 - Math.exp(-age / C.tau);
    for (let i = 0; i < C.pieces; i++) {
      const u1 = rnd(i, idx, 11);
      const u2 = rnd(i, idx, 12);
      const u3 = rnd(i, idx, 13);
      const sp = C.speed[0] + (C.speed[1] - C.speed[0]) * u1;
      const vx = C.dir[0] * sp + (u2 - 0.5) * 2 * C.spread * sp;
      const vy = C.dir[1] * sp;
      const vz = C.dir[2] * sp + (u3 - 0.5) * 2 * C.spread * sp;
      const fall = C.fall * (0.7 + 0.6 * u2);
      const flutter = 0.16 * c.motion * Math.sin(c.time * 4 + i * 1.7);
      const x = C.muzzle[0] + vx * C.tau * e + flutter;
      const z = C.muzzle[2] + vz * C.tau * e - flutter;
      const y = Math.max(0.03, C.muzzle[1] + (vy + fall) * C.tau * e - fall * age);
      const settle = y <= 0.031 ? 0.6 : 1;
      const fade = Math.min(1, (C.life - age) / 0.8);
      if (fade <= 0) continue;
      w.put(
        PART.quad,
        [x, y, z],
        settle < 1 ? [-Math.PI / 2, u1 * 6, 0] : [c.time * 4.3 + u2 * 6, c.time * 3 + u1 * 6, 0],
        C.size * fade,
        C.colors[i % C.colors.length],
      );
    }
  };
}

function flagScene(): Scene['run'] {
  const F = M.flag;
  return (w, c) => {
    if (c.fest?.id !== F.ritual) return;
    const ph = c.fest.phase;
    const up = ph < F.climb ? smooth(ph / F.climb) : ph > 0.88 ? smooth((1 - ph) / 0.12) : 1;
    const y = F.pole[1] + (F.topY - F.pole[1]) * up;
    const wob = c.motion * (0.22 * Math.sin(c.time * 3.1) + 0.08 * Math.sin(c.time * 7.3));
    w.put(PART.flag, [0.05, y, 0], [0, wob, 0.04 * wob], F.size, F.color);
  };
}

function antScene(): Scene['run'] {
  const A = M.ants;
  const pts = A.path;
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  return (w, c) => {
    for (let k = 0; k < A.count; k++) {
      const s = frac(k / A.count + (c.time * A.speed) / total) * total;
      let j = 1;
      while (j < cum.length - 1 && cum[j] < s) j++;
      const f = (s - cum[j - 1]) / (cum[j] - cum[j - 1]);
      const tx = pts[j][0] - pts[j - 1][0];
      const tz = pts[j][1] - pts[j - 1][1];
      const l = Math.hypot(tx, tz);
      const wig = 0.035 * Math.sin(s * 9 + k * 2) * c.motion;
      const x = pts[j - 1][0] + tx * f - (tz / l) * wig;
      const z = pts[j - 1][1] + tz * f + (tx / l) * wig;
      w.put(
        PART.ant,
        [x, A.lift + 0.006 * Math.sin(c.time * 14 + k), z],
        [0, Math.atan2(-tz, tx), 0],
        A.size,
        A.color,
      );
    }
  };
}

function balloonScene(): Scene['run'] {
  const B = M.balloon;
  return (w, c, s) => {
    if (c.fest?.id !== B.ritual) return;
    const ph = c.fest.phase;
    const e = ph ** 1.6;
    const sc = 1 - smooth((ph - 0.9) / 0.1);
    if (sc <= 0) return;
    const sw = B.wobble * c.motion * Math.sin(c.time * 1.3);
    const p: V3 = [
      B.from[0] + s.wl.x * B.drift * e + sw * 0.4,
      B.from[1] + B.rise * e,
      B.from[2] + s.wl.z * B.drift * e + sw * 0.3,
    ];
    const r = B.radius;
    w.put(PART.blob, p, [0, 0, 0], [r[0] * sc, r[1] * sc, r[2] * sc], B.color);
    const bot: V3 = [p[0], p[1] - r[1] * sc, p[2]];
    const end: V3 = [bot[0] - sw * 0.2, bot[1] - B.string * sc, bot[2]];
    cable(w, bot, end);
    w.put(
      PART.box,
      [end[0], end[1] - 0.08 * sc, end[2]],
      [sw, 0, 0],
      [0.2 * sc, 0.16 * sc, 0.16 * sc],
      B.payload,
    );
  };
}

/** World-frame scene: three sun-slid light patches below a prism. */
function patchScene(
  world: WorldData,
  x: number,
  y: number,
  z: number,
  scale: number,
  variant: number,
): Scene['run'] {
  const P = M.patches;
  const white = new THREE.Color(1, 1, 1);
  const fam = P.families[variant % P.families.length].map(
    (h) => `#${new THREE.Color(h).lerp(white, P.lighten).getHexString()}`,
  );
  return (w, c) => {
    const sun = c.sun;
    const elev = Math.asin(Math.min(1, Math.max(-1, sun.y)));
    if (elev < P.minElev || c.night > 0.6) return;
    const hz = Math.hypot(sun.x, sun.z) || 1;
    const dx = -sun.x / hz;
    const dz = -sun.z / hz;
    const reach = (P.top * scale) / Math.tan(Math.max(elev, 0.2));
    const gx = x + dx * reach;
    const gz = z + dz * reach;
    const stretch = Math.min(P.maxStretch, P.base / Math.sin(Math.max(elev, 0.2))) * scale * 2.2;
    const pulse = 1 + P.pulse * c.motion * Math.sin((c.time / P.pulsePeriod) * Math.PI * 2);
    const gy = Math.max(y, heightAt(world.height, gx, gz)) + 0.12;
    const yaw = Math.atan2(-dz, dx);
    for (let k = 0; k < 3; k++) {
      const off = (k - 1) * P.width * scale * 1.5;
      w.put(
        PART.patch,
        [gx - dz * off, gy, gz + dx * off],
        [0, yaw, 0],
        [stretch * pulse, 1, P.width * scale * pulse],
        fam[k % fam.length],
      );
    }
  };
}

/* ------------------------------------ the view ------------------------------------ */

export interface CultureMoversView {
  /** Add to the world group: the part mesh and the night searchlight beams. */
  group: THREE.Group;
  /** The one part mesh (null when the world has no culture scene). */
  mesh: THREE.InstancedMesh | null;
  update(
    time: number,
    hour: number,
    env: EnvState,
    camPos: THREE.Vector3,
    culture?: Pick<CultureState, 'festival'>,
  ): void;
  /** Instances written last frame, scenes in range, visible beams. */
  stats(): { instances: number; scenes: number; beams: number };
  readonly sceneCount: number;
}

interface Beam {
  mesh: THREE.Mesh;
}

export function createCultureMovers(
  store: PropStore,
  world: WorldData,
  scope: Scope,
): CultureMoversView {
  const group = new THREE.Group();
  group.name = 'culture-movers';
  const scenes: Scene[] = [];
  const defOf = (id: string): number => PROP_DEF_INDEX[id] ?? -1;
  const D = {
    bell: defOf('bellPost'),
    crane: defOf('harbourCrane'),
    rack: defOf('kiteRack'),
    yard: defOf('containerYard'),
    horn: defOf('signalHorn'),
    cannon: defOf('confettiCannon'),
    lights: defOf('searchlightPair'),
    flag: defOf('flagMast'),
    prism: defOf('prismSculpture'),
    cart: defOf('weatherBalloonCart'),
  };
  const beams: Beam[] = [];
  const beamAnchors: { x: number; y: number; z: number }[] = [];
  let beamMat: THREE.ShaderMaterial | null = null;
  let beamGeo: THREE.BufferGeometry | null = null;
  const ids = new Map<number, number>();
  for (let i = 0; i < store.count; i++) {
    const d = store.defId[i];
    if (d < 0 || (store.flags[i] & PropFlag.removed) !== 0) continue;
    const idx = ids.get(d) ?? 0;
    ids.set(d, idx + 1);
    const v = store.variant[i];
    const th: ThemeId = world.islands[store.islandId[i]]?.theme ?? 'hq';
    const pv = (): THREE.Matrix4 => pivotOf(store, i);
    if (d === D.bell)
      scenes.push(
        sceneAt(th, pv(), store.rotY[i], M.bell.centre[v % 2], 3 * M.bell.rings, bellScene(v)),
      );
    else if (d === D.crane)
      scenes.push(sceneAt(th, pv(), store.rotY[i], M.crane.hang[v % 2], 2, craneScene(v, idx)));
    else if (d === D.rack)
      scenes.push(
        sceneAt(th, pv(), store.rotY[i], [0, 2, 0], M.kites.slots.length * 6, kiteScene(v, idx)),
      );
    else if (d === D.yard) {
      scenes.push(sceneAt(th, pv(), store.rotY[i], [0, 4, M.lift.z], 4, liftScene(idx)));
    } else if (d === D.horn)
      scenes.push(
        sceneAt(
          th,
          pv(),
          store.rotY[i],
          [0, 1.5, 0.5],
          M.horn.mouths.length * M.horn.rings,
          hornScene(),
        ),
      );
    else if (d === D.cannon)
      scenes.push(
        sceneAt(th, pv(), store.rotY[i], [0, 2, 1], M.confetti.pieces, confettiScene(idx)),
      );
    else if (d === D.flag)
      scenes.push(sceneAt(th, pv(), store.rotY[i], [0, 1.2, 0], 1, flagScene()));
    else if (d === D.cart)
      scenes.push(sceneAt(th, pv(), store.rotY[i], [0, 2, 0], 3, balloonScene()));
    else if (d === D.prism) {
      const s = store.scale[i] || 1;
      const sc = sceneAt(
        th,
        pv(),
        0,
        [0, 1, 0],
        3,
        patchScene(world, store.x[i], store.y[i], store.z[i], s, v),
      );
      sc.pivot = null; // world-frame parts
      scenes.push(sc);
    } else if (d === D.lights) {
      // two projectors, each a lens-origin beam sweeping at night
      const B = M.beams;
      const lean = B.lean[v % B.lean.length];
      const m = pv();
      beamAnchors.push({ x: store.x[i], y: store.y[i], z: store.z[i] });
      for (const side of [-1, 1] as const) {
        beamGeo ??= scope.add(buildBeamGeometry());
        beamMat ??= scope.add(
          createSkyProgramMaterial('beam', {
            flareRadius: BEAM.flareRadius * B.scale * B.flare,
            flarePull: BEAM.flarePull * B.scale,
            dip: B.dip,
          }),
        );
        const mesh = new THREE.Mesh(beamGeo, beamMat);
        mesh.name = 'searchlight-beam';
        const lens = new THREE.Vector3(
          side * (B.pivot[0] + B.lensAt * Math.sin(lean)),
          B.pivot[1] + B.lensAt * Math.cos(lean),
          0,
        ).applyMatrix4(m);
        mesh.position.copy(lens);
        const k = side < 0 ? 0 : 1;
        mesh.quaternion
          .setFromAxisAngle(_up, store.rotY[i] + B.yaw[k])
          .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), B.tilt[k]));
        mesh.scale.setScalar(B.scale * (store.scale[i] || 1));
        mesh.renderOrder = 20;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.visible = false;
        group.add(mesh);
        beams.push({ mesh });
      }
    }
  }
  // QA ant trails: story spots of kind antTrail (story-spot frame)
  for (const sp of world.storySpots) {
    if (sp.kind !== 'antTrail') continue;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(sp.pos.x, sp.pos.y, sp.pos.z),
      new THREE.Quaternion().setFromAxisAngle(_up, sp.rotY),
      new THREE.Vector3(1, 1, 1),
    );
    scenes.push(
      sceneAt(
        world.islands[sp.islandId]?.theme ?? 'coding',
        m,
        sp.rotY,
        [0, 0, 0],
        M.ants.count,
        antScene(),
      ),
    );
  }
  // research balloon carts get the 06:00 launch only (their static balloon stays tethered)

  let mesh: THREE.InstancedMesh | null = null;
  let writer: Writer | null = null;
  const capacity = scenes.reduce((a, s) => a + s.max, 0);
  if (capacity > 0) {
    const geo = scope.add(buildPartsGeometry());
    const gait = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    gait.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aGait', gait);
    const mat = scope.add(makeLifeMaterial('culture-movers', false));
    mesh = new THREE.InstancedMesh(geo, mat, capacity);
    mesh.name = 'culture-movers';
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // allocate instanceColor up front: a later allocation would change the program parameters
    for (let i = 0; i < capacity; i++) mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    mesh.visible = false;
    scope.add(mesh);
    group.add(mesh);
    writer = new Writer(mesh, gait);
  }

  let lastInstances = 0;
  let lastScenes = 0;
  let lastBeams = 0;
  const range2 = M.range * M.range;
  const ctx: CultureCtx = {
    time: 0,
    hour: 0,
    sun: { x: 0, y: 1, z: 0 },
    night: 0,
    wind: { x: 1, z: 0, s: 1 },
    motion: 1,
    fest: null,
  };
  const update = (
    time: number,
    hour: number,
    env: EnvState,
    camPos: THREE.Vector3,
    culture?: Pick<CultureState, 'festival'>,
  ): void => {
    ctx.time = time;
    ctx.hour = hour;
    ctx.sun = env.sunSkyDir;
    ctx.night = env.night;
    const wv = SHARED.uWind.value;
    const wl = Math.hypot(wv.x, wv.y) || 1;
    ctx.wind.x = wv.x / wl;
    ctx.wind.z = wv.y / wl;
    ctx.wind.s = wv.z;
    ctx.motion = SHARED.uMotionScale.value;
    let nScenes = 0;
    if (writer && mesh) {
      writer.n = 0;
      for (const s of scenes) {
        const dx = s.cx - camPos.x;
        const dy = s.cy - camPos.y;
        const dz = s.cz - camPos.z;
        if (dx * dx + dy * dy + dz * dz > range2) continue;
        // wind in the anchor's frame (rotation by -yaw)
        const cs = Math.cos(s.yaw);
        const sn = Math.sin(s.yaw);
        s.wl.x = ctx.wind.x * cs - ctx.wind.z * sn;
        s.wl.z = ctx.wind.x * sn + ctx.wind.z * cs;
        writer.pivot = s.pivot;
        ctx.fest = culture?.festival[s.theme] ?? null;
        const before = writer.n;
        s.run(writer, ctx, s);
        if (writer.n > before) nScenes++;
      }
      mesh.count = writer.n;
      mesh.visible = writer.n > 0;
      if (writer.n > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor!.needsUpdate = true;
        mesh.geometry.getAttribute('aGait').needsUpdate = true;
      }
      lastInstances = writer.n;
    }
    lastScenes = nScenes;
    // night searchlights: lighthouse beam visibility ramp x show hours x range
    const lit = SHARED.uLamps.value.z > 0.001 && hour >= M.beams.on && hour < M.beams.off;
    let nb = 0;
    for (let i = 0; i < beams.length; i++) {
      const a = beamAnchors[i >> 1];
      const dx = a.x - camPos.x;
      const dy = a.y - camPos.y;
      const dz = a.z - camPos.z;
      const on = lit && dx * dx + dy * dy + dz * dz < range2;
      beams[i].mesh.visible = on;
      if (on) nb++;
    }
    lastBeams = nb;
  };
  return {
    group,
    mesh,
    update,
    stats: () => ({ instances: lastInstances, scenes: lastScenes, beams: lastBeams }),
    sceneCount: scenes.length + beamAnchors.length,
  };
}
