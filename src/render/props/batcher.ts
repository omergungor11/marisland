import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { PropStore } from '../../world/prop-store.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { PROP_DEFS, PROP_DEF_INDEX, type PropDef } from '../../content/props.ts';
import { buildProp, type Lod } from '../../geo/index.ts';
import { unitHash } from '../../core/hash.ts';
import { BLOOM_IN } from '../../content/anim.ts';
import type { Counters } from '../../capture/api.ts';
import {
  CHUNK_SIZE,
  CHUNKS_PER_SIDE,
  heightAt,
  type Heightfield,
  type ThemeId,
} from '../../world/types.ts';
import { smoothHeightAt } from '../../shared/terrain-sample.ts';
import { EDIT_RENDER } from '../../content/edit.ts';
import { THEMES } from '../../content/themes/index.ts';
import { FOLIAGE } from '../../content/palette.ts';
import { makeBlobs, writeBlobMatrix } from './contact-blobs.ts';
import {
  CANOPY_KINDS,
  ClusterIndex,
  canopyKindOf,
  canopyStats,
  clusterScale,
  isCanopy,
  mixLattice,
  rampRatio,
  BLOB_MIX_STEPS,
  type CanopyKind,
  type CanopyStats,
  type ClusterCell,
  type Rgb,
  type TreePalette,
} from './clusters.ts';
import { ALWAYS_APPEAR, APPEAR_OUT_SECONDS, HIDDEN_APPEAR, encodeAppearOut } from './appear.ts';

/**
 * PropBatcher (ARCHITECTURE §3, D-004): one InstancedMesh per
 * (def, variant, LOD0, island) and per (def, variant, LOD1) across islands (sweep D5) —
 * ground cover per chunk — with per-instance
 * `aSeed` / `aAppear`. Tier changes queue bloom-ins (≤ BLOOM_IN.maxPerFrame per
 * frame, 0–220 ms stagger). T0 shows cluster-proxy blobs instead of trees.
 *
 * TASK-211 `rewrite(indices)`: after an edit, the touched store indices get new matrices
 * (re-grounded / moved), fade out when flagged removed (reverse bloom-in; instant in capture),
 * fade back in when restored, and edit-added indices are appended to their (def, variant,
 * bucket) group — growing the InstancedMesh with headroom (`EDIT_RENDER.batchHeadroom`) or
 * creating the group. Contact blobs mirror their props; ground cover is just another group.
 *
 * TASK-373 (D-031 / D-032, cross-tier consistency):
 * - Every def draws its OWN LOD1 (the shared `def.lod1` proxy of D-027 is no longer used). A def
 *   whose LOD1 geometry is identical across variants (D-032: variants differ only in LOD0 detail)
 *   gets one LOD1 group (variant 0) instead of one per variant.
 * - Large structures (`isLargeStructure`: ≥ STRUCTURE_MIN_SIZE u) show from T0 when
 *   `structuresFromT0` is on (default `STRUCTURES_FROM_T0`): the group's def is an effective copy
 *   with `tier: 0` (so its material has the tier-0 fade too).
 * - T0 tree blobs: one group per colour class across all islands; a class is the cell's canopy
 *   kind mix (clusters.ts) under its island's `treePalette`, the blob geometry recoloured to the
 *   area-weighted canopy colour of those trees.
 * - With `world` given, grounded props whose y is the bilinear `heightAt` are drawn on the smooth
 *   terrain twin (`smoothHeightAt`) where the two differ by > SMOOTH_GROUND_MIN u. Store y stays
 *   bilinear (picking, flood tests and edit re-grounding read it).
 * Interior defs (`def.interior`) have no LOD1 group (tier 2 never shows LOD1) and cast shadows
 * only with `interiorShadows`.
 */

