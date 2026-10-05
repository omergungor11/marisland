import { describe, expect, it } from 'vitest';
import {
  collectPoolSources,
  poolFalloff,
  poolLayout,
  PoolSources,
  splatPools,
  splatPoolsRect,
} from './lantern-pools.ts';
import { createPropStore, PropFlag } from '../../world/prop-store.ts';
import { PROP_DEF_INDEX } from '../../content/props.ts';
import { buildBeamGeometry } from './beam.ts';
import * as THREE from 'three';
import { BEAM, NIGHT, POOLS, POST } from '../../content/lighting.ts';
import { makeLitMaterial } from '../materials/factory.ts';
import { POOL_HEIGHT_RANGE } from '../shaders/chunks/night.glsl.ts';

describe('lantern pools (TASK-171)', () => {
  it('returns null without sources', () => {
    expect(splatPools([])).toBeNull();
  });

  it('splats a soft pool: bright core, zero outside the rim, height in G', () => {
    const s = splatPools([{ x: 10, z: -4, y: 6.4, r: 4, k: 1 }]);
    expect(s).not.toBeNull();
    if (!s) return;
    const at = (x: number, z: number): [number, number] => {
      const i = Math.floor(((x - s.originX) / s.extent) * s.size);
      const j = Math.floor(((z - s.originZ) / s.extent) * s.size);
      const k = (j * s.size + i) * 2;
      return [s.data[k], s.data[k + 1]];
    };
    const [core, h] = at(10, -4);
    // D14: lower peak than a full-bright disc (the lamp stays brighter than its pool)
    expect(core).toBeGreaterThan(90);
    expect(core).toBeLessThan(235);
    expect((h / 255) * POOL_HEIGHT_RANGE).toBeCloseTo(6.4, 0);
    // small core, long soft tail, nothing beyond the wobbly rim (r × (1 + wobble))
    expect(at(12, -4)[0]).toBeLessThan(core * 0.5);
    expect(at(13, -4)[0]).toBeGreaterThan(0);
    expect(at(10 + 4 * (1 + POOLS.wobble + 0.03), -4)[0]).toBe(0);
  });

  it('falloff: peak < 1, quadratic tail, 0 at the rim (D14)', () => {
    expect(poolFalloff(0)).toBeCloseTo(POOLS.falloff.peak);
    expect(poolFalloff(0)).toBeLessThan(1);
    expect(poolFalloff(1)).toBe(0);
    let prev = poolFalloff(0);
    for (let t = 0.05; t < 1; t += 0.05) {
      const v = poolFalloff(t);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
    // inverse-square-like: at 2× the core radius ≈ 1/5 of the peak
    expect(poolFalloff(2 * POOLS.falloff.core) / poolFalloff(0)).toBeLessThan(0.25);
  });

  it('is deterministic', () => {
    const src = [
      { x: 0, z: 0, y: 1, r: 3, k: 0.5 },
      { x: 2, z: 1, y: 1, r: 4, k: 1 },
    ];
    const a = splatPools(src);
    const b = splatPools(src);
    expect(a?.data).toEqual(b?.data);
  });
});

describe('lantern pools follow edits (TASK-213)', () => {
  const lamps = () => {
    const s = createPropStore(32);
    const L = PROP_DEF_INDEX.lanternPost;
    s.push(L, 0, 0, 1, 0, 0, 1, 0, 0, 0);
    s.push(L, 0, 30, 2, 10, 0, 1, 0, 0, 0);
    s.push(L, 0, 12, 1.5, 28, 0, 1, 0, 0, 0);
    s.push(PROP_DEF_INDEX.pine, 0, 6, 1, 6, 0, 1, 0, 0, 0); // no pool
    return s;
  };

  it('skips removed props', () => {
    const s = lamps();
    expect(collectPoolSources(s)).toHaveLength(3);
    s.flags[1] |= PropFlag.removed;
    expect(collectPoolSources(s)).toHaveLength(2);
  });

  it('a local re-splat equals a fresh splat over the same layout (move, remove, add)', () => {
    const s = lamps();
    const book = new PoolSources(s);
    const full = splatPools(book.list())!;
    const layout = poolLayout(book.list())!;
    const data = full.data.slice();
    const step = (indices: number[]): void => {
      const t = book.touch(indices, layout);
      expect(t.changed).toBe(true);
      expect(t.outside).toBe(false);
      splatPoolsRect(book.list(), layout, t.rect!, data);
      const want = new Uint8Array(layout.size * layout.size * 2);
      splatPoolsRect(book.list(), layout, { x: 0, y: 0, w: layout.size, h: layout.size }, want);
      expect(data).toEqual(want);
    };
    s.x[0] = 4; // move inside the layout
    step([0]);
    s.flags[1] |= PropFlag.removed; // remove
    step([1]);
    s.push(PROP_DEF_INDEX.lanternPost, 0, 20, 1, 20, 0, 1, 0, 0, 0); // add
    step([s.count - 1]);
    // an unrelated / unchanged index is a no-op
    expect(book.touch([3], layout).changed).toBe(false);
  });

  it('a pool outside the layout asks for a rebuild', () => {
    const s = lamps();
    const book = new PoolSources(s);
    const layout = poolLayout(book.list())!;
    s.push(PROP_DEF_INDEX.lanternPost, 0, 400, 1, 400, 0, 1, 0, 0, 0);
    const t = book.touch([s.count - 1], layout);
    expect(t.changed).toBe(true);
    expect(t.outside).toBe(true);
    const grown = poolLayout(book.list())!;
    expect(grown.originX + grown.extent).toBeGreaterThan(400);
  });
});

describe('lighthouse beam geometry (TASK-171)', () => {
  it('builds front + back cones and a flare quad with bounded size', () => {
    const g = buildBeamGeometry();
    const kinds = g.getAttribute('aBeam');
    let front = 0;
    let back = 0;
    let flare = 0;
    for (let i = 0; i < kinds.count; i++) {
      const k = kinds.getY(i);
      if (k === 0) front++;
      else if (k === 1) back++;
      else flare++;
    }
    expect(front).toBe(back);
    expect(flare).toBe(4);
    const pos = g.getAttribute('position');
    let maxX = 0;
    for (let i = 0; i < pos.count; i++) maxX = Math.max(maxX, Math.abs(pos.getX(i)));
    expect(maxX).toBeCloseTo(BEAM.length, 3);
    expect(g.boundingSphere?.radius).toBeGreaterThanOrEqual(BEAM.length);
    g.dispose();
  });
});

describe('screen emissive class (TASK-305)', () => {
  const litVertex = (): string => {
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      defines: {} as Record<string, unknown>,
      vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
    };
    makeLitMaterial({ emissive: true }).onBeforeCompile(shader as never, undefined as never);
    return shader.vertexShader;
  };

  it('day glow of a white screen stays under the bloom threshold', () => {
    expect(NIGHT.screenDay).toBeGreaterThan(0);
    expect(NIGHT.screenDay * NIGHT.emissiveGain).toBeLessThan(POST.bloomThreshold);
    const fl = NIGHT.screenFlicker;
    expect(fl.amp + fl.scrollAmp).toBeLessThan(0.2);
  });

  it('screens branch off before the lamp switch and never go dark late', () => {
    const vs = litVertex();
    const a = vs.indexOf('if (vMarEmissive >= 1.5)');
    const b = vs.indexOf('} else if (vMarEmissive > 0.0)');
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    const screen = vs.slice(a, b);
    expect(screen).toContain('uLamps.x');
    expect(screen).not.toContain('uLamps.y');
    expect(screen).not.toContain('uLampMode.y');
  });

  // TS twin of the grade's screen spare (grade-effect.ts, linear HDR input)
  const cool = (r: number, g: number, b: number): number => {
    const ss = (e0: number, e1: number, x: number): number => {
      const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };
    const [l0, l1, c0, c1] = POST.nightScreenSpare;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return ss(l0, l1, l) * ss(c0, c1, 1 - r / Math.max(g, b, 1e-4));
  };

  it('night grade spares bright cyan/blue screens, not moonlit blues or warm lamps', () => {
    const lin = (hex: string, k: number): [number, number, number] => {
      const c = new THREE.Color(hex);
      return [c.r * k, c.g * k, c.b * k];
    };
    // a lit screen: albedo × (1 + emissiveGain)
    expect(cool(...lin('#4FD2FF', 1 + NIGHT.emissiveGain))).toBe(1);
    expect(cool(...lin('#3C7BFF', 1 + NIGHT.emissiveGain))).toBeGreaterThan(0.5);
    // moonlit teal roof / night water / moon-halo sky: too dark to qualify
    expect(cool(...lin('#3FA7B0', 0.35))).toBe(0);
    expect(cool(...lin('#1B3A6B', 1))).toBe(0);
    // warm window / lantern: chroma test fails (red is the largest channel)
    expect(cool(...lin('#FFB347', 3))).toBe(0);
  });

  it('pool sources for the Phase 3 lamps', () => {
    for (const geo of ['stoneLantern', 'coffeeKiosk', 'broadcastStudio']) {
      expect(POOLS.sources[geo]?.radius).toBeGreaterThan(0);
    }
    expect(NIGHT.alwaysOn).toContain('stoneLantern');
  });
});
