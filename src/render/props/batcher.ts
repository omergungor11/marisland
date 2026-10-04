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
import { EDIT_RENDER } from '../../content/edit.ts';
import { makeBlobs, writeBlobMatrix } from './contact-blobs.ts';
import { ALWAYS_APPEAR, APPEAR_OUT_SECONDS, HIDDEN_APPEAR, encodeAppearOut } from './appear.ts';

/**
 * PropBatcher (ARCHITECTURE §3, D-004): one InstancedMesh per
 * (def, variant, LOD, island group) — ground cover per chunk — with per-instance
 * `aSeed` / `aAppear`. Tier changes queue bloom-ins (≤ BLOOM_IN.maxPerFrame per
 * frame, 0–220 ms stagger). T0 shows cluster-proxy blobs instead of trees.
 *
 * TASK-211 `rewrite(indices)`: after an edit, the touched store indices get new matrices
 * (re-grounded / moved), fade out when flagged removed (reverse bloom-in; instant in capture),
 * fade back in when restored, and edit-added indices are appended to their (def, variant,
 * bucket) group — growing the InstancedMesh with headroom (`EDIT_RENDER.batchHeadroom`) or
 * creating the group. Contact blobs mirror their props; ground cover is just another group.
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
  /** Capture mode: edit removals / additions apply instantly (no fades). */
  instantEdits?: boolean;
  castShadows: boolean;
  /** Ground-cover visibility radius around the focus (u). */
  groundCoverRadius?: number;
  /** Contact-shadow blobs under grounded props (default true). */
  blobs?: boolean;
}

export interface Group {
  mesh: THREE.InstancedMesh;
  defIndex: number;
  def: PropDef;
  variant: number;
  lod: Lod;
  /** islandId or chunkId. */
  bucket: number;
  groundCover: boolean;
  /** Store indices (or −1 for synthetic blobs); length = live instance count. */
  members: Int32Array;
  /** Allocated instances (≥ members.length; edits append into the spare slots). */
  capacity: number;
  /** Next `show` is instant (group created by an edit in capture mode). */
  instantShow: boolean;
  appear: THREE.InstancedBufferAttribute;
  blobs: THREE.InstancedMesh | null;
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
  /**
   * TASK-211: re-sync the instances of store indices `indices` (matrices, removed flag) and
   * append indices that have no instance yet; `time` = engine time (fade starts).
   */
  rewrite(indices: readonly number[], time: number): RewriteStats;
}

export interface RewriteStats {
  updated: number;
  appended: number;
  removed: number;
  restored: number;
  /** Groups reallocated for capacity. */
  grown: number;
  /** Groups created for a new (def, variant, bucket). */
  created: number;
}

