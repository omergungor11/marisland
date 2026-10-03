import * as THREE from 'three';
import { BLOOM_IN } from '../content/anim.ts';
import {
  CATS,
  CRABS,
  LAND,
  LAND_COLORS,
  SHEEP,
  VILLAGERS,
  type LifePlan,
} from '../content/life.ts';
import { hashString, unitHash } from '../core/hash.ts';
import { springIn } from '../core/math/spring.ts';
import { AgentKind, wrapAngle, type AgentKindOpts } from './agents.ts';
import type { LifeCtx } from './ctx.ts';
import { buildCat, buildCrab, buildSheep, buildVillager } from './geo/land.ts';
import {
  lineOk,
  NodeKind,
  planCats,
  planCrabs,
  planSheep,
  planVillagers,
  walkRoute,
  type Mask,
  type VillagerSpawn,
  type WalkGraph,
  type WanderSpawn,
} from './land-world.ts';
import { makeLifeMaterial } from './life-material.ts';

const TAU = Math.PI * 2;
export type LandOpts = Omit<AgentKindOpts, 'name' | 'capacity' | 'geometry' | 'material'>;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const damp = (dt: number, lambda: number): number => 1 - Math.exp(-lambda * dt);

/**
 * Shared behaviour of the land critters: tier-gated spring reveal (bloom-in / ease-out), a
 * per-instance `aSeed` + `aGait` for the limb shader, hash-based per-agent random draws (so one
 * agent's choices never depend on how many another made) and the picking feed.
 */
export abstract class LandKind extends AgentKind {
  /** Zoom tier from which this kind is alive. */
  readonly minTier: number;
  /** Uniform instance size (content), multiplied into the reveal scale. */
  readonly size: number;
  /** 0 hidden, 1 shown, 2 leaving (scale easing to 0). */
  readonly vis: Uint8Array;
  protected readonly spawned: Uint8Array;
  protected readonly hd: Float32Array;
  protected readonly gMove: Float32Array;
  protected readonly gPose: Float32Array;
  protected readonly gPhase: Float32Array;
  protected readonly appearT: Float32Array;
  protected readonly leaveT: Float32Array;
  protected readonly home: Float32Array; // hx, hz per agent
  protected tier = 0;
  private readonly draws: Uint32Array;
  private readonly kindSalt: number;
  private readonly gait: Float32Array;
  private readonly gaitAttr: THREE.InstancedBufferAttribute;

