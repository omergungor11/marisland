import * as THREE from 'three';
import { FIXED_STEP } from '../core/clock.ts';
import type { Rng } from '../core/rng.ts';
import { createRng } from '../core/rng.ts';
import { unitHash } from '../core/hash.ts';
import type { Scope } from '../core/scope.ts';
import { SIM_LOD } from '../content/life.ts';

export interface AgentKindOpts {
  name: string;
  seed: number;
  capacity: number;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  scope: Scope;
  group: THREE.Group;
  /** Live camera position (read-only) for sim LOD. */
  cameraPos: THREE.Vector3;
  /** Register the geometry in the scope too (set false when several kinds share one). */
  ownsGeometry?: boolean;
}

export const wrapAngle = (a: number): number => {
  const t = (a + Math.PI) % (2 * Math.PI);
  return (t < 0 ? t + 2 * Math.PI : t) - Math.PI;
};
/** Internal rotY (about +y) that points a +x-forward model along world (dx, dz). */
export const rotYFor = (dx: number, dz: number): number => Math.atan2(-dz, dx);
export const easeInOut = (u: number): number => u * u * (3 - 2 * u);

const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YZX');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * Pooled agent kind: SoA state + one InstancedMesh (ARCHITECTURE §5). Subclasses implement
 * `stepAgent` (30 Hz, or every `farEvery`-th step beyond `farDistance`); `update` writes
 * matrices interpolated prev → cur. Model convention: forward +x, up +y, right +z, rotation order
 * YZX (yaw, pitch about z, roll about x).
 */
export abstract class AgentKind {
  readonly name: string;
  readonly capacity: number;
  readonly mesh: THREE.InstancedMesh;
  readonly rng: Rng;
  readonly seed: number;
  // current state
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly yaw: Float32Array;
  readonly roll: Float32Array;
  readonly pitch: Float32Array;
  readonly scale: Float32Array;
  // squash & stretch multipliers (local x, y, z), volume is the behaviour's business
  readonly sx: Float32Array;
  readonly sy: Float32Array;
  readonly sz: Float32Array;
  // previous (interpolation)
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly pyaw: Float32Array;
  readonly proll: Float32Array;
  readonly ppitch: Float32Array;
  readonly pscale: Float32Array;
  readonly phase: Float32Array;
  /**
   * Reaction overlay (TASK-162): written by the interact layer, applied on top of the simulated
   * pose in `update`. Defaults are the identity.
   */
  readonly ovY: Float32Array;
  readonly ovYaw: Float32Array;
  readonly ovRoll: Float32Array;
  readonly ovSx: Float32Array;
  readonly ovSy: Float32Array;
  readonly ovSz: Float32Array;
  /** Seconds a reaction still freezes the behaviour of agent i (critters stop and let the overlay play). */
  readonly hold: Float32Array;
  readonly state: Uint8Array;
  readonly timer: Float32Array;
  /** 1 = counted and drawn. */
  readonly active: Uint8Array;
  /** Fixed steps taken so far. */
  step = 0;
  /** Simulation time (s) of the last fixed step. */
  simT = 0;
  /** Reduced motion: ambient amplitude multiplier. */
  motionScale = 1;
  private readonly camera: THREE.Vector3;

  constructor(o: AgentKindOpts) {
    this.name = o.name;
    this.seed = o.seed;
    this.capacity = o.capacity;
    this.camera = o.cameraPos;
    this.rng = createRng(o.seed).fork('life').fork(o.name);
    const n = o.capacity;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.yaw = new Float32Array(n);
    this.roll = new Float32Array(n);
    this.pitch = new Float32Array(n);
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.pyaw = new Float32Array(n);
    this.proll = new Float32Array(n);
    this.ppitch = new Float32Array(n);
    this.scale = new Float32Array(n).fill(1);
    this.pscale = new Float32Array(n).fill(1);
    this.sx = new Float32Array(n).fill(1);
    this.sy = new Float32Array(n).fill(1);
    this.sz = new Float32Array(n).fill(1);
    this.phase = new Float32Array(n);
    this.ovY = new Float32Array(n);
    this.ovYaw = new Float32Array(n);
    this.ovRoll = new Float32Array(n);
    this.ovSx = new Float32Array(n).fill(1);
    this.ovSy = new Float32Array(n).fill(1);
    this.ovSz = new Float32Array(n).fill(1);
    this.hold = new Float32Array(n);
    this.timer = new Float32Array(n);
    this.state = new Uint8Array(n);
    this.active = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.phase[i] = unitHash(o.seed, i, hashName(o.name));
    this.mesh = new THREE.InstancedMesh(o.geometry, o.material, n);
    this.mesh.name = `life:${o.name}`;
    this.mesh.count = 0;
    this.mesh.frustumCulled = true;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    o.group.add(this.mesh);
    if (o.ownsGeometry !== false) o.scope.add(o.geometry);
    o.scope.add(o.material);
    o.scope.add(this.mesh);
  }

