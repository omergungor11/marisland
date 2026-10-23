/**
 * Culture movers (M19 TASK-431): timings, amplitudes and anchor geometry of the closed-form scenes
 * in render/culture-movers.ts. Hours are game hours (0-24; one game hour = dayLength / 24 = 25 s),
 * periods are sim seconds. Anchor offsets are in the prop's local frame (before its scale / yaw)
 * and mirror the kit geometry in geo/themes/culture-<theme>.ts; culture-movers.test.ts pins the
 * ones that the kits also publish as `userData.hooks`.
 */
import { FLOWERS, ROOFS, WALLS } from '../palette.ts';

export const CULTURE_MOVERS = {
  /** Everything is hidden (no instance written, no draw) past this camera distance, u. */
  range: 260,
  /** Seconds per game hour (clock.dayLength / 24), converts a window phase into burst seconds. */
  secondsPerHour: 25,

  /** HQ Harbour Guild: the 06:00 / 18:00 Ferry Fanfare rings the bell post. */
  bell: {
    /** Rhythm slot (content/cultures/rhythm.ts) that rings it. */
    ritual: 'ferryFanfare',
    /** Bell centre (local) per bellPost variant. */
    centre: [
      [0.7, 1.78, 0],
      [0, 1.78, 0],
    ] as const,
    rings: 3,
    period: 1.5,
    r0: 0.34,
    r1: 1.5,
    color: '#FFF4E0',
  },
  /** HQ harbourCrane: a tied mail sack dangles from the load and swings. */
  crane: {
    /** Hang point under the load (local) per variant: crate bottom / sack bottom. */
    hang: [
      [2.02, 0.56, 0],
      [2.02, 0.48, 0],
    ] as const,
    rope: 0.45,
    sack: [0.17, 0.2, 0.17] as const,
    swing: 0.32,
    period: 3.4,
    sackColor: '#F2D98A',
  },

  /**
   * HQ mailLine (TASK-466, D-060): at the two `mailHour` bursts (rhythm.ts, 09:00 / 17:45, 20 s)
   * `sacks` sacks leave the high pylon one after another and slide down the cable
   * (`mailCablePoint`, content/props-themes/m20.ts) into the catch basket at the low end.
   */
  mail: {
    ritual: 'mailHour',
    sacks: 4,
    /** Phase offset between consecutive sacks and the travel of one sack (fractions of the burst). */
    gap: 0.16,
    travel: 0.42,
    /** Hanger length below the cable and the sack size (u). */
    hanger: 0.34,
    sack: [0.24, 0.3, 0.24] as const,
    swing: 0.12,
    colors: ['#F2D98A', '#FFF4E0'] as readonly string[],
  },

  /** Coding Wind Gardens: Kite Day, 14:00, wind-gated, from the kite rack. */
  kites: {
    ritual: 'kiteDay',
    /** Rack slot indices that fly (variant 1 racks lack slot 3 anyway). */
    slots: [0, 2, 4, 5] as readonly number[],
    slotX0: -1.7,
    slotDx: 3.4 / 6,
    /** Tether anchor above the trough (local y). */
    anchorY: 1.0,
    /** Fraction of the window spent climbing / descending. */
    rise: 0.25,
    fall: 0.2,
    /** Height at full climb, u, per slot step (cycled) and the downwind drift ratio. */
    height: [7, 9.5, 8, 11] as readonly number[],
    drift: 0.7,
    size: 1.7,
    tail: 2.2,
    bob: 0.28,
    sway: 0.7,
    colors: [ROOFS[5], FLOWERS[0], FLOWERS[4], ROOFS[2]] as readonly string[],
  },

  /** DevOps Ember Works: the yard gantry lifts a container, swings it and sets it down. */
  lift: {
    period: 38,
    /** Container (l x h x w) and the quay-side column it works (yard-local). */
    size: [5, 2, 2.1] as const,
    x: [-0.8, 0.8] as const,
    z: 8.7,
    ground: 0.06,
    top: 5.4,
    cableTop: 8.85,
    /** Sling hang points on the cross beam (x = +-) and lugs on the container top (x = +-). */
    beamX: 0.9,
    lugX: 1.6,
    /** Phase fractions: rest, rise, swing, lower (ends at 1). */
    rise: [0.12, 0.38] as const,
    swing: [0.38, 0.62] as const,
    lower: [0.62, 0.88] as const,
    colors: ['#F5C84C', '#E35D6A', '#5DA9E9'] as readonly string[],
    lamp: '#FFC870',
  },
  /** DevOps signalHorn: rings out of both horn mouths at the 06:00 siren and Release Night. */
  horn: {
    rituals: ['shiftSiren', 'releaseNight'] as readonly string[],
    /** The one that also lights the lift's lamp. */
    lampRitual: 'releaseNight',
    /** Mouths (local) and their unit directions, big horn then the treble one. */
    mouths: [
      { at: [0.9, 2.05, 0.9], dir: [0.623, 0.256, 0.739] },
      { at: [-0.7, 1.95, 0.7], dir: [-0.623, 0.256, 0.739] },
    ] as const,
    rings: 3,
    period: 1.1,
    r0: 0.22,
    r1: 0.8,
    travel: 1.8,
    color: '#FFF4E0',
  },

  /** Marketing Carnival: searchlight sweep at night, confetti at the 17:30 show. */
  beams: {
    /** Visible between these hours (also gated by the lighthouse-beam night ramp). */
    on: 17.5,
    off: 23,
    scale: 0.85,
    flare: 0.7,
    /** Spin-axis tilt per beam of a pair, rad (the beam sweeps +-tilt of elevation). */
    tilt: [0.95, 1.2] as const,
    yaw: [0.5, -0.6] as const,
    /** searchlightPair: projector x = +-1.05, pivot y, lens offset along the barrel, lean per variant. */
    pivot: [1.05, 1.3] as const,
    lensAt: 0.52,
    lean: [0.38, 0.06] as const,
    /** Beam axis elevation (sin) fade-in [gone, full]: the low half of the sweep would rake the
     *  lawn and the lens (TASK-453b), so the cone fades out as it dips below the horizon. */
    dip: [-0.3, 0.0] as const,
  },
  confetti: {
    ritual: 'goldenHourShow',
    /** Ritual length (rhythm `seconds`): the burst is its first `life` seconds. */
    showSeconds: 60,
    /** Muzzle (local) and barrel direction of the confettiCannon. */
    muzzle: [0, 1.1, 0.39] as const,
    dir: [0, 0.741, 0.671] as const,
    pieces: 24,
    /** Burst length at the window's end, s. */
    life: 6,
    speed: [5, 9] as const,
    spread: 0.55,
    tau: 0.9,
    fall: 0.9,
    size: 0.27,
    colors: [
      '#E35D6A',
      '#F5C84C',
      '#5DA9E9',
      '#7FD8B3',
      '#9C8CE0',
      '#FF8FB1',
      WALLS[0],
    ] as readonly string[],
  },

  /** QA Test Factory: the green-light flag climbs the mast, ants march by the bug zoo. */
  flag: {
    ritual: 'greenLight',
    pole: [0, 0.35, 0] as const,
    topY: 1.55,
    climb: 0.35,
    size: 0.6,
    color: '#FF7A5C',
  },
  ants: {
    count: 9,
    /** Trail polyline in the story-spot frame (x, z), nose to tail. */
    path: [
      [-1.3, 0.1],
      [-0.5, 0.35],
      [0.4, -0.1],
      [1.3, 0.25],
    ] as const,
    speed: 0.16,
    size: 0.07,
    lift: 0.03,
    color: '#3A3F4D',
  },

  /** Design Glass & Light: prism light patches slide and stretch with the sun. */
  patches: {
    /** Top of the prism sculpture (local y) the light leaves from. */
    top: 1.9,
    /** Sun elevation below this (rad) hides the patches. */
    minElev: 0.06,
    /** Along-sun stretch = base / sin(elevation), clamped. */
    base: 0.8,
    maxStretch: 3.4,
    width: 0.8,
    /** Colour triple per prism variant (variant % 3), spread across the patch. */
    families: [
      [FLOWERS[0], FLOWERS[3], ROOFS[5]],
      [ROOFS[3], ROOFS[0], ROOFS[1]],
      [ROOFS[6], ROOFS[5], ROOFS[4]],
    ] as readonly (readonly string[])[],
    pulse: 0.05,
    pulsePeriod: 4.5,
    /** Share of white mixed into the family colour: the patch is tinted light, not paint (TASK-453b). */
    lighten: 0.45,
  },

  /** Research Star Academy: the 06:00 weather balloon leaves the cart and rises out of view. */
  balloon: {
    ritual: 'weatherBalloon',
    /** Release point (cart-local) = the tethered balloon's top-up spot. */
    from: [0.05, 2.05, 0] as const,
    rise: 70,
    drift: 22,
    radius: [0.42, 0.52, 0.42] as const,
    string: 2.4,
    color: '#FAFAF5',
    payload: '#FFF4E0',
    wobble: 0.35,
  },
} as const;
