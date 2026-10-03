import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { PropStore } from '../../world/prop-store.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { PROP_DEFS, PROP_DEF_INDEX, type PropDef } from '../../content/props.ts';
import { buildProp, type Lod } from '../../geo/index.ts';
import { unitHash } from '../../core/hash.ts';
import { BLOOM_IN } from '../../content/anim.ts';
import type { Counters } from '../../capture/api.ts';
import { CHUNK_SIZE, CHUNKS_PER_SIDE } from '../../world/types.ts';

/**
 * PropBatcher (ARCHITECTURE §3, D-004): one InstancedMesh per
 * (def, variant, LOD, island group) — ground cover per chunk — with per-instance
 * `aSeed` / `aAppear`. Tier changes queue bloom-ins (≤ BLOOM_IN.maxPerFrame per
 * frame, 0–220 ms stagger). T0 shows cluster-proxy blobs instead of trees.
 */
export interface BatcherDeps {
  scope: Scope;
  seed: number;
  counters: Counters;
  /** Material for a def at a LOD; must honour aAppear (bloom-in / dither) or pops count as hard. */
  materialFor: (def: PropDef, lod: Lod, groundCover: boolean) => THREE.Material;
  depthMaterialFor?: (def: PropDef, lod: Lod, groundCover: boolean) => THREE.Material | null;
  /** True when materialFor implements bloom-in/dither from aAppear. */
  softAppear: boolean;
  castShadows: boolean;
  /** Ground-cover visibility radius around the focus (u). */
  groundCoverRadius?: number;
}

interface Group {
  mesh: THREE.InstancedMesh;
  defIndex: number;
  def: PropDef;
  lod: Lod;
  /** islandId or chunkId. */
  bucket: number;
  groundCover: boolean;
  /** Store indices (or −1 for synthetic blobs). */
  members: Int32Array;
  appear: THREE.InstancedBufferAttribute;
  visible: boolean;
  cx: number;
  cz: number;
}

export interface PropBatcher {
  group: THREE.Group;
  readonly stats: {
    instances: number;
    groundCover: number;
    groups: number;
    visibleInstances: number;
  };
  /** Tier change: swap LODs, show/hide defs, queue bloom-ins at `time`. */
  setTier(tier: number, time: number): void;
  /** Per frame: drain the pop queue and gate ground-cover chunks around the focus. */
  update(time: number, focusX: number, focusZ: number): void;
  /** Groups for picking / debugging. */
  readonly groups: readonly Group[];
}

const HIDDEN_APPEAR = 1e9;
const ALWAYS_APPEAR = -1e3;
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _axis = new THREE.Vector3(0, 1, 0);

