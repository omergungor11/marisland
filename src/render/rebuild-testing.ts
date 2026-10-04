/**
 * TEST-ONLY terrain editor for the TASK-211 rebuild path (unit tests, `?selftest=edit`,
 * `__marisland.testBrush`). It is NOT the Phase 2 edit model (`world/edit.ts`, TASK-201): just
 * enough to exercise the full rebuild end-to-end — a smooth radial height brush, a local shore
 * SDF update, chunk flags, re-grounded scatter props — with byte-exact inverse patches.
 */
import type { WorldData } from '../world/types.ts';
import { CHUNK_CELLS, CHUNKS_PER_SIDE, SEABED_Y, heightAt } from '../world/types.ts';
import type { DirtyRegion } from '../world/edit-types.ts';
import { edt } from '../world/gen/coast.ts';
import { buildChunkFlags } from '../world/gen/chunks.ts';
import { hashFloats } from '../world/gen/hash.ts';
import { createRng } from '../core/rng.ts';

/** Saved state of a cell window (+ chunk flags and touched prop heights). */
export interface TestPatch {
  i0: number;
  j0: number;
  w: number;
  h: number;
  height: Float32Array;
  sdf: Float32Array;
  chunkFlags: Uint8Array;
  props: Int32Array;
  propY: Float32Array;
}

export interface TestEdit {
  dirty: DirtyRegion;
  /** Applying it with `applyTestPatch` restores the previous world bytes. */
  inverse: TestPatch;
}

/** SDF cells re-derived around the brush, and the nearest-coast search margin beyond them. */
const SDF_PAD = 12;
const SEARCH = 40;
const MAX_Y = 60;
const SDF_CAP = 1152;

const clampI = (v: number, n: number): number => Math.max(0, Math.min(n - 1, v));

function chunksOf(i0: number, i1: number, j0: number, j1: number): number[] {
  const out: number[] = [];
  const N = CHUNKS_PER_SIDE;
  const lo = (a: number): number => Math.max(0, Math.ceil((a - CHUNK_CELLS) / CHUNK_CELLS));
  const hi = (b: number): number => Math.min(N - 1, Math.floor(b / CHUNK_CELLS));
  for (let cz = lo(j0); cz <= hi(j1); cz++)
    for (let cx = lo(i0); cx <= hi(i1); cx++) out.push(cz * N + cx);
  return out;
}

function snapshot(
  world: WorldData,
  i0: number,
  j0: number,
  w: number,
  h: number,
  props: number[],
): TestPatch {
  const n = world.height.n;
  const height = new Float32Array(w * h);
  const sdf = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = (j0 + y) * n + i0;
    height.set(world.height.data.subarray(o, o + w), y * w);
    sdf.set(world.shoreSdf.subarray(o, o + w), y * w);
  }
  return {
    i0,
    j0,
    w,
    h,
    height,
    sdf,
    chunkFlags: world.chunkFlags.slice(),
    props: Int32Array.from(props),
    propY: Float32Array.from(props.map((i) => world.props.y[i])),
  };
}

/**
 * Raise (delta > 0) or lower the terrain around world (x, z) within radius r (u) with a smooth
 * falloff, re-derive the shore SDF nearby, the chunk flags, and re-ground scatter props.
 */
