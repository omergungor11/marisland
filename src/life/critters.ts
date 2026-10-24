import * as THREE from 'three';
import { BUTTERFLIES, DUCKS } from '../content/life-critters.ts';
import {
  LADYBUGS,
  SPOT_CRITTERS,
  SPOT_LIFE,
  type SpotCritter,
  type SpotSpecies,
} from '../content/life-spot-critters.ts';
import type { LifePlan } from '../content/life.ts';
import { PROP_DEFS } from '../content/props.ts';
import { unitHash } from '../core/hash.ts';
import type { Rng } from '../core/rng.ts';
import { SHARED } from '../render/uniforms.ts';
import { lotLocalToWorld } from '../world/lot-frame.ts';
import { AgentKind, rotYFor, type AgentKindOpts } from './agents.ts';
import type { LifeCtx } from './ctx.ts';
import {
  buildButterfly,
  buildCapybara,
  buildDuck,
  buildFox,
  buildOwl,
  buildPerched,
  buildSeal,
} from './geo/critters.ts';
import { buildCat, buildCrab } from './geo/land.ts';
import { LandKind, type LandOpts } from './land.ts';
import { makeLifeMaterial } from './life-material.ts';

/**
 * First-wave theme creatures (TASK-332): ducks on the Coding reflecting pool (agents, the land
 * critters' program + bloom-in) and day butterflies over the Design flowers (particles, one draw).
 * Every pose is a closed form of the engine clock (`uTime`) written at render rate, so
 * `?freeze=1&time=…` freezes them and the picture is reproducible.
 */

const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (r: readonly [number, number], u: number): number => r[0] + (r[1] - r[0]) * u;

// ---------------------------------------------------------------------------
// Pool

export interface Pool {
  x: number;
  z: number;
  /** Unit long axis (xz) and half extents along it and across it, u. */
  ax: number;
  az: number;
  hw: number;
  hd: number;
  /** Ground height at the centre (the pools are flat). */
  y: number;
}

/**
 * Reflecting pools of the Coding campus: the four corner kerbs (variant 1) of each pool are the
 * corners of its rectangle, so centre, long axis and half extents come straight from them.
 */
export function findPools(ctx: LifeCtx): Pool[] {
  const corners = (ctx.world.fixtures ?? []).filter(
    (f) => f.defId === 'reflectingPoolEdge' && f.variant === 1,
  );
  const used = new Uint8Array(corners.length);
  const out: Pool[] = [];
  for (let i = 0; i < corners.length; i++) {
    if (used[i]) continue;
    const grp = [i];
    for (let j = i + 1; j < corners.length; j++)
      if (
        !used[j] &&
        corners[j].islandId === corners[i].islandId &&
        Math.hypot(corners[j].x - corners[i].x, corners[j].z - corners[i].z) < 6.8
      )
        grp.push(j);
    if (grp.length !== 4) continue;
    for (const g of grp) used[g] = 1;
    let cx = 0;
    let cz = 0;
    for (const g of grp) {
      cx += corners[g].x / 4;
      cz += corners[g].z / 4;
    }
    // principal axis of the four corners (a rectangle: the long side wins)
    let sxx = 0;
    let szz = 0;
    let sxz = 0;
    for (const g of grp) {
      const dx = corners[g].x - cx;
      const dz = corners[g].z - cz;
      sxx += dx * dx;
      szz += dz * dz;
      sxz += dx * dz;
    }
    const th = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    const ax = Math.cos(th);
    const az = Math.sin(th);
    let hw = 0;
    let hd = 0;
    for (const g of grp) {
      const dx = corners[g].x - cx;
      const dz = corners[g].z - cz;
      hw = Math.max(hw, Math.abs(dx * ax + dz * az));
      hd = Math.max(hd, Math.abs(-dx * az + dz * ax));
    }
    out.push({ x: cx, z: cz, ax, az, hw, hd, y: ctx.h(cx, cz) });
  }
  // stable order: by x, then z
  return out.sort((a, b) => a.x - b.x || a.z - b.z);
}

// ---------------------------------------------------------------------------
// Ducks

/** Duck family on one reflecting pool: mother first, ducklings in her wake (follow-chain). */
export class Ducks extends LandKind {
  private readonly leadPhase: number;
  private readonly dir: number;
  private readonly dabblePeriod: Float32Array;
  private readonly dabbleOff: Float32Array;

