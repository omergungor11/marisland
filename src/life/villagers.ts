import * as THREE from 'three';
import { unitHash } from '../core/hash.ts';
import { VILLAGER_TINTS, VILLAGERS as V } from '../content/life.ts';
import { makeSpring, stepSpring, volumeXZ } from '../anim/spring.ts';
import { CritterKind, type KindOpts } from './critter-base.ts';
import { rotYFor, wrapAngle } from './agents.ts';
import type { LifeCtx } from './ctx.ts';
import { buildVillager } from './geo/critters.ts';
import { PathNet } from './graph.ts';

const S_WALK = 0;
const S_LOOK = 1;
const S_STAND = 2;
const ACT_NONE = 0;
const ACT_WAVE = 1;
const ACT_STRETCH = 2;

type TargetKind = 'door' | 'plaza' | 'dock' | 'landmark' | 'stall';
interface Target {
  node: number;
  kind: TargetKind;
  w: number;
}

export interface VillagerPlan {
  /** Count per island archetype. */
  perIsland: { archetype: string; count: number }[];
}

/** Island id (0-based) a world position belongs to, or -1. */
export function islandAt(ctx: LifeCtx, x: number, z: number): number {
  const h = ctx.world.height;
  const ix = Math.round((x - h.originX) / h.cellSize);
  const iz = Math.round((z - h.originZ) / h.cellSize);
  if (ix < 0 || iz < 0 || ix >= h.n || iz >= h.n) return -1;
  return ctx.world.islandMap[iz * h.n + ix] - 1;
}

/**
 * Villagers (ART_BIBLE §7 rows 8, 9): walk the footpath graph with a hopping step, stop at
 * plazas/stalls to look around, stand at doors/docks and wave or stretch every 6–12 s, wave at a
 * camera within 25 u. Positions always lie on a graph edge.
 */
export class Villagers extends CritterKind {
  readonly net: PathNet;
  readonly island: Int16Array;
  private readonly route: number[][];
  private readonly ri: Int16Array;
  private readonly from: Int32Array;
  private readonly s: Float32Array;
  private readonly hopT: Float32Array;
  private readonly walkSpeed: Float32Array;
  private readonly actKind: Uint8Array;
  private readonly actT: Float32Array;
  private readonly actAt: Float32Array;
  private readonly waveCd: Float32Array;
  private readonly arrive: Uint8Array;
  private readonly draws: Uint32Array;
  private readonly spr: ReturnType<typeof makeSpring>[];
  private readonly baseYaw: Float32Array;
  private readonly targets = new Map<number, Target[]>();
  /** Bumped by tests/consumers: waves started. */
  waves = 0;

  constructor(
    o: KindOpts,
    private readonly ctx: LifeCtx,
    plan: VillagerPlan,
  ) {
    const net = new PathNet(ctx.world.pathGraph);
    const spawnIslands: { id: number; count: number }[] = [];
    for (const p of plan.perIsland) {
      const isl = ctx.world.islands.find((q) => q.archetype === p.archetype);
      if (isl && p.count > 0) spawnIslands.push({ id: isl.id, count: p.count });
    }
    const total = spawnIslands.reduce((a, b) => a + b.count, 0);
    super(o, 'villager', total, buildVillager(), 2);
    this.net = net;
    this.island = new Int16Array(total).fill(-1);
    this.route = Array.from({ length: total }, () => []);
    this.ri = new Int16Array(total);
    this.from = new Int32Array(total);
    this.s = new Float32Array(total);
    this.hopT = new Float32Array(total);
    this.walkSpeed = new Float32Array(total);
    this.actKind = new Uint8Array(total);
    this.actT = new Float32Array(total);
    this.actAt = new Float32Array(total);
    this.waveCd = new Float32Array(total);
    this.arrive = new Uint8Array(total);
    this.draws = new Uint32Array(total);
    this.baseYaw = new Float32Array(total);
    this.spr = Array.from({ length: total }, () => makeSpring());
    this.buildTargets();
    const col = new THREE.Color();
    let i = 0;
    for (const sp of spawnIslands) {
      const pool = this.islandNodes(sp.id);
      for (let k = 0; k < sp.count; k++, i++) {
        this.island[i] = sp.id;
        this.walkSpeed[i] = V.speed * (0.9 + 0.2 * this.phase[i]);
        col.set(VILLAGER_TINTS[Math.floor(unitHash(this.seed, i, 5) * VILLAGER_TINTS.length)]);
        this.mesh.setColorAt(i, col);
        if (pool.length === 0) continue;
        const node = pool[Math.floor(this.rnd(i, 1) * pool.length) % pool.length];
        this.from[i] = node;
        this.x[i] = net.x(node);
        this.z[i] = net.z(node);
        this.y[i] = ctx.h(this.x[i], this.z[i]);
        this.state[i] = S_STAND;
        this.actDone[i] = 1;
        this.timer[i] = 0.5 + this.rnd(i, 2) * (V.idleEvery[1] - 0.5);
        this.actAt[i] = this.timer[i] * 0.5;
        this.waveCd[i] = this.rnd(i, 3) * V.waveCooldown;
        this.baseYaw[i] = this.rnd(i, 4) * Math.PI * 2 - Math.PI;
        this.yaw[i] = rotYFor(Math.cos(this.baseYaw[i]), Math.sin(this.baseYaw[i]));
        this.snap(i);
        this.pendingActive[i] = 1;
      }
    }
  }

