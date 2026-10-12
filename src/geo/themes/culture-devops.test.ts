/** TASK-412: DevOps Ember Smiths kit (bounds, ground pivot, budgets, LOD1, ledger, palette). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEVOPS_CULTURE } from '../../content/cultures/devops.ts';
import { validateCultures, paletteHexes } from '../../content/cultures/validate.ts';
import { PROP_DEFS } from '../../content/props.ts';
import { DEVOPS_CULTURE_KIT, DEVOPS_WORKS } from '../../content/props-themes/devops.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { isLargeStructure } from '../../render/props/batcher.ts';
import { PROP_GEO, buildProp } from '../registry.ts';
import { CULTURE_DEVOPS_GEO } from './culture-devops.ts';

const verts = (g: THREE.BufferGeometry): number => g.getAttribute('position').count;
const size = (g: THREE.BufferGeometry): THREE.Vector3 => {
  g.computeBoundingBox();
  return (g.boundingBox as THREE.Box3).getSize(new THREE.Vector3());
};
const defOf = (id: string) => PROP_DEFS.find((d) => d.id === id);

/** Max vertices per LOD0 geometry (3 per triangle): small props 1.2k tris, prefabs 2.5k. */
const MAX_VERTS: Record<string, number> = { onsenDeck: 7500, onsenHouse: 7500 };
const MIN_THICK = 0.12;

describe('TASK-412 Ember Smiths kit', () => {
  it('geo, PropDefs and the culture ledger line up', () => {
    const ids = CULTURE_DEVOPS_GEO.map((d) => d.id);
    expect(DEVOPS_CULTURE.kit.map((k) => k.id).sort()).toEqual([...ids].sort());
    for (const k of DEVOPS_CULTURE.kit) {
      const d = defOf(k.id);
      expect(d, k.id).toBeDefined();
      expect(d?.tier, k.id).toBe(k.tier);
      expect(d?.flags, k.id).toBe(k.flags);
      expect(d?.variants, k.id).toBe(PROP_GEO[k.id].variants);
      expect(PROP_GEO[k.id].windy).toBe((k.flags & PropFlag.windy) !== 0);
    }
    expect(validateCultures([DEVOPS_CULTURE])).toEqual([]);
  });

  it('ledger is ordered by priority: cut to 6 stays valid, the tier-1 def goes first', () => {
    const kit = DEVOPS_CULTURE.kit;
    expect(kit.at(-1)?.id).toBe('onsenHouse');
    expect(kit.slice(0, 6).every((k) => k.tier >= 2)).toBe(true);
    expect(validateCultures([{ ...DEVOPS_CULTURE, kit: kit.slice(0, 6) }])).toEqual([]);
    expect(kit.filter((k) => k.tier === 1)).toHaveLength(1);
    expect(kit.filter((k) => k.tier === 3).every((k) => (k.flags & PropFlag.noShadow) !== 0)).toBe(
      true,
    );
  });

  it('colours come from the palette tables (or the existing Ember Works table)', () => {
    const allowed = new Set<string>(paletteHexes());
    const walk = (v: unknown, out: string[]): void => {
      if (typeof v === 'string') {
        if (/^#[0-9a-f]{6}$/i.test(v)) out.push(v.toUpperCase());
      } else if (Array.isArray(v)) v.forEach((x) => walk(x, out));
      else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, out));
    };
    const hexes: string[] = [];
    walk(DEVOPS_CULTURE_KIT, hexes);
    expect(hexes.length).toBeGreaterThan(20);
    for (const h of hexes) expect(allowed.has(h), h).toBe(true);
  });

  for (const def of CULTURE_DEVOPS_GEO) {
    for (let v = 0; v < def.variants; v++) {
      it(`${def.id} v${v}: bounds, thickness, budgets, ground pivot, LOD1`, () => {
        const g0 = buildProp(def.id, 3, v, 0);
        const g1 = buildProp(def.id, 3, v, 1);
        expect(verts(g0)).toBeLessThanOrEqual(MAX_VERTS[def.id] ?? 3600);
        expect(verts(g1)).toBeLessThanOrEqual(0.3 * verts(g0));
        for (const g of [g0, g1]) {
          const s = size(g);
          expect(Math.min(s.x, s.y, s.z)).toBeGreaterThanOrEqual(MIN_THICK);
          expect(g.boundingBox?.min.y ?? 0).toBeGreaterThanOrEqual(-0.05);
          expect(g.boundingBox?.min.y ?? 0).toBeLessThanOrEqual(0.05);
          const c = g.getAttribute('color');
          for (let i = 0; i < c.count; i++) expect(Number.isFinite(c.getX(i))).toBe(true);
        }
        const s0 = size(g0);
        expect(s0.y).toBeGreaterThan(def.height * 0.75);
        expect(s0.y).toBeLessThan(def.height * 1.25);
        expect(Math.max(s0.x, s0.z) / 2).toBeLessThanOrEqual(def.footprint * 1.6);
        // LOD1 keeps the silhouette
        const s1 = size(g1);
        // (the anvil's LOD0 sparks float above the silhouette)
        expect(Math.abs(s1.y / s0.y - 1)).toBeLessThan(0.3);
        expect(Math.abs(s1.x - s0.x)).toBeLessThan(0.3 * Math.max(s0.x, 1));
        // deterministic: same seed, same bits
        const again = buildProp(def.id, 3, v, 0);
        expect(Array.from(again.getAttribute('position').array)).toEqual(
          Array.from(g0.getAttribute('position').array),
        );
      });
    }
  }

  it('no tier >= 1 kit def is a "large structure" (stays out of the W11 far groups)', () => {
    for (const k of DEVOPS_CULTURE.kit) {
      const d = defOf(k.id);
      if (!d) throw new Error(k.id);
      for (let v = 0; v < d.variants; v++) {
        const s = size(buildProp(k.id, 3, v, 0));
        expect(
          isLargeStructure(d, s),
          `${k.id} v${v} ${s.x.toFixed(2)}x${s.y.toFixed(2)}x${s.z.toFixed(2)}`,
        ).toBe(false);
      }
    }
  });

  it('glow: lantern glass, ingots, sign digits and workpiece are emissive; LEDs are tagged', () => {
    const emissiveCount = (id: string, v = 0): number => {
      const e = buildProp(id, 3, v, 0).getAttribute('emissive');
      let n = 0;
      for (let i = 0; i < e.count; i++) if (e.getX(i) > 0.5) n++;
      return n;
    };
    for (const id of ['lavaLantern', 'incidentSign', 'anvil', 'signalHorn', 'onsenHouse'])
      expect(emissiveCount(id), id).toBeGreaterThan(0);
    // hot ingots glow, cooled ones (almost) do not
    expect(emissiveCount('ingotStack', 0)).toBeGreaterThan(emissiveCount('ingotStack', 2));
    for (const id of ['serverShrine', 'pagerRock']) {
      const w = buildProp(id, 3, 0, 0).getAttribute('aSpin');
      let led = 0;
      for (let i = 0; i < w.count; i++) if (w.getW(i) < 0) led++;
      expect(led, id).toBeGreaterThan(0);
    }
  });

  it('pipeValveWheel: the hand wheel spins about its hub (aSpin tag 1), the pipe does not', () => {
    const g = buildProp('pipeValveWheel', 3, 0, 0);
    const a = g.getAttribute('aSpin');
    let spin = 0;
    for (let i = 0; i < a.count; i++) if (a.getW(i) === 1) spin++;
    expect(spin).toBeGreaterThan(30);
    expect(spin).toBeLessThan(a.count / 2);
    expect(g.userData.hub).toBeDefined();
  });

  it('incidentSign: variant 0 reads 42, variant 1 reads 0 in red', () => {
    const lit = (v: number): number => {
      const g = buildProp('incidentSign', 3, v, 0);
      const e = g.getAttribute('emissive');
      let n = 0;
      for (let i = 0; i < e.count; i++) if (e.getX(i) > 0.5) n++;
      return n;
    };
    // "42" lights 5 + 5 segments (4: bcfg = 4, 2: abdeg = 5), "0" lights 6, plus the flame
    expect(lit(0)).toBeGreaterThan(0);
    expect(lit(1)).toBeGreaterThan(0);
    expect(lit(0)).not.toBe(lit(1));
  });

  it('onsenHouse: keeps the vent steam hook above the roof', () => {
    const g = buildProp('onsenHouse', 3, 0, 0);
    const hook = (g.userData.hooks as { emitter: number[] }).emitter;
    expect(hook[1]).toBeGreaterThan(size(g).y - 0.3);
  });
});

