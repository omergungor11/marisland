import * as THREE from 'three';
import { SAILBOAT } from '../content/life.ts';
import { unitHash } from '../core/hash.ts';
import { FIXED_STEP } from '../core/clock.ts';
import { swellY } from '../shared/fields.ts';
import { AgentKind, type AgentKindOpts } from './agents.ts';
import type { LifeCtx } from './ctx.ts';
import { makeLifeMaterial } from './life-material.ts';

/** Dot pairs a boat can have alive at once (full speed, one stamp per `spacing` u, `life` s each). */
export const WAKE_PAIRS =
  Math.ceil((SAILBOAT.wake.life * SAILBOAT.speed) / SAILBOAT.wake.spacing) + 2;

/** Vertex gain > 1: the lit disc stays white under a golden-hour sun instead of taking its tint. */
const FOAM_GAIN = 1.7;

/** Flat 8-gon foam disc (normal +y, radius 1) on the shared creature program, glyph 0 (see life-material). */
function foamDiscGeometry(): THREE.BufferGeometry {
  const seg = 8;
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const limb: number[] = [];
  const ring = (i: number): [number, number] => {
    const a = (i / seg) * Math.PI * 2;
    return [Math.cos(a), -Math.sin(a)]; // -sin keeps the winding counter-clockwise seen from +y
  };
  for (let i = 0; i < seg; i++) {
    const [x0, z0] = ring(i);
    const [x1, z1] = ring(i + 1);
    for (const [x, z] of [
      [0, 0],
      [x0, z0],
      [x1, z1],
    ]) {
      pos.push(x, 0, z);
      nrm.push(0, 1, 0);
      col.push(FOAM_GAIN, FOAM_GAIN, FOAM_GAIN);
      limb.push(0, 0, 0, 6);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('limb', new THREE.Float32BufferAttribute(limb, 4));
  return g;
}

/**
 * The sailboats' foam wake: a short V of small foam discs behind each hull (ART_BIBLE #4 "foam-dot
 * V-wake"). Dot pairs are stamped by the boat as it travels (`stamp`), live in a per-boat ring, and
 * are posed at render rate from the sim clock: they sit still on the water (riding the swell), drift
 * apart and shrink to nothing within `SAILBOAT.wake.life`. One InstancedMesh on the shared creature
 * program: no new program, one draw call, count 0 when nothing is alive. Not an agent.
 */
export class WakeFoam extends AgentKind {
  private readonly boats: number;
  /** Per boat ring: x, z (stern point), nx, nz (unit across-track), t0 (-1e9 = empty), size. */
  private readonly dx: Float32Array;
  private readonly dz: Float32Array;
  private readonly nx: Float32Array;
  private readonly nz: Float32Array;
  private readonly t0: Float32Array;
  private readonly dr: Float32Array;
  private readonly head: Int32Array;
  private seq = 0;
  /** Dots drawn last frame (tests / debug). */
  shown = 0;
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();

  constructor(
    o: Omit<AgentKindOpts, 'name' | 'capacity' | 'geometry' | 'material'>,
    private readonly ctx: LifeCtx,
    boats: number,
  ) {
    super({
      ...o,
      name: 'wake',
      capacity: boats * WAKE_PAIRS * 2,
      geometry: foamDiscGeometry(),
      material: makeLifeMaterial('life:wake', false),
    });
    this.boats = boats;
    const n = boats * WAKE_PAIRS;
    this.dx = new Float32Array(n);
    this.dz = new Float32Array(n);
    this.nx = new Float32Array(n);
    this.nz = new Float32Array(n);
    this.t0 = new Float32Array(n).fill(-1e9);
    this.dr = new Float32Array(n);
    this.head = new Int32Array(boats);
    this.mesh.frustumCulled = false;
    // an instanceColor attribute keeps the program parameters identical to the land critters'
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < this.capacity; i++) this.mesh.setColorAt(i, white);
    this.mesh.visible = false;
  }

  /** Lay one dot pair for boat `b`: stern point (x, z), unit across-track (nx, nz), sim time `t`. */
  stamp(b: number, x: number, z: number, nx: number, nz: number, t: number): void {
    const k = b * WAKE_PAIRS + this.head[b];
    this.head[b] = (this.head[b] + 1) % WAKE_PAIRS;
    const W = SAILBOAT.wake;
    this.dx[k] = x;
    this.dz[k] = z;
    this.nx[k] = nx;
    this.nz[k] = nz;
    this.t0[k] = t;
    this.dr[k] = W.radius * (1 + W.jitter * (unitHash(this.seed, this.seq++, 0x3a4e) * 2 - 1));
  }

  /** Stamps currently alive at sim time `t` (tests / debug). */
  alive(t: number): number {
    let n = 0;
    for (let k = 0; k < this.t0.length; k++) {
      const a = t - this.t0[k];
      if (a >= 0 && a < SAILBOAT.wake.life) n++;
    }
    return n;
  }

  /** Dot radius × disc scale at age `a` s: pops in over `pop` of the life, then shrinks to 0. */
  static scaleAt(a: number): number {
    const W = SAILBOAT.wake;
    const u = a / W.life;
    if (u <= 0 || u >= 1) return 0;
    return Math.min(1, u / W.pop) * (1 - u);
  }

  /** Current offset of an arm from the track centre-line at age `a` s. */
  static armAt(a: number): number {
    return SAILBOAT.wake.side + SAILBOAT.wake.spread * a;
  }

  override update(alpha: number): void {
    const a = Math.min(Math.max(alpha, 0), 1);
    const t = this.simT - (1 - a) * FIXED_STEP;
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    const W = SAILBOAT.wake;
    let top = 0;
    let n = 0;
    const visible = this.ctx.getTier() >= W.minTier;
    for (let k = 0; visible && k < this.t0.length; k++) {
      const age = t - this.t0[k];
      const sc = WakeFoam.scaleAt(age);
      if (sc <= 0.01) continue;
      const arm = WakeFoam.armAt(age);
      for (const side of [-1, 1]) {
        const px = this.dx[k] + this.nx[k] * arm * side;
        const pz = this.dz[k] + this.nz[k] * arm * side;
        const r = this.dr[k] * sc;
        this.p.set(px, swellY(px, pz, t, this.ctx.swell) + W.lift, pz);
        this.s.set(r, r, r);
        this.m.compose(this.p, this.q, this.s);
        this.m.toArray(arr, n * 16);
        n++;
      }
      top = n;
    }
    this.shown = top;
    this.mesh.count = top;
    this.mesh.visible = top > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (top > 0) this.mesh.computeBoundingSphere();
  }

  protected stepAgent(): void {}

  get boatCount(): number {
    return this.boats;
  }
}
