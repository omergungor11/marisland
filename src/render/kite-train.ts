import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import { createRng } from '../core/rng.ts';
import { SKY_CRAFT } from '../content/sky-craft.ts';
import type { WorldData } from '../world/index.ts';
import { col } from '../geo/kit.ts';
import { SHARED } from './uniforms.ts';

/**
 * Mother Kite Train (TASK-500, CO:C3, D-077): a lead kite plus six followers on one line, circling
 * the Coding island on the sky-craft pattern (a closed-form orbit of the sim time). The train is ONE
 * mesh on the sky-craft material: a single instance at the far fleet anchor (so the program's
 * distance fade / island-lamp lookups stay identity, see render/sky-craft.ts) whose vertices are
 * written on the CPU each frame — kites are rigid, but the tails and the line between the kites
 * bend. Everything is a function of the sim time, the seed and the reduced-motion scale
 * (`uMotionScale` calms every sway / flutter amplitude), so a frozen capture is deterministic.
 * No shadows; excluded from the ladder like the other sky craft.
 */
const K = SKY_CRAFT.kiteTrain;
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const smooth = (x: number): number => {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
};

/** Per-kite seeded variation: period jitters and phase offsets (never in sync). */
interface KiteVar {
  bob: number;
  roll: number;
  wob: number;
  flutter: number;
  ph: number;
  ph2: number;
}

export interface KiteTrainRig {
  cx: number;
  cz: number;
  R: number;
  y0: number;
  phase: number;
  kites: KiteVar[];
}

/** Orbit rig around the Coding island (null when the world has none). Pure. */
export function kiteTrainRig(world: WorldData, seed: number): KiteTrainRig | null {
  const isl = world.islands.find((i) => i.theme === K.theme);
  if (!isl) return null;
  const rng = createRng(seed).fork('kite-train');
  const J = K.periodJitter;
  return {
    cx: isl.cx,
    cz: isl.cz,
    R: isl.radius * K.radiusFrac,
    y0: isl.peakY + K.clearance,
    phase: rng.range(0, TAU),
    kites: Array.from({ length: K.count }, (_, i) => {
      const r = rng.fork('kite', i);
      return {
        bob: 1 + r.range(-J, J),
        roll: 1 + r.range(-J, J),
        wob: 1 + r.range(-J, J),
        flutter: 1 + r.range(-J, J),
        ph: r.range(0, TAU),
        ph2: r.range(0, TAU),
      };
    }),
  };
}

/** Position of kite `i` at sim time `t` (`ms` = motion scale 1 / 0.3) into `out`. Pure. */
export function kitePosition(
  rig: KiteTrainRig,
  i: number,
  t: number,
  ms: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const a = rig.phase + (K.speed * t - i * K.spacing) / rig.R;
  const v = rig.kites[i];
  const snake =
    K.snake.amp * (i / (K.count - 1)) * Math.sin((TAU * t) / K.snake.period - i * K.snake.lag) * ms;
  const rad = rig.R * (1 + 0.1 * Math.sin(2 * a + 0.7)) + snake;
  const y =
    rig.y0 +
    1.2 * Math.sin(a + 0.4) -
    K.sinkPerKite * i +
    K.bob.amp * ms * Math.sin((TAU * t) / (K.bob.period * v.bob) + v.ph);
  return out.set(rig.cx + rad * Math.cos(a), y, rig.cz + rad * Math.sin(a));
}

// ---------------------------------------------------------------------------------------------
// Triangle writer: counts first, then fills fixed-size arrays (flat normals)
// ---------------------------------------------------------------------------------------------

const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _n = new THREE.Vector3();

class TriWriter {
  n = 0;
  pos: Float32Array | null = null;
  nor: Float32Array | null = null;
  clr: Float32Array | null = null;
  anchor = new THREE.Vector3();

