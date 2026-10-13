import type * as THREE from 'three';
import { BOAT_BOB } from '../content/anim.ts';
import { CULTURE_BOATS, ROWBOAT, SAILBOAT } from '../content/life.ts';
import { unitHash } from '../core/hash.ts';
import { arcLengths, pointAtLength, smoothPolyline, type Vec2 } from '../core/math/catmull-rom.ts';
import { PROP_GEO, buildProp } from '../geo/index.ts';
import { gustAt, swellY } from '../shared/fields.ts';
import { makeLitMaterial } from '../render/materials/factory.ts';
import { AgentKind, rotYFor, type AgentKindOpts } from './agents.ts';
import type { LifeCtx } from './ctx.ts';
import { buildBoatPlaceholder } from './geo/creatures.ts';
import { buildFerrySchedule, ferryDist, type FerrySchedule } from './ferry.ts';
import { WakeFoam } from './wake.ts';

const DEG = Math.PI / 180;

export interface Route {
  /** Dock-end points the loop slows down for. */
  stops: Vec2[];
  pts: Vec2[];
  lens: Float32Array;
  total: number;
  /** 'route' (sailing loop) or 'ferry' (timetable with dwell). */
  kind: string;
  /** Seconds standing at each stop (ferries). */
  dwell: number;
  /** Arc length of each stop on the smoothed loop, ascending (nearest loop point to the dock end). */
  stopArcs: number[];
}

/** Arc lengths of `stops` on the loop (nearest vertex), ascending, near-duplicates merged. */
function stopArcsOf(pts: Vec2[], lens: Float32Array, stops: Vec2[]): number[] {
  const arcs = stops.map((s) => {
    let best = 0;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return lens[best];
  });
  arcs.sort((a, b) => a - b);
  return arcs.filter((a, i) => i === 0 || a - arcs[i - 1] > 2);
}

/** Closed loops from `world.boatRoutes`, else the fallback rings around the two largest islands. */
export function resolveRoutes(ctx: LifeCtx): Route[] {
  const given = ctx.world.boatRoutes;
  const loops: Vec2[][] = [];
  const stopsOf: Vec2[][] = [];
  const kinds: Array<{ kind: string; dwell: number }> = [];
  const docks = ctx.world.docks ?? [];
  if (given && given.length > 0) {
    given.forEach((r, ri) => {
      if (r.length < 4) return;
      loops.push(r.map((p) => ({ x: p.x, y: p.z })));
      kinds.push(ctx.world.boatMeta?.[ri] ?? { kind: 'route', dwell: 0 });
      stopsOf.push(
        (ctx.world.boatStops?.[ri] ?? []).flatMap((di) => {
          const d = docks[di];
          if (!d) return [];
          const reach = d.segments * 2;
          return [{ x: d.x + Math.cos(d.rotY) * reach, y: d.z + Math.sin(d.rotY) * reach }];
        }),
      );
    });
  } else {
    const isl = [...ctx.world.islands]
      .sort((a, b) => b.radius - a.radius)
      .slice(0, SAILBOAT.route.count);
    for (const i of isl) {
      const loop = ringAround(ctx, i.cx, i.cz, i.radius + SAILBOAT.route.margin);
      if (loop) {
        loops.push(loop);
        stopsOf.push([]);
        kinds.push({ kind: 'route', dwell: 0 });
      }
    }
  }
  return loops.map((raw, li) => {
    const pts = smoothPolyline(raw, 4, true);
    const lens = arcLengths(pts, true);
    return {
      pts,
      lens,
      total: lens[lens.length - 1],
      stops: stopsOf[li],
      ...kinds[li],
      stopArcs: stopArcsOf(pts, lens, stopsOf[li]),
    };
  });
}

/** A loop `margin` u beyond a themed island's radius (inspection / lantern boat), or null. */
export function islandRing(ctx: LifeCtx, theme: string, margin: number): Route | null {
  const isl = ctx.world.islands.find((i) => i.theme === theme);
  const raw = isl && ringAround(ctx, isl.cx, isl.cz, isl.radius + margin);
  if (!raw) return null;
  const pts = smoothPolyline(raw, 4, true);
  const lens = arcLengths(pts, true);
  return {
    pts,
    lens,
    total: lens[lens.length - 1],
    stops: [],
    kind: 'route',
    dwell: 0,
    stopArcs: [],
  };
}