  constructor(
    o: LandOpts,
    protected readonly ctx: LifeCtx,
    name: string,
    capacity: number,
    geometry: THREE.BufferGeometry,
    tintAll: boolean,
    minTier: number,
    tints: readonly string[],
    pick: { radius: number; height: number; size: number },
  ) {
    super({
      ...o,
      name,
      capacity,
      geometry,
      material: makeLifeMaterial(`life:${name}`, tintAll),
    });
    this.minTier = minTier;
    this.pickRadius = pick.radius;
    this.pickHeight = pick.height;
    this.size = pick.size;
    const n = capacity;
    this.vis = new Uint8Array(n);
    this.spawned = new Uint8Array(n);
    this.hd = new Float32Array(n);
    this.gMove = new Float32Array(n);
    this.gPose = new Float32Array(n);
    this.gPhase = new Float32Array(n);
    this.appearT = new Float32Array(n);
    this.leaveT = new Float32Array(n);
    this.home = new Float32Array(n * 2);
    this.draws = new Uint32Array(n);
    this.kindSalt = hashString(name);
    this.gait = new Float32Array(n * 3);
    this.gaitAttr = new THREE.InstancedBufferAttribute(this.gait, 3);
    this.gaitAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aGait', this.gaitAttr);
    const seed = new Float32Array(n);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      seed[i] = this.phase[i];
      this.gPhase[i] = this.phase[i] * TAU;
      col.set(
        tints[Math.floor(unitHash(o.seed, i, this.kindSalt + 5) * tints.length) % tints.length],
      );
      this.mesh.setColorAt(i, col);
    }
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    this.mesh.castShadow = false;
  }

  /** Independent uniform [0, 1) for agent `i`; the n-th draw of an agent is a pure function of (seed, i, n). */
  protected draw(i: number): number {
    return unitHash(this.seed ^ this.kindSalt, i, ++this.draws[i]);
  }

  protected range(i: number, lo: number, hi: number): number {
    return lo + (hi - lo) * this.draw(i);
  }

  protected setGait(i: number): void {
    this.gait[i * 3] = this.gMove[i];
    this.gait[i * 3 + 1] = this.gPose[i];
    this.gait[i * 3 + 2] = this.gPhase[i];
  }

  /** Tier gate: reveal with a staggered spring (instant before the first simulated step), hide with an ease-out. */
  syncTier(tier: number): void {
    this.tier = tier;
    const want = tier >= this.minTier;
    const instant = this.step === 0;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.spawned[i]) continue;
      if (want && this.vis[i] !== 1) {
        if (this.vis[i] === 0) {
          this.active[i] = 1;
          this.scale[i] = instant ? this.size : 0;
          this.appearT[i] = instant
            ? -10
            : this.simT + LAND.appearStagger * unitHash(this.seed, i, this.kindSalt + 9);
          this.snap(i);
        } else {
          this.appearT[i] = this.simT;
          this.scale[i] = 0;
        }
        this.vis[i] = 1;
      } else if (!want && this.vis[i] === 1) {
        this.vis[i] = 2;
        this.leaveT[i] = this.simT;
      }
    }
  }

  protected override beginStep(_dt: number, t: number): void {
    const calm = this.motionScale < 1;
    for (let i = 0; i < this.capacity; i++) {
      const v = this.vis[i];
      if (v === 1) {
        const e = t - this.appearT[i];
        this.scale[i] =
          this.size *
          (calm ? clamp(e / LAND.calmInSeconds, 0, 1) : springIn(e, BLOOM_IN.k, BLOOM_IN.c));
      } else if (v === 2) {
        const u = (t - this.leaveT[i]) / LAND.outSeconds;
        if (u >= 1) {
          this.vis[i] = 0;
          this.active[i] = 0;
          this.scale[i] = 0;
        } else this.scale[i] = this.size * (1 - u * u);
      }
    }
  }

  override update(alpha: number): void {
    this.gaitAttr.needsUpdate = true;
    super.update(alpha);
  }

  /** Terrain height under the feet. */
  protected ground(x: number, z: number): number {
    return this.ctx.h(x, z) + LAND.footLift;
  }
}

// ---------------------------------------------------------------------------
// Villagers

const V_WALK = 0;
const V_PAUSE = 1;
const V_WAVE = 2;

export interface WorldNodes {
  /** Candidate trip targets per component. */
  targets: number[][];
  docks: number[][];
  all: number[][];
}

export function nodesByComponent(g: WalkGraph): WorldNodes {
  const targets: number[][] = Array.from({ length: g.compCount }, () => []);
  const docks: number[][] = Array.from({ length: g.compCount }, () => []);
  const all: number[][] = Array.from({ length: g.compCount }, () => []);
  for (let i = 0; i < g.n; i++) {
    const c = g.comp[i];
    if (c < 0) continue;
    all[c].push(i);
    if (g.kind[i] === NodeKind.dockEnd) docks[c].push(i);
    else if (g.kind[i] !== NodeKind.plain) targets[c].push(i);
  }
  return { targets, docks, all };
}

/** Villagers: walk the path graph between doors, hub and dock ends; pause, look around, wave at a near camera. */
export class Villagers extends LandKind {
  private readonly na: Int32Array;
  private readonly nb: Int32Array;
  private readonly u: Float32Array;
  private readonly elen: Float32Array;
  private readonly ridx: Int32Array;
  private readonly cool: Float32Array;
  private readonly prev: Uint8Array;
  private readonly look: Float32Array;
  private readonly dur: Float32Array;
  /** Length (s) of the wave in progress (camera wave vs. click emote). */
  private readonly waveLen: Float32Array;
  private readonly routes: (number[] | null)[];
  readonly compOf: Int32Array;
  private readonly nodes: WorldNodes;

