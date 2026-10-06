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
import type { Counters, MarislandApi, PerfResult, RenderInfo } from './capture/api.ts';
import { Governor, governorLabel, governorLevels, type GovernorAction } from './core/governor.ts';
import { GOVERNOR, GOVERNOR_DPR_FLOOR, PERF_PATH } from './content/governor.ts';
import { runPerfPath } from './debug/perf.ts';
import { createGpuTimer, type GpuTimer } from './render/gpu-timer.ts';
import { measureGpuMemory, type GpuMemory } from './render/gpu-memory.ts';
import { orbitPoseOf } from './camera/perf-path.ts';
import { createCameraSystem, lookFromOrbit, type CameraSystem } from './camera/controls.ts';
import { buildGallery } from './render/gallery-scene.ts';
import { buildWorldView } from './render/world-view.ts';
import { SHARED } from './render/uniforms.ts';
import { createHud, type Hud } from './ui/hud.ts';
import { createCurtain } from './ui/curtain.ts';
import { createIntro, type Intro } from './camera/intro.ts';
import { ISLAND_ACCENTS } from './content/islands-ui.ts';
import { HUD, INTRO } from './content/ui.ts';
import { CAMERA } from './content/tiers.ts';
import { FRAMING } from './content/camera.ts';
import { loadPrefs, storePrefs, type UiPrefs } from './ui/settings.ts';
import { photoFilename } from './ui/hud-math.ts';
import type { WeatherName } from './core/params.ts';
import type { TestScene } from './render/test-scene.ts';
import { createInteraction, type Interaction } from './interact/interaction.ts';
import type { PickHit } from './interact/picking.ts';
// ---- edit mode (TASK-212) imports
import { editHash, heightAt as worldHeightAt, type WorldData } from './world/index.ts';
import type { DirtyRegion } from './world/edit-types.ts';
import { createEditSession, type EditSession } from './edit/session.ts';
import type { HistoryLike, StorageLike, WorldEditApi } from './edit/session-types.ts';
import { createToolState } from './edit/tools.ts';
import { createBrushCursor } from './edit/cursor.ts';
import { createGhost } from './edit/ghost.ts';
import { createEditMode, editCameraOf, EDIT_FALLBACKS, type EditMode } from './edit/edit-mode.ts';
import type { WorldView } from './render/world-view.ts';
import {
  loadWorldEditApi,
  type WorldEditApi as LoadedWorldEditApi,
} from './edit/world-edit-api.ts';
import { SessionHistory } from './edit/session-history.ts';
import { createEditApplier } from './edit/apply.ts';
import { runEditSelftest, testBrush } from './render/rebuild-testing.ts';
import { staticEditBinding } from './ui/edit-panel.ts';
import { EDIT_PANEL } from './content/edit-ui.ts';

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

