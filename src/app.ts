import * as THREE from 'three';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import { parseParams, type Params } from './core/params.ts';
import { loadStoredQuality, pickQuality, QUALITY_PRESETS } from './core/quality.ts';
import { Loop } from './core/loop.ts';
import { Scope } from './core/scope.ts';
import { Emitter, type AppEvents } from './core/events.ts';
import { createRng } from './core/rng.ts';
import { createBackend, type RendererBackend } from './render/backend.ts';
import { createPostChain, type PostChain } from './render/post/composer.ts';
import { createLoader } from './ui/loader.ts';
import { injectStyles } from './ui/styles.ts';
import { createStatsOverlay, readInfo, type StatsOverlay } from './debug/stats.ts';
import { findShot } from './content/shots.ts';
import type { Counters, MarislandApi, RenderInfo } from './capture/api.ts';
import { buildTestScene } from './render/test-scene.ts';
import { createCameraSystem, type CameraSystem } from './camera/controls.ts';

/**
 * Composition root (ARCHITECTURE §1). Owns scopes, the loop and the systems.
 * Everything seed-derived lives in `worldScope` and is disposed on regen.
 */
export interface Ctx {
  params: Params;
  appScope: Scope;
  worldScope: Scope;
  loop: Loop;
  events: Emitter<AppEvents>;
  backend: RendererBackend;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  post: PostChain | null;
  cam: CameraSystem;
  quality: 'low' | 'medium' | 'high';
  width: number;
  height: number;
  info: RenderInfo;
  counters: Counters;
  timings: Record<string, number>;
  tier: number;
  seed: number;
  worldHash: string;
}

const now = (): number => performance.now();

