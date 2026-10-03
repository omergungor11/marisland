/**
 * Debug minimap: zones colour-coded with the bible palette, hill-shaded by
 * the heightfield, anchors and streams on top; settlements overlay: lots
 * (rects, white door pixel), landmarks (yellow stars), paths (brown), fences,
 * docks, moorings, fixtures (yellow dots), boat routes (white dashed). Node-only (pngjs); used by the
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
import type { Polyline, WorldData, XZ } from '../types.ts';
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
  const line = (a: XZ, b: XZ, c: [number, number, number], r: number, dash = 0): void => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * k));
    for (let t = 0; t <= steps; t++) {
      if (dash > 0 && Math.floor(((t / steps) * Math.hypot(b.x - a.x, b.z - a.z)) / dash) % 2 === 1)
        continue;
      dot(a.x + ((b.x - a.x) * t) / steps, a.z + ((b.z - a.z) * t) / steps, c, r);
    }
  };
  const poly = (p: Polyline, c: [number, number, number], r: number, dash = 0): void => {
    const pts = p.points;
    for (let j = 0; j + 1 < pts.length; j++) line(pts[j], pts[j + 1], c, r, dash);
    if (p.closed && pts.length > 2) line(pts[pts.length - 1], pts[0], c, r, dash);
  };
  for (const f of world.fences ?? []) poly(f, [120, 80, 40], 0);
  for (const p of world.paths ?? [])
    poly(
      p,
      p.kind === 'boardwalk' ? [200, 150, 90] : p.kind === 'stair' ? [150, 60, 30] : [110, 70, 35],
      0,
    );
  for (const r of world.boatRoutes ?? []) poly(r, [255, 255, 255], 0, 3);
  for (const d of world.docks ?? []) {
    const L = d.segments * 2;
    const end = { x: d.x + Math.cos(d.rotY) * L, z: d.z + Math.sin(d.rotY) * L };
    line(d, end, [150, 95, 50], 1);
  }
  const rect = (
    x: number,
    z: number,
    rotY: number,
    w: number,
    dd: number,
    c: [number, number, number],
  ): void => {
    const cs = Math.cos(rotY);
    const sn = Math.sin(rotY);
    const steps = Math.max(2, Math.ceil(Math.max(w, dd) * k * 2));
    for (let a = 0; a <= steps; a++)
      for (let b = 0; b <= steps; b++) {
        const u = (a / steps - 0.5) * w;
        const v = (b / steps - 0.5) * dd;
        const [px0, py0] = toPx(x - u * sn + v * cs, z + u * cs + v * sn);
        put(px0, py0, c);
      }
    // door marker
    const [dx, dy] = toPx(x + cs * (dd / 2), z + sn * (dd / 2));
    put(dx, dy, [255, 255, 255]);
  };
  for (const l of world.lots ?? [])
    rect(
      l.x,
      l.z,
      l.rotY,
      l.w,
      l.d,
      l.kind === 'stall' ? [240, 120, 90] : l.kind === 'hut' ? [200, 120, 60] : [235, 225, 210],
    );
  for (const m of world.moorings ?? [])
    rect(
      m.x,
      m.z,
      m.rotY,
      m.defId === 'sailboat' ? 1.6 : 1,
      m.defId === 'sailboat' ? 5 : 2.4,
      [250, 250, 250],
    );
  for (const f of world.fixtures ?? []) dot(f.x, f.z, [255, 210, 60], 1);
  const star = (x: number, z: number, c: [number, number, number]): void => {
    for (let a = 0; a < 5; a++) {
      const t = (a / 5) * Math.PI * 2 - Math.PI / 2;
      line({ x, z }, { x: x + Math.cos(t) * 4, z: z + Math.sin(t) * 4 }, c, 0);
    }
    dot(x, z, c, 1);
  };
  for (const lm of world.landmarks ?? []) star(lm.x, lm.z, [255, 230, 40]);
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