  /** Reset the reaction overlay of agent i. */
  clearOverlay(i: number): void {
    this.ovY[i] = 0;
    this.ovYaw[i] = 0;
    this.ovRoll[i] = 0;
    this.ovSx[i] = 1;
    this.ovSy[i] = 1;
    this.ovSz[i] = 1;
  }

  /** Pick-sphere centre (world) for agent i. */
  pickCenter(i: number, out: { x: number; y: number; z: number }, dy: number): void {
    out.x = this.x[i];
    out.y = this.y[i] + this.ovY[i] + dy;
    out.z = this.z[i];
  }

  /** Number of active agents. */
  get liveCount(): number {
    let c = 0;
    for (let i = 0; i < this.capacity; i++) c += this.active[i];
    return c;
  }

  /** Behaviour for agent `i`; `dt` is 1/30 s, or `farEvery`/30 s for far (low-rate) agents. */
  protected abstract stepAgent(i: number, dt: number, t: number): void;
  /** Called once per fixed step before the agent loop (flock-level logic, spawning). */
  protected beginStep(_dt: number, _t: number): void {}

  /** Snap interpolation history to the current state (after spawning / teleporting). */
  snap(i: number): void {
    this.px[i] = this.x[i];
    this.py[i] = this.y[i];
    this.pz[i] = this.z[i];
    this.pyaw[i] = this.yaw[i];
    this.proll[i] = this.roll[i];
    this.ppitch[i] = this.pitch[i];
    this.pscale[i] = this.scale[i];
  }

  isFar(i: number): boolean {
    const dx = this.x[i] - this.camera.x;
    const dz = this.z[i] - this.camera.z;
    return dx * dx + dz * dz > SIM_LOD.farDistance * SIM_LOD.farDistance;
  }

  fixedUpdate(dt: number = FIXED_STEP): void {
    this.step++;
    this.simT = this.step * dt;
    this.beginStep(dt, this.simT);
    const every = SIM_LOD.farEvery;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      this.snap(i);
      if (this.isFar(i) && (this.step + i) % every !== 0) continue;
      this.stepAgent(i, this.isFar(i) ? dt * every : dt, this.simT);
    }
  }

  /** Write interpolated matrices. */
  update(alpha: number): void {
    const a = Math.min(Math.max(alpha, 0), 1);
    let top = 0;
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) {
        _m.makeScale(0, 0, 0);
        _m.setPosition(this.x[i], this.y[i], this.z[i]);
        _m.toArray(arr, i * 16);
        continue;
      }
      top = i + 1;
      _p.set(
        this.px[i] + (this.x[i] - this.px[i]) * a,
        this.py[i] + (this.y[i] - this.py[i]) * a + this.ovY[i],
        this.pz[i] + (this.z[i] - this.pz[i]) * a,
      );
      const yaw = this.pyaw[i] + wrapAngle(this.yaw[i] - this.pyaw[i]) * a + this.ovYaw[i];
      const roll = this.proll[i] + (this.roll[i] - this.proll[i]) * a + this.ovRoll[i];
      const pitch = this.ppitch[i] + (this.pitch[i] - this.ppitch[i]) * a;
      const sc = this.pscale[i] + (this.scale[i] - this.pscale[i]) * a;
      _e.set(roll, yaw, pitch, 'YZX');
      _q.setFromEuler(_e);
      _s.set(
        sc * this.sx[i] * this.ovSx[i],
        sc * this.sy[i] * this.ovSy[i],
        sc * this.sz[i] * this.ovSz[i],
      );
      _m.compose(_p, _q, _s);
      _m.toArray(arr, i * 16);
    }
    this.mesh.count = top;
    this.mesh.visible = top > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (top > 0) this.mesh.computeBoundingSphere();
  }
}

function hashName(name: string): number {
  let h = 17;
  for (let i = 0; i < name.length; i++) h = (Math.imul(h, 31) + name.charCodeAt(i)) | 0;
  return h;
}
