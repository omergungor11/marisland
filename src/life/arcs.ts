import type * as THREE from 'three';
import { ARCS, LIFE_COLORS } from '../content/life.ts';
import type { Rng } from '../core/rng.ts';
import { sampleGrid, Zone } from '../world/types.ts';
import { swellY } from '../shared/fields.ts';
import { AgentKind, rotYFor, type AgentKindOpts } from './agents.ts';
import { litCreatureMaterial } from './boats.ts';
import type { LifeCtx } from './ctx.ts';
import { fishGeometry } from './fish.ts';
import { buildFish } from './geo/creatures.ts';

export interface ArcCfg {
  height: number;
  length: number;
  duration: number;
  spin: number;
  scale: number;
  splash: { radius: number; strength: number };
  /** Arcs per trigger and the underwater gap between them (s). */
  arcs: number;
  gap: number;
}

/** Parabolic leaps: fish jumps (1 arc, 360° spin) and dolphin pairs (3 arcs). Closed-form per arc. */
export class ArcKind extends AgentKind {
  private readonly x0: Float32Array;
  private readonly z0: Float32Array;
  private readonly dx: Float32Array;
  private readonly dz: Float32Array;
  private readonly left: Uint8Array;
  private readonly delay: Float32Array;
  /** Jumps started so far (for tests / stats). */
  started = 0;

  constructor(
    o: Omit<AgentKindOpts, 'name' | 'capacity' | 'geometry' | 'material'> & {
      geometry?: THREE.BufferGeometry;
    },
    private readonly ctx: LifeCtx,
    name: string,
    capacity: number,
    private readonly cfg: ArcCfg,
  ) {
    super({
      ...o,
      name,
      capacity,
      geometry: o.geometry ?? fishGeometry(),
      material: litCreatureMaterial(`life:${name}`),
    });
    this.x0 = new Float32Array(capacity);
    this.z0 = new Float32Array(capacity);
    this.dx = new Float32Array(capacity);
    this.dz = new Float32Array(capacity);
    this.left = new Uint8Array(capacity);
    this.delay = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.scale[i] = 0;
      this.pscale[i] = 0;
    }
  }

  /** Start an arc sequence at (x, z) heading along (dx, dz) after `delay` s. Returns the slot or -1. */
  trigger(x: number, z: number, dx: number, dz: number, delay = 0): number {
    for (let i = 0; i < this.capacity; i++) {
      if (this.active[i]) continue;
      const l = Math.hypot(dx, dz) || 1;
      this.x0[i] = x;
      this.z0[i] = z;
      this.dx[i] = dx / l;
      this.dz[i] = dz / l;
      this.left[i] = this.cfg.arcs;
      this.delay[i] = delay;
      this.state[i] = 1;
      this.timer[i] = 0;
      this.active[i] = 1;
      this.scale[i] = 0;
      this.pose(i, 0, this.simT);
      this.snap(i);
      this.started++;
      return i;
    }
    return -1;
  }

  private pose(i: number, u: number, t: number): void {
    const c = this.cfg;
    const x = this.x0[i] + this.dx[i] * c.length * u;
    const z = this.z0[i] + this.dz[i] * c.length * u;
    this.x[i] = x;
    this.z[i] = z;
    this.y[i] =
      swellY(x, z, t, this.ctx.swell) + c.height * 4 * u * (1 - u) * this.ctx.motion.scale;
    this.yaw[i] = rotYFor(this.dx[i], this.dz[i]);
    this.pitch[i] = Math.atan((c.height * 4 * (1 - 2 * u) * this.ctx.motion.scale) / c.length);
    this.roll[i] = c.spin * Math.PI * 2 * u;
    const stretch = 1 + 0.12 * Math.sin(Math.PI * u);
    this.sx[i] = stretch;
    this.sy[i] = this.sz[i] = 1 / Math.sqrt(stretch);
  }

  protected stepAgent(i: number, dt: number, t: number): void {
    const c = this.cfg;
    const sp = c.splash;
    if (this.state[i] === 1) {
      this.delay[i] -= dt;
      this.scale[i] = 0;
      if (this.delay[i] > 0) return;
      this.state[i] = 2;
      this.timer[i] = 0;
      this.scale[i] = c.scale;
      this.ctx.water.splat(this.x0[i], this.z0[i], sp.radius, sp.strength * 0.6);
    }
    this.timer[i] += dt;
    const u = Math.min(1, this.timer[i] / c.duration);
    this.pose(i, u, t);
    if (u < 1) return;
    const ex = this.x0[i] + this.dx[i] * c.length;
    const ez = this.z0[i] + this.dz[i] * c.length;
    this.ctx.water.splat(ex, ez, sp.radius, sp.strength);
    if (--this.left[i] > 0) {
      const gapLen = (c.length / c.duration) * c.gap;
      this.x0[i] = ex + this.dx[i] * gapLen;
      this.z0[i] = ez + this.dz[i] * gapLen;
      this.state[i] = 1;
      this.delay[i] = c.gap;
      this.scale[i] = 0;
    } else {
      this.active[i] = 0;
      this.state[i] = 0;
      this.scale[i] = 0;
    }
  }
}

