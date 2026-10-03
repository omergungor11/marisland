import type { System } from '../core/loop.ts';

/**
 * Auto-quality governor (ARCHITECTURE §8): watches a rolling p90 frame time; if it exceeds
 * `dropAboveMs`, lower DPR first (steps of 0.25 down to 1.0), then drop post-processing.
 * One upgrade at most when p90 stays under `raiseBelowMs` for `raiseAfterS`.
 */
export interface GovernorHooks {
  getDpr(): number;
  setDpr(dpr: number): void;
  /** Drop the heavy pass (composer); returns false when nothing is left to drop. */
  dropTier(): boolean;
  now(): number;
}

export interface Governor extends System {
  readonly p50: number;
  readonly p90: number;
  readonly actions: string[];
}

export function createGovernor(
  h: GovernorHooks,
  opts = { dropAboveMs: 20, raiseBelowMs: 10, raiseAfterS: 5, window: 90 },
): Governor {
  const samples = new Float32Array(opts.window);
  let n = 0;
  let idx = 0;
  let last = -1;
  let calmSince = -1;
  let upgraded = false;
  let cooldownUntil = 0;
  const actions: string[] = [];
  const sorted = new Float32Array(opts.window);
  let p50 = 0;
  let p90 = 0;
  const compute = (): void => {
    const count = Math.min(n, opts.window);
    sorted.set(samples.subarray(0, count));
    const arr = sorted.subarray(0, count).sort();
    p50 = arr[Math.floor(count * 0.5)] ?? 0;
    p90 = arr[Math.floor(count * 0.9)] ?? 0;
  };
  return {
    name: 'governor',
    get p50() {
      return p50;
    },
    get p90() {
      return p90;
    },
    actions,
    update() {
      const t = h.now();
      if (last >= 0) {
        samples[idx] = t - last;
        idx = (idx + 1) % opts.window;
        n++;
      }
      last = t;
      if (n < opts.window || idx !== 0) return; // evaluate once per full window
      compute();
      if (t < cooldownUntil) return;
      if (p90 > opts.dropAboveMs) {
        const dpr = h.getDpr();
        if (dpr > 1.0 + 1e-3) {
          const next = Math.max(1, Math.round((dpr - 0.25) * 4) / 4);
          h.setDpr(next);
          actions.push(`dpr ${dpr}→${next} (p90 ${p90.toFixed(1)} ms)`);
        } else if (h.dropTier()) {
          actions.push(`post off (p90 ${p90.toFixed(1)} ms)`);
        }
        cooldownUntil = t + 3000;
        calmSince = -1;
      } else if (!upgraded && p90 < opts.raiseBelowMs) {
        if (calmSince < 0) calmSince = t;
        else if (t - calmSince > opts.raiseAfterS * 1000) {
          const dpr = h.getDpr();
          if (dpr < 1.5) {
            h.setDpr(Math.min(1.5, dpr + 0.25));
            actions.push(`dpr up ${dpr}→${Math.min(1.5, dpr + 0.25)}`);
          }
          upgraded = true;
        }
      } else calmSince = -1;
    },
  };
}