/** Instances to allocate so `needed` fit with edit headroom. */
export function grownCapacity(needed: number): number {
  return Math.ceil(needed * (1 + EDIT_RENDER.batchHeadroom)) + EDIT_RENDER.batchMinSpare;
}

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
    if (store.flags[i] & PropFlag.removed) continue; // removed by a replayed edit log
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
    capacity = members.length,
  ): Group => {
    const base = geometryFor(def, variant, lod);
    const geo = new THREE.InstancedBufferGeometry();
    for (const name of Object.keys(base.attributes)) geo.setAttribute(name, base.attributes[name]);
    geo.boundingSphere = base.boundingSphere?.clone() ?? null;
    geo.boundingBox = base.boundingBox?.clone() ?? null;
    const n = members.length;
    const seeds = new Float32Array(capacity);
    const appear = new Float32Array(capacity).fill(HIDDEN_APPEAR);
    const mat = d.materialFor(def, lod, gc);
    const mesh = new THREE.InstancedMesh(geo, mat, capacity);
    mesh.count = n;
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
    let blobs: THREE.InstancedMesh | null = null;
    if ((d.blobs ?? true) && !gc && (def.flags & PropFlag.grounded) !== 0) {
      const radii = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        place(k, tmp);
        radii[k] = blobRadius(def, tmp.scale);
      }
      blobs = makeBlobs(mesh, radii, aAppear, capacity);
      blobs.visible = false;
      root.add(blobs);
    }
    const g: Group = {
      mesh,
      defIndex,
      def,
      variant,
      lod,
      bucket,
      groundCover: gc,
      members,
      capacity,
      instantShow: false,
      appear: aAppear,
      blobs,
      visible: false,
      cx: n ? cx / n : 0,
      cz: n ? cz / n : 0,
    };
    // the group's meshes may be reallocated by an edit (`grow`): free whatever is current.
    // InstancedMesh.dispose() frees the instance matrix only: the per-group
    // InstancedBufferGeometry is ours too (it leaked one geometry per shown blob group).
    d.scope.defer(() => {
      g.mesh.dispose();
      g.mesh.geometry.dispose();
      g.blobs?.dispose();
      g.blobs?.geometry.dispose();
    });
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
      if (store.flags[i] & PropFlag.removed) continue;
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
  /** Set by the edit section below: zero-scale the group's finished removal fades. */
  let finishRemovals: (g: Group) => void = () => {};
  let tier = -1;
  let firstUpdate = true;
  const popQueue: { g: Group; k: number }[] = [];
  const stats = { instances, groundCover, groups: groups.length, visibleInstances: 0 };
  const gcRadius = d.groundCoverRadius ?? 60;

  const show = (g: Group, time: number, instantIn: boolean): void => {
    if (g.visible) return;
    finishRemovals(g);
    const instant = instantIn || g.instantShow;
    g.instantShow = false;
    g.visible = true;
    g.mesh.visible = true;
    if (g.blobs) g.blobs.visible = true;
    const arr = g.appear.array as Float32Array;
    const n = g.mesh.count;
    if (instant || !d.softAppear) {
      arr.fill(ALWAYS_APPEAR);
      g.appear.needsUpdate = true;
      if (!instant && !d.softAppear) d.counters.hardPops += n;
      return;
    }
    arr.fill(HIDDEN_APPEAR);
    g.appear.needsUpdate = true;
    for (let k = 0; k < n; k++) popQueue.push({ g, k });
    void time;
  };
  const hide = (g: Group): void => {
    if (!g.visible) return;
    finishRemovals(g);
    g.visible = false;
    g.mesh.visible = false;
    if (g.blobs) g.blobs.visible = false;
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

  // ---- edits (TASK-211)
  const instantEdits = d.instantEdits ?? false;
  /** Removal fades in flight: the instance is zero-scaled once its fade is over. */
  let pending: { g: Group; k: number; i: number; at: number }[] = [];
  /** Store indices currently hidden by an edit (`PropFlag.removed`). */
  const removedIdx = new Set<number>();
  // store index → instance slots, and (def, variant, bucket) → LOD groups; built on first edit
  let slotMap: Map<number, { g: Group; k: number }[]> | null = null;
  let keyMap: Map<string, Group[]> | null = null;
  const groupKey = (defIndex: number, variant: number, gc: boolean, bucket: number): string =>
    `${defIndex}:${variant}:${gc ? 'c' : 'i'}${bucket}`;
  const maps = (): {
    slots: Map<number, { g: Group; k: number }[]>;
    keys: Map<string, Group[]>;
  } => {
    if (!slotMap || !keyMap) {
      slotMap = new Map();
      keyMap = new Map();
      for (const g of groups) {
        if (g.members.length && g.members[0] < 0) continue; // T0 cluster proxies
        const key = groupKey(g.defIndex, g.variant, g.groundCover, g.bucket);
        let arr = keyMap.get(key);
        if (!arr) keyMap.set(key, (arr = []));
        arr.push(g);
        for (let k = 0; k < g.members.length; k++) {
          const i = g.members[k];
          let sl = slotMap.get(i);
          if (!sl) slotMap.set(i, (sl = []));
          sl.push({ g, k });
        }
      }
    }
    return { slots: slotMap, keys: keyMap };
  };
  const touched = new Set<Group>();
  /** Instance matrix of store index `i` into slot `k` (zero scale = hidden), blob following. */
  const writeSlot = (g: Group, k: number, i: number, zero: boolean): void => {
    _p.set(store.x[i], store.y[i], store.z[i]);
    _q.setFromAxisAngle(_axis, store.rotY[i]);
    _s.setScalar(zero ? 0 : store.scale[i]);
    _m.compose(_p, _q, _s);
    g.mesh.setMatrixAt(k, _m);
    // ranges, not a full upload: click reactions add their own ranges in the same frame
    g.mesh.instanceMatrix.addUpdateRange(k * 16, 16);
    g.mesh.instanceMatrix.needsUpdate = true;
    if (g.blobs)
      writeBlobMatrix(
        g.blobs,
        k,
        store.x[i],
        store.y[i],
        store.z[i],
        store.rotY[i],
        zero ? 0 : blobRadius(g.def, store.scale[i]),
      );
    touched.add(g);
  };
  const setAppear = (g: Group, k: number, v: number): void => {
    (g.appear.array as Float32Array)[k] = v;
    g.appear.needsUpdate = true;
  };
  /** Appear value for an instance (re)appearing through an edit at `time`. */
  const appearNow = (g: Group, time: number): number => {
    if (!g.visible) return HIDDEN_APPEAR; // `show` fills the group when it turns visible
    if (instantEdits || !d.softAppear) {
      if (!instantEdits) d.counters.hardPops++;
      return ALWAYS_APPEAR;
    }
    return time;
  };
  const cancelPending = (g: Group, k: number): void => {
    if (pending.length) pending = pending.filter((p) => p.g !== g || p.k !== k);
  };
  const flushTouched = (): void => {
    for (const g of touched) {
      g.mesh.computeBoundingSphere();
      g.blobs?.computeBoundingSphere();
    }
    touched.clear();
  };
  finishRemovals = (g: Group): void => {
    if (!pending.length) return;
    const keep: typeof pending = [];
    for (const p of pending) {
      if (p.g === g) writeSlot(p.g, p.k, p.i, true);
      else keep.push(p);
    }
    pending = keep;
    flushTouched();
  };

  /** Reallocate `g` for `cap` instances (new mesh + geometry; old ones disposed). */
  const grow = (g: Group, cap: number): void => {
    const old = g.mesh;
    const oldGeo = old.geometry as THREE.InstancedBufferGeometry;
    const geo = new THREE.InstancedBufferGeometry();
    for (const name of Object.keys(oldGeo.attributes))
      if (name !== 'aSeed' && name !== 'aAppear') geo.setAttribute(name, oldGeo.attributes[name]);
    geo.boundingSphere = oldGeo.boundingSphere?.clone() ?? null;
    geo.boundingBox = oldGeo.boundingBox?.clone() ?? null;
    const seeds = new Float32Array(cap);
    seeds.set(oldGeo.getAttribute('aSeed').array as Float32Array);
    const appear = new Float32Array(cap).fill(HIDDEN_APPEAR);
    appear.set(g.appear.array as Float32Array);
    const aAppear = new THREE.InstancedBufferAttribute(appear, 1);
    aAppear.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geo.setAttribute('aAppear', aAppear);
    const mesh = new THREE.InstancedMesh(geo, old.material, cap);
    (mesh.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    mesh.count = old.count;
    mesh.customDepthMaterial = old.customDepthMaterial;
    mesh.castShadow = old.castShadow;
    mesh.receiveShadow = old.receiveShadow;
    mesh.frustumCulled = old.frustumCulled;
    mesh.visible = old.visible;
    mesh.renderOrder = old.renderOrder;
    mesh.name = old.name;
    root.remove(old);
    root.add(mesh);
    old.dispose();
    oldGeo.dispose();
    g.mesh = mesh;
    g.appear = aAppear;
    g.capacity = cap;
    if (g.blobs) {
      const oldBlobs = g.blobs;
      const blobs = makeBlobs(mesh, new Float32Array(mesh.count), aAppear, cap);
      for (let k = 0; k < g.members.length; k++) {
        const i = g.members[k];
        writeBlobMatrix(
          blobs,
          k,
          store.x[i],
          store.y[i],
          store.z[i],
          store.rotY[i],
          removedIdx.has(i) ? 0 : blobRadius(g.def, store.scale[i]),
        );
      }
      blobs.visible = oldBlobs.visible;
      root.remove(oldBlobs);
      root.add(blobs);
      oldBlobs.dispose();
      oldBlobs.geometry.dispose();
      g.blobs = blobs;
    }
    touched.add(g);
  };

  /** Append store index `i` (no instance yet) to its group(s), creating them when missing. */
  const append = (i: number, def: PropDef, time: number, st: RewriteStats): void => {
    const { slots, keys } = maps();
    const defIndex = store.defId[i];
    const variant = store.variant[i];
    const gc = (store.flags[i] & PropFlag.groundCover) !== 0;
    const bucket = gc ? store.chunkId[i] : store.islandId[i];
    const key = groupKey(defIndex, variant, gc, bucket);
    const gs = keys.get(key);
    const sl: { g: Group; k: number }[] = [];
    if (!gs) {
      const members = Int32Array.of(i);
      const made: Group[] = [];
      const place = (
        _k: number,
        o: { x: number; y: number; z: number; rotY: number; scale: number },
      ): void => {
        o.x = store.x[i];
        o.y = store.y[i];
        o.z = store.z[i];
        o.rotY = store.rotY[i];
        o.scale = store.scale[i];
      };
      for (const lod of (gc ? [0] : [0, 1]) as Lod[]) {
        const g = makeGroup(
          def,
          defIndex,
          variant,
          lod,
          bucket,
          gc,
          members,
          place,
          grownCapacity(1),
        );
        g.instantShow = instantEdits;
        made.push(g);
        sl.push({ g, k: 0 });
        // ground cover is gated by `update`; the rest follows the current tier now
        if (!gc && tier >= 0) {
          if (wantsVisible(g, tier)) show(g, time, instantEdits);
          else hide(g);
        }
      }
      keys.set(key, made);
      st.created += made.length;
      stats.groups = groups.length;
    } else {
      for (const g of gs) {
        const k = g.mesh.count;
        if (k >= g.capacity) {
          grow(g, grownCapacity(k + 1));
          st.grown++;
        }
        const m = new Int32Array(k + 1);
        m.set(g.members);
        m[k] = i;
        g.members = m;
        g.mesh.count = k + 1;
        if (g.blobs) g.blobs.count = k + 1;
        const aSeed = g.mesh.geometry.getAttribute('aSeed') as THREE.InstancedBufferAttribute;
        (aSeed.array as Float32Array)[k] = unitHash(d.seed, i, defIndex);
        aSeed.needsUpdate = true;
        writeSlot(g, k, i, false);
        setAppear(g, k, appearNow(g, time));
        sl.push({ g, k });
      }
    }
    slots.set(i, sl);
    if (gc) stats.groundCover++;
    else stats.instances++;
    st.appended++;
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
      // removal fades that are over → zero-scaled instances (TASK-211)
      if (pending.length) {
        const keep: typeof pending = [];
        for (const p of pending) {
          if (time >= p.at) writeSlot(p.g, p.k, p.i, true);
          else keep.push(p);
        }
        pending = keep;
        flushTouched();
      }
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
    rewrite(indices, time) {
      const st: RewriteStats = {
        updated: 0,
        appended: 0,
        removed: 0,
        restored: 0,
        grown: 0,
        created: 0,
      };
      const { slots } = maps();
      for (const i of indices) {
        if (i < 0 || i >= store.count) continue;
        const def = PROP_DEFS[store.defId[i]];
        if (!def) continue;
        const removed = (store.flags[i] & PropFlag.removed) !== 0;
        const sl = slots.get(i);
        if (!sl) {
          if (!removed) append(i, def, time, st);
          continue;
        }
        const wasRemoved = removedIdx.has(i);
        if (removed) {
          if (wasRemoved) continue; // already hidden (or fading)
          for (const { g, k } of sl) {
            if (g.visible && d.softAppear && !instantEdits) {
              // reverse bloom-in; zero-scaled by `update` when the fade is over
              writeSlot(g, k, i, false);
              setAppear(g, k, encodeAppearOut(time));
              pending.push({ g, k, i, at: time + APPEAR_OUT_SECONDS });
            } else writeSlot(g, k, i, true);
          }
          removedIdx.add(i);
          st.removed++;
          continue;
        }
        for (const { g, k } of sl) {
          if (wasRemoved) {
            cancelPending(g, k);
            setAppear(g, k, appearNow(g, time));
          }
          writeSlot(g, k, i, false);
        }
        if (wasRemoved) {
          removedIdx.delete(i);
          st.restored++;
        } else st.updated++;
      }
      flushTouched();
      return st;
    },
  };
  return batcher;
}

/** Contact-blob radius under a prop (ART_BIBLE §1: 0.6 × footprint, ×1.6 for the soft edge). */
function blobRadius(def: PropDef, scale: number): number {
  return def.footprint * scale * 0.6 * 1.6;
}