  /** Spawned agents wait here until the tier gate opens. */
  private readonly pendingActive = new Uint8Array(this.capacity);
  private readonly kicked = new Int8Array(this.capacity).fill(-1);
  /** 1 once the idle action of the current stand has played. */
  private readonly actDone = new Uint8Array(this.capacity);
  /** 1 while a wave faces the camera (vs. an ambient wave that keeps its heading). */
  private readonly faceCam = new Uint8Array(this.capacity);

  protected onActivate(): void {
    for (let i = 0; i < this.capacity; i++) this.active[i] = this.pendingActive[i];
  }

  /** Per-agent seeded draw in [0,1) that does not depend on stepping order. */
  private rnd(i: number, salt: number): number {
    return unitHash(this.seed, i * 8191 + (this.draws[i]++ % 8191), salt);
  }

  private islandNodes(id: number): number[] {
    const out: number[] = [];
    const comps = new Map<number, number[]>();
    for (let n = 0; n < this.net.count; n++) {
      if (islandAt(this.ctx, this.net.x(n), this.net.z(n)) !== id) continue;
      const c = this.net.comp[n];
      let a = comps.get(c);
      if (!a) comps.set(c, (a = []));
      a.push(n);
    }
    let best: number[] = [];
    for (const a of comps.values()) if (a.length > best.length) best = a;
    out.push(...best);
    return out;
  }

  private buildTargets(): void {
    const w = this.ctx.world;
    const W = V.targetWeights;
    for (const s of w.settlements) {
      const list: Target[] = [];
      const inIsland = (n: number): boolean => n >= 0 && n < this.net.count;
      for (const li of s.lots) {
        const lot = w.lots[li];
        if (!lot || !inIsland(lot.node)) continue;
        if (lot.kind === 'hut') {
          // stilt huts sit over water; their door node may still be on a boardwalk
          list.push({ node: lot.node, kind: 'dock', w: W.dock });
        } else if (lot.kind === 'stall') list.push({ node: lot.node, kind: 'stall', w: W.door });
        else list.push({ node: lot.node, kind: 'door', w: W.door });
      }
      if (s.plaza && inIsland(s.hub.node))
        list.push({ node: s.hub.node, kind: 'plaza', w: W.plaza });
      for (const di of s.docks) {
        const d = w.docks?.[di];
        if (d?.node !== undefined && inIsland(d.node))
          list.push({ node: d.node, kind: 'dock', w: W.dock });
      }
      for (const li of s.landmarks) {
        const lm = w.landmarks[li];
        if (!lm) continue;
        const n = this.net.nearestNode(lm.x, lm.z);
        if (n >= 0) list.push({ node: n, kind: 'landmark', w: W.landmark });
      }
      if (list.length === 0 && inIsland(s.hub.node))
        list.push({ node: s.hub.node, kind: 'plaza', w: W.plaza });
      this.targets.set(s.islandId, list);
    }
  }

