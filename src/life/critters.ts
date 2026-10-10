import * as THREE from 'three';
import { BUTTERFLIES, DUCKS } from '../content/life-critters.ts';
import type { LifePlan } from '../content/life.ts';
import { PROP_DEFS } from '../content/props.ts';
import { unitHash } from '../core/hash.ts';
import type { Rng } from '../core/rng.ts';
import { SHARED } from '../render/uniforms.ts';
import { AgentKind, rotYFor, type AgentKindOpts } from './agents.ts';
import type { LifeCtx } from './ctx.ts';
import { buildButterfly, buildDuck } from './geo/critters.ts';
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
export class Butterflies extends AgentKind {
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
  ) {
    super({
      ...o,
      name: 'butterflies',
      capacity: sites.length > 0 ? count : 0,
      geometry: buildButterfly(),
      material: makeLifeMaterial('life:butterflies', false),
    });
    const B = BUTTERFLIES;
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
  static dayOf(night: number): number {
    return 1 - smooth(BUTTERFLIES.day[0], BUTTERFLIES.day[1], night);
  }

  override update(_alpha: number): void {
    const night = SHARED.uNight.value as number;
    const day = this.ctx.getTier() >= BUTTERFLIES.minTier ? Butterflies.dayOf(night) : 0;
    this.render(SHARED.uTime.value as number, day);
  }

  /** Position of butterfly `i` on its figure-8 at clock `t` (the pure f(t, seed) of the flight). */
  at(i: number, t: number, out: { x: number; y: number; z: number }, calm: number): void {
    const B = BUTTERFLIES;
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
    const B = BUTTERFLIES;
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
// Assembly

export interface CritterKinds {
  ducks?: Ducks;
  butterflies?: Butterflies;
}

/** Spawn the first-wave theme creatures the world supports, within the quality's counts. */
export function createCritterKinds(
  o: LandOpts,
  ctx: LifeCtx,
  plan: Pick<LifePlan, 'ducks' | 'butterflies'>,
): CritterKinds {
  const out: CritterKinds = {};
  const rng = ctx.rngFor('critters');
  if (plan.ducks > 0) {
    const pools = findPools(ctx);
    if (pools.length > 0) {
      const pool = pools[rng.fork('pool').int(0, pools.length - 1)];
      out.ducks = new Ducks(o, ctx, pool, plan.ducks);
    }
  }
  if (plan.butterflies > 0) {
    const sites = planFlowerSites(ctx, plan.butterflies, rng.fork('sites'));
    if (sites.length > 0) out.butterflies = new Butterflies(o, ctx, sites, plan.butterflies);
  }
  return out;
}
