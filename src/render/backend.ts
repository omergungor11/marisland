import * as THREE from 'three';
import type { Quality } from '../core/params.ts';
import { QUALITY_PRESETS } from '../core/quality.ts';

/**
 * RendererBackend (ARCHITECTURE A1). WebGL2 only (D-001). Everything GPU-specific
 * stays in render/.
 */
export interface BackendOptions {
  canvas: HTMLCanvasElement;
  quality: Quality;
  /** Capture mode: preserve the drawing buffer for reliable screenshots. */
  capture: boolean;
  dprOverride: number;
  useComposer: boolean;
}

export interface RendererBackend {
  readonly renderer: THREE.WebGLRenderer;
  readonly rendererString: string;
  readonly isSoftware: boolean;
  readonly dpr: number;
  resize(width: number, height: number): void;
  dispose(): void;
}

export function createBackend(o: BackendOptions): RendererBackend {
  THREE.ColorManagement.enabled = true;
  const preset = QUALITY_PRESETS[o.quality];
  const renderer = new THREE.WebGLRenderer({
    canvas: o.canvas,
    antialias: !o.useComposer,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: o.capture,
    alpha: false,
    stencil: false,
    depth: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = o.useComposer ? THREE.NoToneMapping : THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = preset.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;

  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererString = ext
    ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
  const isSoftware = /swiftshader|llvmpipe|software/i.test(rendererString);

  const dpr = Number.isFinite(o.dprOverride)
    ? o.dprOverride
    : Math.min(window.devicePixelRatio || 1, preset.dprCap);
  renderer.setPixelRatio(dpr);

  return {
    renderer,
    rendererString,
    isSoftware,
    dpr,
    resize(width, height) {
      renderer.setSize(width, height, false);
    },
    dispose() {
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