  constructor(
    o: LandOpts,
    ctx: LifeCtx,
    readonly graph: WalkGraph,
    spawns: VillagerSpawn[],
  ) {
    super(
      o,
      ctx,
      'villager',
      spawns.length,
      buildVillager(),
      false,
      LAND.minTier.villagers,
      LAND_COLORS.shirts,
      { radius: VILLAGERS.pickRadius, height: VILLAGERS.pickHeight, size: LAND.size.villagers },
    );
    const n = spawns.length;
    this.na = new Int32Array(n);
    this.nb = new Int32Array(n);
    this.u = new Float32Array(n);
    this.elen = new Float32Array(n);
    this.ridx = new Int32Array(n);
    this.cool = new Float32Array(n);
    this.prev = new Uint8Array(n);
    this.look = new Float32Array(n);
    this.dur = new Float32Array(n);
    this.waveLen = new Float32Array(n).fill(VILLAGERS.wave.seconds);
    this.compOf = new Int32Array(n);
    this.routes = new Array<number[] | null>(n).fill(null);
    this.nodes = nodesByComponent(graph);
    for (let i = 0; i < n; i++) {
      const s = spawns[i];
      this.na[i] = this.nb[i] = s.node;
      this.compOf[i] = s.comp;
      this.x[i] = graph.x[s.node];
      this.z[i] = graph.z[s.node];
      this.y[i] = this.nodeY(s.node);
      const nb = graph.adj[s.node];
      this.hd[i] =
        nb.length > 0
          ? Math.atan2(graph.z[nb[0]] - graph.z[s.node], graph.x[nb[0]] - graph.x[s.node])
          : this.draw(i) * TAU;
      this.yaw[i] = -this.hd[i];
      this.look[i] = this.hd[i];
      this.state[i] = V_PAUSE;
      this.dur[i] = this.range(i, 0.2, VILLAGERS.pauseNode[1]);
      this.timer[i] = this.draw(i) * this.dur[i];
      this.cool[i] = this.range(i, 0, VILLAGERS.wave.cooldown[1]);
      this.spawned[i] = 1;
      this.snap(i);
    }
  }

  private nodeY(node: number): number {
    const d = this.graph.deckY[node];
    return (
      (Number.isNaN(d) ? this.ctx.h(this.graph.x[node], this.graph.z[node]) : d) + LAND.footLift
    );
  }

  /**
   * Click emote: villager `i` turns to the camera and waves for `VILLAGERS.wave.emoteSeconds`, then
   * resumes what it was doing. Called by the interaction layer (interaction → life, never back).
   * False when the villager is not alive (tier below the reveal) or `i` is out of range.
   */
  wave(i: number): boolean {
    if (!(i >= 0 && i < this.capacity) || this.vis[i] !== 1) return false;
    const V = VILLAGERS.wave;
    if (this.state[i] !== V_WAVE) {
      this.prev[i] = this.state[i];
      this.state[i] = V_WAVE;
    }
    this.timer[i] = 0;
    this.waveLen[i] = V.emoteSeconds;
    this.cool[i] = Math.max(this.cool[i], V.cooldown[0]);
    return true;
  }

  /** Camera within the wave radius (3-D). */
  private near(i: number): boolean {
    const c = this.ctx.cameraPos;
    const dx = c.x - this.x[i];
    const dy = c.y - this.y[i];
    const dz = c.z - this.z[i];
    const r = VILLAGERS.wave.radius;
    return dx * dx + dy * dy + dz * dz < r * r;
  }

