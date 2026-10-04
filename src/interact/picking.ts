/**
 * CPU picking (ARCHITECTURE §5): no GPU id pass, no mesh raycasts. Pure math (no three import) so
 * it runs in unit tests against a synthetic world.
 *
 * 1. March + bisect the ray against the heightfield (sea plane y = 0 included) → `tTerrain`.
 * 2. Walk the prop spatial hash (2D DDA over xz cells, nearest cell first) and test each candidate's
 *    vertical-cylinder proxy; stop as soon as a cell starts beyond the best hit.
 * 3. Test the live agents' spheres (≲ 100: brute force is cheaper than rebuilding a hash at 10 Hz).
 * 4. The nearest hit along the ray wins; the terrain is the fallback.
 */

export interface Ray {
  ox: number;
  oy: number;
  oz: number;
  /** Unit direction. */
  dx: number;
  dy: number;
  dz: number;
}

export const makeRay = (): Ray => ({ ox: 0, oy: 0, oz: 0, dx: 0, dy: -1, dz: 0 });

/** Camera basis (world space, unit vectors) for `screenRay`. */
export interface PickCamera {
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
  ux: number;
  uy: number;
  uz: number;
  /** Forward (view direction). */
  fx: number;
  fy: number;
  fz: number;
  /** tan(vertical fov / 2). */
  tanHalf: number;
  /** width / height. */
  aspect: number;
}

/** Ray through normalised device coordinates (x right, y up, both −1..1). */
export function screenRay(out: Ray, c: PickCamera, ndcX: number, ndcY: number): Ray {
  const sx = ndcX * c.tanHalf * c.aspect;
  const sy = ndcY * c.tanHalf;
  let dx = c.fx + c.rx * sx + c.ux * sy;
  let dy = c.fy + c.ry * sx + c.uy * sy;
  let dz = c.fz + c.rz * sx + c.uz * sy;
  const l = Math.hypot(dx, dy, dz) || 1;
  dx /= l;
  dy /= l;
  dz /= l;
  out.ox = c.px;
  out.oy = c.py;
  out.oz = c.pz;
  out.dx = dx;
  out.dy = dy;
  out.dz = dz;
  return out;
}

export interface MarchOpts {
  heightAt(x: number, z: number): number;
  /** Highest terrain y — a rising ray above it ends the march. */
  maxY: number;
  near: number;
  far: number;
  stepRel: number;
  stepMin: number;
  stepMax: number;
  bisect: number;
}

/**
 * First `t` where the ray drops to the ground (max(terrain, sea level 0)), refined by bisection;
 * `Infinity` when it never does within [near, far].
 */
export function marchTerrain(r: Ray, o: MarchOpts): number {
  const ground = (t: number): number =>
    r.oy + r.dy * t - Math.max(0, o.heightAt(r.ox + r.dx * t, r.oz + r.dz * t));
  let t0 = o.near;
  if (ground(t0) <= 0) return t0;
  let t = t0;
  while (t < o.far) {
    t = Math.min(o.far, t + Math.min(o.stepMax, Math.max(o.stepMin, t * o.stepRel)));
    if (ground(t) <= 0) {
      let lo = t0;
      let hi = t;
      for (let i = 0; i < o.bisect; i++) {
        const mid = (lo + hi) / 2;
        if (ground(mid) <= 0) hi = mid;
        else lo = mid;
      }
      return (lo + hi) / 2;
    }
    t0 = t;
    if (r.dy >= 0 && r.oy + r.dy * t > o.maxY) return Infinity;
  }
  return Infinity;
}

/** Ray vs a vertical capped cylinder (base centre cx, y0, cz). Entry `t` ≥ tMin or −1. */
export function rayCylinder(
  r: Ray,
  cx: number,
  y0: number,
  cz: number,
  rad: number,
  h: number,
  tMin: number,
): number {
  const ox = r.ox - cx;
  const oz = r.oz - cz;
  const a = r.dx * r.dx + r.dz * r.dz;
  let lo: number;
  let hi: number;
  if (a < 1e-9) {
    if (ox * ox + oz * oz > rad * rad) return -1;
    lo = -Infinity;
    hi = Infinity;
  } else {
    const b = ox * r.dx + oz * r.dz;
    const c = ox * ox + oz * oz - rad * rad;
    const disc = b * b - a * c;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    lo = (-b - sq) / a;
    hi = (-b + sq) / a;
  }
  if (Math.abs(r.dy) > 1e-9) {
    let ta = (y0 - r.oy) / r.dy;
    let tb = (y0 + h - r.oy) / r.dy;
    if (ta > tb) [ta, tb] = [tb, ta];
    lo = Math.max(lo, ta);
    hi = Math.min(hi, tb);
  } else if (r.oy < y0 || r.oy > y0 + h) {
    return -1;
  }
  if (lo > hi || hi < tMin) return -1;
  return lo >= tMin ? lo : -1;
}

