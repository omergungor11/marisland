import { CLOUDS } from '../../content/anim.ts';
import { CLOUD_BANKS } from '../../content/weather.ts';
import { createRng } from '../../core/rng.ts';

/**
 * TASK-153 cloud field (ARCHITECTURE §7 "Clouds"). Pure TS (no three) — the GLSL
 * twin lives in `shaders/chunks/cloud-shadow.glsl.ts`; `cloud-field.test.ts`
 * checks parity.
 *
 * The field is periodic: a `tile` × `tile` square of `cells`² jittered candidate
 * cells, centred on the archipelago and advected by the wind. A cell holds a cloud
 * when its integer hash is below `threshold` (chosen on the CPU so exactly
 * `count` cells are active) → every tile-sized window contains exactly `count`
 * peaks. Each peak is an ellipse blob (value 1 at the centre, 0 at the edge);
 * clouds sit at the peaks, and the shadow mask thresholds the same blobs
 * (projected along the sun, 6 u soft edge, 2-octave value-noise wobble).
 * All hashing is uint32 so CPU and GPU agree bit-for-bit.
 */
export interface CloudFieldParams {
  /** 16-bit salt (exact as a float uniform). */
  salt: number;
  /** Active-cell hash threshold in [0, 1). */
  threshold: number;
  cellSize: number;
  cells: number;
  /** Window centre (archipelago centre). */
  centreX: number;
  centreZ: number;
  /**
   * Weather cover (TASK-172): cells with threshold ≤ u < partialThreshold are drawn at
   * `partialScale` of their footprint (one cell fades in at a time as the cover rises).
   * Absent / ≤ threshold → only the seed's own cells (= SHARED.uCloudCover (0, 0)).
   */
  partialThreshold?: number;
  partialScale?: number;
}

export interface CloudBlob {
  /** Cell index (wrapped). */
  ix: number;
  iz: number;
  /** World centre of the cloud (wrapped into the window). */
  x: number;
  z: number;
  /** Altitude of the cloud base centre. */
  alt: number;
  width: number;
  yaw: number;
  variant: number;
  /** Window-edge fade 0..1 (0 at the wrap seam). */
  edge: number;
}

const [JIT0, JIT1] = CLOUDS.jitter;
const [W0, W1] = CLOUDS.width;
const [A0, A1] = CLOUDS.altitude;
export const MEAN_ALT = (A0 + A1) / 2;

