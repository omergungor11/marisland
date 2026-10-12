import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { PropDef } from '../../content/props.ts';
import type { PropStore } from '../../world/prop-store.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { OCCUPANCY } from '../../content/activity.ts';

/**
 * Far structure merge (TASK-407, D-049): at tiers 0–1 the LOD1 instances of an island are drawn
 * as ONE pre-transformed mesh per (island, material class, tier class) instead of one
 * InstancedMesh per (def, variant) across islands — the draw-call precedent of the far terrain
 * merge and the merged contact blobs (TASK-406). Same lit / depth program (`uMarMerged` is a
 * per-material uniform switch): every vertex carries its instance origin (`aSpin.xyz`), seed
 * (`aSeed`) and scale (`aAppear`), so dither fades, wind sway, lamp / screen hashes and the hover
 * tint stay per instance (materials/factory.ts). The night facade occupancy needs object-space
 * normals and positions; its facade test and quadrant are baked into `aSpin.w` (< 0.5, below
 * every tag value; see `facadeCode`).
 *
 * The merged meshes only replace groups whose every instance is settled (no bloom-in, removal
 * fade or click reaction in flight; the batcher decides `active`), so the swap is pixel-neutral
 * and needs no fade of its own. Groups whose LOD1 geometry uses the `aSpin` tag channel (windmill
 * blades, turbines, trackers, animated screens) stay instanced. An island is rebuilt only when it
 * is marked dirty (first use, edits, flood hide): its meshes are disposed and rebuilt from the
 * current LOD1 instance matrices; removed instances are left out.
 */

/** Facade code in merged `aSpin.w`: (quadrant + BIAS) / SCALE on facades, 0 elsewhere. */
export const MERGED_FACADE_SCALE = 16;
export const MERGED_FACADE_BIAS = 3;

const HALF_PI_F = Math.fround(1.5707963);
/**
 * Merged `aSpin.w` of a vertex: the ACTIVITY_OCCUPANCY facade test (`|n.y| < 0.5`,
 * `p.xz · n.xz > OCCUPANCY.minDepth`) and quadrant `floor(atan(n.z, n.x) / (π/2) + 0.5)` on its
 * object-space normal `n` and position `p`, in float32 like the shader.
 */
export function facadeCode(
  px: number,
  pz: number,
  nx: number,
  ny: number,
  nz: number,
  minDepth: number = OCCUPANCY.minDepth,
): number {
  const f = Math.fround;
  if (!(Math.abs(ny) < 0.5) || !(f(f(px * nx) + f(pz * nz)) > f(minDepth))) return 0;
  const q = Math.floor(f(f(f(Math.atan2(nz, nx)) / HALF_PI_F) + 0.5));
  return (q + MERGED_FACADE_BIAS) / MERGED_FACADE_SCALE;
}

/** A LOD1 group as far as the merge needs it (batcher `Group`). */
export interface FarMergeGroup {
  mesh: THREE.InstancedMesh;
  def: PropDef;
  members: Int32Array;
}

export interface FarMergeDeps {
  scope: Scope;
  /** Parent of the merged meshes (the batcher root). */
  root: THREE.Object3D;
  store: PropStore;
  castShadows: boolean;
  /** Merged-mesh twin materials of a def (prop-materials `mergedFor`). */
  materialsFor: (def: PropDef) => {
    key: string;
    material: THREE.Material;
    depth: THREE.Material | null;
  };
  /** Bit t set: the group is visible at tier t (t = 0, 1). */
  tierMask: (g: FarMergeGroup) => number;
}

export interface MergedMesh {
  mesh: THREE.InstancedMesh;
  island: number;
  /** Tier mask of its groups (bit 0 = T0, bit 1 = T1). */
  tiers: number;
  fadeFar: number;
}

export interface FarMerge {
  /** Rebuild island `island`'s meshes before the next activation. */
  markDirty(island: number): void;
  /**
   * An edit touched store index `i` (now on `island`): marks `island` and the island `i` was
   * merged into last (moves, slot reuse) dirty.
   */
  markIndex(i: number, island: number): void;
  readonly dirty: ReadonlySet<number>;
  /** Rebuild the dirty islands from `groups` (call only when every instance is settled). */
  rebuild(groups: readonly FarMergeGroup[]): void;
  /** True when `g` is drawn by the merged meshes while they are active. */
  covers(g: FarMergeGroup): boolean;
  /**
   * Per frame. `active`: the merged meshes draw (tier mask, and skipped wholly past their fade
   * edge like the groups, TASK-405) and every covered group mesh is hidden; otherwise they hide.
   */
  sync(groups: readonly FarMergeGroup[], tier: number, active: boolean, cam?: THREE.Vector3): void;
  readonly meshes: readonly MergedMesh[];
  readonly stats: { rebuilds: number; vertices: number; bytes: number };
}

