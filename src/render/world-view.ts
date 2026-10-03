import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { System } from '../core/loop.ts';
import type { Quality } from '../core/params.ts';
import { generateWorld, type WorldData, heightAt } from '../world/index.ts';
import { createWorldTextures, type WorldTextures } from './world-textures.ts';
import { buildTerrain, type TerrainView } from './terrain/terrain.ts';
import { createWater, type WaterView } from './water/water.ts';
import { createSky, type SkyView } from './sky/sky.ts';
import { createLightRig, type LightRig } from './lighting.ts';
import { createEnvState, sampleEnv, type EnvState } from '../env/env-state.ts';
import { SHARED, setWind, writeEnvUniforms } from './uniforms.ts';
import type { CameraWorld } from '../camera/controls.ts';
import type { Counters } from '../capture/api.ts';

/**
 * Everything seed-derived on the render side (ARCHITECTURE §1 "world scope").
 * Built from WorldData; disposed as a unit on regen.
 */
export interface WorldView {
  world: WorldData;
  textures: WorldTextures;
  group: THREE.Group;
  terrain: TerrainView;
  water: WaterView;
  sky: SkyView;
  lights: LightRig;
  env: EnvState;
  system: System;
  cameraWorld: CameraWorld;
  hash: string;
  timings: Record<string, number>;
}

export interface WorldViewDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  quality: Quality;
  scope: Scope;
  getHour: () => number;
  getTime: () => number;
  getTier: () => number;
  counters: Counters;
  now: () => number;
}

const _focus = new THREE.Vector3();
const _camPos = new THREE.Vector3();

export function buildWorldView(seed: number, d: WorldViewDeps): WorldView {
  const timings: Record<string, number> = {};
  const t0 = d.now();
  const world = generateWorld(seed, { now: d.now });
  timings.gen = d.now() - t0;

  const t1 = d.now();
  const textures = createWorldTextures(world, d.scope);
  const group = new THREE.Group();
  group.name = 'world';
  const terrain = buildTerrain(world, textures, d.quality, d.scope);
  group.add(terrain.group);
  const water = createWater(world, textures, d.quality, d.scope);
  group.add(water.mesh);
  const sky = createSky(d.scene, d.scope);
  if (sky.mesh) group.add(sky.mesh);
  const lights = createLightRig(d.quality, d.scope);
  group.add(lights.group);
  setWind(world.windDir, 1);
  timings.build = d.now() - t1;

  const env = createEnvState();
  let lastTier = -1;

  const update = (): void => {
    sampleEnv(d.getHour(), env);
    d.camera.getWorldPosition(_camPos);
    // focus = point on the sea plane the camera looks at (approximate: project forward)
    _focus.set(0, 0, -1).applyQuaternion(d.camera.quaternion);
    const t = _focus.y < -1e-3 ? -_camPos.y / _focus.y : 300;
    _focus.multiplyScalar(Math.min(t, 1500)).add(_camPos);
    const tier = d.getTier();
    writeEnvUniforms(env, d.getTime(), _camPos, tier);
    lights.update(env, d.camera, _focus);
    sky.update(env, _camPos);
    water.update(_camPos, d.getTime());
    terrain.update(d.getTime());
    if (tier !== lastTier) {
      lastTier = tier;
      terrain.onTier(tier);
    }
  };
  update();

  const islands = world.islands.map((i) => ({
    name: i.name,
    cx: i.cx,
    cz: i.cz,
    radius: i.radius,
    peakY: i.peakY,
    anchors: withDefaults(i.anchors, i, world),
  }));
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const i of world.islands) {
    minX = Math.min(minX, i.minX);
    maxX = Math.max(maxX, i.maxX);
    minZ = Math.min(minZ, i.minZ);
    maxZ = Math.max(maxZ, i.maxZ);
  }
  if (!Number.isFinite(minX)) {
    minX = maxX = minZ = maxZ = 0;
  }
  const cameraWorld: CameraWorld = {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    radius: Math.max(120, Math.hypot(maxX - minX, maxZ - minZ) / 2 + 60),
    islands,
    heightAt: (x, z) => heightAt(world.height, x, z),
  };

  return {
    world,
    textures,
    group,
    terrain,
    water,
    sky,
    lights,
    env,
    system: { name: 'world-view', update },
    cameraWorld,
    hash: world.hashes.world ?? '',
    timings,
  };
}

/** Make sure the camera presets always find beach/village/dock anchors. */
function withDefaults(
  anchors: Record<string, { x: number; z: number; rotY: number }>,
  isl: WorldData['islands'][number],
  world: WorldData,
): Record<string, { x: number; z: number; rotY: number }> {
  const out = { ...anchors };
  const wind = world.windDir;
  // leeward side of the island = downwind
  const lee = {
    x: isl.cx + Math.cos(wind) * isl.radius * 0.8,
    z: isl.cz + Math.sin(wind) * isl.radius * 0.8,
    rotY: wind + Math.PI,
  };
  if (!out.beach) out.beach = out.harbour ? { ...out.harbour } : lee;
  if (!out.village)
    out.village = out.harbour
      ? { x: (out.harbour.x + isl.cx) / 2, z: (out.harbour.z + isl.cz) / 2, rotY: out.harbour.rotY }
      : { x: isl.cx, z: isl.cz, rotY: wind };
  if (!out.dock) out.dock = out.harbour ? { ...out.harbour } : lee;
  if (!out.peak) out.peak = { x: isl.peakX, z: isl.peakZ, rotY: 0 };
  return out;
}

export { SHARED };
