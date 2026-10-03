import * as THREE from 'three';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import { parseParams, type Params } from './core/params.ts';
import { loadStoredQuality, pickQuality, QUALITY_PRESETS, storeQuality } from './core/quality.ts';
import { Loop } from './core/loop.ts';
import { Scope } from './core/scope.ts';
import { Emitter, type AppEvents } from './core/events.ts';
import { createBackend, type RendererBackend } from './render/backend.ts';
import { createPostChain, type PostChain } from './render/post/composer.ts';
import { createLoader } from './ui/loader.ts';
import { injectStyles, preloadFonts } from './ui/styles.ts';
import { createStatsOverlay, readInfo, type StatsOverlay } from './debug/stats.ts';
import { findShot } from './content/shots.ts';
import type { Counters, MarislandApi, RenderInfo } from './capture/api.ts';
import { createCameraSystem, type CameraSystem } from './camera/controls.ts';
import { buildGallery } from './render/gallery-scene.ts';
import { buildWorldView } from './render/world-view.ts';
import { SHARED } from './render/uniforms.ts';
import { createHud, type Hud } from './ui/hud.ts';
import { createCurtain } from './ui/curtain.ts';
import { createIntro, type Intro } from './camera/intro.ts';
import { ISLAND_ACCENTS } from './content/islands-ui.ts';
import { HUD, INTRO } from './content/ui.ts';
import { CAMERA } from './content/tiers.ts';
import { loadPrefs, storePrefs, type UiPrefs } from './ui/settings.ts';
import { photoFilename } from './ui/hud-math.ts';
import type { WeatherName } from './core/params.ts';
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
    await preloadFonts();
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
    // Reduced motion: `rm=1` forces it; otherwise the persisted HUD choice, else the OS setting.
    // Capture ignores stored prefs (same URL → same pixels on any machine).
    const prefs: UiPrefs = params.freeze ? { reducedMotion: null, compass: true } : loadPrefs();
    const reduced =
      params.rm || (prefs.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches);
    cam.setReducedMotion(reduced);
    appScope.defer(() => cam.dispose?.());
    /** The live world's life system (motion scale follows reduced motion; null in the gallery). */
    let worldLife: { setMotionScale(s: number): void } | null = null;
    // Weather (TASK-172): `?weather=` holds a state; otherwise the world's seeded FSM cycles.
    // The HUD button (weatherChanged) switches it; auto changes sync the HUD icon.
    let worldWeather: { set(w: WeatherName): void } | null = null;
    let currentWeather: WeatherName = params.weather || 'clear';
    events.on('weatherChanged', ({ weather: w }) => {
      currentWeather = w;
      worldWeather?.set(w);
    });
    const motionScale = (): number => (cam.reducedMotion ? HUD.reducedMotionScale : 1);
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
        weather: {
          initial: currentWeather,
          forced: !!params.weather,
          instant: params.freeze,
          onChange: (w) => {
            currentWeather = w;
            hud?.setState({ weather: w });
          },
        },
      });
      Object.assign(ctx.timings, wv.timings);
      worldLife = wv.life;
      worldWeather = wv.weather;
      if (cam.reducedMotion) wv.life.setMotionScale(motionScale());
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

    // `introt` (capture) renders the intro at a fixed time, curtain included.
    const introCapture = params.freeze && Number.isFinite(params.introt) && !params.gallery;
    const curtain = params.freeze && !introCapture ? null : createCurtain(root, reduced);
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

    // ---- HUD (TASK-182). Other systems hook in through `events`: weatherChanged,
    // reducedMotionChanged, photoMode (+ the existing qualityChanged).
    let intro: Intro | null = null;
    let weather: WeatherName = params.weather || 'clear';
    let photoFrozen = false;
    let daySpeedBeforeFreeze = loop.clock.daySpeed;
    const setReduced = (on: boolean): void => {
      cam.setReducedMotion(on);
      worldLife?.setMotionScale(motionScale());
      if (on) intro?.skip();
      events.emit('reducedMotionChanged', { reduced: on, motionScale: motionScale() });
    };
    const setFrozen = (on: boolean): void => {
      if (on === photoFrozen) return;
      photoFrozen = on;
      cam.setFrozen(on);
      if (on) {
        intro?.skip();
        daySpeedBeforeFreeze = loop.clock.daySpeed;
        loop.clock.daySpeed = 0;
      } else {
        loop.clock.daySpeed = daySpeedBeforeFreeze;
      }
      events.emit('photoMode', { active: hud?.photoMode ?? false, frozen: on });
    };
    let hud: Hud | null = null;
    if (params.hud && !params.gallery) {
      hud = createHud(
        root,
        {
          onNewSeed: () => void newSeed((Math.random() * 1e9) >>> 0),
          onHour: (h) => {
            loop.clock.dayTime = h;
          },
          onWeather: (w) => {
            weather = w;
            events.emit('weatherChanged', { weather });
          },
          onSound: () => {},
          onCompass: () => cam.resetNorth(),
          onLabel: (name) => void cam.flyToIsland(name),
          onQuality: (q) => {
            // Quality picks the renderer path (composer, MSAA, shadows): apply on reload.
            storeQuality(q);
            events.emit('qualityChanged', { quality: q });
            const u = new URL(location.href);
            u.searchParams.delete('quality');
            location.replace(u.toString());
          },
          onReducedMotion: (on) => {
            prefs.reducedMotion = on;
            storePrefs(prefs);
            setReduced(on);
          },
          onCompassVisible: (on) => {
            prefs.compass = on;
            storePrefs(prefs);
          },
          onPhotoMode: (active) => {
            if (!active) cam.setFov(CAMERA.fov);
            events.emit('photoMode', { active, frozen: photoFrozen });
          },
          onFov: (deg) => cam.setFov(deg),
          onFreeze: setFrozen,
          onShutter: () =>
            new Promise((resolve) => {
              // preserveDrawingBuffer is off outside capture: render and grab in the same task.
              render();
              canvas.toBlob(
                (blob) =>
                  resolve(
                    blob ? { blob, filename: photoFilename(api.seed, loop.clock.dayTime) } : null,
                  ),
                'image/png',
              );
            }),
        },
        {
          quality,
          reducedMotion: reduced,
          compass: prefs.compass,
          weather,
          fov: camera.fov,
          frozen: false,
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
            loop.clock.dayTime,
            ctx.width,
            ctx.height,
          ),
      });
    }
    if (reduced) events.emit('reducedMotionChanged', { reduced, motionScale: motionScale() });
    loader.setProgress(0.6);

    if (params.debug === 'wire') {
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && 'wireframe' in m) (m as THREE.MeshLambertMaterial).wireframe = true;
      });
    }

    // ---- prewarm + warm-up
    const tCompile = now();
    // Prewarm against the composer's target when post is on: program keys include the
    // output colour space / tone mapping of the current target, so compiling for the canvas
    // would compile every program twice (once more on the first composer frame).
    if (ctx.post) backend.renderer.setRenderTarget(ctx.post.composer.inputBuffer);
    await backend.renderer.compileAsync(scene, camera);
    backend.renderer.setRenderTarget(null);
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
    api.dolly = (fromDist: number, seconds: number) => {
      const c = cam.controls;
      const to = c.distance;
      const n = Math.max(1, Math.round(seconds * 30));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        void c.dollyTo(fromDist + (to - fromDist) * (t * t * (3 - 2 * t)), false);
        loop.step(1 / 30, 1);
      }
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

    // ---- intro (ART_BIBLE §8): off for intro=0, capture, reduced motion, the gallery.
    const runIntro = !params.freeze && params.intro && !reduced && !params.gallery && curtain;
    let hudShownByIntro = false;
    if ((runIntro || introCapture) && curtain) {
      const cw = testScene.cameraWorld;
      const hero =
        cw.islands.find((i) => (i.archetypeName ?? i.name) === 'Hearthholm') ?? cw.islands[0];
      hud?.setLabelsHidden(true);
      const it = createIntro({
        cam,
        heroX: hero?.cx ?? cw.centerX,
        heroZ: hero?.cz ?? cw.centerZ,
        onCurtainOpen: () => {
          hud?.dockWordmark();
          if (!introCapture) void curtain.open();
        },
        onLabels: () => hud?.setLabelsHidden(false),
        onHud: () => {
          hudShownByIntro = true;
          hud?.show();
        },
        onDone: () => {
          loop.remove(it);
          intro = null;
          cam.setIdleOrbit(true, true);
          for (const [type, fn] of skipListeners) window.removeEventListener(type, fn);
        },
      });
      intro = it;
      cam.setIdleOrbit(false);
      const skip = (): void => it.skip();
      const skipListeners: Array<[string, () => void]> = [
        ['pointerdown', skip],
        ['keydown', skip],
        ['wheel', skip],
        ['touchstart', skip],
      ];
      if (introCapture) {
        // Deterministic still of the sequence at `introt` seconds (TASK-181 timing review).
        const t = params.introt;
        it.seek(t);
        curtain.setProgress((t - INTRO.curtainAt) / INTRO.curtainSeconds);
        if (t >= INTRO.duration) {
          it.dispose();
          intro = null;
          cam.applyPreset('overview', false);
        }
        loop.step(1 / 30, 1);
      } else {
        curtain.setClosed();
        loop.add(it);
        for (const [type, fn] of skipListeners)
          window.addEventListener(type, fn, { passive: true });
      }
    }
    await loader.finish();
    if (!params.freeze) loop.start();
    if (!runIntro && !introCapture) hud?.show();
    else if (!hudShownByIntro) hud?.showWordmark();
    if (params.panel) hud?.openPanel(params.panel);
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
    dolly: () => {},
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
