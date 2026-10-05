import * as THREE from 'three';
import { LAND, LAND_COLORS, WORKERS, type LifePlan } from '../content/life.ts';
import { THEMES } from '../content/themes.ts';
import { springIn } from '../core/math/spring.ts';
import { wrapAngle } from './agents.ts';
import type { LifeCtx } from './ctx.ts';
import { buildWorker } from './geo/workers.ts';
import { LandKind, nodesByComponent, type LandOpts, type WorldNodes } from './land.ts';
import { lineOk, NodeKind, walkRoute, type Mask, type WalkGraph } from './land-world.ts';
import { planWorkers, type Anchor, type Seat, type WorkerSpawn } from './workers-world.ts';

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const damp = (dt: number, lambda: number): number => 1 - Math.exp(-lambda * dt);

const W_WALK = 0;
const W_PAUSE = 1;
const W_WAVE = 2;
const W_ENTER = 3;
const W_WORK = 4;
const W_EXIT = 5;
const W_LOOP = 6;

const WP = 2; // waypoints per trip inside a lot (entrance, seat / entrance, door)

/**
 * Workers: department bots. They walk the path graph between doors, hub and dock ends (or loop
 * between anchors on an outpost island), pause and look around, wave at a near camera — and go
 * INTO their lot: ENTER (door → entrance → seat) → WORK (seated, typing, a stretch beat every
 * 8–15 s) → EXIT. At most one worker per seat. `deskShare` of them start seated, so a capture at
 * simt = 2 shows typing bots.
 */
export class Workers extends LandKind {
  private readonly na: Int32Array;
  private readonly nb: Int32Array;
  private readonly u: Float32Array;
  private readonly elen: Float32Array;
  private readonly ridx: Int32Array;
  private readonly cool: Float32Array;
  private readonly prev: Uint8Array;
  private readonly look: Float32Array;
  private readonly dur: Float32Array;
  private readonly waveLen: Float32Array;
  private readonly routes: (number[] | null)[];
  /** Walk-graph component per worker (−1 = outpost). */
  readonly compOf: Int32Array;
  readonly islandOf: Int32Array;
  readonly themeOf: Uint8Array;
  /** Seat held by each worker (−1 = none); a seat has at most one holder. */
  readonly seatOf: Int32Array;
  readonly seatOwner: Int32Array;
  private readonly wx: Float32Array;
  private readonly wz: Float32Array;
  private readonly wn: Uint8Array;
  private readonly wi: Uint8Array;
  private readonly sitAmt: Float32Array;
  private readonly typeAmt: Float32Array;
  private readonly typeVel: Float32Array;
  private readonly stretchIn: Float32Array;
  private readonly stretchT: Float32Array;
  private readonly anchorAt: Int32Array;
  private readonly tx: Float32Array;
  private readonly tz: Float32Array;
  private readonly nodes: WorldNodes;
  private readonly seatsByNode = new Map<number, number[]>();
  private hiddenEnds: ReadonlySet<number> = new Set();
  private hiddenLots: ReadonlySet<number> = new Set();

