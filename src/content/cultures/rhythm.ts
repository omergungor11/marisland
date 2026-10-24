/**
 * Culture clock tables (M19 TASK-430, ISLAND_CULTURES §2 "Günlük ritim" / "Ritüel", §3.2).
 * Pure data: island × time of day → which culture lamp set is on, which time-gated def shows,
 * which ritual is running. `render/culture-clock.ts` evaluates it every frame from the day clock.
 *
 * Time units: `hour` / windows are game hours (0–24); `seconds` / `rampS` / `fadeS` are real
 * seconds of the running day (1 game hour = CULTURE_CLOCK.secondsPerHour s). In capture the day is
 * frozen and the culture clock advances with sim time instead (`simt`), so `time=21&simt=25` is
 * 25 s into the Launch Day Relay.
 */
import type { ThemeId } from '../../world/types.ts';
import type { RhythmSlot } from './types.ts';

export const CULTURE_CLOCK = {
  /** = Clock.dayLength / 24 (ART_BIBLE §2: a 600 s game day). */
  secondsPerHour: 25,
} as const;

/**
 * An island's own lamp set: these defs glow with the island's schedule instead of the global
 * dusk ramp (content NIGHT.lampsOn/Off). The set switches on in rings from the island centre
 * outward over `rampS` and off together over `rampS` at `off` (hours; `off` < `on` = past midnight).
 */
export interface CultureLampSet {
  defs: readonly string[];
  on: number;
  off: number;
  rampS: number;
}

export interface CultureRhythm {
  /** Named daily slots; `seconds` > 0 marks a ritual (festival phase 0..1 over that length). */
  slots: readonly RhythmSlot[];
  lamps: CultureLampSet;
}

/** Per island (theme), plan §2.1–§2.7. */
export const CULTURE_RHYTHM: Record<ThemeId, CultureRhythm> = {
  // Harbour Guild: bell at dawn, ferries leave / return, timetable lit from 20:00
  hq: {
    slots: [
      { id: 'ferryFanfare', hour: 6, seconds: 40 },
      // D-060: the mail sacks slide down the mail line in two 20 s bursts (TASK-466 mover)
      { id: 'mailHour', hour: 9, seconds: 20 },
      { id: 'coffeeQueue', hour: 12 },
      { id: 'ferriesHome', hour: 17.75 },
      { id: 'mailHour', hour: 17.75, seconds: 20 },
      { id: 'ferryFanfare', hour: 18, seconds: 40 },
      { id: 'pierLanterns', hour: 20 },
    ],
    lamps: { defs: ['timetableBoard'], on: 20, off: 6, rampS: 8 },
  },
  // Wind Gardens: kite day at 14:00, hammock hour, fairy lights in the pergolas at night
  coding: {
    slots: [
      { id: 'ducksOut', hour: 6.5 },
      { id: 'kiteDay', hour: 14, seconds: 60 },
      { id: 'hammockHour', hour: 17.5 },
      { id: 'fairyLights', hour: 19.5 },
    ],
    lamps: { defs: ['pergolaDesk'], on: 19.5, off: 5.5, rampS: 10 },
  },
  // Ember Smiths: shift siren, hammer hours, shift end, Release Night at 21:00 (40 s)
  devops: {
    slots: [
      { id: 'shiftSiren', hour: 6, seconds: 10 },
      { id: 'hammerHours', hour: 10 },
      { id: 'shiftEnd', hour: 17.5 },
      { id: 'releaseNight', hour: 21, seconds: 40 },
    ],
    lamps: { defs: ['lavaLantern'], on: 18.5, off: 6, rampS: 10 },
  },
  // Carnival Broadcasters: the marquee warms up just before the 17:30 Golden Hour Launch Show
  marketing: {
    slots: [
      { id: 'posterCrew', hour: 9 },
      { id: 'fairOpens', hour: 12 },
      { id: 'goldenHourShow', hour: 17.5, seconds: 60 },
      { id: 'neonNight', hour: 19.5 },
    ],
    lamps: { defs: ['marqueeSign'], on: 17.4, off: 1, rampS: 6 },
  },
  // Inspectors: siren test, green-light ceremony, the night bug hunt under UV lamps
  qa: {
    slots: [
      { id: 'hangarsOpen', hour: 8 },
      { id: 'sirenTest', hour: 12, seconds: 10 },
      { id: 'greenLight', hour: 16, seconds: 30 },
      { id: 'bugHunt', hour: 20.5 },
    ],
    lamps: {
      defs: ['uvLampPost', 'bugJar', 'rimPost', 'inspectionBuoy'],
      on: 20.5,
      off: 5,
      rampS: 10,
    },
  },
  // Glass & Light: Light Night at 20:00 — the glass lights ring by ring from the tree outward
  design: {
    slots: [
      { id: 'dawnGlass', hour: 6 },
      { id: 'hotShop', hour: 9 },
      { id: 'prismHour', hour: 16.5 },
      { id: 'lightNight', hour: 20, seconds: 60 },
    ],
    lamps: { defs: ['stainedScreen', 'glassOrb'], on: 20, off: 6, rampS: 30 },
  },
  // Stargazer Academy: balloon at dawn, lectures, comet night at 22:00 — the star chart and the
  // owl eyes light a quarter hour before it
  research: {
    slots: [
      { id: 'weatherBalloon', hour: 6, seconds: 60 },
      { id: 'lectures', hour: 9 },
      { id: 'goldenReading', hour: 17.75 },
      { id: 'cometNight', hour: 22, seconds: 60 },
    ],
    lamps: { defs: ['chalkboard', 'owlBox'], on: 21.75, off: 5, rampS: 10 },
  },
};

