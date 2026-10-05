import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateWorld } from '../../world/index.ts';
import { CHUNK_CELLS, CHUNKS_PER_SIDE } from '../../world/types.ts';
import { Scope } from '../../core/scope.ts';
import { TERRAIN_LOD } from '../../content/terrain.ts';
import { sampleSurface } from '../../shared/terrain-sample.ts';
import { createWorldTextures } from '../world-textures.ts';
import { buildTerrain, pickLevel, type TerrainView } from './terrain.ts';
import { buildChunkGeometry, morphBands, morphWeight } from './terrain-mesh.ts';
import { buildColorGrid } from './terrain-colors.ts';

const world = generateWorld(1001, { islands: 1 });
const isl = world.islands[0];
const h = world.height;
const SIZE = CHUNK_CELLS * h.cellSize;
const scope = new Scope('test');
const textures = createWorldTextures(world, scope);
const t0 = performance.now();
const terrain = buildTerrain(world, textures, 'medium', scope);
const buildMs = performance.now() - t0;
const grid = buildColorGrid(world);

/** Perceptual lightness of a linear colour: HSL L in sRGB. */
const hsl = { h: 0, s: 0, l: 0 };
const _c = new THREE.Color();
const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const arr = (g: THREE.BufferGeometry, a: string): Float32Array =>
  g.getAttribute(a).array as Float32Array;
/** The chunk under the island centre. */
const home = terrain.chunks.find(
  (c) =>
    c.cx === Math.floor((isl.cx - h.originX) / SIZE) &&
    c.cz === Math.floor((isl.cz - h.originZ) / SIZE),
)!;
const L = TERRAIN_LOD;

/** Height of the indexed mesh `g` at (x, z) (triangle containing the point), morphed by `w`. */
function meshY(g: THREE.BufferGeometry, x: number, z: number, w: number): number {
  const pos = arr(g, 'position');
  const mor = arr(g, 'aMorph');
  const idx = g.index!.array;
  for (let t = 0; t < idx.length; t += 3) {
    const p = [idx[t], idx[t + 1], idx[t + 2]].map((v) => [
      pos[v * 3],
      pos[v * 3 + 1] + w * mor[v * 4],
      pos[v * 3 + 2],
    ]);
    const [a, b, c] = p;
    const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(d) < 1e-9) continue; // skirt (vertical)
    const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
    const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
    return l1 * a[1] + l2 * b[1] + l3 * c[1];
  }
  throw new Error(`no triangle at ${x},${z}`);
}

