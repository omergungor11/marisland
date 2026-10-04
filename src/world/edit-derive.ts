/**
 * Incremental derived data for Phase 2 edits (TASK-202). Pure data, no three.
 *
 * - **Shore SDF**: two persistent nearest-site maps (nearest land sample for every cell,
 *   nearest water sample for every cell), seeded once per world from the exact EDT feature
 *   transform (`edtNearest`, bit-identical to generation) and kept current with a dynamic
 *   brushfire (raise wave clears cells whose site vanished, lower wave propagates sites through
 *   8-neighbours). Work is proportional to the cells whose distance actually changes, so a hill
 *   raised inland costs nothing and new land in open water updates the whole region it now
 *   owns — the far field included, which a fixed window cannot do with an uncapped SDF.
 *   Unchanged cells keep their bits; changed ones match a full recompute within a fraction of a
 *   cell (8-neighbour brushfire, test: within 1 cell).
 * - **Zones**: the touched samples (+1 for slope) and every sdf-changed sample are re-derived
 *   with the generation rules (`deriveZoneCell`); painted samples and untouched
 *   path/plaza/field keep their zone. `fieldColor` follows (`genAux.fieldHue`).
 * - **islandMap / chunkFlags** for flipped samples / touched chunks.
 * - **Journal**: every grid write records the previous value so the command's inverse is an
 *   exact `patch`.
 * - Not re-derived: `pathGraph` / `paths` / settlements / boat routes / island metadata
 *   (peakY, bounds). Paths may float or sink after a terrain edit (accepted, TASK-202).
 * - Memory: ≈ 5 MB per edited world (2 × obst/d² Int32 maps + stamps + queue), built on the
 *   first edit (two full EDTs, ≈ 20–40 ms once — `replay` at boot pays it once).
 */
import { createRng } from '../core/rng.ts';
import { EDIT_DERIVE } from '../content/edit.ts';
import {
  CELL_SIZE,
  CHUNK_CELLS,
  CHUNKS_PER_SIDE,
  WORLD_SIZE,
  Zone,
  type WorldData,
} from './types.ts';
import { edtNearest } from './gen/coast.ts';
import { chunkFlagsAt } from './gen/chunks.ts';
import { cellX, cellZ } from './gen/grid.ts';
import { nearestIsland } from './gen/heightfield.ts';
import { deriveZoneCell, zoneNoise, type ZoneCellContext } from './gen/zones.ts';
import type { PropStore } from './prop-store.ts';

const INF = 0x7fffffff;
/** Same cap as generation (`coast.ts` SDF_CAP). */
const SDF_CAP = WORLD_SIZE * 1.5;
const HALF = CELL_SIZE / 2;

/** Generation-identical signed distance from a squared cell distance. */
export function sdfFromD2(d2: number, land: boolean): number {
  const mag =
    d2 >= INF
      ? SDF_CAP
      : Math.fround(Math.min(SDF_CAP, Math.fround(Math.sqrt(d2)) * CELL_SIZE - HALF));
  return land ? mag : -mag;
}

/** Nearest-site map: `obst[i]` = nearest site cell (−1 none), `d2[i]` = squared cell distance. */
interface SiteMap {
  obst: Int32Array;
  d2: Int32Array;
  /** 1 = land map (sites are samples with height > 0), 0 = water map. */
  land: boolean;
}

/** Per-world edit state, built lazily on the first edit (≈ 2 full EDTs, once). */
export interface EditState {
  n: number;
  L: SiteMap;
  W: SiteMap;
  zctx: ZoneCellContext;
  /** Epoch stamps for de-duplication without clearing. */
  stampA: Uint32Array;
  stampB: Uint32Array;
  /** Samples whose height changed in the current command (epoch of `hEpoch`). */
  hStamp: Uint32Array;
  epoch: number;
  queue: Int32Array;
  inQ: Uint8Array;
}

const states = new WeakMap<WorldData, EditState>();