  /** Choose the next destination (a door / hub, sometimes a dock end) and a route to it. */
  private planTrip(i: number): boolean {
    const c = this.compOf[i];
    const here = this.na[i];
    const docks = this.nodes.docks[c];
    const doors = this.nodes.targets[c];
    const pool =
      docks.length > 0 && (doors.length === 0 || this.draw(i) < VILLAGERS.dockChance)
        ? docks
        : doors.length > 0
          ? doors
          : this.nodes.all[c];
    for (let t = 0; t < 4; t++) {
      const to = pool[Math.floor(this.draw(i) * pool.length) % pool.length];
      if (to === here) continue;
      const r = walkRoute(this.graph, here, to);
      if (r && r.length > 1) {
        this.routes[i] = r;
        this.ridx[i] = 1;
        this.nb[i] = r[1];
        this.u[i] = 0;
        this.elen[i] = Math.hypot(
          this.graph.x[r[1]] - this.graph.x[here],
          this.graph.z[r[1]] - this.graph.z[here],
        );
        return true;
      }
    }
    return false;
  }

  private pauseFor(i: number): number {
    const k = this.graph.kind[this.na[i]];
    const [lo, hi] =
      k === NodeKind.dockEnd
        ? VILLAGERS.pauseDock
        : k === NodeKind.door || k === NodeKind.hub
          ? VILLAGERS.pauseDoor
          : VILLAGERS.pauseNode;
    return this.range(i, lo, hi);
  }

  protected stepAgent(i: number, dt: number, _t: number): void {
    const V = VILLAGERS;
    const g = this.graph;
    const m = this.motionScale;
    this.cool[i] -= dt;
    let s = this.state[i];
    if (s !== V_WAVE && this.cool[i] <= 0 && this.tier >= V.wave.minTier && this.near(i)) {
      this.prev[i] = s;
      this.state[i] = s = V_WAVE;
      this.timer[i] = 0;
      this.waveLen[i] = V.wave.seconds;
      this.cool[i] = this.range(i, V.wave.cooldown[0], V.wave.cooldown[1]) + V.wave.seconds;
    }
    let moving = 0;
    let want = this.hd[i];
    let pose = 0;
    if (s === V_WAVE) {
      this.timer[i] += dt;
      const t = this.timer[i];
      const len = this.waveLen[i];
      const down = len - V.wave.lower;
      pose =
        t < down ? springIn(t, V.wave.k, V.wave.c) : Math.max(0, 1 - (t - down) / V.wave.lower);
      const c = this.ctx.cameraPos;
      want = Math.atan2(c.z - this.z[i], c.x - this.x[i]);
      if (t >= len) {
        this.state[i] = this.prev[i];
        if (this.prev[i] === V_PAUSE) this.timer[i] = this.dur[i] * 0.5;
        this.look[i] = this.hd[i];
      }
    } else if (s === V_PAUSE) {
      this.timer[i] += dt;
      const sweep = Math.sin((this.timer[i] / 1.5) * TAU);
      want =
        this.look[i] +
        (this.graph.kind[this.na[i]] === NodeKind.dockEnd ? 0.25 : V.lookYaw) * sweep;
      if (this.timer[i] >= this.dur[i]) {
        if (this.planTrip(i)) {
          this.state[i] = V_WALK;
          this.timer[i] = 0;
        } else {
          this.timer[i] = 0;
          this.dur[i] = this.pauseFor(i);
        }
      }
    }
    if (this.state[i] === V_WALK) {
      moving = 1;
      let step = V.speed * dt;
      const r = this.routes[i] as number[];
      let arrived = false;
      while (step > 0) {
        const left = this.elen[i] * (1 - this.u[i]);
        if (step < left) {
          this.u[i] += step / Math.max(this.elen[i], 1e-4);
          step = 0;
        } else {
          step -= left;
          this.na[i] = this.nb[i];
          const next = this.ridx[i] + 1;
          if (next >= r.length) {
            this.u[i] = 0;
            this.elen[i] = 0;
            arrived = true;
            break;
          }
          this.ridx[i] = next;
          this.nb[i] = r[next];
          this.u[i] = 0;
          this.elen[i] = Math.hypot(
            g.x[this.nb[i]] - g.x[this.na[i]],
            g.z[this.nb[i]] - g.z[this.na[i]],
          );
        }
      }
      const a = this.na[i];
      const b = this.nb[i];
      if (arrived) {
        this.x[i] = g.x[a];
        this.z[i] = g.z[a];
        this.state[i] = V_PAUSE;
        this.timer[i] = 0;
        this.dur[i] = this.pauseFor(i);
        this.look[i] = this.hd[i];
        moving = 0;
      } else {
        this.x[i] = g.x[a] + (g.x[b] - g.x[a]) * this.u[i];
        this.z[i] = g.z[a] + (g.z[b] - g.z[a]) * this.u[i];
        want = Math.atan2(g.z[b] - g.z[a], g.x[b] - g.x[a]);
      }
    }
    // feet
    const a = this.na[i];
    const b = this.nb[i];
    const da = g.deckY[a];
    const db = g.deckY[b];
    if (Number.isNaN(da) && Number.isNaN(db)) this.y[i] = this.ground(this.x[i], this.z[i]);
    else {
      const ya = this.nodeY(a);
      const yb = this.nodeY(b);
      this.y[i] = ya + (yb - ya) * (this.elen[i] > 0 ? this.u[i] : 0);
    }
    // turn, gait, hop
    this.hd[i] += wrapAngle(want - this.hd[i]) * damp(dt, V.turnRate);
    this.yaw[i] = -this.hd[i];
    this.gMove[i] += (moving - this.gMove[i]) * damp(dt, 8);
    this.gPose[i] = pose;
    this.gPhase[i] += ((Math.PI * 2) / (2 * V.stepPeriod)) * dt * this.gMove[i];
    const hop = Math.abs(Math.sin(this.gPhase[i]));
    const k = this.gMove[i] * m;
    this.y[i] += V.hop * hop * k;
    const sq = 1 - V.squash * Math.pow(1 - hop, 4) * k;
    this.sy[i] = sq;
    this.sx[i] = this.sz[i] = 1 / Math.sqrt(sq);
    this.roll[i] = V.sway * Math.sin(this.gPhase[i]) * k;
    this.setGait(i);
  }
}