  constructor(
    o: LandOpts,
    ctx: LifeCtx,
    readonly pool: Pool,
    count: number,
  ) {
    super(o, ctx, 'duck', count, buildDuck(), false, DUCKS.minTier, [DUCKS.tints.duckling], {
      radius: DUCKS.pickRadius,
      height: DUCKS.pickHeight,
      size: DUCKS.size,
    });
    this.leadPhase = unitHash(o.seed, 0, 0xd0c4) * TAU;
    this.dir = unitHash(o.seed, 1, 0xd0c4) < 0.5 ? 1 : -1;
    this.dabblePeriod = new Float32Array(count);
    this.dabbleOff = new Float32Array(count);
    const mother = new THREE.Color(DUCKS.tints.mother);
    for (let i = 0; i < count; i++) {
      this.dabblePeriod[i] = DUCKS.dabble[0] * (0.8 + 0.4 * unitHash(o.seed, i, 0xd0c5));
      this.dabbleOff[i] = unitHash(o.seed, i, 0xd0c6);
      const k = i === 0 ? 1 : DUCKS.duckling;
      this.sx[i] = this.sy[i] = this.sz[i] = k;
      if (i === 0) this.mesh.setColorAt(i, mother);
      this.gMove[i] = 1;
      this.spawned[i] = 1;
      this.pose(i, 0);
      this.snap(i);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Orbit point of duck `i` at clock `t` (also the heading source: forward difference). */
  orbit(i: number, t: number, out: { x: number; z: number }): void {
    const D = DUCKS;
    const a = this.pool.hw * D.orbit[0];
    const b = this.pool.hd * D.orbit[1];
    const calm = 0.4 + 0.6 * this.motionScale;
    const w = ((D.speed * calm) / ((a + b) / 2)) * this.dir;
    const th = w * t + this.leadPhase - i * D.follow * this.dir;
    const r = 1 + D.wobble * Math.sin(th * D.wobbleRate);
    const u = Math.cos(th) * a * r;
    const v = Math.sin(th) * b * r;
    out.x = this.pool.x + u * this.pool.ax - v * this.pool.az;
    out.z = this.pool.z + u * this.pool.az + v * this.pool.ax;
  }

  private readonly p0 = { x: 0, z: 0 };
  private readonly p1 = { x: 0, z: 0 };

  private pose(i: number, t: number): void {
    const D = DUCKS;
    const m = this.motionScale;
    this.orbit(i, t, this.p0);
    this.orbit(i, t + 0.1, this.p1);
    this.x[i] = this.p0.x;
    this.z[i] = this.p0.z;
    this.yaw[i] = rotYFor(this.p1.x - this.p0.x, this.p1.z - this.p0.z);
    const bob = Math.sin(TAU * (t / D.paddle - i * D.bobLag));
    this.y[i] = this.pool.y + D.surface + bob * D.bobAmp * m;
    this.roll[i] = bob * D.rollAmp * m;
    // dabble: head dips for `dabble[1]` s once per (jittered) period
    const u =
      (((t / this.dabblePeriod[i] + this.dabbleOff[i]) % 1) * this.dabblePeriod[i]) / D.dabble[1];
    this.gPose[i] = u < 1 ? Math.sin(Math.PI * u) ** 2 : 0;
    this.setGait(i);
  }

  protected stepAgent(): void {}

  override update(alpha: number): void {
    const t = SHARED.uTime.value as number;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      this.pose(i, t);
      this.snap(i);
    }
    super.update(alpha);
  }
}

// ---------------------------------------------------------------------------
// Butterflies

export interface FlowerSite {
  island: number;
  x: number;
  z: number;
}

/** Flower patches of the Design islands: the densest flower-prop neighbourhoods, spread apart. */
export function planFlowerSites(ctx: LifeCtx, count: number, rng: Rng): FlowerSite[] {
  const P = ctx.world.props;
  if (!P || count <= 0) return [];
  const B = BUTTERFLIES;
  const flowerDef = PROP_DEFS.findIndex((d) => d.id === 'flower');
  const fx: number[] = [];
  const fz: number[] = [];
  const fi: number[] = [];
  for (let i = 0; i < P.count; i++) {
    if (P.defId[i] !== flowerDef) continue;
    const isl = ctx.world.islands[P.islandId[i]];
    if (!isl || isl.theme !== 'design') continue;
    fx.push(P.x[i]);
    fz.push(P.z[i]);
    fi.push(P.islandId[i]);
  }
  const order = rng.shuffle(fx.map((_, i) => i)).slice(0, B.candidates);
  const near = new Map<number, number>();
  for (const c of order) {
    let n = 0;
    for (let j = 0; j < fx.length; j++)
      if (Math.hypot(fx[j] - fx[c], fz[j] - fz[c]) < B.siteRadius) n++;
    near.set(c, n);
  }
  order.sort((a, b) => (near.get(b) as number) - (near.get(a) as number) || a - b);
  const sites: FlowerSite[] = [];
  const want = Math.ceil(count / B.perSite);
  for (const c of order) {
    if (sites.length >= want || (near.get(c) as number) < B.minFlowers) break;
    if (sites.some((s) => Math.hypot(s.x - fx[c], s.z - fz[c]) < B.minSeparation)) continue;
    sites.push({ island: fi[c], x: fx[c], z: fz[c] });
  }
  return sites;
}

/**
 * Day butterflies: one InstancedMesh on the shared creature program, figure-8 flights over flower
 * patches. Not an agent (never counted or picked); hidden (count 0) at night and below
 * `BUTTERFLIES.minTier`. Wing beat = squash of the span (`scale.z`) at `flapHz`, desynchronised
 * per butterfly.
 */
export interface FlightCfg {
  readonly minTier: number;
  readonly day: readonly [number, number];
  readonly size: number;
  readonly extentX: readonly [number, number];
  readonly extentZ: readonly [number, number];
  readonly period: readonly [number, number];
  readonly height: readonly [number, number];
  readonly drift: readonly [number, number];
  readonly bob: number;
  readonly flapHz: readonly [number, number];
  readonly flapMin: number;
  readonly calmFlap: number;
  readonly tints: readonly string[];
  readonly bank: number;
}

/**
 * Day butterflies: one InstancedMesh on the shared creature program, figure-8 flights over flower
 * patches. Not an agent (never counted or picked); hidden (count 0) at night and below
 * `BUTTERFLIES.minTier`. Wing beat = squash of the span (`scale.z`) at `flapHz`, desynchronised
 * per butterfly. TASK-433: the same class flies the QA ladybugs (red, low, small: `LADYBUGS`).
 */
export class Butterflies extends AgentKind {
  private readonly B: FlightCfg;
  private readonly cx: Float32Array;
  private readonly cz: Float32Array;
  private readonly ex: Float32Array;
  private readonly ez: Float32Array;
  private readonly ca: Float32Array;
  private readonly sa: Float32Array;
  private readonly w: Float32Array;
  private readonly ph: Float32Array;
  private readonly lift: Float32Array;
  private readonly hz: Float32Array;
  private readonly dph: Float32Array;
  /** Daylight factor of the last frame and how many instances are drawn (tests / debug). */
  day = 0;
  shown = 0;
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YZX');
  private readonly pt = { x: 0, y: 0, z: 0 };
  private readonly pn = { x: 0, y: 0, z: 0 };

