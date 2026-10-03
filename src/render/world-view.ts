import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { System } from '../core/loop.ts';
import type { Quality } from '../core/params.ts';
import { generateWorld, type WorldData, heightAt, sampleGrid, Zone } from '../world/index.ts';
import { createWorldTextures, type WorldTextures } from './world-textures.ts';
import { buildTerrain, type TerrainView } from './terrain/terrain.ts';
import { createWater, type WaterView } from './water/water.ts';
import { createSky, type SkyView } from './sky/sky.ts';
import { createLightRig, type LightRig } from './lighting.ts';
import { createClouds, type CloudsView } from './clouds/clouds.ts';
import { createLife, type LifeSystem } from '../life/index.ts';
import { createEnvState, sampleEnv, type EnvState } from '../env/env-state.ts';
import { SHARED, setWind, writeEnvUniforms, writeWeatherUniforms } from './uniforms.ts';
import { FOG, FOG_T0_SCALE } from '../content/lighting.ts';
import {
  WeatherFsm,
  applyWeather,
  blendFx,
  createWeatherFx,
  type WeatherFx,
  type WeatherName,
} from '../env/weather.ts';
import { createRain, type RainView } from './weather/rain.ts';
import { remap } from '../core/math/index.ts';
import type { CameraWorld } from '../camera/controls.ts';
import type { Counters } from '../capture/api.ts';
import { createPropBatcher, type PropBatcher } from './props/batcher.ts';
import { createPropMaterials } from './materials/prop-materials.ts';
import type { PropDef } from '../content/props.ts';
import type { PropStore } from '../world/prop-store.ts';
import { appendSettlementProps } from './props/settlement-props.ts';
import { PUFF_CHIMNEY } from './particles/puffs.ts';
import type { Lod } from '../geo/index.ts';
import { createLanternPools } from './night/lantern-pools.ts';
import { createBeam } from './night/beam.ts';

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
  clouds: CloudsView;
  life: LifeSystem;
  props: PropBatcher;
  scatter: { props: PropStore; counts: Record<string, number> };
  env: EnvState;
  /** Weather (TASK-172): FSM, the blended look of the last frame, rain streaks. */
  weather: WorldWeather;
  system: System;
  cameraWorld: CameraWorld;
  hash: string;
  timings: Record<string, number>;
}

export interface WorldWeather {
  fsm: WeatherFsm;
  fx: WeatherFx;
  rain: RainView;
  /** HUD: switch to `w` (cross-fades unless capture; holds one dwell, then auto cycles). */
  set(w: WeatherName): void;
}

/** Weather wiring from the app (TASK-172). */
export interface WorldWeatherOptions {
  /** Starting state (applied instantly). */
  initial: WeatherName;
  /** `?weather=` given: hold the state, no auto cycle. */
  forced: boolean;
  /** Capture (`freeze=1`): every change applies instantly. */
  instant: boolean;
  /** The auto cycle changed the state (HUD icon sync). */
  onChange?: (w: WeatherName) => void;
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
  /** Prop material provider (factory from TASK-104); falls back to a plain Lambert. */
  propMaterial?: (def: PropDef, lod: Lod, groundCover: boolean) => THREE.Material;
  propDepthMaterial?: (def: PropDef, lod: Lod, groundCover: boolean) => THREE.Material | null;
  softAppear?: boolean;
  weather?: WorldWeatherOptions;
}

