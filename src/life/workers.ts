import * as THREE from 'three';
import {
  ACTIVITY,
  LAND,
  LAND_COLORS,
  WORKERS,
  type ItineraryStep,
  type LifePlan,
} from '../content/life.ts';
import { CARRIED_ITEM_SLOT, THEMES } from '../content/themes.ts';
import { springIn } from '../core/math/spring.ts';
import { wrapAngle } from './agents.ts';
import type { LifeCtx } from './ctx.ts';
import { buildWorker } from './geo/workers.ts';
import { unitHash } from '../core/hash.ts';
import { buildStops, islandComps, type Stop } from './activity-world.ts';
import { LandKind, nodesByComponent, type LandOpts, type WorldNodes } from './land.ts';
import { lineOk, NodeKind, walkRoute, type Mask, type WalkGraph } from './land-world.ts';
import { ITEM_STRIDE } from './life-material.ts';
import {
  planAmbient,
  planWorkers,
  type Anchor,
  type Seat,
  type WorkerSpawn,
} from './workers-world.ts';

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
/** Straight walk from a node (or the spot an outpost bot stands) to a stop. */
const W_LEG = 7;
/** At a stop: working a spot, waiting in / ordering at a queue, loitering at the hub. */
const W_USE = 8;
/** Walk back from a stop (or a chat) to the node. */
const W_BACK = 9;
const W_CHAT = 10;

// goal kinds (itinerary step in progress)
const G_NONE = 0;
const G_SEAT = 1;
const G_SPOT = 2;
const G_QUEUE = 3;
const G_HUB = 4;
const G_DOCK = 5;

