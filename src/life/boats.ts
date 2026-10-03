import type * as THREE from 'three';
import { BOAT_BOB } from '../content/anim.ts';
import { ROWBOAT, SAILBOAT } from '../content/life.ts';
import { unitHash } from '../core/hash.ts';
import { arcLengths, pointAtLength, smoothPolyline, type Vec2 } from '../core/math/catmull-rom.ts';
import type { Rng } from '../core/rng.ts';
import { PROP_GEO, buildProp } from '../geo/index.ts';
import { gustAt, swellY } from '../shared/fields.ts';
import { makeLitMaterial } from '../render/materials/factory.ts';
import { AgentKind, rotYFor, type AgentKindOpts } from './agents.ts';
import type { LifeCtx } from './ctx.ts';
import { buildBoatPlaceholder } from './geo/creatures.ts';

const DEG = Math.PI / 180;

export interface Route {
  pts: Vec2[];
  lens: Float32Array;
  total: number;
}

/** Closed loops from `world.boatRoutes`, else the fallback rings around the two largest islands. */
export function resolveRoutes(ctx: LifeCtx): Route[] {
  const given = ctx.world.boatRoutes;
  const loops: Vec2[][] = [];
  if (given && given.length > 0) {
    for (const r of given) if (r.length >= 4) loops.push(r.map((p) => ({ x: p.x, y: p.z })));
  } else {
    const isl = [...ctx.world.islands]
      .sort((a, b) => b.radius - a.radius)
      .slice(0, SAILBOAT.route.count);
    for (const i of isl) {
      const loop = ringAround(ctx, i.cx, i.cz, i.radius + SAILBOAT.route.margin);
      if (loop) loops.push(loop);
    }
  }
  return loops.map((raw) => {
    const pts = smoothPolyline(raw, 4, true);
    const lens = arcLengths(pts, true);
    return { pts, lens, total: lens[lens.length - 1] };
  });
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

export function sailboatGeometry(seed: number): THREE.BufferGeometry {
  return 'sailboat' in PROP_GEO
    ? orientBoat(buildProp('sailboat', seed, 0, 0), 0.35)
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

export class Sailboats extends AgentKind {
  private readonly route: Int32Array;
  private readonly d0: Float32Array;
  private readonly dir: Float32Array;
  readonly routes: Route[];
  private readonly p = { x: 0, y: 0 };
  private readonly a = { x: 0, y: 0 };
  private readonly b = { x: 0, y: 0 };

  constructor(
    o: Opts,
    private readonly ctx: LifeCtx,
    routes: Route[],
    count: number,
  ) {
    super({
      ...o,
      name: 'sailboat',
      capacity: routes.length ? count : 0,
      geometry: sailboatGeometry(o.seed),
      material: litCreatureMaterial('life:sailboat'),
    });
    this.routes = routes;
    this.route = new Int32Array(count);
    this.d0 = new Float32Array(count);
    this.dir = new Float32Array(count).fill(1);
    const per = new Array<number>(routes.length).fill(0);
    for (let i = 0; i < this.capacity; i++) per[i % routes.length]++;
    const seen = new Array<number>(routes.length).fill(0);
    for (let i = 0; i < this.capacity; i++) {
      const r = i % routes.length;
      const k = seen[r]++;
      this.route[i] = r;
      this.d0[i] = ((k + this.phase[i] * 0.4) / per[r]) * routes[r].total;
      this.dir[i] = k % 2 === 0 ? 1 : -1;
      this.active[i] = 1;
      this.stepAgent(i, 0, 0);
      this.snap(i);
    }
  }

  protected stepAgent(i: number, _dt: number, t: number): void {
    const R = this.routes[this.route[i]];
    const dir = this.dir[i];
    const d = this.d0[i] + dir * SAILBOAT.speed * t;
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
    const x = p.x;
    const z = p.y;
    // turn rate: heading change over ±3 u
    const h1 = at(d + dir * 3, this.a);
    const h0x = h1.x;
    const h0z = h1.y;
    const h2 = at(d - dir * 3, this.b);
    const e1 = Math.atan2(h0z - z, h0x - x);
    const e0 = Math.atan2(z - h2.y, x - h2.x);
    let dh = e1 - e0;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const rate = (dh / 6) * SAILBOAT.speed; // rad/s, > 0 = turning right
    const heel = Math.max(-1, Math.min(1, rate / SAILBOAT.heelRate)) * SAILBOAT.heelDeg * DEG;
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
    if (t > 0) {
      const w = SAILBOAT.wake;
      this.ctx.water.splat(x - fx * w.offset, z - fz * w.offset, w.radius, w.strength);
    }
  }
}

export interface Mooring {
  x: number;
  z: number;
  rotY: number;
}

/** Water spots beside docks (or the Hearthholm harbour anchor) for moored rowboats. */
export function findMoorings(ctx: LifeCtx, rng: Rng, count: number): Mooring[] {
  const out: Mooring[] = [];
  const wet = (x: number, z: number): boolean => ctx.h(x, z) <= -ROWBOAT.minDepth;
  const tryAt = (bx: number, bz: number, dx: number, dz: number): void => {
    if (out.length >= count) return;
    const px = -dz;
    const pz = dx;
    for (const side of [1, -1]) {
      for (const off of [2.2, 3.2, 4.4]) {
        const x = bx + px * side * off;
        const z = bz + pz * side * off;
        if (wet(x, z) && out.every((m) => Math.hypot(m.x - x, m.z - z) > 3.5)) {
          out.push({ x, z, rotY: Math.atan2(-dz, dx) + (rng.next() - 0.5) * 0.4 });
          return;
        }
      }
    }
  };
  const docks = ctx.world.docks ?? [];
  for (const d of docks) {
    // seaward direction of a dock = local +z rotated by rotY
    const dx = Math.sin(d.rotY);
    const dz = Math.cos(d.rotY);
    const reach = d.segments * 2 * 0.6;
    tryAt(d.x + dx * reach, d.z + dz * reach, dx, dz);
  }
  if (out.length < count) {
    for (const isl of ctx.world.islands) {
      const hb = isl.anchors.harbour;
      if (!hb) continue;
      // walk seaward (away from the island centre) to the first wet cell
      let ux = hb.x - isl.cx;
      let uz = hb.z - isl.cz;
      const l = Math.hypot(ux, uz) || 1;
      ux /= l;
      uz /= l;
      for (let s = 0; s < 40 && out.length < count; s += 1) {
        const x = hb.x + ux * s * 2;
        const z = hb.z + uz * s * 2;
        if (ctx.h(x, z) <= -1.2) {
          tryAt(x, z, ux, uz);
          tryAt(x + ux * 6, z + uz * 6, ux, uz);
          break;
        }
      }
    }
  }
  return out.slice(0, count);
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
  ) {
    super({
      ...o,
      name: 'rowboat',
      capacity: moorings.length,
      geometry: rowboatGeometry(o.seed),
      material: litCreatureMaterial('life:rowboat'),
    });
    const n = this.capacity;
    this.bx = new Float32Array(n);
    this.bz = new Float32Array(n);
    this.byaw = new Float32Array(n);
    this.period = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.bx[i] = moorings[i].x;
      this.bz[i] = moorings[i].z;
      this.byaw[i] = moorings[i].rotY;
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
