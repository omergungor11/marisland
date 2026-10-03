import * as THREE from 'three';
import { FIREFLIES } from '../content/life.ts';
import { POOLS } from '../content/lighting.ts';
import { PROP_DEFS } from '../content/props.ts';
import { unitHash } from '../core/hash.ts';
import type { Rng } from '../core/rng.ts';
import { SHARED } from '../render/uniforms.ts';
import { Zone } from '../world/types.ts';
import { AgentKind, type AgentKindOpts } from './agents.ts';
import type { LifeCtx } from './ctx.ts';
import { islandCells } from './land-world.ts';
import { makeLifeMaterial } from './life-material.ts';

const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Swarm {
  island: number;
  x: number;
  z: number;
}

/** Light sources of the lantern pools (lantern posts, stalls, door lights …): fireflies keep out of them. */
function lightSources(ctx: LifeCtx): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  const P = ctx.world.props;
  if (!P) return out;
  for (let i = 0; i < P.count; i++) {
    const src = POOLS.sources[PROP_DEFS[P.defId[i]]?.geo ?? ''];
    if (src) out.push({ x: P.x[i], z: P.z[i], r: src.radius * (P.scale[i] || 1) });
  }
  return out;
}

/**
 * Swarm centres for `count` fireflies: the settlement island(s) (villages, else the biggest island),
 * on grass / meadow cells that touch the forest, dry and lantern-free, nearest to the hub first.
 * Pure data + a label-forked rng, so a seed always gives the same swarms.
 */
export function planSwarms(ctx: LifeCtx, count: number, rng: Rng): Swarm[] {
  if (count <= 0) return [];
  const F = FIREFLIES;
  const w = ctx.world;
  const hubs = new Map<number, { x: number; z: number }>();
  for (const s of w.settlements ?? []) if (s.kind === 'village') hubs.set(s.islandId, s.hub);
  let ids = [...hubs.keys()].slice(0, 2);
  if (ids.length === 0 && w.islands.length > 0) {
    let best = 0;
    w.islands.forEach((it, i) => {
      if (it.radius > w.islands[best].radius) best = i;
    });
    ids = [best];
  }
  const lights = lightSources(ctx);
  const n = Math.ceil(count / F.perSwarm);
  const open = new Uint8Array(16);
  open[Zone.grass] = open[Zone.meadow] = 1;
  const edge = (x: number, z: number): boolean => {
    let hits = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      if (ctx.zone(x + Math.cos(a) * F.edgeRing, z + Math.sin(a) * F.edgeRing) === Zone.forest)
        hits++;
    }
    return hits >= F.minEdgeHits;
  };
  const dark = (x: number, z: number): boolean =>
    lights.every((l) => Math.hypot(x - l.x, z - l.z) > l.r + F.lampClear);
  const hg = w.height;
  const perIsland: Swarm[][] = ids.map((id) => {
    const cells = islandCells(ctx, id, [Zone.grass, Zone.meadow]);
    const hub = hubs.get(id) ?? { x: w.islands[id].cx, z: w.islands[id].cz };
    const order = cells.x.map((_, i) => i);
    rng.fork('order', id).shuffle(order);
    const band = new Map<number, number>(
      order.map((i) => [
        i,
        Math.floor(Math.hypot(cells.x[i] - hub.x, cells.z[i] - hub.z) / F.hubBand),
      ]),
    );
    order.sort((a, b) => (band.get(a) as number) - (band.get(b) as number));
    const picked: Swarm[] = [];
    for (const minSep of [F.minSeparation, F.minSeparation / 2, 0]) {
      for (const i of order) {
        if (picked.length >= n) break;
        const x = cells.x[i];
        const z = cells.z[i];
        const k =
          Math.round((z - hg.originZ) / hg.cellSize) * hg.n +
          Math.round((x - hg.originX) / hg.cellSize);
        if (!open[ctx.zone(x, z)] || ctx.h(x, z) < F.minHeight || w.shoreSdf[k] < F.shoreMin)
          continue;
        if (!edge(x, z) || !dark(x, z)) continue;
        if (picked.some((p) => Math.hypot(p.x - x, p.z - z) < minSep)) continue;
        picked.push({ island: id, x, z });
      }
    }
    return picked;
  });
  // round-robin over the islands so a two-village world splits its swarms
  const out: Swarm[] = [];
  for (let r = 0; out.length < n; r++) {
    let any = false;
    for (const l of perIsland)
      if (r < l.length && out.length < n) {
        out.push(l[r]);
        any = true;
      }
    if (!any) break;
  }
  return out;
}

function fireflyGeometry(): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(FIREFLIES.size, 0);
  const n = g.getAttribute('position').count;
  const col = new THREE.Color(FIREFLIES.color);
  const c: number[] = [];
  const limb: number[] = [];
  const em: number[] = [];
  for (let i = 0; i < n; i++) {
    c.push(col.r, col.g, col.b);
    limb.push(0, 0, 0, 6); // creature glyph mode 6, glyph 0 = the instance's own (aGait.y = 0)
    em.push(1);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.setAttribute('limb', new THREE.Float32BufferAttribute(limb, 4));
  g.setAttribute('emissive', new THREE.Float32BufferAttribute(em, 1));
  return g;
}

/**
 * Fireflies: one InstancedMesh on the shared creature program. Everything is a closed form of the
 * engine clock (`uTime`) and `uNight`, written at render rate, so `?freeze=1&time=…` freezes them and
 * the picture is reproducible. Hidden (count 0) by day and below `FIREFLIES.minTier`.
 * Not an agent: never counted, never picked, `fixedUpdate` is a no-op.
 */