/** Circle of radius r pushed outward per angle until every point is over water ≥ minDepth; null if impossible. */
function ringAround(ctx: LifeCtx, cx: number, cz: number, r0: number): Vec2[] | null {
  const R = SAILBOAT.route;
  const n = Math.max(16, Math.ceil((2 * Math.PI * r0) / R.spacing));
  const wet = (x: number, z: number): boolean => ctx.h(x, z) <= -R.minDepth;
  let rad = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let r = r0;
    while (r < r0 + R.pushMax && !wet(cx + Math.cos(a) * r, cz + Math.sin(a) * r)) r += R.pushStep;
    rad[i] = r;
  }
  // smooth the radius field (never inward of the pushed value), then re-verify
  for (let pass = 0; pass < 6; pass++) {
    const next = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const s = (rad[(i + n - 1) % n] + 2 * rad[i] + rad[(i + 1) % n]) / 4;
      next[i] = Math.max(s, rad[i]);
    }
    rad = next;
  }
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let r = rad[i];
    while (r < r0 + R.pushMax * 1.5 && !wet(cx + Math.cos(a) * r, cz + Math.sin(a) * r))
      r += R.pushStep;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (!wet(x, z)) return null;
    pts.push({ x, y: z });
  }
  return pts;
}

/** Orient a prop geometry (bow +z, keel y=0) to the life convention (bow +x, waterline y=0). */
function orientBoat(g: THREE.BufferGeometry, draft: number): THREE.BufferGeometry {
  g.rotateY(Math.PI / 2);
  g.translate(0, -draft, 0);
  g.computeBoundingSphere();
  return g;
}

export function sailboatGeometry(seed: number, variant = 0): THREE.BufferGeometry {
  return 'sailboat' in PROP_GEO
    ? orientBoat(buildProp('sailboat', seed, variant, 0), 0.35)
    : buildBoatPlaceholder();
}
export function rowboatGeometry(seed: number): THREE.BufferGeometry {
  return 'rowboat' in PROP_GEO
    ? orientBoat(buildProp('rowboat', seed, 0, 0), 0.2)
    : orientBoat(buildBoatPlaceholder().scale(0.4, 0.4, 0.4), 0);
}

export const litCreatureMaterial = (name: string): THREE.Material =>
  makeLitMaterial({ instanced: true, rim: true }, { name });

type Opts = Omit<AgentKindOpts, 'name' | 'capacity' | 'geometry' | 'material'>;

/** One instanced mesh per boat variant (draw calls): which prop variant, which loops, how fast. */
export interface BoatSpec {
  name: string;
  variant: number;
  speed: number;
  /** Ferries follow a closed-form timetable (`ferry.ts`) instead of the integrated loop. */
  ferry?: boolean;
  /**
   * Berths of the other boats (every route's dock-end stops): the hull is pushed out to
   * `SAILBOAT.berthClear` u from each, so a sailing boat slowing at a pier never sits in a docked ferry.
   */
  avoid?: Vec2[];
}
const SAIL_SPEC: BoatSpec = { name: 'sailboat', variant: 0, speed: SAILBOAT.speed };

export class Sailboats extends AgentKind {
  private readonly route: Int32Array;
  private readonly d0: Float32Array;
  /** Arc length travelled (integrated, so the speed can vary). */
  private readonly dist: Float64Array;
  private readonly dir: Float32Array;
  /** Travelled distance at the last wake stamp (NaN = none yet). */
  private readonly wakeAt: Float64Array;
  readonly routes: Route[];
  readonly spec: BoatSpec;
  /** Ferry timetable per route (ferries only) and start offset per boat, s. */
  readonly schedules: FerrySchedule[] = [];
  readonly tOff: Float64Array;
  /** Foam-dot wake behind the hulls (one mesh for all boats; shared across kinds when given). */
  readonly foam: WakeFoam;
  /** This kind's first boat slot in `foam`; false = `foam` is shared and driven by its owner. */
  private readonly wakeBase: number;
  private readonly ownsFoam: boolean;
  private readonly p = { x: 0, y: 0 };
  private readonly a = { x: 0, y: 0 };
  private readonly b = { x: 0, y: 0 };

  constructor(
    o: Opts,
    private readonly ctx: LifeCtx,
    routes: Route[],
    count: number,
    spec: BoatSpec = SAIL_SPEC,
    /** Shared wake (TASK-435: one draw call for every boat kind) and this kind's first slot in it. */
    wake?: { foam: WakeFoam; base: number },
  ) {
    super({
      ...o,
      name: spec.name,
      capacity: routes.length ? count : 0,
      geometry: sailboatGeometry(o.seed, spec.variant),
      material: litCreatureMaterial(`life:${spec.name}`),
    });
    this.spec = spec;
    this.routes = routes;
    this.tOff = new Float64Array(count);
    if (spec.ferry) {
      const F = CULTURE_BOATS.ferry;
      for (const R of routes)
        this.schedules.push(buildFerrySchedule(R.total, R.stopArcs, R.dwell, spec.speed, F.decel));
    }
    this.route = new Int32Array(count);
    this.d0 = new Float32Array(count);
    this.dist = new Float64Array(count);
    this.dir = new Float32Array(count).fill(1);
    this.wakeAt = new Float64Array(count).fill(Number.NaN);
    this.foam = wake?.foam ?? new WakeFoam(o, ctx, this.capacity);
    this.wakeBase = wake?.base ?? 0;
    this.ownsFoam = !wake;
    const per = new Array<number>(routes.length).fill(0);
    for (let i = 0; i < this.capacity; i++) per[i % routes.length]++;
    const seen = new Array<number>(routes.length).fill(0);
    for (let i = 0; i < this.capacity; i++) {
      const r = i % routes.length;
      const k = seen[r]++;
      this.route[i] = r;
      this.d0[i] = ((k + this.phase[i] * 0.4) / per[r]) * routes[r].total;
      this.dir[i] = spec.ferry || k % 2 === 0 ? 1 : -1;
      if (spec.ferry) {
        const cycle = this.schedules[r].cycle;
        this.tOff[i] = (CULTURE_BOATS.ferry.startFrac + k / per[r]) * cycle;
        this.d0[i] = 0;
      }
      this.active[i] = 1;
      this.stepAgent(i, 0, 0);
      this.snap(i);
    }
  }