export async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app missing');
  injectStyles();
  const t0 = now();
  const params = applyShotPreset(parseParams(location.search));
  const loader = createLoader(root, !params.freeze);
  const api = installApi();

  try {
    await document.fonts.ready;
    loader.setProgress(0.1);

    const canvas = document.createElement('canvas');
    canvas.className = 'mar-canvas';
    root.insertBefore(canvas, loader.el);

    // Quality: probe a throwaway context for the renderer string? No — the backend
    // reads it; pick a provisional quality, then correct for software renderers.
    const stored = loadStoredQuality();
    let quality = pickQuality(
      {
        rendererString: '',
        deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4,
        cores: navigator.hardwareConcurrency ?? 4,
        touch: navigator.maxTouchPoints > 0,
        screenWidth: screen.width,
      },
      params.quality || stored,
    );
    const useComposerProvisional = QUALITY_PRESETS[quality].composer;
    const backend = createBackend({
      canvas,
      quality,
      capture: params.freeze,
      dprOverride: params.dpr,
      useComposer: useComposerProvisional,
    });
    if (!params.quality && !stored && backend.isSoftware) quality = 'low';
    const preset = QUALITY_PRESETS[quality];
    // If the provisional composer choice disagrees with the final preset, fix tone mapping.
    backend.renderer.toneMapping = preset.composer ? THREE.NoToneMapping : THREE.NeutralToneMapping;
    api.renderer = backend.rendererString;
    api.quality = quality;
    api.seed = params.seed;
    loader.setProgress(0.2);

    const appScope = new Scope('app');
    const worldScope = new Scope('world');
    appScope.add({ dispose: () => backend.dispose() });
    const events = new Emitter<AppEvents>();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 3000);
    camera.position.set(0, 200, 300);
    camera.lookAt(0, 0, 0);

    const ctx: Ctx = {
      params,
      appScope,
      worldScope,
      loop: null as unknown as Loop,
      events,
      backend,
      scene,
      camera,
      post: null,
      cam: null as unknown as CameraSystem,
      quality,
      width: 1,
      height: 1,
      info: {
        calls: 0,
        triangles: 0,
        points: 0,
        lines: 0,
        programs: 0,
        geometries: 0,
        textures: 0,
      },
      counters: {
        hardPops: 0,
        instances: 0,
        groundCover: 0,
        agents: 0,
        particles: 0,
        gpuMemoryMB: 0,
      },
      timings: {},
      tier: 0,
      seed: params.seed,
      worldHash: '',
    };

    if (preset.composer)
      ctx.post = createPostChain(backend.renderer, scene, camera, preset.msaa, appScope);

    const resize = (): void => {
      const w = Math.max(1, root.clientWidth);
      const h = Math.max(1, root.clientHeight);
      ctx.width = w;
      ctx.height = h;
      backend.resize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      ctx.post?.setSize(w, h);
      events.emit('resized', { width: w, height: h, dpr: backend.dpr });
    };
    resize();
    window.addEventListener('resize', resize);
    appScope.defer(() => window.removeEventListener('resize', resize));

    let stats: StatsOverlay | null = null;
    if (params.debug === 'stats') stats = createStatsOverlay(root);

    const render = (): void => {
      const r = backend.renderer;
      r.info.reset();
      if (ctx.post) ctx.post.render(1 / 60);
      else r.render(scene, camera);
      readInfo(r, ctx.info);
      if (stats)
        stats.update(1000 / Math.max(frameMs, 1), loop.cpuMs, ctx.info, ctx.tier, ctx.counters, '');
    };
    let frameMs = 16.7;
    let lastT = now();
    const loop = new Loop({ manual: params.freeze, render, now });
    ctx.loop = loop;
    loop.add({
      name: 'frame-timer',
      update: () => {
        const t = now();
        frameMs = t - lastT;
        lastT = t;
      },
    });
    if (!Number.isNaN(params.time)) loop.clock.dayTime = params.time;
    if (params.freeze) loop.clock.daySpeed = 0;

    const cam = createCameraSystem(camera, canvas, events, !params.freeze);
    ctx.cam = cam;
    loop.add(cam);
    cam.setReducedMotion(params.rm || matchMedia('(prefers-reduced-motion: reduce)').matches);
    appScope.defer(() => cam.dispose?.());
    loop.add({
      name: 'tier-sync',
      update: () => {
        ctx.tier = cam.tier;
      },
    });

    // ---- world (TASK-003: test scene; replaced by terrain/water in M1)
    const tGen = now();
    const rng = createRng(params.seed);
    const testScene = buildTestScene(rng, worldScope);
    scene.add(testScene.group);
    worldScope.defer(() => scene.remove(testScene.group));
    loop.add(testScene.system);
    ctx.worldHash = testScene.hash;
    ctx.timings.gen = now() - tGen;
    cam.setWorld(testScene.cameraWorld);
    cam.applyPreset(params.cam || 'overview', false);
    cam.setIdleOrbit(!params.freeze);
    loader.setProgress(0.6);

    // ---- prewarm + warm-up
    const tCompile = now();
    await backend.renderer.compileAsync(scene, camera);
    ctx.timings.compile = now() - tCompile;
    loader.setProgress(0.8);
    if (params.simt > 0) loop.warmUp(params.simt);
    // 3 settle frames
    loop.step(1 / 30, 3);
    ctx.timings.boot = now() - t0;
    loader.setProgress(1);

    // ---- api
    api.step = (dt = 1 / 30, n = 1) => loop.step(dt, n);
    api.setCamera = (preset: string) => {
      cam.applyPreset(preset, false);
      loop.step(1 / 30, 1);
    };
    api.setTime = (hour: number) => {
      loop.clock.dayTime = ((hour % 24) + 24) % 24;
      loop.step(1 / 30, 1);
    };
    api.pick = () => null;
    api.perf = async () => ({ p50: 0, p95: 0, frames: 0 });
    api.regen = async (seed: number) => {
      worldScope.dispose();
      loop.remove(testScene.system);
      const r2 = createRng(seed);
      const ts2 = buildTestScene(r2, worldScope);
      scene.add(ts2.group);
      worldScope.defer(() => scene.remove(ts2.group));
      loop.add(ts2.system);
      ctx.worldHash = ts2.hash;
      api.worldHash = ts2.hash;
      cam.setWorld(ts2.cameraWorld);
      api.seed = seed;
      loop.step(1 / 30, 1);
    };
    api.memory = () => ({
      geometries: backend.renderer.info.memory.geometries,
      textures: backend.renderer.info.memory.textures,
    });
    Object.defineProperties(api, {
      info: { get: () => ctx.info },
      counters: { get: () => ctx.counters },
      timings: { get: () => ctx.timings },
      tier: { get: () => ctx.tier },
    });
    api.worldHash = ctx.worldHash;

    if (params.selftest === 'regen') await selftestRegen(api, params.seed, ctx);

    await loader.finish();
    if (!params.freeze) loop.start();
    api.ready = true;
    console.info(
      `[marisland] ready in ${ctx.timings.boot.toFixed(0)} ms · ${backend.rendererString} · quality ${quality}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
    api.error = msg;
    loader.fail(`Marisland failed to start:\n${msg}`);
    console.error(e);
  }
}

/** `?shot=W1` fills seed/cam/time/weather/simt unless given explicitly. */
function applyShotPreset(p: Params): Params {
  if (!p.shot) return p;
  const s = findShot(p.shot);
  if (!s) return p;
  const q = new URLSearchParams(location.search);
  if (!q.has('seed')) p.seed = s.seed;
  if (!q.has('cam')) p.cam = s.cam;
  if (!q.has('time')) p.time = s.time;
  if (!q.has('weather') && s.weather) p.weather = s.weather;
  if (!q.has('simt') && s.simt !== undefined) p.simt = s.simt;
  if (!q.has('quality') && s.quality) p.quality = s.quality;
  return p;
}

function installApi(): MarislandApi {
  const api: MarislandApi = {
    ready: false,
    error: null,
    renderer: '',
    quality: 'low',
    seed: 0,
    worldHash: '',
    tier: 0,
    info: { calls: 0, triangles: 0, points: 0, lines: 0, programs: 0, geometries: 0, textures: 0 },
    timings: {},
    counters: {
      hardPops: 0,
      instances: 0,
      groundCover: 0,
      agents: 0,
      particles: 0,
      gpuMemoryMB: 0,
    },
    step: () => {},
    setCamera: () => {},
    setTime: () => {},
    pick: () => null,
    perf: async () => ({ p50: 0, p95: 0, frames: 0 }),
    regen: async () => {},
    memory: () => ({ geometries: 0, textures: 0 }),
  };
  window.__marisland = api;
  window.addEventListener('error', (ev) => {
    if (!api.ready && !api.error) api.error = ev.message;
  });
  window.addEventListener('unhandledrejection', (ev) => {
    if (!api.error) api.error = String(ev.reason);
  });
  return api;
}

/** `?selftest=regen`: 5 regen cycles; memory must return to baseline (ARCHITECTURE §1). */
async function selftestRegen(api: MarislandApi, seed: number, ctx: Ctx): Promise<void> {
  const base = api.memory();
  for (let i = 1; i <= 5; i++) await api.regen(seed + i);
  await api.regen(seed);
  const after = api.memory();
  ctx.timings.selftestGeoDelta = after.geometries - base.geometries;
  ctx.timings.selftestTexDelta = after.textures - base.textures;
  if (after.geometries !== base.geometries || after.textures !== base.textures) {
    throw new Error(
      `selftest=regen leak: geometries ${base.geometries}→${after.geometries}, textures ${base.textures}→${after.textures}`,
    );
  }
}
