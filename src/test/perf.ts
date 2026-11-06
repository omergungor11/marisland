/**
 * Wall-clock limits for the performance tests (D-132).
 *
 * The limits are numbers for the reference machine (the dev Mac, quiet, one worker). Two things
 * make a raw wall-clock check meaningless elsewhere: a slower box (CI runners) and a loaded box
 * (parallel vitest workers, other apps). So:
 * - `pnpm test` (parallel, any load): `perfLimit` is `Infinity`; perf tests still run and print
 *   their numbers, correctness checks in them still hold.
 * - `pnpm test:perf` (`PERF_STRICT=1`, one worker, only `[perf]` tests; CI runs it after the
 *   suite): the limit is `ms × machineScale()`, where the scale is a fixed calibration kernel's
 *   time on this machine right now over its time on the reference machine (never below 1). A
 *   slow or busy runner scales kernel and generation alike; a slower generator does not.
 * - `MAR_PERF_SCALE=<k>` overrides the scale by hand (`0` = no limits).
 */
const clock = (): number => performance.now();

export const PERF_STRICT = process.env.PERF_STRICT === '1';
const manual = process.env.MAR_PERF_SCALE;
const MANUAL_SCALE = manual !== undefined && manual !== '' ? Number(manual) : NaN;

/**
 * Best-of-5 kernel time (ms) on the reference machine (Apple M5 dev Mac, the box the limits were
 * set on), and the cold cost of one archipelago world there (`generateWorld`, worst of the 30
 * sweep seeds, ms). Measured 2026-11-06 at load 10-22 (kernel 14.9-16.4 ms: the short best-of
 * kernel barely moves with load; worlds 760-1280 ms worst). Re-measure both with
 * `scripts/perf-calibrate.ts` when the reference machine changes.
 */
export const REF_KERNEL_MS = 15;
export const REF_WORLD_MS = 900;

let sink = 0;
/**
 * Fixed single-thread CPU work shaped like generation's hot loops: float grid passes, an
 * object sort, a Map. (A GC-heavy variant tracked other machines worse, see D-132.)
 */
function kernel(): void {
  const n = 256;
  const a = new Float32Array(n * n);
  for (let pass = 0; pass < 8; pass++)
    for (let i = 0; i < a.length; i++) {
      const x = (i % n) * 0.37;
      const z = Math.floor(i / n) * 0.29;
      a[i] = Math.sqrt(x * x + z * z) * 0.5 + a[(i * 7919) % a.length] * 0.25 + ((x * z) % 3.1);
    }
  const items = Array.from({ length: 60000 }, (_, i) => ({
    k: Math.imul(i, 0x9e3779b1) >>> 22,
    v: i,
  }));
  items.sort((p, q) => p.k - q.k || p.v - q.v);
  const m = new Map<number, number>();
  for (const o of items) m.set(o.k, (m.get(o.k) ?? 0) + o.v + a[o.v % a.length]);
  sink += m.size;
}

/** Best-of-`runs` calibration kernel time on this machine now (ms). */
export function kernelMs(runs = 5): number {
  for (let w = 0; w < 3; w++) kernel(); // JIT tiers up over the first runs
  let best = Infinity;
  for (let r = 0; r < runs; r++) {
    const t0 = clock();
    kernel();
    best = Math.min(best, clock() - t0);
  }
  return best + sink * 0;
}

/** How much slower this machine is right now than the reference machine (≥ 1). */
export function machineScale(): number {
  if (Number.isFinite(MANUAL_SCALE) && MANUAL_SCALE > 0) return MANUAL_SCALE;
  return Math.max(1, kernelMs() / REF_KERNEL_MS);
}

/**
 * Limit in ms for a perf assertion: `Infinity` outside `PERF_STRICT` (or with
 * `MAR_PERF_SCALE=0`), else `ms` scaled by a fresh `machineScale()`.
 */
export function perfLimit(ms: number): number {
  if (MANUAL_SCALE === 0) return Infinity;
  if (!PERF_STRICT && !(MANUAL_SCALE > 0)) return Infinity;
  const k = machineScale();
  console.info(`perfLimit ${ms} ms × ${k.toFixed(2)} = ${(ms * k).toFixed(1)} ms`);
  return ms * k;
}

/**
 * Timeout for a test or hook that generates `worlds` archipelago worlds: their measured cold cost
 * on the reference machine, ×3 headroom, scaled by this machine's speed and load at collection.
 * Not a perf check (that is `perfLimit`), just "long enough to finish, short enough to catch a hang".
 */
export function sweepTimeout(worlds: number): number {
  return Math.round(Math.max(20_000, worlds * REF_WORLD_MS * 3 * machineScale()));
}