export function createPropBatcher(store: PropStore, d: BatcherDeps): PropBatcher {
  const root = new THREE.Group();
  root.name = 'props';
  const geoCache = new Map<string, THREE.BufferGeometry>();
  const geometryFor = (def: PropDef, variant: number, lod: Lod): THREE.BufferGeometry => {
    const key = `${def.geo}:${variant}:${lod}`;
    let g = geoCache.get(key);
    if (!g) {
      g = buildProp(def.geo, d.seed, variant, lod);
      d.scope.add(g);
      geoCache.set(key, g);
    }
    return g;
  };

  // ---- bucket instances
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < store.count; i++) {
    const def = PROP_DEFS[store.defId[i]];
    if (!def) continue;
    const gc = (store.flags[i] & PropFlag.groundCover) !== 0;
    const bucket = gc ? store.chunkId[i] : store.islandId[i];
    const key = `${store.defId[i]}:${store.variant[i]}:${gc ? 'c' : 'i'}${bucket}`;
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(i);
  }

  const groups: Group[] = [];
  let instances = 0;
  let groundCover = 0;

  const makeGroup = (
    def: PropDef,
    defIndex: number,
    variant: number,
    lod: Lod,
    bucket: number,
    gc: boolean,
    members: Int32Array,
    place: (
      k: number,
      out: { x: number; y: number; z: number; rotY: number; scale: number },
    ) => void,
  ): Group => {
    const base = geometryFor(def, variant, lod);
    const geo = new THREE.InstancedBufferGeometry();
    for (const name of Object.keys(base.attributes)) geo.setAttribute(name, base.attributes[name]);
    geo.boundingSphere = base.boundingSphere?.clone() ?? null;
    geo.boundingBox = base.boundingBox?.clone() ?? null;
    const n = members.length;
    const seeds = new Float32Array(n);
    const appear = new Float32Array(n).fill(HIDDEN_APPEAR);
    const mat = d.materialFor(def, lod, gc);
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const depth = d.depthMaterialFor?.(def, lod, gc);
    if (depth) mesh.customDepthMaterial = depth;
    mesh.castShadow = d.castShadows && !gc;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    const tmp = { x: 0, y: 0, z: 0, rotY: 0, scale: 1 };
    let cx = 0;
    let cz = 0;
    for (let k = 0; k < n; k++) {
      place(k, tmp);
      _p.set(tmp.x, tmp.y, tmp.z);
      _q.setFromAxisAngle(_axis, tmp.rotY);
      _s.setScalar(tmp.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(k, _m);
      seeds[k] = unitHash(d.seed, members[k] >= 0 ? members[k] : k + 100000, defIndex);
      cx += tmp.x;
      cz += tmp.z;
    }
    mesh.instanceMatrix.needsUpdate = true;
    const aSeed = new THREE.InstancedBufferAttribute(seeds, 1);
    const aAppear = new THREE.InstancedBufferAttribute(appear, 1);
    aAppear.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSeed', aSeed);
    geo.setAttribute('aAppear', aAppear);
    mesh.computeBoundingSphere();
    mesh.visible = false;
    mesh.name = `${def.id}:${variant}:L${lod}:${gc ? 'c' : 'i'}${bucket}`;
    root.add(mesh);
    d.scope.defer(() => {
      mesh.dispose();
      geo.dispose();
    });
    const g: Group = {
      mesh,
      defIndex,
      def,
      lod,
      bucket,
      groundCover: gc,
      members,
      appear: aAppear,
      visible: false,
      cx: n ? cx / n : 0,
      cz: n ? cz / n : 0,
    };
    groups.push(g);
    return g;
  };

  for (const [key, arr] of buckets) {
    const [defIdStr, variantStr] = key.split(':');
    const defIndex = Number(defIdStr);
    const variant = Number(variantStr);
    const def = PROP_DEFS[defIndex];
    const gc = key.includes(':c');
    const bucket = Number(key.slice(key.indexOf(gc ? ':c' : ':i') + 2));
    const members = Int32Array.from(arr);
    const place = (
      k: number,
      o: { x: number; y: number; z: number; rotY: number; scale: number },
    ): void => {
      const i = members[k];
      o.x = store.x[i];
      o.y = store.y[i];
      o.z = store.z[i];
      o.rotY = store.rotY[i];
      o.scale = store.scale[i];
    };
    const lods: Lod[] = gc ? [0] : [0, 1];
    for (const lod of lods) makeGroup(def, defIndex, variant, lod, bucket, gc, members, place);
    if (gc) groundCover += members.length;
    else instances += members.length;
  }

  // ---- T0 cluster proxies from clusterable trees: one blob per 8 u cell with ≥ 1 tree
  const blobDef = PROP_DEFS[PROP_DEF_INDEX.treeBlob];
  if (blobDef) {
    const cells = new Map<string, { x: number; z: number; y: number; n: number; island: number }>();
    for (let i = 0; i < store.count; i++) {
      if (!(store.flags[i] & PropFlag.clusterable)) continue;
      const cx = Math.floor(store.x[i] / 8);
      const cz = Math.floor(store.z[i] / 8);
      const k = `${cx},${cz}`;
      let c = cells.get(k);
      if (!c) {
        c = { x: 0, z: 0, y: 0, n: 0, island: store.islandId[i] };
        cells.set(k, c);
      }
      c.x += store.x[i];
      c.z += store.z[i];
      c.y += store.y[i];
      c.n++;
    }
    const byIsland = new Map<
      number,
      { x: number; z: number; y: number; n: number; island: number }[]
    >();
    for (const c of cells.values()) {
      c.x /= c.n;
      c.z /= c.n;
      c.y /= c.n;
      let a = byIsland.get(c.island);
      if (!a) {
        a = [];
        byIsland.set(c.island, a);
      }
      a.push(c);
    }
    for (const [island, list] of byIsland) {
      for (let variant = 0; variant < blobDef.variants; variant++) {
        const mine = list.filter((_, idx) => idx % blobDef.variants === variant);
        if (!mine.length) continue;
        const members = new Int32Array(mine.length).fill(-1);
        makeGroup(blobDef, PROP_DEF_INDEX.treeBlob, variant, 0, island, false, members, (k, o) => {
          const c = mine[k];
          o.x = c.x;
          o.y = c.y;
          o.z = c.z;
          o.rotY = unitHash(d.seed, k, 77) * Math.PI * 2;
          o.scale = Math.min(2.4, 0.9 + 0.3 * Math.sqrt(c.n));
        });
        instances += mine.length;
      }
    }
  }

  // ---- visibility + pop queue
  let tier = -1;
  let firstUpdate = true;
  const popQueue: { g: Group; k: number }[] = [];
  const stats = { instances, groundCover, groups: groups.length, visibleInstances: 0 };
  const gcRadius = d.groundCoverRadius ?? 60;

  const show = (g: Group, time: number, instant: boolean): void => {
    if (g.visible) return;
    g.visible = true;
    g.mesh.visible = true;
    const arr = g.appear.array as Float32Array;
    if (instant || !d.softAppear) {
      arr.fill(ALWAYS_APPEAR);
      g.appear.needsUpdate = true;
      if (!instant && !d.softAppear) d.counters.hardPops += arr.length;
      return;
    }
    arr.fill(HIDDEN_APPEAR);
    g.appear.needsUpdate = true;
    for (let k = 0; k < arr.length; k++) popQueue.push({ g, k });
    void time;
  };
  const hide = (g: Group): void => {
    if (!g.visible) return;
    g.visible = false;
    g.mesh.visible = false;
  };

  const wantsVisible = (g: Group, t: number): boolean => {
    if (g.def.tier > t) return false;
    if (g.def.id === 'treeBlob') return t === 0;
    if ((g.def.flags & PropFlag.clusterable) !== 0 && t === 0) return false;
    // LOD: tier 0–1 use LOD1 (if the def has it), tiers 2–3 LOD0
    if (!g.groundCover) {
      const wantLod: Lod = t <= 1 ? 1 : 0;
      if (g.lod !== wantLod && g.def.id !== 'treeBlob') return false;
    }
    return true;
  };

  const batcher: PropBatcher = {
    group: root,
    stats,
    groups,
    setTier(t, time) {
      const first = tier < 0;
      tier = t;
      for (const g of groups) {
        if (g.groundCover) continue; // gated by update()
        if (wantsVisible(g, t)) show(g, time, first);
        else hide(g);
      }
    },
    update(time, fx, fz) {
      // ground cover: only chunks near the focus, only at T3
      if (tier >= 0) {
        for (const g of groups) {
          if (!g.groundCover) continue;
          if (tier < 3) {
            hide(g);
            continue;
          }
          const ccx =
            (g.bucket % CHUNKS_PER_SIDE) * CHUNK_SIZE -
            (CHUNKS_PER_SIDE * CHUNK_SIZE) / 2 +
            CHUNK_SIZE / 2;
          const ccz =
            Math.floor(g.bucket / CHUNKS_PER_SIDE) * CHUNK_SIZE -
            (CHUNKS_PER_SIDE * CHUNK_SIZE) / 2 +
            CHUNK_SIZE / 2;
          const dist = Math.hypot(ccx - fx, ccz - fz);
          if (dist < gcRadius + CHUNK_SIZE * 0.71) show(g, time, firstUpdate);
          else hide(g);
        }
      }
      firstUpdate = false;
      // drain pops
      let n = 0;
      while (popQueue.length && n < BLOOM_IN.maxPerFrame) {
        const { g, k } = popQueue.shift()!;
        const arr = g.appear.array as Float32Array;
        if (arr[k] >= HIDDEN_APPEAR) {
          const stagger = unitHash(d.seed, k, 31) * (BLOOM_IN.staggerMs / 1000);
          arr[k] = time + stagger;
          g.appear.needsUpdate = true;
        }
        n++;
      }
      let vis = 0;
      for (const g of groups) if (g.visible) vis += g.mesh.count;
      stats.visibleInstances = vis;
      d.counters.instances = vis;
      d.counters.groundCover =
        tier >= 3
          ? groups.reduce((a, g) => a + (g.groundCover && g.visible ? g.mesh.count : 0), 0)
          : 0;
    },
  };
  return batcher;
}