  /** Integrate travelled distance; slows to `stopSpeed` near a route stop and passes it. */
  private advance(i: number, dir: number, dt: number, t: number): number {
    const R = this.routes[this.route[i]];
    if (this.spec.ferry)
      return (this.dist[i] = ferryDist(this.schedules[this.route[i]], t + this.tOff[i]));
    if (R.stops.length > 0 && dt > 0) {
      const p = pointAtLength(R.pts, R.lens, this.d0[i] + this.dist[i], true, this.p);
      let near = Infinity;
      for (const s of R.stops) near = Math.min(near, Math.hypot(s.x - p.x, s.y - p.y));
      const u = Math.min(1, Math.max(0, near / SAILBOAT.stopRadius));
      const k = u * u * (3 - 2 * u);
      const v = SAILBOAT.stopSpeed + (this.spec.speed - SAILBOAT.stopSpeed) * k;
      this.dist[i] += dir * v * dt;
    } else {
      this.dist[i] += dir * this.spec.speed * dt;
    }
    return this.dist[i];
  }

  protected stepAgent(i: number, dt: number, t: number): void {
    const R = this.routes[this.route[i]];
    const dir = this.dir[i];
    const d = this.d0[i] + this.advance(i, dir, dt, t);
    const at = (s: number, out: Vec2): Vec2 => pointAtLength(R.pts, R.lens, s, true, out);
    const p = at(d, this.p);
    const ahead = at(d + dir * 1.5, this.a);
    const ax = ahead.x;
    const az = ahead.y;
    const behind = at(d - dir * 1.5, this.b);
    const dx = ax - behind.x;
    const dz = az - behind.y;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len;
    const fz = dz / len;
    let x = p.x;
    let z = p.y;
    if (this.spec.avoid) {
      for (const s of this.spec.avoid) {
        const ex = x - s.x;
        const ez = z - s.y;
        const dd = Math.hypot(ex, ez);
        if (dd >= SAILBOAT.berthClear) continue;
        // out along the radial (the track's right-hand normal when dead centre)
        const k = (SAILBOAT.berthClear - dd) / (dd || 1);
        x += dd > 1e-3 ? ex * k : -fz * SAILBOAT.berthClear;
        z += dd > 1e-3 ? ez * k : fx * SAILBOAT.berthClear;
      }
    }
    // turn rate: heading change over ±3 u
    const h1 = at(d + dir * 3, this.a);
    const h0x = h1.x;
    const h0z = h1.y;
    const h2 = at(d - dir * 3, this.b);
    const e1 = Math.atan2(h0z - z, h0x - x);
    const e0 = Math.atan2(z - h2.y, x - h2.x);
    let dh = e1 - e0;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    // actual speed (ferries stand still at stops): look 0.25 s ahead on the timetable
    const sp = this.spec.ferry
      ? (ferryDist(this.schedules[this.route[i]], t + this.tOff[i] + 0.25) - this.dist[i]) / 0.25
      : this.spec.speed;
    const rate = (dh / 6) * sp; // rad/s, > 0 = turning right
    const heel =
      Math.max(-1, Math.min(1, rate / SAILBOAT.heelRate)) *
      SAILBOAT.heelDeg *
      DEG *
      (this.spec.ferry ? CULTURE_BOATS.ferry.heelScale : 1);
    const sw = this.ctx.swell;
    const rx = -fz;
    const rz = fx;
    const ts = SAILBOAT.tapSide;
    const tf = SAILBOAT.tapFront;
    const sL = swellY(x - rx * ts, z - rz * ts, t, sw);
    const sR = swellY(x + rx * ts, z + rz * ts, t, sw);
    const sF = swellY(x + fx * tf, z + fz * tf, t, sw);
    const sB = swellY(x - fx * tf, z - fz * tf, t, sw);
    this.x[i] = x;
    this.z[i] = z;
    this.y[i] = swellY(x, z, t, sw);
    this.yaw[i] = rotYFor(fx, fz);
    this.roll[i] = Math.atan((sL - sR) / (2 * ts)) + heel * this.ctx.motion.scale;
    this.pitch[i] = Math.atan((sF - sB) / (2 * tf));
    const gust = gustAt(x, z, t, this.ctx.gust);
    this.sx[i] = 1 + SAILBOAT.puff * gust * this.ctx.motion.scale;
    if (t > 0) this.stampWake(i, x, z, fx, fz);
  }

