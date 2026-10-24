/** TASK-415: Design Glass & Light kit (bounds, thickness, budgets, LOD1, ledger, palette, variants). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DESIGN_CULTURE } from '../../content/cultures/design.ts';
import { paletteHexes, validateCultures } from '../../content/cultures/validate.ts';
import { PROP_DEFS } from '../../content/props.ts';
import { DESIGN_CULTURE_KIT } from '../../content/props-themes/design.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { isLargeStructure } from '../../render/props/batcher.ts';
import { PROP_GEO, buildProp } from '../registry.ts';
import { createRng } from '../../core/rng.ts';
import { CULTURE_DESIGN_GEO, GLASS_T, lanternBoat } from './culture-design.ts';

const verts = (g: THREE.BufferGeometry): number => g.getAttribute('position').count;
const size = (g: THREE.BufferGeometry): THREE.Vector3 => {
  g.computeBoundingBox();
  return (g.boundingBox as THREE.Box3).getSize(new THREE.Vector3());
};
const defOf = (id: string) => PROP_DEFS.find((d) => d.id === id);
const same = (a: THREE.BufferGeometry, b: THREE.BufferGeometry): boolean => {
  for (const n of ['position', 'color']) {
    const x = a.getAttribute(n).array;
    const y = b.getAttribute(n).array;
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  }
  return true;
};

/** Max vertices per LOD0 geometry (3 per triangle). */
const MAX_VERTS: Record<string, number> = {
  hotShop: 6000,
  gatherRing: 6600,
  stainedScreen: 3000,
  rainbowArc: 11000,
};
const FLAT = new Set(['causticDecal']);

