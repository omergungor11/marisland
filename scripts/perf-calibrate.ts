/**
 * Measures the D-132 reference numbers on this machine: the calibration kernel (best of 5) and
 * the cold cost of one archipelago world over the 30 sweep seeds. Run it quiet (load < 4):
 *   pnpm exec tsx scripts/perf-calibrate.ts
 * and paste the numbers into REF_KERNEL_MS / REF_WORLD_MS in src/test/perf.ts.
 */
import { cpus, loadavg } from 'node:os';
import { generateWorld } from '../src/world/index.ts';
import { kernelMs } from '../src/test/perf.ts';

const now = (): number => performance.now();

const before = kernelMs();
const seeds = Array.from({ length: 30 }, (_, k) => 1000 + k * 263);
const ms = seeds.map((s) => {
  const t0 = now();
  generateWorld(s);
  return now() - t0;
});
const after = kernelMs();
const sorted = [...ms].sort((a, b) => a - b);
console.info(
  JSON.stringify({
    cpu: cpus()[0]?.model,
    load: loadavg().map((l) => +l.toFixed(1)),
    kernelMs: [+before.toFixed(2), +after.toFixed(2)],
    worldMs: { median: Math.round(sorted[15]), worst: Math.round(sorted[29]) },
  }),
);