export function dolphinGeometry(): THREE.BufferGeometry {
  return buildFish(LIFE_COLORS.dolphinTop, LIFE_COLORS.dolphinBelly, 0.6);
}

export const fishArcCfg: ArcCfg = { ...ARCS.fish, arcs: 1, gap: 0 };
export const dolphinArcCfg: ArcCfg = {
  height: ARCS.dolphin.height,
  length: ARCS.dolphin.length,
  duration: ARCS.dolphin.duration,
  spin: 0,
  scale: ARCS.dolphin.scale,
  splash: ARCS.dolphin.splash,
  arcs: ARCS.dolphin.arcs,
  gap: ARCS.dolphin.gap,
};

const wetDepth = (ctx: LifeCtx, x: number, z: number): number => -ctx.h(x, z);

/** A coastal spot for a fish jump within `fishRadius` of the camera, or null. */
export function pickJumpSpot(
  ctx: LifeCtx,
  rng: Rng,
  r: number,
): { x: number; z: number; dx: number; dz: number } | null {
  const cam = ctx.cameraPos;
  const ang0 = r * Math.PI * 2;
  for (let k = 0; k < 24; k++) {
    const a = rng.range(0, Math.PI * 2);
    const d = ARCS.fishRadius * Math.sqrt(rng.next());
    const x = cam.x + Math.cos(a) * d;
    const z = cam.z + Math.sin(a) * d;
    const zone = ctx.zone(x, z);
    if (zone !== Zone.shallow && zone !== Zone.lagoon && zone !== Zone.mid) continue;
    const sdf = sampleGrid(ctx.world.height, ctx.world.shoreSdf, x, z, -100);
    if (sdf > -1.5 || sdf < -14 || wetDepth(ctx, x, z) < 0.8) continue;
    const ha = ang0 + k * 0.7;
    const dx = Math.cos(ha);
    const dz = Math.sin(ha);
    if (wetDepth(ctx, x + dx * ARCS.fish.length, z + dz * ARCS.fish.length) < 0.6) continue;
    return { x, z, dx, dz };
  }
  return null;
}

/** Open water (deep/mid) within `dolphinRadius` of the camera with room for the whole run. */
export function pickDolphinSpot(
  ctx: LifeCtx,
  rng: Rng,
  r: number,
): { x: number; z: number; dx: number; dz: number } | null {
  const cam = ctx.cameraPos;
  const run = ARCS.dolphin.arcs * (ARCS.dolphin.length + 2) + ARCS.dolphin.pairOffset;
  for (let k = 0; k < 24; k++) {
    const a = rng.range(0, Math.PI * 2);
    const d = ARCS.dolphinRadius * Math.sqrt(rng.next());
    const x = cam.x + Math.cos(a) * d;
    const z = cam.z + Math.sin(a) * d;
    const ha = r * Math.PI * 2 + k * 0.9;
    const dx = Math.cos(ha);
    const dz = Math.sin(ha);
    const ok = (px: number, pz: number): boolean => {
      const zn = ctx.zone(px, pz);
      return zn === Zone.deep || zn === Zone.mid;
    };
    if (ok(x, z) && ok(x + dx * run * 0.5, z + dz * run * 0.5) && ok(x + dx * run, z + dz * run))
      return { x, z, dx, dz };
  }
  return null;
}