  alloc(tris: number): void {
    this.pos = new Float32Array(tris * 9);
    this.nor = new Float32Array(tris * 9);
    this.clr = new Float32Array(tris * 9);
  }

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color): void {
    const o = this.n * 9;
    this.n++;
    const { pos, nor, clr, anchor } = this;
    if (!pos || !nor || !clr) return;
    _n.crossVectors(_e1.subVectors(b, a), _e2.subVectors(c, a));
    if (_n.lengthSq() > 1e-12) _n.normalize();
    else _n.set(0, 1, 0);
    const p = [a, b, c];
    for (let k = 0; k < 3; k++) {
      pos[o + k * 3] = p[k].x - anchor.x;
      pos[o + k * 3 + 1] = p[k].y - anchor.y;
      pos[o + k * 3 + 2] = p[k].z - anchor.z;
      nor[o + k * 3] = _n.x;
      nor[o + k * 3 + 1] = _n.y;
      nor[o + k * 3 + 2] = _n.z;
      clr[o + k * 3] = color.r;
      clr[o + k * 3 + 1] = color.g;
      clr[o + k * 3 + 2] = color.b;
    }
  }

  /** Both faces (each lit with its own normal). */
  both(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color): void {
    this.tri(a, b, c, color);
    this.tri(a, c, b, color);
  }

  /** One face, wound so its normal points along `hint`. */
  facing(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    hint: THREE.Vector3,
    color: THREE.Color,
  ): void {
    _n.crossVectors(_e1.subVectors(b, a), _e2.subVectors(c, a));
    if (_n.dot(hint) >= 0) this.tri(a, b, c, color);
    else this.tri(a, c, b, color);
  }
}

// ---------------------------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------------------------

/** Warm lift for the shaded side (hemisphere fill is blue-grey there): red up, green slightly, blue down. */
const lift = (hex: string): THREE.Color => {
  const c = col(hex);
  const k = K.yellowLift;
  const g = K.yellowGain;
  return c.setRGB(c.r * (1 + 0.1 * k) * g, c.g * (1 + 0.1 * k) * g, c.b * (1 - 0.62 * k));
};
const C = {
  blue: K.blue.map(col),
  yellow: K.yellow.map(lift),
  spar: col(K.spar),
  line: col(K.line),
};
/** Kite model units: tip-to-tip height 1.8; the cross point is the origin. */
const M = { top: 0.63, bot: -1.17, half: 0.62, belly: 0.1, spar: 0.03, lift: 0.025 };
const MODEL_H = M.top - M.bot;
const LINE_SEGS = 6;

const pool = Array.from({ length: 24 }, () => new THREE.Vector3());
const _Fh = new THREE.Vector3();
const _hint = new THREE.Vector3();

interface Frame {
  p: THREE.Vector3;
  X: THREE.Vector3;
  Y: THREE.Vector3;
  Z: THREE.Vector3;
  Fh: THREE.Vector3;
  /** u per model unit (includes the near fade). */
  s: number;
  fade: number;
  height: number;
}

const frames: Frame[] = Array.from({ length: K.count }, () => ({
  p: new THREE.Vector3(),
  X: new THREE.Vector3(),
  Y: new THREE.Vector3(),
  Z: new THREE.Vector3(),
  Fh: new THREE.Vector3(),
  s: 1,
  fade: 1,
  height: 1,
}));
const _pts: THREE.Vector3[] = [];
const _wds: THREE.Vector3[] = [];
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();

/** Rotate `v` about unit `axis` by `ang` (Rodrigues), in place. */
function spin(v: THREE.Vector3, axis: THREE.Vector3, ang: number): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const d = axis.dot(v) * (1 - c);
  _e1.crossVectors(axis, v);
  v.multiplyScalar(c).addScaledVector(_e1, s).addScaledVector(axis, d);
}

