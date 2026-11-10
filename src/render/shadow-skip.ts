import * as THREE from 'three';
import { SHADOW_CULL } from '../content/budgets.ts';

type Dir = { readonly x: number; readonly y: number; readonly z: number };

/**
 * TASK-652: can a shadow caster darken anything the camera sees? A caster sphere (`c`, `r`) shades
 * the points below it along the light: the segment from `c` away from the sun (`sunDir`, unit,
 * toward the light, y > 0) down to the lowest receiver height `floorY`. When that swept sphere lies
 * wholly outside one plane of the view `frustum`, its shadow lands off screen. Conservative: a
 * capsule cut by no single plane counts as reaching the view.
 */
export function shadowReachesView(
  c: THREE.Vector3,
  r: number,
  sunDir: Dir,
  frustum: THREE.Frustum,
  floorY: number,
): boolean {
  const len = Math.max(0, c.y + r - floorY) / Math.max(sunDir.y, 1e-3);
  for (const p of frustum.planes) {
    const da = p.distanceToPoint(c);
    const db = da - len * (p.normal.x * sunDir.x + p.normal.y * sunDir.y + p.normal.z * sunDir.z);
    if (da < -r && db < -r) return false;
  }
  return true;
}

export interface ShadowSkip {
  /** Frame start: casters skipped last frame cast again (their owners may set the flag only on change). */
  restore(): void;
  /** After the owners' updates: direct children of `roots` whose shadow lands off view stop casting. */
  skip(camera: THREE.Camera, sunDir: Dir): void;
}

/**
 * The view-fitted shadow box is a square in light space, so it holds casters whose shadow lands
 * off screen — since TASK-611 the LOD0 groups of every island in reach of a wide T1 view, and the
 * terrain chunks beside the frame. Each would cost a shadow-pass draw call for nothing.
 */
export function createShadowSkip(roots: readonly THREE.Object3D[]): ShadowSkip {
  const skipped: THREE.Object3D[] = [];
  const frustum = new THREE.Frustum();
  const pv = new THREE.Matrix4();
  const c = new THREE.Vector3();
  return {
    restore() {
      for (const o of skipped) o.castShadow = true;
      skipped.length = 0;
    },
    skip(camera, sunDir) {
      frustum.setFromProjectionMatrix(
        pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      );
      for (const root of roots)
        for (const o of root.children) {
          if (!o.castShadow || !o.visible) continue;
          const m = o as THREE.Mesh & { boundingSphere?: THREE.Sphere | null };
          const sph = m.boundingSphere ?? m.geometry?.boundingSphere;
          if (!sph) continue;
          c.copy(sph.center).applyMatrix4(m.matrixWorld);
          const r = sph.radius * m.matrixWorld.getMaxScaleOnAxis() + SHADOW_CULL.margin;
          if (shadowReachesView(c, r, sunDir, frustum, SHADOW_CULL.floorY)) continue;
          o.castShadow = false;
          skipped.push(o);
        }
    },
  };
}
