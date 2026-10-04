import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateWorld } from '../../world/index.ts';
import { TERRAIN_AO, TERRAIN_FX, TERRAIN_JITTER } from '../../content/terrain.ts';
import {
  TerrainClass,
  buildColorGrid,
  faceColor,
  faceHash,
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