describe('terrain mesher (TASK-371)', () => {
  it('builds level 0 for every chunk with land, one merge per island', () => {
    for (let cz = 0; cz < CHUNKS_PER_SIDE; cz++)
      for (let cx = 0; cx < CHUNKS_PER_SIDE; cx++) {
        if (world.chunkFlags[cz * CHUNKS_PER_SIDE + cx] & 1) {
          const c = terrain.chunks.find((k) => k.cx === cx && k.cz === cz);
          expect(c?.levels[0], `chunk ${cx},${cz}`).toBeTruthy();
        }
      }
    expect(terrain.chunks.length).toBeGreaterThan(0);
    expect(terrain.merges).toHaveLength(world.islands.length);
    expect(terrain.group.children.length).toBe(terrain.chunks.length + terrain.merges.length);
    console.info(
      `terrain: ${terrain.chunks.length} chunks, ${(terrain.bytes / 1e6).toFixed(2)} MB at boot, ${buildMs.toFixed(0)} ms`,
    );
  });

  it('geometry: indexed, finite, contract attributes, ao / colours in [0,1], land L >= 12 %', () => {
    let minLandL = 1;
    for (let level = 0; level < L.strides.length; level++) {
      const { geometry: g } = buildChunkGeometry(world, grid, home.cx, home.cz, level, 15);
      expect(g.index).not.toBeNull();
      expect(Object.keys(g.attributes).sort()).toEqual(
        ['aMorph', 'ao', 'color', 'normal', 'position'].sort(), // TODO(TASK-372): no color
      );
      const pos = arr(g, 'position');
      const nor = arr(g, 'normal');
      const col = arr(g, 'color');
      const ao = arr(g, 'ao');
      for (let i = 0; i < pos.length; i++) {
        expect(Number.isFinite(pos[i])).toBe(true);
        expect(Number.isFinite(nor[i])).toBe(true);
      }
      for (const v of ao) if (!(v > 0 && v <= 1)) throw new Error(`ao ${v}`);
      for (let i = 0; i < col.length; i++)
        if (!(col[i] >= 0 && col[i] <= 1)) throw new Error(`colour ${col[i]} out of range`);
      for (let v = 0; v < pos.length / 3; v++) {
        if (pos[v * 3 + 1] <= 0.05) continue;
        _c.setRGB(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]).getHSL(hsl, THREE.SRGBColorSpace);
        minLandL = Math.min(minLandL, hsl.l);
      }
      g.dispose();
    }
    expect(minLandL).toBeGreaterThanOrEqual(0.12);
  });

  it('vertices lie on the Catmull-Rom surface with its analytic normals', () => {
    const s = { y: 0, dydx: 0, dydz: 0 };
    for (let level = 0; level < L.strides.length; level++) {
      const { geometry: g } = buildChunkGeometry(world, grid, home.cx, home.cz, level, 0);
      const pos = arr(g, 'position');
      const nor = arr(g, 'normal');
      for (let v = 0; v < pos.length / 3; v++) {
        sampleSurface(h, pos[v * 3], pos[v * 3 + 2], s);
        expect(pos[v * 3 + 1]).toBe(Math.fround(s.y));
        const l = Math.hypot(s.dydx, 1, s.dydz);
        expect(nor[v * 3 + 1]).toBeCloseTo(1 / l, 5);
        expect(nor[v * 3]).toBeCloseTo(-s.dydx / l, 5);
      }
      g.dispose();
    }
  });

  it('morph endpoints: fully morphed level k equals level k − 1 (positions and normals)', () => {
    for (let level = 1; level < L.strides.length; level++) {
      const { geometry: fine } = buildChunkGeometry(world, grid, home.cx, home.cz, level, 0);
      const { geometry: coarse } = buildChunkGeometry(world, grid, home.cx, home.cz, level - 1, 0);
      const pos = arr(fine, 'position');
      const mor = arr(fine, 'aMorph');
      const side = Math.round(SIZE / L.strides[level]) + 1;
      let maxErr = 0;
      for (let v = 0; v < side * side; v++) {
        const i = v % side;
        const j = Math.floor(v / side);
        expect(mor[v * 4 + 3]).toBe(level);
        if (!(i & 1) && !(j & 1)) expect(mor[v * 4]).toBe(0);
        // sample a subset (the triangle search is linear)
        if ((i * 7 + j * 3) % 11) continue;
        const y = pos[v * 3 + 1] + mor[v * 4];
        maxErr = Math.max(maxErr, Math.abs(y - meshY(coarse, pos[v * 3], pos[v * 3 + 2], 0)));
      }
      expect(maxErr).toBeLessThan(1e-4);
      // morphed normal of an edge-midpoint vertex = normalised mean of its two coarse vertices
      const cn = arr(coarse, 'normal');
      const cside = (side - 1) / 2 + 1;
      const v = 2 * side + 1; // i = 1, j = 2 → between coarse (0, 1) and (1, 1)
      const a = cside;
      const b = cside + 1;
      const n = [0, 1, 2].map((k) => cn[a * 3 + k] + cn[b * 3 + k]);
      const ln = Math.hypot(...n);
      expect(mor[v * 4 + 1]).toBeCloseTo(n[0] / ln, 5);
      expect(mor[v * 4 + 2]).toBeCloseTo(n[2] / ln, 5);
      fine.dispose();
      coarse.dispose();
    }
  });

  it('no cracks: shared edges match between equal levels and between level k and k − 1', () => {
    const right = terrain.chunks.find((c) => c.cx === home.cx + 1 && c.cz === home.cz)!;
    expect(right).toBeDefined();
    const x = h.originX + right.cx * SIZE;
    for (let level = 0; level < L.strides.length; level++) {
      const a = buildChunkGeometry(world, grid, home.cx, home.cz, level, 0).geometry;
      const b = buildChunkGeometry(world, grid, right.cx, right.cz, level, 0).geometry;
      const side = Math.round(SIZE / L.strides[level]) + 1;
      const pa = arr(a, 'position');
      const pb = arr(b, 'position');
      const ma = arr(a, 'aMorph');
      const mb = arr(b, 'aMorph');
      for (let j = 0; j < side; j++) {
        const va = j * side + side - 1;
        const vb = j * side;
        expect(pa[va * 3]).toBe(x);
        for (let k = 0; k < 3; k++) expect(pa[va * 3 + k]).toBe(pb[vb * 3 + k]);
        for (let k = 0; k < 4; k++) expect(ma[va * 4 + k]).toBe(mb[vb * 4 + k]);
      }
      if (level > 0) {
        // a level-(k−1) neighbour only exists once its box is ≥ band × (1 − h) away, where the
        // fine chunk's edge vertices are fully morphed onto the coarse edge
        const b0 = L.bands[level - 1] * (1 - L.hysteresis);
        expect(morphWeight(level, b0)).toBe(1);
        expect(pickLevel(b0 - 1e-3, level - 1, 3)).toBeGreaterThanOrEqual(level);
        const coarse = buildChunkGeometry(world, grid, right.cx, right.cz, level - 1, 0).geometry;
        for (let j = 0; j < side; j++) {
          const va = j * side + side - 1;
          const y = pa[va * 3 + 1] + ma[va * 4];
          expect(Math.abs(y - meshY(coarse, x, pa[va * 3 + 2], 0))).toBeLessThan(1e-4);
        }
        coarse.dispose();
      }
      a.dispose();
      b.dispose();
    }
  });

  it('skirts hang >= 2 u below every skirted edge vertex', () => {
    for (let level = 0; level < L.strides.length; level++) {
      const { geometry: g, stats } = buildChunkGeometry(world, grid, home.cx, home.cz, level, 15);
      const m = Math.round(SIZE / L.strides[level]);
      const side = m + 1;
      expect(stats.triangles).toBe(m * m * 2 + 4 * m * 2);
      const pos = arr(g, 'position');
      const top = [
        (k: number) => k,
        (k: number) => m * side + k,
        (k: number) => k * side,
        (k: number) => k * side + m,
      ];
      for (let e = 0; e < 4; e++)
        for (let k = 0; k < side; k++) {
          const v = top[e](k);
          const s = side * side + e * side + k;
          expect(pos[s * 3]).toBe(pos[v * 3]);
          expect(pos[v * 3 + 1] - pos[s * 3 + 1]).toBeGreaterThanOrEqual(L.skirt);
        }
      expect(stats.minY).toBeLessThanOrEqual(Math.min(...pos.filter((_, i) => i % 3 === 1)));
      g.dispose();
    }
  });

  it('pickLevel: bands without history, hysteresis with it', () => {
    expect(pickLevel(500, -1, 3)).toBe(0);
    expect(pickLevel(299, -1, 3)).toBe(1);
    expect(pickLevel(119, -1, 3)).toBe(2);
    expect(pickLevel(10, -1, 3)).toBe(3);
    expect(pickLevel(10, -1, 2)).toBe(2);
    // within ±10 % of a band the current level holds
    expect(pickLevel(290, 0, 3)).toBe(0);
    expect(pickLevel(265, 0, 3)).toBe(1);
    expect(pickLevel(320, 1, 3)).toBe(1);
    expect(pickLevel(335, 1, 3)).toBe(0);
    expect(pickLevel(5, 0, 3)).toBe(3);
    // morph windows end where the finer level takes over
    morphBands()
      .slice(1)
      .forEach(([a, b], k) => {
        expect(b).toBeCloseTo(L.bands[k] * (1 - L.hysteresis), 6);
        expect(a).toBeLessThan(b);
      });
  });

  it('far camera: every island draws as one merged mesh, chunks hidden', () => {
    terrain.update(0, v3(isl.cx, 900, isl.cz + 600));
    expect(terrain.merges.every((g) => g.shown && g.mesh.visible)).toBe(true);
    expect(terrain.chunks.every((c) => c.shown === -1 && c.levels.every((m) => !m?.visible))).toBe(
      true,
    );
    const drawn = terrain.group.children.filter((o) => o.visible).length;
    expect(drawn).toBe(world.islands.length);
  });
});

