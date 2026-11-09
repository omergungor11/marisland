import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ATTR_LOCATION,
  FRAG_FLAT_NORMAL,
  PROGRAM_FEATURES,
  allVariantKeys,
  makeDepthMaterial,
  makeLitMaterial,
  resolveVariant,
  type LitFeatures,
} from './factory.ts';
import { SURFACE_UNIFORMS, setSurfaceQuality } from '../shaders/chunks/surface.glsl.ts';
import { bakeCreases } from '../props/creases.ts';
import { BLINK } from '../../content/activity.ts';
import {
  CREASE_CODES,
  EMISSIVE_STRIDE,
  MATERIAL_CLASS_COUNT,
  decodeSurface,
  emissiveBase,
  encodeSurface,
} from '../../content/materials.ts';

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
    expect(shader.vertexShader).toContain('marSpringIn(uTime - marAppear');
    expect(shader.fragmentShader).toContain('marBayer4(gl_FragCoord.xy)');
    expect(shader.uniforms.uFadeNear).toBe(m.fade.uFadeNear);
  });

  it('guards the flat-shaded normal against NaN right after three computes it (TASK-435)', () => {
    // the guard reuses three's fdx / fdy: an upgrade renaming them must fail here, not at link time
    expect(THREE.ShaderChunk.normal_fragment_begin).toMatch(
      /#ifdef FLAT_SHADED\s*vec3 fdx = dFdx\( vViewPosition \);\s*vec3 fdy = dFdy\( vViewPosition \);\s*vec3 normal = normalize\( cross\( fdx, fdy \) \);/,
    );
    const m = makeLitMaterial({ rim: true });
    expect(m.flatShading).toBe(true);
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      defines: {} as Record<string, unknown>,
      vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
    };
    m.onBeforeCompile(shader as never, undefined as never);
    expect(shader.fragmentShader).toContain('#include <normal_fragment_begin>' + FRAG_FLAT_NORMAL);
    // degenerate (0) and overflowing (Inf / NaN) cross products fall back to a camera-facing normal
    expect(FRAG_FLAT_NORMAL).toContain('marL2 > 1e-30 && marL2 < 1e30');
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
    expect(shader.vertexShader).toContain('marSpringIn(uTime - marAppear');
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

describe('surface detail (TASK-594)', () => {
  const compile = (m: THREE.Material) => {
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      defines: {} as Record<string, unknown>,
      vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
    };
    m.onBeforeCompile(shader as never, undefined as never);
    return shader;
  };

  it('adds no define and no program: same key, uniform-driven, shared quality switch', () => {
    const m = makeLitMaterial({ rim: true, emissive: true, dither: true });
    const s = compile(m);
    expect(m.customProgramCacheKey()).toBe('mar-lit');
    expect(Object.keys(s.defines).sort()).toEqual(
      Object.keys(compile(makeLitMaterial({})).defines).sort(),
    );
    expect(s.uniforms.uSurface).toBe(SURFACE_UNIFORMS.uSurface);
    expect(s.uniforms.uMarSurf.value).toBe(1);
    expect(compile(makeLitMaterial({})).uniforms.uMarSurf.value).toBe(0);
    expect(s.uniforms.uMarClassA.value).toHaveLength(MATERIAL_CLASS_COUNT);
    expect(s.fragmentShader).toContain('vMarEdge');
    setSurfaceQuality('low');
    expect(SURFACE_UNIFORMS.uSurface.value.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    setSurfaceQuality('medium');
    expect(SURFACE_UNIFORMS.uSurface.value.toArray().slice(0, 3)).toEqual([1, 1, 1]);
  });

  it('class packing round-trips every class × emissive code × crease bits', () => {
    const bases = [0, 0.3, 0.35, 0.4, 0.5, 0.8, 1, 2, BLINK.base, BLINK.base + 1];
    for (let cls = 0; cls < MATERIAL_CLASS_COUNT; cls++)
      for (let crease = 0; crease < CREASE_CODES; crease++)
        for (const b0 of bases) {
          const base = Math.fround(b0);
          const e = Math.fround(encodeSurface(base, cls, crease));
          const d = decodeSurface(e);
          expect(d.cls).toBe(cls);
          expect(d.crease).toBe(crease);
          expect(d.base).toBeCloseTo(base, 4);
          expect(emissiveBase(e)).toBeCloseTo(base, 4);
        }
    // untagged codes keep their value bit-for-bit
    for (const b of bases) expect(encodeSurface(b, 0, 0)).toBe(b);
    expect(Math.max(...bases)).toBeLessThan(EMISSIVE_STRIDE);
  });

  it('bakeCreases marks box edges, not the coplanar diagonals, and keeps the class / glow', () => {
    const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const n = g.getAttribute('position').count;
    g.setAttribute(
      'emissive',
      new THREE.BufferAttribute(new Float32Array(n).fill(encodeSurface(1, 2)), 1),
    );
    bakeCreases(g);
    const em = g.getAttribute('emissive');
    for (let t = 0; t < em.count / 3; t++) {
      const d = decodeSurface(em.getX(t * 3));
      expect(d.cls).toBe(2);
      expect(d.base).toBe(1);
      // a box face triangle: its 2 outer edges are creases, the diagonal is not
      expect([1, 2, 4].filter((b) => (d.crease & b) !== 0)).toHaveLength(2);
    }
    // a flat quad (cloth / pane): no creases, no attribute added
    const q = new THREE.PlaneGeometry(1, 1).toNonIndexed();
    expect(bakeCreases(q).getAttribute('emissive')).toBeUndefined();
  });
});
