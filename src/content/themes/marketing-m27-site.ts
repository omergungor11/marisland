/**
 * Beacon Rock M27 placement and motion numbers (TASK-518, D-097): how the TASK-517 kit stands on
 * the TASK-516 anchors (world/gen/plans/marketing-m27.ts) and how the cable car, the ON AIR sign
 * and the diver move (render/beacon-lines.ts, render/culture-movers.ts). Lengths in u, times in
 * s of the sim clock.
 */
import { MARKETING_M27 as K } from './marketing-m27.ts';

export const MARKETING_M27_SITE = {
  /**
   * The M22 quick-win mast (antennaTower v1) of a stack whose top now carries an M27 piece (a
   * pylon / terminal, the dive tower, the guyed transmitter) is dropped: masts within the top's
   * usable radius + `dropAntenna` of it.
   */
  dropAntenna: 1.5,
  /** Sea billboard (billboardV2 v2, 6 x 3 u): scale = the anchor's board / the prop's, clamped. */
  seaBoard: { scale: [0.55, 1.2] as const },
  /** ON AIR (billboardV2 v3): scale = the anchor's column extent / the sign's plate column, clamped. */
  onAir: { scale: [0.6, 1.15] as const },
} as const;

export const MARKETING_M27_MOTION = {
  /**
   * M1 gondolas: `count` cabins (liveries alternate) ride the loop at `speed`, `period / count`
   * apart in time (detachable grips: they never meet). Each dwells `dwell` s at a terminal landing
   * after the bullwheel turn (at `wheelSpeed` round it), slows to `corner.speed` within
   * `corner.reach` of a mid pylon's sheave and turns there. Sway: `swingDeg` about the cable in
   * gusts (wind strength, two sines), a short pitch kick when braking / pulling away.
   */
  gondola: {
    count: 3,
    speed: 1.6,
    wheelSpeed: 0.8,
    dwell: 4,
    corner: { reach: 1.6, speed: 0.6 },
    swingDeg: K.gondola.swingDeg,
    kickDeg: 4,
    kick: 0.9,
    /** Lit-program dither fade (u) of the mover meshes. */
    fadeNear: 300,
    fadeFar: 340,
  },
  /**
   * M13 diver: one bot every `period` s from the ladder foot: climbs (`climb` s), walks out to the
   * board tip (`walk`), bounces on it (`bounce` s, `bounces` hops), takes off up `lift` u, falls on
   * a parabola into the pool centre, splashes (`splash`: rings + droplets, the fish-jump splash)
   * and swims off fading (`swim` s). The bot is a culture-mover keeper part tinted `colour`.
   */
  diver: {
    period: 40,
    /** Game hours the diver is out (none at night). */
    hours: [7, 20] as const,
    climb: 5,
    walk: 1.6,
    bounce: 1.2,
    bounces: 2,
    lift: 1.2,
    gravity: 9.8,
    swim: 3,
    colour: K.gondola.livery[0][0],
    scale: 0.85,
    splash: { life: 1.6, rings: 2, r0: 0.3, r1: 2.2, drops: 4, up: 3.2, colour: '#F4FBFF' },
  },
} as const;
