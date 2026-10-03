/**
 * Quality governor thresholds (ARCHITECTURE §8 "Auto quality"). The governor is the safety
 * net for budget breaches on real GPUs: DPR first, then the detail-tier cap. Off in capture,
 * `?perf=1` and photo-mode freeze.
 */
export interface GovernorConfig {
  /** Rolling window the p90 is taken over, s. */
  windowSeconds: number;
  /** p90 is re-evaluated at this interval, s (sorting the window every frame is wasteful). */
  evalInterval: number;
  /** Downgrade when p90 > this, ms … */
  downP90Ms: number;
  /** … continuously for at least this long, s. */
  downHoldSeconds: number;
  /** Upgrade (once per session) when p90 < this, ms … */
  upP90Ms: number;
  /** … continuously for at least this long, s. */
  upHoldSeconds: number;
  /** One DPR step multiplies the device pixel ratio by this. */
  dprStep: number;
  /** Lowest detail-tier cap the governor may impose (3 = macro = uncapped). */
  minTierCap: number;
  /** Frame times above this (tab switch, GC pause, debugger) are ignored, ms. */
  outlierMs: number;
  /** Ignore the first seconds after boot / regen / context restore / a governor step, s. */
  settleSeconds: number;
  /** Upgrades allowed per session (ARCHITECTURE §8: at most once). */
  maxUpgrades: number;
}

export const GOVERNOR: GovernorConfig = {
  windowSeconds: 1,
  evalInterval: 0.25,
  downP90Ms: 20,
  downHoldSeconds: 2,
  upP90Ms: 12,
  upHoldSeconds: 10,
  dprStep: 0.85,
  minTierCap: 2,
  outlierMs: 1000,
  settleSeconds: 1.5,
  maxUpgrades: 1,
};

/** DPR floor per quality: high 1.75 → 1.5 (ARCHITECTURE §8) and one more step to 1.25. */
export const GOVERNOR_DPR_FLOOR: Record<'low' | 'medium' | 'high', number> = {
  low: 0.75,
  medium: 1,
  high: 1.25,
};

/** `?perf=1` flight (ARCHITECTURE §8 "Measurement"): camera presets visited evenly over `seconds`. */
export const PERF_PATH = {
  seconds: 10,
  presets: ['overview', 'village', 'macro-beach', 'overview'] as readonly string[],
  /** Capture mode (`freeze=1`) has no RAF: the path is stepped at this rate instead. */
  manualFps: 30,
};