/**
 * Risk 11 (phase-3 M14b): T0 structures add LOD1 draw calls that the per-island far-terrain merge
 * (TASK-371) pays for. Keep this off until that merge lands unless measured calls stay ≤ D-028.
 * Measured 2026-10-05 (main 5eb7570, seed 1001 D-overview, medium/high): off 255, on 263 (the
 * office shells are tier 0 in content already; the flag adds stiltHut / hotSpring / sunkenShip
 * and, on legacy worlds, cottages / barns / cabins). TODO(content): move the flag to src/content.
 */
export const STRUCTURES_FROM_T0 = false;
/** A structure this large (height, or both plan extents, in u) exists from T0 (D-031). */
export const STRUCTURE_MIN_SIZE = 3;
/** Smooth-twin grounding threshold |smooth − bilinear| (u). */
export const SMOOTH_GROUND_MIN = 0.02;
/** Blob shape variant per dominant canopy kind (treeBlob heights 4.4 / 5.0 / 5.8 u). */
const BLOB_SHAPE: Readonly<Record<CanopyKind, number>> = { deciduous: 0, palm: 1, pine: 2 };
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
  /** Interior defs cast shadows too (high quality only; default false). */
  interiorShadows?: boolean;
  /** Ground-cover visibility radius around the focus (u). */
  groundCoverRadius?: number;
  /** Contact-shadow blobs under grounded props (default true). */
  blobs?: boolean;
  /** Large structures from T0 (default `STRUCTURES_FROM_T0`). */
  structuresFromT0?: boolean;
  /**
   * World context: `islands[id].theme` picks the blob `treePalette` (default palette FOLIAGE),
   * `height` enables smooth-twin grounding (off without it).
   */
  world?: BatcherWorld;
}

export interface BatcherWorld {
  height: Heightfield;
  islands: readonly { theme: ThemeId }[];
}

export interface Group {
  mesh: THREE.InstancedMesh;
  defIndex: number;
  /** The def (shared LOD1 group: its first member's def; members may be other defs). */
  def: PropDef;
  /** Geometry variant (shared LOD1 group: the proxy's `lod1.variant`). */
  variant: number;
  lod: Lod;
  /** islandId (LOD0), chunkId (ground cover) or `ALL_ISLANDS` (LOD1). */
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
  /**
   * TASK-213: instance slots of store index `i` (one per LOD group; current meshes — a group may
   * have been reallocated by an edit). Undefined when the index has no instance.
   */
  slotsOf(i: number): readonly { g: Group; k: number }[] | undefined;
  /** TASK-213: T0 cluster cells (tests / debugging). */
  readonly clusters: ClusterIndex;
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
  /** T0 cluster cells re-derived (TASK-213). */
  clusters: number;
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
/** `Group.bucket` of the LOD1 groups, which hold the instances of every island (D5). */
export const ALL_ISLANDS = -1;

/**
 * True for a def drawn from T0 by size (D-031): not a tree / ground cover / interior / blob, and
 * `size` (LOD0 bounds, u) at least STRUCTURE_MIN_SIZE tall or in both plan extents.
 */
export function isLargeStructure(def: PropDef, size: { x: number; y: number; z: number }): boolean {
  if (def.interior || def.id === 'treeBlob') return false;
  if ((def.flags & (PropFlag.clusterable | PropFlag.groundCover)) !== 0) return false;
  return size.y >= STRUCTURE_MIN_SIZE || Math.min(size.x, size.z) >= STRUCTURE_MIN_SIZE;
}

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