  /** Targets of island `id` reachable from `node`. */
  targetsFrom(id: number, node: number): Target[] {
    const comp = this.net.comp[node];
    return (this.targets.get(id) ?? []).filter(
      (t) => this.net.comp[t.node] === comp && t.node !== node,
    );
  }

  private pickTarget(i: number): boolean {
    const list = this.targetsFrom(this.island[i], this.from[i]);
    if (list.length === 0) return false;
    let tot = 0;
    for (const t of list) tot += t.w;
    let r = this.rnd(i, 7) * tot;
    let pick = list[list.length - 1];
    for (const t of list) {
      r -= t.w;
      if (r <= 0) {
        pick = t;
        break;
      }
    }
    const path = this.net.route(this.from[i], pick.node);
    if (!path || path.length < 2) return false;
    this.route[i] = path;
    this.ri[i] = 0;
    this.s[i] = 0;
    this.arrive[i] = pick.kind === 'door' || pick.kind === 'dock' ? 1 : 0;
    this.state[i] = S_WALK;
    this.hopT[i] = this.rnd(i, 8) * 0.2;
    return true;
  }

  protected stepAgent(i: number, dt: number): void {
    if (this.held(i, dt)) return;
    const net = this.net;
    const sp = this.spr[i];
    const cam = this.ctx.cameraPos;
    this.waveCd[i] -= dt;
    // spring pulse driven by the idle action
    stepSpring(
      sp,
      this.actKind[i] === ACT_STRETCH && this.actT[i] < 0.7 ? 1 : 0,
      V.spring.k,
      V.spring.c,
      dt,
    );
    let sy = 1;
    let rollT = 0;
    let pitchT = 0;
    let yawWob = 0;
    let hop = 0;

    if (this.state[i] === S_WALK) {
      const path = this.route[i];
      let a = path[this.ri[i]];
      let b = path[this.ri[i] + 1];
      let remain = this.walkSpeed[i] * dt;
      let len = net.dist(a, b);
      while (remain > 0) {
        const left = len - this.s[i];
        if (remain < left) {
          this.s[i] += remain;
          remain = 0;
        } else {
          remain -= left;
          this.ri[i]++;
          this.s[i] = 0;
          this.from[i] = b;
          if (this.ri[i] >= path.length - 1) {
            this.x[i] = net.x(b);
            this.z[i] = net.z(b);
            this.finishRoute(i);
            break;
          }
          a = path[this.ri[i]];
          b = path[this.ri[i] + 1];
          len = net.dist(a, b);
        }
      }
      if (this.state[i] === S_WALK) {
        a = path[this.ri[i]];
        b = path[this.ri[i] + 1];
        const l = Math.max(net.dist(a, b), 1e-6);
        const u = this.s[i] / l;
        this.x[i] = net.x(a) + (net.x(b) - net.x(a)) * u;
        this.z[i] = net.z(a) + (net.z(b) - net.z(a)) * u;
        this.baseYaw[i] = Math.atan2(net.z(b) - net.z(a), net.x(b) - net.x(a));
        // hop step: parabola up (ease-out) / down (ease-in), squash on landing, stretch in the air
        this.hopT[i] = (this.hopT[i] + dt) % V.step;
        const hu = this.hopT[i] / V.step;
        hop = V.hop * 4 * hu * (1 - hu);
        sy =
          hu < 0.75
            ? 1 + (V.airStretch - 1) * Math.sin((hu / 0.75) * Math.PI)
            : 1 - (1 - V.landSquash) * Math.sin(((hu - 0.75) / 0.25) * Math.PI);
        // body rocks a little with each step
        rollT = Math.sin(hu * Math.PI * 2) * 0.05;
      }
    } else {
      this.timer[i] -= dt;
      const camD = Math.hypot(cam.x - this.x[i], cam.z - this.z[i]);
      if (this.state[i] === S_LOOK) {
        const u = 1 - Math.max(this.timer[i], 0) / V.lookAround;
        yawWob = Math.sin(u * Math.PI * 2) * V.lookYaw;
        if (this.timer[i] <= 0) this.nextTarget(i);
      } else if (this.state[i] === S_STAND) {
        const total = this.actAt[i] * 2;
        const elapsed = total - this.timer[i];
        if (this.actKind[i] === ACT_NONE && !this.actDone[i] && elapsed >= this.actAt[i]) {
          this.faceCam[i] = 0;
          this.startAction(i, this.rnd(i, 9) < 0.5 ? ACT_WAVE : ACT_STRETCH);
        }
        if (this.timer[i] <= 0) this.nextTarget(i);
      }
      // wave at a camera within range
      if (
        this.state[i] !== S_WALK &&
        this.actKind[i] === ACT_NONE &&
        this.waveCd[i] <= 0 &&
        camD < V.waveRange
      ) {
        this.faceCam[i] = 1;
        this.startAction(i, ACT_WAVE);
        this.waveCd[i] = V.waveCooldown * (0.8 + 0.4 * this.rnd(i, 10));
      }
      if (this.actKind[i] !== ACT_NONE) {
        this.actT[i] += dt;
        if (this.actKind[i] === ACT_WAVE) {
          // face the camera, lean toward it, alternate side-to-side kicks every 0.35 s
          if (this.faceCam[i]) {
            const want = Math.atan2(cam.z - this.z[i], cam.x - this.x[i]);
            this.baseYaw[i] += wrapAngle(want - this.baseYaw[i]) * Math.min(1, dt * 6);
            pitchT = -0.18 * Math.min(1, this.actT[i] * 4);
          }
          const k = Math.floor(this.actT[i] / 0.35);
          if (k > this.kicked[i] && k < 4) {
            this.kicked[i] = k;
            sp.v += (k % 2 === 0 ? 1 : -1) * 6;
          }
          rollT = sp.x * 0.35;
          hop = Math.abs(sp.x) * 0.06;
          sy = 1 + Math.abs(sp.x) * 0.08;
        } else {
          sy = 1 + sp.x * 0.12;
        }
        if (this.actT[i] >= V.actionTime) this.endAction(i);
      }
    }
    const m = this.ctx.motion.scale;
    hop *= m;
    sy = 1 + (sy - 1) * m;
    this.y[i] = this.ctx.h(this.x[i], this.z[i]) + hop;
    this.yaw[i] = rotYFor(Math.cos(this.baseYaw[i] + yawWob), Math.sin(this.baseYaw[i] + yawWob));
    this.roll[i] = rollT;
    this.pitch[i] = pitchT;
    this.sy[i] = sy;
    const xz = volumeXZ(sy);
    this.sx[i] = xz;
    this.sz[i] = xz;
  }

  private startAction(i: number, kind: number): void {
    this.actKind[i] = kind;
    this.actT[i] = 0;
    this.kicked[i] = -1;
    this.actDone[i] = 1;
    if (kind === ACT_WAVE) this.waves++;
  }

  private endAction(i: number): void {
    this.actKind[i] = ACT_NONE;
    this.actT[i] = 0;
  }

  private finishRoute(i: number): void {
    this.actKind[i] = ACT_NONE;
    this.actT[i] = 0;
    if (this.arrive[i]) {
      this.state[i] = S_STAND;
      this.actDone[i] = 0;
      this.timer[i] = V.idleEvery[0] + this.rnd(i, 11) * (V.idleEvery[1] - V.idleEvery[0]);
      this.actAt[i] = this.timer[i] * 0.5;
    } else {
      this.state[i] = S_LOOK;
      this.timer[i] = V.lookAround;
    }
  }

  private nextTarget(i: number): void {
    this.actKind[i] = ACT_NONE;
    this.actT[i] = 0;
    if (!this.pickTarget(i)) {
      this.state[i] = S_STAND;
      this.actDone[i] = 1;
      this.timer[i] = 2;
      this.actAt[i] = 1;
    }
  }
}