describe('TASK-412 foundry variant 1 (forge bell)', () => {
  const eq = (a: THREE.BufferGeometry, b: THREE.BufferGeometry): boolean => {
    for (const name of ['position', 'color']) {
      const x = a.getAttribute(name).array;
      const y = b.getAttribute(name).array;
      if (x.length !== y.length) return false;
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    }
    return true;
  };

  it('two variants; LOD1 of variant 1 is bit-identical to variant 0 (one far group, B2)', () => {
    expect(defOf('foundry')?.variants).toBe(2);
    expect(PROP_GEO.foundry.variants).toBe(2);
    for (const seed of [1, 42, 1001])
      expect(eq(buildProp('foundry', seed, 0, 1), buildProp('foundry', seed, 1, 1))).toBe(true);
  });

  it('LOD0 variant 1 adds the belfry and medallion inside the hall footprint and height', () => {
    const a = buildProp('foundry', 5, 0, 0);
    const b = buildProp('foundry', 5, 1, 0);
    expect(verts(b)).toBeGreaterThan(verts(a) + 300);
    const sa = size(a);
    const sb = size(b);
    expect(Math.abs(sb.y - sa.y)).toBeLessThan(0.3);
    expect(sb.x).toBeLessThan(sa.x + 0.3);
    expect(sb.z).toBeLessThan(sa.z + 0.3);
    const [fw, fd] = DEVOPS_WORKS.foundry.footprint;
    expect(sb.x).toBeLessThan(fw + 0.8);
    expect(sb.z).toBeLessThan(fd + 2.6);
  });
});