// ---------------------------------------------------------------------------
// Wanderers: sheep, cats, crabs.

export interface WanderTune {
  speed: number;
  radius: number;
  walk: readonly [number, number];
  rest: readonly [number, number];
  hopDist: readonly [number, number];
  legHz: number;
}

abstract class Wanderers extends LandKind {
  protected readonly tx: Float32Array;
  protected readonly tz: Float32Array;
  protected readonly dur: Float32Array;

  constructor(
    o: LandOpts,
    ctx: LifeCtx,
    name: string,
    spawns: WanderSpawn[],
    geometry: THREE.BufferGeometry,
    tintAll: boolean,
    minTier: number,
    tints: readonly string[],
    pick: { radius: number; height: number; size: number },
    protected readonly mask: Mask,
    protected readonly tune: WanderTune,
  ) {
    super(o, ctx, name, spawns.length, geometry, tintAll, minTier, tints, pick);
    const n = spawns.length;
    this.tx = new Float32Array(n);
    this.tz = new Float32Array(n);
    this.dur = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = spawns[i];
      this.x[i] = this.tx[i] = s.x;
      this.z[i] = this.tz[i] = s.z;
      this.home[i * 2] = s.hx;
      this.home[i * 2 + 1] = s.hz;
      this.y[i] = this.ground(s.x, s.z);
      this.hd[i] = this.draw(i) * TAU;
      this.yaw[i] = -this.hd[i];
      this.dur[i] = this.range(i, tune.rest[0], tune.rest[1]);
      this.timer[i] = this.draw(i) * this.dur[i];
      this.spawned[i] = 1;
      this.snap(i);
    }
  }

  /** Pick a mask-checked target within the roam radius; false when nothing fits. */
  protected pickTarget(i: number): boolean {
    const T = this.tune;
    const hx = this.home[i * 2];
    const hz = this.home[i * 2 + 1];
    for (let t = 0; t < 10; t++) {
      const a = this.draw(i) * TAU;
      const d = this.range(i, T.hopDist[0], T.hopDist[1]);
      let nx = this.x[i] + Math.cos(a) * d;
      let nz = this.z[i] + Math.sin(a) * d;
      if (t >= 8) {
        // drift back toward home
        nx = this.x[i] + (hx - this.x[i]) * 0.5;
        nz = this.z[i] + (hz - this.z[i]) * 0.5;
      }
      if (Math.hypot(nx - hx, nz - hz) > T.radius) continue;
      if (!this.mask(nx, nz) || !lineOk(this.mask, this.x[i], this.z[i], nx, nz)) continue;
      this.tx[i] = nx;
      this.tz[i] = nz;
      return true;
    }
    return false;
  }

  /** Turn toward the target and step; returns remaining distance, or −1 when the next cell is blocked. */
  protected advance(i: number, dt: number, speed: number, turn: number, face?: number): number {
    const dx = this.tx[i] - this.x[i];
    const dz = this.tz[i] - this.z[i];
    const dist = Math.hypot(dx, dz);
    const aim = Math.atan2(dz, dx) - (face ?? 0);
    const err = wrapAngle(aim - this.hd[i]);
    this.hd[i] += err * damp(dt, turn);
    const step = Math.min(dist, speed * dt * Math.max(0, Math.cos(err)));
    const nx = this.x[i] + (dx / Math.max(dist, 1e-6)) * step;
    const nz = this.z[i] + (dz / Math.max(dist, 1e-6)) * step;
    if (!this.mask(nx, nz)) return -1;
    this.x[i] = nx;
    this.z[i] = nz;
    return dist - step;
  }

  protected integrateGait(i: number, dt: number, moving: number): number {
    this.gMove[i] += (moving - this.gMove[i]) * damp(dt, 8);
    this.gPhase[i] += TAU * this.tune.legHz * dt * this.gMove[i];
    return this.gMove[i];
  }
}