  constructor(
    o: Omit<AgentKindOpts, 'name' | 'capacity' | 'geometry' | 'material'>,
    private readonly ctx: LifeCtx,
    sites: FlowerSite[],
    count: number,
    cfg: FlightCfg = BUTTERFLIES,
    name = 'butterflies',
  ) {
    super({
      ...o,
      name,
      capacity: sites.length > 0 ? count : 0,
      geometry: buildButterfly(),
      material: makeLifeMaterial(`life:${name}`, false),
    });
    const B = cfg;
    this.B = cfg;
    const n = this.capacity;
    const f32 = (): Float32Array => new Float32Array(n);
    this.cx = f32();
    this.cz = f32();
    this.ex = f32();
    this.ez = f32();
    this.ca = f32();
    this.sa = f32();
    this.w = f32();
    this.ph = f32();
    this.lift = f32();
    this.hz = f32();
    this.dph = f32();
    const h = (i: number, k: number): number => unitHash(o.seed, i, 0xb077 + k);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const site = sites[i % sites.length];
      this.cx[i] = site.x;
      this.cz[i] = site.z;
      this.ex[i] = lerp(B.extentX, h(i, 0));
      this.ez[i] = lerp(B.extentZ, h(i, 1));
      const psi = h(i, 2) * TAU;
      this.ca[i] = Math.cos(psi);
      this.sa[i] = Math.sin(psi);
      this.w[i] = TAU / lerp(B.period, h(i, 3));
      this.ph[i] = h(i, 4) * TAU;
      this.lift[i] = lerp(B.height, h(i, 5));
      this.hz[i] = lerp(B.flapHz, h(i, 6));
      this.dph[i] = h(i, 7) * TAU;
      col.set(B.tints[Math.floor(h(i, 8) * B.tints.length) % B.tints.length]);
      this.mesh.setColorAt(i, col);
    }
    this.mesh.frustumCulled = false;
    this.render(0, 0); // hidden until day / tier
  }