export function editState(world: WorldData): EditState {
  let st = states.get(world);
  if (st) return st;
  const h = world.height;
  const n = h.n;
  const N = n * n;
  const land = new Uint8Array(N);
  for (let i = 0; i < N; i++) land[i] = h.data[i] > 0 ? 1 : 0;
  const mk = (target: number, isLand: boolean): SiteMap => {
    const { nearest } = edtNearest(land, n, n, target);
    const d2 = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      const o = nearest[i];
      if (o < 0) {
        d2[i] = INF;
        continue;
      }
      const dx = (o % n) - (i % n);
      const dz = Math.floor(o / n) - Math.floor(i / n);
      d2[i] = dx * dx + dz * dz;
    }
    return { obst: nearest, d2, land: isLand };
  };
  st = {
    n,
    L: mk(1, true),
    W: mk(0, false),
    zctx: {
      h,
      sdf: world.shoreSdf,
      islandMap: world.islandMap,
      tags: world.genAux.tags,
      islands: world.islands,
      windDir: world.windDir,
      noise: zoneNoise(createRng(world.seed).fork('zones')),
    },
    stampA: new Uint32Array(N),
    stampB: new Uint32Array(N),
    hStamp: new Uint32Array(N),
    epoch: 0,
    queue: new Int32Array(N),
    inQ: new Uint8Array(N),
  };
  states.set(world, st);
  return st;
}

/** Drop the cached state (tests; or after replacing world arrays wholesale). */
export function resetEditState(world: WorldData): void {
  states.delete(world);
}

export function nextEpoch(st: EditState): number {
  st.epoch++;
  if (st.epoch >= 0xffffffff) {
    st.stampA.fill(0);
    st.stampB.fill(0);
    st.hStamp.fill(0);
    st.epoch = 1;
  }
  return st.epoch;
}

// ---------------------------------------------------------------- journal

/** Prop slot snapshot fields (one entry per journaled slot). */
export interface PropSlots {
  slot: number[];
  defId: number[];
  variant: number[];
  x: number[];
  y: number[];
  z: number[];
  rotY: number[];
  scale: number[];
  islandId: number[];
  chunkId: number[];
  flags: number[];
}

/** Previous values of everything a command wrote (restored in reverse order). */
export class Journal {
  height: number[] = [];
  zone: number[] = [];
  painted: number[] = [];
  fieldColor: number[] = [];
  islandMap: number[] = [];
  sdf: number[] = [];
  /** Store count before the command (−1 = props untouched). */
  propCount = -1;
  props: PropSlots = emptySlots();
  private propSeen = new Set<number>();

  /** Record slot `i` before its first write in this command. */
  prop(s: PropStore, i: number): void {
    if (this.propCount < 0) this.propCount = s.count;
    if (this.propSeen.has(i)) return;
    this.propSeen.add(i);
    pushSlot(this.props, s, i);
  }

  /** Mark the store count as journaled (append / pop). */
  count(s: PropStore): void {
    if (this.propCount < 0) this.propCount = s.count;
  }
}

export function emptySlots(): PropSlots {
  return {
    slot: [],
    defId: [],
    variant: [],
    x: [],
    y: [],
    z: [],
    rotY: [],
    scale: [],
    islandId: [],
    chunkId: [],
    flags: [],
  };
}

export function pushSlot(p: PropSlots, s: PropStore, i: number): void {
  p.slot.push(i);
  p.defId.push(s.defId[i]);
  p.variant.push(s.variant[i]);
  p.x.push(s.x[i]);
  p.y.push(s.y[i]);
  p.z.push(s.z[i]);
  p.rotY.push(s.rotY[i]);
  p.scale.push(s.scale[i]);
  p.islandId.push(s.islandId[i]);
  p.chunkId.push(s.chunkId[i]);
  p.flags.push(s.flags[i]);
}

/** Zero slot i (slots ≥ count are kept zeroed so append/pop round-trips are byte-exact). */
export function zeroSlot(s: PropStore, i: number): void {
  s.defId[i] = 0;
  s.variant[i] = 0;
  s.x[i] = 0;
  s.y[i] = 0;
  s.z[i] = 0;
  s.rotY[i] = 0;
  s.scale[i] = 0;
  s.islandId[i] = 0;
  s.chunkId[i] = 0;
  s.flags[i] = 0;
}

// ---------------------------------------------------------------- brushfire

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];

/**
 * Update one site map after `added` cells became sites and `removed` cells stopped being sites
 * (heights already written). `touch(i)` is called for every cell whose distance changed.
 */