/** Ray vs sphere: entry `t` ≥ tMin or −1. */
export function raySphere(
  r: Ray,
  cx: number,
  cy: number,
  cz: number,
  rad: number,
  tMin: number,
): number {
  const ox = r.ox - cx;
  const oy = r.oy - cy;
  const oz = r.oz - cz;
  const b = ox * r.dx + oy * r.dy + oz * r.dz;
  const c = ox * ox + oy * oy + oz * oz - rad * rad;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= tMin ? t : -1;
}

/**
 * Prop proxies (cylinders) in a CSR spatial hash over the xz plane. Proxy slots are stable:
 * edits (TASK-213) `remove` a slot (it stays allocated, skipped by queries) and `add` new ones
 * (a moved prop = remove + add), which go to a per-cell overlay next to the CSR arrays; the
 * CSR is rebuilt from the live slots once the overlay grows past `compactAt`.
 */
export interface PropProxies {
  count: number;
  /** Caller's instance id (PropStore index) per proxy. */
  id: Int32Array;
  /** Def index per proxy (name lookup). */
  def: Uint16Array;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  r: Float32Array;
  h: Float32Array;
}

const PROXY_FIELDS = ['id', 'def', 'x', 'y', 'z', 'r', 'h'] as const;

export class PropHash {
  private readonly minX: number;
  private readonly minZ: number;
  private readonly w: number;
  private readonly d: number;
  private start!: Int32Array;
  private items!: Int32Array;
  private stamp: Int32Array;
  /** 1 = removed slot (skipped by queries, dropped by the next compaction). */
  private dead: Uint8Array;
  /** Slots added after the last CSR build, per cell. */
  private extra = new Map<number, number[]>();
  private extraItems = 0;
  private deadCount = 0;
  private query = 0;