  /** No simulation: poses come from the clock in `update`. */
  override fixedUpdate(): void {}

  /** Daylight 1 → 0 across `BUTTERFLIES.day` of `night`. */
  static dayOf(night: number, cfg: FlightCfg = BUTTERFLIES): number {
    return 1 - smooth(cfg.day[0], cfg.day[1], night);
  }

  override update(_alpha: number): void {
    const night = SHARED.uNight.value as number;
    const day = this.ctx.getTier() >= this.B.minTier ? Butterflies.dayOf(night, this.B) : 0;
    this.render(SHARED.uTime.value as number, day);
  }

  /** Position of butterfly `i` on its figure-8 at clock `t` (the pure f(t, seed) of the flight). */
  at(i: number, t: number, out: { x: number; y: number; z: number }, calm: number): void {
    const B = this.B;
    const th = this.w[i] * t + this.ph[i];
    const lx = this.ex[i] * calm * Math.sin(th);
    const lz = this.ez[i] * calm * Math.sin(2 * th);
    const dr = (TAU * t) / B.drift[1] + this.dph[i];
    const x = this.cx[i] + lx * this.ca[i] - lz * this.sa[i] + B.drift[0] * calm * Math.cos(dr);
    const z = this.cz[i] + lx * this.sa[i] + lz * this.ca[i] + B.drift[0] * calm * Math.sin(dr);
    out.x = x;
    out.z = z;
    out.y = Math.max(this.ctx.h(x, z), 0.3) + this.lift[i] + B.bob * calm * Math.sin(3 * th);
  }

  /** Pose every butterfly for clock `t` and daylight `day`; count 0 when none flies. */
  render(t: number, day: number): void {
    const B = this.B;
    this.day = day;
    const n = this.capacity;
    if (day <= 0 || n === 0) {
      this.mesh.count = 0;
      this.mesh.visible = false;
      this.shown = 0;
      return;
    }
    const calm = this.motionScale;
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < n; i++) {
      this.at(i, t, this.pt, calm);
      this.at(i, t + 0.08, this.pn, calm);
      const yaw = rotYFor(this.pn.x - this.pt.x, this.pn.z - this.pt.z);
      const roll = B.bank * calm * Math.cos(this.w[i] * t + this.ph[i]);
      const hz = this.hz[i] * (calm < 1 ? B.calmFlap : 1);
      const open = 0.5 + 0.5 * Math.cos(TAU * hz * t + this.dph[i]);
      const span = 1 - calm * (1 - B.flapMin) * (1 - open);
      // wing-beat height: the whole butterfly rises a hair on the downstroke
      this.p.set(this.pt.x, this.pt.y + 0.04 * calm * (1 - open), this.pt.z);
      this.e.set(roll, yaw, 0, 'YZX');
      this.q.setFromEuler(this.e);
      const sc = B.size * day;
      this.s.set(sc, sc, sc * span);
      this.m.compose(this.p, this.q, this.s);
      this.m.toArray(arr, i * 16);
    }
    this.shown = n;
    this.mesh.count = n;
    this.mesh.visible = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  protected stepAgent(): void {}
}

// ---------------------------------------------------------------------------
// Story-spot critters (TASK-433)

const smoothstep = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** One critter of a story spot, resolved to world space. */
interface SpotItem {
  spec: SpotCritter;
  kind: string;
  /** Rank among the spot's critters (followers lag the leader). */
  k: number;
  x: number;
  z: number;
  /** Base height: the spot's y or the terrain under the critter, + dy. */
  y: number;
  /** World heading (xz angle) of the spot frame; internal yaw = -heading. */
  hd: number;
  /** Per-critter phase (0..1) and period (s). */
  ph: number;
  period: number;
}