/** Fill `frames` for time `t`. */
function poseFrames(rig: KiteTrainRig, t: number, ms: number, cam?: THREE.Vector3): void {
  for (let i = 0; i < K.count; i++) kitePosition(rig, i, t, ms, frames[i].p);
  for (let i = 0; i < K.count; i++) {
    const f = frames[i];
    const v = rig.kites[i];
    if (i > 0) _Fh.subVectors(frames[i - 1].p, f.p);
    else
      _Fh.subVectors(
        kitePosition(rig, 0, t + 0.5, ms, _pa),
        kitePosition(rig, 0, t - 0.5, ms, _pb),
      );
    _Fh.y = 0;
    if (_Fh.lengthSq() < 1e-8) _Fh.set(1, 0, 0);
    _Fh.normalize();
    f.Fh.copy(_Fh);
    const wob = K.wobble.amp * ms * Math.sin((TAU * t) / (K.wobble.period * v.wob) + v.ph2);
    const pitch = K.pitch + wob;
    f.Y.set(_Fh.x * Math.cos(pitch), Math.sin(pitch), _Fh.z * Math.cos(pitch));
    f.X.set(_Fh.z, 0, -_Fh.x);
    f.Z.crossVectors(f.X, f.Y);
    const roll =
      (i % 2 ? -1 : 1) * K.baseRoll +
      K.roll.amp * ms * Math.sin((TAU * t) / (K.roll.period * v.roll) + v.ph);
    spin(f.X, f.Y, roll);
    spin(f.Z, f.Y, roll);
    f.height = i === 0 ? K.leadHeight : K.height;
    f.fade = 1;
    if (cam) {
      const d = cam.distanceTo(f.p);
      f.fade = Math.max(1e-4, smooth((d - K.fadeFar) / (K.fadeNear - K.fadeFar)));
    }
    f.s = (f.height / MODEL_H) * f.fade;
  }
}

/** World point of model coords (x, y, z) of frame `f` into pool slot `k`. */
function at(f: Frame, k: number, x: number, y: number, z: number): THREE.Vector3 {
  return pool[k]
    .copy(f.p)
    .addScaledVector(f.X, x * f.s)
    .addScaledVector(f.Y, y * f.s)
    .addScaledVector(f.Z, z * f.s);
}

