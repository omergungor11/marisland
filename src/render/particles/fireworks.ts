import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import type { Quality } from '../../core/params.ts';
import { createRng } from '../../core/rng.ts';
import { CULTURE_CLOCK } from '../../content/cultures/rhythm.ts';
import { FIREWORKS as FW } from '../../content/signature.ts';
import { THEMES } from '../../content/themes/index.ts';
import type { WorldData } from '../../world/types.ts';
import { createBursts, type BurstAnchor } from './bursts.ts';
import { fireworkPlan, type FireworkPlan } from './firework-plan.ts';

/**
 * Fireworks (M23 TASK-490, W:G7; TASK-496): after the relay's last step and the Comet Night, the HQ
 * harbour fires six shells in the culture accent colours: a rocket streak, a burst of streaking sparks
 * (peony) or of long sagging gold-tinted trails (willow) around a white flash, and the
 * burst's mirror image shimmering on the sea between it and the camera. One extra instanced draw on the shared creature program (the click-burst glyph mesh,
 * emissive so it glows and blooms at night), nothing alive = no draw.
 *
 * Closed form of the culture clock: the show second is `day − start` on the 24 h circle, so every
 * particle's age is a function of the clock (capture `time=21&simt=85` is the first second). The whole
 * show is spawned when the clock first lands in its window (or jumps), with birth times relative to
 * the show start — a frozen frame at any show second sees the same sparks. Rain fades it out.
 */
export interface Fireworks {
  readonly mesh: THREE.InstancedMesh | null;
  /** Per frame: culture-clock day seconds, engine time, rain 0..1; returns particles alive. */
  update(time: number, day: number, rain: number, camera: THREE.Camera): number;
  readonly capacity: number;
}

/** Slip (s) between the clock and the spawned show beyond which the show is spawned again. */
const RESYNC = 1;
const SPH = CULTURE_CLOCK.secondsPerHour;
const DAY = 24 * SPH;
const START = FW.start.hour * SPH + FW.start.afterS;
/** Seconds since the show started on the day circle (0 … DAY). */
export const showSecond = (day: number): number => (((day - START) % DAY) + DAY) % DAY;
/** The show runs (bursts + their tail) at day seconds `day`. */
export const showActive = (day: number): boolean => showSecond(day) < FW.lengthS + FW.tailS;

const mixWhite = (hex: string, k: number): string =>
  `#${new THREE.Color(hex).lerp(new THREE.Color(1, 1, 1), k).getHexString()}`;
const dim = (hex: string, k: number): string =>
  `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;

export function createFireworks(
  scope: Scope,
  quality: Quality,
  world: Pick<WorldData, 'seed' | 'islands' | 'docks' | 'height'>,
): Fireworks {
  const plan: FireworkPlan | null = fireworkPlan(world);
  if (!plan) return { mesh: null, capacity: 0, update: () => 0 };
  const bursts = createBursts(scope, quality, {
    capacity: FW.capacity[quality],
    emissive: true,
    minScreenFrac: FW.minScreenFrac,
  });
  bursts.mesh.name = 'fireworks';
  bursts.mesh.renderOrder = 21;
  const root = createRng(world.seed).fork('fireworks-emit');
  let spawnedFor = Number.NaN;

  const gold = THEMES.hq.accent;
  const emitShow = (showStart: number): void => {
    bursts.clear();
    const R = FW.rocket;
    const W = FW.willow;
    const coreN = Math.round(FW.coreShare * 10);
    plan.shells.forEach((sh, k) => {
      const rng = root.fork('shell', k);
      const willow = FW.kinds[k % FW.kinds.length] === 'willow';
      const accent = willow
        ? `#${new THREE.Color(THEMES[sh.theme].accent).lerp(new THREE.Color(gold), W.gold).getHexString()}`
        : THEMES[sh.theme].accent;
      const light = mixWhite(accent, 0.45);
      const palette = [
        ...Array.from({ length: 10 - coreN }, (_, i) => (i % 3 === 2 ? light : accent)),
        ...Array.from({ length: coreN }, () => mixWhite(accent, 0.85)),
      ];
      const at = showStart + sh.t;
      const anchor = (y: number, r: number): BurstAnchor => ({
        x: sh.x,
        y,
        z: sh.z,
        r,
        h: 0,
        floor: 0,
      });
      // the rocket: one streak rising straight up from the water under the shell
      // ('rise' eases out: it travels 0.6 × speed × life by the end of its life)
      const climb = sh.y / 0.6 / R.climbS;
      bursts.emit(
        {
          glyph: 'streak',
          count: 1,
          pattern: 'rise',
          colors: [mixWhite(gold, 0.5)],
          size: R.size,
          life: [R.climbS, R.climbS],
          speed: [climb, climb],
          from: 'base',
          delay: -R.climbS,
          trail: R.trailS,
        },
        anchor(0.6, 0),
        at,
        rng,
      );
      // the burst: streaking sparks (peony) or long sagging trails (willow)
      bursts.emit(
        {
          glyph: 'streak',
          count: Math.round(FW.sparks[quality] * (willow ? W.share : 1)),
          pattern: willow ? 'willow' : 'sphere',
          colors: palette,
          size: willow ? W.size : FW.size,
          life: willow ? W.life : FW.life,
          speed: willow ? W.speed : FW.speed,
          from: 'base',
          trail: willow ? W.trailS : FW.trailS,
        },
        anchor(sh.y, 0),
        at,
        rng,
      );
      // the flash of the shell going off (a soft white disc)
      bursts.emit(
        {
          glyph: 'glow',
          count: 1,
          pattern: 'sphere',
          colors: [mixWhite(accent, 0.8)],
          size: FW.flash.size,
          life: FW.flash.life,
          speed: [0, 0],
          from: 'base',
        },
        anchor(sh.y, 0),
        at,
        rng,
      );
      // the sea reflection: shell sparks mirrored on the water under the camera's eye
      bursts.emit(
        {
          glyph: 'puff',
          count: FW.mirror[quality],
          pattern: 'mirror',
          colors: [dim(light, FW.mirror.dim), dim(accent, FW.mirror.dim)],
          size: [FW.size[0] * FW.mirror.size, FW.size[1] * FW.mirror.size],
          life: willow ? W.life : FW.life,
          speed: willow ? W.speed : FW.speed,
          from: 'base',
        },
        anchor(sh.y, 0),
        at,
        rng,
      );
    });
  };

  const rainCut = FW.rainCut;
  return {
    mesh: bursts.mesh,
    capacity: bursts.capacity,
    update(time, day, rain, camera) {
      const t = showSecond(day);
      if (t >= FW.lengthS + FW.tailS) {
        if (!Number.isNaN(spawnedFor)) {
          bursts.clear();
          spawnedFor = Number.NaN;
        }
        return 0;
      }
      // (re)spawn when the clock enters the window or jumps (scrub, day-speed change): the show's
      // birth times follow the clock, so a slip over `RESYNC` s means the particles are out of step
      const showStart = time - t;
      if (Number.isNaN(spawnedFor) || Math.abs(spawnedFor - showStart) > RESYNC) {
        emitShow(showStart);
        spawnedFor = showStart;
      }
      const k = 1 - THREE.MathUtils.smoothstep(rain, rainCut[0], rainCut[1]);
      const alive = bursts.update(time, camera, k);
      return k <= 0.001 ? 0 : alive;
    },
  };
}