  // ---- effective defs (T0 structures) and LOD1 variant collapse
  const fromT0 = d.structuresFromT0 ?? STRUCTURES_FROM_T0;
  const effCache = new Map<number, PropDef>();
  /** The def a group draws with: large structures get `tier: 0` when `fromT0`. */
  const effDef = (defIndex: number, variant: number): PropDef => {
    let e = effCache.get(defIndex);
    if (!e) {
      const def = PROP_DEFS[defIndex];
      e = def;
      if (fromT0 && def.tier > 0) {
        const g = geometryFor(def, variant, 0);
        if (!g.boundingBox) g.computeBoundingBox();
        const size = (g.boundingBox as THREE.Box3).getSize(new THREE.Vector3());
        if (isLargeStructure(def, size)) e = { ...def, tier: 0 };
      }
      effCache.set(defIndex, e);
    }
    return e;
  };
  const lod1Cache = new Map<number, boolean>();
  /** LOD1 variant of (def, variant): 0 when every variant's LOD1 is the same geometry (D-032). */
  const lod1Variant = (defIndex: number, variant: number): number => {
    const def = PROP_DEFS[defIndex];
    if (def.variants < 2) return variant;
    let same = lod1Cache.get(defIndex);
    if (same === undefined) {
      same = false;
      // only structures are expected to collapse (trees keep their LOD1 variants)
      if (effDef(defIndex, variant).tier === 0 && (def.flags & PropFlag.clusterable) === 0) {
        const g0 = geometryFor(def, 0, 1);
        same = true;
        for (let v = 1; v < def.variants && same; v++)
          same = sameGeometry(g0, geometryFor(def, v, 1));
      }
      lod1Cache.set(defIndex, same);
    }
    return same ? 0 : variant;
  };

  // ---- smooth-twin grounding (D-030): render y only, store y stays bilinear
  const hf = d.world?.height ?? null;
  /** Drawn y of store index `i`. */
  const groundY = (i: number): number => {
    const y = store.y[i];
    if (!hf) return y;
    const x = store.x[i];
    const z = store.z[i];
    const b = heightAt(hf, x, z);
    if (Math.abs(y - b) >= 1e-3) return y; // not ground-following (docks, buoys, pads, decks)
    const s = smoothHeightAt(hf, x, z);
    return Math.abs(s - b) > SMOOTH_GROUND_MIN ? s : y;
  };