export function testBrush(
  world: WorldData,
  x: number,
  z: number,
  r: number,
  delta: number,
): TestEdit {
  const hf = world.height;
  const n = hf.n;
  const cs = hf.cellSize;
  const bi0 = clampI(Math.floor((x - r - hf.originX) / cs), n);
  const bi1 = clampI(Math.ceil((x + r - hf.originX) / cs), n);
  const bj0 = clampI(Math.floor((z - r - hf.originZ) / cs), n);
  const bj1 = clampI(Math.ceil((z + r - hf.originZ) / cs), n);
  const wi0 = clampI(bi0 - SDF_PAD, n);
  const wi1 = clampI(bi1 + SDF_PAD, n);
  const wj0 = clampI(bj0 - SDF_PAD, n);
  const wj1 = clampI(bj1 + SDF_PAD, n);
  // props whose ground may move (one cell of bilinear support around the brush)
  const px0 = hf.originX + (bi0 - 1) * cs;
  const px1 = hf.originX + (bi1 + 1) * cs;
  const pz0 = hf.originZ + (bj0 - 1) * cs;
  const pz1 = hf.originZ + (bj1 + 1) * cs;
  const ps = world.props;
  const touched: number[] = [];
  for (let i = 0; i < ps.count; i++)
    if (ps.x[i] >= px0 && ps.x[i] <= px1 && ps.z[i] >= pz0 && ps.z[i] <= pz1) touched.push(i);
  const inverse = snapshot(world, wi0, wj0, wi1 - wi0 + 1, wj1 - wj0 + 1, touched);

  // 1. heights
  const d = hf.data;
  for (let j = bj0; j <= bj1; j++)
    for (let i = bi0; i <= bi1; i++) {
      const dx = hf.originX + i * cs - x;
      const dz = hf.originZ + j * cs - z;
      const q = (dx * dx + dz * dz) / (r * r);
      if (q >= 1) continue;
      const f = (1 - q) * (1 - q);
      const k = j * n + i;
      d[k] = Math.max(SEABED_Y, Math.min(MAX_Y, d[k] + delta * f));
    }
  // 2. shore SDF in the window from a nearest-coast search over a larger one (same formula as
  //    worldgen: land = distance to water · cell − cell/2, water negative)
  const si0 = clampI(wi0 - SEARCH, n);
  const si1 = clampI(wi1 + SEARCH, n);
  const sj0 = clampI(wj0 - SEARCH, n);
  const sj1 = clampI(wj1 + SEARCH, n);
  const sw = si1 - si0 + 1;
  const sh = sj1 - sj0 + 1;
  const land = new Uint8Array(sw * sh);
  for (let j = sj0; j <= sj1; j++)
    for (let i = si0; i <= si1; i++) {
      const k = j * n + i;
      const inBrush = i >= bi0 && i <= bi1 && j >= bj0 && j <= bj1;
      land[(j - sj0) * sw + (i - si0)] = (inBrush ? d[k] > 0 : world.shoreSdf[k] > 0) ? 1 : 0;
    }
  const toLand = edt(land, sw, sh, 1);
  const toWater = edt(land, sw, sh, 0);
  const left = si0 > 0 ? si0 : -Infinity;
  const top = sj0 > 0 ? sj0 : -Infinity;
  const right = si1 < n - 1 ? si1 : Infinity;
  const bottom = sj1 < n - 1 ? sj1 : Infinity;
  let sdfChanged = false;
  for (let j = wj0; j <= wj1; j++)
    for (let i = wi0; i <= wi1; i++) {
      const s = (j - sj0) * sw + (i - si0);
      const isLand = land[s] === 1;
      const dist = isLand ? toWater[s] : toLand[s];
      if (dist > Math.min(i - left, right - i, j - top, bottom - j)) continue;
      const v = Math.min(SDF_CAP, dist * cs - cs / 2) * (isLand ? 1 : -1);
      const k = j * n + i;
      if (Math.fround(v) !== world.shoreSdf[k]) {
        world.shoreSdf[k] = v;
        sdfChanged = true;
      }
    }
  // 3. chunk flags, 4. props
  world.chunkFlags.set(buildChunkFlags(hf));
  const moved: number[] = [];
  for (const i of touched) {
    const y = Math.fround(heightAt(hf, ps.x[i], ps.z[i]));
    if (y !== ps.y[i]) {
      ps.y[i] = y;
      moved.push(i);
    }
  }
  return {
    dirty: {
      chunks: chunksOf(wi0, wi1, wj0, wj1),
      minI: wi0,
      maxI: wi1,
      minJ: wj0,
      maxJ: wj1,
      props: moved,
      sdf: sdfChanged,
    },
    inverse,
  };
}

