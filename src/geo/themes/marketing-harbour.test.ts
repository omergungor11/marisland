/** TASK-536 (D-126): the WELCOME screen (billboardV2 v4) and the bulb arch (bunting v5). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PROP_DEF_INDEX, PROP_DEFS } from '../../content/props.ts';
import { CARNIVAL_PIER as K, WELCOME_FONT } from '../../content/themes/marketing-harbour.ts';
import { buildProp, PROP_GEO } from '../index.ts';

const tris = (g: THREE.BufferGeometry): number =>
  (g.index ? g.index.count : g.getAttribute('position').count) / 3;
const size = (g: THREE.BufferGeometry): THREE.Vector3 => {
  g.computeBoundingBox();
  return (g.boundingBox as THREE.Box3).getSize(new THREE.Vector3());
};

describe('TASK-536 Carnival Pier props', () => {
  it('both are pinned variants: random rolls never reach them', () => {
    const bb = PROP_DEFS[PROP_DEF_INDEX.billboardV2];
    expect(bb.variants).toBe(K.screen.variant + 1);
    expect(bb.rollVariants).toBeLessThanOrEqual(K.screen.variant);
    const b = PROP_DEFS[PROP_DEF_INDEX.bunting];
    expect(b.variants).toBe(K.arch.variant + 1);
    expect(b.rollVariants).toBeLessThanOrEqual(K.arch.variant);
    expect(PROP_GEO.billboardV2.variants).toBe(bb.variants);
    expect(PROP_GEO.bunting.variants).toBe(b.variants);
    const s = PROP_DEFS[PROP_DEF_INDEX.sailboat];
    expect(s.variants).toBe(K.deck.variant + 1);
    expect(PROP_GEO.sailboat.variants).toBe(s.variants);
  });

  it('the word has a stroke table', () => {
    for (const ch of K.screen.word) expect(WELCOME_FONT[ch], ch).toBeDefined();
  });

  it('heights are the measured ones, LOD1 is cheaper, budgets hold', () => {
    const cases = [
      ['billboardV2', K.screen.variant, K.screen.height, 600],
      ['bunting', K.arch.variant, K.arch.height, 150],
      ['sailboat', K.deck.variant, K.deck.height, 400],
    ] as const;
    for (const [id, v, h, budget] of cases) {
      const g0 = buildProp(id, 7, v, 0);
      const g1 = buildProp(id, 7, v, 1);
      expect(tris(g0), `${id} LOD0`).toBeLessThanOrEqual(budget);
      expect(tris(g1), `${id} LOD1`).toBeLessThan(tris(g0) * 0.5);
      expect(size(g0).y, `${id} height`).toBeGreaterThan(h * 0.95);
      expect(size(g0).y, `${id} height`).toBeLessThan(h * 1.05);
      // the same bytes per seed
      expect(Array.from(buildProp(id, 7, v, 0).getAttribute('position').array)).toEqual(
        Array.from(g0.getAttribute('position').array),
      );
    }
  });

  it('old bunting and billboard variants keep their bytes', () => {
    // v4 is still the marquee string, v3 the sea-sign pair: their hooks and sizes are not ours
    expect(size(buildProp('bunting', 5, 4, 0)).x).toBeGreaterThan(5.5);
    expect(size(buildProp('billboardV2', 5, 3, 0)).y).toBeGreaterThan(8);
  });

  it('the screen face is screen class, always the word (no slide tag)', () => {
    const g = buildProp('billboardV2', 7, K.screen.variant, 0);
    const em = g.getAttribute('emissive');
    let screen = 0;
    for (let i = 0; i < em.count; i++) if (em.getX(i) >= 1.5) screen++;
    expect(screen).toBeGreaterThan(50);
  });
});
