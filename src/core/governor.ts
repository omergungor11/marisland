import type { GovernorConfig } from '../content/governor.ts';

/**
 * Quality governor (ARCHITECTURE §8, TASK-191). Pure: fed frame times + timestamps, returns
 * level changes; the app applies them (renderer pixel ratio, detail-tier cap).
 *
 * Levels run from 0 (the start quality) downwards: first DPR steps (× `dprStep` down to the
 * floor), then the detail-tier cap (3 → `minTierCap`). A level drops when the rolling p90
 * frame time stays above `downP90Ms` for `downHoldSeconds`; it rises back one level only
 * after `upHoldSeconds` under `upP90Ms`, at most `maxUpgrades` times per session (so the
 * governor can never oscillate).
 */
export interface GovernorLevel {
  dpr: number;
  /** Highest detail tier rendered (3 = macro = uncapped). */
  tierCap: number;
}

export interface GovernorAction {
  kind: 'down' | 'up';
  level: number;
  from: GovernorLevel;
  to: GovernorLevel;
  /** p90 that triggered the step, ms. */
  p90: number;
  /** Timestamp of the step, s. */
  t: number;
}

export interface GovernorState {
  enabled: boolean;
  /** Why the governor is off ('' when on): capture, perf, photo, dpr. */
  reason: string;
  level: number;
  levels: readonly GovernorLevel[];
  current: GovernorLevel;
  /** Last evaluated p90, ms (NaN until the window has filled). */
  p90: number;
  upgrades: number;
  downgrades: number;
}

/** The ladder: start level, DPR steps to the floor, then tier caps down to `minTierCap`. */
export function governorLevels(
  startDpr: number,
  dprFloor: number,
  cfg: Pick<GovernorConfig, 'dprStep' | 'minTierCap'>,
  maxTier = 3,
): GovernorLevel[] {
  const levels: GovernorLevel[] = [{ dpr: startDpr, tierCap: maxTier }];
  let dpr = startDpr;
  // round to 1/100 so stepped values are stable and readable in the overlay
  while (dpr > dprFloor + 1e-6) {
    dpr = Math.max(dprFloor, Math.round(dpr * cfg.dprStep * 100) / 100);
    levels.push({ dpr, tierCap: maxTier });
  }
  for (let cap = maxTier - 1; cap >= cfg.minTierCap; cap--) levels.push({ dpr, tierCap: cap });
  return levels;
}

/** p-th percentile (0–1) of `a[0..n)`; sorts `a` in place. NaN for an empty range. */
export function percentile(a: Float64Array, n: number, p: number): number {
  if (n <= 0) return NaN;
  const s = a.subarray(0, n).sort();
  return s[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))];
}

const CAPACITY = 1024;
/** The p90 needs at least this many frames (the window stretches back for slow devices). */
const MIN_SAMPLES = 4;

export class Governor {
  readonly levels: readonly GovernorLevel[];
  private cfg: GovernorConfig;
  private times = new Float64Array(CAPACITY);
  private ms = new Float64Array(CAPACITY);
  private scratch = new Float64Array(CAPACITY);
  private head = 0;
  private count = 0;
  private level = 0;
  private upgrades = 0;
  private downgrades = 0;
  private enabledFlags = new Map<string, boolean>();
  private reasonText = '';
  /** Samples before this timestamp are ignored (settle after boot / steps). */
  private settleUntil = 0;
  private nextEval = 0;
  private overSince = NaN;
  private underSince = NaN;
  private lastP90 = NaN;

  constructor(levels: readonly GovernorLevel[], cfg: GovernorConfig, t0 = 0) {
    if (levels.length === 0) throw new Error('governor needs at least one level');
    this.levels = levels;
    this.cfg = cfg;
    this.reset(t0);
  }

