import * as THREE from 'three';
import { GULLS, LIFE_PLAN } from '../content/life.ts';
import { unitHash } from '../core/hash.ts';
import type { Quality } from '../core/params.ts';
import type { Rng } from '../core/rng.ts';
import { SHARED } from '../render/uniforms.ts';
import { makeLitMaterial, type LitMaterial } from '../render/materials/factory.ts';
import { AgentKind, easeInOut, rotYFor, type AgentKindOpts } from './agents.ts';
import type { LifeCtx } from './ctx.ts';
import { buildGull } from './geo/creatures.ts';

const DEG = Math.PI / 180;
const FLAP_CYCLE = GULLS.flaps * GULLS.flapPeriod + GULLS.glide;

export interface Perch {
  x: number;
  y: number;
  z: number;
}

interface Flock {
  cx: number;
  cz: number;
  radius: number;
  alt: number;
  period: number;
  dir: number;
  theta0: number;
}

const WING_GLSL = /* glsl */ `
  {
    float gCyc = ${FLAP_CYCLE.toFixed(4)};
    float gTT = mod(uTime + aPhase * gCyc, gCyc);
    float gFlapT = ${(GULLS.flaps * GULLS.flapPeriod).toFixed(4)};
    float gFlap = gTT < gFlapT ? sin(6.2831853 * gTT / ${GULLS.flapPeriod.toFixed(4)}) * 0.75 : 0.0;
    float gAng = (gFlap + 0.12) * aMode * uMotionScale;
    transformed.y += gAng * abs(position.z);
    transformed.z *= mix(0.25, 1.0, aMode);
  }
`;

/** Flock of gulls on closed-form circles; a gull can break off to perch on a dock / mooring and return. */
export class Gulls extends AgentKind {
  readonly flocks: Flock[] = [];
  readonly flockOf: Uint8Array;
  private readonly off: Float32Array;
  private readonly radJ: Float32Array;
  private readonly altJ: Float32Array;
  private readonly S: Float32Array; // start xyz
  private readonly P: Float32Array; // perch xyz
  private readonly dur: Float32Array;
  private readonly mode: Float32Array;
  private readonly modeAttr: THREE.InstancedBufferAttribute;
  private readonly perchTaken: Uint8Array;
  readonly perches: Perch[];