  constructor(
    readonly props: PropProxies,
    bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
    readonly cell: number,
  ) {
    this.minX = bounds.minX;
    this.minZ = bounds.minZ;
    this.w = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
    this.d = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell));
    this.dead = new Uint8Array(props.id.length);
    this.stamp = new Int32Array(props.id.length);
    this.build();
  }

  /** Live proxies. */
  get live(): number {
    return this.props.count - this.deadCount;
  }

  /** Overlay entries above which `add` rebuilds the CSR. */
  get compactAt(): number {
    return Math.max(256, this.props.count >> 3);
  }

  isLive(slot: number): boolean {
    return slot >= 0 && slot < this.props.count && this.dead[slot] === 0;
  }

  private span(i: number): [number, number, number, number] {
    const P = this.props;
    return [
      this.cx(P.x[i] - P.r[i]),
      this.cx(P.x[i] + P.r[i]),
      this.cz(P.z[i] - P.r[i]),
      this.cz(P.z[i] + P.r[i]),
    ];
  }

  /** (Re)build the CSR arrays from every live slot; clears the overlay. */
  private build(): void {
    const cells = this.w * this.d;
    const n = this.props.count;
    const counts = new Int32Array(cells + 1);
    for (let i = 0; i < n; i++) {
      if (this.dead[i]) continue;
      const [x0, x1, z0, z1] = this.span(i);
      for (let cz = z0; cz <= z1; cz++)
        for (let cx = x0; cx <= x1; cx++) counts[cz * this.w + cx + 1]++;
    }
    for (let i = 0; i < cells; i++) counts[i + 1] += counts[i];
    this.start = counts;
    this.items = new Int32Array(counts[cells]);
    const fill = counts.slice(0, cells);
    for (let i = 0; i < n; i++) {
      if (this.dead[i]) continue;
      const [x0, x1, z0, z1] = this.span(i);
      for (let cz = z0; cz <= z1; cz++)
        for (let cx = x0; cx <= x1; cx++) this.items[fill[cz * this.w + cx]++] = i;
    }
    this.extra.clear();
    this.extraItems = 0;
  }

  /** Append a proxy (TASK-213: edit-added / moved / restored prop); returns its slot. */
  add(id: number, def: number, x: number, y: number, z: number, r: number, h: number): number {
    const P = this.props;
    const slot = P.count;
    if (slot >= P.id.length) {
      const cap = Math.max(16, Math.ceil(P.id.length * 1.5));
      for (const f of PROXY_FIELDS) {
        const old = P[f];
        const next = new (old.constructor as new (n: number) => typeof old)(cap);
        next.set(old as never);
        (P as unknown as Record<string, unknown>)[f] = next;
      }
      const dead = new Uint8Array(cap);
      dead.set(this.dead);
      this.dead = dead;
      const stamp = new Int32Array(cap);
      stamp.set(this.stamp);
      this.stamp = stamp;
    }
    P.id[slot] = id;
    P.def[slot] = def;
    P.x[slot] = x;
    P.y[slot] = y;
    P.z[slot] = z;
    P.r[slot] = r;
    P.h[slot] = h;
    P.count = slot + 1;
    this.dead[slot] = 0;
    const [x0, x1, z0, z1] = this.span(slot);
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) {
        const c = cz * this.w + cx;
        let a = this.extra.get(c);
        if (!a) this.extra.set(c, (a = []));
        a.push(slot);
        this.extraItems++;
      }
    if (this.extraItems > this.compactAt) this.build();
    return slot;
  }

  /** Drop a proxy from every query (TASK-213: removed / moved prop). */
  remove(slot: number): void {
    if (!this.isLive(slot)) return;
    this.dead[slot] = 1;
    this.deadCount++;
  }

  private cx(x: number): number {
    return Math.min(this.w - 1, Math.max(0, Math.floor((x - this.minX) / this.cell)));
  }
  private cz(z: number): number {
    return Math.min(this.d - 1, Math.max(0, Math.floor((z - this.minZ) / this.cell)));
  }

  /**
   * Nearest proxy hit with `t < tMax`; returns the proxy slot (or −1) and writes the distance
   * to `tOut[0]`. `visible` filters by caller instance id (e.g. the current tier's LOD).
   */
  nearest(r: Ray, tMax: number, tOut: Float64Array, visible?: (id: number) => boolean): number {
    const P = this.props;
    // clip the ray's xz projection to the hash bounds
    const maxX = this.minX + this.w * this.cell;
    const maxZ = this.minZ + this.d * this.cell;
    let tEnter = 0;
    let tExit = tMax;
    const slab = (o: number, dd: number, lo: number, hi: number): boolean => {
      if (Math.abs(dd) < 1e-12) return o >= lo && o <= hi;
      let a = (lo - o) / dd;
      let b = (hi - o) / dd;
      if (a > b) [a, b] = [b, a];
      tEnter = Math.max(tEnter, a);
      tExit = Math.min(tExit, b);
      return tEnter <= tExit;
    };
    if (!slab(r.ox, r.dx, this.minX, maxX) || !slab(r.oz, r.dz, this.minZ, maxZ)) return -1;
    const px = r.ox + r.dx * tEnter;
    const pz = r.oz + r.dz * tEnter;
    let cx = this.cx(px);
    let cz = this.cz(pz);
    const sx = r.dx > 0 ? 1 : -1;
    const sz = r.dz > 0 ? 1 : -1;
    const big = Infinity;
    const tdx = Math.abs(r.dx) < 1e-12 ? big : this.cell / Math.abs(r.dx);
    const tdz = Math.abs(r.dz) < 1e-12 ? big : this.cell / Math.abs(r.dz);
    let nx = tdx === big ? big : (this.minX + (cx + (sx > 0 ? 1 : 0)) * this.cell - r.ox) / r.dx;
    let nz = tdz === big ? big : (this.minZ + (cz + (sz > 0 ? 1 : 0)) * this.cell - r.oz) / r.dz;
    let best = -1;
    let bestT = tMax;
    const q = ++this.query;
    const test = (i: number): void => {
      if (this.stamp[i] === q || this.dead[i]) return;
      this.stamp[i] = q;
      if (visible && !visible(P.id[i])) return;
      const t = rayCylinder(r, P.x[i], P.y[i], P.z[i], P.r[i], P.h[i], 0);
      if (t >= 0 && t < bestT) {
        bestT = t;
        best = i;
      }
    };
    for (;;) {
      const c = cz * this.w + cx;
      for (let k = this.start[c]; k < this.start[c + 1]; k++) test(this.items[k]);
      const ex = this.extra.size ? this.extra.get(c) : undefined;
      if (ex) for (const i of ex) test(i);
      // advance to the next cell; stop once it starts beyond the best hit / the ray's end
      const tNext = Math.min(nx, nz);
      if (tNext > bestT || tNext > tExit || tNext === big) break;
      if (nx < nz) {
        cx += sx;
        nx += tdx;
        if (cx < 0 || cx >= this.w) break;
      } else {
        cz += sz;
        nz += tdz;
        if (cz < 0 || cz >= this.d) break;
      }
    }
    tOut[0] = bestT;
    return best;
  }
}

