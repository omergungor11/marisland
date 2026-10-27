import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import { hashInts } from '../core/hash.ts';
import { BEAM } from '../content/lighting.ts';
import { PROP_DEF_INDEX } from '../content/props.ts';
import { CULTURES } from '../content/cultures/index.ts';
import { CULTURE_MOVERS as M } from '../content/cultures/movers.ts';
import { RELAY } from '../content/cultures/rhythm.ts';
import { SIGNAL_CHAIN } from '../content/signature.ts';
import { THEMES } from '../content/themes.ts';
import { SEMAPHORE, mailCablePoint, type Vec3Like } from '../content/props-themes/m20.ts';
import { mailLinePairs } from './mail-lines.ts';
import { relayBoost, type CultureFestival, type CultureState } from './culture-clock.ts';
import type { EnvState } from '../env/env-state.ts';
import { makeLifeMaterial } from '../life/life-material.ts';
import { PropFlag, type PropStore } from '../world/prop-store.ts';
import { THEME_IDS, heightAt, type ThemeId, type WorldData } from '../world/types.ts';
import { buildBeamGeometry } from './night/beam.ts';
import { createSkyProgramMaterial } from './sky/sky.ts';
import { SHARED } from './uniforms.ts';
import { PART, buildPartGeometries, type PartKind } from './culture-mover-parts.ts';
import { DEVOPS_M22 } from '../content/props-themes/devops.ts';
import { RESEARCH_M22 } from '../content/props-themes/research.ts';
import { lotYaw } from '../world/lot-frame.ts';
import { DEVOPS_MOVERS } from '../content/themes/devops.ts';
import { DOCK } from '../content/settlements.ts';
import { pierLoop, shipPose } from './harbour-routes.ts';
import type { PlacedPuffs } from './particles/puffs.ts';
import { QA_PROVING, QA_PROVING_MOTION } from '../content/themes/qa-proving.ts';
import { QA_FACTORY, QA_MOVERS } from '../content/themes/qa.ts';
import { cartFrame, newCartFrame } from '../geo/themes/qa-track.ts';
import { crashPath, dummyPose, landingSquash, type DummyPose } from '../geo/themes/qa-crash.ts';
import { dropState, type DropState } from './qa-proving-motion.ts';
import { portLayout, type PortLayout } from '../world/gen/customs-port.ts';
import { ITEM, MAX_ITEMS, customsFrame, newCustomsFrame } from './qa-customs-motion.ts';

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
  /** Culture-clock day seconds (the relay clock; = hour x secondsPerHour when none is given). */
  day: number;
  /** Camera position, world xz (stall keepers turn and wave toward it). */
  cam: { x: number; z: number };
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
  /** Soft steam puffs placed this frame into `puffs` (TASK-486; null = not bound, none drawn). */
  pn = 0;
  puffs: PlacedPuffs | null = null;
  private readonly _ps = new THREE.Vector3();
  /** Instances written this frame per kind (index = `PartKind`). */
  readonly counts: Int32Array;
  constructor(
    /** One instanced mesh per part kind (TASK-495), each `capacity` slots. */
    readonly meshes: readonly THREE.InstancedMesh[],
    private readonly capacity: number,
  ) {
    this.counts = new Int32Array(meshes.length);
  }

  reset(): void {
    this.n = 0;
    this.pn = 0;
    this.counts.fill(0);
  }

  private colour(hex: string | undefined): THREE.Color {
    if (!hex) return this._c.setRGB(1, 1, 1);
    let c = this.colours.get(hex);
    if (!c) this.colours.set(hex, (c = new THREE.Color(hex)));
    return c;
  }

  private commit(kind: PartKind, hex: string | undefined): void {
    if (this.n >= this.capacity) return;
    const m = this.pivot ? this._m.multiplyMatrices(this.pivot, this._l) : this._l;
    const mesh = this.meshes[kind];
    const i = this.counts[kind]++;
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, this.colour(hex));
    mesh.geometry.getAttribute('aGait').setXYZ(i, 0, kind, 0);
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

  /** Soft steam puff (puff program, TASK-486): local centre, diameter (u), opacity, alpha edge. */
  puff(p: V3, size: number, opacity: number, edge: number): void {
    if (!this.puffs || this.pn >= this.puffs.count) return;
    this._p.set(p[0], p[1], p[2]);
    let sc = 1;
    if (this.pivot) {
      this._p.applyMatrix4(this.pivot);
      sc = this._ps.setFromMatrixScale(this.pivot).x;
    }
    this.puffs.set(this.pn++, this._p.x, this._p.y, this._p.z, size * sc, opacity, edge);
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

/** The customs port scene draws within this distance of its turn-around spot (u). */
const QA_CUSTOMS_RANGE = 90;

const SPH = M.secondsPerHour;
const DAY = 24 * SPH;
/** Seconds since the Launch Day Relay started (0 .. DAY) at culture-clock day seconds `day`. */
const _flash = { e: 0, p: -1, front: 0 };
const relayT = (day: number): number => (((day - RELAY.hour * SPH) % DAY) + DAY) % DAY;
const easeOutBack = (x: number): number => {
  const t = Math.min(1, Math.max(0, x)) - 1;
  return 1 + 2.70158 * t * t * t + 1.70158 * t * t;
};

/**
 * Remaining share (1 -> 0) of an underdamped step response `u` s after the step (zero initial
 * velocity): `pose = target + (previous - target) * springLeft(u)`. Closed form, so a frozen
 * capture lands on the exact pose. `zeta` is clamped below 1.
 */
function springLeft(u: number, omega: number, zeta: number): number {
  if (u <= 0) return 1;
  const z = Math.min(0.995, zeta);
  const wd = omega * Math.sqrt(1 - z * z);
  return Math.exp(-z * omega * u) * (Math.cos(wd * u) + ((z * omega) / wd) * Math.sin(wd * u));
}

/** Relay order 1..7 -> the island's theme (the culture whose turn it is). */
const THEME_OF_ORDER: ThemeId[] = [...THEME_IDS].sort(
  (a, b) => CULTURES[a].relay.order - CULTURES[b].relay.order,
);

/** `hex` mixed toward white by `k` (0..1), as a #rrggbb string. */
function lightened(hex: string, k: number): string {
  return `#${new THREE.Color(hex).lerp(new THREE.Color(1, 1, 1), k).getHexString()}`;
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
  /** Max soft puffs the scene can place (TASK-486). */
  puffs?: number;
  pivot: THREE.Matrix4 | null;
  yaw: number;
  run(w: Writer, c: CultureCtx, s: Scene): void;
  /** Own distance gate (squared, u²) instead of the movers' range (the signal chain). */
  range2?: number;
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
  puffs = 0,
): Scene {
  _a.set(...localCentre).applyMatrix4(pivot);
  return { theme, cx: _a.x, cy: _a.y, cz: _a.z, max, puffs, pivot, yaw, run, wl: { x: 1, z: 0 } };
}

/* ------------------------------------- scenes ------------------------------------- */

/**
 * QA drop tower (M24 TASK-501, variant 1 = the empty cradle): the crate rides up the guide rails,
 * hangs, falls and squashes on the pad with a dust ring, and the foot check lamp glows for a few
 * seconds. Tower-local frame; closed-form in the sim time (QA_PROVING_MOTION.drop).
 */
function dropTowerScene(): Scene['run'] {
  const DR = QA_PROVING_MOTION.drop;
  const T = QA_PROVING.tower;
  const st: DropState = { y: 0, squash: 0, since: -1, lamp: 0 };
  const lens: V3 = [T.footLamp.x, T.footLamp.h + 0.1 + T.footLamp.r, T.footLamp.z];
  return (w, c) => {
    dropState(c.time, c.motion, st);
    const sq = st.squash;
    // the foot stays on the pad: the squeezed crate's centre sinks by half the lost height
    const y = st.y - (T.crate.size / 2) * sq;
    w.put(PART.crate, [0, y, 0], [0, 0, 0], [1 + sq * 0.5, 1 - sq, 1 + sq * 0.5], T.crate.wood);
    if (st.since >= 0 && st.since < DR.dust.life) {
      const ph0 = st.since / DR.dust.life;
      for (let k = 0; k < DR.dust.rings; k++) {
        const ph = ph0 - k * 0.18;
        if (ph < 0) continue;
        const r = DR.dust.r0 + (DR.dust.r1 - DR.dust.r0) * ph;
        const tube = Math.max(0.15, 1 - ph);
        const at: V3 = [0, T.crate.rest - T.crate.size / 2 + 0.12, 0];
        w.put(PART.ring, at, [0, 0, 0], [r, r * tube, r], DR.dust.color);
      }
    }
    if (st.lamp > 0.01) {
      const k = DR.lampScale[0] + (DR.lampScale[1] - DR.lampScale[0]) * st.lamp;
      w.put(PART.glow, lens, [0, 0, 0], T.footLamp.r * k, DR.lampColor);
    }
  };
}

/**
 * QA figure-8 crash track (M24 TASK-501, testTrack variant 1): the crash dummy riding the test cart
 * (render/movers.ts poses the cart from the same centreline). Leans out in the turns, back on the
 * ramp, springs and hops on the landing. Track-local frame.
 */
function crashDummyScene(): Scene['run'] {
  const path = crashPath();
  const CM = QA_PROVING_MOTION;
  const cs = QA_MOVERS.cartScale;
  const fr = newCartFrame();
  const pose: DummyPose = { roll: 0, pitch: 0, hop: 0 };
  const basis = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const ql = new THREE.Quaternion();
  const eu = new THREE.Euler();
  const pos = new THREE.Vector3();
  const railY = QA_FACTORY.track.railY + QA_FACTORY.track.rail;
  return (w, c) => {
    cartFrame(path, c.time, fr);
    dummyPose(path, c.time, c.motion, pose);
    const d = landingSquash(path, c.time, c.motion);
    pos
      .set(fr.p[0], fr.p[1], fr.p[2])
      .addScaledVector(
        _a.set(fr.y[0], fr.y[1], fr.y[2]),
        railY + (CM.dummy.seatY * (1 - d) + pose.hop) * cs,
      );
    basis.makeBasis(
      _a.set(fr.x[0], fr.x[1], fr.x[2]),
      _b.set(fr.y[0], fr.y[1], fr.y[2]),
      _x.set(fr.z[0], fr.z[1], fr.z[2]),
    );
    q.setFromRotationMatrix(basis).multiply(
      ql.setFromEuler(eu.set(pose.pitch, 0, pose.roll, 'XYZ')),
    );
    const sc: V3 = [cs * (1 + d * 0.5), cs * (1 - d), cs * (1 + d * 0.5)];
    w.putQ(PART.dummy, [pos.x, pos.y, pos.z], q, sc, CM.dummy.color);
  };
}

/**
 * QA Customs Port (M30 TASK-508, customsYard variant 1 = the empty crane rig): the cargo ship's visit,
 * the crane unloading three containers, the inspection line's verdicts and the rejected crates lobbed
 * onto the quarantine pontoon. Crane-local frame; every pose a function of the culture-clock day
 * seconds (render/qa-customs-motion.ts). Parts: ship, cargo, trolley, spreader (own kinds, drawn only
 * while a port is in range), cable / glow / ring / blob (shared).
 */
function customsPortScene(lay: PortLayout, waterY: number): Scene['run'] {
  const fr = newCustomsFrame();
  return (w, c) => {
    customsFrame(c.day, c.motion, lay, waterY, fr);
    for (let i = 0; i < fr.n; i++) {
      const it = fr.items[i];
      const at: V3 = [it.x, it.y, it.z];
      const sc: V3 = [it.sx, it.sy, it.sz];
      switch (it.kind) {
        case ITEM.ship:
          w.put(PART.ship, at, [0, it.yaw, 0], sc);
          break;
        case ITEM.cargo:
          w.put(PART.cargo, at, [0, it.yaw, 0], sc, it.hex);
          break;
        case ITEM.trolley:
          w.put(PART.trolley, at, [0, it.yaw, 0], sc);
          break;
        case ITEM.spreader:
          w.put(PART.spreader, at, [0, it.yaw, 0], sc);
          break;
        case ITEM.cable:
          cable(w, at, [it.x1, it.y1, it.z1], it.hex);
          break;
        case ITEM.glow:
          w.put(PART.glow, at, [0, it.yaw, 0], sc, it.hex);
          break;
        case ITEM.ring:
          w.put(PART.ring, at, [0, it.yaw, 0], sc, it.hex);
          break;
        default:
          w.put(PART.blob, at, [0, it.yaw, 0], sc, it.hex);
      }
    }
  };
}

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

/** DevOps watch tower (M22 D5): the uptime bell rings at the shift siren and Release Night. */
function watchScene(): Scene['run'] {
  const W = M.watch;
  const at: V3 = [0, DEVOPS_M22.tower.bellY, 0];
  return (w, c) => {
    if (!c.fest || !W.rituals.includes(c.fest.id)) return;
    rings(w, at, [0, 1, 0], W, 0, c.time);
  };
}

/**
 * DevOps Deploy Night (M22 D16): during Release Night every cargo ship (render/movers.ts, the same
 * closed-form loop pose) sounds its horn and flashes its masthead light. World-frame scene: the
 * ship's own frame is set on the writer each frame.
 */
function deployScene(L: NonNullable<ReturnType<typeof pierLoop>>, k: number): Scene['run'] {
  const D = M.deploy;
  const m = new THREE.Matrix4();
  return (w, c) => {
    if (c.fest?.id !== D.ritual) return;
    const p = shipPose(L, c.time, k, DEVOPS_MOVERS.ship.perDock);
    _x.set(p.hz, 0, -p.hx);
    _z.set(p.hx, 0, p.hz);
    m.makeBasis(_x, _up, _z).setPosition(p.x, 0, p.z);
    w.pivot = m;
    rings(w, D.horn.at, D.horn.dir, D, D.travel, c.time);
    const f = 0.5 + 0.5 * Math.cos(c.time * D.lamp.rate * Math.PI * 2);
    w.put(
      PART.beacon,
      D.lamp.at,
      [0, 0, 0],
      D.lamp.r[0] + (D.lamp.r[1] - D.lamp.r[0]) * f * f,
      D.lamp.color,
    );
  };
}

/**
 * Research bell hour (M22 R17): the two belfry bells of the bell-cupola tower swing at the 09:00
 * bell ritual (6 x 0.8 s, +-25 deg, in antiphase) with sound rings over the belfry; otherwise they
 * hang with a hair of sway. Tower-local frame (hinges RESEARCH_M22.bells).
 */
function campusBellScene(): Scene['run'] {
  const B = M.campusBell;
  const R = RESEARCH_M22.bells;
  const amp = (B.deg * Math.PI) / 180;
  const span = B.swings * B.swing;
  return (w, c) => {
    const ringing = c.fest?.id === B.ritual;
    const t = ringing && c.fest ? c.fest.phase * B.seconds : -1;
    R.z.forEach((z, k) => {
      let th = B.rest * c.motion * Math.sin(c.time * 0.9 + k * 2.1);
      if (t >= 0 && t < span) {
        const env = smooth(t / 0.3) * smooth((span - t) / 0.5);
        th = amp * env * Math.sin((t / B.swing) * Math.PI * 2) * (k === 0 ? 1 : -1);
      }
      w.put(PART.bell, [0, R.hingeY, z], [th, 0, 0], [R.radius, R.height, R.radius]);
    });
    if (t >= 0 && t < span + 1) rings(w, [0, R.hingeY - 0.3, 0], [0, 1, 0], B, 0, c.time);
  };
}

/**
 * Research test firing (M22 R13): steam rolls out both ways along the launch trench under the
 * gantry rocket while the `testFiring` ritual runs (4 s), with a flickering flame glow under the
 * nozzle. Rocket-local frame (steam origin RESEARCH_M22.gantry.steamAt, trench along local z).
 * The steam is soft puffs of the puff program (TASK-486: lit blobs read as one faceted boulder):
 * many small see-through puffs that overlap, swell, rise, drift apart and thin away.
 */
function launchScene(idx: number): Scene['run'] {
  const L = M.launch;
  const at = RESEARCH_M22.gantry.steamAt;
  return (w, c) => {
    if (c.fest?.id !== L.ritual) return;
    const t = c.fest.phase * L.seconds;
    // the whole cloud thins out over the ritual's last `endFade` s (no pop when it ends)
    const end = smooth((L.seconds - t) / L.endFade);
    for (let k = 0; k < L.puffs; k++)
      for (const side of [-1, 1] as const) {
        const n = k * 2 + (side > 0 ? 1 : 0);
        const j = rnd(idx, n, 41);
        const j2 = rnd(idx, n, 42);
        const u = (t - k * L.gap - j2 * L.gap) / L.life;
        if (u <= 0 || u >= 1) continue;
        // out along the trench fast, then up and apart as it slows (ease-out), swelling as it goes
        const out = 1 - (1 - u) * (1 - u);
        const size = L.size[0] + (L.size[1] - L.size[0]) * Math.sqrt(u) * (0.7 + 0.6 * j);
        const op =
          L.opacity * smooth(u / L.fadeIn) * Math.pow(1 - u, L.thin) * (0.75 + 0.5 * j2) * end;
        w.puff(
          [
            at[0] + (j - 0.5) * 2 * L.spread * (0.3 + out),
            at[1] + L.rise * Math.pow(u, 1.4) * (0.5 + j2) + size * 0.25,
            at[2] + side * (L.reach[0] + (L.reach[1] - L.reach[0]) * out) * (0.7 + 0.5 * j),
          ],
          size,
          op,
          L.edge,
        );
      }
    if (t < L.flame) {
      const f = 0.5 + 0.5 * Math.sin(c.time * L.glow.rate + idx);
      const r = L.glow.r[0] + (L.glow.r[1] - L.glow.r[0]) * f * smooth((L.flame - t) / 0.5);
      w.put(PART.glow, L.glow.at, [0, 0, 0], r, L.glow.color);
    }
  };
}

/**
 * Research cap toss (M22 R16): six mortarboards fly up from the lecture class on parabolas at the
 * 17:45 ritual, tumble, land on the lawn and shrink away at the end. Lecture-spot frame.
 */
function capTossScene(): Scene['run'] {
  const C = M.capToss;
  return (w, c) => {
    if (c.fest?.id !== C.ritual) return;
    const t = c.fest.phase * C.seconds;
    C.spots.forEach(([x, z], k) => {
      const t0 = C.launch[0] + (C.launch[1] - C.launch[0]) * rnd(k, 1, 53);
      const T = C.flight[0] + (C.flight[1] - C.flight[0]) * rnd(k, 2, 53);
      const peak = C.peak[0] + (C.peak[1] - C.peak[0]) * rnd(k, 3, 53);
      const u = (t - t0) / T;
      if (u < 0) return;
      const dx = (rnd(k, 4, 53) - 0.5) * 2 * C.drift;
      const dz = (rnd(k, 5, 53) - 0.5) * 2 * C.drift;
      const fade = smooth((C.seconds - t) / C.fade);
      const size = C.size * fade;
      if (u >= 1) {
        // landed: flat on the lawn, a last bit of the tumble frozen in its yaw
        w.put(PART.cap, [x + dx, 0.06, z + dz], [0, rnd(k, 6, 53) * 6.28, 0], size, C.color);
        return;
      }
      const y = C.head * (1 - u) + 4 * peak * u * (1 - u);
      const a = C.spin * (t - t0);
      w.put(PART.cap, [x + dx * u, y, z + dz * u], [a * 0.6, a + k, a * 0.8], size, C.color);
    });
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

/**
 * World-frame scene (TASK-466, D-060): at the two `mailHour` bursts the sacks leave the high
 * pylon one after another and slide down the cable (the pylons' parabola, `mailCablePoint`) into
 * the catch basket; a short hanger swings under each.
 */
function mailScene(a: Vec3Like, b: Vec3Like): Scene['run'] {
  const Mm = M.mail;
  return (w, c) => {
    if (c.fest?.id !== Mm.ritual) return;
    const ph = c.fest.phase;
    for (let k = 0; k < Mm.sacks; k++) {
      const t = (ph - k * Mm.gap) / Mm.travel;
      if (t <= 0 || t >= 1) continue;
      // ease in (gravity takes the sack), ease out into the basket
      const p = mailCablePoint(a, b, smooth(t));
      const sw = Mm.swing * c.motion * Math.sin(c.time * 3.1 + k * 1.3);
      const top: V3 = [p.x, p.y - 0.04, p.z];
      const bot: V3 = [p.x + sw, p.y - Mm.hanger, p.z + sw * 0.5];
      cable(w, top, bot);
      w.put(
        PART.blob,
        [bot[0], bot[1] - Mm.sack[1] * 0.6, bot[2]],
        [0, 0, sw],
        Mm.sack,
        Mm.colors[k % Mm.colors.length],
      );
    }
  };
}

/**
 * HQ semaphore (TASK-469): the arms hold the V rest pose with a slow idle sway; at 21:00 each relay
 * step throws them into that island's pose (underdamped spring, overshoots then settles) while the
 * lamp flashes in the island's accent; after the relay they spring back to rest.
 */
function semaphoreScene(idx: number): Scene['run'] {
  const S = M.semaphore;
  const rest = SEMAPHORE.restDeg;
  const accents = THEME_OF_ORDER.map((t) => THEMES[t].accent);
  return (w, c) => {
    const t = relayT(c.day);
    const zeta = 1 - (1 - S.zeta) * c.motion;
    const ang: [number, number] = [rest[0], rest[1]];
    let lamp: number;
    let colour: string;
    let calm = 1;
    if (t < RELAY.lengthS) {
      const k = Math.min(S.poses.length - 1, Math.floor(t / RELAY.stepS));
      const u = t - k * RELAY.stepS;
      const f = springLeft(u, S.omega, zeta);
      for (let a = 0; a < 2; a++) {
        const prev = k === 0 ? rest[a] : S.poses[k - 1][a];
        ang[a] = S.poses[k][a] + (prev - S.poses[k][a]) * f;
      }
      lamp = S.flash.r0 + (S.flash.r1 - S.flash.r0) * Math.exp(-u / S.flash.tau);
      colour = accents[k];
      calm = 0.35;
    } else {
      const u = t - RELAY.lengthS;
      const last = S.poses[S.poses.length - 1];
      const f = springLeft(u, S.omega, zeta);
      for (let a = 0; a < 2; a++) ang[a] = rest[a] + (last[a] - rest[a]) * f;
      lamp = S.flash.r0 * (1 - smooth(u / RELAY.fadeS));
      colour = accents[accents.length - 1];
      if (u < 3) calm = 0.35;
    }
    // the end panels glow in the step's accent while the relay holds (the arms are dark at night)
    const lit = t < RELAY.lengthS ? 1 : 1 - smooth((t - RELAY.lengthS) / RELAY.fadeS);
    for (let a = 0; a < 2; a++) {
      const sway =
        S.idleDeg *
        calm *
        c.motion *
        Math.sin((c.time / S.idlePeriod) * Math.PI * 2 + a * S.idleGap + idx);
      const rad = ((ang[a] + (a === 0 ? sway : -sway)) * Math.PI) / 180;
      const pivot: V3 = [SEMAPHORE.pivotX[a], SEMAPHORE.pivotY, SEMAPHORE.pivotZ];
      w.put(PART.arm, pivot, [0, 0, rad], 1);
      if (lit > 0.01)
        w.put(
          PART.glow,
          [
            pivot[0] - Math.sin(rad) * S.tip.along,
            pivot[1] + Math.cos(rad) * S.tip.along,
            pivot[2] + S.tip.front,
          ],
          [0, 0, 0],
          S.tip.r * lit,
          colour,
        );
    }
    if (lamp > 0.01) w.put(PART.glow, S.lamp, [0, 0, 0], lamp, colour);
  };
}

/** One signal flash at culture-clock `day` for relay step `order`: envelope 0..1 and flash phase. */
export interface SignalFlash {
  /** Envelope (attack, then decay) of the flash running now; 0 between flashes. */
  e: number;
  /** Phase 0..1 of that flash (−1 when none runs). */
  p: number;
  /** Light front along the path, 0 at the lamp .. 1 at the next lamp (eased). */
  front: number;
}

export function signalFlash(order: number, day: number, out: SignalFlash): SignalFlash {
  const S = SIGNAL_CHAIN;
  out.e = 0;
  out.p = -1;
  out.front = 0;
  const u = relayT(day) - (order - 1) * RELAY.stepS;
  if (u < 0 || u >= RELAY.stepS) return out;
  for (let i = 0; i < S.flashes; i++) {
    const ph = (u - S.firstS - i * S.gapS) / S.flashS;
    if (ph < 0 || ph >= 1) continue;
    out.p = ph;
    out.e = ph < S.attack ? ph / S.attack : (1 - ph) / (1 - S.attack);
    const f = Math.min(1, ph / S.reach);
    out.front = 1 - (1 - f) * (1 - f);
  }
  return out;
}

/**
 * Signal chain (M23 TASK-490, W:B6; TASK-496): the lamp on an island's highest point. At night a mast
 * with a small lamp springs up; in the relay, in its island's step, it throws `flashes` flashes toward
 * the next island of the chain. The light itself is a soft beam (`createCultureMovers`, lighthouse beam
 * program); this scene adds the lamp swelling and the catch pop at the next lamp when the beam's light
 * front gets there. World-frame scene; sizes grow with the camera distance (the lamps are meant to read
 * from the T0 postcard).
 */
function signalScene(order: number, lamp: V3, to: V3, accent: string, mast: boolean): Scene['run'] {
  const S = SIGNAL_CHAIN;
  const tint = lightened(accent, S.lighten);
  const pop = lightened(accent, 0.75);
  const fl: SignalFlash = { e: 0, p: -1, front: 0 };
  return (w, c) => {
    const dist = Math.hypot(c.cam.x - lamp[0], c.cam.z - lamp[2]);
    const px = Math.min(S.maxPx, dist * S.minScreen);
    const up = smooth((c.night - S.rest.night[0]) / (S.rest.night[1] - S.rest.night[0]));
    const rise = easeOutBack(up);
    const { e, p } = signalFlash(order, c.day, fl);
    if (up > 0.01) {
      if (mast) cable(w, [lamp[0], lamp[1] - S.mast * rise, lamp[2]], lamp, '#FFF4E0');
      const r = Math.max(S.lampR * S.rest.r, px) * rise * (1 + S.flashGrow * e);
      w.put(PART.glow, lamp, [0, 0, 0], r, tint);
    }
    if (e <= 0.01) return;
    // the next lamp catches the light: a pop as the front lands, fading over `catch.fade`
    const k = (p - S.reach) / S.catch.fade;
    if (k >= 0 && k < 1) {
      const dt = Math.hypot(c.cam.x - to[0], c.cam.z - to[2]);
      const r = Math.max(S.catch.r, Math.min(S.maxPx, dt * S.minScreen) * S.catch.px);
      w.put(PART.glow, to, [0, 0, 0], r * easeOutBack(Math.min(1, k * 4)) * (1 - k), pop);
    }
  };
}

/**
 * HQ culture gate lantern (TASK-469): at its culture's relay step (order x 10 s) the lantern flares
 * into an accent halo and sends out a ring, then holds a glow until the relay is over. The seven
 * gates therefore light up one after another in relay order.
 */
function gateLampScene(variant: number): Scene['run'] {
  const G = M.gateLamp;
  const theme = THEME_IDS[variant % THEME_IDS.length];
  const order = CULTURES[theme].relay.order;
  const accent = THEMES[theme].accent;
  const tints = Array.from({ length: 8 }, (_, i) => lightened(accent, (G.lighten * i) / 7));
  const R = G.rest;
  return (w, c) => {
    // night rest glow (TASK-478): the two finial lamps of every gate light up after dusk
    const rest = smooth((c.night - R.night[0]) / (R.night[1] - R.night[0]));
    if (rest > 0.01)
      for (const p of R.posts) w.put(PART.glow, p, [0, 0, 0], R.post * rest, tints[R.tint]);
    const boost = relayBoost(c.day, order);
    if (boost < 0.01) return;
    const k = Math.min(1, boost / RELAY.flash);
    const r = G.base + G.perBoost * boost;
    w.put(PART.glow, G.at, [0, 0, 0], r, tints[Math.round(k * 7)]);
    const u = relayT(c.day) - (order - 1) * RELAY.stepS;
    if (u >= 0 && u < G.ring.seconds) {
      const ph = u / G.ring.seconds;
      const rr = G.ring.r0 + (G.ring.r1 - G.ring.r0) * (1 - (1 - ph) * (1 - ph));
      w.put(PART.ring, G.at, [0, 0, 0], [rr, rr * Math.max(0.15, 1 - ph), rr]);
    }
  };
}

/**
 * HQ stall keeper (TASK-469): a worker-bot figure behind the counter. Awake from `open` to
 * midnight (springs in, shrinks out), idles with a bob and nod, fiddles with the goods, beckons now
 * and then, turns to and waves at a close camera and cheers at its culture's relay step.
 */
function keeperScene(variant: number, idx: number): Scene['run'] {
  const K = M.keeper;
  const theme = THEME_IDS[variant % THEME_IDS.length];
  const order = CULTURES[theme].relay.order;
  const tint = lightened(THEMES[theme].accent, K.lighten);
  const ph = rnd(idx, variant, 21);
  return (w, c, s) => {
    const secs = c.hour * SPH;
    const up = secs - K.open * SPH;
    if (up < 0) return;
    const sc =
      K.scale *
      (up < K.popSeconds ? easeOutBack(up / K.popSeconds) : 1) *
      smooth((DAY - secs) / K.closeSeconds);
    if (sc <= 0.01) return;
    const m = c.motion;
    const tt = c.time;
    // camera in the stall frame: turn toward it, wave when it is close
    const dx = c.cam.x - s.cx;
    const dz = c.cam.z - s.cz;
    const cs = Math.cos(s.yaw);
    const sn = Math.sin(s.yaw);
    const lx = dx * cs - dz * sn;
    const lz = dx * sn + dz * cs;
    const near = smooth((K.waveRadius - Math.hypot(dx, dz)) / 6);
    const yaw = Math.max(-K.turn, Math.min(K.turn, Math.atan2(lx, lz))) * near * m;
    // cheer at the culture's relay step
    const rt = relayT(c.day);
    const cu = rt - (order - 1) * RELAY.stepS;
    const cheer =
      rt < RELAY.lengthS && cu >= 0 && cu < K.cheer.seconds
        ? smooth(cu / 0.3) * smooth((K.cheer.seconds - cu) / 0.5)
        : 0;
    const hop = K.cheer.hop * cheer * m * Math.abs(Math.sin((Math.PI * cu) / K.cheer.hopPeriod));
    const bob = K.bob * m * Math.sin((tt / K.bobPeriod + ph) * Math.PI * 2);
    const nod = K.nod * m * Math.sin((tt / (K.bobPeriod * 1.7) + ph) * Math.PI * 2);
    const P: V3 = [K.at[0], K.at[1] + bob + hop, K.at[2]];
    w.put(PART.keeper, P, [nod, yaw, 0], sc, tint);
    // arms: both fiddle with the goods; the right one beckons / waves, both go up to cheer
    const bu = (tt + ph * K.beckon.every) % K.beckon.every;
    const beckon =
      bu < K.beckon.seconds ? smooth(bu / 0.25) * smooth((K.beckon.seconds - bu) / 0.25) : 0;
    const wave = Math.max(near * 0.9, beckon) * m;
    for (const side of [-1, 1] as const) {
      const fid = 0.15 * m * Math.sin(tt * 2.2 + ph * 6.28 + (side > 0 ? 1.9 : 0));
      const raise = side > 0 ? Math.max(wave, cheer * m) : cheer * m;
      const pitch = -0.7 + fid + (0.7 - fid) * raise;
      const roll = 0.14 + (2.41 + 0.4 * Math.sin(tt * 9 + side)) * raise;
      w.put(
        PART.limb,
        [
          P[0] + side * K.shoulder[0] * sc * Math.cos(yaw),
          P[1] + K.shoulder[1] * sc,
          P[2] - side * K.shoulder[0] * sc * Math.sin(yaw),
        ],
        [pitch, yaw, roll * side],
        sc,
        tint,
      );
    }
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
  /** Add to the world group: the part meshes and the night searchlight beams. */
  group: THREE.Group;
  /** One part mesh per `PartKind` (index = kind; empty when the world has no culture scene). */
  meshes: readonly THREE.InstancedMesh[];
  update(
    time: number,
    hour: number,
    env: EnvState,
    camPos: THREE.Vector3,
    culture?: Pick<CultureState, 'festival'> & Partial<Pick<CultureState, 'day'>>,
  ): void;
  /**
   * Bind the world's puff mesh (before its `finalize`): scenes with soft steam (the test firing)
   * place their puffs there. Without it they draw no steam.
   */
  bindPuffs(puffs: { reserve(n: number): PlacedPuffs | null }): void;
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
    gate: defOf('cultureGate'),
    stall: defOf('goodsStall'),
    sema: defOf('semaphoreTower'),
    mast: defOf('antennaMast'),
    tower: defOf('campusTower'),
    rocket: defOf('rocketMonument'),
    drop: defOf('dropTower'),
    track: defOf('testTrack'),
    customs: defOf('customsYard'),
  };
  const beams: Beam[] = [];
  const beamAnchors: { x: number; y: number; z: number }[] = [];
  let beamMat: THREE.ShaderMaterial | null = null;
  let beamGeo: THREE.BufferGeometry | null = null;
  // M22 (TASK-482) DevOps watch tower beacons
  const watchBeams: THREE.Mesh[] = [];
  let watchMat: THREE.ShaderMaterial | null = null;
  const ids = new Map<number, number>();
  let semaLamp: V3 | null = null;
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
    else if (d === D.drop && v === 1)
      scenes.push(
        sceneAt(
          th,
          pv(),
          store.rotY[i],
          [0, 5, 0],
          2 + QA_PROVING_MOTION.drop.dust.rings,
          dropTowerScene(),
        ),
      );
    else if (d === D.track && v === 1) {
      const sc = sceneAt(th, pv(), store.rotY[i], [0, 1, 0], 1, crashDummyScene());
      sc.range2 = (QA_MOVERS.fadeFar + 20) * (QA_MOVERS.fadeFar + 20);
      scenes.push(sc);
    } else if (d === D.customs && v === 1) {
      // M30 TASK-508: the port's layout comes from the island anchors the planner wrote
      const isl = world.islands[store.islandId[i]];
      const fl = isl?.anchors.customsFlip;
      const ln = isl?.anchors.customsLane;
      if (fl && ln) {
        const lay = portLayout({ sl: fl.z > 0 ? 1 : -1, lane: ln.x });
        const sc = sceneAt(
          th,
          pv(),
          store.rotY[i],
          [lay.spot.x, 2, lay.spot.z],
          MAX_ITEMS,
          customsPortScene(lay, -store.y[i] / (store.scale[i] || 1)),
        );
        sc.range2 = QA_CUSTOMS_RANGE * QA_CUSTOMS_RANGE;
        scenes.push(sc);
      }
    } else if (d === D.cart)
      scenes.push(sceneAt(th, pv(), store.rotY[i], [0, 2, 0], 3, balloonScene()));
    else if (d === D.gate)
      scenes.push(sceneAt(th, pv(), store.rotY[i], [0, 1.87, 0], 4, gateLampScene(v)));
    else if (d === D.stall)
      scenes.push(sceneAt(th, pv(), store.rotY[i], [0, 1.0, 0], 3, keeperScene(v, idx)));
    else if (d === D.sema) {
      scenes.push(sceneAt(th, pv(), store.rotY[i], [0, 7.7, 0], 5, semaphoreScene(idx)));
      // the chain's HQ lamp is the semaphore's own
      if (idx === 0) {
        _a.set(...M.semaphore.lamp).applyMatrix4(pv());
        semaLamp = [_a.x, _a.y, _a.z];
      }
    } else if (d === D.tower && v === 3)
      // M22 R17: the bell-cupola tower's two belfry bells + the sound rings
      scenes.push(
        sceneAt(th, pv(), store.rotY[i], [0, RESEARCH_M22.bells.hingeY, 0], 4, campusBellScene()),
      );
    else if (d === D.rocket && v === RESEARCH_M22.gantry.variant)
      // M22 R13: the 12:00 test firing under the gantry rocket
      scenes.push(
        sceneAt(
          th,
          pv(),
          store.rotY[i],
          RESEARCH_M22.gantry.steamAt,
          1,
          launchScene(idx),
          M.launch.puffs * 2,
        ),
      );
    else if (d === D.mast && v === M.watch.variant) {
      const T = DEVOPS_M22.tower;
      scenes.push(sceneAt(th, pv(), store.rotY[i], [0, T.bellY, 0], M.watch.rings, watchScene()));
      // the red beacon beam from the roof lamp (lighthouse beam program, own colour / turn rate)
      const B = M.watch.beam;
      const sc = store.scale[i] || 1;
      watchMat ??= scope.add(
        createSkyProgramMaterial('beam', {
          flareRadius: BEAM.flareRadius * B.scale * B.flare,
          flarePull: BEAM.flarePull * B.scale,
        }),
      );
      (watchMat.uniforms.uBeamColor.value as THREE.Color).set(B.color);
      (watchMat.uniforms.uBeamMotion.value as THREE.Vector4).x = (Math.PI * 2) / B.secondsPerRev;
      beamGeo ??= scope.add(buildBeamGeometry());
      const mesh = new THREE.Mesh(beamGeo, watchMat);
      mesh.name = 'watch-beacon-beam';
      mesh.position.copy(new THREE.Vector3(0, T.beaconY, 0).applyMatrix4(pv()));
      mesh.scale.setScalar(B.scale * sc);
      mesh.renderOrder = 20;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.visible = false;
      group.add(mesh);
      watchBeams.push(mesh);
    } else if (d === D.prism) {
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
  // M23 W:B6 signal chain: a lamp on every island's highest point (HQ: the semaphore lamp), each
  // flashing toward the next island in relay order in its own step
  const lampOf = new Map<ThemeId, V3>();
  const signals: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; order: number }[] = [];
  for (const th of THEME_OF_ORDER) {
    const isl = world.islands.find((i) => i.theme === th);
    if (!isl) continue;
    lampOf.set(th, [isl.peakX, isl.peakY + SIGNAL_CHAIN.mast, isl.peakZ]);
  }
  if (semaLamp) lampOf.set('hq', semaLamp);
  THEME_OF_ORDER.forEach((th, k) => {
    const at = lampOf.get(th);
    const to = lampOf.get(THEME_OF_ORDER[(k + 1) % THEME_OF_ORDER.length]);
    if (!at || !to) return;
    const sc = sceneAt(
      th,
      new THREE.Matrix4(),
      0,
      at,
      3, // mast, lamp, the catch at the next lamp
      signalScene(CULTURES[th].relay.order, at, to, THEMES[th].accent, th !== 'hq'),
    );
    sc.pivot = null;
    sc.range2 = SIGNAL_CHAIN.range * SIGNAL_CHAIN.range;
    scenes.push(sc);
    // the signal beam (TASK-496): the lighthouse beam cone, not turning, stretched from the lamp to
    // the next lamp; shown only while a flash runs
    const SB = SIGNAL_CHAIN.beam;
    _a.set(to[0] - at[0], to[1] - at[1], to[2] - at[2]);
    const len = _a.length();
    beamGeo ??= scope.add(buildBeamGeometry());
    const mat = scope.add(
      createSkyProgramMaterial('beam', { flareRadius: SB.flare, flarePull: 0 }),
    );
    (mat.uniforms.uBeamColor.value as THREE.Color).set(lightened(THEMES[th].accent, 0.55));
    (mat.uniforms.uBeamMotion.value as THREE.Vector4).setX(0).setY(0);
    const mesh = new THREE.Mesh(beamGeo, mat);
    mesh.name = 'signal-beam';
    mesh.position.set(at[0], at[1], at[2]);
    mesh.quaternion.setFromUnitVectors(_x.set(1, 0, 0), _a.divideScalar(len));
    mesh.scale.set(len / BEAM.length, SB.width, SB.width);
    mesh.renderOrder = 20;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    group.add(mesh);
    signals.push({ mesh, mat, order: CULTURES[th].relay.order });
  });
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
  // M22 R16: the cap toss at the research lecture spot (spot frame: x right, z ahead = lotYaw)
  for (const sp of world.storySpots) {
    if (sp.kind !== 'lecture' || world.islands[sp.islandId]?.theme !== 'research') continue;
    const yaw = lotYaw({ x: sp.pos.x, z: sp.pos.z, rotY: sp.rotY });
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(sp.pos.x, sp.pos.y, sp.pos.z),
      new THREE.Quaternion().setFromAxisAngle(_up, yaw),
      new THREE.Vector3(1, 1, 1),
    );
    scenes.push(sceneAt('research', m, yaw, [0, 1.5, 0], M.capToss.spots.length, capTossScene()));
  }
  // research balloon carts get the 06:00 launch only (their static balloon stays tethered)
  // HQ mail lines (TASK-466): the sacks on the cable between each pylon pair
  for (const pr of mailLinePairs(store)) {
    const mid: V3 = [(pr.a.x + pr.b.x) / 2, (pr.a.y + pr.b.y) / 2, (pr.a.z + pr.b.z) / 2];
    const sc = sceneAt(
      world.islands[pr.islandId]?.theme ?? 'hq',
      new THREE.Matrix4(),
      0,
      mid,
      M.mail.sacks * 2,
      mailScene(pr.a, pr.b),
    );
    sc.pivot = null; // world-frame parts
    scenes.push(sc);
  }

  // M22 Deploy Night (TASK-482): the DevOps cargo ships' horn + masthead flash (movers.ts loops)
  for (const dk of world.docks) {
    if (world.islands[dk.islandId]?.theme !== 'devops') continue;
    const L = pierLoop(
      world.height,
      dk,
      { x: Math.cos(dk.rotY), z: Math.sin(dk.rotY) },
      dk.segments * DOCK.segment,
    );
    if (!L) continue;
    const mid: V3 = [
      L.a.x + L.t.x * L.len * 0.5 + L.f.x * L.r,
      2,
      L.a.z + L.t.z * L.len * 0.5 + L.f.z * L.r,
    ];
    for (let k = 0; k < DEVOPS_MOVERS.ship.perDock; k++) {
      const sc = sceneAt(
        'devops',
        new THREE.Matrix4(),
        0,
        mid,
        M.deploy.rings + 1,
        deployScene(L, k),
      );
      sc.pivot = null;
      scenes.push(sc);
    }
  }

  const meshes: THREE.InstancedMesh[] = [];
  let writer: Writer | null = null;
  const capacity = scenes.reduce((a, s) => a + s.max, 0);
  if (capacity > 0) {
    // one shared material (one program) and one instanced mesh per part kind (TASK-495)
    const mat = scope.add(makeLifeMaterial('culture-movers', false));
    for (const geo of buildPartGeometries()) {
      scope.add(geo);
      const gait = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      gait.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aGait', gait);
      const mesh = new THREE.InstancedMesh(geo, mat, capacity);
      mesh.name = `culture-movers:${meshes.length}`;
      mesh.count = 0;
      mesh.frustumCulled = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // allocate instanceColor up front: a later allocation would change the program parameters
      for (let i = 0; i < capacity; i++) mesh.setColorAt(i, new THREE.Color(1, 1, 1));
      mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      mesh.visible = false;
      scope.add(mesh);
      group.add(mesh);
      meshes.push(mesh);
    }
    writer = new Writer(meshes, capacity);
  }

  let lastInstances = 0;
  let lastPuffs = 0;
  let lastScenes = 0;
  let lastBeams = 0;
  const range2 = M.range * M.range;
  const ctx: CultureCtx = {
    time: 0,
    hour: 0,
    day: 0,
    cam: { x: 0, z: 0 },
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
    culture?: Pick<CultureState, 'festival'> & Partial<Pick<CultureState, 'day'>>,
  ): void => {
    ctx.time = time;
    ctx.hour = hour;
    ctx.day = culture?.day ?? hour * SPH;
    ctx.cam.x = camPos.x;
    ctx.cam.z = camPos.z;
    ctx.sun = env.sunSkyDir;
    ctx.night = env.night;
    const wv = SHARED.uWind.value;
    const wl = Math.hypot(wv.x, wv.y) || 1;
    ctx.wind.x = wv.x / wl;
    ctx.wind.z = wv.y / wl;
    ctx.wind.s = wv.z;
    ctx.motion = SHARED.uMotionScale.value;
    let nScenes = 0;
    if (writer) {
      writer.reset();
      for (const s of scenes) {
        const dx = s.cx - camPos.x;
        const dy = s.cy - camPos.y;
        const dz = s.cz - camPos.z;
        if (dx * dx + dy * dy + dz * dz > (s.range2 ?? range2)) continue;
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
      // hide the puffs placed last frame and not this one, upload while any is or was out
      const pb = writer.puffs;
      if (pb && (writer.pn > 0 || lastPuffs > 0)) {
        for (let i = writer.pn; i < lastPuffs; i++) pb.set(i, 0, -1e3, 0, 0, 0, 1);
        pb.upload();
      }
      lastPuffs = writer.pn;
      meshes.forEach((mesh, k) => {
        const n = writer!.counts[k];
        mesh.count = n;
        mesh.visible = n > 0;
        if (n > 0) {
          mesh.instanceMatrix.needsUpdate = true;
          mesh.instanceColor!.needsUpdate = true;
          mesh.geometry.getAttribute('aGait').needsUpdate = true;
          // bounds of this frame's instances: a kind wholly out of view costs no draw call
          mesh.computeBoundingSphere();
        }
      });
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
    // the watch tower beacons: every night, within M.watch.range (a T1 read)
    const wr2 = M.watch.range * M.watch.range;
    for (const b of watchBeams) {
      const on = SHARED.uLamps.value.z > 0.001 && b.position.distanceToSquared(camPos) < wr2;
      b.visible = on;
      if (on) nb++;
    }
    // the signal beams: the light front runs out each flash and the beam fades with its envelope
    const SB = SIGNAL_CHAIN.beam;
    const sr2 = SIGNAL_CHAIN.range * SIGNAL_CHAIN.range;
    for (const sg of signals) {
      const f = signalFlash(sg.order, ctx.day, _flash);
      const on =
        SHARED.uLamps.value.z > 0.001 &&
        f.e > 0.01 &&
        sg.mesh.position.distanceToSquared(camPos) < sr2;
      sg.mesh.visible = on;
      if (!on) continue;
      nb++;
      const u = sg.mat.uniforms;
      const look = u.uBeamLook.value as THREE.Vector4;
      look.x = SB.opacity * f.e;
      look.y = 0;
      const fx = u.uBeamFx.value as THREE.Vector4;
      fx.x = Math.max(0, f.front - SB.soft);
      fx.y = f.front + 0.001;
      fx.z = SB.flareIntensity * f.e;
      const px = Math.min(
        SIGNAL_CHAIN.maxPx,
        sg.mesh.position.distanceTo(camPos) * SIGNAL_CHAIN.minScreen,
      );
      (u.uBeamMotion.value as THREE.Vector4).z = Math.max(SB.flare, px * SB.flarePx);
    }
    lastBeams = nb;
  };
  return {
    group,
    meshes,
    update,
    bindPuffs(puffs) {
      const n = scenes.reduce((a, s) => a + (s.puffs ?? 0), 0);
      if (writer && n > 0) writer.puffs = puffs.reserve(n);
    },
    stats: () => ({ instances: lastInstances, scenes: lastScenes, beams: lastBeams }),
    sceneCount: scenes.length + beamAnchors.length + watchBeams.length,
  };
}
