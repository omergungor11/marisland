import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateWorld } from '../world/index.ts';
import { CHUNKS_PER_SIDE, type WorldData } from '../world/types.ts';
import { EMPTY_DIRTY } from '../world/edit-types.ts';
import { Scope } from '../core/scope.ts';
import { createWorldTextures, ringScaleField } from './world-textures.ts';
import { buildTerrain, type TerrainView } from './terrain/terrain.ts';
import { createPropBatcher } from './props/batcher.ts';
import { appendSettlementProps } from './props/settlement-props.ts';
import { createPropMirror } from './props/prop-mirror.ts';
import { createRebuilder, dirtyChunks } from './rebuild.ts';
import { applyTestPatch, testBrush } from './rebuild-testing.ts';

const counters = () => ({
  hardPops: 0,
  instances: 0,
  groundCover: 0,
  agents: 0,
  particles: 0,
  gpuMemoryMB: 0,
  rebuilds: 0,
});

/** Camera near the first island: chunks there cache 2 u and 1 u levels too (TASK-371). */
function camOf(world: WorldData): THREE.Vector3 {
  const isl = world.islands[0];
  return new THREE.Vector3(isl.cx, isl.peakY + 30, isl.cz + 40);
}

function setup(world: WorldData, instant: boolean) {
  const scope = new Scope('t');
  const textures = createWorldTextures(world, scope);
  const terrain = buildTerrain(world, textures, 'medium', scope);
  terrain.update(0, camOf(world));
  const store = appendSettlementProps(world).props;
  const c = counters();
  const props = createPropBatcher(store, {
    scope,
    seed: world.seed,
    counters: c,
    materialFor: () => new THREE.MeshLambertMaterial(),
    softAppear: true,
    castShadows: false,
    instantEdits: instant,
  });
  props.setTier(3, 0);
  const timings: Record<string, number> = {};
  const rb = createRebuilder({
    world,
    terrain,
    textures,
    props,
    mirror: createPropMirror(store, world.props.count, world.height),
    instant,
    getTime: () => 1,
    now: () => performance.now(),
    counters: c,
    timings,
  });
  return { scope, textures, terrain, store, props, rb, timings, c };
}

/**
 * Every active chunk equals the same chunk of a fresh build of the (edited) world: every LOD
 * level cached in both (TASK-371) and the island merges.
 */
function expectMatchesFreshBuild(world: WorldData, terrain: TerrainView): void {
  const s2 = new Scope('fresh');
  const fresh = buildTerrain(world, createWorldTextures(world, s2), 'medium', s2);
  fresh.update(0, camOf(world));
  const active = terrain.chunks.filter((c) => c.active);
  expect(active.map((c) => c.cz * CHUNKS_PER_SIDE + c.cx).sort((a, b) => a - b)).toEqual(
    fresh.chunks.map((c) => c.cz * CHUNKS_PER_SIDE + c.cx).sort((a, b) => a - b),
  );
  const same = (got: THREE.BufferGeometry, want: THREE.BufferGeometry, what: string): void => {
    for (const a of ['position', 'color', 'normal', 'ao', 'aMorph']) {
      const g = got.getAttribute(a).array;
      const w = want.getAttribute(a).array;
      if (g.length !== w.length || g.some((v, i) => v !== w[i]))
        throw new Error(
          `${what} ${a} differs from a fresh build ${g.length} ${w.length} ${g.findIndex((v, i) => v !== w[i])}`,
        );
    }
    expect(Array.from(got.index!.array)).toEqual(Array.from(want.index!.array));
  };
  let compared = 0;
  for (const f of fresh.chunks) {
    const c = active.find((k) => k.cx === f.cx && k.cz === f.cz)!;
    expect(c.skirtEdges, `edges ${f.cx},${f.cz}`).toBe(f.skirtEdges);
    f.levels.forEach((m, lv) => {
      const got = c.levels[lv];
      if (!m || !got) return;
      same(got.geometry, m.geometry, `chunk ${f.cx},${f.cz} level ${lv}`);
      compared++;
    });
  }
  expect(compared).toBeGreaterThan(fresh.chunks.length);
  fresh.merges.forEach((g, k) =>
    same(terrain.merges[k].mesh.geometry, g.mesh.geometry, `merge ${k}`),
  );
  s2.dispose();
}