/** The PropStore fields the pick index reads (structural: no world import needed in tests). */
export interface PickStore {
  count: number;
  defId: ArrayLike<number>;
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  z: ArrayLike<number>;
  scale: ArrayLike<number>;
  flags: ArrayLike<number>;
}

/** Unit-scale cylinder proxy of a def: radius, height, base offset below the prop origin. */
export type ProxyDims = readonly [r: number, h: number, y0: number];

/** `PropFlag.removed` (world/prop-store.ts); duplicated so this module stays import-free. */
export const PICK_REMOVED_FLAG = 32;

/**
 * Store index → proxy slot over a `PropHash` (TASK-213): the hash is built once per world from
 * the props' cylinders; `refresh` re-derives the proxies of touched store indices after an edit
 * (moved → re-hashed, removed → dropped, appended → inserted). Pure; unit-tested.
 */
export class PropPickIndex {
  readonly hash: PropHash;
  private slots: Int32Array;

  /**
   * @param items store indices with their def's unit proxy, in insertion order (the batcher's
   *   group order at build: proxy slots and hit tie-breaks match the Phase 1 picker).
   */
  constructor(
    store: PickStore,
    items: readonly { i: number; dims: ProxyDims }[],
    bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
    cell: number,
  ) {
    const n = items.length;
    const P: PropProxies = {
      count: n,
      id: new Int32Array(n),
      def: new Uint16Array(n),
      x: new Float32Array(n),
      y: new Float32Array(n),
      z: new Float32Array(n),
      r: new Float32Array(n),
      h: new Float32Array(n),
    };
    this.slots = new Int32Array(store.count).fill(-1);
    items.forEach(({ i, dims }, k) => {
      const s = store.scale[i];
      P.id[k] = i;
      P.def[k] = store.defId[i];
      P.x[k] = store.x[i];
      P.y[k] = store.y[i] + dims[2] * s;
      P.z[k] = store.z[i];
      P.r[k] = dims[0] * s;
      P.h[k] = Math.max(0.3, dims[1] * s);
      this.slots[i] = k;
    });
    this.hash = new PropHash(P, bounds, cell);
  }

  /** Proxy slot of store index `i` (−1 = none). */
  slotOf(i: number): number {
    return i >= 0 && i < this.slots.length ? this.slots[i] : -1;
  }

  /**
   * Re-derive the proxies of `indices` from the store. `dimsOf(i)`: the unit proxy of index `i`,
   * null when it is not pickable (no LOD0 instance, ground cover, skipped def…). Removed
   * indices (`PICK_REMOVED_FLAG`) lose their proxy.
   */
  refresh(
    store: PickStore,
    indices: readonly number[],
    dimsOf: (i: number) => ProxyDims | null,
  ): void {
    for (const i of indices) {
      if (i < 0 || i >= store.count) continue;
      if (i >= this.slots.length) {
        const next = new Int32Array(Math.max(i + 1, Math.ceil(this.slots.length * 1.25) + 64));
        next.fill(-1);
        next.set(this.slots);
        this.slots = next;
      }
      const old = this.slots[i];
      if (old >= 0) this.hash.remove(old);
      this.slots[i] = -1;
      if (store.flags[i] & PICK_REMOVED_FLAG) continue;
      const dims = dimsOf(i);
      if (!dims) continue;
      const s = store.scale[i];
      this.slots[i] = this.hash.add(
        i,
        store.defId[i],
        store.x[i],
        store.y[i] + dims[2] * s,
        store.z[i],
        dims[0] * s,
        Math.max(0.3, dims[1] * s),
      );
    }
  }
}

/** A pool of agents exposing `[x, y + height, z, radius]` sphere records (AgentKind.positions). */
export interface AgentSource {
  name: string;
  fill(out: Float32Array, ids: Uint16Array): number;
  capacity: number;
}

export type PickKind = 'prop' | 'agent' | 'terrain';

