import { defineConfig } from 'vitest/config';
import { sweepTimeout } from './src/test/perf.ts';

// D-132: a test may generate up to 50 worlds (the campus sweep); its timeout is their measured
// cost on the reference machine ×3, scaled by this machine's speed and load (calibrated once).
const timeout = process.env.VITEST ? sweepTimeout(50) : 20000;

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5173, strictPort: false },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    testTimeout: timeout,
    hookTimeout: timeout,
    tags: [
      {
        name: 'perf',
        description: 'Wall-clock limit; asserted only under PERF_STRICT=1 (pnpm test:perf, D-132)',
      },
    ],
  },
});