  /** Turn the governor off for `reason` (capture, perf, photo …) or back on. */
  setDisabled(reason: string, off: boolean, t: number): void {
    const was = this.enabled;
    if (off) this.enabledFlags.set(reason, true);
    else this.enabledFlags.delete(reason);
    this.reasonText = Array.from(this.enabledFlags.keys()).sort().join(',');
    // re-enabling starts a fresh window: frames measured while off say nothing about now
    if (!was && this.enabled) this.reset(t);
  }

  get enabled(): boolean {
    return this.enabledFlags.size === 0;
  }

  /** Forget the window and the holds; ignore frames for `settleSeconds` (regen, restore …). */
  reset(t: number): void {
    this.head = 0;
    this.count = 0;
    this.settleUntil = t + this.cfg.settleSeconds;
    this.nextEval = this.settleUntil + this.cfg.windowSeconds;
    this.overSince = NaN;
    this.underSince = NaN;
    this.lastP90 = NaN;
  }

  get current(): GovernorLevel {
    return this.levels[this.level];
  }

  get state(): GovernorState {
    return {
      enabled: this.enabled,
      reason: this.reasonText,
      level: this.level,
      levels: this.levels,
      current: this.current,
      p90: this.lastP90,
      upgrades: this.upgrades,
      downgrades: this.downgrades,
    };
  }

  /** Feed one frame (`frameMs` = time since the previous frame) at time `t` (s). */
  sample(frameMs: number, t: number): GovernorAction | null {
    if (!this.enabled) return null;
    if (t < this.settleUntil) return null;
    if (!(frameMs > 0) || frameMs > this.cfg.outlierMs) return null;
    this.times[this.head] = t;
    this.ms[this.head] = frameMs;
    this.head = (this.head + 1) % CAPACITY;
    if (this.count < CAPACITY) this.count++;
    if (t < this.nextEval) return null;
    this.nextEval = t + this.cfg.evalInterval;

    // gather the window
    const from = t - this.cfg.windowSeconds;
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      const k = (this.head - 1 - i + CAPACITY) % CAPACITY;
      // slow devices (a few fps) still get MIN_SAMPLES frames, reaching back past the window
      if (this.times[k] < from && n >= MIN_SAMPLES) break;
      this.scratch[n++] = this.ms[k];
    }
    if (n < MIN_SAMPLES) return null;
    const p90 = percentile(this.scratch, n, 0.9);
    this.lastP90 = p90;
    const c = this.cfg;

    if (p90 > c.downP90Ms) {
      this.underSince = NaN;
      if (Number.isNaN(this.overSince)) this.overSince = t;
      if (t - this.overSince >= c.downHoldSeconds && this.level < this.levels.length - 1)
        return this.step('down', p90, t);
    } else if (p90 < c.upP90Ms) {
      this.overSince = NaN;
      if (Number.isNaN(this.underSince)) this.underSince = t;
      if (t - this.underSince >= c.upHoldSeconds && this.level > 0 && this.upgrades < c.maxUpgrades)
        return this.step('up', p90, t);
    } else {
      this.overSince = NaN;
      this.underSince = NaN;
    }
    return null;
  }

  private step(kind: 'down' | 'up', p90: number, t: number): GovernorAction {
    const from = this.current;
    this.level += kind === 'down' ? 1 : -1;
    if (kind === 'up') this.upgrades++;
    else this.downgrades++;
    const to = this.current;
    this.reset(t);
    return { kind, level: this.level, from, to, p90, t };
  }
}

/** One-line overlay text for `debug=stats`. */
export function governorLabel(s: GovernorState): string {
  const head = s.enabled ? `gov L${s.level}/${s.levels.length - 1}` : `gov off (${s.reason})`;
  const p90 = Number.isFinite(s.p90) ? `${s.p90.toFixed(1)} ms` : '–';
  return `${head}  dpr ${s.current.dpr.toFixed(2)}  Tmax ${s.current.tierCap}  p90 ${p90}  ↓${s.downgrades} ↑${s.upgrades}`;
}