/** Per-vertex inputs copied when a class's geometry has them (`ao` is baked into the colour). */
const OPTIONAL: readonly { name: string; def: number }[] = [
  { name: 'wind', def: 0 },
  { name: 'emissive', def: 0 },
];
const WIND = 0;

export function createFarMerge(d: FarMergeDeps): FarMerge {
  const { store } = d;
  const meshes: MergedMesh[] = [];
  const dirty = new Set<number>();
  /** Store index → the island whose meshes hold it (last rebuild). */
  const mergedAt = new Map<number, number>();
  const stats = { rebuilds: 0, vertices: 0, bytes: 0 };
  /** Base geometry attribute → it carries an `aSpin` tag (or is not mergeable). */
  const taggedCache = new WeakMap<object, boolean>();
  const covers = (g: FarMergeGroup): boolean => {
    const geo = g.mesh.geometry;
    const pos = geo.getAttribute('position');
    let t = taggedCache.get(pos);
    if (t === undefined) {
      t = false;
      const spin = geo.getAttribute('aSpin');
      if (spin) for (let k = 3; k < spin.array.length && !t; k += 4) t = spin.array[k] !== 0;
      if (!geo.getAttribute('normal') || !geo.getAttribute('color')) t = true;
      taggedCache.set(pos, t);
    }
    return !t && d.tierMask(g) !== 0;
  };

  const drop = (m: MergedMesh): void => {
    d.root.remove(m.mesh);
    m.mesh.dispose();
    m.mesh.geometry.dispose();
    const a = m.mesh.geometry.getAttribute('position');
    stats.vertices -= a.count;
    stats.bytes -= bytesOf(m.mesh.geometry);
  };
  d.scope.defer(() => {
    for (const m of meshes) drop(m);
    meshes.length = 0;
  });

  const _m = new THREE.Matrix4();
  const _v = new THREE.Vector3();
  const _n = new THREE.Matrix3();

  const rebuild = (groups: readonly FarMergeGroup[]): void => {
    if (!dirty.size) return;
    // the dirty islands' meshes go
    for (let k = meshes.length - 1; k >= 0; k--)
      if (dirty.has(meshes[k].island)) {
        drop(meshes[k]);
        meshes.splice(k, 1);
      }
    // class key → its slots (group, instance)
    interface Cls {
      island: number;
      tiers: number;
      mats: ReturnType<FarMergeDeps['materialsFor']>;
      fadeFar: number;
      slots: { g: FarMergeGroup; k: number; i: number }[];
      verts: number;
      opt: boolean[];
    }
    const classes = new Map<string, Cls>();
    for (const g of groups) {
      if (!covers(g)) continue;
      const mats = d.materialsFor(g.def);
      const tiers = d.tierMask(g);
      const fade = (mats.material as { fade?: { uFadeFar: { value: number } } }).fade;
      const geo = g.mesh.geometry;
      const nv = geo.index ? geo.index.count : geo.getAttribute('position').count;
      const arr = g.mesh.instanceMatrix.array as Float32Array;
      for (let k = 0; k < g.mesh.count; k++) {
        const i = g.members[k];
        if (i < 0 || !dirty.has(store.islandId[i])) continue;
        if (store.flags[i] & PropFlag.removed) continue;
        // zero-scaled (finished removal) instances draw nothing
        if (arr[k * 16] === 0 && arr[k * 16 + 1] === 0 && arr[k * 16 + 2] === 0) continue;
        const island = store.islandId[i];
        const key = `${island}|${mats.key}|${tiers}`;
        let c = classes.get(key);
        if (!c) {
          c = {
            island,
            tiers,
            mats,
            fadeFar: fade?.uFadeFar.value ?? Infinity,
            slots: [],
            verts: 0,
            opt: OPTIONAL.map(() => false),
          };
          classes.set(key, c);
        }
        c.slots.push({ g, k, i });
        mergedAt.set(i, island);
        c.verts += nv;
        OPTIONAL.forEach((o, oi) => {
          if (geo.getAttribute(o.name)) c.opt[oi] = true;
        });
      }
    }
    for (const c of classes.values()) {
      const n = c.verts;
      const pos = new Float32Array(n * 3);
      // normals only steer the shadow normal bias: 16-bit is exact enough (< 0.002°)
      const nor = new Int16Array(n * 3);
      const col = new Float32Array(n * 3);
      const spin = new Float32Array(n * 4);
      // seed / scale only feed the wind sway (phase, pivot height): classes without wind skip them
      const windy = c.opt[WIND];
      const seed = windy ? new Float32Array(n) : null;
      const scale = windy ? new Float32Array(n) : null;
      const opt = OPTIONAL.map((o, oi) => (c.opt[oi] ? new Float32Array(n).fill(o.def) : null));
      let o = 0;
      for (const { g, k, i } of c.slots) {
        const geo = g.mesh.geometry;
        const idx = geo.index;
        const P = geo.getAttribute('position');
        const N = geo.getAttribute('normal');
        const C = geo.getAttribute('color');
        const AO = geo.getAttribute('ao');
        const srcOpt = OPTIONAL.map((x) => geo.getAttribute(x.name) ?? null);
        _m.fromArray(g.mesh.instanceMatrix.array as Float32Array, k * 16);
        _n.getNormalMatrix(_m);
        const e = _m.elements;
        const s = store.scale[i];
        const aSeed = (geo.getAttribute('aSeed')?.array as Float32Array | undefined)?.[k] ?? 0;
        const cnt = idx ? idx.count : P.count;
        for (let v = 0; v < cnt; v++, o++) {
          const s0 = idx ? idx.getX(v) : v;
          _v.fromBufferAttribute(P, s0).applyMatrix4(_m);
          pos[o * 3] = _v.x;
          pos[o * 3 + 1] = _v.y;
          pos[o * 3 + 2] = _v.z;
          _v.fromBufferAttribute(N, s0);
          spin[o * 4 + 3] = facadeCode(P.getX(s0), P.getZ(s0), _v.x, _v.y, _v.z);
          _v.applyMatrix3(_n).normalize();
          nor[o * 3] = Math.round(_v.x * 32767);
          nor[o * 3 + 1] = Math.round(_v.y * 32767);
          nor[o * 3 + 2] = Math.round(_v.z * 32767);
          // vColor.rgb *= ao, once in float32 here (the merged mesh reads the default ao = 1)
          const ao = AO ? AO.getX(s0) : 1;
          col[o * 3] = C.getX(s0) * ao;
          col[o * 3 + 1] = C.getY(s0) * ao;
          col[o * 3 + 2] = C.getZ(s0) * ao;
          spin[o * 4] = e[12];
          spin[o * 4 + 1] = e[13];
          spin[o * 4 + 2] = e[14];
          if (seed && scale) {
            seed[o] = aSeed;
            scale[o] = s;
          }
          for (let oi = 0; oi < OPTIONAL.length; oi++) {
            const dst = opt[oi];
            const src = srcOpt[oi];
            if (dst && src) dst[o] = src.getX(s0);
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aSpin', new THREE.BufferAttribute(spin, 4));
      if (seed && scale) {
        geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
        geo.setAttribute('aAppear', new THREE.BufferAttribute(scale, 1));
      }
      OPTIONAL.forEach((x, oi) => {
        const a = opt[oi];
        if (a) geo.setAttribute(x.name, new THREE.BufferAttribute(a, 1));
      });
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      // an InstancedMesh of one identity instance: the instanced program, no new one
      const mesh = new THREE.InstancedMesh(geo, c.mats.material, 1);
      mesh.setMatrixAt(0, _m.identity());
      mesh.computeBoundingSphere();
      mesh.castShadow = d.castShadows;
      mesh.receiveShadow = true;
      if (c.mats.depth) mesh.customDepthMaterial = c.mats.depth;
      mesh.frustumCulled = true;
      mesh.visible = false;
      mesh.name = `props:far:${c.island}:${c.mats.key}:t${c.tiers}`;
      d.root.add(mesh);
      meshes.push({ mesh, island: c.island, tiers: c.tiers, fadeFar: c.fadeFar });
      stats.vertices += n;
      stats.bytes += bytesOf(geo);
    }
    dirty.clear();
    stats.rebuilds++;
  };

  return {
    markDirty(island) {
      dirty.add(island);
    },
    markIndex(i, island) {
      dirty.add(island);
      const was = mergedAt.get(i);
      if (was !== undefined) dirty.add(was);
    },
    dirty,
    rebuild,
    covers,
    sync(groups, tier, active, cam) {
      const on = active && tier <= 1 && !dirty.size;
      for (const m of meshes) {
        let vis = on && (m.tiers & (1 << tier)) !== 0;
        const sph = m.mesh.boundingSphere;
        if (vis && cam && sph) vis = cam.distanceTo(sph.center) - sph.radius < m.fadeFar;
        m.mesh.visible = vis;
      }
      if (on) for (const g of groups) if (covers(g)) g.mesh.visible = false;
    },
    meshes,
    stats,
  };
}

function bytesOf(g: THREE.BufferGeometry): number {
  let b = 0;
  for (const a of Object.values(g.attributes)) b += (a.array as Float32Array).byteLength;
  return b;
}
