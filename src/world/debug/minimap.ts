/**
 * Debug minimap: zones colour-coded with the bible palette, hill-shaded by
 * the heightfield, anchors and streams on top. Node-only (pngjs); used by the
 * MAR_MINIMAP test to eyeball silhouettes without a GPU (bible P2).
 */
import { PNG } from 'pngjs';
import {
  CLIFF_STRATA,
  EMISSIVE,
  FOLIAGE,
  GRASS,
  HAY,
  ROCK,
  SAND,
  WATER,
  WOOD,
} from '../../content/palette.ts';
import type { WorldData } from '../types.ts';
import { Zone } from '../types.ts';

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/** Zone id → palette colour. */
const ZONE_COLORS: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  c[Zone.deep] = hex(WATER.deep);
  c[Zone.mid] = hex(WATER.mid);
  c[Zone.shallow] = hex(WATER.shallow);
  c[Zone.lagoon] = hex(WATER.lagoon);
  c[Zone.sandWet] = hex(SAND.wet);
  c[Zone.sandDry] = hex(SAND.dry);
  c[Zone.sandBlack] = hex(SAND.black);
  c[Zone.grass] = hex(GRASS[2]);
  c[Zone.meadow] = hex(GRASS[0]);
  c[Zone.forest] = hex(FOLIAGE.deciduous[2]);
  c[Zone.field] = hex(HAY);
  c[Zone.rock] = hex(ROCK[1]);
  c[Zone.cliff] = hex(CLIFF_STRATA[1]);
  c[Zone.path] = hex(WOOD.planks);
  c[Zone.plaza] = hex(WOOD.dock);
  c[Zone.crater] = hex(EMISSIVE.lava);
  return c;
})();

export interface MinimapOptions {
  /** Pixels per grid cell. */
  scale?: number;
  /** Draw each island's bounding disc (reach). */
  discs?: boolean;
  /** Crop to a square window (world u) around (cx, cz). */
  window?: { cx: number; cz: number; half: number };
}

export function renderMinimapPng(world: WorldData, opts: MinimapOptions = {}): Buffer {
  const k = opts.scale ?? 2;
  const h = world.height;
  const n = h.n;
  let gx0 = 0;
  let gz0 = 0;
  let cells = n;
  if (opts.window) {
    const { cx, cz, half } = opts.window;
    cells = Math.min(n, Math.ceil((2 * half) / h.cellSize) + 1);
    gx0 = Math.max(0, Math.min(n - cells, Math.round((cx - half - h.originX) / h.cellSize)));
    gz0 = Math.max(0, Math.min(n - cells, Math.round((cz - half - h.originZ) / h.cellSize)));
  }
  const size = cells * k;
  const png = new PNG({ width: size, height: size });
  const px = png.data;
  const lx = -0.6;
  const lz = -0.6;
  const ly = 0.53;
  for (let wz = 0; wz < cells; wz++)
    for (let wx = 0; wx < cells; wx++) {
      const ix = gx0 + wx;
      const iz = gz0 + wz;
      const i = iz * n + ix;
      const y = h.data[i];
      const base = ZONE_COLORS[world.zone[i]] ?? [255, 0, 255];
      let shade: number;
      if (y > 0) {
        const xa = h.data[iz * n + Math.max(0, ix - 1)];
        const xb = h.data[iz * n + Math.min(n - 1, ix + 1)];
        const za = h.data[Math.max(0, iz - 1) * n + ix];
        const zb = h.data[Math.min(n - 1, iz + 1) * n + ix];
        const gx = (xb - xa) / (2 * h.cellSize);
        const gz = (zb - za) / (2 * h.cellSize);
        const len = Math.hypot(gx, 1, gz);
        const dot = (-gx * lx + ly - gz * lz) / len;
        shade = 0.55 + 0.6 * Math.max(0, dot);
      } else {
        shade = 1 + Math.max(-0.25, y / 160);
      }
      const r = Math.min(255, base[0] * shade);
      const g = Math.min(255, base[1] * shade);
      const b = Math.min(255, base[2] * shade);
      for (let dz = 0; dz < k; dz++)
        for (let dx = 0; dx < k; dx++) {
          const p = ((wz * k + dz) * size + wx * k + dx) * 4;
          px[p] = r;
          px[p + 1] = g;
          px[p + 2] = b;
          px[p + 3] = 255;
        }
    }
  const toPx = (x: number, z: number): [number, number] => [
    Math.round(((x - h.originX) / h.cellSize - gx0) * k),
    Math.round(((z - h.originZ) / h.cellSize - gz0) * k),
  ];
  const put = (x: number, y: number, c: [number, number, number]): void => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const p = (y * size + x) * 4;
    px[p] = c[0];
    px[p + 1] = c[1];
    px[p + 2] = c[2];
  };
  const dot = (x: number, z: number, c: [number, number, number], r: number): void => {
    const [cx, cy] = toPx(x, z);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) put(cx + dx, cy + dy, c);
  };
  for (const s of world.streams ?? [])
    for (let j = 0; j + 1 < s.points.length; j++) {
      const a = s.points[j];
      const b = s.points[j + 1];
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * k);
      for (let t = 0; t <= steps; t++)
        dot(a.x + ((b.x - a.x) * t) / steps, a.z + ((b.z - a.z) * t) / steps, [60, 130, 230], 1);
    }
  for (const isl of world.islands) {
    if (opts.discs) {
      const steps = Math.ceil(isl.reach * k * 6);
      for (let t = 0; t < steps; t++) {
        const a = (t / steps) * Math.PI * 2;
        const [x, y] = toPx(isl.cx + Math.cos(a) * isl.reach, isl.cz + Math.sin(a) * isl.reach);
        put(x, y, [255, 255, 255]);
      }
    }
    for (const a of Object.values(isl.anchors)) dot(a.x, a.z, [255, 40, 90], 2);
    dot(isl.peakX, isl.peakZ, [255, 255, 255], 2);
  }
  return PNG.sync.write(png);
}
