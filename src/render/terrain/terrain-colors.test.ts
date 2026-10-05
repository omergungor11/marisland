import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateWorld } from '../../world/index.ts';
import { TERRAIN_AO, TERRAIN_FX, TERRAIN_JITTER } from '../../content/terrain.ts';
import { Zone } from '../../world/types.ts';
import { THEMES } from '../../content/themes/index.ts';
import { DEFAULT_GROUND, DETAIL_LAYER_IDS, MATERIAL_LAYERS } from '../../content/ground.ts';
import type { GroundSpec } from '../../content/ground.ts';
import {
  PALETTE_TEXELS,
  TerrainClass,
  buildAlbedoGrid,
  buildColorGrid,
  buildGroundPalette,
  faceColor,
  faceHash,
  fillAlbedoGrid,
  strataAt,
  type TerrainColorGrid,
} from './terrain-colors.ts';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const _hsl = { h: 0, s: 0, l: 0 };
const _rgb = { r: 0, g: 0, b: 0 };
const _acc = new THREE.Color();
const _tmp = new THREE.Color();

/**
 * The pre-TASK-211 implementation (Color-object round trips), kept as the parity reference.
 * Face colour (linear RGB) into `out`: mean of the vertex base colours (cliff
 * vertices resolved to strata at the face centre), then seeded jitter (hue ±4°,
 * L ±3 %), AO as a lightness multiplier, and the land L floor.
 * `jitterHash` = 0 disables jitter (skirts).
 */
function faceColorReference(
  grid: TerrainColorGrid,
  i0: number,
  i1: number,
  i2: number,
  cx: number,
  cy: number,
  cz: number,
  jitterHash: number,
  out: THREE.Color,
): THREE.Color {
  const { rgb, cliff, ao, cls } = grid;
  _acc.setRGB(0, 0, 0);
  const idx = [i0, i1, i2];
  const c0 = cls[i0];
  const c1 = cls[i1];
  const c2 = cls[i2];
  let wsum = 0;
  // Border blend: weight = (vertices sharing this class)^p. Soft grounds (sand ↔ grass)
  // use p = 1 (lone vertex 20 %); rock / cliff use p = 2 (lone vertex 11 %) so outcrops
  // stay crisp instead of smearing grey into the grass.
  const hard =
    c0 === TerrainClass.rock ||
    c1 === TerrainClass.rock ||
    c2 === TerrainClass.rock ||
    c0 === TerrainClass.cliff ||
    c1 === TerrainClass.cliff ||
    c2 === TerrainClass.cliff;
  for (let k = 0; k < 3; k++) {
    const i = idx[k];
    const ck = cls[i];
    const same = (ck === c0 ? 1 : 0) + (ck === c1 ? 1 : 0) + (ck === c2 ? 1 : 0);
    const w = hard ? same * same : same;
    if (cliff[i] && cy > 0) {
      strataAt(cx, cy, cz, _tmp);
    } else {
      _tmp.setRGB(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    }
    _acc.r += _tmp.r * w;
    _acc.g += _tmp.g * w;
    _acc.b += _tmp.b * w;
    wsum += w;
  }
  _acc.multiplyScalar(1 / wsum);
  const occ = (ao[i0] + ao[i1] + ao[i2]) / 3;
  _acc.getHSL(_hsl, THREE.SRGBColorSpace);
  let hue = _hsl.h;
  let l = _hsl.l;
  if (jitterHash !== 0) {
    const a = (jitterHash & 0xffff) / 65535;
    const b = (jitterHash >>> 16) / 65535;
    hue += ((a * 2 - 1) * TERRAIN_JITTER.hueDeg) / 360;
    l += (b * 2 - 1) * TERRAIN_JITTER.lightness;
  }
  hue = hue - Math.floor(hue);
  out.setHSL(hue, _hsl.s, clamp01(l), THREE.SRGBColorSpace);
  // AO: scale the sRGB value (not HSL L, which would raise chroma and turn sand
  // orange) and lean the shade slightly cool (ART_BIBLE P4).
  out.getRGB(_rgb, THREE.SRGBColorSpace);
  const o = 1 - occ;
  _rgb.r *= occ * (1 - TERRAIN_AO.coolShift * o);
  _rgb.g *= occ;
  _rgb.b *= occ * (1 + TERRAIN_AO.coolShift * o);
  out.setRGB(clamp01(_rgb.r), clamp01(_rgb.g), clamp01(_rgb.b), THREE.SRGBColorSpace);
  if (cy > 0) {
    out.getHSL(_hsl, THREE.SRGBColorSpace);
    if (_hsl.l < TERRAIN_FX.minLandL)
      out.setHSL(_hsl.h, _hsl.s, TERRAIN_FX.minLandL, THREE.SRGBColorSpace);
  }
  return out;
}

describe('faceColor fast path (TASK-211)', () => {
  it('is bit-identical to the Color-object implementation', () => {
    const world = generateWorld(1001);
    const grid = buildColorGrid(world);
    const h = world.height;
    const n = h.n;
    const a = new THREE.Color();
    const b = new THREE.Color();
    let cliffFaces = 0;
    let checked = 0;
    for (let iz = 0; iz < n - 1; iz += 1)
      for (let ix = 0; ix < n - 1; ix += 3) {
        const i0 = iz * n + ix;
        const i1 = i0 + 1;
        const i2 = i0 + n;
        const y = (h.data[i0] + h.data[i1] + h.data[i2]) / 3;
        const x = h.originX + ix * h.cellSize;
        const z = h.originZ + iz * h.cellSize;
        for (const hash of [0, faceHash(world.seed, i0 * 2, 0), faceHash(world.seed, i0, 1)]) {
          faceColorReference(grid, i0, i1, i2, x, y, z, hash, a);
          faceColor(grid, i0, i1, i2, x, y, z, hash, b);
          if (!Object.is(a.r, b.r) || !Object.is(a.g, b.g) || !Object.is(a.b, b.b))
            throw new Error(`face ${i0} hash ${hash}: ${a.toArray()} vs ${b.toArray()}`);
          checked++;
        }
        if (grid.cliff[i0] || grid.cliff[i1] || grid.cliff[i2]) cliffFaces++;
      }
    expect(checked).toBeGreaterThan(100_000);
    expect(cliffFaces).toBeGreaterThan(0);
  });
});

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

  it('keeps today’s colours without theme overrides (no jitter; macro variation only)', () => {
    // legacy per-sample colour × AO (faceColor's arithmetic without jitter) vs the albedo
    const legacy = buildColorGrid(world);
    const enc = (c: number): number =>
      c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n * n; i++) {
      if (world.height.data[i] <= 0 || world.zone[i] === Zone.cliff) continue;
      for (let c = 0; c < 3; c++) {
        sum += Math.abs(albedo.rgba[i * 4 + c] / 255 - enc(legacy.rgb[i * 3 + c]) * legacy.ao[i]);
        count++;
      }
    }
    expect(count).toBeGreaterThan(10_000);
    expect(sum / count).toBeLessThan(0.03);
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
