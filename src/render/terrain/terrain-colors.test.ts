import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../world/index.ts';
import { Zone } from '../../world/types.ts';
import { THEMES } from '../../content/themes/index.ts';
import { DEFAULT_GROUND, DETAIL_LAYER_IDS, MATERIAL_LAYERS } from '../../content/ground.ts';
import type { GroundSpec } from '../../content/ground.ts';
import {
  PALETTE_TEXELS,
  buildAlbedoGrid,
  buildGroundPalette,
  fillAlbedoGrid,
} from './terrain-colors.ts';

describe('albedo grid + ground palette (TASK-372)', () => {
  const world = generateWorld(1001);
  const n = world.height.n;
  const albedo = buildAlbedoGrid(world);
  const width = 16 * PALETTE_TEXELS;
  const texel = (pal: Uint8Array, row: number, zone: number, t: number): number[] => {
    const o = (row * width + zone * PALETTE_TEXELS + t) * 4;
    return Array.from(pal.subarray(o, o + 4));
  };

  it('is deterministic and stores the island id in alpha', () => {
    expect(buildAlbedoGrid(world).rgba).toEqual(albedo.rgba);
    for (let i = 0; i < n * n; i += 97) expect(albedo.rgba[i * 4 + 3]).toBe(world.islandMap[i]);
  });

  it('a sub-rect refill equals the full build (edit path)', () => {
    const g = { rgba: albedo.rgba.slice() };
    g.rgba.fill(0, 4 * (100 * n), 4 * (141 * n));
    fillAlbedoGrid(world, g, 0, n - 1, 100, 140);
    expect(g.rgba).toEqual(albedo.rgba);
  });

  it('palette row 0 = defaults; a theme ground spec recolours its zone and sets its layers', () => {
    const pal = buildGroundPalette(world);
    const grassLayers = MATERIAL_LAYERS[DEFAULT_GROUND[Zone.grass].material];
    expect(texel(pal, 0, Zone.grass, 0)[0]).toBe(DETAIL_LAYER_IDS.indexOf(grassLayers[0]));
    // override: Coding plaza → blue-grey pavers
    const isl = world.islands.findIndex((i) => i.theme === 'coding');
    const ground = THEMES.coding.ground as Partial<Record<number, GroundSpec>>;
    const before = ground[Zone.plaza];
    ground[Zone.plaza] = {
      material: 'paving',
      base: '#C9CED6',
      layer: { tile: { size: 1, grout: '#8A93A0' } },
    };
    try {
      const pal2 = buildGroundPalette(world);
      expect(texel(pal2, isl + 1, Zone.plaza, 0)[0]).toBe(DETAIL_LAYER_IDS.indexOf('tiles'));
      expect(texel(pal2, isl + 1, Zone.plaza, 1)[0]).toBe(128); // tile 1 u = 2 × the 0.5 u paver
      const alb = buildAlbedoGrid(world);
      let checked = 0;
      for (let i = 0; i < n * n; i++)
        if (
          world.zone[i] === Zone.plaza &&
          world.islandMap[i] === isl + 1 &&
          world.height.data[i] > 0
        ) {
          // flat zone: base × macro × AO, so blue stays ≥ red (the default plaza is warm)
          expect(alb.rgba[i * 4 + 2]).toBeGreaterThanOrEqual(alb.rgba[i * 4]);
          checked++;
        }
      expect(checked).toBeGreaterThan(0);
    } finally {
      if (before) ground[Zone.plaza] = before;
      else delete ground[Zone.plaza];
    }
  });
});
