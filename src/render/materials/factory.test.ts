import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ATTR_LOCATION,
  PROGRAM_FEATURES,
  allVariantKeys,
  makeDepthMaterial,
  makeLitMaterial,
  resolveVariant,
  type LitFeatures,
} from './factory.ts';

const FLAGS = ['wind', 'bloomIn', 'dither', 'emissive', 'rim'] as const;

function combos(): LitFeatures[] {
  const out: LitFeatures[] = [];
  for (let m = 0; m < 1 << FLAGS.length; m++) {
    const f: LitFeatures = {};
    FLAGS.forEach((fl, i) => {
      if (m & (1 << i)) f[fl] = true;
    });
    out.push(f);
  }
  return out;
}

describe('material factory', () => {
  it('every one of the 2^5 feature combos keeps its look switches exactly', () => {
    for (const req of combos()) {
      const v = resolveVariant(req);
      expect(v.features.bloomIn).toBe(!!req.bloomIn);
      expect(v.features.rim).toBe(!!req.rim);
      const m = makeLitMaterial(req);
      const shader = {
        uniforms: {} as Record<string, THREE.IUniform>,
        defines: {} as Record<string, unknown>,
        vertexShader: THREE.ShaderLib.lambert.vertexShader,
        fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
      };
      m.onBeforeCompile(shader as never, undefined as never);
      expect(shader.uniforms.uMarBloomIn.value).toBe(req.bloomIn ? 1 : 0);
      expect(shader.uniforms.uMarRim.value).toBe(req.rim ? 1 : 0);
    }
  });

  it('all combos (incl. windmill spin) share ONE program key (D-016)', () => {
    const keys = new Set(
      combos().flatMap((c) => [
        makeLitMaterial(c).customProgramCacheKey(),
        makeLitMaterial({ ...c, spin: true }).customProgramCacheKey(),
      ]),
    );
    expect([...keys]).toEqual(allVariantKeys());
    const depth = new Set(
      combos().flatMap((c) => [
        makeDepthMaterial(c).customProgramCacheKey(),
        makeDepthMaterial({ ...c, spin: true }).customProgramCacheKey(),
      ]),
    );
    expect(depth.size).toBe(1);
  });

  it('every material compiles identical shader source and defines (only uniforms differ)', () => {
    const src = (req: LitFeatures): string => {
      const shader = {
        uniforms: {} as Record<string, THREE.IUniform>,
        defines: {} as Record<string, unknown>,
        vertexShader: THREE.ShaderLib.lambert.vertexShader,
        fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
      };
      makeLitMaterial(req).onBeforeCompile(shader as never, undefined as never);
      return JSON.stringify([shader.defines, shader.vertexShader, shader.fragmentShader]);
    };
    const ref = src(PROGRAM_FEATURES);
    for (const req of combos()) expect(src(req)).toBe(ref);
    expect(src({ spin: true, rim: true })).toBe(ref);
  });

  it('smooth adds its own key', () => {
    const s = makeLitMaterial({ rim: true, smooth: true });
    expect(s.customProgramCacheKey()).not.toBe(
      makeLitMaterial({ rim: true }).customProgramCacheKey(),
    );
    expect(s.flatShading).toBe(false);
    expect(makeLitMaterial({}).flatShading).toBe(true);
    expect(allVariantKeys(true)).toContain(s.customProgramCacheKey());
  });

  it('patches the r186 Lambert chunks with the variant defines', () => {
    const m = makeLitMaterial({
      wind: true,
      bloomIn: true,
      rim: true,
      dither: true,
      emissive: true,
    });
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      defines: {} as Record<string, unknown>,
      vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
    };
    m.onBeforeCompile(shader as never, undefined as never);
    for (const d of [
      'MAR_WIND',
      'MAR_BLOOM_IN',
      'MAR_DITHER',
      'MAR_EMISSIVE',
      'MAR_RIM',
      'MAR_SPIN',
    ]) {
      expect(shader.defines).toHaveProperty(d);
    }
    expect(shader.vertexShader).toContain('marGustAt(marOrigin.xz');
    expect(shader.vertexShader).toContain('marSpringIn(uTime - aAppear');
    expect(shader.fragmentShader).toContain('marBayer4(gl_FragCoord.xy)');
    expect(shader.uniforms.uFadeNear).toBe(m.fade.uFadeNear);
  });

  it('depth material carries the same displacement', () => {
    const lit = makeLitMaterial({ wind: true, bloomIn: true, dither: true });
    const d = makeDepthMaterial({ wind: true, bloomIn: true, dither: true }, lit.fade);
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      defines: {} as Record<string, unknown>,
      vertexShader: THREE.ShaderLib.depth.vertexShader,
      fragmentShader: THREE.ShaderLib.depth.fragmentShader,
    };
    d.onBeforeCompile(shader as never, undefined as never);
    expect(shader.vertexShader).toContain('marGustAt(marOrigin.xz');
    expect(shader.vertexShader).toContain('marSpringIn(uTime - aAppear');
    expect(shader.uniforms.uFadeFar).toBe(lit.fade.uFadeFar);
    expect(shader.uniforms.uMarBloomIn.value).toBe(1);
    expect(d.customProgramCacheKey()).toBe(`${lit.variant.key}:depth`);
  });

  it('optional attributes sit on fixed, unique locations above the built-ins', () => {
    const locs = Object.values(ATTR_LOCATION);
    expect(new Set(locs).size).toBe(locs.length);
    for (const l of locs) expect(l).toBeGreaterThanOrEqual(8);
    for (const l of locs) expect(l).toBeLessThan(16);
    const m = makeLitMaterial({});
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      defines: {} as Record<string, unknown>,
      vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
    };
    m.onBeforeCompile(shader as never, undefined as never);
    for (const n of Object.keys(m.defaultAttributeValues) as (keyof typeof ATTR_LOCATION)[])
      expect(shader.vertexShader).toContain(`layout(location = ${ATTR_LOCATION[n]}) attribute`);
  });
});