const _focus = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _camDir = new THREE.Vector3();

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
  const settlement = appendSettlementProps(world);
  // night lights (TASK-171): lantern-pool texture → SHARED, lighthouse beam mesh
  createLanternPools(settlement.props, d.scope);
  const beam = createBeam(settlement.props, d.scope);
  if (beam.mesh) group.add(beam.mesh);
  const clouds = createClouds(world, d.quality, d.scope);
  group.add(clouds.group);
  for (const c of settlement.emitters.chimneys)
    clouds.puffs.addEmitter(c.x, c.y, c.z, PUFF_CHIMNEY);
  clouds.puffs.finalize();
  const life = createLife({
    world,
    scope: d.scope,
    seed,
    quality: d.quality,
    water,
    counters: d.counters,
    getTier: d.getTier,
    cameraPos: _camPos,
  });
  group.add(life.group);
  d.scope.add(life);
  setWind(world.windDir, 1);

  const tScatter = d.now();
  const scatter = { props: settlement.props, counts: {} as Record<string, number> };
  timings.scatter = d.now() - tScatter;
  const pm = createPropMaterials(d.scope);
  const props = createPropBatcher(scatter.props, {
    scope: d.scope,
    seed,
    counters: d.counters,
    materialFor: d.propMaterial ?? pm.materialFor,
    depthMaterialFor: d.propDepthMaterial ?? pm.depthMaterialFor,
    softAppear: d.softAppear ?? true,
    castShadows: d.quality !== 'low',
  });
  group.add(props.group);
  timings.build = d.now() - t1;

  const env = createEnvState();
  let lastTier = -1;

  // weather (TASK-172): seeded FSM → blended look → EnvState deltas + uniforms + rain
  const wo = d.weather;
  const fsm = new WeatherFsm({
    seed,
    t0: d.getTime(),
    forced: wo?.forced ? wo.initial : null,
    initial: wo?.initial,
    instant: wo?.instant,
    onChange: wo?.onChange,
  });
  const fx = createWeatherFx();
  // rain streaks draw with the puff material (shared program, no compile when rain starts)
  const rain = createRain(
    seed,
    d.quality,
    d.scope,
    clouds.puffs.mesh.material as THREE.ShaderMaterial,
  );
  group.add(rain.mesh);
  // the shared weather uniforms outlive this world: reset them with it
  d.scope.defer(() => {
    writeWeatherUniforms(blendFx({ clear: 1, cloudy: 0, rain: 0, fog: 0 }, fx), env, 0, 0);
    setWind(world.windDir, 1);
  });
  const weather: WorldWeather = {
    fsm,
    fx,
    rain,
    set: (w) => fsm.set(w, d.getTime()),
  };

  const update = (dt: number, alpha: number): void => {
    sampleEnv(d.getHour(), env);
    const time = d.getTime();
    blendFx(fsm.update(time), fx);
    applyWeather(env, fx);
    d.camera.getWorldPosition(_camPos);
    // focus = point on the sea plane the camera looks at (approximate: project forward)
    _focus.set(0, 0, -1).applyQuaternion(d.camera.quaternion);
    const t = _focus.y < -1e-3 ? -_camPos.y / _focus.y : 300;
    _focus.multiplyScalar(Math.min(t, 1500)).add(_camPos);
    const tier = d.getTier();
    writeEnvUniforms(env, time, _camPos, tier);
    writeWeatherUniforms(fx, env, world.windDir, time);
    setWind(world.windDir, fx.gust);
    // T0 postcard: the fog curve is fitted for island/village views; at map distance it would
    // wash the whole archipelago out, so scale density down with camera distance (D-009).
    const camDist = _camPos.distanceTo(_focus);
    const density = FOG.density * remap(camDist, 300, 650, 1, FOG_T0_SCALE) * fx.fog;
    sky.fog.density = density;
    SHARED.uFogDensity.value = density;
    lights.update(env, d.camera, _focus);
    sky.update(env, _camPos);
    beam.update();
    water.update(_camPos, d.getTime());
    terrain.update(d.getTime());
    clouds.update(d.getTime(), env, _camPos, tier, fx);
    d.camera.getWorldDirection(_camDir);
    rain.update(fx.rain, env, _camPos, _camDir, camDist, world.windDir, fx.gust);
    d.counters.particles = clouds.puffs.stats().used + rain.count();
    if (tier !== lastTier) {
      lastTier = tier;
      terrain.onTier(tier);
      props.setTier(tier, d.getTime());
      life.onTier(tier);
    }
    props.update(d.getTime(), _focus.x, _focus.z);
    life.update(dt, alpha);
  };
  // No eager update here: the first update runs after the camera preset is applied so the
  // initial tier is set instantly (no bloom-in queue, no hard pops before the first frame).

  const islands = world.islands.map((i) => ({
    name: i.name,
    archetypeName: i.archetypeName,
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
    clouds,
    life,
    props,
    scatter,
    env,
    weather,
    system: { name: 'world-view', update, fixedUpdate: (dt) => life.fixedUpdate(dt) },
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
  // Beach: nearest dry-sand cell (2–4 u inland) to the harbour / lee point, facing the water.
  const seedPt = out.harbour ??
    out.landing ?? {
      x: isl.cx + Math.cos(wind) * isl.radius * 0.8,
      z: isl.cz + Math.sin(wind) * isl.radius * 0.8,
      rotY: wind,
    };
  if (!out.beach) {
    const h = world.height;
    let best: { x: number; z: number; d: number } | null = null;
    const r = Math.ceil((isl.radius + 20) / h.cellSize);
    const ci = Math.round((isl.cx - h.originX) / h.cellSize);
    const cj = Math.round((isl.cz - h.originZ) / h.cellSize);
    for (let j = Math.max(1, cj - r); j < Math.min(h.n - 1, cj + r); j++) {
      for (let i = Math.max(1, ci - r); i < Math.min(h.n - 1, ci + r); i++) {
        const k = j * h.n + i;
        if (world.zone[k] !== Zone.sandDry && world.zone[k] !== Zone.sandBlack) continue;
        const sdf = world.shoreSdf[k];
        if (sdf < 1.5 || sdf > 5) continue;
        const x = h.originX + i * h.cellSize;
        const z = h.originZ + j * h.cellSize;
        const d = Math.hypot(x - seedPt.x, z - seedPt.z);
        if (!best || d < best.d) best = { x, z, d };
      }
    }
    if (best) {
      // face the water: along the SDF gradient toward decreasing distance
      const gx =
        sampleGrid(h, world.shoreSdf, best.x + 2, best.z, 0) -
        sampleGrid(h, world.shoreSdf, best.x - 2, best.z, 0);
      const gz =
        sampleGrid(h, world.shoreSdf, best.x, best.z + 2, 0) -
        sampleGrid(h, world.shoreSdf, best.x, best.z - 2, 0);
      out.beach = { x: best.x, z: best.z, rotY: Math.atan2(-gz, -gx) };
    }
  }
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
