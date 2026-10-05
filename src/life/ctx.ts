import type * as THREE from 'three';
import { GUST, SWELL } from '../content/anim.ts';
import type { LifePlan } from '../content/life.ts';
import type { Quality } from '../core/params.ts';
import type { Scope } from '../core/scope.ts';
import type { GustParams, SwellParams } from '../shared/fields.ts';
import { createRng, type Rng } from '../core/rng.ts';
import { heightAt, zoneAt, type WorldData } from '../world/types.ts';

export interface WaterSplat {
  splat(x: number, z: number, radius: number, strength: number): void;
}
export interface CountersLike {
  agents: number;
}

/** World data with boat routes flattened to point loops (TASK-133 `Polyline.points`). */
export interface LifeWorld extends Omit<WorldData, 'boatRoutes' | 'docks'> {
  boatRoutes?: { x: number; z: number }[][];
  /** Dock indices each route passes (parallel to `boatRoutes`). */
  boatStops?: number[][];
  docks?: {
    x: number;
    z: number;
    rotY: number;
    segments: number;
    islandId: number;
    node: number;
  }[];
}

export interface LifeDeps {
  world: WorldData;
  scope: Scope;
  seed: number;
  quality: Quality;
  water: WaterSplat;
  counters: CountersLike;
  getTier(): number;
  /** Live reference, read every step. */
  cameraPos: THREE.Vector3;
  /** Overrides of `LIFE_PLAN[quality]` (tests; e.g. `villagers` for a later "visitors" option). */
  plan?: Partial<LifePlan>;
}

/** Everything the kinds share: world, fields (live motion scale), water, tier. */
export interface LifeCtx {
  world: LifeWorld;
  seed: number;
  water: WaterSplat;
  cameraPos: THREE.Vector3;
  getTier(): number;
  gust: GustParams;
  /** Mutable: amplitude follows the reduced-motion scale so boats track the water surface. */
  swell: SwellParams;
  motion: { scale: number };
  /** Terrain/sea-floor height (negative = water depth). */
  h(x: number, z: number): number;
  zone(x: number, z: number): number;
  /** Independent stream for a sub-system: createRng(seed).fork('life').fork(label). */
  rngFor(label: string): Rng;
}

export function makeCtx(deps: LifeDeps): LifeCtx {
  const world: LifeWorld = {
    ...deps.world,
    boatRoutes: deps.world.boatRoutes?.map((r) => r.points),
    boatStops: deps.world.boatRoutes?.map((r) => r.stops ?? []),
    docks: deps.world.docks,
  };
  return {
    world,
    seed: deps.seed,
    water: deps.water,
    cameraPos: deps.cameraPos,
    getTier: deps.getTier,
    gust: {
      dir: world.windDir,
      speed: GUST.speed,
      wavelength: GUST.wavelength,
      strength: GUST.strength,
    },
    swell: { amplitude: SWELL.amplitude, period: SWELL.period, dir: world.windDir },
    motion: { scale: 1 },
    h: (x, z) => heightAt(world.height, x, z),
    zone: (x, z) => zoneAt(world.height, world.zone, x, z),
    rngFor: (label) => createRng(deps.seed).fork('life').fork(label),
  };
}

export function setMotion(ctx: LifeCtx, s: number): void {
  ctx.motion.scale = s;
  ctx.swell.amplitude = SWELL.amplitude * s;
}