  /** One foam-dot pair at the stern per `spacing` u of travel; none at T0 (boats are specks there). */
  private stampWake(i: number, x: number, z: number, fx: number, fz: number): void {
    const w = SAILBOAT.wake;
    if (this.ctx.getTier() < w.minTier) return;
    const d = this.dist[i];
    const last = this.wakeAt[i];
    if (!Number.isNaN(last) && Math.abs(d - last) < w.spacing) return;
    this.wakeAt[i] = d;
    this.foam.stamp(this.wakeBase + i, x - fx * w.back, z - fz * w.back, -fz, fx, this.simT);
  }

  override fixedUpdate(dt?: number): void {
    super.fixedUpdate(dt);
    if (this.ownsFoam) this.foam.fixedUpdate(dt);
  }

  override update(alpha: number): void {
    super.update(alpha);
    if (this.ownsFoam) this.foam.update(alpha);
  }
}

export interface Mooring {
  x: number;
  z: number;
  rotY: number;
}

/** Parked boats exactly at `world.moorings` (heading = rotY, convention (cos, sin)). */
export function mooringsOf(ctx: LifeCtx, defId: 'rowboat' | 'sailboat', count: number): Mooring[] {
  const every = ctx.world.moorings ?? [];
  const all = every.filter((m) => m.defId === defId);
  const rng = ctx.rngFor(`moorings:${defId}`);
  rng.shuffle(all);
  // a pier with several berths fills first (a little harbour, not one lone boat per pier);
  // stable sort: ties keep the seeded shuffle order
  const crowd = (m: { dock: number }): number => every.filter((o) => o.dock === m.dock).length;
  all.sort((a, b) => crowd(b) - crowd(a) || a.dock - b.dock);
  return all.slice(0, count).map((m) => ({ x: m.x, z: m.z, rotY: m.rotY }));
}

export class Rowboats extends AgentKind {
  private readonly bx: Float32Array;
  private readonly bz: Float32Array;
  private readonly byaw: Float32Array;
  private readonly period: Float32Array;

  constructor(
    o: Opts,
    private readonly ctx: LifeCtx,
    moorings: Mooring[],
    name: 'rowboat' | 'parked' = 'rowboat',
  ) {
    super({
      ...o,
      name,
      capacity: moorings.length,
      geometry: name === 'rowboat' ? rowboatGeometry(o.seed) : sailboatGeometry(o.seed),
      material: litCreatureMaterial(`life:${name}`),
    });
    const n = this.capacity;
    this.bx = new Float32Array(n);
    this.bz = new Float32Array(n);
    this.byaw = new Float32Array(n);
    this.period = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.bx[i] = moorings[i].x;
      this.bz[i] = moorings[i].z;
      this.byaw[i] = rotYFor(Math.cos(moorings[i].rotY), Math.sin(moorings[i].rotY));
      const [a, b] = ROWBOAT.period;
      this.period[i] = a + (b - a) * unitHash(o.seed, i, 77);
      this.active[i] = 1;
      this.stepAgent(i, 0, 0);
      this.snap(i);
    }
  }

  protected stepAgent(i: number, _dt: number, t: number): void {
    const m = this.ctx.motion.scale;
    const w = (Math.PI * 2) / this.period[i];
    const ph = this.phase[i] * Math.PI * 2;
    const x = this.bx[i];
    const z = this.bz[i];
    this.x[i] = x;
    this.z[i] = z;
    this.y[i] =
      swellY(x, z, t, this.ctx.swell) + BOAT_BOB.y * ROWBOAT.bobShare * m * Math.sin(w * t + ph);
    // roll trails the bob by rollLag s
    this.roll[i] = BOAT_BOB.rollDeg * DEG * m * Math.sin(w * (t - BOAT_BOB.rollLag) + ph);
    this.pitch[i] = BOAT_BOB.pitchDeg * DEG * m * Math.sin(w * t + ph + Math.PI / 2);
    const gust = gustAt(x, z, t, this.ctx.gust);
    this.yaw[i] = this.byaw[i] + (0.05 * Math.sin(w * 0.5 * t + ph) + 0.06 * gust) * m;
  }
}
