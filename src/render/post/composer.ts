import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  FXAAEffect,
  KernelSize,
  RenderPass,
  TiltShiftEffect,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import type { Scope } from '../../core/scope.ts';
import type { EnvState } from '../../env/env-state.ts';
import { LIGHTING } from '../../content/palette.ts';
import { NIGHT, POST } from '../../content/lighting.ts';
import { SHARED } from '../uniforms.ts';
import { MarGradeEffect } from './grade-effect.ts';
import { bandOffset, zoomBlurAt } from './zoom-blur.ts';

/**
 * pmndrs post chain (ARCHITECTURE §3 "Post", ART_BIBLE §3). Passes:
 *   medium: Render → [TiltShift + Bloom + Grade + ToneMapping NEUTRAL] → [FXAA]
 *   high:   Render(MSAA×4) → [TiltShift] → [DOF, enabled at T3 only] → [Bloom + Grade + ToneMapping]
 * Bloom: mipmap blur, gated so only emissives / sun disc / glints bloom. At night
 * (SHARED.uSkyNight.z) intensity rises × NIGHT.bloomBoost and the threshold drops to
 * NIGHT.bloomThreshold so windows, lanterns, moon and the beam flare glow (TASK-171).
 * Grade = saturation, lifted blacks, golden overlay, night shift, coloured vignette.
 * FXAA samples neighbours of its input, so it gets its own pass after tone
 * mapping. Tier/env changes only touch uniforms and pass.enabled — no recompiles.
 */
export interface PostChain {
  composer: EffectComposer;
  render(dt: number): void;
  setSize(w: number, h: number): void;
  /** Zoom tier 0–3: the blur fallback without a pinned focus. Also polled from SHARED.uTier in render(). */
  setTier(tier: number): void;
  /** Golden-hour overlay + debug-mask bypass. Also polled from SHARED in render(). */
  setEnv(env: EnvState): void;
  /** Pin the DOF focus (and the zoom-blur distance) to the orbit target; null → screen-centre ray ∩ sea plane, tier blur. */
  setFocus(target: THREE.Vector3 | null): void;
  dispose(): void;
}