export class Fireflies extends AgentKind {
  private readonly hx: Float32Array;
  private readonly hz: Float32Array;
  private readonly ex: Float32Array;
  private readonly ez: Float32Array;
  private readonly wx: Float32Array;
  private readonly wz: Float32Array;
  private readonly wy: Float32Array;
  private readonly px0: Float32Array;
  private readonly pz0: Float32Array;
  private readonly py0: Float32Array;
  private readonly lift: Float32Array;
  private readonly bp: Float32Array;
  private readonly bph: Float32Array;
  /** Where in the dusk ramp (0..1) this one lights. */
  private readonly onAt: Float32Array;
  /** Glow ramp of the last frame and how many instances are drawn (tests / debug). */
  glow = 0;
  shown = 0;
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();

  constructor(
    o: Omit<AgentKindOpts, 'name' | 'capacity' | 'geometry' | 'material'>,
    private readonly ctx: LifeCtx,
    swarms: Swarm[],
    count: number,
  ) {
    super({
      ...o,
      name: 'fireflies',
      capacity: swarms.length > 0 ? count : 0,
      geometry: fireflyGeometry(),
      material: makeLifeMaterial('life:fireflies', false),
    });
    const F = FIREFLIES;
    const n = this.capacity;
    const f32 = (): Float32Array => new Float32Array(n);
    this.hx = f32();
    this.hz = f32();
    this.ex = f32();
    this.ez = f32();
    this.wx = f32();
    this.wz = f32();
    this.wy = f32();
    this.px0 = f32();
    this.pz0 = f32();
    this.py0 = f32();
    this.lift = f32();
    this.bp = f32();
    this.bph = f32();
    this.onAt = f32();
    const h = (i: number, k: number): number => unitHash(o.seed, i, 0xf1e5 + k);
    const lerp = (r: readonly [number, number], u: number): number => r[0] + (r[1] - r[0]) * u;
    for (let i = 0; i < n; i++) {
      const sw = swarms[Math.floor(i / F.perSwarm) % swarms.length];
      const a = h(i, 0) * TAU;
      const d = Math.sqrt(h(i, 1)) * F.swarmRadius;
      this.hx[i] = sw.x + Math.cos(a) * d;
      this.hz[i] = sw.z + Math.sin(a) * d;
      this.ex[i] = lerp(F.extent, h(i, 2));
      this.ez[i] = lerp(F.extent, h(i, 3));
      // slow Lissajous: independent periods per axis
      this.wx[i] = TAU / lerp(F.period, h(i, 4));
      this.wz[i] = TAU / lerp(F.period, h(i, 5));
      this.wy[i] = TAU / lerp(F.period, h(i, 6));
      this.px0[i] = h(i, 7) * TAU;
      this.pz0[i] = h(i, 8) * TAU;
      this.py0[i] = h(i, 9) * TAU;
      this.lift[i] = lerp(F.height, h(i, 10));
      this.bp[i] = lerp(F.blink, h(i, 11));
      this.bph[i] = h(i, 12);
      this.onAt[i] = h(i, 13) * F.stagger;
    }
    this.mesh.frustumCulled = false;
    // an instanceColor attribute keeps the program parameters identical to the land critters'
    // (same cache key + same defines = the one shared creature program, not a 13th)
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, white);
    this.render(0, 0); // hidden until night
  }

  /** No simulation: poses come from the clock in `update`. */
  override fixedUpdate(): void {}

  /** Dusk ramp 0..1 from `night`. */
  static glowOf(night: number): number {
    return smooth(FIREFLIES.night[0], FIREFLIES.night[1], night);
  }

  override update(_alpha: number): void {
    const night = SHARED.uNight.value as number;
    const glow = this.ctx.getTier() >= FIREFLIES.minTier ? Fireflies.glowOf(night) : 0;
    this.render(SHARED.uTime.value as number, glow);
  }

  /** Pose every firefly for clock `t` and glow `glow`; count 0 when nothing is lit. */
  render(t: number, glow: number): void {
    const F = FIREFLIES;
    this.glow = glow;
    const n = this.capacity;
    if (glow <= 0 || n === 0) {
      this.mesh.count = 0;
      this.mesh.visible = false;
      this.shown = 0;
      return;
    }
    const calm = this.motionScale;
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    let top = 0;
    for (let i = 0; i < n; i++) {
      const on = smooth(this.onAt[i], this.onAt[i] + (1 - F.stagger), glow);
      const x = this.hx[i] + this.ex[i] * calm * Math.sin(this.wx[i] * t + this.px0[i]);
      const z = this.hz[i] + this.ez[i] * calm * Math.sin(this.wz[i] * t + this.pz0[i]);
      const y =
        Math.max(this.ctx.h(x, z), 0.3) +
        this.lift[i] +
        F.bob * calm * Math.sin(this.wy[i] * t + this.py0[i]);
      // blink: lit for `duty` of the period as a soft half-sine, dark otherwise; calmer = steadier
      const u = (t / this.bp[i] + this.bph[i]) % 1;
      const lit = u < F.duty ? Math.sin((Math.PI * u) / F.duty) : 0;
      const env = 1 - calm * (1 - lit);
      const sc = Math.max(on * env, 0);
      if (sc > 0.01) top = i + 1;
      this.p.set(x, y, z);
      this.s.setScalar(sc);
      this.m.compose(this.p, this.q, this.s);
      this.m.toArray(arr, i * 16);
    }
    this.shown = top;
    this.mesh.count = top;
    this.mesh.visible = top > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (top > 0) this.mesh.computeBoundingSphere();
  }

  protected stepAgent(): void {}
}
