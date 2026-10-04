/**
 * Wall-clock limits for the performance smoke tests. They guard the code's speed on the dev
 * container (4 cores); CI runners (2 shared cores, vitest workers in parallel) are slower, so the
 * limits scale by `MAR_PERF_SCALE` (default 2 under `CI`, 1 locally). Set `MAR_PERF_SCALE=0`
 * to skip the assertions entirely (e.g. on a loaded machine).
 */
const raw = Number(process.env.MAR_PERF_SCALE);
export const PERF_SCALE = Number.isFinite(raw) && raw >= 0 ? raw : process.env.CI ? 2 : 1;

/** Limit in ms scaled for the machine; `Infinity` when perf checks are disabled. */
export const perfLimit = (ms: number): number => (PERF_SCALE === 0 ? Infinity : ms * PERF_SCALE);
