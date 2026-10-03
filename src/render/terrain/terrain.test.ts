import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateWorld } from '../../world/index.ts';
import { CHUNKS_PER_SIDE } from '../../world/types.ts';
import { Scope } from '../../core/scope.ts';
import { createWorldTextures } from '../world-textures.ts';
import { buildTerrain } from './terrain.ts';

const world = generateWorld(1001);
const scope = new Scope('test');
const textures = createWorldTextures(world, scope);
const t0 = performance.now();
const terrain = buildTerrain(world, textures, 'medium', scope);
const buildMs = performance.now() - t0;

/** Perceptual lightness of a linear colour: HSL L in sRGB. */
const hsl = { h: 0, s: 0, l: 0 };
const _c = new THREE.Color();

describe('terrain mesher (TASK-102)', () => {
  it('builds both LODs for every chunk with land', () => {
    for (let cz = 0; cz < CHUNKS_PER_SIDE; cz++)
      for (let cx = 0; cx < CHUNKS_PER_SIDE; cx++) {
        if (world.chunkFlags[cz * CHUNKS_PER_SIDE + cx] & 1) {
          const c = terrain.chunks.find((k) => k.cx === cx && k.cz === cz);
          expect(c, `chunk ${cx},${cz}`).toBeDefined();
        }
      }
    expect(terrain.chunks.length).toBeGreaterThan(0);
    expect(terrain.group.children.length).toBe(terrain.chunks.length * 2);
    console.info(
      `terrain: ${terrain.chunks.length} chunks, LOD0 ${terrain.triangles} tris, LOD1 ${terrain.trianglesLod1} tris, ${buildMs.toFixed(0)} ms`,
    );
  });

  it('geometry is non-indexed, finite, colours in [0,1], land L >= 12 %', () => {
    let minLandL = 1;
    for (const c of terrain.chunks) {
      for (const m of c.lods) {
        const g = m.geometry;
        expect(g.index).toBeNull();
        const pos = g.getAttribute('position').array as Float32Array;
        const nor = g.getAttribute('normal').array as Float32Array;
        const col = g.getAttribute('color').array as Float32Array;
        expect(pos.length % 9).toBe(0);
        expect(pos.length).toBe(col.length);
        for (let i = 0; i < pos.length; i++) {
          expect(Number.isFinite(pos[i])).toBe(true);
          expect(Number.isFinite(nor[i])).toBe(true);
        }
        for (let i = 0; i < col.length; i++) {
          if (!(col[i] >= 0 && col[i] <= 1)) throw new Error(`colour ${col[i]} out of range`);
        }
        for (let f = 0; f < pos.length / 9; f++) {
          const o = f * 9;
          const cy = (pos[o + 1] + pos[o + 4] + pos[o + 7]) / 3;
          if (cy <= 0.05) continue;
          _c.setRGB(col[o], col[o + 1], col[o + 2]).getHSL(hsl, THREE.SRGBColorSpace);
          minLandL = Math.min(minLandL, hsl.l);
        }
      }
    }
    expect(minLandL).toBeGreaterThanOrEqual(0.12);
  });

  it('flat normals: the 3 vertices of a face share one normal, mostly up-facing', () => {
    const g = terrain.chunks[0].lods[0].geometry;
    const nor = g.getAttribute('normal').array as Float32Array;
    let up = 0;
    const faces = nor.length / 9;
    for (let f = 0; f < faces; f++) {
      const o = f * 9;
      expect(nor[o]).toBe(nor[o + 3]);
      expect(nor[o + 1]).toBe(nor[o + 7]);
      if (nor[o + 1] > 0) up++;
    }
    expect(up / faces).toBeGreaterThan(0.85);
  });

  it('skirts: every chunk has a vertical skirt reaching >= 2 u below its edge', () => {
    for (const c of terrain.chunks) {
      for (const [lod, cells] of [
        [0, 32],
        [1, 16],
      ] as const) {
        const pos = c.lods[lod].geometry.getAttribute('position').array as Float32Array;
        const surfaceTris = cells * cells * 2;
        const skirtTris = pos.length / 9 - surfaceTris;
        const edges = [1, 2, 4, 8].filter((b) => c.skirtEdges & b).length;
        expect(skirtTris).toBe(cells * edges * 2);
        for (let f = surfaceTris; f < pos.length / 9; f++) {
          const o = f * 9;
          const ys = [pos[o + 1], pos[o + 4], pos[o + 7]];
          expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(1.99);
        }
        expect(c.minY).toBeLessThanOrEqual(
          Math.min(...Array.from(pos.filter((_, i) => i % 3 === 1))) + 1e-4,
        );
      }
    }
  });

  it('interior chunks are skirted on all four sides', () => {
    expect(terrain.chunks.filter((c) => c.skirtEdges === 15).length).toBeGreaterThan(0);
  });

  it('LOD1 is at most 30 % of LOD0; LOD0 within budget', () => {
    expect(terrain.trianglesLod1).toBeLessThanOrEqual(terrain.triangles * 0.3);
    expect(terrain.triangles).toBeLessThanOrEqual(250_000);
  });

  it('onTier swaps LOD visibility', () => {
    terrain.onTier(0);
    expect(terrain.chunks.every((c) => !c.lods[0].visible && c.lods[1].visible)).toBe(true);
    terrain.onTier(2);
    expect(terrain.chunks.every((c) => c.lods[0].visible && !c.lods[1].visible)).toBe(true);
  });

  it('is deterministic', () => {
    const s2 = new Scope('t2');
    const again = buildTerrain(world, createWorldTextures(world, s2), 'medium', s2);
    const a = terrain.chunks[3].lods[0].geometry.getAttribute('color').array;
    const b = again.chunks[3].lods[0].geometry.getAttribute('color').array;
    expect(Array.from(a)).toEqual(Array.from(b));
    s2.dispose();
  });
});
