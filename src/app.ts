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
import { createBackend, type RendererBackend } from './render/backend.ts';
import { createPostChain, type PostChain } from './render/post/composer.ts';
import { createLoader } from './ui/loader.ts';
import { injectStyles } from './ui/styles.ts';
import { createStatsOverlay, readInfo, type StatsOverlay } from './debug/stats.ts';
import { findShot } from './content/shots.ts';
import type { Counters, MarislandApi, RenderInfo } from './capture/api.ts';
import { createCameraSystem, type CameraSystem } from './camera/controls.ts';
import { buildGallery } from './render/gallery-scene.ts';
import { buildWorldView } from './render/world-view.ts';
import { SHARED } from './render/uniforms.ts';
import { createHud, type Hud } from './ui/hud.ts';
import { createCurtain } from './ui/curtain.ts';
import { createIntro } from './camera/intro.ts';
import { ISLAND_ACCENTS } from './content/islands-ui.ts';
import type { TestScene } from './render/test-scene.ts';

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

    SHARED.uDebugMask.value = params.debug === 'mask' ? 1 : 0;
    let stats: StatsOverlay | null = null;
    if (params.debug === 'stats') stats = createStatsOverlay(root);

    const render = (): void => {
      const r = backend.renderer;
      r.info.reset();
      if (ctx.post) ctx.post.render(1 / 60);
      else r.render(scene, camera);
      readInfo(r, ctx.info);
      const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      if (mem) ctx.timings.jsHeapMB = Math.round(mem.usedJSHeapSize / 1048576);
      ctx.counters.gpuMemoryMB = Math.round(estimateGpuMB(r));
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

    // ---- world
    const buildWorld = (seed: number): TestScene => {
      if (params.gallery) return buildGallery(worldScope);
      const wv = buildWorldView(seed, {
        scene,
        camera,
        quality,
        scope: worldScope,
        getHour: () => loop.clock.dayTime,
        getTime: () => loop.clock.time,
        getTier: () => cam.tier,
        counters: ctx.counters,
        now,
      });
      Object.assign(ctx.timings, wv.timings);
      return { group: wv.group, system: wv.system, hash: wv.hash, cameraWorld: wv.cameraWorld };
    };
    const tGen = now();
    let testScene = buildWorld(params.seed);
    scene.add(testScene.group);
    worldScope.defer(() => scene.remove(testScene.group));
    loop.add(testScene.system);
    ctx.worldHash = testScene.hash;
    ctx.timings.total = now() - tGen;
    cam.setWorld(testScene.cameraWorld);
    cam.applyPreset(params.cam || 'overview', false);
    cam.setIdleOrbit(!params.freeze);

    const reduced = params.rm || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const curtain = params.freeze ? null : createCurtain(root, reduced);
    if (curtain) appScope.defer(() => curtain.dispose());
    let regenBusy = false;
    const newSeed = async (seed: number): Promise<void> => {
      if (regenBusy) return;
      regenBusy = true;
      try {
        if (curtain) await curtain.close();
        await api.regen(seed);
        cam.applyPreset('overview', false);
        if (curtain) await curtain.open();
      } finally {
        regenBusy = false;
      }
    };

    let hud: Hud | null = null;
    if (params.hud && !params.gallery) {
      const TIME_STOPS = [7, 12, 15, 17.75, 19.25, 22, 2];
      let timeStop = -1;
      hud = createHud(
        root,
        {
          onNewSeed: () => void newSeed((Math.random() * 1e9) >>> 0),
          onTime: () => {
            timeStop = (timeStop + 1) % TIME_STOPS.length;
            loop.clock.dayTime = TIME_STOPS[timeStop];
          },
          onWeather: () => {},
          onPhoto: () => {},
          onSound: () => {},
          onCompass: () => void cam.controls.rotateAzimuthTo(0, true),
          onLabel: (name) => cam.applyPreset(`island:${name}`, true),
        },
        params.freeze,
      );
      hud.setWorld(testScene.cameraWorld, ISLAND_ACCENTS);
      appScope.defer(() => hud?.dispose());
      loop.add({
        name: 'hud',
        update: () =>
          hud?.update(
            camera,
            cam.controls.azimuthAngle,
            cam.tier,
            testScene.cameraWorld,
            ctx.width,
            ctx.height,
          ),
      });
    }
    loader.setProgress(0.6);

    if (params.debug === 'wire') {
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && 'wireframe' in m) (m as THREE.MeshLambertMaterial).wireframe = true;
      });
    }

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
      testScene = buildWorld(seed);
      scene.add(testScene.group);
      worldScope.defer(() => scene.remove(testScene.group));
      loop.add(testScene.system);
      ctx.worldHash = testScene.hash;
      api.worldHash = testScene.hash;
      api.seed = seed;
      cam.setWorld(testScene.cameraWorld);
      hud?.setWorld(testScene.cameraWorld, ISLAND_ACCENTS);
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

    const runIntro = !params.freeze && params.intro && !reduced && !params.gallery && curtain;
    if (runIntro) {
      curtain.setClosed();
      hud?.setLabelsHidden(true);
      const cw = testScene.cameraWorld;
      const hero =
        cw.islands.find((i) => (i.archetypeName ?? i.name) === 'Hearthholm') ?? cw.islands[0];
      const intro = createIntro({
        cam,
        centerX: cw.centerX,
        centerZ: cw.centerZ,
        heroX: hero?.cx ?? cw.centerX,
        heroZ: hero?.cz ?? cw.centerZ,
        onCurtainOpen: () => void curtain.open(),
        onLabels: () => hud?.setLabelsHidden(false),
        onDone: () => {
          loop.remove(intro);
          hud?.show();
          cam.setIdleOrbit(true);
        },
      });
      cam.setIdleOrbit(false);
      loop.add(intro);
      const skip = (): void => intro.skip();
      window.addEventListener('pointerdown', skip, { once: true });
      window.addEventListener('keydown', skip, { once: true });
      window.addEventListener('wheel', skip, { once: true, passive: true });
    }
    await loader.finish();
    if (!params.freeze) loop.start();
    if (!runIntro) hud?.show();
    else hud?.showWordmark();
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

/** Rough GPU memory from renderer.info: textures + geometries + render targets (MB). */
function estimateGpuMB(r: THREE.WebGLRenderer): number {
  const m = r.info.memory;
  // ~1.5 MB per texture (R16F 385² ≈ 0.3 MB, shadow 2048² ≈ 16 MB, HalfFloat RTs scale with the canvas)
  const canvas = r.domElement.width * r.domElement.height * 8 * 3;
  return (m.textures * 1.5 * 1048576 + m.geometries * 0.4 * 1048576 + canvas) / 1048576;
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