/** Sheep: graze (head down) → amble → occasional hop with a wool jiggle, inside the meadow mask. */
export class Sheep extends Wanderers {
  private readonly jx: Float32Array;
  private readonly jv: Float32Array;

  constructor(o: LandOpts, ctx: LifeCtx, spawns: WanderSpawn[], mask: Mask) {
    super(
      o,
      ctx,
      'sheep',
      spawns,
      buildSheep(),
      true,
      LAND.minTier.sheep,
      LAND_COLORS.woolTints,
      { radius: SHEEP.pickRadius, height: SHEEP.pickHeight, size: LAND.size.sheep },
      mask,
      SHEEP,
    );
    this.jx = new Float32Array(spawns.length);
    this.jv = new Float32Array(spawns.length);
  }

  protected stepAgent(i: number, dt: number, _t: number): void {
    const S = SHEEP;
    const m = this.motionScale;
    let moving = 0;
    let pose = this.gPose[i];
    let hopY = 0;
    const st = this.state[i];
    if (st === 0) {
      // graze
      pose += (1 - pose) * damp(dt, S.headLambda);
      this.timer[i] += dt;
      if (this.timer[i] >= this.dur[i]) {
        this.timer[i] = 0;
        if (this.draw(i) < S.hopChance) {
          this.state[i] = 2;
        } else if (this.pickTarget(i)) {
          this.state[i] = 1;
          this.dur[i] = this.range(i, S.walk[0], S.walk[1]);
        } else this.dur[i] = this.range(i, S.rest[0], S.rest[1]);
      }
    } else if (st === 1) {
      pose += (0 - pose) * damp(dt, S.headLambda);
      this.timer[i] += dt;
      moving = 1;
      const left = this.advance(i, dt, S.speed, 5);
      if (left < 0.25 || this.timer[i] >= this.dur[i]) {
        this.state[i] = 0;
        this.timer[i] = 0;
        this.dur[i] = this.range(i, S.rest[0], S.rest[1]);
      }
    } else {
      pose += (0 - pose) * damp(dt, S.headLambda);
      this.timer[i] += dt;
      const u = Math.min(1, this.timer[i] / S.hop.seconds);
      hopY = S.hop.height * 4 * u * (1 - u) * m;
      if (u >= 1) {
        this.state[i] = 0;
        this.timer[i] = 0;
        this.dur[i] = this.range(i, 0.5, S.rest[1] * 0.5);
        this.jv[i] += S.jiggle.impulse * Math.sqrt(S.jiggle.k) * m; // wool lands, jiggles
      }
    }
    // wool jiggle spring (substeps keep k=120 stable at the far-LOD step)
    const n = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / n;
    for (let k = 0; k < n; k++) {
      this.jv[i] += (-S.jiggle.k * this.jx[i] - S.jiggle.c * this.jv[i]) * h;
      this.jx[i] += this.jv[i] * h;
    }
    const jig = clamp(this.jx[i], -0.25, 0.25);
    const mv = this.integrateGait(i, dt, moving);
    const bob = Math.abs(Math.sin(this.gPhase[i] * 0.5));
    this.y[i] = this.ground(this.x[i], this.z[i]) + hopY + 0.02 * bob * mv * m;
    this.yaw[i] = -this.hd[i];
    this.roll[i] = S.roll * Math.sin(this.gPhase[i] * 0.5) * mv * m;
    this.sy[i] = 1 - jig;
    this.sx[i] = this.sz[i] = 1 + jig * 0.5;
    this.gPose[i] = pose;
    this.setGait(i);
  }
}