  constructor(
    o: LandOpts,
    ctx: LifeCtx,
    readonly graph: WalkGraph,
    readonly seats: Seat[],
    readonly anchors: Anchor[][],
    private readonly mask: Mask,
    spawns: WorkerSpawn[],
  ) {
    super(
      o,
      ctx,
      'workers',
      spawns.length,
      buildWorker(),
      false,
      LAND.minTier.workers,
      LAND_COLORS.shirts,
      { radius: WORKERS.pickRadius, height: WORKERS.pickHeight, size: LAND.size.workers },
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
    this.waveLen = new Float32Array(n).fill(WORKERS.wave.seconds);
    this.compOf = new Int32Array(n);
    this.islandOf = new Int32Array(n);
    this.themeOf = new Uint8Array(n);
    this.seatOf = new Int32Array(n).fill(-1);
    this.seatOwner = new Int32Array(seats.length).fill(-1);
    this.wx = new Float32Array(n * WP);
    this.wz = new Float32Array(n * WP);
    this.wn = new Uint8Array(n);
    this.wi = new Uint8Array(n);
    this.sitAmt = new Float32Array(n);
    this.typeAmt = new Float32Array(n);
    this.typeVel = new Float32Array(n);
    this.stretchIn = new Float32Array(n);
    this.stretchT = new Float32Array(n).fill(-1);
    this.anchorAt = new Int32Array(n).fill(-1);
    this.tx = new Float32Array(n);
    this.tz = new Float32Array(n);
    this.routes = new Array<number[] | null>(n).fill(null);
    this.nodes = nodesByComponent(graph);
    seats.forEach((s, k) => {
      if (s.node < 0) return;
      const l = this.seatsByNode.get(s.node);
      if (l) l.push(k);
      else this.seatsByNode.set(s.node, [k]);
    });

    // team tint per theme, accessory = integer part of aSeed (shader mode 8)
    const seed = new Float32Array(n);
    const col = new THREE.Color();
    spawns.forEach((s, i) => {
      const th = THEMES[s.theme];
      this.themeOf[i] = ['hq', 'coding', 'marketing', 'qa', 'design', 'devops', 'research'].indexOf(
        s.theme,
      );
      col.set(
        th.teamTints[Math.floor(this.phase[i] * 7.31 * th.teamTints.length) % th.teamTints.length],
      );
      this.mesh.setColorAt(i, col);
      seed[i] = th.accessory + Math.min(this.phase[i], 0.999);
    });
    this.mesh.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));

