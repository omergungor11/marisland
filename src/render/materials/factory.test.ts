import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  MATERIAL_VARIANTS,
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
  it('every one of the 2^5 feature combos resolves to a covering variant', () => {
    for (const req of combos()) {
      const v = resolveVariant(req);
      for (const fl of FLAGS) {
        if (req[fl]) expect(v.features[fl], `${v.id} lacks ${fl}`).toBe(true);
      }
      // look-changing features match exactly
      expect(v.features.bloomIn).toBe(!!req.bloomIn);
      expect(v.features.rim).toBe(!!req.rim);
    }
  });

  it('all combos map onto ≤ 12 distinct program keys (prewarm list)', () => {
    const keys = new Set(combos().map((c) => makeLitMaterial(c).customProgramCacheKey()));
    expect(keys.size).toBeLessThanOrEqual(12);
    expect(keys.size).toBe(MATERIAL_VARIANTS.length);
    expect([...keys].sort()).toEqual(allVariantKeys().sort());
  });

  it('distinct variants have distinct keys; smooth adds its own key', () => {
    const keys = MATERIAL_VARIANTS.map((v) => makeLitMaterial(v.features).customProgramCacheKey());
    expect(new Set(keys).size).toBe(keys.length);
    const s = makeLitMaterial({ rim: true, smooth: true });
    expect(s.customProgramCacheKey()).not.toBe(
      makeLitMaterial({ rim: true }).customProgramCacheKey(),
    );
    expect(s.flatShading).toBe(false);
    expect(makeLitMaterial({}).flatShading).toBe(true);
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
    for (const d of ['MAR_WIND', 'MAR_BLOOM_IN', 'MAR_DITHER', 'MAR_EMISSIVE', 'MAR_RIM']) {
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
    expect(d.customProgramCacheKey()).toBe(`${lit.variant.key}:depth`);
  });
});