  constructor(
    o: Omit<AgentKindOpts, 'name' | 'capacity' | 'geometry' | 'material'>,
    private readonly ctx: LifeCtx,
    quality: Quality,
    centres: { x: number; z: number }[],
    perches: Perch[],
  ) {
    const plan = LIFE_PLAN[quality];
    const rng: Rng = ctx.rngFor('gulls');
    const nFlocks = Math.min(plan.flocks, centres.length);
    const sizes: number[] = [];
    for (let f = 0; f < nFlocks; f++)
      sizes.push(rng.int(plan.gullsPerFlock[0], plan.gullsPerFlock[1]));
    const total = Math.min(
      24,
      sizes.reduce((a, b) => a + b, 0),
    );
    const geo = buildGull();
    const aPhase = new Float32Array(total);
    const aMode = new Float32Array(total).fill(1);
    const mat = makeLitMaterial(
      { instanced: true, rim: true },
      { name: 'life:gull' },
    ) as LitMaterial;
    super({ ...o, name: 'gull', capacity: total, geometry: geo, material: mat });
    for (let i = 0; i < total; i++) aPhase[i] = this.phase[i];
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));
    this.modeAttr = new THREE.InstancedBufferAttribute(aMode, 1);
    this.modeAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aMode', this.modeAttr);
    this.mode = aMode;
    const orig = mat.onBeforeCompile.bind(mat);
    mat.onBeforeCompile = (shader, renderer) => {
      orig(shader, renderer);
      shader.uniforms.uTime = SHARED.uTime;
      shader.uniforms.uMotionScale = SHARED.uMotionScale;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float aPhase;\nattribute float aMode;',
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>' + WING_GLSL);
    };
    mat.customProgramCacheKey = (): string => 'mar-lit:gull';

    this.flockOf = new Uint8Array(total);
    this.off = new Float32Array(total);
    this.radJ = new Float32Array(total);
    this.altJ = new Float32Array(total);
    this.S = new Float32Array(total * 3);
    this.P = new Float32Array(total * 3);
    this.dur = new Float32Array(total);
    this.perches = perches;
    this.perchTaken = new Uint8Array(perches.length);
    let k = 0;
    for (let f = 0; f < nFlocks; f++) {
      const c = centres[f];
      const g = ctx.h(c.x, c.z);
      this.flocks.push({
        cx: c.x,
        cz: c.z,
        radius: rng.range(GULLS.radius[0], GULLS.radius[1]),
        alt: Math.max(rng.range(GULLS.altitude[0], GULLS.altitude[1]), g + 8),
        period: GULLS.period * (1 + (rng.next() * 2 - 1) * GULLS.periodJitter),
        dir: f % 2 === 0 ? 1 : -1,
        theta0: rng.range(0, Math.PI * 2),
      });
      for (let m = 0; m < sizes[f] && k < total; m++, k++) {
        this.flockOf[k] = f;
        this.off[k] = (unitHash(o.seed, k, 11) - 0.5) * 2 * GULLS.spread;
        this.radJ[k] = (unitHash(o.seed, k, 12) - 0.5) * 2 * GULLS.radiusJitter;
        this.altJ[k] = unitHash(o.seed, k, 13) * 1.5;
        this.active[k] = 1;
        this.orbit(k, 0);
        this.snap(k);
      }
    }
  }

  /** Closed-form orbit pose at time t; writes x/y/z/yaw/roll, returns heading through yaw. */
  private orbit(i: number, t: number): void {
    const F = this.flocks[this.flockOf[i]];
    const th = F.theta0 + (F.dir * Math.PI * 2 * t) / F.period + this.off[i];
    const r = F.radius + this.radJ[i];
    const m = this.ctx.motion.scale;
    this.x[i] = F.cx + Math.cos(th) * r;
    this.z[i] = F.cz + Math.sin(th) * r;
    this.y[i] = F.alt + this.altJ[i] + 0.9 * Math.sin(0.5 * t + this.phase[i] * 6.2831853);
    this.yaw[i] = rotYFor(-Math.sin(th) * F.dir, Math.cos(th) * F.dir);
    this.roll[i] = F.dir * GULLS.bankDeg * DEG * (0.5 + 0.5 * m);
    this.pitch[i] = 0;
    this.scale[i] = 1;
  }

  /** Ambient `gullLand`: send an orbiting gull to the nearest free perch. Returns the gull id or -1. */
  land(r: number, r2: number): number {
    const n = this.capacity;
    if (n === 0 || this.perches.length === 0) return -1;
    const start = Math.floor(r * n);
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (this.state[i] !== 0) continue;
      let best = -1;
      let bd = Infinity;
      for (let p = 0; p < this.perches.length; p++) {
        if (this.perchTaken[p]) continue;
        const q = this.perches[p];
        const d =
          Math.hypot(q.x - this.x[i], q.z - this.z[i]) * (0.8 + 0.4 * ((p * 0.618 + r2) % 1));
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best < 0) return -1;
      const q = this.perches[best];
      this.perchTaken[best] = 1;
      this.state[i] = 1;
      this.timer[i] = 0;
      this.S[i * 3] = this.x[i];
      this.S[i * 3 + 1] = this.y[i];
      this.S[i * 3 + 2] = this.z[i];
      this.P[i * 3] = q.x;
      this.P[i * 3 + 1] = q.y;
      this.P[i * 3 + 2] = q.z;
      this.dur[i] = Math.min(
        Math.max(bd / GULLS.land.speed, GULLS.land.minTime),
        GULLS.land.maxTime,
      );
      this.perchOf[i] = best;
      return i;
    }
    return -1;
  }
  private readonly perchOf = new Int16Array(32).fill(-1);

  protected override stepAgent(i: number, dt: number, t: number): void {
    const L = GULLS.land;
    const s = this.state[i];
    let target = 1;
    if (s === 0) {
      this.orbit(i, t);
    } else if (s === 1) {
      this.timer[i] += dt;
      const u = Math.min(1, this.timer[i] / this.dur[i]);
      const e = easeInOut(u);
      const px = this.P[i * 3];
      const py = this.P[i * 3 + 1];
      const pz = this.P[i * 3 + 2];
      const sx = this.S[i * 3];
      const sy = this.S[i * 3 + 1];
      const sz = this.S[i * 3 + 2];
      const nx = sx + (px - sx) * e;
      const nz = sz + (pz - sz) * e;
      const ny = sy + (py - sy) * e;
      if (u < 0.98) this.yaw[i] = rotYFor(px - this.x[i] + 1e-4, pz - this.z[i]);
      this.x[i] = nx;
      this.z[i] = nz;
      this.y[i] = ny;
      this.roll[i] *= 0.9;
      // flare: nose up over the last 20 %
      this.pitch[i] = u > 0.8 ? 0.6 * Math.sin(((u - 0.8) / 0.2) * Math.PI) : 0;
      if (u >= 1) {
        this.state[i] = 2;
        this.timer[i] = 0;
        this.dur[i] = L.sit[0] + (L.sit[1] - L.sit[0]) * unitHash(this.seed, i, 21 + this.step);
      }
    } else if (s === 2) {
      this.timer[i] += dt;
      target = 0;
      this.pitch[i] = 0;
      this.roll[i] = 0;
      const e = this.timer[i];
      this.scale[i] = 1 + (L.pulse - 1) * Math.exp(-7 * e) * Math.cos(14.2 * e);
      if (e >= this.dur[i]) {
        this.state[i] = 3;
        this.timer[i] = 0;
        this.S[i * 3] = this.x[i];
        this.S[i * 3 + 1] = this.y[i];
        this.S[i * 3 + 2] = this.z[i];
        const p = this.perchOf[i];
        if (p >= 0) this.perchTaken[p] = 0;
        this.perchOf[i] = -1;
      }
    } else {
      this.timer[i] += dt;
      const u = Math.min(1, this.timer[i] / L.takeoff);
      const e = easeInOut(u);
      const sx = this.S[i * 3];
      const sy = this.S[i * 3 + 1];
      const sz = this.S[i * 3 + 2];
      this.orbit(i, t);
      const hop = 0.6 * Math.sin(Math.min(1, u * 3) * Math.PI);
      this.x[i] = sx + (this.x[i] - sx) * e;
      this.z[i] = sz + (this.z[i] - sz) * e;
      this.y[i] = sy + (this.y[i] - sy) * e + hop;
      this.roll[i] *= e;
      this.scale[i] = 1;
      if (u >= 1) this.state[i] = 0;
    }
    const m = this.mode[i];
    this.mode[i] = m + (target - m) * (1 - Math.exp(-6 * dt));
  }

  override update(alpha: number): void {
    this.modeAttr.needsUpdate = true;
    super.update(alpha);
  }
}

/** Flock centres from island anchors (`harbour`, `peak`, `lighthouse`, else centre), one per island first. */
export function flockCentres(ctx: LifeCtx, rng: Rng): { x: number; z: number }[] {
  const first: { x: number; z: number }[] = [];
  const rest: { x: number; z: number }[] = [];
  for (const isl of ctx.world.islands) {
    const c: { x: number; z: number }[] = [];
    for (const k of ['harbour', 'peak', 'lighthouse']) {
      const a = isl.anchors[k];
      if (a) c.push({ x: a.x, z: a.z });
    }
    if (c.length === 0) c.push({ x: isl.cx, z: isl.cz });
    rng.shuffle(c);
    first.push(c[0]);
    for (let k = 1; k < c.length; k++) rest.push(c[k]);
  }
  rng.shuffle(first);
  rng.shuffle(rest);
  return [...first, ...rest];
}
