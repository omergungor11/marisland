import type { ThemeId } from '../world/types.ts';
import { CULTURES } from '../content/cultures/index.ts';
import {
  CULTURE_CLOCK,
  CULTURE_GATES,
  CULTURE_RHYTHM,
  RELAY,
  SEA_LAMPS,
  type CultureGateId,
} from '../content/cultures/rhythm.ts';
import { CULTURE_SLOTS, GATES, SHARED } from './uniforms.ts';
import { fanSpinExtra } from './qa-proving-motion.ts';

/**
 * Culture clock (M19 TASK-430): evaluates the rhythm tables (content/cultures/rhythm.ts) from the
 * day clock each frame and writes the shared culture uniforms — per-island culture lamp level and
 * Launch Day Relay boost (`uCultureLamps`), island discs (`uCultureIsle`), relay phase
 * (`uFestival`) and the time gates (`GATES`). The lit prop program reads them in its existing
 * emissive branch (materials/factory.ts): 0 new programs, 0 draw calls.
 *
 * Day seconds `D` = hour × secondsPerHour + seconds since the hour last changed: with the day
 * running this is the day clock itself; with the day frozen (capture `freeze=1`, photo mode) the
 * culture clock keeps running on sim time, so `time=21&simt=25` is 25 s into the relay — a
 * closed-form function of the URL.
 */

/** One island slot of the clock (world.islands order). */
export interface CultureIsle {
  theme: ThemeId;
  cx: number;
  cz: number;
  reach: number;
}

export interface CultureFestival {
  /** Rhythm slot id of the ritual (e.g. 'kiteDay'). */
  id: string;
  /** 0..1 over the ritual's `seconds`. */
  phase: number;
}

export interface CultureState {
  /** Day seconds (0 … 24 × secondsPerHour). */
  day: number;
  /** Per theme: culture lamp set 0..1. */
  lamps: Record<ThemeId, number>;
  /** The sea lamp set (channel buoys, SEA_LAMPS) 0..1. */
  sea: number;
  /** Per theme: relay emissive boost (0 outside the relay). */
  boost: Record<ThemeId, number>;
  /** Per theme: the ritual running now, or null. */
  festival: Record<ThemeId, CultureFestival | null>;
  /** Relay phase 0..1 over RELAY.lengthS (0 outside) and the active step (order − 1; −1 outside). */
  relay: { phase: number; step: number };
  /** Per gate: visibility 0..1. */
  gates: Record<CultureGateId, number>;
}

/** Public handle (WorldView.culture): other systems (movers, life) read `state`. */
export interface CultureClock {
  readonly state: CultureState;
  update(hour: number, time: number, rain: number): void;
  /** Reset the shared uniforms (world dispose). */
  dispose(): void;
}

const SPH = CULTURE_CLOCK.secondsPerHour;
const DAY = 24 * SPH;
const THEMES = Object.keys(CULTURE_RHYTHM) as ThemeId[];

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** Seconds from `fromS` forward to `day` on the 24 h circle (0 … DAY). */
const since = (day: number, fromS: number): number => (((day - fromS) % DAY) + DAY) % DAY;
/** Smooth window [a, b) (seconds on the day circle) with `fade` s edges inside it. */
function windowLevel(day: number, a: number, b: number, fade: number): number {
  const len = since(b, a);
  const t = since(day, a);
  if (t >= len) return 0;
  return Math.min(smooth(t / fade), smooth((len - t) / fade));
}

/** Relay envelope of the island with relay `order` at day seconds `day` (0 outside). */
export function relayBoost(day: number, order: number): number {
  const t = since(day, RELAY.hour * SPH);
  const start = (order - 1) * RELAY.stepS;
  const u = t - start;
  if (u < 0 || t >= RELAY.lengthS + RELAY.fadeS) return 0;
  const attack = smooth(u / RELAY.attackS);
  const settle = smooth((u - RELAY.attackS) / RELAY.decayS);
  const level = attack * (RELAY.flash + (RELAY.glow - RELAY.flash) * settle);
  return level * (1 - smooth((t - RELAY.lengthS) / RELAY.fadeS));
}