  // ---- blob colour classes (clusters.ts): kind mix × island tree palette
  const statsCache = new Map<string, CanopyStats>();
  /** Canopy stats of a def's LOD0 geometry at `variant`. */
  const treeStats = (def: PropDef, variant: number): CanopyStats => {
    const key = `${def.geo}:${variant}`;
    let st = statsCache.get(key);
    if (!st) statsCache.set(key, (st = geoStats(geometryFor(def, variant, 0))));
    return st;
  };
  const createBlobColors = (blobDef: PropDef) => {
    /** Reference tree per kind: its LOD0 canopy (area-weighted over variants) is the kind colour. */
    const REF: Readonly<Record<CanopyKind, string>> = {
      deciduous: 'roundTree',
      pine: 'pine',
      palm: 'palm',
    };
    const kindBase = new Map<CanopyKind, Rgb>();
    const kindColor = (pal: TreePalette, k: CanopyKind): Rgb => {
      let base = kindBase.get(k);
      if (!base) {
        base = [0, 0, 0];
        const def = PROP_DEFS[PROP_DEF_INDEX[REF[k]]];
        let a = 0;
        for (let v = 0; def && v < def.variants; v++) {
          const st = treeStats(def, v);
          for (let c = 0; c < 3; c++) base[c] += st.rgb[c] * st.area;
          a += st.area;
        }
        if (a > 0) for (let c = 0; c < 3; c++) base[c] /= a;
        kindBase.set(k, base);
      }
      const r = rampRatio(pal[k], FOLIAGE[k]);
      return [base[0] * r[0], base[1] * r[1], base[2] * r[2]];
    };
    const palettes: TreePalette[] = [];
    const paletteSig: string[] = [];
    const classes = new Map<string, { pal: TreePalette; counts: number[] }>();
    const geos = new Map<string, THREE.BufferGeometry>();
    const w = [0, 0, 0];
    return {
      /** Colour class of a non-empty cell: `${palette}:${lattice counts}`. */
      classOf(c: ClusterCell): string {
        const theme = d.world?.islands[c.island]?.theme;
        const pal: TreePalette = theme ? THEMES[theme].treePalette : FOLIAGE;
        const sig = CANOPY_KINDS.map((k) => pal[k].join(',')).join('|');
        let pi = paletteSig.indexOf(sig);
        if (pi < 0) {
          pi = paletteSig.push(sig) - 1;
          palettes.push(pal);
        }
        w.fill(0);
        for (const i of c.members) {
          const def = PROP_DEFS[store.defId[i]];
          const s = store.scale[i];
          w[CANOPY_KINDS.indexOf(canopyKindOf(def.id))] +=
            treeStats(def, store.variant[i]).area * s * s;
        }
        const counts = mixLattice(w);
        const key = `${pi}:${counts.join(',')}`;
        if (!classes.has(key)) classes.set(key, { pal: palettes[pi], counts });
        return key;
      },
      /** Shape variant: the dominant kind's (ties → first kind). */
      shapeOf(cls: string): number {
        const { counts } = classes.get(cls)!;
        let best = 0;
        for (let k = 1; k < counts.length; k++) if (counts[k] > counts[best]) best = k;
        return Math.min(blobDef.variants - 1, BLOB_SHAPE[CANOPY_KINDS[best]]);
      },
      /** Blob geometry recoloured so its canopy mean is the class colour (trunk untouched). */
      geometryOf(cls: string): THREE.BufferGeometry {
        let g = geos.get(cls);
        if (g) return g;
        const { pal, counts } = classes.get(cls)!;
        const target: Rgb = [0, 0, 0];
        CANOPY_KINDS.forEach((k, ki) => {
          if (!counts[ki]) return;
          const kc = kindColor(pal, k);
          for (let c = 0; c < 3; c++) target[c] += (kc[c] * counts[ki]) / BLOB_MIX_STEPS;
        });
        const base = geometryFor(blobDef, this.shapeOf(cls), 0);
        const own = geoStats(base).rgb;
        const col = base.getAttribute('color') as THREE.BufferAttribute;
        const arr = Float32Array.from(col.array as Float32Array);
        for (let v = 0; v < col.count; v++) {
          if (!isCanopy(arr[v * 3], arr[v * 3 + 1])) continue;
          for (let c = 0; c < 3; c++) arr[v * 3 + c] *= own[c] > 0 ? target[c] / own[c] : 1;
        }
        g = new THREE.BufferGeometry();
        for (const name of Object.keys(base.attributes))
          g.setAttribute(
            name,
            name === 'color' ? new THREE.BufferAttribute(arr, 3) : base.attributes[name],
          );
        if (base.index) g.setIndex(base.index);
        g.boundingBox = base.boundingBox?.clone() ?? null;
        g.boundingSphere = base.boundingSphere?.clone() ?? null;
        d.scope.add(g);
        geos.set(cls, g);
        return g;
      },
    };
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
    baseGeo?: THREE.BufferGeometry,
  ): Group => {
    const base = baseGeo ?? geometryFor(def, variant, lod);
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
    mesh.castShadow = d.castShadows && !gc && (!def.interior || (d.interiorShadows ?? false));
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    const tmp = { x: 0, y: 0, z: 0, rotY: 0, scale: 1 };
    let cx = 0;
    let cz = 0;
    for (let k = 0; k < n; k++) {
      place(k, tmp);
      _p.set(tmp.x, tmp.y, tmp.z);
      _q.setFromAxisAngle(_axis, tmp.rotY);
      const i = members[k];
      _s.setScalar(tmp.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(k, _m);
      seeds[k] =
        i >= 0 ? unitHash(d.seed, i, store.defId[i]) : unitHash(d.seed, k + 100000, defIndex);
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
        radii[k] = blobRadius(members[k] >= 0 ? defOf(members[k]) : def, tmp.scale);
      }
      blobs = makeBlobs(mesh, radii, aAppear, capacity);
      blobs.visible = false;
      // LOD1 contact blobs draw through the merged far-blob mesh (one call, see syncFarBlobs)
      if (lod === 0) root.add(blobs);
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

  const placeFrom =
    (members: Int32Array) =>
    (k: number, o: { x: number; y: number; z: number; rotY: number; scale: number }): void => {
      const i = members[k];
      o.x = store.x[i];
      o.y = groundY(i);
      o.z = store.z[i];
      o.rotY = store.rotY[i];
      o.scale = store.scale[i];
    };
  /** Def of store index `i`. */
  const defOf = (i: number): PropDef => PROP_DEFS[store.defId[i]];
  /** `${defIndex}:${lod1 variant}` → store indices of every island, for the merged LOD1 group. */
  const farMembers = new Map<
    string,
    { def: PropDef; defIndex: number; variant: number; arr: number[] }
  >();
  for (const [key, arr] of buckets) {
    const [defIdStr, variantStr] = key.split(':');
    const defIndex = Number(defIdStr);
    const variant = Number(variantStr);
    const def = effDef(defIndex, variant);
    const gc = key.includes(':c');
    const bucket = Number(key.slice(key.indexOf(gc ? ':c' : ':i') + 2));
    const members = Int32Array.from(arr);
    makeGroup(def, defIndex, variant, 0, bucket, gc, members, placeFrom(members));
    if (gc) {
      groundCover += members.length;
      continue;
    }
    instances += members.length;
    if (def.interior) continue; // tier 2: LOD1 never shows
    const v1 = lod1Variant(defIndex, variant);
    const fk = `${defIndex}:${v1}`;
    const far = farMembers.get(fk);
    if (far) far.arr.push(...arr);
    else farMembers.set(fk, { def, defIndex, variant: v1, arr: arr.slice() });
  }
  // LOD1 (tiers 0–1: overview and island views, most islands in frame) is one group per
  // (def, LOD1 variant) across all islands — per-island groups cost a draw call (+ blobs,
  // + depth) each for little culling (sweep D5). LOD0 (village / close views) stays per island.
  for (const { def, defIndex, variant, arr } of farMembers.values()) {
    const members = Int32Array.from(arr);
    makeGroup(def, defIndex, variant, 1, ALL_ISLANDS, false, members, placeFrom(members));
  }

  // ---- T0 cluster proxies from clusterable trees: one blob per 8 u cell with ≥ 1 tree,
  // grouped by colour class across islands
  const blobDef = PROP_DEFS[PROP_DEF_INDEX.treeBlob];
  const clusters = new ClusterIndex(store);
  /** Cell key → its blob instance and colour class (TASK-213: edits move / hide / append cells). */
  const cellSlot = new Map<number, { g: Group; k: number; rotY: number; cls: string }>();
  /** Colour class → the blob group its cells append to. */
  const blobGroups = new Map<string, Group>();
  const blobColors = blobDef ? createBlobColors(blobDef) : null;
  const cellRotY = (c: ClusterCell): number => unitHash(d.seed, c.key, 77) * Math.PI * 2;
  if (blobDef && blobColors) {
    const byClass = new Map<string, ClusterCell[]>();
    for (const c of clusters.cells.values()) {
      const cls = blobColors.classOf(c);
      let a = byClass.get(cls);
      if (!a) byClass.set(cls, (a = []));
      a.push(c);
    }
    for (const [cls, mine] of byClass) {
      const members = new Int32Array(mine.length).fill(-1);
      const shape = blobColors.shapeOf(cls);
      const g = makeGroup(
        blobDef,
        PROP_DEF_INDEX.treeBlob,
        shape,
        0,
        ALL_ISLANDS,
        false,
        members,
        (k, o) => {
          const c = mine[k];
          o.x = c.x;
          o.y = c.y;
          o.z = c.z;
          o.rotY = cellRotY(c);
          o.scale = clusterScale(c.n);
        },
        members.length,
        blobColors.geometryOf(cls),
      );
      mine.forEach((c, k) => cellSlot.set(c.key, { g, k, rotY: cellRotY(c), cls }));
      blobGroups.set(cls, g);
      instances += mine.length;
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
  let keyMap: Map<string, Group> | null = null;
  /** `variant`: the group's (LOD1: collapsed) geometry variant. */
  const groupKey = (
    defIndex: number,
    variant: number,
    gc: boolean,
    bucket: number,
    lod: Lod,
  ): string => `${defIndex}:${variant}:${gc ? 'c' : 'i'}${bucket}:L${lod}`;
  const maps = (): {
    slots: Map<number, { g: Group; k: number }[]>;
    keys: Map<string, Group>;
  } => {
    if (!slotMap || !keyMap) {
      slotMap = new Map();
      keyMap = new Map();
      for (const g of groups) {
        if (g.members.length && g.members[0] < 0) continue; // T0 cluster proxies
        keyMap.set(groupKey(g.defIndex, g.variant, g.groundCover, g.bucket, g.lod), g);
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
    const y = groundY(i);
    _p.set(store.x[i], y, store.z[i]);
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
        y,
        store.z[i],
        store.rotY[i],
        zero ? 0 : blobRadius(defOf(i), store.scale[i]),
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
      const oldArr = oldBlobs.instanceMatrix.array as Float32Array;
      const newArr = blobs.instanceMatrix.array as Float32Array;
      for (let k = 0; k < g.members.length; k++) {
        const i = g.members[k];
        if (i < 0) {
          // synthetic (cluster blob): keep its current matrix
          newArr.set(oldArr.subarray(k * 16, k * 16 + 16), k * 16);
          continue;
        }
        writeBlobMatrix(
          blobs,
          k,
          store.x[i],
          groundY(i),
          store.z[i],
          store.rotY[i],
          removedIdx.has(i) ? 0 : blobRadius(defOf(i), store.scale[i]),
        );
      }
      blobs.visible = oldBlobs.visible;
      root.remove(oldBlobs);
      if (g.lod === 0) root.add(blobs);
      oldBlobs.dispose();
      oldBlobs.geometry.dispose();
      g.blobs = blobs;
    }
    touched.add(g);
  };

  /** Append store index `i` (no instance yet) to its group(s), creating them when missing. */
  const append = (i: number, time: number, st: RewriteStats): void => {
    const { slots, keys } = maps();
    const defIndex = store.defId[i];
    const def = effDef(defIndex, store.variant[i]);
    const gc = (store.flags[i] & PropFlag.groundCover) !== 0;
    const sl: { g: Group; k: number }[] = [];
    for (const lod of (gc || def.interior ? [0] : [0, 1]) as Lod[]) {
      // ground cover per chunk; LOD0 per island; LOD1 merged across islands
      const bucket = gc ? store.chunkId[i] : lod === 1 ? ALL_ISLANDS : store.islandId[i];
      const variant = lod === 1 ? lod1Variant(defIndex, store.variant[i]) : store.variant[i];
      const key = groupKey(defIndex, variant, gc, bucket, lod);
      const g = keys.get(key);
      if (!g) {
        const members = Int32Array.of(i);
        const made = makeGroup(
          def,
          defIndex,
          variant,
          lod,
          bucket,
          gc,
          members,
          placeFrom(members),
          grownCapacity(1),
        );
        made.instantShow = instantEdits;
        sl.push({ g: made, k: 0 });
        // ground cover is gated by `update`; the rest follows the current tier now
        if (!gc && tier >= 0) {
          if (wantsVisible(made, tier)) show(made, time, instantEdits);
          else hide(made);
        }
        keys.set(key, made);
        st.created++;
        stats.groups = groups.length;
      } else {
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

  /** Cluster cells currently hidden because they lost their last tree. */
  const emptyCells = new Set<number>();
  /** Blob instance of cluster cell `c` (zero scale when the cell lost its last tree). */
  const writeCell = (g: Group, k: number, c: ClusterCell, rotY: number, time: number): void => {
    _p.set(c.x, c.y, c.z);
    _q.setFromAxisAngle(_axis, rotY);
    const scale = c.n ? clusterScale(c.n) : 0;
    _s.setScalar(scale);
    _m.compose(_p, _q, _s);
    g.mesh.setMatrixAt(k, _m);
    g.mesh.instanceMatrix.addUpdateRange(k * 16, 16);
    g.mesh.instanceMatrix.needsUpdate = true;
    if (g.blobs) writeBlobMatrix(g.blobs, k, c.x, c.y, c.z, rotY, blobRadius(g.def, scale));
    touched.add(g);
    if (!c.n) emptyCells.add(c.key);
    else if (emptyCells.delete(c.key)) setAppear(g, k, appearNow(g, time));
  };
  /** Hide blob slot `k` for good (its cell moved to another colour class). */
  const zeroSlot = (g: Group, k: number): void => {
    g.mesh.getMatrixAt(k, _m);
    _m.decompose(_p, _q, _s);
    _m.compose(_p, _q, _s.setScalar(0));
    g.mesh.setMatrixAt(k, _m);
    g.mesh.instanceMatrix.addUpdateRange(k * 16, 16);
    g.mesh.instanceMatrix.needsUpdate = true;
    touched.add(g);
  };
  /** Re-derive the T0 cluster blobs of the touched clusterable store indices (TASK-213). */
  const rewriteClusters = (indices: readonly number[], time: number): number => {
    if (!blobDef) return 0;
    const idx = indices.filter(
      (i) => i >= 0 && i < store.count && (store.flags[i] & PropFlag.clusterable) !== 0,
    );
    if (!idx.length) return 0;
    const cells = clusters.update(store, idx);
    for (const c of cells) {
      const sl = cellSlot.get(c.key);
      const cls = c.n && blobColors ? blobColors.classOf(c) : (sl?.cls ?? '');
      if (sl && sl.cls === cls) {
        writeCell(sl.g, sl.k, c, sl.rotY, time);
        continue;
      }
      if (!c.n || !blobColors) continue;
      // new cell, or its kind mix moved to another colour class: the old slot stays hidden
      if (sl) zeroSlot(sl.g, sl.k);
      const rotY = cellRotY(c);
      const g = blobGroups.get(cls);
      if (!g) {
        const made = makeGroup(
          blobDef,
          PROP_DEF_INDEX.treeBlob,
          blobColors.shapeOf(cls),
          0,
          ALL_ISLANDS,
          false,
          Int32Array.of(-1),
          (_k, o) => {
            o.x = c.x;
            o.y = c.y;
            o.z = c.z;
            o.rotY = rotY;
            o.scale = clusterScale(c.n);
          },
          grownCapacity(1),
          blobColors.geometryOf(cls),
        );
        made.instantShow = instantEdits;
        if (tier >= 0) {
          if (wantsVisible(made, tier)) show(made, time, instantEdits);
          else hide(made);
        }
        blobGroups.set(cls, made);
        cellSlot.set(c.key, { g: made, k: 0, rotY, cls });
        emptyCells.delete(c.key);
        stats.groups = groups.length;
      } else {
        const k = g.mesh.count;
        if (k >= g.capacity) grow(g, grownCapacity(k + 1));
        const m = new Int32Array(k + 1).fill(-1);
        m.set(g.members);
        g.members = m;
        g.mesh.count = k + 1;
        if (g.blobs) g.blobs.count = k + 1;
        writeCell(g, k, c, rotY, time);
        setAppear(g, k, appearNow(g, time));
        cellSlot.set(c.key, { g, k, rotY, cls });
      }
      if (!sl) stats.instances++;
    }
    return cells.length;
  };

  // ---- merged LOD1 contact blobs (TASK-373 draw-call budget): the LOD1 groups keep their own
  // blob InstancedMesh as CPU state (matrices + shared aAppear, written by every path above), but
  // only this one mesh draws them: the visible LOD1 groups' blobs concatenated, re-copied when a
  // group's visibility, count, matrices or appear values changed (attribute versions).
  let far: THREE.InstancedMesh | null = null;
  let farAppear: THREE.InstancedBufferAttribute | null = null;
  let farSig = -1;
  const disposeFar = (): void => {
    if (!far) return;
    root.remove(far);
    far.dispose();
    far.geometry.dispose();
    far = null;
  };
  d.scope.defer(disposeFar);
  const syncFarBlobs = (): void => {
    let sig = 0;
    let total = 0;
    let src: THREE.InstancedMesh | null = null;
    for (const g of groups) {
      const b = g.blobs;
      if (g.lod !== 1 || !b || !g.visible) continue;
      src = b;
      for (const v of [b.id, b.count, b.instanceMatrix.version, g.appear.version])
        sig = (Math.imul(sig, 31) + v) | 0;
      total += b.count;
    }
    sig = (Math.imul(sig, 31) + total) | 0;
    if (sig === farSig) return;
    farSig = sig;
    if (!src || !total) {
      if (far) far.visible = false;
      return;
    }
    if (!far || far.instanceMatrix.count < total) {
      disposeFar();
      const cap = grownCapacity(total);
      const geo = new THREE.InstancedBufferGeometry();
      const base = src.geometry;
      geo.setAttribute('position', base.getAttribute('position'));
      geo.setAttribute('uv', base.getAttribute('uv'));
      geo.setIndex(base.index);
      farAppear = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
      farAppear.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aAppear', farAppear);
      far = new THREE.InstancedMesh(geo, src.material, cap);
      far.renderOrder = src.renderOrder;
      far.frustumCulled = true;
      far.name = 'props:L1:blobs';
      root.add(far);
    }
    const mat = far.instanceMatrix.array as Float32Array;
    const app = farAppear!.array as Float32Array;
    let off = 0;
    for (const g of groups) {
      const b = g.blobs;
      if (g.lod !== 1 || !b || !g.visible) continue;
      mat.set((b.instanceMatrix.array as Float32Array).subarray(0, b.count * 16), off * 16);
      app.set((g.appear.array as Float32Array).subarray(0, b.count), off);
      off += b.count;
    }
    far.count = total;
    far.visible = true;
    far.instanceMatrix.needsUpdate = true;
    farAppear!.needsUpdate = true;
    far.computeBoundingSphere();
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
      syncFarBlobs();
    },
    slotsOf(i) {
      return maps().slots.get(i);
    },
    clusters,
    rewrite(indices, time) {
      const st: RewriteStats = {
        updated: 0,
        appended: 0,
        removed: 0,
        restored: 0,
        grown: 0,
        created: 0,
        clusters: 0,
      };
      const { slots } = maps();
      for (const i of indices) {
        if (i < 0 || i >= store.count) continue;
        const def = PROP_DEFS[store.defId[i]];
        if (!def) continue;
        const removed = (store.flags[i] & PropFlag.removed) !== 0;
        const sl = slots.get(i);
        if (!sl) {
          if (!removed) append(i, time, st);
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
      st.clusters = rewriteClusters(indices, time);
      flushTouched();
      syncFarBlobs();
      return st;
    },
  };
  return batcher;
}

/** Canopy stats of a built prop geometry (clusters.ts `canopyStats`). */
export function geoStats(g: THREE.BufferGeometry): CanopyStats {
  const ao = g.getAttribute('ao');
  return canopyStats(
    g.getAttribute('position').array,
    g.getAttribute('color').array,
    ao ? ao.array : null,
    g.index ? g.index.array : null,
  );
}

/** Same vertex data (position + colour, same index) — a def's LOD1 variants that never differ. */
function sameGeometry(a: THREE.BufferGeometry, b: THREE.BufferGeometry): boolean {
  if (a === b) return true;
  if ((a.index?.count ?? -1) !== (b.index?.count ?? -1)) return false;
  for (const name of ['position', 'color']) {
    const x = a.getAttribute(name)?.array;
    const y = b.getAttribute(name)?.array;
    if (!x || !y || x.length !== y.length) return false;
    for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return false;
  }
  return true;
}

/** Contact-blob radius under a prop (ART_BIBLE §1: 0.6 × footprint, ×1.6 for the soft edge). */
function blobRadius(def: PropDef, scale: number): number {
  return def.footprint * scale * 0.6 * 1.6;
}