/** Cats: stroll around the village, sit and flick the tail. */
export class Cats extends Wanderers {
  constructor(o: LandOpts, ctx: LifeCtx, spawns: WanderSpawn[], mask: Mask) {
    super(
      o,
      ctx,
      'cat',
      spawns,
      buildCat(),
      true,
      LAND.minTier.cats,
      LAND_COLORS.catFurs,
      { radius: CATS.pickRadius, height: CATS.pickHeight, size: LAND.size.cats },
      mask,
      CATS,
    );
  }

  protected stepAgent(i: number, dt: number, _t: number): void {
    const C = CATS;
    const m = this.motionScale;
    let moving = 0;
    const st = this.state[i];
    this.timer[i] += dt;
    if (st === 0) {
      if (this.timer[i] >= this.dur[i]) {
        this.timer[i] = 0;
        if (this.pickTarget(i)) {
          this.state[i] = 1;
          this.dur[i] = this.range(i, C.walk[0], C.walk[1]);
        } else this.dur[i] = this.range(i, C.rest[0], C.rest[1]);
      }
    } else {
      moving = 1;
      const left = this.advance(i, dt, C.speed, 6);
      if (left < 0.2 || this.timer[i] >= this.dur[i]) {
        this.state[i] = 0;
        this.timer[i] = 0;
        this.dur[i] = this.range(i, C.rest[0], C.rest[1]);
      }
    }
    const mv = this.integrateGait(i, dt, moving);
    // sit: settle the body and raise the head
    const sit = 1 - mv;
    this.settle(i, sit, mv, m);
    this.setGait(i);
  }

  private settle(i: number, sit: number, mv: number, m: number): void {
    const C = CATS;
    this.y[i] =
      this.ground(this.x[i], this.z[i]) + C.hop * Math.abs(Math.sin(this.gPhase[i] * 0.5)) * mv * m;
    this.yaw[i] = -this.hd[i];
    this.pitch[i] = C.sit.pitch * sit * m;
    this.sy[i] = 1 - (1 - C.sit.squash) * sit;
    this.sx[i] = this.sz[i] = 1 / Math.sqrt(this.sy[i]);
    this.roll[i] = 0.04 * Math.sin(this.gPhase[i] * 0.5) * mv * m;
  }
}

const C_PAUSE = 0;
const C_SCUTTLE = 1;
const C_FREEZE = 2;

/** Crabs: sideways scuttle on dry sand and shallows, freeze beats, long pauses. */
export class Crabs extends Wanderers {
  /** Side the crab leads with: +1 = its right (+z) in the direction of travel. */
  private readonly side: Int8Array;
  private readonly freezeAt: Float32Array;
  private readonly frozen: Uint8Array;
  private readonly scuttle: Float32Array;

