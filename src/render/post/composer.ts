import * as THREE from 'three';
import {
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import type { Scope } from '../../core/scope.ts';

/**
 * pmndrs post chain skeleton (ARCHITECTURE §3 "Post"). TASK-104 adds bloom,
 * tilt-shift, grade and vignette; this minimal chain validates HalfFloat + MSAA
 * through pmndrs in the container (TASK-007) and keeps Neutral tone mapping last.
 */
export interface PostChain {
  composer: EffectComposer;
  render(dt: number): void;
  setSize(w: number, h: number): void;
  dispose(): void;
}

export function createPostChain(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  msaa: number,
  scope: Scope,
): PostChain {
  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
    multisampling: msaa,
  });
  composer.addPass(new RenderPass(scene, camera));
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
  const effectPass = new EffectPass(camera, tone);
  composer.addPass(effectPass);
  const chain: PostChain = {
    composer,
    render(dt) {
      composer.render(dt);
    },
    setSize(w, h) {
      composer.setSize(w, h);
    },
    dispose() {
      composer.dispose();
    },
  };
  scope.add(chain);
  return chain;
}