/** Pose scratch of one critter at one clock value. */
interface SpotPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  sx: number;
  sy: number;
  sz: number;
  move: number;
  dip: number;
  gait: number;
}

const newPose = (): SpotPose => ({
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  sx: 1,
  sy: 1,
  sz: 1,
  move: 0,
  dip: 0,
  gait: 0,
});

/** One instanced mesh per species: not agents, poses are closed forms of the clock. */
class SpotMesh extends AgentKind {
  private readonly gait: Float32Array;
  private readonly gaitAttr: THREE.InstancedBufferAttribute;
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YZX');
  /** Instances drawn in the last frame (tests). */
  shown = 0;

  constructor(
    o: Omit<AgentKindOpts, 'name' | 'capacity' | 'geometry' | 'material'>,
    readonly species: SpotSpecies,
    geometry: THREE.BufferGeometry,
    tintAll: boolean,
    readonly items: SpotItem[],
  ) {
    super({
      ...o,
      name: `spot-${species}`,
      capacity: items.length,
      geometry,
      material: makeLifeMaterial(`life:spot-${species}`, tintAll),
    });
    const n = items.length;
    this.gait = new Float32Array(n * 3);
    this.gaitAttr = new THREE.InstancedBufferAttribute(this.gait, 3);
    this.gaitAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aGait', this.gaitAttr);
    const seed = new Float32Array(n);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      seed[i] = items[i].ph;
      col.set(items[i].spec.tint);
      this.mesh.setColorAt(i, col);
    }
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  override fixedUpdate(): void {}
  protected stepAgent(): void {}
  override update(_alpha: number): void {}

  /** Write every critter's pose for clock `t`; `vis[i]` is its size factor (0 = hidden). */
  render(poses: SpotPose[], vis: Float32Array): void {
    const n = this.capacity;
    let any = false;
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const P = poses[i];
      const f = vis[i];
      if (f > 0.001) any = true;
      const sc = this.items[i].spec.scale * SPOT_LIFE.size[this.species] * f;
      this.p.set(P.x, P.y, P.z);
      this.e.set(P.roll, P.yaw, P.pitch, 'YZX');
      this.q.setFromEuler(this.e);
      this.s.set(sc * P.sx, sc * P.sy, sc * P.sz);
      this.m.compose(this.p, this.q, this.s);
      this.m.toArray(arr, i * 16);
      this.gait[i * 3] = P.move;
      this.gait[i * 3 + 1] = P.dip;
      this.gait[i * 3 + 2] = P.gait;
    }
    this.shown = any ? n : 0;
    this.mesh.count = this.shown;
    this.mesh.visible = any;
    if (any) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.gaitAttr.needsUpdate = true;
      this.mesh.computeBoundingSphere();
    }
  }
}

/**
 * Story-spot animals (`SPOT_CRITTERS` by `world.storySpots` kind): cats, a fox, a capybara, gulls /
 * owl / pigeon (the gull model, folded), crabs and a duck family. Not agents (never counted or
 * picked); each species is one instanced mesh on the shared creature program, hidden below
 * `SPOT_LIFE.minTier` and beyond `SPOT_LIFE.fade` of the camera. Every pose is a pure function of
 * the engine clock (`uTime`) and a per-critter phase and period, so no two are in sync and the
 * capture is reproducible.
 */
export class SpotCritters {
  readonly meshes: SpotMesh[] = [];
  readonly items: SpotItem[] = [];
  motionScale = 1;
  private readonly poses = new Map<SpotMesh, SpotPose[]>();
  private readonly vis = new Map<SpotMesh, Float32Array>();