// ---- edit mode (TASK-212) injection points: the orchestrator maps these onto TASK-201
// (`world/edit.ts`: applyEdit, canPlace, encodeLog, decodeLog) and TASK-211 (`edit/history.ts`)
// after merge. Until then the fallbacks reject every edit and keep no history.
let loadedEditApi: LoadedWorldEditApi | null = null;
const worldEditApi = (): WorldEditApi<WorldData> | null => {
  const api = loadedEditApi;
  if (!api) return null;
  return {
    applyEdit: api.applyEdit,
    encodeLog: api.encodeLog,
    decodeLog: api.decodeLog,
    canPlace: (w, cmd) => {
      const r = api.canPlace?.(w, cmd);
      return r === undefined ? { ok: true } : typeof r === 'boolean' ? { ok: r } : r;
    },
  };
};
const createEditHistory = (): HistoryLike => new SessionHistory();
const editStorage = (): StorageLike | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

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
        rebuilds: 0,
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

    /** GPU timer queries around each frame while a `perf` run is active. */
    let gpuTimer: GpuTimer | null = null;
    // GPU memory (D-022): summed from the allocations when read (harness snapshot, stats), at
    // most once per rendered frame — no per-frame cost
    let gpuMem: GpuMemory | null = null;
    let gpuMemFrame = -1;
    const gpuMemory = (): GpuMemory => {
      const r = backend.renderer;
      if (!gpuMem || r.info.render.frame !== gpuMemFrame) {
        gpuMemFrame = r.info.render.frame;
        const t = now();
        gpuMem = measureGpuMemory(r, scene, ctx.post?.composer ?? null);
        ctx.timings.gpuMemoryMs = now() - t;
      }
      return gpuMem;
    };
    Object.defineProperty(ctx.counters, 'gpuMemoryMB', {
      enumerable: true,
      get: () => Math.round(gpuMemory().total),
    });
    const gpuParts: [string, (g: GpuMemory) => number][] = [
      ['gpuGeometryMB', (g) => g.geometry],
      ['gpuTextureMB', (g) => g.textures],
      ['gpuTargetMB', (g) => g.targets],
      ['gpuShadowMB', (g) => g.shadow],
      ['gpuCanvasMB', (g) => g.canvas],
    ];
    for (const [key, part] of gpuParts)
      Object.defineProperty(ctx.timings, key, {
        enumerable: true,
        get: () => Math.round(part(gpuMemory()) * 10) / 10,
      });
    const render = (): void => {
      const r = backend.renderer;
      r.info.reset();
      gpuTimer?.begin();
      if (ctx.post) ctx.post.render(1 / 60);
      else r.render(scene, camera);
      gpuTimer?.end();
      readInfo(r, ctx.info);
      const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      if (mem) ctx.timings.jsHeapMB = Math.round(mem.usedJSHeapSize / 1048576);
      if (stats)
        stats.update(
          1000 / Math.max(frameMs, 1),
          loop.cpuMs,
          ctx.info,
          ctx.tier,
          ctx.counters,
          governorLabel(governor.state),
        );
    };
    let frameMs = 16.7;
    let lastT = now();
    const loop = new Loop({ manual: params.freeze, render, now });
    ctx.loop = loop;

    // ---- quality governor (TASK-191, ARCHITECTURE §8): DPR first, then the detail-tier cap.
    // Off in capture (determinism), under `perf=1` (measure the quality as configured) and while
    // photo mode is frozen. An explicit `?dpr=` pins the pixel ratio (tier steps only).
    const dprFloor = Number.isFinite(params.dpr)
      ? backend.dpr
      : Math.min(backend.dpr, GOVERNOR_DPR_FLOOR[quality]);
    const governor = new Governor(
      governorLevels(backend.dpr, dprFloor, GOVERNOR),
      GOVERNOR,
      now() / 1000,
    );
    if (params.freeze) governor.setDisabled('capture', true, 0);
    if (params.perf) governor.setDisabled('perf', true, 0);
    if (params.gallery) governor.setDisabled('gallery', true, 0);
    events.on('photoMode', ({ frozen }) => governor.setDisabled('photo', frozen, now() / 1000));
    /** Highest detail tier the world renders (the governor's last resort lowers it). */
    let tierCap = 3;
    // Edit mode (TASK-221): the governor holds its level and the tier cap is lifted, so the
    // detail under the brush never steps while editing (placed props stay visible).
    let editing = false;
    events.on('editModeChanged', ({ active }) => {
      editing = active;
      governor.setDisabled('edit', active, now() / 1000);
    });
    const applyGovernor = (a: GovernorAction): void => {
      if (a.to.dpr !== backend.dpr) {
        backend.setPixelRatio(a.to.dpr);
        resize();
      }
      tierCap = a.to.tierCap;
      ctx.timings.govLevel = a.level;
      ctx.timings.govDpr = a.to.dpr;
      ctx.timings.govTierCap = a.to.tierCap;
      events.emit('governorChanged', {
        level: a.level,
        dpr: a.to.dpr,
        tierCap: a.to.tierCap,
        p90: a.p90,
      });
      console.info(
        `[marisland] governor ${a.kind}: p90 ${a.p90.toFixed(1)} ms → dpr ${a.to.dpr}, tier cap ${a.to.tierCap}`,
      );
    };
    loop.add({
      name: 'frame-timer',
      update: () => {
        const t = now();
        frameMs = t - lastT;
        lastT = t;
        if (!governor.enabled) return;
        const a = governor.sample(frameMs, t / 1000);
        if (a) applyGovernor(a);
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
    /** The live world's pointer interaction (picking, hover, reactions); null in the gallery. */
    let interaction: Interaction | null = null;
    /** The live world's editor (TASK-212); null in capture / the gallery. */
    let editMode: EditMode | null = null;
    let editSession: EditSession | null = null;
    // Weather (TASK-172): `?weather=` holds a state; otherwise the world's seeded FSM cycles.
    // The HUD button (weatherChanged) switches it; auto changes sync the HUD icon.
    let worldWeather: { set(w: WeatherName): void } | null = null;
    let currentWeather: WeatherName = params.weather || 'clear';
    events.on('weatherChanged', ({ weather: w }) => {
      currentWeather = w;
      worldWeather?.set(w);
    });
    const motionScale = (): number => (cam.reducedMotion ? HUD.reducedMotionScale : 1);
    const detailTier = (): number => (editing ? cam.tier : Math.min(cam.tier, tierCap));
    loop.add({
      name: 'tier-sync',
      update: () => {
        ctx.tier = detailTier();
      },
    });

    // ---- Phase 2 edits (TASK-211): the edit model loads lazily (null when world/edit.ts is not
    // in the build); `?edit=` is replayed right after generateWorld, before the first build.
    loadedEditApi = params.gallery ? null : await loadWorldEditApi();
    const edits = createEditApplier(loadedEditApi, {
      seed: params.seed,
      encoded: params.edit,
    });
    /** The live world view (edit target, test brush); null in the gallery / while torn down. */
    let liveWorld: WorldView | null = null;

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
        getTier: detailTier,
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
        renderer: backend.renderer,
        instantEdits: params.freeze,
        beforeBuild: (w) => edits.beforeBuild(w),
        getCameraTarget: (o) => void cam.controls.getTarget(o),
      });
      liveWorld = wv;
      edits.attach({ world: wv.world, rebuildDirty: (r) => wv.rebuildDirty(r) });
      // rebuild timings / counters land in the world's timings object: mirror them each frame
      const timings = wv.timings;
      Object.assign(ctx.timings, wv.timings);
      worldLife = wv.life;
      worldWeather = wv.weather;
      if (cam.reducedMotion) wv.life.setMotionScale(motionScale());
      // picking / hover / reactions run right after the world view (agent matrices are final)
      const ia = createInteraction({
        wv,
        camera,
        dom: canvas,
        events,
        scope: worldScope,
        seed,
        quality,
        counters: ctx.counters,
        getTime: () => loop.clock.time,
        reduced: cam.reducedMotion,
        motionScale: motionScale(),
        listen: !params.freeze,
      });
      interaction = ia;

      // ---- edit mode (TASK-212) ----------------------------------------------------------
      // Per world: session (applyEdit → rebuildDirty → log → autosave), tools, brush cursor,
      // prop ghost, input routing. Not in capture (`freeze=1`: no cursor, deterministic frames).
      // `?edit=` is replayed before the build by TASK-211 (then `session.adopt(log)`); otherwise
      // the autosave for this seed is restored here.
      if (!params.freeze) {
        const we = worldEditApi();
        const rebuildable = wv as typeof wv & { rebuildDirty?: (r: DirtyRegion) => void };
        const session = createEditSession({
          seed,
          apply: we ? (cmd) => we.applyEdit(wv.world, cmd) : EDIT_FALLBACKS.apply,
          rebuild: (r) => rebuildable.rebuildDirty?.(r),
          history: createEditHistory(),
          encode: we ? we.encodeLog : EDIT_FALLBACKS.encode,
          decode: we ? we.decodeLog : EDIT_FALLBACKS.decode,
          storage: editStorage(),
          timer: {
            set: (fn, ms) => window.setTimeout(fn, ms),
            clear: (h) => window.clearTimeout(h as number),
          },
          now: () => Date.now(),
          resetWorld: () => void rebuildWorld(seed, 'keep'),
        });
        const ground = (x: number, z: number): number => worldHeightAt(wv.world.height, x, z);
        const mode = createEditMode({
          session,
          tools: createToolState(seed),
          cursor: createBrushCursor({
            terrainAt: ia.terrainAt,
            heightAt: ground,
            reduced: () => cam.reducedMotion,
          }),
          ghost: createGhost({ scope: worldScope, parent: wv.group, seed, camera }),
          interaction: ia,
          cam: editCameraOf(cam),
          events,
          dom: canvas,
          canPlace: we ? (cmd) => we.canPlace(wv.world, cmd) : EDIT_FALLBACKS.canPlace,
          heightAt: ground,
          propRotY: (id) => wv.scatter.props.rotY[id] ?? 0,
          reduced: () => cam.reducedMotion,
          listen: true,
        });
        editSession = session;
        editMode = mode;
        loop.add(mode.system);
        const bootLog = edits.log();
        if (bootLog.cmds.length) session.adopt(bootLog);
        else if (!new URLSearchParams(location.search).has('edit')) session.restore();
        const flush = (): void => session.flush();
        window.addEventListener('pagehide', flush);
        // entering edit mode ends the opening sequence (the intro owns the camera)
        const offEdit = events.on('editModeChanged', ({ active }) => {
          if (active) intro?.skip();
        });
        worldScope.defer(() => {
          offEdit();
          window.removeEventListener('pagehide', flush);
          loop.remove(mode.system);
          mode.dispose();
          session.dispose();
          if (editMode === mode) editMode = null;
          if (editSession === session) editSession = null;
        });
      }
      // ---- end edit mode (TASK-212) ------------------------------------------------------
      const system = {
        name: wv.system.name,
        fixedUpdate: (dt: number) => wv.system.fixedUpdate?.(dt),
        update: (dt: number, alpha: number) => {
          wv.system.update?.(dt, alpha);
          ia.system.update?.(dt, alpha);
          if (timings.rebuildMs !== undefined) {
            ctx.timings.rebuildMs = timings.rebuildMs;
            ctx.timings.rebuildMaxMs = timings.rebuildMaxMs;
            ctx.timings.rebuildAvgMs = timings.rebuildAvgMs;
            ctx.timings.rebuildTexMs = timings.rebuildTexMs;
            ctx.timings.rebuildUploadMs = timings.rebuildUploadMs;
            ctx.timings.rebuildPropsMs = timings.rebuildPropsMs;
          }
        },
      };
      return { group: wv.group, system, hash: wv.hash, cameraWorld: wv.cameraWorld };
    };
    const tGen = now();
    let testScene = buildWorld(params.seed);
    scene.add(testScene.group);
    worldScope.defer(() => scene.remove(testScene.group));
    loop.add(testScene.system);
    ctx.worldHash = testScene.hash;
    ctx.timings.total = now() - tGen;
    cam.setWorld(testScene.cameraWorld);
    // Fitted presets keep clear of the HUD dock + label row when the HUD is on (D2).
    cam.setSafeInsets(params.hud && !params.gallery ? FRAMING.hudInsets : FRAMING.bareInsets);
    cam.applyPreset(params.cam || 'overview', false);
    cam.setIdleOrbit(!params.freeze);

    // `introt` (capture) renders the intro at a fixed time, curtain included.
    const introCapture = params.freeze && Number.isFinite(params.introt) && !params.gallery;
    const curtain = params.freeze && !introCapture ? null : createCurtain(root, reduced);
    if (curtain) appScope.defer(() => curtain.dispose());
    // Prewarm against the composer's target when post is on: program keys include the
    // output colour space / tone mapping of the current target, so compiling for the canvas
    // would compile every program twice (once more on the first composer frame).
    const prewarm = async (): Promise<void> => {
      if (ctx.post) backend.renderer.setRenderTarget(ctx.post.composer.inputBuffer);
      try {
        await backend.renderer.compileAsync(scene, camera);
      } finally {
        backend.renderer.setRenderTarget(null);
      }
    };

    /** Free the world's GPU resources and stop its system (idempotent). */
    const teardownWorld = (): void => {
      // the session owns the interactive log: hand it to the applier so a `keep` rebuild
      // (context restore) replays the same edits before the new build
      if (editSession) edits.adoptLog(editSession.log);
      edits.attach(null);
      liveWorld = null;
      worldScope.dispose();
      loop.remove(testScene.system);
    };
    /**
     * Rebuild the world for `seed` (new seed, `api.regen`, context restore): dispose the world
     * scope (materials last), generate + build, place the camera (`overview`, or keep the
     * current orbit pose), prewarm the new programs and render one settle frame — all before
     * the caller reveals the frame, so no program compiles and no bloom-in queue on the first
     * visible frame. The RAF loop is paused meanwhile (a frame mid-`compileAsync` would compile
     * synchronously).
     */
    const rebuildWorld = async (seed: number, pose: 'overview' | 'keep'): Promise<void> => {
      const t0 = now();
      // the old world's edit mode ends with it; the new world's resumes editing (reset, new seed)
      // (capture keeps its static panel binding)
      const wasEditing = editMode?.active ?? false;
      if (!params.freeze) hud?.bindEdit(null);
      const running = loop.isRunning;
      loop.stop();
      const kept = pose === 'keep' ? orbitPoseOf(cam.controls) : null;
      // Old materials outlive the old world until the new one has compiled: three frees a
      // program when its last material is disposed, so disposing them first relinks every
      // program of the new world (≈ 0.4 s per regen under SwiftShader, TASK-191).
      const oldMaterials = worldScope.disposeExcept(isMaterial, 'world-materials');
      loop.remove(testScene.system);
      testScene = buildWorld(seed);
      scene.add(testScene.group);
      worldScope.defer(() => scene.remove(testScene.group));
      loop.add(testScene.system);
      ctx.seed = seed;
      ctx.worldHash = testScene.hash;
      api.seed = seed;
      cam.setWorld(testScene.cameraWorld);
      hud?.setWorld(testScene.cameraWorld, ISLAND_ACCENTS);
      if (!params.freeze) hud?.bindEdit(editMode);
      if (wasEditing) editMode?.setActive(true);
      if (kept) {
        lookFromOrbit(
          cam.controls,
          kept.tx,
          kept.ty,
          kept.tz,
          kept.dist,
          kept.pitch,
          kept.az,
          false,
        );
        cam.controls.update(0);
      } else cam.applyPreset('overview', false);
      const tBuilt = now();
      ctx.timings.regenBuild = tBuilt - t0;
      try {
        await prewarm();
      } finally {
        oldMaterials.dispose();
      }
      const tCompiled = now();
      ctx.timings.regenCompile = tCompiled - tBuilt;
      loop.step(1 / 30, 1);
      ctx.timings.regenMs = now() - t0;
      governor.reset(now() / 1000);
      events.emit('seedChanged', { seed });
      if (running) loop.start();
    };

    let regenBusy = false;
    const newSeed = async (seed: number): Promise<void> => {
      if (regenBusy) return;
      regenBusy = true;
      try {
        if (curtain) await curtain.close();
        await rebuildWorld(seed, 'overview');
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
          onEditPanel: (open) => editMode?.setActive(open),
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
      // ---- edit panel (TASK-221): drives the live world's edit mode; `E` / Esc / the brush
      // button / Done / photo mode all meet in `editModeChanged` ↔ `openPanel`. Capture has no
      // edit mode: `panel=edit[:tool]` shows a static panel (fixed tool, the log's change count).
      const liveEdit = editMode as EditMode | null;
      if (liveEdit) hud.bindEdit(liveEdit);
      else if (params.panel === 'edit')
        hud.bindEdit(
          staticEditBinding(
            createToolState(params.seed, { tool: params.panelTool || EDIT_PANEL.captureTool }),
            edits.log().cmds.length,
          ),
        );
      events.on('editModeChanged', ({ active }) => {
        if (active && !hud?.editing) hud?.openPanel('edit');
        else if (!active && hud?.editing) hud.openPanel('');
      });
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
    await prewarm();
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
    const asResult = (h: PickHit | null): ReturnType<MarislandApi['pick']> =>
      h
        ? {
            kind: h.kind,
            id: h.id,
            name: h.name,
            instanceIndex: h.instanceIndex,
            x: h.x,
            y: h.y,
            z: h.z,
          }
        : null;
    api.pick = (x, y) => asResult(interaction?.pickAt(x, y) ?? null);
    api.hover = (x, y) => asResult(interaction?.hoverAt(x, y) ?? null);
    api.click = (x, y) => asResult(interaction?.clickAt(x, y) ?? null);
    // `?perf=1` / api.perf(): one run at a time; a second call joins the running one.
    let perfRun: Promise<PerfResult> | null = null;
    api.perf = () => {
      if (perfRun) return perfRun;
      const gl = backend.renderer.getContext() as WebGL2RenderingContext;
      gpuTimer = params.freeze ? null : createGpuTimer(gl);
      const run = runPerfPath({
        cam,
        loop,
        now,
        manual: params.freeze,
        gl,
        gpuTimer,
        presets: PERF_PATH.presets,
        seconds: PERF_PATH.seconds,
        manualFps: PERF_PATH.manualFps,
      }).then((r) => {
        gpuTimer?.dispose();
        gpuTimer = null;
        perfRun = null;
        ctx.timings.perfP50 = r.p50;
        ctx.timings.perfP95 = r.p95;
        ctx.timings.perfFrames = r.frames;
        if (r.cpuP50 !== undefined) ctx.timings.perfCpuP50 = r.cpuP50;
        if (r.cpuP95 !== undefined) ctx.timings.perfCpuP95 = r.cpuP95;
        if (r.gpuP50 !== undefined) ctx.timings.perfGpuP50 = r.gpuP50;
        if (r.gpuP95 !== undefined) ctx.timings.perfGpuP95 = r.gpuP95;
        const gpu = r.gpuP50 !== undefined ? ` · gpu p50 ${r.gpuP50} / p95 ${r.gpuP95} ms` : '';
        console.info(
          `[marisland] perf ${PERF_PATH.seconds} s path · quality ${quality} · ${r.frames} frames · ` +
            `frame p50 ${r.p50} / p95 ${r.p95} ms · cpu p50 ${r.cpuP50} / p95 ${r.cpuP95} ms${gpu}`,
        );
        return r;
      });
      perfRun = run;
      return run;
    };
    api.regen = (seed: number) => rebuildWorld(seed, 'keep');
    // Phase 2 (TASK-211): capture mode renders the edited frame right away
    const afterEdit = (): void => {
      if (params.freeze) loop.step(1 / 30, 1);
    };
    api.edit = (cmd) => {
      const r = editSession ? editSession.apply(cmd) : edits.apply(cmd);
      if (r.ok) afterEdit();
      return r.reason === undefined ? { ok: r.ok } : { ok: r.ok, reason: r.reason };
    };
    api.undo = () => {
      const ok = editSession ? editSession.undo() : edits.undo();
      if (ok) afterEdit();
      return ok;
    };
    api.redo = () => {
      const ok = editSession ? editSession.redo() : edits.redo();
      if (ok) afterEdit();
      return ok;
    };
    api.editLog = () => (editSession ? editSession.log : edits.available ? edits.log() : null);
    api.testBrush = (x, z, r, delta) => {
      const wv = liveWorld as WorldView | null;
      if (!wv) return null;
      const res = testBrush(wv.world, x, z, r, delta);
      wv.rebuildDirty(res.dirty);
      afterEdit();
      return {
        chunks: res.dirty.chunks.length,
        props: res.dirty.props.length,
        sdf: res.dirty.sdf,
        pending: wv.rebuild.pending,
      };
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
      // generated-world hash, `:<editHash>` appended while edits are applied (sweep item 6):
      // an edited frame is told apart in the manifest, an unedited one keeps its old hash
      worldHash: {
        get: () => {
          const wv = liveWorld as WorldView | null;
          const log = api.editLog();
          return wv && log && log.cmds.length > 0
            ? `${ctx.worldHash}:${editHash(wv.world)}`
            : ctx.worldHash;
        },
      },
    });

    // ---- WebGL context loss (TASK-191, ARCHITECTURE §1): three re-inits its GL state on
    // restore; we rebuild the world from the current seed (fresh uploads + prewarm) with the
    // camera pose kept. api.ready is false between loss and the rebuilt first frame.
    let booted = false;
    let gpuReady = true;
    const restoreWaiters: Array<(err: unknown) => void> = [];
    const onLost = (e: Event): void => {
      e.preventDefault(); // without this the browser never restores the context
      gpuReady = false;
      if (booted) api.ready = false;
      loop.stop();
      // Free the world now: GL deletes on a lost context are silent no-ops, while after the
      // restore they would hit objects of the old context (INVALID_OPERATION spam).
      teardownWorld();
      ctx.timings.contextLosses = (ctx.timings.contextLosses ?? 0) + 1;
      events.emit('contextLost', { lost: true });
      console.warn('[marisland] WebGL context lost');
    };
    const onRestored = (): void => {
      const t = now();
      rebuildWorld(api.seed, 'keep')
        .then(() => {
          ctx.timings.contextRestoreMs = now() - t;
          gpuReady = true;
          if (booted) api.ready = true;
          if (booted && !params.freeze) loop.start();
          events.emit('contextLost', { lost: false });
          console.info(
            `[marisland] WebGL context restored, world rebuilt in ${(now() - t).toFixed(0)} ms`,
          );
          for (const w of restoreWaiters.splice(0)) w(null);
        })
        .catch((err: unknown) => {
          api.error = `context restore failed: ${String(err)}`;
          for (const w of restoreWaiters.splice(0)) w(err);
        });
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    appScope.defer(() => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    });

    /**
     * Leak checks compare `renderer.info.memory`, which counts a geometry from its first draw:
     * a life mesh that is hidden (`count 0`) or frustum-culled at one measurement and drawn at
     * the other (a sailboat entering the view, the wake starting) read as ±1 (sweep D4). Before
     * each measurement every object of the scene is uploaded once — all forced visible and
     * unculled for one render into the composer target (selftest pages only) — so the count is
     * every live geometry, whatever the camera sees.
     */
    const memoryAll = (): { geometries: number; textures: number } => {
      const r = backend.renderer;
      const saved: [THREE.Object3D, boolean, boolean][] = [];
      scene.traverse((o) => {
        saved.push([o, o.visible, o.frustumCulled]);
        o.visible = true;
        o.frustumCulled = false;
      });
      if (ctx.post) r.setRenderTarget(ctx.post.composer.inputBuffer);
      try {
        r.render(scene, camera);
      } finally {
        r.setRenderTarget(null);
        for (const [o, v, f] of saved) {
          o.visible = v;
          o.frustumCulled = f;
        }
      }
      return api.memory();
    };
    if (params.selftest === 'regen') await selftestRegen(api, params.seed, ctx, memoryAll);
    if (params.selftest === 'edit' && liveWorld) {
      const wv: WorldView = liveWorld;
      const r = runEditSelftest(
        {
          world: wv.world,
          rebuildDirty: (region) => wv.rebuildDirty(region),
          flush: () => wv.rebuild.flush(),
          step: () => loop.step(1 / 30, 1),
          memory: memoryAll,
          calls: () => ctx.info.calls,
          now,
        },
        params.seed,
      );
      ctx.timings.selftestEditGeoDelta = r.geoDelta;
      ctx.timings.selftestEditTexDelta = r.texDelta;
      ctx.timings.selftestEditMs = r.ms;
      ctx.timings.selftestEditCalls = r.calls;
    }
    if (params.selftest === 'ctxloss')
      await selftestContextLoss(backend.renderer, ctx, {
        isReady: () => gpuReady,
        whenRestored: () =>
          new Promise<void>((resolve, reject) =>
            restoreWaiters.push((err) => (err ? reject(err as Error) : resolve())),
          ),
        step: () => loop.step(1 / 30, 1),
      });

    // ---- intro (ART_BIBLE §8): off for intro=0, capture, reduced motion, the gallery.
    const runIntro =
      !params.freeze && params.intro && !params.perf && !reduced && !params.gallery && curtain;
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
    // (`editMode` is assigned inside buildWorld: widen the narrowed `null`)
    const bootEdit = editMode as EditMode | null;
    if (params.panel === 'edit' && params.panelTool) bootEdit?.setTool(params.panelTool);
    if (params.panel) hud?.openPanel(params.panel);
    // capture: the edit panel's thumbnails must have decoded before the screenshot
    if (params.panel && hud) await hud.settled();
    booted = true;
    api.ready = gpuReady;
    // ---- TASK-213: first-edit prewarm (interactive only, idle time after ready) ----------
    // Runs the rebuild path once on unchanged data (JIT + texSubImage2D hot); capture skips it.
    if (!params.freeze && !params.gallery) {
      // one step per idle period (no long task); a page that is never idle still gets there
      const idle = (timeout = 500): Promise<void> =>
        new Promise((resolve) => {
          if (typeof window.requestIdleCallback === 'function')
            window.requestIdleCallback(() => resolve(), { timeout });
          else window.setTimeout(resolve, 100);
        });
      const wv = liveWorld as WorldView | null;
      void idle(2000)
        .then(() => wv?.prewarmEdits(() => idle()))
        .then(() => {
          // total + per-step times (`api.timings.editPrewarm*`)
          for (const [k, v] of Object.entries(wv?.timings ?? {}))
            if (k.startsWith('editPrewarm')) ctx.timings[k] = v;
        });
    }
    // ---- end TASK-213 ----------------------------------------------------------------------
    governor.reset(now() / 1000);
    if (params.perf) void api.perf();
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

const isMaterial = (it: unknown): boolean => (it as { isMaterial?: boolean }).isMaterial === true;

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
  if (!q.has('edit') && s.edit) p.edit = s.edit;
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
      rebuilds: 0,
    },
    step: () => {},
    setCamera: () => {},
    setTime: () => {},
    dolly: () => {},
    pick: () => null,
    hover: () => null,
    click: () => null,
    perf: async () => ({ p50: 0, p95: 0, frames: 0 }),
    regen: async () => {},
    memory: () => ({ geometries: 0, textures: 0 }),
    edit: () => ({ ok: false, reason: 'not ready' }),
    undo: () => false,
    redo: () => false,
    editLog: () => null,
    testBrush: () => null,
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
async function selftestRegen(
  api: MarislandApi,
  seed: number,
  ctx: Ctx,
  memory: () => { geometries: number; textures: number },
): Promise<void> {
  const base = memory();
  for (let i = 1; i <= 5; i++) await api.regen(seed + i);
  await api.regen(seed);
  const after = memory();
  ctx.timings.selftestGeoDelta = after.geometries - base.geometries;
  ctx.timings.selftestTexDelta = after.textures - base.textures;
  if (after.geometries !== base.geometries || after.textures !== base.textures) {
    throw new Error(
      `selftest=regen leak: geometries ${base.geometries}→${after.geometries}, textures ${base.textures}→${after.textures}`,
    );
  }
}