function emitKite(w: TriWriter, rig: KiteTrainRig, i: number, t: number, ms: number): void {
  const f = frames[i];
  // two-tone: blue + yellow quadrants (odd kites swap), ribbon in the pale tint of the first colour
  const blueKite = i % 2 === 0;
  const first = blueKite ? C.blue : C.yellow;
  const second = blueKite ? C.yellow : C.blue;
  const v = (k: number, x: number, y: number, z: number): THREE.Vector3 => at(f, k, x, y, z);
  const top = v(0, 0, M.top, 0);
  const bot = v(1, 0, M.bot, 0);
  const l = v(2, -M.half, 0, 0);
  const r = v(3, M.half, 0, 0);
  const c = v(4, 0, 0, M.belly);
  // four panels, opposite quadrants share a colour
  w.both(top, l, c, first[0]);
  w.both(top, c, r, second[0]);
  w.both(l, bot, c, second[0]);
  w.both(c, bot, r, first[0]);
  // spars along the panel seams: front strip faces +Z, back strip -Z
  const edge = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): void => {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const px = (-dy / len) * M.spar;
    const py = (dx / len) * M.spar;
    for (const side of [1, -1]) {
      const zo = side * M.lift;
      const a0 = v(5, ax + px, ay + py, az + zo);
      const a1 = v(6, ax - px, ay - py, az + zo);
      const b0 = v(7, bx + px, by + py, bz + zo);
      const b1 = v(8, bx - px, by - py, bz + zo);
      _hint.copy(f.Z).multiplyScalar(side);
      w.facing(a0, a1, b0, _hint, C.spar);
      w.facing(a1, b1, b0, _hint, C.spar);
    }
  };
  edge(0, M.top, 0, 0, 0, M.belly);
  edge(0, 0, M.belly, 0, M.bot, 0);
  edge(-M.half, 0, 0, 0, 0, M.belly);
  edge(0, 0, M.belly, M.half, 0, 0);

  // ---- tail: a ribbon of N segments hanging from the bottom tip, with bows; flutter grows to the end
  const T = K.tail;
  const N = T.segments;
  const len = T.length * f.height * f.fade;
  const seg = len / N;
  const amp = T.flutter * len * ms;
  const jf = rig.kites[i];
  const dir0 = pool[9]
    .copy(f.Y)
    .multiplyScalar(-0.5)
    .addScaledVector(UP, -0.5)
    .addScaledVector(f.Fh, -0.25);
  dir0.normalize();
  const pts = _pts;
  const widths = _wds;
  const cur = pool[10].copy(bot);
  const hw = (T.width * f.height * f.fade) / 2;
  for (let j = 0; j <= N; j++) {
    const u = j / N;
    if (j > 0) {
      const d = pool[11]
        .copy(dir0)
        .multiplyScalar(1 - 0.55 * u)
        .addScaledVector(UP, 0.55 * u)
        .normalize();
      cur.addScaledVector(d, seg);
    }
    const ph = (TAU * t) / (T.period * jf.flutter) - K.tailLag * j + jf.ph;
    const ph2 = (TAU * t) / (T.period * jf.flutter * 1.17) - K.tailLag * j + jf.ph2;
    const p = (pts[j] ??= new THREE.Vector3()).copy(cur);
    p.addScaledVector(f.X, amp * u * Math.sin(ph));
    p.addScaledVector(f.Z, amp * 0.6 * u * Math.sin(ph2));
    const tw = 0.6 * Math.sin(ph2 + 0.9) * ms;
    (widths[j] ??= new THREE.Vector3())
      .copy(f.X)
      .multiplyScalar(Math.cos(tw))
      .addScaledVector(f.Z, Math.sin(tw))
      .multiplyScalar(hw * (1 - 0.3 * u));
  }
  for (let j = 0; j < N; j++) {
    const a0 = pool[12].copy(pts[j]).add(widths[j]);
    const a1 = pool[13].copy(pts[j]).sub(widths[j]);
    const b0 = pool[14].copy(pts[j + 1]).add(widths[j + 1]);
    const b1 = pool[15].copy(pts[j + 1]).sub(widths[j + 1]);
    w.both(a0, a1, b0, first[1]);
    w.both(a1, b1, b0, first[1]);
  }
  const bowS = T.bow * f.height * f.fade;
  T.bows.forEach((j, bi) => {
    if (j >= N) return;
    const d = pool[16].subVectors(pts[j + 1], pts[j - 1]).normalize();
    const wv = pool[17].copy(widths[j]).normalize().multiplyScalar(bowS);
    const h = pool[18].copy(d).multiplyScalar(bowS * 0.7);
    const ctr = pts[j];
    const p1 = pool[19].copy(ctr).add(wv).add(h);
    const p2 = pool[20].copy(ctr).add(wv).sub(h);
    const p3 = pool[21].copy(ctr).sub(wv).add(h);
    const p4 = pool[22].copy(ctr).sub(wv).sub(h);
    const bc = (bi + i) % 2 === 0 ? C.yellow[0] : C.blue[0];
    w.both(ctr, p1, p2, bc);
    w.both(ctr, p3, p4, bc);
  });
}

/** The line between kite `i` and `i + 1`: a thin 3-sided tube that sags between the two centres. */
function emitLine(w: TriWriter, i: number): void {
  const fa = frames[i];
  const fb = frames[i + 1];
  const A = at(fa, 0, 0, 0, M.belly);
  const B = at(fb, 1, 0, 0, M.belly);
  const rad = K.lineRadius * Math.min(fa.fade, fb.fade);
  const d = pool[2].subVectors(B, A).normalize();
  const e1 = pool[3].crossVectors(d, UP);
  if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0);
  e1.normalize();
  const e2 = pool[4].crossVectors(d, e1).normalize();
  const sag = K.lineSag * Math.min(fa.fade, fb.fade);
  const ring = (u: number, k: number): void => {
    for (let s = 0; s < 3; s++) {
      const a = (s / 3) * TAU;
      pool[5 + k * 3 + s]
        .lerpVectors(A, B, u)
        .addScaledVector(UP, -sag * 4 * u * (1 - u))
        .addScaledVector(e1, Math.cos(a) * rad)
        .addScaledVector(e2, Math.sin(a) * rad);
    }
  };
  for (let m = 0; m < LINE_SEGS; m++) {
    ring(m / LINE_SEGS, 0);
    ring((m + 1) / LINE_SEGS, 1);
    for (let s = 0; s < 3; s++) {
      const s2 = (s + 1) % 3;
      const am = ((s + 0.5) / 3) * TAU;
      _hint.copy(e1).multiplyScalar(Math.cos(am)).addScaledVector(e2, Math.sin(am));
      w.facing(pool[5 + s], pool[5 + s2], pool[8 + s], _hint, C.line);
      w.facing(pool[5 + s2], pool[8 + s2], pool[8 + s], _hint, C.line);
    }
  }
}