/** Fresh terrain for one quality; `instant` mimics capture. */
function fresh(q: 'low' | 'medium' | 'high'): { t: TerrainView; s: Scope } {
  const s = new Scope(`t-${q}`);
  return { t: buildTerrain(world, createWorldTextures(world, s), q, s), s };
}

describe('distance LOD (TASK-371)', () => {
  const near = v3(isl.cx + 6, isl.peakY + 12, isl.cz + 10);

  it('picks the finest level near the camera per quality, ≤ 9 chunks at 0.5 u', () => {
    for (const [q, finest] of [
      ['low', 1],
      ['medium', 2],
      ['high', 3],
    ] as const) {
      const { t, s } = fresh(q);
      t.update(0, near);
      const shown = t.chunks.filter((c) => c.shown >= 0);
      expect(Math.max(...shown.map((c) => c.shown))).toBe(finest);
      expect(t.chunks.filter((c) => c.shown === 3).length).toBeLessThanOrEqual(L.finestMaxChunks);
      // first update is synchronous: every chunk draws the level it picked
      for (const c of t.chunks) if (c.shown >= 0) expect(c.shown).toBe(c.level);
      console.info(`${q} near: ${t.triangles} tris, ${(t.bytes / 1e6).toFixed(2)} MB`);
      s.dispose();
    }
  });

  it('interactive: ≤ 2 builds per frame, coarser cached level shown meanwhile; instant builds all', () => {
    const { t, s } = fresh('high');
    t.update(0, v3(isl.cx, 900, isl.cz + 600));
    const count = (): number => t.chunks.reduce((n, c) => n + c.levels.filter((m) => m).length, 0);
    let before = count();
    t.update(0, near);
    expect(count() - before).toBeLessThanOrEqual(L.buildsPerFrame);
    for (const c of t.chunks) if (c.shown >= 0) expect(c.shown).toBeLessThanOrEqual(c.level);
    let frames = 1;
    while (t.pending > 0 && frames < 500) {
      before = count();
      t.update(0, near);
      expect(count() - before).toBeLessThanOrEqual(L.buildsPerFrame);
      frames++;
    }
    expect(t.pending).toBe(0);
    for (const c of t.chunks) if (c.shown >= 0) expect(c.shown).toBe(c.level);
    s.dispose();
    const b = fresh('high');
    b.t.instant = true;
    b.t.update(0, v3(isl.cx, 900, isl.cz + 600));
    b.t.update(0, near);
    for (const c of b.t.chunks) if (c.shown >= 0) expect(c.shown).toBe(c.level);
    b.s.dispose();
  });

  it('LRU keeps fine levels within the cache caps; memory ≤ 25 MB on high over a fly-through', () => {
    const { t, s } = fresh('high');
    let maxBytes = 0;
    let maxTris = 0;
    for (let k = 0; k <= 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      const r = isl.radius * 1.4;
      const cam = v3(isl.cx + r * Math.cos(a), 14, isl.cz + r * Math.sin(a));
      for (let f = 0; f < 6; f++) t.update(0, cam);
      for (let lv = 2; lv < L.strides.length; lv++)
        expect(t.chunks.filter((c) => c.levels[lv]).length).toBeLessThanOrEqual(L.cache[lv]);
      maxBytes = Math.max(maxBytes, t.bytes);
      maxTris = Math.max(maxTris, t.triangles);
    }
    console.info(`fly-through: max ${(maxBytes / 1e6).toFixed(2)} MB, max ${maxTris} tris`);
    expect(maxBytes).toBeLessThanOrEqual(25e6);
    expect(maxTris).toBeLessThanOrEqual(600_000);
    s.dispose();
  });

  it('is deterministic: same camera → byte-identical buffers', () => {
    const a = fresh('high');
    const b = fresh('high');
    a.t.update(0, near);
    b.t.update(0, near);
    for (let k = 0; k < a.t.chunks.length; k++) {
      const ca = a.t.chunks[k];
      const cb = b.t.chunks[k];
      expect(cb.level).toBe(ca.level);
      ca.levels.forEach((m, lv) => {
        if (!m) return expect(cb.levels[lv]).toBeNull();
        for (const name of Object.keys(m.geometry.attributes))
          expect(Buffer.from(arr(cb.levels[lv]!.geometry, name).buffer)).toEqual(
            Buffer.from(arr(m.geometry, name).buffer),
          );
      });
    }
    a.s.dispose();
    b.s.dispose();
  });
});