export function createCultureState(): CultureState {
  const per = <T>(v: () => T): Record<ThemeId, T> =>
    Object.fromEntries(THEMES.map((t) => [t, v()])) as Record<ThemeId, T>;
  return {
    day: 0,
    lamps: per(() => 0),
    sea: 0,
    boost: per(() => 0),
    festival: per<CultureFestival | null>(() => null),
    relay: { phase: 0, step: -1 },
    gates: Object.fromEntries(Object.keys(CULTURE_GATES).map((g) => [g, 0])) as Record<
      CultureGateId,
      number
    >,
  };
}

/** Pure: the culture state at day seconds `day` with rain 0..1 (writes `out`). */
export function evalCulture(day: number, rain: number, out: CultureState): CultureState {
  const d = ((day % DAY) + DAY) % DAY;
  out.day = d;
  for (const t of THEMES) {
    const r = CULTURE_RHYTHM[t];
    const order = CULTURES[t].relay.order;
    const L = r.lamps;
    const lamp = windowLevel(d, L.on * SPH, L.off * SPH, L.rampS);
    out.lamps[t] = lamp;
    out.boost[t] = relayBoost(d, order);
    let fest: CultureFestival | null = null;
    for (const s of r.slots) {
      if (!s.seconds) continue;
      const u = since(d, s.hour * SPH);
      if (u < s.seconds) fest = { id: s.id, phase: u / s.seconds };
    }
    out.festival[t] = fest;
  }
  out.sea = windowLevel(d, SEA_LAMPS.on * SPH, SEA_LAMPS.off * SPH, SEA_LAMPS.rampS);
  const rt = since(d, RELAY.hour * SPH);
  if (rt < RELAY.lengthS) {
    out.relay.phase = rt / RELAY.lengthS;
    out.relay.step = Math.min(6, Math.floor(rt / RELAY.stepS));
  } else {
    out.relay.phase = 0;
    out.relay.step = -1;
  }
  for (const g of Object.keys(CULTURE_GATES) as CultureGateId[]) {
    const c = CULTURE_GATES[g];
    let v = 0;
    for (const [a, b] of c.windows) v = Math.max(v, windowLevel(d, a * SPH, b * SPH, c.fadeS));
    const wet = clamp01((rain - c.rainCut[0]) / (c.rainCut[1] - c.rainCut[0]));
    out.gates[g] = v * (1 - smooth(wet));
  }
  return out;
}

/** The world's culture clock: island slots → uniforms. Slots past the island count stay off. */
export function createCultureClock(
  isles: readonly CultureIsle[],
  startHour: number,
  startTime: number,
): CultureClock {
  const state = createCultureState();
  const n = Math.min(isles.length, CULTURE_SLOTS);
  for (let i = 0; i < CULTURE_SLOTS; i++) {
    const isle = isles[i];
    SHARED.uCultureIsle.value[i].set(
      isle ? isle.cx : 0,
      isle ? isle.cz : 0,
      isle ? 1 / Math.max(isle.reach, 1) : 0,
      i < n ? 1 : 0,
    );
  }
  // the hour at build time counts as "unchanged" so a frozen day runs on sim time from the start
  let lastHour = startHour;
  let base = startTime;
  return {
    state,
    update(hour, time, rain) {
      if (hour !== lastHour) {
        lastHour = hour;
        base = time;
      }
      if (time < base) base = time;
      evalCulture(hour * SPH + (time - base), rain, state);
      let any = 0;
      for (let i = 0; i < n; i++) {
        const t = isles[i].theme;
        SHARED.uCultureLamps.value[i].set(state.lamps[t], state.boost[t]);
        if (state.boost[t] > 0) any = 1;
      }
      SHARED.uFestival.value.set(state.relay.phase, state.relay.step, any);
      SHARED.uSeaLamps.value = state.sea;
      SHARED.uFanSpin.value = fanSpinExtra(state.day);
      for (const g of Object.keys(GATES) as CultureGateId[]) GATES[g].value = state.gates[g];
    },
    dispose() {
      for (const v of SHARED.uCultureIsle.value) v.set(0, 0, 0, 0);
      for (const v of SHARED.uCultureLamps.value) v.set(0, 0);
      SHARED.uFestival.value.set(0, -1, 0);
      SHARED.uSeaLamps.value = 0;
      SHARED.uFanSpin.value = 0;
      for (const g of Object.keys(GATES) as CultureGateId[]) GATES[g].value = 1;
    },
  };
}