describe('TASK-415 Glass & Light kit: ledger and defs', () => {
  it('geo, PropDefs and the ledger line up', () => {
    const ids = CULTURE_DESIGN_GEO.map((d) => d.id);
    // M20 (TASK-465) appended 5 entries; their own test is culture-m20.test.ts
    expect(
      DESIGN_CULTURE.kit
        .slice(0, 10)
        .map((k) => k.id)
        .sort(),
    ).toEqual([...ids].sort());
    for (const k of DESIGN_CULTURE.kit.slice(0, 10)) {
      const d = defOf(k.id);
      expect(d?.tier, k.id).toBe(k.tier);
      expect(d?.flags, k.id).toBe(k.flags);
      expect(d?.variants, k.id).toBe(PROP_GEO[k.id].variants);
    }
    expect(validateCultures([DESIGN_CULTURE])).toEqual([]);
  });

  it('ordered by priority: cut to 6 stays valid, the (original) tier-1 def is last, tier mix 5/4/1/0', () => {
    const kit = DESIGN_CULTURE.kit.slice(0, 10);
    expect(kit.at(-1)?.id).toBe('rainbowArc');
    expect(validateCultures([{ ...DESIGN_CULTURE, kit: kit.slice(0, 6) }])).toEqual([]);
    expect(kit.filter((k) => k.tier === 1)).toHaveLength(1);
    expect(kit.filter((k) => k.tier === 2)).toHaveLength(4);
    expect(kit.filter((k) => k.tier === 3)).toHaveLength(5);
    expect(kit.filter((k) => k.tier === 3).every((k) => (k.flags & PropFlag.noShadow) !== 0)).toBe(
      true,
    );
  });

  it('kit colours come from the palette tables and never use the Research aqua', () => {
    const allowed = new Set<string>(paletteHexes());
    const hexes: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') {
        if (/^#[0-9a-f]{6}$/i.test(v)) hexes.push(v.toUpperCase());
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(DESIGN_CULTURE_KIT);
    expect(hexes.length).toBeGreaterThan(30);
    for (const h of hexes) {
      expect(allowed.has(h), h).toBe(true);
      expect(h, 'Research aqua').not.toBe('#8EEBE0');
    }
  });
});

describe('TASK-415 Glass & Light kit: geometry', () => {
  it('glass is thick', () => {
    expect(GLASS_T).toBeGreaterThanOrEqual(0.15);
  });

  for (const def of CULTURE_DESIGN_GEO) {
    for (let v = 0; v < def.variants; v++) {
      it(`${def.id} v${v}: bounds, budgets, ground pivot, LOD1, determinism`, () => {
        const g0 = buildProp(def.id, 3, v, 0);
        const g1 = buildProp(def.id, 3, v, 1);
        expect(verts(g0)).toBeLessThanOrEqual(MAX_VERTS[def.id] ?? 3600);
        expect(verts(g1)).toBeLessThanOrEqual(0.3 * verts(g0));
        for (const g of [g0, g1]) {
          const s = size(g);
          expect(Math.min(s.x, s.y, s.z)).toBeGreaterThanOrEqual(FLAT.has(def.id) ? 0.0 : 0.15);
          expect(g.boundingBox?.min.y ?? 0).toBeGreaterThanOrEqual(-0.05);
          expect(g.boundingBox?.min.y ?? 0).toBeLessThanOrEqual(0.05);
          const c = g.getAttribute('color');
          for (let i = 0; i < c.count; i++) expect(Number.isFinite(c.getX(i))).toBe(true);
        }
        const s0 = size(g0);
        expect(s0.y).toBeGreaterThan(def.height * 0.75);
        expect(s0.y).toBeLessThan(def.height * 1.25);
        const s1 = size(g1);
        expect(Math.abs(s1.y / s0.y - 1)).toBeLessThan(0.3);
        const again = buildProp(def.id, 3, v, 0);
        expect(Array.from(again.getAttribute('position').array)).toEqual(
          Array.from(g0.getAttribute('position').array),
        );
      });
    }
  }

  it('no tier-2/3 kit def is a "large structure" (several seeds); rainbowArc is', () => {
    for (const k of DESIGN_CULTURE.kit.slice(0, 10)) {
      const d = defOf(k.id);
      if (!d) throw new Error(k.id);
      for (const seed of [1, 42, 1001])
        for (let v = 0; v < d.variants; v++) {
          const s = size(buildProp(k.id, seed, v, 0));
          const large = isLargeStructure(d, s);
          if (k.id === 'rainbowArc') expect(large).toBe(true);
          else expect(large, `${k.id} v${v} seed ${seed} ${s.y.toFixed(2)}`).toBe(false);
        }
    }
  });

  it('no vertex colour is the Research aqua (or a pale aqua), in any def or variant', () => {
    const ids = [
      ...CULTURE_DESIGN_GEO.map((d) => ({ id: d.id, vs: d.variants })),
      { id: 'giantTree', vs: 4 },
      { id: 'galleryPavilion', vs: 3 },
      { id: 'bunting', vs: 4 },
    ];
    const aqua = new THREE.Color('#8EEBE0');
    const hsl = { h: 0, s: 0, l: 0 };
    for (const { id, vs } of ids)
      for (let v = 0; v < vs; v++) {
        if (['giantTree', 'galleryPavilion', 'bunting'].includes(id) && v < vs - 1) continue;
        const c = buildProp(id, 3, v, 0).getAttribute('color');
        for (let i = 0; i < c.count; i += 3) {
          const col = new THREE.Color(c.getX(i), c.getY(i), c.getZ(i));
          expect(
            Math.abs(col.r - aqua.r) + Math.abs(col.g - aqua.g) + Math.abs(col.b - aqua.b),
          ).toBeGreaterThan(0.05);
          col.getHSL(hsl);
          // pale aqua: hue 160-195 deg, light and low-ish saturation (mint 154 deg / sky 209 deg are fine)
          if (hsl.h > 160 / 360 && hsl.h < 195 / 360 && hsl.l > 0.72)
            throw new Error(`${id} v${v} pale aqua`);
        }
      }
  });

  it('glass glows (emissive 1) and molten parts glow stronger', () => {
    const maxEmi = (id: string, v = 0): number => {
      const e = buildProp(id, 3, v, 0).getAttribute('emissive');
      let m = 0;
      for (let i = 0; i < e.count; i++) m = Math.max(m, e.getX(i));
      return m;
    };
    for (const id of ['stainedScreen', 'prismSculpture', 'gatherRing', 'glassOrb', 'rainbowArc'])
      expect(maxEmi(id), id).toBeGreaterThan(0.3);
    expect(maxEmi('hotShop', 0)).toBeGreaterThanOrEqual(1.5);
  });

  it('hotShop: chimney smoke hook above the stack; 3 heat variants differ', () => {
    const g = buildProp('hotShop', 3, 0, 0);
    const hook = (g.userData.hooks as { emitter: number[] }).emitter;
    expect(hook[1]).toBeGreaterThan(size(g).y - 0.3);
    expect(same(buildProp('hotShop', 3, 0, 0), buildProp('hotShop', 3, 1, 0))).toBe(false);
  });
});

describe('TASK-415 variants of existing defs', () => {
  // TASK-425 placed them: `variants` bumped by one, random rolls keep the old range
  // (`rollVariants`); the glass pavilion has its own LOD1 (the shared v1 one popped colour)
  const cases = [
    { id: 'giantTree', variant: 3, lod1: 2, count: 4, rolls: 3 },
    { id: 'galleryPavilion', variant: 2, lod1: null, count: 3, rolls: 2 },
    // TASK-481 appended v4 (the Marketing marquee bulb string): rolls still stop at v2
    { id: 'bunting', variant: 3, lod1: 2, count: 5, rolls: 3 },
  ];
  for (const c of cases) {
    it(`${c.id} v${c.variant}: LOD1 == v${c.lod1 ?? 'own'}, rolls keep the old range, LOD0 adds glass`, () => {
      expect(PROP_GEO[c.id].variants).toBe(c.count);
      expect(defOf(c.id)?.variants).toBe(c.count);
      expect(defOf(c.id)?.rollVariants).toBe(c.rolls);
      for (const seed of [1, 42, 1001]) {
        const far = buildProp(c.id, seed, c.variant, 1);
        if (c.lod1 !== null) expect(same(far, buildProp(c.id, seed, c.lod1, 1))).toBe(true);
        else expect(verts(far)).toBeLessThan(verts(buildProp(c.id, seed, c.variant, 0)) * 0.3);
      }
      if (c.lod1 === null) return;
      const g = buildProp(c.id, 3, c.variant, 0);
      expect(verts(g)).toBeGreaterThan(verts(buildProp(c.id, 3, c.lod1, 0)) * 0.8);
      expect(size(g).y).toBeLessThan(PROP_GEO[c.id].height * 1.3);
    });
  }

  it('existing variants are untouched (bit-identical to a direct builder call)', () => {
    expect(verts(buildProp('giantTree', 5, 2, 0))).toBeGreaterThan(0);
    expect(verts(buildProp('bunting', 5, 1, 0))).toBeGreaterThan(0);
  });

  it('lanternBoat builds: hull, six lanterns, mast; LOD1 is much lighter', () => {
    const rng = createRng(3).fork('geo', 0).fork('lanternBoat');
    const g0 = lanternBoat({ rng, lod: 0, variant: 0 });
    const g1 = lanternBoat({ rng, lod: 1, variant: 0 });
    const s = size(g0);
    expect(s.y).toBeGreaterThan(4.5);
    expect(s.y).toBeLessThan(5.6);
    expect(verts(g1)).toBeLessThan(0.7 * verts(g0));
    const e = g0.getAttribute('emissive');
    let lit = 0;
    for (let i = 0; i < e.count; i++) if (e.getX(i) > 0.5) lit++;
    expect(lit).toBeGreaterThan(100);
  });
});