/** lowbias32 integer hash (uint32 in, uint32 out). */
export function hash32(x: number): number {
  x >>>= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Hash of (ix, iz, salt, k) → [0, 1) with 24-bit resolution (exact in float32). */
export function cellU(ix: number, iz: number, salt: number, k: number): number {
  const h = hash32((ix + iz * 16 + salt * 256) >>> 0);
  return (hash32((h + k) >>> 0) >>> 8) / 16777216;
}

/**
 * Packed per-cell shape: one hash → four bytes → [jitterX, jitterZ, width, yaw] in
 * (0, 1) (8-bit steps: 0.4 u jitter, 0.07 u width, 1.4° yaw). Keeps the per-fragment
 * shadow cost at 4 hashes per active cell.
 */
export function cellBytes(ix: number, iz: number, salt: number): [number, number, number, number] {
  const h = hash32((ix + iz * 16 + salt * 256) >>> 0);
  const pk = hash32((h + 1) >>> 0);
  return [
    ((pk & 255) + 0.5) / 256,
    (((pk >>> 8) & 255) + 0.5) / 256,
    (((pk >>> 16) & 255) + 0.5) / 256,
    ((pk >>> 24) + 0.5) / 256,
  ];
}

/** Lattice hash for the wobble value noise → [0, 1). X, Z must be ≥ 0. */
export function latticeU(X: number, Z: number, salt: number): number {
  const h = hash32((Z + salt * 4096) >>> 0);
  return (hash32((h ^ X) >>> 0) >>> 8) / 16777216;
}

/** Threshold so exactly `count` of the `cells`² candidates are active. */
export function activeThreshold(salt: number, cells: number, count: number): number {
  const us: number[] = [];
  for (let iz = 0; iz < cells; iz++)
    for (let ix = 0; ix < cells; ix++) us.push(cellU(ix, iz, salt, 0));
  us.sort((a, b) => a - b);
  const n = Math.max(0, Math.min(us.length, count));
  if (n === 0) return 0;
  if (n === us.length) return 1;
  return (us[n - 1] + us[n]) / 2;
}

/**
 * Thresholds for every active-cell count 0..cells² (index = count): the weather cover picks
 * full / partial thresholds from this table. `table[count]` equals `activeThreshold(…, count)`.
 */
export function coverThresholds(salt: number, cells: number): number[] {
  const out: number[] = [];
  for (let n = 0; n <= cells * cells; n++) out.push(activeThreshold(salt, cells, n));
  return out;
}

/** Per-cell scale for a cell with hash `u` under the (full, partial) thresholds. */
export function coverScale(p: CloudFieldParams, u: number): number {
  if (u < p.threshold) return 1;
  if (u < (p.partialThreshold ?? 0)) return p.partialScale ?? 0;
  return 0;
}

export function makeFieldParams(
  salt: number,
  count: number,
  centreX: number,
  centreZ: number,
): CloudFieldParams {
  const cells = CLOUDS.cells;
  return {
    salt,
    threshold: activeThreshold(salt, cells, count),
    cellSize: CLOUDS.tile / cells,
    cells,
    centreX,
    centreZ,
  };
}

/** Seeded field for a world: count ∈ CLOUDS.count and salt from `rng.fork('clouds:field')`. */
export function fieldForSeed(seed: number, centreX: number, centreZ: number): CloudFieldParams {
  const r = createRng(seed).fork('clouds:field');
  const count = r.int(CLOUDS.count[0], CLOUDS.count[1]);
  const salt = r.int(0, 65535);
  return makeFieldParams(salt, count, centreX, centreZ);
}

/** One cloud of a horizon bank (TASK-392): fixed world placement, drawn on the cloud meshes. */
export interface BankCloud {
  x: number;
  z: number;
  alt: number;
  width: number;
  yaw: number;
  variant: number;
}

/**
 * Horizon cloud banks (content `CLOUD_BANKS`): `count` banks evenly spaced (jittered) on a ring
 * around the archipelago centre, each a row of overlapping big cumulus laid along the ring. From
 * `rng.fork('clouds:banks')` only, so the cloud field and every other stream stay unchanged.
 */
export function cloudBanks(seed: number, centreX: number, centreZ: number): BankCloud[] {
  const B = CLOUD_BANKS;
  const r = createRng(seed).fork('clouds:banks');
  const out: BankCloud[] = [];
  const slot = (Math.PI * 2) / B.count;
  const turn = r.next() * Math.PI * 2;
  for (let b = 0; b < B.count; b++) {
    const ang = turn + (b + r.range(-B.angleJitter, B.angleJitter)) * slot;
    const dist = r.range(B.distance[0], B.distance[1]);
    const n = r.int(B.clouds[0], B.clouds[1]);
    const widths: number[] = [];
    for (let k = 0; k < n; k++) widths.push(r.range(B.width[0], B.width[1]));
    // lay the row along the tangent, centred on the bank's angle
    let len = 0;
    for (let k = 0; k < n; k++) len += widths[k] * (k === 0 ? 1 : 1 - B.overlap);
    let s = -len / 2;
    const tx = -Math.sin(ang);
    const tz = Math.cos(ang);
    for (let k = 0; k < n; k++) {
      const w = widths[k];
      s += (k === 0 ? w : w * (1 - B.overlap)) / 2;
      const d = dist + r.range(-0.15, 0.15) * w;
      out.push({
        x: centreX + Math.cos(ang) * d + tx * s,
        z: centreZ + Math.sin(ang) * d + tz * s,
        alt: r.range(B.altitude[0], B.altitude[1]),
        width: w,
        // long axis along the ring (the footprint's x), a little wobble
        yaw: -Math.atan2(tz, tx) + r.range(-0.25, 0.25),
        variant: r.int(0, 2),
      });
      s += (k === 0 ? w : w * (1 - B.overlap)) / 2;
    }
  }
  return out;
}

/** Window-edge fade on a position relative to the window centre (0 outside the window). */
export function edgeFade(rx: number, rz: number, tile: number): number {
  const h = tile / 2;
  const m = Math.max(Math.abs(rx), Math.abs(rz));
  return 1 - smoothstep(h - CLOUDS.edgeFade, h, m);
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function mod(a: number, n: number): number {
  return a - n * Math.floor(a / n);
}

/** Per-cell blob description (independent of time). */
interface CellBlob {
  active: boolean;
  jx: number;
  jz: number;
  width: number;
  yaw: number;
  alt: number;
  variant: number;
}

export function cellBlob(p: CloudFieldParams, ix: number, iz: number): CellBlob {
  const s = p.salt;
  const cb = cellBytes(ix, iz, s);
  return {
    active: cellU(ix, iz, s, 0) < p.threshold,
    jx: JIT0 + (JIT1 - JIT0) * cb[0],
    jz: JIT0 + (JIT1 - JIT0) * cb[1],
    width: W0 + (W1 - W0) * cb[2],
    yaw: cb[3] * 6.283185307,
    alt: A0 + (A1 - A0) * cellU(ix, iz, s, 5),
    variant: Math.floor(cellU(ix, iz, s, 6) * 3),
  };
}

/**
 * Wind offset at time t, wrapped modulo the tile (the field is tile-periodic, so
 * this keeps the GPU uniform small and float32-exact for long sessions).
 */
export function windOffset(
  p: CloudFieldParams,
  windX: number,
  windZ: number,
  t: number,
  out: { x: number; z: number },
): { x: number; z: number } {
  const tile = p.cellSize * p.cells;
  out.x = mod(windX * CLOUDS.drift * t, tile);
  out.z = mod(windZ * CLOUDS.drift * t, tile);
  return out;
}

/** All active clouds at wind offset (ox, oz), wrapped into the window. */
export function cloudsAt(p: CloudFieldParams, ox: number, oz: number): CloudBlob[] {
  const out: CloudBlob[] = [];
  const tile = p.cellSize * p.cells;
  for (let iz = 0; iz < p.cells; iz++)
    for (let ix = 0; ix < p.cells; ix++) {
      const b = cellBlob(p, ix, iz);
      if (!b.active) continue;
      const rx = mod((ix + b.jx - p.cells / 2) * p.cellSize + ox + tile / 2, tile) - tile / 2;
      const rz = mod((iz + b.jz - p.cells / 2) * p.cellSize + oz + tile / 2, tile) - tile / 2;
      out.push({
        ix,
        iz,
        x: p.centreX + rx,
        z: p.centreZ + rz,
        alt: b.alt,
        width: b.width,
        yaw: b.yaw,
        variant: b.variant,
        edge: edgeFade(rx, rz, tile),
      });
    }
  return out;
}

/** 2D value noise on an integer-hashed lattice (coordinates must stay > −1024). */
export function valueNoise(x: number, z: number, salt: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const X = xi + 1024;
  const Z = zi + 1024;
  const a = latticeU(X, Z, salt);
  const b = latticeU(X + 1, Z, salt);
  const c = latticeU(X, Z + 1, salt);
  const d = latticeU(X + 1, Z + 1, salt);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/** Shadow / field evaluation state written by the CPU each frame (mirrors the uniforms). */
export interface CloudFrame {
  /** Wind offset (wrapped). */
  ox: number;
  oz: number;
  /** Ground offset per unit altitude along the sun: −sunDir.xz / sunDir.y. */
  sunX: number;
  sunZ: number;
  /** Footprint scale (1 = matches the clouds); 0 disables the shadow. */
  coverage: number;
}

/**
 * Evaluate the blob nearest-cells loop shared by the field and the shadow.
 * `mode` 0 = field (ellipse value 1 − dn at the cloud position, no sun offset),
 * 1 = shadow mask (projected, soft 6 u edge, wobble). Mirrors `marCloudEval` in GLSL.
 */
function evalBlobs(p: CloudFieldParams, x: number, z: number, f: CloudFrame, mode: 0 | 1): number {
  const cell = p.cellSize;
  const cells = p.cells;
  const tile = cell * cells;
  const sx = mode === 1 ? f.sunX : 0;
  const sz = mode === 1 ? f.sunZ : 0;
  // field-space query, pre-shifted by the mean-altitude sun offset
  const qx = (x - f.ox - p.centreX - sx * MEAN_ALT) / cell + 0.5 * cells;
  const qz = (z - f.oz - p.centreZ - sz * MEAN_ALT) / cell + 0.5 * cells;
  const bx = Math.floor(qx - 0.5);
  const bz = Math.floor(qz - 0.5);
  // 2×2 nearest cells suffice: a blob's reach (≤ W1/2 + blur + wobble + sun residual
  // ≈ 60 u) stays below the ≥ 0.2-cell jitter margin + half a cell.
  let m = 0;
  for (let k = 0; k < 4; k++) {
    const cx = bx + (k & 1);
    const cz = bz + (k >> 1);
    const ix = mod(cx, cells);
    const iz = mod(cz, cells);
    const cs = coverScale(p, cellU(ix, iz, p.salt, 0));
    if (cs <= 0) continue;
    const cb = cellBytes(ix, iz, p.salt);
    const jx = JIT0 + (JIT1 - JIT0) * cb[0];
    const jz = JIT0 + (JIT1 - JIT0) * cb[1];
    const width = W0 + (W1 - W0) * cb[2];
    const yaw = cb[3] * 6.283185307;
    const alt = A0 + (A1 - A0) * cellU(ix, iz, p.salt, 5);
    // cloud position relative to the window centre (unwrapped near the query)
    const rx = (cx + jx - 0.5 * cells) * cell + f.ox;
    const rz = (cz + jz - 0.5 * cells) * cell + f.oz;
    const edge = edgeFade(rx, rz, tile);
    if (edge <= 0) continue;
    const dx = x - (p.centreX + rx + sx * alt);
    const dz = z - (p.centreZ + rz + sz * alt);
    // into the cloud's frame (object yaw: x' = cos·x − sin·z rotated back)
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const lx = c * dx - s * dz;
    const lz = s * dx + c * dz;
    if (mode === 0) {
      const ax = 0.5 * width * cs;
      const az = ax * CLOUDS.aspect;
      const dn = Math.hypot(lx / ax, lz / az);
      m = Math.max(m, Math.max(0, 1 - dn) * edge);
    } else {
      const ax = 0.5 * width * CLOUDS.shadowFit * f.coverage * cs;
      const az = ax * CLOUDS.aspect;
      const dn = Math.hypot(lx / ax, lz / az);
      const sd = (dn - 1) * Math.sqrt(ax * az);
      if (sd > CLOUDS.shadowBlur / 2 + CLOUDS.wobble) continue;
      const wob =
        0.65 * valueNoise(lx * 0.11 + ix * 17, lz * 0.11 + iz * 17, p.salt) +
        0.35 * valueNoise(lx * 0.23 + 5, lz * 0.23 + 5, p.salt);
      const sdw = sd + (wob - 0.5) * 2 * CLOUDS.wobble;
      const hb = CLOUDS.shadowBlur / 2;
      m = Math.max(m, (1 - smoothstep(-hb, hb, sdw)) * edge);
    }
  }
  return m;
}

/** The cloud field: 1 at each cloud's centre, 0 at its footprint edge and beyond. */
export function cloudField(p: CloudFieldParams, x: number, z: number, f: CloudFrame): number {
  return evalBlobs(p, x, z, f, 0);
}

/** Cloud-shadow mask 0..1 at ground point (x, z) — CPU twin of `marCloudShadow`. */
export function cloudShadowMask(p: CloudFieldParams, x: number, z: number, f: CloudFrame): number {
  if (f.coverage <= 0) return 0;
  return evalBlobs(p, x, z, f, 1);
}
