import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createShadowSkip, shadowReachesView } from './shadow-skip.ts';

// camera at the origin looking down −z, 60° fov, square
const cam = new THREE.PerspectiveCamera(60, 1, 1, 1000);
cam.updateMatrixWorld();
const frustum = new THREE.Frustum().setFromProjectionMatrix(
  new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
);
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const overhead = { x: 0, y: 1, z: 0 };

describe('shadow skip (TASK-652)', () => {
  it('keeps casters in view and casters whose shadow falls into view', () => {
    expect(shadowReachesView(v(0, 0, -100), 5, overhead, frustum, -6)).toBe(true);
    // beside the frame, low sun from +x: the shadow sweeps toward +x… away from the view
    const fromLeft = new THREE.Vector3(-1, 0.3, 0).normalize();
    expect(shadowReachesView(v(120, 0, -100), 5, fromLeft, frustum, -6)).toBe(false);
    // …sun from +x: the shadow of a tall caster sweeps back into the frame
    const fromRight = new THREE.Vector3(1, 0.3, 0).normalize();
    expect(shadowReachesView(v(120, 30, -100), 5, fromRight, frustum, -6)).toBe(true);
  });

  it('drops casters behind the camera with the sun overhead', () => {
    expect(shadowReachesView(v(0, 0, 50), 5, overhead, frustum, -6)).toBe(false);
  });

  it('skips off-view casters for one frame and restores them', () => {
    const root = new THREE.Group();
    const geo = new THREE.BoxGeometry(2, 2, 2);
    geo.computeBoundingSphere();
    const inView = new THREE.Mesh(geo);
    inView.position.set(0, 0, -100);
    const behind = new THREE.Mesh(geo);
    behind.position.set(0, 0, 80);
    for (const m of [inView, behind]) {
      m.castShadow = true;
      root.add(m);
    }
    root.updateMatrixWorld(true);
    const skip = createShadowSkip([root]);
    skip.skip(cam, overhead);
    expect([inView.castShadow, behind.castShadow]).toEqual([true, false]);
    skip.restore();
    expect(behind.castShadow).toBe(true);
    geo.dispose();
  });
});