  constructor(
    o: Omit<AgentKindOpts, 'name' | 'capacity' | 'geometry' | 'material'>,
    private readonly ctx: LifeCtx,
  ) {
    const by = new Map<SpotSpecies, SpotItem[]>();
    (ctx.world.storySpots ?? []).forEach((sp, idx) => {
      const list = SPOT_CRITTERS[sp.kind];
      if (!list) return;
      list.forEach((spec, k) => {
        let ax = sp.pos.x;
        let az = sp.pos.z;
        let rot = sp.rotY;
        let ov: { dx?: number; dz?: number; dy?: number } | undefined;
        if (spec.at) {
          let best = 64;
          for (const f of ctx.world.fixtures ?? []) {
            if (f.defId !== spec.at || f.islandId !== sp.islandId) continue;
            const d = (f.x - sp.pos.x) ** 2 + (f.z - sp.pos.z) ** 2;
            if (d >= best) continue;
            best = d;
            ax = f.x;
            az = f.z;
            rot = f.rotY;
            ov = spec.variants?.[f.variant ?? 0];
          }
        }
        const dx = ov?.dx ?? spec.dx;
        const dz = ov?.dz ?? spec.dz;
        const dy = ov?.dy ?? spec.dy ?? 0;
        const p = lotLocalToWorld({ x: ax, z: az, rotY: rot }, dx, dz);
        const y = (spec.y === 'spot' ? sp.pos.y : ctx.h(p.x, p.z)) + dy;
        const h = (salt: number): number => unitHash(o.seed, idx * 8 + k, 0x5b07 + salt);
        const base = spec.period ?? 1;
        const item: SpotItem = {
          spec,
          kind: sp.kind,
          k,
          x: p.x,
          z: p.z,
          y,
          hd: rot + (spec.turn ?? 0),
          ph: h(0),
          period: base * (1 + (h(1) * 2 - 1) * SPOT_LIFE.jitter),
        };
        this.items.push(item);
        const l = by.get(spec.species) ?? [];
        l.push(item);
        by.set(spec.species, l);
      });
    });
    const geos: Record<SpotSpecies, [() => THREE.BufferGeometry, boolean]> = {
      cat: [buildCat, true],
      fox: [buildFox, false],
      capybara: [buildCapybara, false],
      bird: [buildPerched, false],
      owl: [buildOwl, false],
      crab: [buildCrab, true],
      duck: [buildDuck, false],
      seal: [buildSeal, false],
    };
    for (const [species, items] of by) {
      const [build, tintAll] = geos[species];
      const mesh = new SpotMesh(o, species, build(), tintAll, items);
      this.meshes.push(mesh);
      this.poses.set(
        mesh,
        items.map((it) => ({ ...newPose(), x: it.x, y: it.y, z: it.z })),
      );
      this.vis.set(mesh, new Float32Array(items.length));
    }
  }

  /** Size factor of a critter: tier gate × distance fade × night window. */
  private factor(it: SpotItem, night: number, tier: number): number {
    if (tier < SPOT_LIFE.minTier) return 0;
    const c = this.ctx.cameraPos;
    const d = Math.hypot(c.x - it.x, c.z - it.z);
    let f = 1 - smoothstep((d - SPOT_LIFE.fade[0]) / (SPOT_LIFE.fade[1] - SPOT_LIFE.fade[0]));
    if (it.spec.nightOnly)
      f *= smoothstep((night - SPOT_LIFE.night[0]) / (SPOT_LIFE.night[1] - SPOT_LIFE.night[0]));
    return f;
  }

  update(): void {
    const t = SHARED.uTime.value as number;
    const night = SHARED.uNight.value as number;
    const tier = this.ctx.getTier();
    for (const mesh of this.meshes) {
      const poses = this.poses.get(mesh) as SpotPose[];
      const vis = this.vis.get(mesh) as Float32Array;
      for (let i = 0; i < mesh.items.length; i++) {
        const it = mesh.items[i];
        vis[i] = this.factor(it, night, tier);
        if (vis[i] > 0.001) this.poseOf(it, t, poses[i]);
      }
      mesh.render(poses, vis);
    }
  }