function updateMap(
  st: EditState,
  m: SiteMap,
  hd: Float32Array,
  added: number[],
  removed: number[],
  touch: (i: number) => void,
): void {
  const { n, queue, inQ } = st;
  const N = n * n;
  const { obst, d2 } = m;
  const isSite = m.land ? (i: number): boolean => hd[i] > 0 : (i: number): boolean => hd[i] <= 0;
  let head = 0;
  let tail = 0;
  const push = (i: number): void => {
    if (inQ[i]) return;
    inQ[i] = 1;
    queue[tail] = i;
    tail = tail + 1 === N ? 0 : tail + 1;
  };
  // raise wave: clear every cell whose nearest site vanished; collect the valid rim
  if (removed.length > 0) {
    const stack: number[] = [];
    for (const s of removed) {
      if (obst[s] < 0) continue;
      obst[s] = -1;
      d2[s] = INF;
      touch(s);
      stack.push(s);
    }
    while (stack.length > 0) {
      const c = stack.pop() as number;
      const cx = c % n;
      const cz = (c - cx) / n;
      for (let k = 0; k < 8; k++) {
        const x = cx + DX[k];
        const z = cz + DZ[k];
        if (x < 0 || z < 0 || x >= n || z >= n) continue;
        const nb = z * n + x;
        const o = obst[nb];
        if (o < 0) continue;
        if (!isSite(o)) {
          obst[nb] = -1;
          d2[nb] = INF;
          touch(nb);
          stack.push(nb);
        } else push(nb);
      }
    }
  }
  // lower wave: new sites + rim cells propagate their site (label-correcting FIFO)
  for (const s of added) {
    if (obst[s] !== s || d2[s] !== 0) {
      obst[s] = s;
      d2[s] = 0;
      touch(s);
    }
    push(s);
  }
  while (head !== tail) {
    const c = queue[head];
    head = head + 1 === N ? 0 : head + 1;
    inQ[c] = 0;
    const o = obst[c];
    if (o < 0) continue;
    const ox = o % n;
    const oz = (o - ox) / n;
    const cx = c % n;
    const cz = (c - cx) / n;
    for (let k = 0; k < 8; k++) {
      const x = cx + DX[k];
      const z = cz + DZ[k];
      if (x < 0 || z < 0 || x >= n || z >= n) continue;
      const nb = z * n + x;
      const dx = x - ox;
      const dz = z - oz;
      const d = dx * dx + dz * dz;
      if (d < d2[nb]) {
        d2[nb] = d;
        obst[nb] = o;
        touch(nb);
        push(nb);
      }
    }
  }
}

/**
 * Feed land/water flips into both site maps. Returns the cells whose shore distance may have
 * changed (de-duplicated; order deterministic).
 */
export function updateSites(
  st: EditState,
  hd: Float32Array,
  toLand: number[],
  toWater: number[],
): number[] {
  const out: number[] = [];
  if (toLand.length === 0 && toWater.length === 0) return out;
  const ep = nextEpoch(st);
  const stamp = st.stampA;
  const touch = (i: number): void => {
    if (stamp[i] === ep) return;
    stamp[i] = ep;
    out.push(i);
  };
  updateMap(st, st.L, hd, toLand, toWater, touch);
  updateMap(st, st.W, hd, toWater, toLand, touch);
  return out;
}

/** Island id + 1 of the nearest land sample (water cells' zone owner). */
export function ownerOf(st: EditState, world: WorldData, i: number): number {
  const o = st.L.obst[i];
  return o >= 0 ? world.islandMap[o] : 0;
}

/** islandMap value for a sample that just became land: the island of the nearest old land. */
export function islandForNewLand(st: EditState, world: WorldData, i: number): number {
  const o = st.L.obst[i];
  if (o >= 0 && world.islandMap[o] > 0) return world.islandMap[o];
  const n = st.n;
  const isl = nearestIsland(world.islands, cellX(i % n), cellZ(Math.floor(i / n)));
  return isl ? isl.id + 1 : 1;
}