/**
 * Launch Day Relay (§3.2): every game day at `hour` the islands take their turn in relay order
 * (CultureDef.relay.order 1..7), `stepS` apart. At its step an island's emissives flash
 * (`flash` × over `attackS`, decaying to `glow` over `decayS`); the glow holds until `lengthS`,
 * then fades over `fadeS`. The relay runs on day seconds: live, its 70 s span game hours
 * 21:00–23:48; in a frozen capture it is `simt` 0–70 at `time=21`.
 */
export const RELAY = {
  hour: 21,
  stepS: 10,
  lengthS: 70,
  attackS: 0.6,
  decayS: 6,
  /** Extra emissive at the flash peak / while the relay holds (× the island's glow). */
  flash: 4,
  glow: 0.6,
  /** Structures (not foliage) of a relay island self-light at boost × `flood` (× albedo). */
  flood: 0.12,
  /** …faded in with camera distance (u): a T0/T1 read only, close-up nights keep their mood. */
  floodFrom: [180, 380] as const,
  fadeS: 15,
} as const;

/**
 * Time-gated defs (dither in / out, never a hard pop): visible inside any `windows` hour range,
 * fading over `fadeS` at each edge; rain above `rainCut[0]` fades them out by `rainCut[1]`.
 */
export interface CultureGate {
  def: string;
  windows: readonly (readonly [number, number])[];
  fadeS: number;
  rainCut: readonly [number, number];
}

export const CULTURE_GATES = {
  // §2.6: the waterfall rainbow shows at dawn (06:00–07:30) and in the prism hour (16:30–18:30)
  rainbow: {
    def: 'rainbowArc',
    windows: [
      [6, 7.5],
      [16.5, 18.5],
    ],
    fadeS: 8,
    rainCut: [0.35, 0.8],
  },
} as const satisfies Record<string, CultureGate>;

export type CultureGateId = keyof typeof CULTURE_GATES;

/** Def id → its culture lamp set's theme (prop materials switch those defs to the island clock). */
export function cultureLampTheme(defId: string): ThemeId | null {
  for (const [t, r] of Object.entries(CULTURE_RHYTHM) as [ThemeId, CultureRhythm][])
    if (r.lamps.defs.includes(defId)) return t;
  return null;
}

/**
 * The sea lamp set (TASK-474 `W:D8`): defs on the water between the islands (channel buoys) that
 * follow one world-wide schedule instead of an island's — the culture lookup picks the nearest
 * island, which is the wrong clock in mid-channel. Same window / ramp semantics as CultureLampSet.
 */
export const SEA_LAMPS: CultureLampSet = { defs: ['buoy'], on: 20, off: 6, rampS: 8 };

/** Def id → the gate that shows / hides it, or null. */
export function cultureGateOf(defId: string): CultureGateId | null {
  for (const [g, c] of Object.entries(CULTURE_GATES) as [CultureGateId, CultureGate][])
    if (c.def === defId) return g;
  return null;
}