export interface PickHit {
  kind: PickKind;
  /**
   * Prop: edit-model prop id (TASK-213 — scatter index, or `EDIT_PROP_ID_BASE + k` for an
   * edit-added prop; −1 for render-only settlement props). Agent: slot in its kind. Terrain: −1.
   */
  id: number;
  /** Prop def id / agent kind key / 'terrain' | 'water'. */
  name: string;
  /** Prop: render PropStore index (the instance). Agent: same as `id`. Terrain: −1. */
  instanceIndex: number;
  /** Prop: its rotation (rad), for the move tool. */
  rotY?: number;
  /** Distance along the ray. */
  t: number;
  x: number;
  y: number;
  z: number;
  /** Terrain hit under the sea plane. */
  water: boolean;
}

export interface PickerDeps {
  march: Omit<MarchOpts, 'near' | 'far'>;
  hash: PropHash | null;
  defNames: readonly string[];
  agents: readonly AgentSource[];
  /** Prop visibility (tier LOD gating); omitted = all visible. */
  propVisible?: (id: number) => boolean;
  /** Proxy instance id → the hit's `id` (edit-model prop id); omitted = the instance id. */
  propId?: (instance: number) => number;
  near: number;
  far: number;
}

/** Reusable picker (scratch buffers sized once). */
export class Picker {
  private readonly tOut = new Float64Array(1);
  private readonly buf: Float32Array[];
  private readonly ids: Uint16Array[];

  constructor(private readonly d: PickerDeps) {
    this.buf = d.agents.map((a) => new Float32Array(a.capacity * 4));
    this.ids = d.agents.map((a) => new Uint16Array(a.capacity));
  }

  pick(r: Ray): PickHit | null {
    const d = this.d;
    const tTerrain = marchTerrain(r, { ...d.march, near: d.near, far: d.far });
    let tBest = Number.isFinite(tTerrain) ? tTerrain : d.far;
    let hit: PickHit | null = null;
    if (Number.isFinite(tTerrain)) {
      const x = r.ox + r.dx * tTerrain;
      const z = r.oz + r.dz * tTerrain;
      const y = r.oy + r.dy * tTerrain;
      const water = d.march.heightAt(x, z) < 0;
      hit = {
        kind: 'terrain',
        id: -1,
        name: water ? 'water' : 'terrain',
        instanceIndex: -1,
        t: tTerrain,
        x,
        y,
        z,
        water,
      };
    }
    if (d.hash) {
      const slot = d.hash.nearest(r, tBest, this.tOut, d.propVisible);
      if (slot >= 0) {
        const t = this.tOut[0];
        const P = d.hash.props;
        tBest = t;
        const inst = P.id[slot];
        hit = {
          kind: 'prop',
          id: d.propId ? d.propId(inst) : inst,
          name: d.defNames[P.def[slot]] ?? '?',
          instanceIndex: inst,
          t,
          x: r.ox + r.dx * t,
          y: r.oy + r.dy * t,
          z: r.oz + r.dz * t,
          water: false,
        };
      }
    }
    for (let a = 0; a < d.agents.length; a++) {
      const src = d.agents[a];
      const buf = this.buf[a];
      const n = src.fill(buf, this.ids[a]);
      for (let i = 0; i < n; i++) {
        const t = raySphere(r, buf[i * 4], buf[i * 4 + 1], buf[i * 4 + 2], buf[i * 4 + 3], 0);
        if (t >= 0 && t < tBest) {
          tBest = t;
          const id = this.ids[a][i];
          hit = {
            kind: 'agent',
            id,
            name: src.name,
            instanceIndex: id,
            t,
            x: r.ox + r.dx * t,
            y: r.oy + r.dy * t,
            z: r.oz + r.dz * t,
            water: false,
          };
        }
      }
    }
    return hit;
  }
}

/** Click jitter filter (ARCHITECTURE §6): a click is a press + release that moved < px within < ms. */
export class ClickFilter {
  private id = -1;
  private x = 0;
  private y = 0;
  private t = 0;

  constructor(
    private readonly maxPx: number,
    private readonly maxMs: number,
  ) {}

  down(id: number, x: number, y: number, t: number): void {
    this.id = id;
    this.x = x;
    this.y = y;
    this.t = t;
  }

  /** A second finger / a drag started: the current press can no longer become a click. */
  cancel(): void {
    this.id = -1;
  }

  /** True when the release completes a click. */
  up(id: number, x: number, y: number, t: number): boolean {
    const ok =
      this.id >= 0 &&
      id === this.id &&
      Math.hypot(x - this.x, y - this.y) < this.maxPx &&
      t - this.t < this.maxMs;
    this.id = -1;
    return ok;
  }
}