  /** Pose of critter `it` at clock `t` (also the test hook). */
  poseOf(it: SpotItem, t: number, P: SpotPose): void {
    const L = SPOT_LIFE;
    const m = this.motionScale;
    const spec = it.spec;
    const tau = Math.PI * 2;
    const rot = it.hd;
    P.x = it.x;
    P.z = it.z;
    P.y = it.y;
    P.yaw = -rot;
    P.pitch = P.roll = 0;
    P.sx = P.sy = P.sz = 1;
    P.move = P.dip = 0;
    P.gait = it.ph * tau;
    const slow = 0.4 + 0.6 * m;
    switch (spec.idle) {
      case 'sleep': {
        const b = Math.sin(tau * (t / L.sleep.breath[0] + it.ph)) * L.sleep.breath[1] * m;
        P.sy = L.sleep.squash * (1 + b);
        P.sx = P.sz = 1 / Math.sqrt(P.sy);
        break;
      }
      case 'sit': {
        const turn = Math.sin(tau * (t / L.sit.turn[0] + it.ph));
        P.yaw += L.sit.turn[1] * turn * m;
        P.pitch = L.sit.pitch;
        P.sy = 0.92;
        P.sx = P.sz = 1 / Math.sqrt(P.sy);
        break;
      }
      case 'peek': {
        const w = 0.5 + 0.5 * Math.sin(tau * (t / L.peek.period + it.ph));
        P.y += L.peek.rise * w * w * m;
        P.pitch = 0.1 + 0.15 * w * m;
        P.yaw += 0.25 * Math.sin(tau * (t / (L.peek.period * 2.3) + it.ph)) * m;
        break;
      }
      case 'stare': {
        P.yaw += L.stare.yaw * Math.sin(tau * (t / L.stare.period + it.ph)) * m;
        P.dip =
          L.stare.dip * (0.5 + 0.5 * Math.sin(tau * (t / (L.stare.period * 1.7) + it.ph))) * m;
        break;
      }
      case 'doze': {
        const x = (t / L.doze.period + it.ph) % 1;
        const nod = x < 0.8 ? smoothstep(x / 0.8) : 1 - smoothstep((x - 0.8) / 0.2);
        P.dip = L.doze.depth * nod * m + 0.1;
        P.sy = 1 + 0.02 * Math.sin(tau * (t / 3.1 + it.ph)) * m;
        break;
      }
      case 'peck': {
        const x = (t / L.peck.period + it.ph) % 1;
        const pulse = x < L.peck.share ? Math.abs(Math.sin((Math.PI * 2 * x) / L.peck.share)) : 0;
        P.dip = pulse * m;
        P.yaw += 0.15 * Math.sin(tau * (t / (L.peck.period * 3.1) + it.ph)) * m;
        break;
      }
      case 'blink': {
        const o = L.owl;
        P.yaw += o.swivel[1] * Math.sin(tau * (t / o.swivel[0] + it.ph)) * m;
        const x = (t / o.blink[0] + it.ph) % 1;
        const closed =
          x < o.blink[1] / o.blink[0] ? Math.sin((Math.PI * x * o.blink[0]) / o.blink[1]) : 0;
        P.sy = 1 - 0.18 * closed;
        P.sx = P.sz = 1 / Math.sqrt(P.sy);
        P.gait = 0;
        break;
      }
      case 'orbit': {
        const r = spec.reach ?? 1;
        const a = tau * ((t * slow) / it.period + it.ph);
        const cx = it.x;
        const cz = it.z;
        P.x = cx + Math.cos(a) * r;
        P.z = cz + Math.sin(a) * r;
        // face the rock; the flank leads
        P.yaw = -Math.atan2(cz - P.z, cx - P.x);
        P.move = 1;
        P.gait = L.crab.tick * t + it.ph * tau;
        P.roll = 0.05 * Math.sin(a * 6) * m;
        break;
      }
      case 'pace': {
        const r = spec.reach ?? 1;
        const c = ((t * slow) / it.period + it.ph) % 1;
        const p = L.crab.pause;
        const half = 0.5 - p;
        let s: number;
        let moving = 1;
        if (c < half) s = -1 + 2 * smoothstep(c / half);
        else if (c < 0.5) {
          s = 1;
          moving = 0;
        } else if (c < 0.5 + half) s = 1 - 2 * smoothstep((c - 0.5) / half);
        else {
          s = -1;
          moving = 0;
        }
        // spot frame right = (sin, -cos)
        P.x = it.x + Math.sin(rot) * r * s;
        P.z = it.z - Math.cos(rot) * r * s;
        P.move = moving;
        P.gait = L.crab.tick * t + it.ph * tau;
        P.dip = 0;
        break;
      }
      case 'dance': {
        const w = Math.abs(Math.sin(Math.PI * (t / it.period + it.ph)));
        P.y += L.dance.hop * w * m;
        const low = 1 - w;
        P.sy = 1 - (1 - L.dance.squash) * low ** 4 * m;
        P.sx = P.sz = 1 / Math.sqrt(P.sy);
        P.yaw += 0.35 * Math.sin(tau * (t / (it.period * 2) + it.ph)) * m;
        P.move = 1;
        P.gait = L.crab.tick * 0.5 * t + it.ph * tau;
        break;
      }
      case 'cross': {
        const r = spec.reach ?? 2;
        const p = L.cross.pause;
        const half = 0.5 - p;
        // followers trail the mother by `lag` of a trip
        const c = ((((t * slow) / it.period - it.k * L.cross.lag) % 1) + 1) % 1;
        let s: number;
        let dir: number;
        let moving = 1;
        let turn = 0;
        if (c < half) {
          s = -1 + 2 * smoothstep(c / half);
          dir = 1;
        } else if (c < 0.5) {
          s = 1;
          dir = 1;
          moving = 0;
          turn = smoothstep((c - half) / p);
        } else if (c < 0.5 + half) {
          s = 1 - 2 * smoothstep((c - 0.5) / half);
          dir = -1;
        } else {
          s = -1;
          dir = -1;
          moving = 0;
          turn = smoothstep((c - 0.5 - half) / p);
        }
        // across the spot frame's right axis; the duck faces its travel, turning at the ends
        const rx = Math.sin(rot);
        const rz = -Math.cos(rot);
        P.x = it.x + rx * r * s;
        P.z = it.z + rz * r * s;
        const face = Math.atan2(rz, rx);
        const turned = moving
          ? dir > 0
            ? 0
            : Math.PI
          : dir > 0
            ? Math.PI * turn
            : Math.PI * (1 - turn);
        P.yaw = -(face + turned);
        const wob = Math.sin(tau * (L.cross.hz * t + it.ph));
        P.roll = L.cross.roll * wob * moving * m;
        P.y += 0.02 * Math.abs(wob) * moving * m;
        // dabble while waiting at an end
        P.dip = moving ? 0 : Math.sin(Math.PI * turn) ** 2 * 0.8 * m;
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Assembly

export interface CritterKinds {
  ducks?: Ducks;
  butterflies?: Butterflies;
  /** QA Bug Zoo ladybugs (the butterfly model, red). */
  ladybugs?: Butterflies;
}

/** Bug Zoo sites: the QA terrariums (`LADYBUGS.zooDef` fixtures), in world order. */
export function planZooSites(ctx: LifeCtx): FlowerSite[] {
  const out: FlowerSite[] = [];
  for (const f of ctx.world.fixtures ?? []) {
    if (f.defId !== LADYBUGS.zooDef) continue;
    if (ctx.world.islands[f.islandId]?.theme !== LADYBUGS.theme) continue;
    out.push({ island: f.islandId, x: f.x, z: f.z });
  }
  return out;
}

/** Pools that do not hold the giant duck (it has its own rubber-duck pond; life's family takes the other). */
export function familyPools(ctx: LifeCtx, pools: Pool[]): Pool[] {
  const giants = (ctx.world.fixtures ?? []).filter((f) => f.defId === 'giantDuck');
  const free = pools.filter(
    (p) => !giants.some((g) => Math.hypot(g.x - p.x, g.z - p.z) < Math.max(p.hw, p.hd) + 1),
  );
  return free.length > 0 ? free : pools;
}

/** Spawn the theme creatures the world supports, within the quality's counts. */
export function createCritterKinds(
  o: LandOpts,
  ctx: LifeCtx,
  plan: Pick<LifePlan, 'ducks' | 'butterflies'>,
): CritterKinds {
  const out: CritterKinds = {};
  const rng = ctx.rngFor('critters');
  if (plan.ducks > 0) {
    const pools = familyPools(ctx, findPools(ctx));
    if (pools.length > 0) {
      const pool = pools[rng.fork('pool').int(0, pools.length - 1)];
      out.ducks = new Ducks(o, ctx, pool, plan.ducks);
    }
  }
  if (plan.butterflies > 0) {
    const sites = planFlowerSites(ctx, plan.butterflies, rng.fork('sites'));
    if (sites.length > 0) out.butterflies = new Butterflies(o, ctx, sites, plan.butterflies);
    const zoo = planZooSites(ctx);
    const n = Math.round(plan.butterflies * LADYBUGS.share);
    if (zoo.length > 0 && n > 0)
      out.ladybugs = new Butterflies(o, ctx, zoo, n, LADYBUGS, 'ladybugs');
  }
  return out;
}

/** The story-spot animals of the world, or undefined when no story spot needs one. */
export function createSpotCritters(
  o: Omit<AgentKindOpts, 'name' | 'capacity' | 'geometry' | 'material'>,
  ctx: LifeCtx,
): SpotCritters | undefined {
  const spots = new SpotCritters(o, ctx);
  return spots.meshes.length > 0 ? spots : undefined;
}