    for (let i = 0; i < n; i++) this.spawn(i, spawns[i]);
  }

  private spawn(i: number, s: WorkerSpawn): void {
    const g = this.graph;
    this.compOf[i] = s.comp;
    this.islandOf[i] = s.island;
    this.cool[i] = this.range(i, 0, WORKERS.wave.cooldown[1]);
    if (s.seat >= 0) {
      // seated at t = 0, typing already, with a hashed time left
      const seat = this.seats[s.seat];
      this.seatOf[i] = s.seat;
      this.seatOwner[s.seat] = i;
      this.na[i] = this.nb[i] = Math.max(0, seat.node);
      this.anchorAt[i] = s.anchor;
      this.x[i] = seat.x;
      this.z[i] = seat.z;
      this.hd[i] = seat.hd;
      this.sitAmt[i] = 1;
      this.typeAmt[i] = WORKERS.typeAmount[seat.pose] ?? 0;
      this.state[i] = W_WORK;
      this.timer[i] = 0;
      this.dur[i] = this.range(i, 8, WORKERS.desk[1]);
      this.stretchIn[i] = this.range(i, WORKERS.stretch[0], WORKERS.stretch[1]);
      this.y[i] = this.ground(seat.x, seat.z) - seat.sit;
    } else if (s.comp >= 0) {
      this.na[i] = this.nb[i] = s.node;
      this.x[i] = g.x[s.node];
      this.z[i] = g.z[s.node];
      this.y[i] = this.nodeY(s.node);
      const nb = g.adj[s.node];
      this.hd[i] =
        nb.length > 0
          ? Math.atan2(g.z[nb[0]] - g.z[s.node], g.x[nb[0]] - g.x[s.node])
          : this.draw(i) * TAU;
      this.state[i] = W_PAUSE;
      this.dur[i] = this.range(i, 0.2, WORKERS.pauseNode[1]);
      this.timer[i] = this.draw(i) * this.dur[i];
    } else {
      const a = this.anchors[s.island][s.anchor];
      this.anchorAt[i] = s.anchor;
      this.x[i] = a.x;
      this.z[i] = a.z;
      this.y[i] = this.ground(a.x, a.z);
      this.hd[i] = this.draw(i) * TAU;
      this.state[i] = W_PAUSE;
      this.dur[i] = this.range(i, WORKERS.outpost.pause[0], WORKERS.outpost.pause[1]);
      this.timer[i] = this.draw(i) * this.dur[i];
    }
    this.yaw[i] = -this.hd[i];
    this.look[i] = this.hd[i];
    this.spawned[i] = 1;
    this.gPose[i] = this.typeAmt[i] > 0 ? 2 + this.typeAmt[i] : 0;
    this.setGait(i);
    this.snap(i);
  }

  private nodeY(node: number): number {
    const d = this.graph.deckY[node];
    return (
      (Number.isNaN(d) ? this.ctx.h(this.graph.x[node], this.graph.z[node]) : d) + LAND.footLift
    );
  }

  /** Click emote: turn to the camera and wave (also while seated), then carry on. */
  wave(i: number): boolean {
    if (!(i >= 0 && i < this.capacity) || this.vis[i] !== 1) return false;
    const s = this.state[i];
    if (s === W_ENTER || s === W_EXIT) return false;
    const V = WORKERS.wave;
    if (s !== W_WAVE) {
      this.prev[i] = s;
      this.state[i] = W_WAVE;
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
    const r = WORKERS.wave.radius;
    return dx * dx + dy * dy + dz * dz < r * r;
  }

  /** Piers hidden by flooding: their ends stop being trip targets. */
  setDocksHidden(docks: ReadonlySet<number>): void {
    const ends = new Set<number>();
    if (docks.size)
      for (let k = 0; k < this.graph.n; k++)
        if (this.graph.dockOf[k] >= 0 && docks.has(this.graph.dockOf[k])) ends.add(k);
    this.hiddenEnds = ends;
  }

  /** Lots (indices into `world.lots`) hidden by flooding: nobody sits down in them (TASK-333 hook). */
  setLotsHidden(lots: ReadonlySet<number>): void {
    this.hiddenLots = lots;
  }

  /** Seated (WORK) workers, for tests / QA. */
  get seated(): number {
    let c = 0;
    for (let i = 0; i < this.capacity; i++) if (this.active[i] && this.state[i] === W_WORK) c++;
    return c;
  }

  stateOf(i: number): number {
    return this.state[i];
  }

  // -------------------------------------------------------------------------

  private freeSeat(i: number, list: readonly number[] | undefined): number {
    if (!list) return -1;
    const free = list.filter(
      (k) => this.seatOwner[k] < 0 && !this.hiddenLots.has(this.seats[k].lot),
    );
    if (free.length === 0) return -1;
    return free[Math.floor(this.draw(i) * free.length) % free.length];
  }

  /** Start ENTER: door → (entrance) → seat. `fromX/Z` is where the worker stands now. */
  private beginEnter(i: number, k: number): void {
    const s = this.seats[k];
    this.seatOwner[k] = i;
    this.seatOf[i] = k;
    let n = 0;
    if (!Number.isNaN(s.ex)) {
      this.wx[i * WP + n] = s.ex;
      this.wz[i * WP + n] = s.ez;
      n++;
    }
    this.wx[i * WP + n] = s.x;
    this.wz[i * WP + n] = s.z;
    n++;
    this.wn[i] = n;
    this.wi[i] = 0;
    this.state[i] = W_ENTER;
    this.timer[i] = 0;
  }

  /** Stand up, then walk back out through the entrance to the door. */
  private beginExit(i: number): void {
    const s = this.seats[this.seatOf[i]];
    let n = 0;
    if (!Number.isNaN(s.ex)) {
      this.wx[i * WP + n] = s.ex;
      this.wz[i * WP + n] = s.ez;
      n++;
    }
    const outpost = this.compOf[i] < 0;
    this.wx[i * WP + n] = outpost ? s.dx : this.graph.x[s.node];
    this.wz[i * WP + n] = outpost ? s.dz : this.graph.z[s.node];
    n++;
    this.wn[i] = n;
    this.wi[i] = 0;
    this.state[i] = W_EXIT;
    this.timer[i] = 0;
  }

  /** Choose the next destination (a door / hub, sometimes a dock end) and a route to it. */
  private planTrip(i: number): boolean {
    const c = this.compOf[i];
    const here = this.na[i];
    const all = this.nodes.docks[c];
    const hidden = this.hiddenEnds;
    const docks = hidden.size ? all.filter((k) => !hidden.has(k)) : all;
    const doors = this.nodes.targets[c];
    const pool =
      docks.length > 0 && (doors.length === 0 || this.draw(i) < WORKERS.dockChance)
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

  /** Outpost: next anchor with a clear straight line (round robin, then any). */
  private planLoop(i: number): boolean {
    const list = this.anchors[this.islandOf[i]];
    const at = this.anchorAt[i];
    for (let t = 1; t < list.length; t++) {
      const k = (at + t) % list.length;
      if (!lineOk(this.mask, this.x[i], this.z[i], list[k].x, list[k].z)) continue;
      this.tx[i] = list[k].x;
      this.tz[i] = list[k].z;
      this.anchorAt[i] = k;
      return true;
    }
    return false;
  }

  private pauseFor(i: number): number {
    if (this.compOf[i] < 0)
      return this.range(i, WORKERS.outpost.pause[0], WORKERS.outpost.pause[1]);
    const k = this.graph.kind[this.na[i]];
    const [lo, hi] =
      k === NodeKind.dockEnd
        ? WORKERS.pauseDock
        : k === NodeKind.door || k === NodeKind.hub
          ? WORKERS.pauseDoor
          : WORKERS.pauseNode;
    return this.range(i, lo, hi);
  }

  /** Seats on offer at the worker's current stop. */
  private seatsHere(i: number): readonly number[] | undefined {
    if (this.compOf[i] >= 0) return this.seatsByNode.get(this.na[i]);
    const a = this.anchors[this.islandOf[i]][this.anchorAt[i]];
    if (!a || a.lot < 0) return undefined;
    const out: number[] = [];
    this.seats.forEach((s, k) => {
      if (s.lot === a.lot) out.push(k);
    });
    return out;
  }

  private endPause(i: number): void {
    // a free seat at this door? go in and sit down
    const list = this.seatsHere(i);
    if (list && list.length > 0 && this.draw(i) < WORKERS.enterChance) {
      const k = this.freeSeat(i, list);
      if (k >= 0) {
        this.beginEnter(i, k);
        return;
      }
    }
    if (this.compOf[i] >= 0) {
      if (this.planTrip(i)) {
        this.state[i] = W_WALK;
        this.timer[i] = 0;
        return;
      }
    } else if (this.planLoop(i)) {
      this.state[i] = W_LOOP;
      this.timer[i] = 0;
      return;
    }
    this.timer[i] = 0;
    this.dur[i] = this.pauseFor(i);
  }

  protected stepAgent(i: number, dt: number, _t: number): void {
    const V = WORKERS;
    const g = this.graph;
    const m = this.motionScale;
    this.cool[i] -= dt;
    let s = this.state[i];
    const idle = s === W_WALK || s === W_PAUSE || s === W_LOOP || s === W_WORK;
    if (idle && this.cool[i] <= 0 && this.tier >= V.wave.minTier && this.near(i)) {
      this.prev[i] = s;
      this.state[i] = s = W_WAVE;
      this.timer[i] = 0;
      this.waveLen[i] = V.wave.seconds;
      this.cool[i] = this.range(i, V.wave.cooldown[0], V.wave.cooldown[1]) + V.wave.seconds;
    }
    let moving = 0;
    let want = this.hd[i];
    let wave = 0;
    let typeTarget = 0;
    let sitTarget = 0;
    let stretch = 0;
    let turn: number = V.turnRate;

    if (s === W_WAVE) {
      this.timer[i] += dt;
      const t = this.timer[i];
      const len = this.waveLen[i];
      const down = len - V.wave.lower;
      wave =
        t < down ? springIn(t, V.wave.k, V.wave.c) : Math.max(0, 1 - (t - down) / V.wave.lower);
      const c = this.ctx.cameraPos;
      want = Math.atan2(c.z - this.z[i], c.x - this.x[i]);
      const back = this.prev[i];
      if (back === W_WORK) sitTarget = 1;
      if (t >= len) {
        this.state[i] = back;
        if (back === W_PAUSE) this.timer[i] = this.dur[i] * 0.5;
        this.look[i] = this.hd[i];
      }
    } else if (s === W_PAUSE) {
      this.timer[i] += dt;
      const sweep = Math.sin((this.timer[i] / 1.5) * TAU);
      const dock = this.compOf[i] >= 0 && g.kind[this.na[i]] === NodeKind.dockEnd;
      want = this.look[i] + (dock ? 0.25 : V.lookYaw) * sweep;
      if (this.timer[i] >= this.dur[i]) this.endPause(i);
    } else if (s === W_WORK) {
      const k = this.seatOf[i];
      const seat = this.seats[k];
      sitTarget = 1;
      want = seat.hd;
      turn = 14;
      this.timer[i] += dt;
      this.x[i] = seat.x;
      this.z[i] = seat.z;
      typeTarget = V.typeAmount[seat.pose] ?? 0;
      // stretch beat: lean back, one arm up, then back to typing
      if (this.stretchT[i] >= 0) {
        this.stretchT[i] += dt;
        const u = this.stretchT[i] / V.stretchSeconds;
        if (u >= 1) {
          this.stretchT[i] = -1;
          this.stretchIn[i] = this.range(i, V.stretch[0], V.stretch[1]);
        } else {
          stretch = Math.sin(Math.PI * u);
          typeTarget = 0;
        }
      } else {
        this.stretchIn[i] -= dt;
        if (this.stretchIn[i] <= 0) this.stretchT[i] = 0;
      }
      if (this.timer[i] >= this.dur[i] && this.stretchT[i] < 0) this.beginExit(i);
    } else if (s === W_ENTER || s === W_EXIT) {
      this.timer[i] += dt;
      if (s === W_EXIT && this.timer[i] < V.standSeconds) {
        // stand up first
        sitTarget = 0;
        want = this.seats[this.seatOf[i]].hd;
      } else {
        moving = 1;
        const wi = this.wi[i];
        const px = this.wx[i * WP + wi];
        const pz = this.wz[i * WP + wi];
        const dx = px - this.x[i];
        const dz = pz - this.z[i];
        const dist = Math.hypot(dx, dz);
        const step = V.seatSpeed * dt;
        want = dist > 1e-4 ? Math.atan2(dz, dx) : this.hd[i];
        if (step >= dist) {
          this.x[i] = px;
          this.z[i] = pz;
          this.wi[i]++;
          if (this.wi[i] >= this.wn[i]) this.finishLeg(i, s);
        } else {
          this.x[i] += (dx / dist) * step;
          this.z[i] += (dz / dist) * step;
        }
        if (this.state[i] === W_WORK) {
          moving = 0;
          want = this.seats[this.seatOf[i]].hd;
        }
      }
    } else if (s === W_LOOP) {
      moving = 1;
      const dx = this.tx[i] - this.x[i];
      const dz = this.tz[i] - this.z[i];
      const dist = Math.hypot(dx, dz);
      const step = V.outpost.speed * dt;
      want = Math.atan2(dz, dx);
      const nx = dist > 1e-4 ? this.x[i] + (dx / dist) * Math.min(step, dist) : this.x[i];
      const nz = dist > 1e-4 ? this.z[i] + (dz / dist) * Math.min(step, dist) : this.z[i];
      if (!this.mask(nx, nz)) {
        // blocked: give up this leg here
        this.state[i] = W_PAUSE;
        this.timer[i] = 0;
        this.dur[i] = this.pauseFor(i);
        moving = 0;
      } else {
        this.x[i] = nx;
        this.z[i] = nz;
        if (step >= dist) {
          this.state[i] = W_PAUSE;
          this.timer[i] = 0;
          this.dur[i] = this.pauseFor(i);
          this.look[i] = this.hd[i];
          moving = 0;
        }
      }
    } else if (s === W_WALK) {
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
        this.state[i] = W_PAUSE;
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

    // sit / stand easing and the typing spring (substeps keep k = 160 stable at the far-LOD step)
    this.sitAmt[i] += (sitTarget - this.sitAmt[i]) * damp(dt, V.sitLambda);
    if (Math.abs(this.sitAmt[i] - sitTarget) < 1e-3) this.sitAmt[i] = sitTarget;
    if (this.state[i] === W_WORK && this.sitAmt[i] < 0.6) typeTarget = 0;
    const sub = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / sub;
    for (let k = 0; k < sub; k++) {
      this.typeVel[i] +=
        (-V.typeK * (this.typeAmt[i] - typeTarget) - V.typeC * this.typeVel[i]) * h;
      this.typeAmt[i] += this.typeVel[i] * h;
    }
    if (typeTarget === 0 && Math.abs(this.typeAmt[i]) < 5e-3 && Math.abs(this.typeVel[i]) < 5e-2) {
      this.typeAmt[i] = 0;
      this.typeVel[i] = 0;
    }

    // feet
    const seated = this.seatOf[i] >= 0 && this.sitAmt[i] > 0;
    const a = this.na[i];
    const b = this.nb[i];
    if (s === W_ENTER || s === W_EXIT || s === W_WORK || this.compOf[i] < 0) {
      this.y[i] = this.ground(this.x[i], this.z[i]);
    } else {
      const da = g.deckY[a];
      const db = g.deckY[b];
      if (Number.isNaN(da) && Number.isNaN(db)) this.y[i] = this.ground(this.x[i], this.z[i]);
      else {
        const ya = this.nodeY(a);
        const yb = this.nodeY(b);
        this.y[i] = ya + (yb - ya) * (this.elen[i] > 0 ? this.u[i] : 0);
      }
    }
    if (seated) this.y[i] -= this.seats[this.seatOf[i]].sit * this.sitAmt[i];

    // turn, gait, hop
    this.hd[i] += wrapAngle(want - this.hd[i]) * damp(dt, turn);
    this.yaw[i] = -this.hd[i];
    this.gMove[i] += (moving - this.gMove[i]) * damp(dt, 8);
    const poseWave = wave > 0 ? wave : stretch * 0.7;
    const poseType = this.typeAmt[i] > 1e-3 && wave <= 0 ? this.typeAmt[i] : 0;
    this.gPose[i] = poseWave > 0 ? poseWave : poseType > 0 ? 2 + clamp(poseType, 0, 1.4) : 0;
    this.gPhase[i] += ((Math.PI * 2) / (2 * V.stepPeriod)) * dt * this.gMove[i];
    const hop = Math.abs(Math.sin(this.gPhase[i]));
    const k = this.gMove[i] * m;
    this.y[i] += V.hop * hop * k;
    const sq = 1 - V.squash * Math.pow(1 - hop, 4) * k + 0.05 * stretch * m;
    this.sy[i] = sq;
    this.sx[i] = this.sz[i] = 1 / Math.sqrt(sq);
    this.roll[i] = V.sway * Math.sin(this.gPhase[i]) * k;
    this.pitch[i] = 0.14 * stretch * m;
    this.setGait(i);
  }

  /** End of the ENTER / EXIT waypoints. */
  private finishLeg(i: number, s: number): void {
    const V = WORKERS;
    if (s === W_ENTER) {
      this.state[i] = W_WORK;
      this.timer[i] = 0;
      this.dur[i] = this.range(i, V.desk[0], V.desk[1]);
      this.stretchIn[i] = this.range(i, V.stretch[0], V.stretch[1]);
      this.stretchT[i] = -1;
      return;
    }
    // back at the door: free the seat and rejoin the graph / loop
    const k = this.seatOf[i];
    const seat = this.seats[k];
    this.seatOwner[k] = -1;
    this.seatOf[i] = -1;
    this.sitAmt[i] = 0;
    this.state[i] = W_PAUSE;
    this.timer[i] = 0;
    if (this.compOf[i] >= 0) {
      this.na[i] = this.nb[i] = seat.node;
      this.u[i] = 0;
      this.elen[i] = 0;
    } else {
      const at = this.anchors[this.islandOf[i]].findIndex((a) => a.lot === seat.lot);
      if (at >= 0) this.anchorAt[i] = at;
    }
    this.dur[i] = this.pauseFor(i);
    this.look[i] = this.hd[i];
  }
}

/** Walk graph plus the mask outpost loops are checked against. */
export interface WorkerBuild {
  graph: WalkGraph;
  mask: Mask;
}

/** Spawn the workers the world supports, within the quality's count; undefined when none fit. */
export function createWorkers(
  o: LandOpts,
  ctx: LifeCtx,
  plan: LifePlan,
  b: WorkerBuild,
): Workers | undefined {
  if (plan.workers <= 0) return undefined;
  const wp = planWorkers(ctx, b.graph, b.mask, plan.workers, ctx.rngFor('workers'));
  if (wp.spawns.length === 0) return undefined;
  return new Workers(o, ctx, b.graph, wp.seats, wp.anchors, b.mask, wp.spawns);
}
