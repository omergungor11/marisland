import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fitShadow, frustumSlabPoints, type ShadowFit } from './shadows.ts';
import { SHADOW, fitFogExp2 } from '../content/lighting.ts';
import { LIGHTING } from '../content/palette.ts';

function cam(x: number, y: number, z: number): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(35, 16 / 9, 0.5, 3000);
  c.position.set(x, y, z);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c;
}

describe('fitted shadows', () => {
  it('frustum ∩ slab points all lie inside the slab', () => {
    const c = cam(0, 120, 160);
    const pts = Array.from({ length: 32 }, () => new THREE.Vector3());
    const n = frustumSlabPoints(c, 600, SHADOW.slabMinY, SHADOW.slabMaxY, pts);
    expect(n).toBeGreaterThan(3);
    for (let i = 0; i < n; i++) {
      expect(pts[i].y).toBeGreaterThanOrEqual(SHADOW.slabMinY - 1e-6);
      expect(pts[i].y).toBeLessThanOrEqual(SHADOW.slabMaxY + 1e-6);
    }
  });

  it('box is texel-snapped, capped and stable under sub-texel pans', () => {
    const light = new THREE.DirectionalLight();
    const sun = new THREE.Vector3(-0.4, 0.8, 0.3).normalize();
    const fit: ShadowFit = { size: 0, texel: 0, points: 0 };
    const c = cam(0, 90, 110);
    fitShadow(light, c, sun, new THREE.Vector3(), 1024, 760, fit);
    expect(fit.size).toBeLessThanOrEqual(760);
    expect(fit.size % SHADOW.sizeStep).toBe(0);
    const p1 = light.position.clone();
    // pan the camera by a fraction of a texel: light position must move by whole texels only
    c.position.x += fit.texel * 0.3;
    c.updateMatrixWorld();
    const size1 = fit.size;
    fitShadow(light, c, sun, new THREE.Vector3(fit.texel * 0.3, 0, 0), 1024, 760, fit);
    if (fit.size === size1) {
      const basis = new THREE.Matrix4().lookAt(
        sun,
        new THREE.Vector3(),
        new THREE.Vector3(0, 1, 0),
      );
      const x = new THREE.Vector3();
      const y = new THREE.Vector3();
      const z = new THREE.Vector3();
      basis.extractBasis(x, y, z);
      const d = light.position.clone().sub(p1);
      const dx = d.dot(x) / fit.texel;
      const dy = d.dot(y) / fit.texel;
      expect(Math.abs(dx - Math.round(dx))).toBeLessThan(1e-3);
      expect(Math.abs(dy - Math.round(dy))).toBeLessThan(1e-3);
    }
    // T0 distance: capped
    fitShadow(light, cam(0, 520, 300), sun, new THREE.Vector3(), 1024, 760, fit);
    expect(fit.size).toBe(760);
    expect(light.shadow.camera.far).toBeGreaterThan(light.shadow.camera.near);
  });

  it('fog fit follows the bible curve within tolerance', () => {
    const d = fitFogExp2(LIGHTING.fogAt);
    const f = (x: number): number => 1 - Math.exp(-((d * x) ** 2));
    expect(f(700)).toBeGreaterThan(0.35);
    expect(f(700)).toBeLessThan(0.5);
    expect(f(1200)).toBeGreaterThan(0.7);
    expect(f(200)).toBeLessThan(0.12);
  });
});
