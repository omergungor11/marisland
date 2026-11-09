import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../world/index.ts';
import { Zone, ZONE_COUNT } from '../../world/types.ts';
import { THEMES } from '../../content/themes/index.ts';
import {
  DEFAULT_GROUND,
  DETAIL_LAYER_IDS,
  GROUND_WALL,
  MATERIAL_LAYERS,
} from '../../content/ground.ts';
import type { GroundSpec } from '../../content/ground.ts';
import {
  PALETTE_TEXELS,
  WALL_TONE_TEXEL,
  WALL_TONES,
  buildAlbedoGrid,
  buildGroundPalette,
  fillAlbedoGrid,
  wallColors,
} from './terrain-colors.ts';

describe('albedo grid + ground palette (TASK-372)', () => {
  const world = generateWorld(1001);
  const n = world.height.n;
  const albedo = buildAlbedoGrid(world);
  const width = ZONE_COUNT * PALETTE_TEXELS;
  const texel = (pal: Uint8Array, row: number, zone: number, t: number): number[] => {
    const o = (row * width + zone * PALETTE_TEXELS + t) * 4;
    return Array.from(pal.subarray(o, o + 4));
  };

  it('is deterministic and stores the island id in alpha', () => {
    expect(buildAlbedoGrid(world).rgba).toEqual(albedo.rgba);
    // islets (TASK-471, ids past the islands) use palette row 0
    for (let i = 0; i < n * n; i += 97)
      expect(albedo.rgba[i * 4 + 3]).toBe(
        world.islandMap[i] <= world.islands.length ? world.islandMap[i] : 0,
      );
  });

  it('earth walls (TASK-391): per-zone weight / kind and the island wall colour', () => {
    const pal = buildGroundPalette(world);
    const srgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    // kinds: cliff = soil wall anywhere, rock = own colour, sand = coastal soil, grass = no wall
    expect(texel(pal, 0, Zone.cliff, 1).slice(2)).toEqual([255, 128]);
    expect(texel(pal, 0, Zone.rock, 1).slice(2)).toEqual([255, 255]);
    expect(texel(pal, 0, Zone.sandDry, 1).slice(2)).toEqual([255, 0]);
    expect(texel(pal, 0, Zone.grass, 1)[2]).toBe(0);
    expect(texel(pal, 0, Zone.crater, 1)[2]).toBe(0);
    // strata (TASK-613): texels 5–8 = the theme's band tones, texel 4 = their linear mean, the
    // same for every zone of a row; row 0 = the default tones
    const tone = (row: number, z: number, k: number): number[] =>
      texel(pal, row, z, WALL_TONE_TEXEL + k).slice(0, 3);
    for (let k = 0; k < WALL_TONES; k++)
      expect(tone(0, Zone.cliff, k)).toEqual(srgb(GROUND_WALL.strata.default[k]));
    const mk = world.islands.findIndex((i) => i.theme === 'marketing');
    expect(mk).toBeGreaterThanOrEqual(0);
    for (const z of [Zone.cliff, Zone.sandWet]) {
      for (let k = 0; k < WALL_TONES; k++)
        expect(tone(mk + 1, z, k)).toEqual(srgb(GROUND_WALL.strata.marketing[k]));
      const mean = wallColors('marketing').mean;
      const enc = [mean.r, mean.g, mean.b].map((c) =>
        Math.round((c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055) * 255),
      );
      expect(texel(pal, mk + 1, z, 4).slice(0, 3)).toEqual(enc);
    }
    // walls of different islands differ in colour
    const means = new Set(world.islands.map((_, i) => texel(pal, i + 1, Zone.cliff, 4).join()));
    expect(means.size).toBe(new Set(world.islands.map((i) => i.theme)).size);
  });

  it('strata tables (TASK-613): 4 tones per theme with an HSL L spread ≥ 18 %', () => {
    const light = (hex: string): number => {
      const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      return (Math.max(...v) + Math.min(...v)) / 2;
    };
    for (const tones of Object.values(GROUND_WALL.strata)) {
      expect(tones).toHaveLength(WALL_TONES);
      const ls = tones.map(light);
      expect(Math.max(...ls) - Math.min(...ls)).toBeGreaterThanOrEqual(0.18);
    }
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
