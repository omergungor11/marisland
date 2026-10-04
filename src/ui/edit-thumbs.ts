import * as THREE from 'three';
import { Scope } from '../core/scope.ts';
import { PROP_DEFS } from '../content/props.ts';
import { EDIT_THUMBS } from '../content/edit-ui.ts';
import { buildProp } from '../geo/index.ts';
import { createPropMaterials } from '../render/materials/prop-materials.ts';
import { LitMaterial } from '../render/materials/factory.ts';
import { SHARED } from '../render/uniforms.ts';
import { HOVER_UNIFORMS } from '../render/materials/hover.ts';

/**
 * Prop-picker thumbnails (TASK-221). Every requested def is built exactly like a PropBatcher
 * instance (same `buildProp` geometry, one-instance `InstancedBufferGeometry`, the prop material
 * from `prop-materials.ts`) and rendered once into a tile of a small offscreen atlas canvas with a
 * dedicated `WebGLRenderer`; the atlas is read back once and each tile is encoded on a CPU 2D
 * canvas and cached as a PNG data URL. The
 * renderer, its context, geometries and materials are disposed right after (nothing survives but
 * strings), so the main renderer's programs / memory counters are untouched.
 *
 * The lit material reads the app-wide `SHARED` uniforms (night, lamps, cloud shadows, mist, lantern
 * pools, hover): they are set to a neutral daylight state for the synchronous render and restored
 * right after — no frame of the main renderer can see the change. `uPoolTex` is nulled so no world
 * texture is uploaded into the second context.
 */

/** Matches the batcher's always-visible `aAppear` (bloom-in long finished). */
const ALWAYS_APPEAR = -1e3;
const DEG = Math.PI / 180;

const cache = new Map<string, string>();

/** Cached data URL of a def's thumbnail (undefined until `renderPropThumbs` covered it). */
export function propThumb(def: string): string | undefined {
  return cache.get(def);
}

export interface ThumbStats {
  /** Thumbnails rendered by this call (0 when all were cached). */
  rendered: number;
  /** Wall time of the call (ms). */
  ms: number;
}

type MathValue = THREE.Vector3 | THREE.Vector4 | THREE.Color;
const isMath = (v: unknown): v is MathValue =>
  v instanceof THREE.Vector3 || v instanceof THREE.Vector4 || v instanceof THREE.Color;

/**
 * Run `fn` with the shared lit uniforms in a neutral daylight state, then restore them. Vectors /
 * colours are mutated in place (other holders keep the same object) and restored by value; plain
 * values and textures are swapped by reference (never cloned: a cloned texture is a new upload).
 */
export function withNeutralShared(fn: () => void): void {
  const restore: Array<() => void> = [];
  const set = <T>(u: { value: T }, v: T): void => {
    const cur = u.value;
    if (isMath(cur) && isMath(v)) {
      const old = cur.clone();
      (cur as THREE.Vector4).copy(v as THREE.Vector4);
      restore.push(() => (cur as THREE.Vector4).copy(old as THREE.Vector4));
    } else {
      u.value = v;
      restore.push(() => {
        u.value = cur;
      });
    }
  };
  set(SHARED.uNight, 0);
  set(SHARED.uLamps, new THREE.Vector3(0, 0, 0));
  set(SHARED.uMotionScale, 0);
  set(SHARED.uDebugMask, 0);
  set(SHARED.uTime, 0);
  set(SHARED.uCloudShadow, new THREE.Vector4(0, 0, 0, 0));
  set(SHARED.uMist, new THREE.Vector4(0, 1, 0, 0));
  set(SHARED.uPoolMap, new THREE.Vector4(0, 0, 1, 0));
  set(SHARED.uPoolTex, null);
  set(SHARED.uHorizon, new THREE.Color(EDIT_THUMBS.horizon));
  set(HOVER_UNIFORMS.uHover, new THREE.Vector4(0, 0, 0, 0));
  try {
    fn();
  } finally {
    for (let i = restore.length - 1; i >= 0; i--) restore[i]();
  }
}

/**
 * Render (once) the thumbnails of `defs` that are not cached yet. Synchronous; deterministic for
 * a given GPU/driver (capture renders the same bytes every time).
 */
