import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { THEME_IDS } from '../world/types.ts';
import { THEMES } from '../content/themes.ts';
import { buildVillager } from './geo/land.ts';
import { BOT_CHASSIS } from '../content/bot-look.ts';
import { BOT_FRAMES } from '../content/life.ts';
import { buildFleetBeacon, buildWorker } from './geo/workers.ts';
import { makeLifeMaterial } from './life-material.ts';

const attrNames = (g: { attributes: Record<string, unknown> }): string[] =>
  Object.keys(g.attributes).sort();

describe('fleet beacon geometry (TASK-571)', () => {
  it('is one small tinted gem + stalk + saucer, emissive class 1, mode 0 (static)', () => {
    const g = buildFleetBeacon();
    expect(g.getAttribute('position').count / 3).toBeLessThanOrEqual(80);
    const limb = g.getAttribute('limb');
    const emi = g.getAttribute('emissive');
    for (let i = 0; i < limb.count; i++) {
      expect(limb.getW(i)).toBe(0);
      expect(limb.getX(i)).toBe(0);
      expect(emi.getX(i)).toBe(1);
    }
  });
});

describe('worker bot chassis (TASK-590)', () => {
  for (const chassis of BOT_CHASSIS) {
    it(`${chassis}: within 1900 triangles, grounded, all heads + 7 accessories + 15 items + eye glyphs baked`, () => {
      const g = buildWorker(chassis);
      expect(g.getAttribute('position').count / 3).toBeLessThanOrEqual(1900);
      g.computeBoundingBox();
      expect(g.boundingBox!.min.y).toBeGreaterThanOrEqual(-1e-6);
      expect(g.boundingBox!.min.y).toBeLessThan(0.01);
      const limb = g.getAttribute('limb');
      const variants = new Set<number>();
      for (let i = 0; i < limb.count; i++) if (limb.getW(i) === 8) variants.add(limb.getX(i));
      const want = [
        ...Array.from({ length: 22 }, (_, k) => k),
        30,
        31,
        32,
        // idle + working / gate / error / done on each of the three heads
        ...[0, 1, 2].flatMap((h) => [0, 1, 2, 3, 4].map((e) => 40 + h * 5 + e)),
      ];
      expect([...variants].sort((a, b) => a - b)).toEqual(want);
    });
  }

  it('heights differ as designed: hauler under scout under spire (head top)', () => {
    const top = (c: (typeof BOT_CHASSIS)[number]): number => BOT_FRAMES[c].headY + 0.19;
    expect(top('hauler')).toBeLessThan(top('scout'));
    expect(top('scout')).toBeLessThan(top('spire'));
    expect(top('spire')).toBeCloseTo(1.15, 2);
    expect(top('hauler')).toBeCloseTo(0.89, 2);
  });

  it('eye glyphs are emissive screen class and the working dots carry limb.z 1..3', () => {
    const g = buildWorker('scout');
    const limb = g.getAttribute('limb');
    const emi = g.getAttribute('emissive');
    const dots = new Set<number>();
    for (let i = 0; i < limb.count; i++) {
      if (limb.getW(i) === 8 && limb.getX(i) >= 40) {
        expect(emi.getX(i)).toBe(2);
        if (limb.getZ(i) > 0) {
          expect([41, 46, 51]).toContain(limb.getX(i));
          dots.add(limb.getZ(i));
        }
      }
    }
    expect([...dots].sort()).toEqual([1, 2, 3]);
  });

  it('role items stay small (<= 60 triangles each)', () => {
    const limb = buildWorker('scout').getAttribute('limb');
    const tris = new Map<number, number>();
    for (let i = 0; i < limb.count; i += 3)
      if (limb.getW(i) === 8) tris.set(limb.getX(i), (tris.get(limb.getX(i)) ?? 0) + 1);
    for (const slot of [16, 17, 18, 19, 20, 21]) expect(tris.get(slot)).toBeLessThanOrEqual(60);
  });
});

describe('worker bot geometry (TASK-306)', () => {
  const g = buildWorker();
  const pos = g.getAttribute('position');
  const limb = g.getAttribute('limb');
  const emi = g.getAttribute('emissive');

  it('has the villager attribute set plus emissive, and stays within 1900 triangles (accessories + carried items)', () => {
    expect(attrNames(g)).toEqual([...attrNames(buildVillager()), 'emissive'].sort());
    expect(pos.count / 3).toBeLessThanOrEqual(1900);
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
    // 0..6 department accessories, 7..15 carried items (laptop, clipboard, crate, paint pot, satchel,
    // megaphone, blowpipe, books, the QA bug-hunt lantern of TASK-480), 16..21 role items, 30.. heads, 40.. eyes
    expect([...acc].filter((v) => v < 30).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 22 }, (_, k) => k),
    );
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
      // the visor dome (head 31) is meant to take the team tint
      if (limb.getW(i) === 8 && limb.getX(i) !== 31) expect(white).toBe(false);
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