describe('dirtyChunks', () => {
  it('pads the bounds into neighbouring chunks (shared edges included)', () => {
    const r = { ...EMPTY_DIRTY, minI: 40, maxI: 50, minJ: 33, maxJ: 40 };
    expect(dirtyChunks(r, 0)).toEqual([13]); // cz 1, cx 1
    // within 4 cells of the x = 32 / z = 32 edges → the -x / -z neighbours too
    expect(dirtyChunks(r, 8)).toEqual([0, 1, 12, 13]);
    expect(dirtyChunks({ ...EMPTY_DIRTY, chunks: [5, 3] })).toEqual([3, 5]);
    expect(dirtyChunks({ ...EMPTY_DIRTY, minI: 384, maxI: 384, minJ: 0, maxJ: 0 }, 0)).toEqual([
      11,
    ]);
  });
});

describe('dirty-chunk rebuild (TASK-211)', () => {
  it('remeshes in place, ≤ 2 chunks per frame, identical to a fresh build of the edited world', () => {
    const world = generateWorld(1001, { islands: 1 });
    const { terrain, rb, timings, c, textures } = setup(world, false);
    const isl = world.islands[0];
    const meshesBefore = terrain.chunks.map((k) => k.levels.slice());
    const old = new Map(
      terrain.chunks.map((k) => [k, k.levels.flatMap((m) => (m ? [m.geometry] : []))]),
    );
    const disposed = new Set<THREE.BufferGeometry>();
    for (const gs of old.values())
      for (const g of gs) g.addEventListener('dispose', () => disposed.add(g));
    // a hill on the island and a dent over its shore
    const e1 = testBrush(world, isl.cx, isl.cz, 24, 8);
    const e2 = testBrush(world, isl.cx + isl.radius, isl.cz, 18, -6);
    rb.rebuildDirty(e1.dirty);
    rb.rebuildDirty(e2.dirty);
    const queued = rb.pending;
    expect(queued).toBeGreaterThan(2);
    rb.update();
    expect(rb.pending).toBe(queued - 2);
    expect(c.rebuilds).toBe(2);
    rb.flush();
    expect(rb.pending).toBe(0);
    expect(timings.rebuildMs).toBeGreaterThan(0);
    // same mesh objects, every cached level of a remeshed chunk got a new geometry
    expect(terrain.chunks.slice(0, meshesBefore.length).map((k) => k.levels)).toEqual(meshesBefore);
    const N = CHUNKS_PER_SIDE;
    const touched = new Set([...dirtyChunks(e1.dirty), ...dirtyChunks(e2.dirty)]);
    let remeshed = 0;
    for (const [k, gs] of old) {
      if (!touched.has(k.cz * N + k.cx)) continue;
      for (const g of gs) expect(disposed.has(g)).toBe(true);
      remeshed++;
    }
    expect(remeshed).toBeGreaterThan(0);
    expectMatchesFreshBuild(world, terrain);
    // textures: height + SDF channels equal a full recompute; ring scale (G) close to it
    const fresh = createWorldTextures(world, new Scope('f'));
    const got = (textures.sdf.image as { data: Uint16Array }).data;
    const want = (fresh.sdf.image as { data: Uint16Array }).data;
    expect(Array.from((textures.height.image as { data: Uint16Array }).data)).toEqual(
      Array.from((fresh.height.image as { data: Uint16Array }).data),
    );
    const ring = ringScaleField(world);
    let maxRing = 0;
    for (let i = 0; i < ring.length; i++) {
      expect(got[i * 2]).toBe(want[i * 2]);
      maxRing = Math.max(
        maxRing,
        Math.abs(THREE.DataUtils.fromHalfFloat(got[i * 2 + 1]) - ring[i]),
      );
    }
    expect(maxRing).toBeLessThan(0.01);
    console.info(
      `rebuild: ${c.rebuilds} chunks, ${timings.rebuildMs.toFixed(2)} ms/chunk mean, ` +
        `${timings.rebuildMaxMs.toFixed(2)} ms max, textures ${timings.rebuildTexMs.toFixed(2)} ms, ` +
        `props ${timings.rebuildPropsMs.toFixed(2)} ms`,
    );
    // undo both: back to the generated world, chunk for chunk
    rb.rebuildDirty(applyTestPatch(world, e2.inverse).dirty);
    rb.rebuildDirty(applyTestPatch(world, e1.inverse).dirty);
    rb.flush();
    expectMatchesFreshBuild(world, terrain);
  });

  it('creates a chunk that became meshable and hides + releases one that sank', () => {
    const world = generateWorld(1001, { islands: 1 });
    const { terrain, rb } = setup(world, true);
    const N = CHUNKS_PER_SIDE;
    // a deep, unmeshed chunk with unmeshed neighbours far from the island
    let id = -1;
    for (let k = 0; k < N * N && id < 0; k++) {
      const cx = k % N;
      const cz = Math.floor(k / N);
      if (cx < 1 || cz < 1 || cx > N - 2 || cz > N - 2) continue;
      if (terrain.chunks.some((c) => Math.abs(c.cx - cx) <= 1 && Math.abs(c.cz - cz) <= 1))
        continue;
      id = k;
    }
    expect(id).toBeGreaterThanOrEqual(0);
    const cx = id % N;
    const cz = Math.floor(id / N);
    const h = world.height;
    const x = h.originX + (cx * 32 + 16) * h.cellSize;
    const z = h.originZ + (cz * 32 + 16) * h.cellSize;
    const n0 = terrain.chunks.length;
    const e = testBrush(world, x, z, 20, 60);
    rb.rebuildDirty(e.dirty); // capture mode: synchronous
    expect(rb.pending).toBe(0);
    const made = terrain.chunks.find((c) => c.cx === cx && c.cz === cz)!;
    expect(made?.active).toBe(true);
    expect(terrain.chunks.length).toBeGreaterThan(n0);
    terrain.update(0, camOf(world));
    expect(made.levels[made.shown]?.visible || terrain.merges[made.island].shown).toBe(true);
    expectMatchesFreshBuild(world, terrain);
    const geo = made.levels.flatMap((m) => (m ? [m.geometry] : []));
    let disposed = 0;
    for (const g of geo) g.addEventListener('dispose', () => disposed++);
    rb.rebuildDirty(applyTestPatch(world, e.inverse).dirty);
    expect(made.active).toBe(false);
    expect(made.levels.every((m) => m === null)).toBe(true);
    expect(disposed).toBe(geo.length);
    terrain.update(0, camOf(world));
    expect(made.shown).toBe(-1);
    expectMatchesFreshBuild(world, terrain);
  });

  it('re-grounds scatter and settlement props inside the brush', () => {
    const world = generateWorld(1001, { islands: 1 });
    const { rb, store, props } = setup(world, true);
    const isl = world.islands[0];
    // the busiest spot: a settlement lot
    const lot = world.lots.find((l) => l.islandId === isl.id) ?? { x: isl.cx, z: isl.cz };
    const e = testBrush(world, lot.x, lot.z, 20, -3);
    rb.rebuildDirty(e.dirty);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let checked = 0;
    for (const g of props.groups) {
      if (g.members.length && g.members[0] < 0) continue;
      for (let k = 0; k < g.members.length; k++) {
        const i = g.members[k];
        if (Math.hypot(store.x[i] - lot.x, store.z[i] - lot.z) > 20) continue;
        g.mesh.getMatrixAt(k, m);
        p.setFromMatrixPosition(m);
        expect(p.y).toBeCloseTo(store.y[i], 4);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(e.dirty.props.length).toBeGreaterThan(0);
  });

  it('prewarm runs the path on unchanged data: same buffers, no rebuild counted (TASK-213)', async () => {
    const world = generateWorld(1001, { islands: 1 });
    const { terrain, rb, timings, c, textures, props, store } = setup(world, false);
    const isl = world.islands[0];
    const heights = Array.from((textures.height.image as { data: Uint16Array }).data);
    const matrices = props.groups.map((g) => Array.from(g.mesh.instanceMatrix.array));
    const seen: number[][] = [];
    rb.onProps({ after: (ids) => seen.push([...ids]) });
    let waits = 0;
    const ms = await rb.prewarm(isl.cx, isl.cz, () => {
      waits++;
      return true;
    });
    expect(waits).toBe(6); // between the 7 steps
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(timings.editPrewarmMs).toBe(ms);
    expect(c.rebuilds).toBe(0);
    expect(rb.pending).toBe(0);
    expect(seen).toHaveLength(1); // one prop re-synced through the listeners
    expect(store.count).toBeGreaterThan(0);
    expect(Array.from((textures.height.image as { data: Uint16Array }).data)).toEqual(heights);
    expect(props.groups.map((g) => Array.from(g.mesh.instanceMatrix.array))).toEqual(matrices);
    expectMatchesFreshBuild(world, terrain);
  });
});
