import * as THREE from 'three';
import { LIGHTING } from '../content/palette.ts';
import { SHADOW } from '../content/lighting.ts';

/**
 * Fitted directional shadow (ARCHITECTURE §3 "Shadows"): the camera frustum,
 * truncated at a focus-relative distance, is intersected with the slab
 * y ∈ [slabMinY, slabMaxY]; the intersection's light-space AABB (size quantised,
 * centre snapped to whole texels so panning does not shimmer) becomes the
 * ortho shadow camera. Zero allocations per frame.
 */
export interface ShadowFit {
  /** Side of the fitted box (u) and the resulting texel size (u). */
  size: number;
  texel: number;
  /** Number of slab points the fit used (0 → fell back to focus box). */
  points: number;
}

const NDC: readonly [number, number, number][] = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
];
const EDGES: readonly [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

const _corners = Array.from({ length: 8 }, () => new THREE.Vector3());
const _pts = Array.from({ length: 8 + 24 }, () => new THREE.Vector3());
const _proj = new THREE.Matrix4();
const _invProj = new THREE.Matrix4();
const _basis = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _o = new THREE.Vector3();
const _cam = new THREE.Vector3();

/** Collect frustum ∩ slab vertices into `_pts`; returns count. */
export function frustumSlabPoints(
  camera: THREE.PerspectiveCamera,
  far: number,
  minY: number,
  maxY: number,
  out: THREE.Vector3[] = _pts,
): number {
  // projection with the truncated far plane
  const near = camera.near;
  const top = near * Math.tan((THREE.MathUtils.DEG2RAD * 0.5 * camera.fov) / camera.zoom);
  const height = 2 * top;
  const width = camera.aspect * height;
  _proj.makePerspective(
    -0.5 * width,
    0.5 * width,
    top,
    top - height,
    near,
    Math.max(far, near + 1),
  );
  _invProj.copy(_proj).invert();
  camera.updateMatrixWorld();
  for (let i = 0; i < 8; i++) {
    const c = NDC[i];
    _corners[i].set(c[0], c[1], c[2]).applyMatrix4(_invProj).applyMatrix4(camera.matrixWorld);
  }
  let n = 0;
  for (let i = 0; i < 8; i++) {
    const y = _corners[i].y;
    if (y >= minY && y <= maxY) out[n++].copy(_corners[i]);
  }
  for (const [a, b] of EDGES) {
    const pa = _corners[a];
    const pb = _corners[b];
    const dy = pb.y - pa.y;
    if (Math.abs(dy) < 1e-9) continue;
    for (const py of [minY, maxY]) {
      const t = (py - pa.y) / dy;
      if (t > 0 && t < 1) out[n++].copy(pa).lerp(pb, t);
    }
  }
  return n;
}

/**
 * Fit `light`'s shadow camera. `sunDir` points toward the light (unit),
 * `focus` is the look-at point on the sea plane, `maxSize` caps the box side.
 */
export function fitShadow(
  light: THREE.DirectionalLight,
  camera: THREE.PerspectiveCamera,
  sunDir: THREE.Vector3,
  focus: THREE.Vector3,
  mapSize: number,
  maxSize: number,
  out: ShadowFit,
): ShadowFit {
  // light basis, identical to Object3D.lookAt for a camera at +sunDir looking at the origin
  _basis.lookAt(sunDir, _o.set(0, 0, 0), _up);
  _basis.extractBasis(_x, _y, _z);

  camera.getWorldPosition(_cam);
  const focusDist = _cam.distanceTo(focus);
  const far = THREE.MathUtils.clamp(focusDist * SHADOW.farK, SHADOW.farMin, SHADOW.farMax);
  const n = frustumSlabPoints(camera, far, SHADOW.slabMinY, SHADOW.slabMaxY);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  if (n === 0) {
    const r = SHADOW.farMin;
    const fx = focus.dot(_x);
    const fy = focus.dot(_y);
    const fz = focus.dot(_z);
    minX = fx - r;
    maxX = fx + r;
    minY = fy - r;
    maxY = fy + r;
    minZ = fz - r;
    maxZ = fz + r;
  } else {
    for (let i = 0; i < n; i++) {
      const p = _pts[i];
      const px = p.dot(_x);
      const py = p.dot(_y);
      const pz = p.dot(_z);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;
    }
  }

  // square box, quantised side, capped (T0 accepts softer shadows around the focus)
  let size = Math.max(maxX - minX, maxY - minY);
  size = Math.ceil(size / SHADOW.sizeStep) * SHADOW.sizeStep;
  let cx = (minX + maxX) / 2;
  let cy = (minY + maxY) / 2;
  if (size > maxSize) {
    size = maxSize;
    // keep the capped box on the near half of the view: centre between focus and box centre
    const fx = focus.dot(_x);
    const fy = focus.dot(_y);
    cx = THREE.MathUtils.clamp(fx, minX + size / 2, maxX - size / 2);
    cy = THREE.MathUtils.clamp(fy, minY + size / 2, maxY - size / 2);
  }
  const texel = size / mapSize;
  cx = Math.round(cx / texel) * texel;
  cy = Math.round(cy / texel) * texel;

  // casters above the slab region toward the light: reach / sin(elevation)
  const reach = SHADOW.casterReach / Math.max(sunDir.y, 0.12);
  const lightZ = maxZ + reach;
  light.position
    .set(0, 0, 0)
    .addScaledVector(_x, cx)
    .addScaledVector(_y, cy)
    .addScaledVector(_z, lightZ);
  light.target.position.copy(light.position).sub(sunDir);
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();

  const sc = light.shadow.camera;
  const half = size / 2;
  sc.left = -half;
  sc.right = half;
  sc.top = half;
  sc.bottom = -half;
  sc.near = 0.5;
  sc.far = lightZ - minZ + 4;
  sc.updateProjectionMatrix();

  light.shadow.normalBias = THREE.MathUtils.clamp(
    texel * SHADOW.normalBiasPerTexel,
    SHADOW.normalBiasMin,
    SHADOW.normalBiasMax,
  );
  light.shadow.radius = THREE.MathUtils.clamp(
    LIGHTING.shadowPenumbra / texel,
    SHADOW.pcfMin,
    SHADOW.pcfMax,
  );

  out.size = size;
  out.texel = texel;
  out.points = n;
  return out;
}
