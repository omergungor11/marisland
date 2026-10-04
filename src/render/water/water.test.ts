import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Scope } from '../../core/scope.ts';
import { WATER_BANDS } from '../../content/palette.ts';
import { WATER_SHADER } from '../../content/water.ts';
import { FIELDS_GLSL } from '../shaders/chunks/fields.glsl.ts';
import { SHARED } from '../uniforms.ts';
import type { WorldTextures } from '../world-textures.ts';
import type { WorldData } from '../../world/types.ts';
import { bandDefines, bandForDistance, leewardScale } from './water-bands.ts';
import { createRadialGrid, ringRadius } from './water-geometry.ts';
import { createFoamTrail } from './foam-trail.ts';
import { WATER_FRAG, WATER_VERT, waterDefines } from './water.glsl.ts';
import { createWater } from './water.ts';

describe('water bands', () => {
  it('maps shore distance to the ART_BIBLE bands', () => {
    expect(bandForDistance(0)).toBe('lagoon');
    expect(bandForDistance(2.99)).toBe('lagoon');
    expect(bandForDistance(3)).toBe('shallow');
    expect(bandForDistance(11.9)).toBe('shallow');
    expect(bandForDistance(12)).toBe('mid');
    expect(bandForDistance(34.9)).toBe('mid');
    expect(bandForDistance(35)).toBe('deep');
    expect(bandForDistance(500)).toBe('deep');
  });
  it('GLSL gets the same thresholds as #defines', () => {
    const d = bandDefines();
    expect(d).toContain(`#define MAR_LAGOON_MAX ${WATER_BANDS.lagoonMax}.0`);
    expect(d).toContain(`#define MAR_SHALLOW_MAX ${WATER_BANDS.shallowMax}.0`);
    expect(d).toContain(`#define MAR_MID_MAX ${WATER_BANDS.midMax}.0`);
    expect(d).toContain(`#define MAR_LEEWARD_SCALE ${WATER_BANDS.leewardRingScale}`);
    expect(waterDefines()).toContain(d);
  });
  it('leeward coasts get the wider ring', () => {
    // wind blows +x; the downwind (leeward) coast's shore normal points back at the island (−x)
    expect(leewardScale(-1, 0, 1, 0)).toBeCloseTo(WATER_BANDS.leewardRingScale);
    expect(leewardScale(1, 0, 1, 0)).toBeCloseTo(1);
    expect(leewardScale(0, 1, 1, 0)).toBeCloseTo(1 + (WATER_BANDS.leewardRingScale - 1) / 2);
  });
});

describe('water shader source', () => {
  it('uses the shared swell field in both stages', () => {
    for (const src of [WATER_VERT, WATER_FRAG]) {
      expect(src).toContain(FIELDS_GLSL);
      expect(src).toMatch(/marSwellY\(\s*(wp\.xz|xz)/);
    }
    expect(WATER_VERT).toContain('uMotionScale');
    expect(WATER_FRAG).toContain('#include <tonemapping_fragment>');
    expect(WATER_FRAG).toContain('#include <colorspace_fragment>');
    expect(WATER_FRAG).toContain('uDebugMask');
  });
});

describe('radial grid', () => {
  const g = WATER_SHADER.grid;
  it('spans inner → outer radius geometrically and faces +y', () => {
    expect(ringRadius(0, g)).toBeCloseTo(g.innerRadius);
    expect(ringRadius(g.rings - 1, g)).toBeCloseTo(g.outerRadius);
    const geo = createRadialGrid(g);
    expect(geo.getAttribute('position').count).toBe(1 + g.rings * g.segments);
    const pos = geo.getAttribute('position');
    const idx = geo.getIndex()!;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < idx.count; i += 3) {
      a.fromBufferAttribute(pos, idx.getX(i));
      b.fromBufferAttribute(pos, idx.getX(i + 1));
      c.fromBufferAttribute(pos, idx.getX(i + 2));
      const n = b.sub(a).cross(c.sub(a));
      expect(n.y).toBeGreaterThan(0);
    }
    geo.dispose();
  });
  it('covers the horizon of the farthest T0 view (800 u, FOV 35°, pitch ≥ 58°)', () => {
    // upper frustum edge at pitch 58° − 17.5° hits the sea this far away horizontally,
    // widened by the 16:9 corner ray
    const h = 800 * Math.sin((58 * Math.PI) / 180);
    const back = 800 * Math.cos((58 * Math.PI) / 180);
    const reach = back + h / Math.tan(((58 - 17.5) * Math.PI) / 180);
    expect(g.outerRadius * 0.8).toBeGreaterThan(reach * 1.5);
  });
});

describe('foam trail', () => {
  const o = { size: 64, extent: 64, decayPerStep: 0.98, stepSec: 1 / 30 };
  it('splats a disc and decays with time, not frames', () => {
    const t = createFoamTrail(o);
    t.splat(10, -5, 6, 1);
    expect(t.active).toBe(true);
    expect(t.sample(10, -5)).toBeGreaterThan(0.9);
    expect(t.sample(30, 30)).toBe(0);
    const v0 = t.sample(10, -5);
    t.step(0);
    t.step(1); // 30 steps
    const v1 = t.sample(10, -5);
    expect(v1 / v0).toBeCloseTo(Math.pow(0.98, 30), 2);
    // same elapsed time split into many frames → same decay
    const u = createFoamTrail(o);
    u.splat(10, -5, 6, 1);
    u.step(0);
    for (let i = 1; i <= 60; i++) u.step(i / 60);
    expect(u.sample(10, -5)).toBeCloseTo(v1, 3);
    t.step(60);
    expect(t.active).toBe(false);
    expect((t.texture.image.data as Uint8Array)[0]).toBe(0);
  });
});

describe('createWater', () => {
  it('builds one ShaderMaterial on shared uniforms and owns its resources', () => {
    const scope = new Scope('test');
    const tex = (): THREE.DataTexture =>
      new THREE.DataTexture(new Uint16Array(4), 2, 2, THREE.RedFormat, THREE.HalfFloatType);
    const textures: WorldTextures = {
      height: tex(),
      sdf: tex(),
      zone: new THREE.DataTexture(new Uint8Array(4), 2, 2, THREE.RedFormat),
      uGridMap: { value: new THREE.Vector3(-384, -384, 1 / 768) },
      update: () => ({
        height: 'none',
        sdf: 'none',
        zone: 'none',
        heightRect: null,
        sdfRect: null,
        zoneRect: null,
        geometryRect: null,
        colorRect: null,
        uploadMs: 0,
      }),
      prewarm: () => {},
    };
    const w = createWater({} as WorldData, textures, 'low', scope);
    const mat = w.mesh.material as THREE.ShaderMaterial;
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(true);
    expect(w.mesh.renderOrder).toBe(10);
    expect(mat.defines.MAR_DIRECT).toBeDefined();
    expect(mat.uniforms.uTime).toBe(SHARED.uTime);
    expect(mat.uniforms.uSwell).toBe(SHARED.uSwell);
    expect(mat.uniforms.uGridMap).toBe(textures.uGridMap);
    expect(scope.size).toBeGreaterThanOrEqual(3); // geometry, material, trail texture
    w.update(new THREE.Vector3(13.2, 50, -7.1), 1);
    expect(w.mesh.position.x).toBe(14);
    expect(w.mesh.position.z).toBe(-8);
    const med = createWater({} as WorldData, textures, 'medium', scope);
    expect((med.mesh.material as THREE.ShaderMaterial).defines.MAR_DIRECT).toBeUndefined();
    scope.dispose();
  });
});