/** Write the sdf of candidate cells from the maps; journal + return the changed ones. */
export function writeSdf(
  st: EditState,
  world: WorldData,
  cand: number[],
  j: Journal | null,
): number[] {
  const out: number[] = [];
  const hd = world.height.data;
  const sdf = world.shoreSdf;
  for (const i of cand) {
    const land = hd[i] > 0;
    const v = sdfFromD2(land ? st.W.d2[i] : st.L.d2[i], land);
    if (v === sdf[i]) continue;
    if (j) j.sdf.push(i, sdf[i]);
    sdf[i] = v;
    out.push(i);
  }
  return out;
}

/**
 * Re-derive zones (and field hues) over `cells` (may contain duplicates). Samples in
 * `heightChanged` (hStamp == epoch) are fully re-derived and lose their paint; other samples
 * keep painted zones and path / plaza / field. Returns cells whose zone or fieldColor changed.
 */
export function rederiveZones(
  st: EditState,
  world: WorldData,
  cells: number[],
  hEpoch: number,
  j: Journal,
): number[] {
  const out: number[] = [];
  const ep = nextEpoch(st);
  const stamp = st.stampB;
  const n = st.n;
  const { zone, zonePainted, fieldColor } = world;
  const hd = world.height.data;
  const hue = world.genAux.fieldHue;
  for (const i of cells) {
    if (stamp[i] === ep) continue;
    stamp[i] = ep;
    const touched = st.hStamp[i] === hEpoch;
    if (touched && zonePainted[i]) {
      j.painted.push(i, 1);
      zonePainted[i] = 0;
    }
    if (zonePainted[i]) continue;
    const z0 = zone[i];
    if (!touched && hd[i] > 0 && (z0 === Zone.path || z0 === Zone.plaza || z0 === Zone.field))
      continue;
    const ix = i % n;
    const iz = (i - ix) / n;
    const z1 = deriveZoneCell(st.zctx, ix, iz, ownerOf(st, world, i));
    let changed = false;
    if (z1 !== z0) {
      j.zone.push(i, z0);
      zone[i] = z1;
      changed = true;
    }
    const fc = z1 === Zone.field ? fieldColor[i] || hue[i] : 0;
    if (fc !== fieldColor[i]) {
      j.fieldColor.push(i, fieldColor[i]);
      fieldColor[i] = fc;
      changed = true;
    }
    if (changed) out.push(i);
  }
  return out;
}

/** Recompute chunk flags for every chunk containing one of `cells`; returns changed chunk ids. */
export function refreshChunkFlags(world: WorldData, cells: number[]): number[] {
  const n = world.height.n;
  const seen = new Uint8Array(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE);
  const out: number[] = [];
  for (const i of cells) {
    const ix = i % n;
    const iz = (i - ix) / n;
    forChunks(ix, iz, ix, iz, (c) => {
      if (seen[c]) return;
      seen[c] = 1;
      const cx = c % CHUNKS_PER_SIDE;
      const cz = (c - cx) / CHUNKS_PER_SIDE;
      const f = chunkFlagsAt(world.height, cx, cz);
      if (f !== world.chunkFlags[c]) {
        world.chunkFlags[c] = f;
        out.push(c);
      }
    });
  }
  return out;
}

/**
 * Visit every chunk whose sample range [c·32, c·32+32] intersects the inclusive sample box
 * [x0, x1] × [z0, z1] (chunks share their edge samples).
 */
export function forChunks(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  fn: (chunk: number) => void,
): void {
  const C = CHUNK_CELLS;
  const last = CHUNKS_PER_SIDE - 1;
  const cx0 = Math.max(0, Math.ceil((x0 - C) / C));
  const cx1 = Math.min(last, Math.floor(x1 / C));
  const cz0 = Math.max(0, Math.ceil((z0 - C) / C));
  const cz1 = Math.min(last, Math.floor(z1 / C));
  for (let cz = cz0; cz <= cz1; cz++)
    for (let cx = cx0; cx <= cx1; cx++) fn(cz * CHUNKS_PER_SIDE + cx);
}

/** Margins of the dirty chunk rule (content). */
export const DIRTY = {
  height: EDIT_DERIVE.renderMarginCells,
  sdf: EDIT_DERIVE.sdfMargin,
  sdfBand: EDIT_DERIVE.sdfMeshBand,
} as const;