function emitTrain(w: TriWriter, rig: KiteTrainRig, t: number, ms: number): void {
  w.n = 0;
  for (let i = 0; i < K.count; i++) emitKite(w, rig, i, t, ms);
  for (let i = 0; i < K.count - 1; i++) emitLine(w, i);
}

// ---------------------------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------------------------

export interface KiteTrainView {
  mesh: THREE.InstancedMesh;
  update(time: number, cam?: THREE.Vector3): void;
  /** Triangle count (tests / budgets). */
  tris: number;
}

/** The train as one InstancedMesh on `mat` (null when the world has no Coding island). */
export function createKiteTrain(
  world: WorldData,
  seed: number,
  mat: THREE.Material,
  anchor: THREE.Vector3,
  scope: Scope,
): KiteTrainView | null {
  const rig = kiteTrainRig(world, seed);
  if (!rig) return null;
  const w = new TriWriter();
  w.anchor.copy(anchor);
  // size pass (counting only), then allocate
  poseFrames(rig, 0, 1);
  emitTrain(w, rig, 0, 1);
  const tris = w.n;
  w.alloc(tris);
  const verts = tris * 3;
  const geo = scope.add(new THREE.BufferGeometry());
  const posA = new THREE.BufferAttribute(w.pos as Float32Array, 3).setUsage(THREE.DynamicDrawUsage);
  const norA = new THREE.BufferAttribute(w.nor as Float32Array, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posA);
  geo.setAttribute('normal', norA);
  geo.setAttribute(
    'color',
    new THREE.BufferAttribute(w.clr as Float32Array, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geo.setAttribute('wind', new THREE.BufferAttribute(new Float32Array(verts), 1));
  geo.setAttribute('ao', new THREE.BufferAttribute(new Float32Array(verts).fill(1), 1));
  geo.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array(verts), 1));
  geo.userData = { tris };
  geo.boundingSphere = new THREE.Sphere();
  const mesh = new THREE.InstancedMesh(geo, mat, 1);
  mesh.name = 'sky-kites';
  mesh.castShadow = false;
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  scope.add(mesh);

  const centre = new THREE.Vector3();
  let lastKey = '';
  const update = (t: number, cam?: THREE.Vector3): void => {
    const ms = SHARED.uMotionScale.value;
    const key = `${t}|${ms}|${cam ? `${cam.x},${cam.y},${cam.z}` : ''}`;
    if (key === lastKey) return;
    lastKey = key;
    poseFrames(rig, t, ms, cam);
    emitTrain(w, rig, t, ms);
    centre.set(0, 0, 0);
    for (const f of frames) centre.add(f.p);
    centre.multiplyScalar(1 / K.count);
    let rad = 0;
    for (const f of frames) rad = Math.max(rad, centre.distanceTo(f.p));
    rad += (K.tail.length + 0.6) * K.leadHeight;
    centre.sub(anchor);
    (geo.boundingSphere as THREE.Sphere).set(centre, rad);
    mesh.boundingSphere = null;
    mesh.computeBoundingSphere();
    posA.needsUpdate = true;
    norA.needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  };
  update(0);
  return { mesh, update, tris };
}

/** Centre of the train at `t` (tests / shot framing). */
export function kiteTrainCentre(world: WorldData, seed: number, t: number): THREE.Vector3 | null {
  const rig = kiteTrainRig(world, seed);
  if (!rig) return null;
  const c = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < K.count; i++) c.add(kitePosition(rig, i, t, 1, p));
  return c.multiplyScalar(1 / K.count);
}