  constructor(o: LandOpts, ctx: LifeCtx, spawns: WanderSpawn[], mask: Mask) {
    super(
      o,
      ctx,
      'crab',
      spawns,
      buildCrab(),
      true,
      LAND.minTier.crabs,
      LAND_COLORS.crabShellTints,
      { radius: CRABS.pickRadius, height: CRABS.pickHeight, size: LAND.size.crabs },
      mask,
      CRABS,
    );
    this.side = new Int8Array(spawns.length).fill(1);
    this.freezeAt = new Float32Array(spawns.length);
    this.frozen = new Uint8Array(spawns.length);
    this.scuttle = new Float32Array(spawns.length);
  }

  protected stepAgent(i: number, dt: number, _t: number): void {
    const R = CRABS;
    const m = this.motionScale;
    let moving = 0;
    const st = this.state[i];
    this.timer[i] += dt;
    if (st === C_PAUSE) {
      if (this.timer[i] >= this.dur[i]) {
        this.timer[i] = 0;
        if (this.pickTarget(i)) {
          this.state[i] = C_SCUTTLE;
          this.side[i] = this.draw(i) < 0.5 ? 1 : -1;
          this.scuttle[i] = this.range(i, R.walk[0], R.walk[1]);
          this.frozen[i] = 0;
          this.freezeAt[i] =
            this.draw(i) < R.freezeChance ? this.range(i, 0.3, 0.7) * this.scuttle[i] : Infinity;
        } else this.dur[i] = this.range(i, R.rest[0], R.rest[1]);
      }
    } else if (st === C_SCUTTLE) {
      moving = 1;
      // the body faces so the chosen flank leads: travel = facing + side · 90°
      const left = this.advance(i, dt, R.speed, 10, (this.side[i] * Math.PI) / 2);
      if (!this.frozen[i] && this.timer[i] >= this.freezeAt[i]) {
        this.frozen[i] = 1;
        this.state[i] = C_FREEZE;
        this.dur[i] = this.range(i, R.freeze[0], R.freeze[1]);
        this.timer[i] = 0;
      } else if (left < 0.12 || this.timer[i] >= this.scuttle[i]) {
        this.state[i] = C_PAUSE;
        this.timer[i] = 0;
        this.dur[i] = this.range(i, R.rest[0], R.rest[1]);
      }
    } else if (this.timer[i] >= this.dur[i]) {
      // freeze beat over: carry on to the same target
      this.state[i] = C_SCUTTLE;
      this.timer[i] = this.freezeAt[i];
    }
    const mv = this.integrateGait(i, dt, moving);
    this.y[i] =
      this.ground(this.x[i], this.z[i]) + 0.012 * Math.abs(Math.sin(this.gPhase[i] * 0.5)) * mv * m;
    this.yaw[i] = -this.hd[i];
    this.roll[i] = 0.05 * Math.sin(this.gPhase[i]) * mv * m;
    this.setGait(i);
  }
}

// ---------------------------------------------------------------------------
// Assembly

export interface LandKinds {
  villagers?: Villagers;
  cats?: Cats;
  sheep?: Sheep;
  crabs?: Crabs;
}

export interface LandBuild {
  graph: WalkGraph;
  masks: { sheep: Mask; cats: Mask; crabs: Mask };
}

/** Spawn every land kind the world supports, within the quality's counts. */
export function createLandKinds(
  o: LandOpts,
  ctx: LifeCtx,
  plan: LifePlan,
  b: LandBuild,
): LandKinds {
  const out: LandKinds = {};
  const rng = ctx.rngFor('land');
  const villagers = planVillagers(ctx, b.graph, plan.villagers, rng);
  if (villagers.length > 0) out.villagers = new Villagers(o, ctx, b.graph, villagers);
  const cats = planCats(ctx, b.masks.cats, plan.cats, rng);
  if (cats.length > 0) out.cats = new Cats(o, ctx, cats, b.masks.cats);
  const sheep = planSheep(ctx, b.masks.sheep, plan.sheep, rng);
  if (sheep.length > 0) out.sheep = new Sheep(o, ctx, sheep, b.masks.sheep);
  const crabs = planCrabs(ctx, b.masks.crabs, plan.crabs, rng);
  if (crabs.length > 0) out.crabs = new Crabs(o, ctx, crabs, b.masks.crabs);
  return out;
}
