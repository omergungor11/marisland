import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { THEME_IDS } from '../world/types.ts';
import { THEMES } from '../content/themes.ts';
import { buildVillager } from './geo/land.ts';
import { buildWorker } from './geo/workers.ts';
import { makeLifeMaterial } from './life-material.ts';

const attrNames = (g: { attributes: Record<string, unknown> }): string[] =>
  Object.keys(g.attributes).sort();

describe('worker bot geometry (TASK-306)', () => {
  const g = buildWorker();
  const pos = g.getAttribute('position');
  const limb = g.getAttribute('limb');
  const emi = g.getAttribute('emissive');

  it('has the villager attribute set plus emissive, and stays within 1200 triangles (accessories + carried items)', () => {
    expect(attrNames(g)).toEqual([...attrNames(buildVillager()), 'emissive'].sort());
    expect(pos.count / 3).toBeLessThanOrEqual(1200);
    expect(pos.count / 3).toBeGreaterThan(400);
  });

  it('is a ~1 u bot grounded at y = 0 (feet) with the antenna on top', () => {
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeGreaterThanOrEqual(-1e-6);
    expect(bb.min.y).toBeLessThan(0.01);
    expect(bb.max.y).toBeGreaterThan(1.0);
    expect(bb.max.y).toBeLessThan(1.4);
    // chunky: head wider than 0.5 u
    expect(bb.max.z - bb.min.z).toBeGreaterThan(0.5);
  });

  it('tags legs (0), antenna (2), arms (7) and one accessory group per theme (8)', () => {
    const modes = new Set<number>();
    const acc = new Set<number>();
    for (let i = 0; i < limb.count; i++) {
      const m = limb.getW(i);
      modes.add(m);
      if (m === 8) acc.add(limb.getX(i));
    }
    for (const m of [0, 2, 7, 8]) expect(modes.has(m)).toBe(true);
    // no villager-only modes sneak in
    for (const m of [3, 4, 5, 6]) expect(modes.has(m)).toBe(false);
    // 0..6 department accessories, 7..10 carried items (laptop, clipboard, crate, paint pot)
    expect([...acc].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const id of THEME_IDS) expect(acc.has(THEMES[id].accessory)).toBe(true);
  });

  it('gives the eyes the screen emissive class (2) and keeps most of the body dark', () => {
    let eyes = 0;
    let lit = 0;
    for (let i = 0; i < emi.count; i++) {
      if (emi.getX(i) === 2) eyes++;
      if (emi.getX(i) > 0) lit++;
    }
    expect(eyes).toBeGreaterThan(0);
    expect(lit / emi.count).toBeLessThan(0.15);
  });

  it('accessories are never pure white (they would take the team tint)', () => {
    const col = g.getAttribute('color');
    for (let i = 0; i < col.count; i++) {
      const white = Math.min(col.getX(i), col.getY(i), col.getZ(i)) >= 0.995;
      if (limb.getW(i) === 8) expect(white).toBe(false);
    }
  });

  it('life shader: mode 7/8 + pose decode, same program key, no new attribute declarations', () => {
    const mat = makeLifeMaterial('t', false);
    expect(mat.customProgramCacheKey()).toBe(makeLifeMaterial('t2', true).customProgramCacheKey());
    const shader = {
      defines: {},
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    mat.onBeforeCompile(shader as never, {} as never);
    const vs = shader.vertexShader;
    expect(vs).toContain('lM == 7');
    expect(vs).toContain('lM == 8');
    expect(vs).toContain('aGait.y >= 1.5');
    // creature attributes stay at limb + aGait (the factory's 13 + limb + aGait = 15 of 16)
    expect(vs.match(/attribute (float|vec[234]) (limb|aGait)\b/g)).toHaveLength(2);
  });
});