export function createPostChain(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  msaa: number,
  scope: Scope,
): PostChain {
  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
    multisampling: msaa,
  });
  const useDof = msaa > 0; // high preset (only preset with MSAA) also owns DOF
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new BloomEffect({
    // ADD, not pmndrs' default SCREEN: screen (a + b − ab) darkens HDR pixels > 1, which put a
    // saturated / rainbow ring around the sun disc and bright emissives (TASK-171)
    blendFunction: BlendFunction.ADD,
    luminanceThreshold: POST.bloomThreshold,
    luminanceSmoothing: POST.bloomSmoothing,
    intensity: LIGHTING.bloom.strength,
    mipmapBlur: true,
    radius: LIGHTING.bloom.radius,
  });
  const tilt = new TiltShiftEffect({
    kernelSize: KernelSize.SMALL,
    focusArea: 10,
    feather: POST.tiltFeather,
  });
  // skip the Kawase blur entirely while tilt-shift is off (T0 / DOF tier)
  let tiltActive = false;
  const tiltUpdate = tilt.update.bind(tilt);
  tilt.update = (r, input, dt) => {
    if (tiltActive) tiltUpdate(r, input, dt);
  };

  let dofPass: EffectPass | null = null;
  let dof: DepthOfFieldEffect | null = null;
  const focus = new THREE.Vector3();
  if (useDof) {
    dof = new DepthOfFieldEffect(camera, {
      focusDistance: 30,
      focusRange: POST.dofFocusRange,
      bokehScale: LIGHTING.tiltShift[3].blur / 2,
    });
    dof.target = focus;
    dofPass = new EffectPass(camera, dof);
    dofPass.enabled = false;
    composer.addPass(dofPass);
  }

  const grade = new MarGradeEffect();
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
  if (dofPass) {
    // high: tilt-shift must precede DOF, so it gets its own pass
    composer.addPass(new EffectPass(camera, tilt), composer.passes.indexOf(dofPass));
    composer.addPass(new EffectPass(camera, bloom, grade, tone));
  } else {
    // medium: one merged pass; tilt first so bloom is added on top of the band blur
    composer.addPass(new EffectPass(camera, tilt, bloom, grade, tone));
  }
  if (msaa === 0) composer.addPass(new EffectPass(camera, new FXAAEffect()));
  // TASK-495: only the RenderPass draws geometry, always into `inputBuffer`; the ping-pong
  // `outputBuffer` (a clone) only takes full-screen effect quads, so its depth renderbuffer was
  // never read (7.9 MB at 1920×1080). Kept when a pass needs the depth texture (high: DOF).
  if (composer.outputBuffer.depthTexture === null) {
    composer.outputBuffer.depthBuffer = false;
    composer.outputBuffer.stencilBuffer = false;
    composer.outputBuffer.dispose();
  }

  const setTilt = (band: number, blurPx: number): void => {
    tiltActive = band > 0 && blurPx > 0;
    // the effect's vertical coordinate runs −1..1; sharp where |y| < 1 − 2·band
    tilt.focusArea = tiltActive ? 1 - 2 * band + POST.tiltFeather : 10;
    tilt.blurPass.scale = tiltActive ? blurPx / POST.tiltPxPerScale : 0;
  };

  // DOF focus: screen-centre ray ∩ sea plane unless pinned via setFocus
  let focusPinned = false;
  const _fwd = new THREE.Vector3();
  const _cp = new THREE.Vector3();
  const centreFocus = (): void => {
    camera.getWorldPosition(_cp);
    camera.getWorldDirection(_fwd);
    const t = _fwd.y < -1e-3 ? -_cp.y / _fwd.y : 200;
    focus.copy(_cp).addScaledVector(_fwd, Math.min(t, 1500));
  };

  let tier = 0;
  let bloomNight = 0;
  let band = -1;
  let blurPx = -1;
  let bokeh = -1;
  const _ndc = new THREE.Vector3();
  // blur from the orbit distance (camera → pinned focus) via zoomBlurAt, else from the tier: tilt-shift
  // band / blur and DOF bokeh / range continuous in distance, weakening as you zoom in (TASK-586,
  // POST_ZOOM); the sharp band centred on the target's screen height; DOF only while bokeh > 0
  const applyBlur = (): void => {
    const off = focusPinned ? bandOffset(_ndc.copy(focus).project(camera).y) : 0;
    if (off !== tilt.offset) tilt.offset = off;
    const z = zoomBlurAt(
      focusPinned ? camera.getWorldPosition(_cp).distanceTo(focus) : null,
      tier,
      !!dof,
    );
    if (z.band !== band || z.blur !== blurPx) {
      band = z.band;
      blurPx = z.blur;
      setTilt(band, blurPx);
    }
    if (dof && dofPass) {
      if (z.bokeh !== bokeh) {
        bokeh = z.bokeh;
        dofPass.enabled = bokeh > 0;
        if (bokeh > 0) dof.bokehScale = bokeh;
      }
      dof.cocMaterial.focusRange = z.focusRange;
    }
  };
  const chain: PostChain = {
    composer,
    render(dt) {
      // self-driving from the shared uniforms (written by world-view each frame)
      chain.setTier(SHARED.uTier.value);
      grade.setGolden(SHARED.uGolden.value);
      grade.setNight(SHARED.uNight.value);
      grade.setMask(SHARED.uDebugMask.value > 0.5);
      grade.setWeatherSaturation(SHARED.uWeatherGrade.value);
      const nb = SHARED.uSkyNight.value.z;
      if (nb !== bloomNight) {
        bloomNight = nb;
        bloom.intensity = LIGHTING.bloom.strength * (1 + (NIGHT.bloomBoost - 1) * nb);
        bloom.luminanceMaterial.threshold =
          POST.bloomThreshold + (NIGHT.bloomThreshold - POST.bloomThreshold) * nb;
      }
      applyBlur();
      if (dofPass?.enabled && !focusPinned) centreFocus();
      composer.render(dt);
    },
    setSize(w, h) {
      composer.setSize(w, h);
    },
    setTier(t) {
      tier = t;
    },
    setEnv(env) {
      grade.setGolden(env.golden);
      grade.setNight(env.night);
      grade.setMask(SHARED.uDebugMask.value > 0.5);
    },
    setFocus(target) {
      focusPinned = target !== null;
      if (target) focus.copy(target);
    },
    dispose() {
      composer.dispose();
    },
  };
  applyBlur();
  scope.add(chain);
  return chain;
}
