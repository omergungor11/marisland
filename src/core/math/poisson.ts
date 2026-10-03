import type { Rng } from '../rng.ts';

/**
 * Bridson Poisson-disc sampling in a rectangle. Returns [x0, y0, x1, y1, …].
 * `accept(x, y)` lets callers reject candidates (zone/slope/occupancy) before
 * they become active samples, so rules with sparse valid area stay fast.
 */
export function poissonDisc(
  rng: Rng,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  radius: number,
  accept: (x: number, y: number) => boolean,
  maxSamples = 50000,
  k = 12,
): Float32Array {
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0) return new Float32Array(0);
  const cell = radius / Math.SQRT2;
  const gw = Math.ceil(w / cell) + 1;
  const gh = Math.ceil(h / cell) + 1;
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts: number[] = [];
  const active: number[] = [];
  const r2 = radius * radius;

  const fits = (x: number, y: number): boolean => {
    const gx = Math.floor((x - minX) / cell);
    const gy = Math.floor((y - minY) / cell);
    for (let j = Math.max(0, gy - 2); j <= Math.min(gh - 1, gy + 2); j++) {
      for (let i = Math.max(0, gx - 2); i <= Math.min(gw - 1, gx + 2); i++) {
        const p = grid[j * gw + i];
        if (p < 0) continue;
        const dx = pts[p * 2] - x;
        const dy = pts[p * 2 + 1] - y;
        if (dx * dx + dy * dy < r2) return false;
      }
    }
    return true;
  };
  const add = (x: number, y: number): void => {
    const idx = pts.length / 2;
    pts.push(x, y);
    grid[Math.floor((y - minY) / cell) * gw + Math.floor((x - minX) / cell)] = idx;
    active.push(idx);
  };

  // Seed on a jittered grid (plus a few random throws) so narrow valid bands — beaches,
  // field strips — always receive at least one active sample.
  const gridStep = Math.max(radius * 2, Math.min(w, h) / 48);
  for (let gy = minY + gridStep * 0.5; gy < maxY; gy += gridStep) {
    for (let gx = minX + gridStep * 0.5; gx < maxX; gx += gridStep) {
      const x = gx + (rng.next() - 0.5) * gridStep;
      const y = gy + (rng.next() - 0.5) * gridStep;
      if (x < minX || y < minY || x >= maxX || y >= maxY) continue;
      if (accept(x, y) && fits(x, y)) add(x, y);
    }
  }
  const seedTries = Math.max(8, Math.ceil((w * h) / (radius * radius * 40)));
  for (let t = 0; t < seedTries; t++) {
    const x = minX + rng.next() * w;
    const y = minY + rng.next() * h;
    if (accept(x, y) && fits(x, y)) add(x, y);
  }

  while (active.length && pts.length / 2 < maxSamples) {
    const ai = Math.floor(rng.next() * active.length);
    const p = active[ai];
    const px = pts[p * 2];
    const py = pts[p * 2 + 1];
    let found = false;
    for (let n = 0; n < k; n++) {
      const a = rng.next() * Math.PI * 2;
      const d = radius * (1 + rng.next());
      const x = px + Math.cos(a) * d;
      const y = py + Math.sin(a) * d;
      if (x < minX || y < minY || x >= maxX || y >= maxY) continue;
      if (!fits(x, y) || !accept(x, y)) continue;
      add(x, y);
      found = true;
      break;
    }
    if (!found) {
      active[ai] = active[active.length - 1];
      active.pop();
    }
  }
  return Float32Array.from(pts);
}