/**
 * `?selftest=ctxloss` (TASK-191): lose the WebGL context via `WEBGL_lose_context`, restore it,
 * wait for the world rebuild, render a frame and assert the app is ready and drawing again.
 */
async function selftestContextLoss(
  renderer: THREE.WebGLRenderer,
  ctx: Ctx,
  h: { isReady(): boolean; whenRestored(): Promise<void>; step(): void },
): Promise<void> {
  const canvas = renderer.domElement;
  const ext = renderer.getContext().getExtension('WEBGL_lose_context');
  if (!ext) throw new Error('selftest=ctxloss: WEBGL_lose_context unavailable');
  const lost = new Promise<void>((resolve) =>
    canvas.addEventListener('webglcontextlost', () => resolve(), { once: true }),
  );
  ext.loseContext();
  await lost;
  // the promise resumes inside the event dispatch (microtask checkpoint after our listener);
  // Chromium only allows restoreContext once the dispatch has seen preventDefault()
  await new Promise((r) => setTimeout(r, 0));
  if (h.isReady()) throw new Error('selftest=ctxloss: still ready after context loss');
  const restored = h.whenRestored();
  ext.restoreContext();
  await restored;
  h.step();
  ctx.timings.selftestCtxCalls = ctx.info.calls;
  if (!h.isReady() || ctx.info.calls <= 0) {
    throw new Error(
      `selftest=ctxloss: ready ${String(h.isReady())}, draw calls ${ctx.info.calls} after restore`,
    );
  }
}