const THEME_ORDER = ['hq', 'coding', 'marketing', 'qa', 'design', 'devops', 'research'];
/** Shader item code = slot - 6 (life-material.ts two-slot decode). */
const ITEM_CODE: Record<string, number> = {
  laptop: CARRIED_ITEM_SLOT.laptop - 6,
  clipboard: CARRIED_ITEM_SLOT.clipboard - 6,
  crate: CARRIED_ITEM_SLOT.crate - 6,
  paintPot: CARRIED_ITEM_SLOT.paintPot - 6,
};

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

  // ---- M14c living close-up (TASK-383)
  /** Slots `[0, residents)` are the always-on workers, the rest near-focus ambient slots. */
  readonly residents: number;
  /** Carried item code per worker: 0 none, else CARRIED_ITEM_SLOT − 6 (laptop 1 … paintPot 4). */
  readonly item: Uint8Array;
  /** Island whose campus the camera is focused on (−1 = none). */
  focus = -1;
  private readonly accOf: Uint8Array;
  private readonly seedArr: Float32Array;
  private readonly seedAttr: THREE.InstancedBufferAttribute;
  private seedDirty = false;
  private readonly gStep: Int16Array;
  private readonly gKind: Uint8Array;
  private readonly gStop: Int32Array;
  private readonly gLot: Int32Array;
  private readonly byGoal: Uint8Array;
  private readonly rankOf: Uint8Array;
  private readonly wakes: Uint8Array;
  private readonly phaseUse: Uint8Array;
  private readonly useMove: Uint8Array;
  private readonly bx: Float32Array;
  private readonly bz: Float32Array;
  private readonly partner: Int32Array;
  private readonly chatLen: Float32Array;
  private readonly chatSwap: Float32Array;
  private readonly chatCool: Float32Array;
  private readonly stopOwner: Int32Array;
  private readonly stopsBy = new Map<string, number[]>();
  private readonly lotSeats = new Map<number, number[]>();
  private readonly lotsBy = new Map<string, number[]>();
  private readonly seatsOfIsland: number[][];
  private readonly hubNode: Int32Array;
  private readonly hubX: Float32Array;
  private readonly hubZ: Float32Array;
  private readonly itins: readonly (readonly ItineraryStep[])[];
  /** Outpost walking mask: the tight work-spot margins (bots may brush props), skip nothing. */
  private readonly tight: Mask;
  private readonly stopMaskFn: (x: number, z: number, skip: number) => boolean;

  constructor(
    o: LandOpts,
    ctx: LifeCtx,
    readonly graph: WalkGraph,
    readonly seats: Seat[],
    readonly anchors: Anchor[][],
    private readonly mask: Mask,
    spawns: WorkerSpawn[],
    readonly stops: Stop[] = [],
    stopMask?: (x: number, z: number, skip: number) => boolean,
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

    this.stopMaskFn = stopMask ?? ((x, z) => mask(x, z));
    this.tight = stopMask ? (x, z) => stopMask(x, z, 0) : mask;
    const firstAmbient = spawns.findIndex((s) => s.ambient);
    this.residents = firstAmbient < 0 ? n : firstAmbient;
    this.item = new Uint8Array(n);
    this.accOf = new Uint8Array(n);
    this.gStep = new Int16Array(n);
    this.gKind = new Uint8Array(n);
    this.gStop = new Int32Array(n).fill(-1);
    this.gLot = new Int32Array(n).fill(-1);
    this.byGoal = new Uint8Array(n);
    this.rankOf = new Uint8Array(n);
    this.wakes = new Uint8Array(n);
    {
      const seen = new Map<number, number>();
      for (let i = 0; i < n; i++) {
        const r = seen.get(spawns[i].island) ?? 0;
        this.rankOf[i] = r;
        seen.set(spawns[i].island, r + 1);
      }
    }
    this.phaseUse = new Uint8Array(n);
    this.useMove = new Uint8Array(n);
    this.bx = new Float32Array(n);
    this.bz = new Float32Array(n);
    this.partner = new Int32Array(n).fill(-1);
    this.chatLen = new Float32Array(n);
    this.chatSwap = new Float32Array(n);
    this.chatCool = new Float32Array(n);
    this.stopOwner = new Int32Array(stops.length).fill(-1);
    this.itins = THEME_ORDER.map((t) => ACTIVITY.itinerary[t] ?? []);
    const lots = ctx.world.lots ?? [];
    stops.forEach((st, k) => {
      const key = `${st.island}|${st.def}`;
      const l = this.stopsBy.get(key);
      if (l) l.push(k);
      else this.stopsBy.set(key, [k]);
    });
    seats.forEach((st, k) => {
      const l = this.lotSeats.get(st.lot);
      if (l) l.push(k);
      else this.lotSeats.set(st.lot, [k]);
    });
    for (const lot of this.lotSeats.keys()) {
      const key = `${lots[lot].islandId}|${lots[lot].defId}`;
      const l = this.lotsBy.get(key);
      if (l) l.push(lot);
      else this.lotsBy.set(key, [lot]);
    }
    const comps = islandComps(ctx.world, graph);
    this.seatsOfIsland = ctx.world.islands.map(() => []);
    seats.forEach((st, k) => {
      const c = comps[st.island];
      if (c < 0 ? !Number.isNaN(st.dx) : st.node >= 0 && graph.comp[st.node] === c)
        this.seatsOfIsland[st.island].push(k);
    });
    const ni = ctx.world.islands.length;
    this.hubNode = new Int32Array(ni).fill(-1);
    this.hubX = new Float32Array(ni);
    this.hubZ = new Float32Array(ni);
    ctx.world.islands.forEach((isl, id) => {
      this.hubX[id] = isl.cx;
      this.hubZ[id] = isl.cz;
    });
    for (const st of ctx.world.settlements ?? []) {
      if (st.hub.node >= 0 && st.hub.node < graph.n && graph.comp[st.hub.node] >= 0)
        this.hubNode[st.islandId] = st.hub.node;
      this.hubX[st.islandId] = st.hub.x;
      this.hubZ[st.islandId] = st.hub.z;
    }

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
      this.accOf[i] = th.accessory;
      seed[i] = th.accessory + Math.min(this.phase[i], 0.999);
    });
    this.seedArr = seed;
    this.seedAttr = new THREE.InstancedBufferAttribute(seed, 1);
    this.seedAttr.setUsage(THREE.DynamicDrawUsage);
    this.mesh.geometry.setAttribute('aSeed', this.seedAttr);

    for (let i = 0; i < n; i++) {
      this.gStep[i] =
        Math.floor(this.phase[i] * 97) % Math.max(1, this.itins[this.themeOf[i]].length);
      if (!spawns[i].ambient) this.spawn(i, spawns[i]);
      else {
        this.compOf[i] = spawns[i].comp;
        this.islandOf[i] = spawns[i].island;
        this.na[i] = this.nb[i] = Math.max(0, this.hubNode[spawns[i].island]);
      }
    }
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
      this.y[i] = this.floorY(s.seat) - seat.sit;
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

  /** Feet y at seat `k` when standing: the shell floor, or the terrain for legacy benches. */
  private floorY(k: number): number {
    const seat = this.seats[k];
    return Number.isNaN(seat.floor) ? this.ground(seat.x, seat.z) : seat.floor + LAND.footLift;
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
      if (!lineOk(this.tight, this.x[i], this.z[i], list[k].x, list[k].z)) continue;
      this.tx[i] = list[k].x;
      this.tz[i] = list[k].z;
      this.anchorAt[i] = k;
      return true;
    }
    // a lone anchor (or no clear line between them): potter about nearby
    for (let t = 0; t < 6; t++) {
      const a = this.draw(i) * TAU;
      const d = this.range(i, 1.5, 3.5);
      const nx = this.x[i] + Math.cos(a) * d;
      const nz = this.z[i] + Math.sin(a) * d;
      if (!this.tight(nx, nz) || !lineOk(this.tight, this.x[i], this.z[i], nx, nz)) continue;
      this.tx[i] = nx;
      this.tz[i] = nz;
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
    // an errand in progress: at its node now, start it (seat / stop / hub ring); a dock stay is over
    if (this.gKind[i] !== G_NONE && this.startGoal(i)) return;
    // the itinerary (desk -> kiosk queue -> meeting -> rack -> dock ...)
    if (this.planGoal(i)) return;
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
    const A = ACTIVITY;
    const g = this.graph;
    const m = this.motionScale;
    this.cool[i] -= dt;
    let s = this.state[i];
    const idle = s === W_WALK || s === W_PAUSE || s === W_LOOP || s === W_WORK || s === W_USE;
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
    let talkWave = 0;
    let talkSq = 0;
    let talkNod = 0;

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
      if (!this.tight(nx, nz)) {
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
        const gk = this.gKind[i];
        // an errand starts right away; a dock or a free wander gets its usual pause
        this.dur[i] = gk !== G_NONE && gk !== G_DOCK ? this.range(i, 0.15, 0.4) : this.pauseFor(i);
        this.look[i] = this.hd[i];
        moving = 0;
        if (gk === G_NONE) this.tryChat(i);
      } else {
        this.x[i] = g.x[a] + (g.x[b] - g.x[a]) * this.u[i];
        this.z[i] = g.z[a] + (g.z[b] - g.z[a]) * this.u[i];
        want = Math.atan2(g.z[b] - g.z[a], g.x[b] - g.x[a]);
      }
    } else if (s === W_LEG || s === W_BACK) {
      // straight walk to the stop (LEG) or back to the node / the spot we left (BACK)
      moving = 1;
      const px = s === W_LEG ? this.wx[i * WP] : this.bx[i];
      const pz = s === W_LEG ? this.wz[i * WP] : this.bz[i];
      const dx = px - this.x[i];
      const dz = pz - this.z[i];
      const dist = Math.hypot(dx, dz);
      const step = A.legSpeed * dt;
      want = dist > 1e-4 ? Math.atan2(dz, dx) : this.hd[i];
      if (step >= dist) {
        this.x[i] = px;
        this.z[i] = pz;
        moving = 0;
        if (s === W_LEG) this.arriveStop(i);
        else this.arriveBack(i);
      } else {
        this.x[i] += (dx / dist) * step;
        this.z[i] += (dz / dist) * step;
      }
    } else if (s === W_USE) {
      this.timer[i] += dt;
      const st = this.gStop[i] >= 0 ? this.stops[this.gStop[i]] : undefined;
      const pose = st ? st.pose : 'stand';
      want = st ? st.hd : this.look[i];
      typeTarget = V.typeAmount[pose] ?? 0;
      if (pose === 'look' || pose === 'inspect' || pose === 'rack')
        want += A.scan.yaw * Math.sin(TAU * (A.scan.hz * this.timer[i] + this.phase[i]));
      if (st && st.slot >= 0) {
        moving = this.stepQueue(i, st, dt);
        want = this.queueFacing(i, st, want);
      } else if (this.timer[i] >= this.dur[i]) this.beginBack(i);
      if (this.gKind[i] === G_HUB) {
        // loiterers drift around slowly and look about
        want = this.look[i] + 0.9 * Math.sin(TAU * (0.11 * this.timer[i] + this.phase[i]));
      }
      if (this.state[i] === W_USE && st && st.slot >= 0) {
        const t = this.timer[i];
        const talking = this.queueTalk(i, st);
        if (talking > 0) {
          talkSq = this.talkSquash(t, talking > 1);
          talkWave = talking > 1 ? this.talkGesture(t, i) : 0;
          talkNod = talking > 1 ? 0 : this.talkNodding(t);
        }
      }
    } else if (s === W_CHAT) {
      const p = this.partner[i];
      if (p < 0 || this.state[p] !== W_CHAT || this.partner[p] !== i) this.endChat(i);
      else {
        const C = A.chat;
        this.timer[i] += dt;
        const t = this.timer[i];
        const dx = this.x[p] - this.x[i];
        const dz = this.z[p] - this.z[i];
        const d = Math.hypot(dx, dz);
        want = Math.atan2(dz, dx);
        turn = 8;
        if (d > C.gap + 0.05) {
          const step = Math.min(C.approachSpeed * dt, (d - C.gap) * 0.5 + 1e-3);
          const nx = this.x[i] + (dx / d) * step;
          const nz = this.z[i] + (dz / d) * step;
          if (this.mask(nx, nz)) {
            this.x[i] = nx;
            this.z[i] = nz;
            moving = 1;
          }
        } else {
          const speaker = (Math.floor(t / this.chatSwap[i]) + (i < p ? 0 : 1)) % 2 === 0;
          talkSq = this.talkSquash(t, speaker);
          if (speaker) talkWave = this.talkGesture(t, i);
          else talkNod = this.talkNodding(t);
        }
        if (t >= this.chatLen[i]) this.endChat(i);
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
    const held = this.seatOf[i];
    if (held >= 0 && (s === W_ENTER || s === W_EXIT || s === W_WORK || s === W_WAVE)) {
      // at / walking to a desk: on the shell's floor (raised on the stilt lab), ramped at the door
      const seat = this.seats[held];
      const floor = this.floorY(held);
      const hasEx = !Number.isNaN(seat.ex);
      const outside =
        (s === W_ENTER && this.wi[i] === 0) ||
        (s === W_EXIT && this.wi[i] === this.wn[i] - 1 && this.timer[i] >= V.standSeconds);
      if (outside && !Number.isNaN(seat.floor)) {
        const rx = hasEx ? seat.ex : seat.x;
        const rz = hasEx ? seat.ez : seat.z;
        const t = clamp(Math.hypot(this.x[i] - rx, this.z[i] - rz) / V.floorRamp, 0, 1);
        this.y[i] = floor + (this.ground(this.x[i], this.z[i]) - floor) * t;
      } else this.y[i] = floor;
    } else if (s === W_ENTER || s === W_EXIT || s === W_WORK || this.compOf[i] < 0) {
      this.y[i] = this.ground(this.x[i], this.z[i]);
    } else {
      const da = g.deckY[a];
      const db = g.deckY[b];
      if (Number.isNaN(da) && Number.isNaN(db)) this.y[i] = this.ground(this.x[i], this.z[i]);
      else if (Number.isNaN(da) || Number.isNaN(db)) {
        // deck ↔ land edge: on the deck until the ground (sampled here, not lerped between the
        // nodes) rises above it, so feet neither float over convex ground nor sink into a bank
        this.y[i] = Math.max(
          this.nodeY(Number.isNaN(da) ? b : a),
          this.ground(this.x[i], this.z[i]),
        );
      } else {
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
    const poseWave = wave > 0 ? wave : Math.max(stretch * 0.7, talkWave);
    const poseType = this.typeAmt[i] > 1e-3 && wave <= 0 ? this.typeAmt[i] : 0;
    this.gPose[i] = poseWave > 0 ? poseWave : poseType > 0 ? 2 + clamp(poseType, 0, 1.4) : 0;
    this.gPhase[i] += ((Math.PI * 2) / (2 * V.stepPeriod)) * dt * this.gMove[i];
    const hop = Math.abs(Math.sin(this.gPhase[i]));
    const k = this.gMove[i] * m;
    this.y[i] += V.hop * hop * k;
    const sq = 1 - V.squash * Math.pow(1 - hop, 4) * k + 0.05 * stretch * m + talkSq * m;
    this.sy[i] = sq;
    this.sx[i] = this.sz[i] = 1 / Math.sqrt(sq);
    this.roll[i] = V.sway * Math.sin(this.gPhase[i]) * k;
    this.pitch[i] = 0.14 * stretch * m + talkNod * m;
    this.setGait(i);
  }

  /** End of the ENTER / EXIT waypoints. */
  private finishLeg(i: number, s: number): void {
    const V = WORKERS;
    if (s === W_ENTER) {
      this.state[i] = W_WORK;
      this.timer[i] = 0;
      this.dur[i] = this.byGoal[i]
        ? this.range(i, ACTIVITY.desk[0], ACTIVITY.desk[1])
        : this.range(i, V.desk[0], V.desk[1]);
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

  // =========================================================================
  // Living close-up (M14c, TASK-383): itinerary, stops, chat, focus.

  private setItem(i: number, code: number): void {
    if (this.item[i] === code) return;
    this.item[i] = code;
    this.seedArr[i] = this.accOf[i] + ITEM_STRIDE * code + Math.min(this.phase[i], 0.999);
    this.seedDirty = true;
  }

  override update(alpha: number): void {
    if (this.seedDirty) {
      this.seedAttr.needsUpdate = true;
      this.seedDirty = false;
    }
    super.update(alpha);
  }

  private releaseGoal(i: number): void {
    const st = this.gStop[i];
    if (st >= 0 && this.stopOwner[st] === i) this.stopOwner[st] = -1;
    this.gKind[i] = G_NONE;
    this.gStop[i] = -1;
    this.gLot[i] = -1;
  }

  /** Free stop of a spot / queue goal (queue: the lowest free slot of a random line), or −1. */
  private pickStop(i: number, goal: ItineraryStep['goal'], check: boolean): number {
    const isl = this.islandOf[i];
    const c = this.compOf[i];
    const cands: number[] = [];
    if (goal.kind === 'spot') {
      for (const d of goal.defs)
        for (const k of this.stopsBy.get(`${isl}|${d}`) ?? []) {
          const st = this.stops[k];
          if (this.stopOwner[k] >= 0 || st.comp !== c) continue;
          if (
            c < 0 &&
            check &&
            !lineOk((x, z) => this.stopMaskFn(x, z, st.tag), this.x[i], this.z[i], st.x, st.z)
          )
            continue;
          cands.push(k);
        }
    } else if (goal.kind === 'queue') {
      for (const k of this.stopsBy.get(`${isl}|${goal.def}`) ?? []) {
        const st = this.stops[k];
        if (st.slot !== 0 || st.comp !== c) continue;
        for (let q = 0; q < ACTIVITY.queue.length; q++) {
          const at = k + q;
          if (at >= this.stops.length || this.stops[at].head !== k) break;
          if (this.stopOwner[at] < 0) {
            cands.push(at);
            break;
          }
        }
      }
    }
    if (cands.length === 0) return -1;
    return check
      ? this.nearest(i, cands, (k) => this.stops[k])
      : cands[Math.floor(this.draw(i) * cands.length) % cands.length];
  }

  /** One of the (up to) three candidates nearest to worker `i`: errands stay local, not cross-island. */
  private nearest(i: number, cands: number[], at: (k: number) => { x: number; z: number }): number {
    if (cands.length <= 1) return cands[0];
    const x = this.x[i];
    const z = this.z[i];
    const scored = cands
      .map((k) => ({ k, d: Math.hypot(at(k).x - x, at(k).z - z) }))
      .sort((a, b) => a.d - b.d || a.k - b.k);
    const n = Math.min(3, scored.length);
    return scored[Math.floor(this.draw(i) * n) % n].k;
  }

  /** Walk to graph node `to` (or just pause when already there) and remember the errand. */
  private routeTo(i: number, to: number, kind: number, stop: number, lot: number): boolean {
    const here = this.na[i];
    if (to !== here) {
      const r = walkRoute(this.graph, here, to);
      if (!r || r.length < 2) return false;
      this.routes[i] = r;
      this.ridx[i] = 1;
      this.nb[i] = r[1];
      this.u[i] = 0;
      this.elen[i] = Math.hypot(
        this.graph.x[r[1]] - this.graph.x[here],
        this.graph.z[r[1]] - this.graph.z[here],
      );
      this.state[i] = W_WALK;
    } else {
      this.state[i] = W_PAUSE;
      this.dur[i] = this.range(i, 0.1, 0.3);
    }
    this.timer[i] = 0;
    this.gKind[i] = kind;
    this.gStop[i] = stop;
    this.gLot[i] = lot;
    if (stop >= 0) this.stopOwner[stop] = i;
    return true;
  }

  private tryGoal(i: number, step: ItineraryStep): boolean {
    const goal = step.goal;
    const c = this.compOf[i];
    const isl = this.islandOf[i];
    if (goal.kind === 'dock') {
      if (c < 0) return false;
      const all = this.nodes.docks[c];
      const docks = this.hiddenEnds.size ? all.filter((k) => !this.hiddenEnds.has(k)) : all;
      if (docks.length === 0) return false;
      const to = docks[Math.floor(this.draw(i) * docks.length) % docks.length];
      return to !== this.na[i] && this.routeTo(i, to, G_DOCK, -1, -1);
    }
    if (goal.kind === 'hub') {
      const to = c < 0 ? -1 : this.hubNode[isl];
      return to >= 0 && this.routeTo(i, to, G_HUB, -1, -1);
    }
    if (goal.kind === 'seat') {
      if (c < 0) return false;
      const lots: number[] = [];
      for (const d of goal.defs)
        for (const lot of this.lotsBy.get(`${isl}|${d}`) ?? []) {
          const list = this.lotSeats.get(lot) as number[];
          const node = this.seats[list[0]].node;
          if (this.hiddenLots.has(lot) || node < 0 || this.graph.comp[node] !== c) continue;
          if (list.some((k) => this.seatOwner[k] < 0)) lots.push(lot);
        }
      if (lots.length === 0) return false;
      const lot = this.nearest(i, lots, (l) => this.ctx.world.lots[l]);
      const node = this.seats[(this.lotSeats.get(lot) as number[])[0]].node;
      return this.routeTo(i, node, G_SEAT, -1, lot);
    }
    const k = this.pickStop(i, goal, true);
    if (k < 0) return false;
    const queue = this.stops[k].slot >= 0;
    if (c < 0) {
      // outpost: straight line from where we stand
      this.stopOwner[k] = i;
      this.gKind[i] = G_SPOT;
      this.gStop[i] = k;
      this.beginLeg(i, this.stops[k].x, this.stops[k].z);
      return true;
    }
    return this.routeTo(i, this.stops[k].node, queue ? G_QUEUE : G_SPOT, k, -1);
  }

  /** Next itinerary step the island can serve; the carried item follows the step. */
  private planGoal(i: number, preferItem = false): boolean {
    const steps = this.itins[this.themeOf[i]];
    const n = steps.length;
    for (let k = 0; k < (preferItem ? 2 * n : n); k++) {
      const si = (this.gStep[i] + k) % n;
      // first sweep: only steps that carry something (a walker that starts with a laptop / clipboard)
      if (preferItem && k < n && !steps[si].item) continue;
      if (!this.tryGoal(i, steps[si])) continue;
      this.gStep[i] = (si + 1) % n;
      const it = steps[si].item;
      this.setItem(i, it ? ITEM_CODE[it] : 0);
      return true;
    }
    return false;
  }

  /** At the goal's node after the arrival pause: go in, walk to the stop, take a hub ring spot. */
  private startGoal(i: number): boolean {
    const gk = this.gKind[i];
    if (gk === G_SEAT) {
      const list = this.lotSeats.get(this.gLot[i]);
      const k = this.freeSeat(i, list);
      this.releaseGoal(i);
      if (k < 0) return false;
      this.byGoal[i] = 1;
      this.beginEnter(i, k);
      return true;
    }
    if (gk === G_SPOT || gk === G_QUEUE) {
      const st = this.stops[this.gStop[i]];
      this.beginLeg(i, st.x, st.z);
      return true;
    }
    if (gk === G_HUB) {
      const node = this.na[i];
      const hx = this.graph.x[node];
      const hz = this.graph.z[node];
      const a = (this.phase[i] * 7 + this.draw(i)) * TAU;
      let tx = hx + Math.cos(a) * ACTIVITY.ring;
      let tz = hz + Math.sin(a) * ACTIVITY.ring;
      if (!this.mask(tx, tz) || !lineOk(this.mask, hx, hz, tx, tz)) {
        tx = hx;
        tz = hz;
      }
      this.look[i] = Math.atan2(hz - tz, hx - tx);
      this.beginLeg(i, tx, tz);
      return true;
    }
    this.releaseGoal(i);
    return false;
  }

  private beginLeg(i: number, x: number, z: number): void {
    this.wx[i * WP] = x;
    this.wz[i * WP] = z;
    if (this.compOf[i] >= 0) {
      const n = this.na[i];
      this.bx[i] = this.graph.x[n];
      this.bz[i] = this.graph.z[n];
      this.nb[i] = n;
      this.u[i] = 0;
      this.elen[i] = 0;
    } else {
      this.bx[i] = this.x[i];
      this.bz[i] = this.z[i];
    }
    this.state[i] = W_LEG;
    this.timer[i] = 0;
  }

  private arriveStop(i: number): void {
    this.state[i] = W_USE;
    this.timer[i] = 0;
    this.phaseUse[i] = 0;
    this.useMove[i] = 0;
    if (this.gKind[i] === G_HUB) {
      this.dur[i] = this.range(i, ACTIVITY.loiter[0], ACTIVITY.loiter[1]);
      this.tryChat(i);
      return;
    }
    const st = this.stops[this.gStop[i]];
    if (st.slot >= 0) {
      if (st.slot === 0) this.startOrder(i);
    } else {
      const [lo, hi] = ACTIVITY.use[st.pose] ?? ACTIVITY.use.stand;
      this.dur[i] = this.range(i, lo, hi);
    }
  }

  private startOrder(i: number): void {
    this.phaseUse[i] = 1;
    this.timer[i] = 0;
    this.dur[i] = this.range(i, ACTIVITY.order[0], ACTIVITY.order[1]);
  }

  /** Queue behaviour: shuffle forward when the slot ahead frees, order at the front. Returns 1 while moving. */
  private stepQueue(i: number, st: Stop, dt: number): number {
    if (this.useMove[i]) {
      const dx = st.x - this.x[i];
      const dz = st.z - this.z[i];
      const dist = Math.hypot(dx, dz);
      const step = 0.8 * dt;
      if (step >= dist) {
        this.x[i] = st.x;
        this.z[i] = st.z;
        this.useMove[i] = 0;
        if (st.slot === 0) this.startOrder(i);
      } else {
        this.x[i] += (dx / dist) * step;
        this.z[i] += (dz / dist) * step;
      }
      return 1;
    }
    if (this.phaseUse[i] === 0) {
      const k = this.gStop[i];
      if (st.slot > 0 && this.stopOwner[k - 1] < 0) {
        this.stopOwner[k] = -1;
        this.stopOwner[k - 1] = i;
        this.gStop[i] = k - 1;
        this.useMove[i] = 1;
      } else if (this.timer[i] > 45) this.beginBack(i);
    } else if (this.timer[i] >= this.dur[i]) this.beginBack(i);
    return 0;
  }

  /** Who a queue member talks to: 0 none, 1 listener, 2 speaker (pairs of slots 1-2, 3-4 ...). */
  private queueTalk(i: number, st: Stop): number {
    if (st.slot < 1 || this.useMove[i] || this.phaseUse[i] !== 0) return 0;
    const q = st.slot % 2 === 1 ? st.slot + 1 : st.slot - 1;
    const at = st.head + q;
    if (at >= this.stops.length || this.stops[at].head !== st.head) return 0;
    const j = this.stopOwner[at];
    if (j < 0 || this.state[j] !== W_USE || this.useMove[j] || this.phaseUse[j] !== 0) return 0;
    const pair = (Math.min(st.slot, q) - 1) >> 1;
    const win = Math.floor((this.simT + 5 * unitHash(this.seed, st.head, pair)) / 3.1);
    if (unitHash(this.seed ^ 0x5a17, st.head * 7 + pair, win) > 0.62) return 0;
    const speaker = (Math.floor(this.simT / 1.6) + st.slot) % 2 === 0;
    return speaker ? 2 : 1;
  }

  /** Heading of a queue member: to the kiosk, or to the neighbour it is chatting with. */
  private queueFacing(i: number, st: Stop, front: number): number {
    if (this.queueTalk(i, st) > 0) {
      const q = st.slot % 2 === 1 ? st.slot + 1 : st.slot - 1;
      const o = this.stops[st.head + q];
      return Math.atan2(o.z - this.z[i], o.x - this.x[i]);
    }
    return front;
  }

  private talkSquash(t: number, speaker: boolean): number {
    const B = ACTIVITY.chat.bob;
    return speaker ? -B.squash * Math.abs(Math.sin(Math.PI * B.hz * t)) : 0;
  }

  private talkGesture(t: number, i: number): number {
    return ACTIVITY.chat.gesture * Math.max(0, Math.sin(TAU * (0.55 * t + this.phase[i])));
  }

  private talkNodding(t: number): number {
    const N = ACTIVITY.chat.nod;
    return N.pitch * Math.sin(TAU * N.hz * t);
  }

  private beginBack(i: number): void {
    this.releaseGoal(i);
    this.state[i] = W_BACK;
    this.timer[i] = 0;
    this.useMove[i] = 0;
  }

  private arriveBack(i: number): void {
    this.state[i] = W_PAUSE;
    this.timer[i] = 0;
    this.dur[i] = this.range(i, 0.3, 0.9);
    this.look[i] = this.hd[i];
    if (this.compOf[i] >= 0) this.nb[i] = this.na[i];
  }

  /** Can `j` be pulled into a chat started by `i` right now? */
  private chatty(i: number, j: number): boolean {
    if (j === i || !this.active[j] || this.vis[j] !== 1 || this.islandOf[j] !== this.islandOf[i])
      return false;
    if (this.partner[j] >= 0 || this.chatCool[j] > 0) return false;
    const s = this.state[j];
    const gk = this.gKind[j];
    const free =
      (s === W_PAUSE && this.timer[j] < this.dur[j] - 0.8 && (gk === G_NONE || gk === G_DOCK)) ||
      (s === W_USE && gk === G_HUB);
    if (!free) return false;
    if (this.compOf[j] >= 0 && !Number.isNaN(this.graph.deckY[this.na[j]])) return false;
    return Math.hypot(this.x[j] - this.x[i], this.z[j] - this.z[i]) < ACTIVITY.chat.range;
  }

  /** `i` just stopped: if a mate nearby is idle too, the two walk up to each other and talk. */
  private tryChat(i: number): void {
    if (this.chatCool[i] > 0 || this.partner[i] >= 0) return;
    if (this.compOf[i] >= 0 && !Number.isNaN(this.graph.deckY[this.na[i]])) return;
    if (this.draw(i) >= ACTIVITY.chat.chance) return;
    for (let j = 0; j < this.capacity; j++) {
      if (!this.chatty(i, j)) continue;
      this.beginChat(i, j);
      return;
    }
  }

  private beginChat(a: number, b: number): void {
    const C = ACTIVITY.chat;
    const len = this.range(a, C.seconds[0], C.seconds[1]);
    const swap = this.range(a, C.swap[0], C.swap[1]);
    for (const [me, other] of [
      [a, b],
      [b, a],
    ]) {
      this.partner[me] = other;
      this.state[me] = W_CHAT;
      this.timer[me] = 0;
      this.chatLen[me] = len;
      this.chatSwap[me] = swap;
      if (this.compOf[me] >= 0) {
        this.bx[me] = this.graph.x[this.na[me]];
        this.bz[me] = this.graph.z[this.na[me]];
      } else {
        this.bx[me] = this.x[me];
        this.bz[me] = this.z[me];
      }
      this.gKind[me] = G_NONE;
    }
  }

  private endChat(i: number): void {
    this.partner[i] = -1;
    this.chatCool[i] = this.range(i, ACTIVITY.chat.cooldown[0], ACTIVITY.chat.cooldown[1]);
    this.state[i] = W_BACK;
    this.timer[i] = 0;
  }

  // ---- focus: wake the ambient slots of the island the camera looks at

  private islDist: Float32Array = new Float32Array(0);

  /** Island hosting workers nearest the orbit target (hysteresis), re-evaluated every few steps. */
  private updateFocus(): void {
    const F = ACTIVITY.focus;
    if (this.tier < F.minTier) return;
    if (this.step !== 1 && this.step % F.every !== 0) return;
    const c = this.ctx.focusPos;
    const ni = this.hubX.length;
    const dist = new Float32Array(ni).fill(Infinity);
    for (let i = 0; i < this.capacity; i++) {
      const k = this.islandOf[i];
      if (dist[k] !== Infinity) continue;
      dist[k] = Math.hypot(
        c.x - this.hubX[k],
        c.y - this.ctx.h(this.hubX[k], this.hubZ[k]),
        c.z - this.hubZ[k],
      );
    }
    let best = -1;
    let bd: number = F.radius;
    for (let k = 0; k < ni; k++)
      if (dist[k] < bd) {
        bd = dist[k];
        best = k;
      }
    const cur = this.focus;
    if (cur >= 0 && best !== cur && dist[cur] <= F.radius && bd > dist[cur] * F.switchRatio)
      best = cur;
    this.islDist = dist;
    if (best !== cur || this.step === 1) {
      this.focus = best;
      this.rebalance();
    }
  }

  /**
   * Awake workers never exceed the resident count (= LIFE_PLAN.workers): the focused island gets all
   * its slots first, then the nearest islands' residents fill what is left.
   */
  private rebalance(): void {
    const n = this.capacity;
    const R = this.residents;
    const want = new Uint8Array(n);
    let used = 0;
    if (this.focus >= 0)
      for (let i = 0; i < n && used < R; i++)
        if (this.islandOf[i] === this.focus) {
          want[i] = 1;
          used++;
        }
    const order = Array.from(this.islDist.keys())
      .filter((k) => this.islDist[k] !== Infinity)
      .sort((a, b) => this.islDist[a] - this.islDist[b] || a - b);
    for (const k of order)
      for (let i = 0; i < R && used < R; i++)
        if (this.islandOf[i] === k && !want[i]) {
          want[i] = 1;
          used++;
        }
    for (let i = 0; i < n; i++) {
      const awake = this.spawned[i] === 1;
      if (want[i] && !awake) this.wake(i);
      else if (!want[i] && awake) this.sleep(i);
    }
  }

  private wake(i: number): void {
    this.place(i);
    if (this.tier < this.minTier) return;
    if (this.vis[i] === 0) {
      this.active[i] = 1;
      this.appearT[i] = this.simT + ACTIVITY.wake.stagger * this.draw(i);
    } else this.appearT[i] = this.simT;
    this.scale[i] = 0;
    this.vis[i] = 1;
    this.snap(i);
  }

  private sleep(i: number): void {
    const p = this.partner[i];
    if (p >= 0 && this.partner[p] === i) this.partner[p] = -1;
    this.partner[i] = -1;
    this.releaseGoal(i);
    const k = this.seatOf[i];
    if (k >= 0) {
      this.seatOwner[k] = -1;
      this.seatOf[i] = -1;
    }
    this.setItem(i, 0);
    this.sitAmt[i] = 0;
    this.state[i] = W_PAUSE;
    this.timer[i] = 0;
    this.dur[i] = 1e9;
    this.spawned[i] = 0;
    if (this.vis[i] === 1 && this.step > 1) {
      this.vis[i] = 2;
      this.leaveT[i] = this.simT;
    } else {
      this.vis[i] = 0;
      this.active[i] = 0;
      this.scale[i] = 0;
    }
  }

  /** Sit worker `i` at seat `k` right now (spawn, wake). */
  private seatNow(i: number, k: number): void {
    const seat = this.seats[k];
    this.seatOf[i] = k;
    this.seatOwner[k] = i;
    this.na[i] = this.nb[i] = Math.max(0, seat.node);
    if (this.compOf[i] < 0) {
      const at = this.anchors[this.islandOf[i]].findIndex((a) => a.lot === seat.lot);
      this.anchorAt[i] = Math.max(0, at);
    }
    this.x[i] = seat.x;
    this.z[i] = seat.z;
    this.hd[i] = seat.hd;
    this.sitAmt[i] = 1;
    this.typeAmt[i] = WORKERS.typeAmount[seat.pose] ?? 0;
    this.state[i] = W_WORK;
    this.timer[i] = 0;
    this.stretchIn[i] = this.range(i, WORKERS.stretch[0], WORKERS.stretch[1]);
    this.stretchT[i] = -1;
    this.y[i] = this.floorY(k) - seat.sit;
  }

  /** (Re)place a slot that wakes: seated, busy at a stop, or walking an errand; hashed per bot. */
  private place(i: number): void {
    const isl = this.islandOf[i];
    const c = this.compOf[i];
    this.spawned[i] = 1;
    this.releaseGoal(i);
    this.setItem(i, 0);
    this.partner[i] = -1;
    this.chatCool[i] = this.range(i, 0, 6);
    this.cool[i] = this.range(i, 0, WORKERS.wave.cooldown[1]);
    this.seatOf[i] = -1;
    this.sitAmt[i] = this.typeAmt[i] = this.typeVel[i] = 0;
    this.stretchT[i] = -1;
    this.byGoal[i] = 0;
    this.useMove[i] = 0;
    this.phaseUse[i] = 0;
    this.gMove[i] = 0;
    // first wake: a fixed mix by slot rank (a campus never starts with everybody seated or in a
    // line), later wakes: hashed
    const mode =
      ACTIVITY.startMix[
        (this.rankOf[i] + (this.wakes[i]++ > 0 ? Math.floor(this.draw(i) * 7) : 0)) %
          ACTIVITY.startMix.length
      ];
    let done = false;
    if (mode === 'S') done = this.placeSeated(i);
    else if (mode === 'B') done = this.placeBusy(i);
    if (!done) {
      if (c >= 0) this.placeWalking(i);
      else {
        const list = this.anchors[isl];
        const at = Math.floor(this.draw(i) * list.length) % list.length;
        this.anchorAt[i] = at;
        this.x[i] = list[at].x;
        this.z[i] = list[at].z;
        this.y[i] = this.ground(this.x[i], this.z[i]);
        this.hd[i] = this.draw(i) * TAU;
        this.state[i] = W_PAUSE;
        this.timer[i] = 0;
        this.dur[i] = this.range(i, 0.05, 0.6);
        this.planGoal(i, true);
      }
    }
    this.byGoal[i] = 1;
    this.yaw[i] = -this.hd[i];
    this.look[i] = this.hd[i];
    this.gPose[i] = this.typeAmt[i] > 0 ? 2 + this.typeAmt[i] : 0;
    this.setGait(i);
  }

  private placeSeated(i: number): boolean {
    const list = this.seatsOfIsland[this.islandOf[i]];
    const free = list.filter(
      (k) => this.seatOwner[k] < 0 && !this.hiddenLots.has(this.seats[k].lot),
    );
    if (free.length === 0) return false;
    this.seatNow(i, free[Math.floor(this.draw(i) * free.length) % free.length]);
    this.dur[i] = this.range(i, ACTIVITY.desk[0], ACTIVITY.desk[1]);
    this.timer[i] = this.draw(i) * this.dur[i] * 0.7;
    this.gPose[i] = 2 + this.typeAmt[i];
    // a laptop on the knees at a themed desk reads as work in progress
    const steps = this.itins[this.themeOf[i]];
    if (steps.some((s) => s.goal.kind === 'seat' && s.item === 'laptop') && this.draw(i) < 0.5)
      this.setItem(i, ITEM_CODE.laptop);
    return true;
  }

  /** Start in the middle of an errand: working a spot or waiting in a line. */
  private placeBusy(i: number): boolean {
    const steps = this.itins[this.themeOf[i]];
    const n = steps.length;
    for (let k = 0; k < n; k++) {
      const si = (this.gStep[i] + k) % n;
      const g = steps[si].goal;
      if (g.kind !== 'spot' && g.kind !== 'queue') continue;
      const stop = this.pickStop(i, g, false);
      if (stop < 0) continue;
      const st = this.stops[stop];
      // a line that already stands is not joined by the whole shift at once
      if (st.slot > ACTIVITY.queue.startMax - 1) continue;
      this.stopOwner[stop] = i;
      this.gStop[i] = stop;
      this.gKind[i] = st.slot >= 0 ? G_QUEUE : G_SPOT;
      this.gStep[i] = (si + 1) % n;
      const it = steps[si].item;
      this.setItem(i, it ? ITEM_CODE[it] : 0);
      this.x[i] = st.x;
      this.z[i] = st.z;
      this.y[i] = this.ground(st.x, st.z);
      this.hd[i] = st.hd;
      if (this.compOf[i] >= 0) {
        this.na[i] = this.nb[i] = st.node;
        this.bx[i] = this.graph.x[st.node];
        this.bz[i] = this.graph.z[st.node];
      } else {
        this.bx[i] = st.x;
        this.bz[i] = st.z;
      }
      this.state[i] = W_USE;
      this.u[i] = 0;
      this.elen[i] = 0;
      this.timer[i] = 0;
      if (st.slot === 0) this.startOrder(i);
      else if (st.slot < 0) {
        const [lo, hi] = ACTIVITY.use[st.pose] ?? ACTIVITY.use.stand;
        this.dur[i] = this.range(i, lo, hi);
        this.timer[i] = this.draw(i) * this.dur[i] * 0.6;
      }
      return true;
    }
    return false;
  }

  private placeWalking(i: number): void {
    const list = this.nodes.all[this.compOf[i]].filter((k) => Number.isNaN(this.graph.deckY[k]));
    let node = list[0];
    for (let t = 0; t < 8; t++) {
      const cand = list[Math.floor(this.draw(i) * list.length) % list.length];
      node = cand;
      let ok = true;
      for (let j = 0; j < this.capacity && ok; j++)
        if (j !== i && this.spawned[j] && this.islandOf[j] === this.islandOf[i])
          ok = Math.hypot(this.x[j] - this.graph.x[cand], this.z[j] - this.graph.z[cand]) > 2.5;
      if (ok) break;
    }
    this.na[i] = this.nb[i] = node;
    this.u[i] = 0;
    this.elen[i] = 0;
    this.x[i] = this.graph.x[node];
    this.z[i] = this.graph.z[node];
    this.y[i] = this.ground(this.x[i], this.z[i]);
    this.hd[i] = this.draw(i) * TAU;
    this.state[i] = W_PAUSE;
    this.timer[i] = 0;
    this.dur[i] = 0.05;
    if (!this.planGoal(i, true)) this.dur[i] = this.range(i, 0.2, 1.5);
  }

  protected override beginStep(dt: number, t: number): void {
    this.updateFocus();
    for (let i = 0; i < this.capacity; i++) if (this.chatCool[i] > 0) this.chatCool[i] -= dt;
    super.beginStep(dt, t);
  }

  /** Awake workers (alive slots), for tests / QA. */
  get awake(): number {
    let c = 0;
    for (let i = 0; i < this.capacity; i++) c += this.spawned[i];
    return c;
  }

  /** What the visible workers are doing, for tests / QA (the acceptance counters). */
  activity(island = -1): {
    awake: number;
    seated: number;
    transit: number;
    carrying: number;
    chatting: number;
    queueing: number;
    atStop: number;
  } {
    const o = { awake: 0, seated: 0, transit: 0, carrying: 0, chatting: 0, queueing: 0, atStop: 0 };
    for (let i = 0; i < this.capacity; i++) {
      if (!this.spawned[i] || this.vis[i] !== 1) continue;
      if (island >= 0 && this.islandOf[i] !== island) continue;
      o.awake++;
      const s = this.state[i];
      if (s === W_WORK) o.seated++;
      if (
        s === W_WALK ||
        s === W_LOOP ||
        s === W_LEG ||
        s === W_BACK ||
        s === W_ENTER ||
        s === W_EXIT
      )
        o.transit++;
      if (this.item[i] > 0) o.carrying++;
      if (s === W_CHAT) o.chatting++;
      if (s === W_USE) {
        o.atStop++;
        if (this.gKind[i] === G_QUEUE) o.queueing++;
      }
    }
    return o;
  }

  itemOf(i: number): number {
    return this.item[i];
  }
}

/** Walk graph plus the mask outpost loops are checked against. */
export interface WorkerBuild {
  graph: WalkGraph;
  mask: Mask;
  /** `mask` that ignores one fixture's own footprint (work spots beside a structure). */
  stopMask?: (x: number, z: number, skip: number) => boolean;
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
  const comps = islandComps(ctx.world, b.graph);
  const ambient = planAmbient(ctx, wp, comps, plan.ambientScale);
  const stops = buildStops(ctx.world, b.graph, b.mask, b.stopMask);
  return new Workers(
    o,
    ctx,
    b.graph,
    wp.seats,
    wp.anchors,
    b.mask,
    [...wp.spawns, ...ambient],
    stops,
    b.stopMask,
  );
}