/** Write a saved patch back (exact bytes); returns the patch that undoes this write. */
export function applyTestPatch(world: WorldData, p: TestPatch): TestEdit {
  const inverse = snapshot(world, p.i0, p.j0, p.w, p.h, Array.from(p.props));
  const n = world.height.n;
  for (let y = 0; y < p.h; y++) {
    const o = (p.j0 + y) * n + p.i0;
    world.height.data.set(p.height.subarray(y * p.w, (y + 1) * p.w), o);
    world.shoreSdf.set(p.sdf.subarray(y * p.w, (y + 1) * p.w), o);
  }
  world.chunkFlags.set(p.chunkFlags);
  for (let k = 0; k < p.props.length; k++) world.props.y[p.props[k]] = p.propY[k];
  const i1 = p.i0 + p.w - 1;
  const j1 = p.j0 + p.h - 1;
  return {
    dirty: {
      chunks: chunksOf(p.i0, i1, p.j0, j1),
      minI: p.i0,
      maxI: i1,
      minJ: p.j0,
      maxJ: j1,
      props: Array.from(p.props),
      sdf: true,
    },
    inverse,
  };
}

export interface EditSelftestHooks {
  world: WorldData;
  rebuildDirty(region: DirtyRegion): void;
  /** Remesh everything still queued. */
  flush(): void;
  /** Render one frame (uploads happen here). */
  step(): void;
  memory(): { geometries: number; textures: number };
  calls(): number;
  now(): number;
}

export interface EditSelftestResult {
  edits: number;
  geoDelta: number;
  texDelta: number;
  restored: boolean;
  calls: number;
  ms: number;
}

/**
 * `?selftest=edit`: `count` seeded brush edits around the islands, each rebuilt and rendered,
 * then all undone in reverse; heights / SDF must be byte-identical and `renderer.info.memory`
 * back at its baseline. Throws on failure.
 */
export function runEditSelftest(
  h: EditSelftestHooks,
  seed: number,
  count = 50,
): EditSelftestResult {
  const t0 = h.now();
  const w = h.world;
  h.step();
  const base = h.memory();
  const hash0 = hashFloats(w.height.data) + hashFloats(w.shoreSdf);
  const rng = createRng(seed).fork('selftest-edit');
  const undo: TestPatch[] = [];
  for (let e = 0; e < count; e++) {
    const isl = w.islands[rng.int(0, w.islands.length - 1)];
    const a = rng.range(0, Math.PI * 2);
    // inside the island, over its shore or out on the shelf
    const dist = isl.radius * rng.range(0, 1.4);
    const r = rng.range(6, 26);
    const delta = (rng.chance(0.5) ? 1 : -1) * rng.range(1, 6);
    const res = testBrush(w, isl.cx + Math.cos(a) * dist, isl.cz + Math.sin(a) * dist, r, delta);
    undo.push(res.inverse);
    h.rebuildDirty(res.dirty);
    h.step();
  }
  for (let e = undo.length - 1; e >= 0; e--) {
    h.rebuildDirty(applyTestPatch(w, undo[e]).dirty);
    h.step();
  }
  h.flush();
  h.step();
  const after = h.memory();
  const restored = hashFloats(w.height.data) + hashFloats(w.shoreSdf) === hash0;
  const out: EditSelftestResult = {
    edits: count,
    geoDelta: after.geometries - base.geometries,
    texDelta: after.textures - base.textures,
    restored,
    calls: h.calls(),
    ms: h.now() - t0,
  };
  if (out.geoDelta !== 0 || out.texDelta !== 0 || !restored || !(out.calls > 0))
    throw new Error(
      `selftest=edit: geometries ${base.geometries}→${after.geometries}, textures ` +
        `${base.textures}→${after.textures}, world restored ${String(restored)}, calls ${out.calls}`,
    );
  return out;
}