export function renderPropThumbs(defs: readonly string[]): ThumbStats {
  const t0 = performance.now();
  const todo = defs
    .filter((id) => !cache.has(id))
    .map((id) => PROP_DEFS.find((p) => p.id === id))
    .filter((d): d is (typeof PROP_DEFS)[number] => !!d);
  if (todo.length === 0) return { rendered: 0, ms: performance.now() - t0 };

  const T = EDIT_THUMBS;
  const size = T.size;
  const cols = Math.min(T.cols, todo.length);
  const rows = Math.ceil(todo.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * size;
  canvas.height = rows * size;
  const scope = new Scope('edit-thumbs');
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      // read back in the same task as the draws: no need to preserve the drawing buffer
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(1);
    renderer.setSize(canvas.width, canvas.height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    renderer.setScissorTest(true);

    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(new THREE.Color(T.sun.color), T.sun.intensity);
    sun.position.set(T.sun.dir[0], T.sun.dir[1], T.sun.dir[2]);
    scene.add(sun, sun.target);
    scene.add(
      new THREE.HemisphereLight(
        new THREE.Color(T.hemi.sky),
        new THREE.Color(T.hemi.ground),
        T.hemi.intensity,
      ),
    );
    const camera = new THREE.PerspectiveCamera(T.fov, 1, 0.05, 1000);
    const mats = createPropMaterials(scope);
    const dir = new THREE.Vector3(
      Math.sin(T.yaw * DEG) * Math.cos(T.pitch * DEG),
      Math.sin(T.pitch * DEG),
      Math.cos(T.yaw * DEG) * Math.cos(T.pitch * DEG),
    );
    const sphere = new THREE.Sphere();
    const r = renderer;
    withNeutralShared(() => {
      todo.forEach((def, n) => {
        const base = scope.add(
          buildProp(def.geo, T.seed, Math.min(T.variant, def.variants - 1), 0),
        );
        const geo = scope.add(new THREE.InstancedBufferGeometry());
        for (const name of Object.keys(base.attributes))
          geo.setAttribute(name, base.attributes[name]);
        if (base.index) geo.setIndex(base.index);
        geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array([0]), 1));
        geo.setAttribute(
          'aAppear',
          new THREE.InstancedBufferAttribute(new Float32Array([ALWAYS_APPEAR]), 1),
        );
        const mat = mats.materialFor(def, 0, false);
        if (mat instanceof LitMaterial) {
          // no distance dither: the thumbnail camera is not the world camera
          mat.fade.uFadeNear.value = 1e6;
          mat.fade.uFadeFar.value = 2e6;
        }
        const mesh = new THREE.InstancedMesh(geo, mat, 1);
        mesh.setMatrixAt(0, new THREE.Matrix4());
        mesh.frustumCulled = false;
        scope.defer(() => mesh.dispose());
        base.computeBoundingBox();
        (base.boundingBox ?? new THREE.Box3()).getBoundingSphere(sphere);
        const rad = Math.max(sphere.radius, 0.05);
        const dist = rad / Math.sin((T.fov * DEG) / 2) / T.fill;
        camera.position.copy(sphere.center).addScaledVector(dir, dist);
        camera.near = Math.max(0.01, dist - rad * 2);
        camera.far = dist + rad * 2;
        camera.lookAt(sphere.center);
        camera.updateProjectionMatrix();
        const col = n % cols;
        const row = Math.floor(n / cols);
        const y = canvas.height - (row + 1) * size;
        r.setViewport(col * size, y, size, size);
        r.setScissor(col * size, y, size, size);
        r.clear();
        scene.add(mesh);
        r.render(scene, camera);
        scene.remove(mesh);
      });
    });
    // ONE synchronous readback of the whole atlas (`readPixels`), then CPU-only tiles: every GPU
    // round trip waits for the main context's queued frames (seconds on a busy software GPU)
    const W = canvas.width;
    const H = canvas.height;
    const px = new Uint8Array(W * H * 4);
    const gl = r.getContext();
    r.setRenderTarget(null);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const tile = document.createElement('canvas');
    tile.width = size;
    tile.height = size;
    const ctx = tile.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      const img = ctx.createImageData(size, size);
      const d = img.data;
      todo.forEach((def, n) => {
        const x0 = (n % cols) * size;
        // GL rows run bottom-up; the tile's top row is the highest GL row
        const yTop = H - Math.floor(n / cols) * size - 1;
        for (let y = 0; y < size; y++) {
          const src = ((yTop - y) * W + x0) * 4;
          const dst = y * size * 4;
          for (let x = 0; x < size * 4; x += 4) {
            const a = px[src + x + 3];
            // the drawing buffer is premultiplied; ImageData is straight alpha
            const k = a > 0 ? 255 / a : 0;
            d[dst + x] = Math.min(255, Math.round(px[src + x] * k));
            d[dst + x + 1] = Math.min(255, Math.round(px[src + x + 1] * k));
            d[dst + x + 2] = Math.min(255, Math.round(px[src + x + 2] * k));
            d[dst + x + 3] = a;
          }
        }
        ctx.putImageData(img, 0, 0);
        cache.set(def.id, tile.toDataURL('image/png'));
      });
    }
  } catch (e) {
    console.warn('[marisland] prop thumbnails failed', e);
  } finally {
    scope.dispose();
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
    }
    canvas.width = 0;
    canvas.height = 0;
  }
  return { rendered: todo.length, ms: performance.now() - t0 };
}
