/** TASK-465: M20 HQ seven-gates and Design conservatory kits (ledgers, defs, geometry, hooks, APIs). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CULTURES } from '../../content/cultures/index.ts';
import { validateCultures } from '../../content/cultures/validate.ts';
import { cultureCapOverride } from '../../content/budgets.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import {
  CONSERVATORY,
  CULTURE_GATE,
  DESIGN_M20_PROP_DEFS,
  GLASSHOUSE_HUES,
  GLASS_BRIDGE,
  HQ_M20_PROP_DEFS,
  M20_PROP_IDS,
  MAIL_LINE,
  PRISM_ARCH,
  SEMAPHORE,
  STAINED_WINDMILL,
  mailCablePoint,
} from '../../content/props-themes/m20.ts';
import { FIXTURE_RADIUS } from '../../content/settlements.ts';
import { THEMES } from '../../content/themes.ts';
import { createRng } from '../../core/rng.ts';
import { THEME_IDS } from '../../world/types.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { isLargeStructure } from '../../render/props/batcher.ts';
import { PROP_GEO, buildProp } from '../registry.ts';
import { buildMailCable, buildSemaphoreArm } from './culture-m20-hq.ts';

const verts = (g: THREE.BufferGeometry): number => g.getAttribute('position').count;
const size = (g: THREE.BufferGeometry): THREE.Vector3 => {
  g.computeBoundingBox();
  return (g.boundingBox as THREE.Box3).getSize(new THREE.Vector3());
};
const defOf = (id: string) => PROP_DEFS.find((d) => d.id === id);
const num = (g: THREE.BufferGeometry, n: string): number[] => Array.from(g.getAttribute(n).array);
interface Hooks {
  lamp: { at: number[]; first: number; count: number };
  arms: { pivot: number[]; axis: number[]; restAngle: number; length: number }[];
  cable: { anchor: number[]; sag: number };
  sack: { at: number[] };
  walk: { span: number; width: number; endY: number; midY: number };
  pool: { at: number[]; radius: number; source: number[] };
  rotor: { sails: number };
}
const hooks = (g: THREE.BufferGeometry): Hooks => (g.userData.hooks ?? {}) as Hooks;

const HQ_NEW = ['cultureGate', 'goodsStall', 'semaphoreTower', 'mailLine'];
const DESIGN_NEW = ['conservatory', 'glasshouse', 'glassBridge', 'prismArch', 'stainedWindmill'];
/** Defs that are walked under / stood beside at human scale: never promoted to tier 0 by size. */
const SMALL = ['cultureGate', 'goodsStall', 'glasshouse', 'glassBridge', 'prismArch'];

describe('TASK-465 ledgers and defs', () => {
  it('HQ 8 + 4 = 12 (cap), Design 10 + 5 = 15 (cap), new entries appended in order, valid', () => {
    expect(CULTURES.hq.kit.slice(8).map((k) => k.id)).toEqual(HQ_NEW);
    expect(CULTURES.design.kit.slice(10).map((k) => k.id)).toEqual(DESIGN_NEW);
    expect(CULTURES.hq.kit).toHaveLength(cultureCapOverride.hq.defs);
    expect(CULTURES.design.kit).toHaveLength(cultureCapOverride.design.defs);
    expect(CULTURES.design.kit.filter((k) => k.tier === 1).map((k) => k.id)).toEqual([
      'rainbowArc',
      'conservatory',
    ]);
    expect(CULTURES.hq.kit.filter((k) => k.tier === 1)).toHaveLength(0);
    expect(validateCultures([CULTURES.hq, CULTURES.design])).toEqual([]);
  });

  it('every ledger entry has a PropDef (tier, flags) and a geo def (variants, windy) at the end of PROP_DEFS', () => {
    const all = [...HQ_M20_PROP_DEFS, ...DESIGN_M20_PROP_DEFS];
    expect(all.map((d) => d.id)).toEqual(M20_PROP_IDS);
    // later milestones append their own defs after these (M22 ...): the M20 block stays contiguous
    const at = PROP_DEFS.findIndex((d) => d.id === M20_PROP_IDS[0]);
    const last = PROP_DEFS.slice(at, at + all.length).map((d) => d.id);
    expect(last).toEqual(M20_PROP_IDS);
    for (const k of [...CULTURES.hq.kit.slice(8), ...CULTURES.design.kit.slice(10)]) {
      const d = defOf(k.id);
      expect(d?.tier, k.id).toBe(k.tier);
      expect(d?.flags, k.id).toBe(k.flags);
      expect(PROP_DEFS[PROP_DEF_INDEX[k.id]].id).toBe(k.id);
      const geo = PROP_GEO[k.id];
      expect(geo.variants, k.id).toBe(d?.variants);
      expect(((d?.flags ?? 0) & PropFlag.windy) !== 0, k.id).toBe(geo.windy);
      expect(FIXTURE_RADIUS[k.id], `${k.id} FIXTURE_RADIUS`).toBeGreaterThan(0);
    }
  });

  it('variant counts: gate + stall = one per culture, glasshouse = one per pane tint', () => {
    expect(PROP_GEO.cultureGate.variants).toBe(THEME_IDS.length);
    expect(PROP_GEO.goodsStall.variants).toBe(THEME_IDS.length);
    expect(PROP_GEO.glasshouse.variants).toBe(GLASSHOUSE_HUES.length);
    expect(GLASSHOUSE_HUES.length).toBeGreaterThanOrEqual(4);
    expect(GLASSHOUSE_HUES.length).toBeLessThanOrEqual(6);
  });
});

describe('TASK-465 geometry', () => {
  for (const id of M20_PROP_IDS) {
    const geo = PROP_GEO[id];
    for (let v = 0; v < geo.variants; v++) {
      it(`${id} v${v}: tris, LOD1 <= 30 %, ground pivot, bounds, finite, emissive, deterministic`, () => {
        const g0 = buildProp(id, 3, v, 0);
        const g1 = buildProp(id, 3, v, 1);
        expect(verts(g0) / 3).toBeLessThanOrEqual(3500);
        expect(verts(g1)).toBeLessThanOrEqual(0.3 * verts(g0));
        for (const g of [g0, g1]) {
          for (const n of ['position', 'normal', 'color', 'wind', 'ao', 'emissive'])
            expect(
              num(g, n).every((x) => Number.isFinite(x)),
              `${id} ${n}`,
            ).toBe(true);
          const s = size(g);
          expect(Math.min(s.x, s.y, s.z)).toBeGreaterThanOrEqual(0.12);
          expect(g.boundingBox?.min.y ?? 0).toBeGreaterThanOrEqual(-0.05);
          expect(g.boundingBox?.min.y ?? 0).toBeLessThanOrEqual(0.05);
        }
        const h = geo.heights?.[v] ?? geo.height;
        const s0 = size(g0);
        expect(s0.y).toBeGreaterThan(h * 0.85);
        expect(s0.y).toBeLessThan(h * 1.2);
        expect(num(buildProp(id, 3, v, 0), 'position')).toEqual(num(g0, 'position'));
        expect(num(buildProp(id, 4, v, 0), 'position')).not.toEqual(num(g0, 'position'));
        const d = defOf(id);
        if (!d) throw new Error(id);
        if (SMALL.includes(id)) expect(isLargeStructure(d, s0), `${id} is large`).toBe(false);
        else expect(isLargeStructure(d, s0), `${id} should be effective tier 0`).toBe(true);
      });
    }
  }

  it('the footprint of the big ones matches the brief', () => {
    const s = size(buildProp('conservatory', 1, 0, 0));
    expect(Math.max(s.x, s.z)).toBeGreaterThan(14);
    expect(Math.max(s.x, s.z)).toBeLessThan(18);
    const gate = size(buildProp('cultureGate', 1, 0, 0));
    expect(gate.x).toBeGreaterThan(4);
    expect(gate.x).toBeLessThan(6);
    expect(CULTURE_GATE.clearWidth).toBeGreaterThan(3);
    const tower = size(buildProp('semaphoreTower', 1, 0, 0));
    expect(tower.y).toBeGreaterThan(7);
    expect(tower.y).toBeLessThan(10);
    const bridge = size(buildProp('glassBridge', 1, 0, 0));
    expect(bridge.x).toBeCloseTo(GLASS_BRIDGE.length + 0.1, 0);
    expect(GLASS_BRIDGE.span).toBeGreaterThanOrEqual(6);
    expect(GLASS_BRIDGE.span).toBeLessThanOrEqual(8);
  });
});

describe('TASK-465 HQ details', () => {
  const close = (g: THREE.BufferGeometry, hex: string, tol = 0.14): boolean => {
    const c = g.getAttribute('color');
    const t = new THREE.Color(hex);
    for (let i = 0; i < c.count; i += 3)
      if (Math.abs(c.getX(i) - t.r) + Math.abs(c.getY(i) - t.g) + Math.abs(c.getZ(i) - t.b) < tol)
        return true;
    return false;
  };

  it('each gate wears its own culture accent; the 7 gates differ', () => {
    THEME_IDS.forEach((t, v) => {
      expect(close(buildProp('cultureGate', 1, v, 0), THEMES[t].accent), `${t} accent`).toBe(true);
    });
    const a = num(buildProp('cultureGate', 1, 0, 0), 'color');
    for (let v = 1; v < 7; v++)
      expect(num(buildProp('cultureGate', 1, v, 0), 'color')).not.toEqual(a);
  });

  it('cultureGate: lamp hook = a glowing vertex range under the lintel, clear of the passage', () => {
    const g = buildProp('cultureGate', 1, 2, 0);
    const lamp = hooks(g).lamp as { at: number[]; first: number; count: number };
    expect(lamp.count).toBeGreaterThan(0);
    expect(lamp.at[1]).toBeLessThan(CULTURE_GATE.clearHeight);
    expect(lamp.at[1]).toBeGreaterThan(1.6);
    const e = g.getAttribute('emissive');
    for (let i = lamp.first; i < lamp.first + lamp.count; i++) expect(e.getX(i)).toBe(1);
  });

  it('goodsStall: the 7 goods differ and the awning is the accent', () => {
    const g = THEME_IDS.map((_, v) => buildProp('goodsStall', 1, v, 0));
    for (let v = 1; v < 7; v++) expect(num(g[v], 'color')).not.toEqual(num(g[0], 'color'));
    THEME_IDS.forEach((t, v) => expect(close(g[v], THEMES[t].accent), t).toBe(true));
  });

  it('semaphoreTower: arm hooks (the arms are mover parts), exact pivots, V rest pose, lamp', () => {
    const g = buildProp('semaphoreTower', 1, 0, 0);
    const h = hooks(g);
    expect(h.arms).toHaveLength(2);
    h.arms.forEach(
      (a: { pivot: number[]; axis: number[]; restAngle: number; length: number }, i: number) => {
        expect(a.pivot[0]).toBeCloseTo(SEMAPHORE.pivotX[i], 5);
        expect(a.pivot[1]).toBeCloseTo(SEMAPHORE.pivotY, 5);
        expect(a.axis).toEqual([0, 0, 1]);
        expect(a.restAngle).toBeCloseTo((SEMAPHORE.restDeg[i] * Math.PI) / 180, 6);
        expect(a.length).toBe(SEMAPHORE.armLength);
      },
    );
    expect(h.lamp.count).toBeGreaterThan(0);
    // the standalone arm for a mover: pivot at the origin
    const arm = buildSemaphoreArm(createRng(1).fork('arm'), 0);
    arm.computeBoundingBox();
    expect(arm.boundingBox?.min.y).toBeLessThan(0);
    expect(arm.boundingBox?.max.y).toBeCloseTo(SEMAPHORE.armLength, 1);
  });

  it('mailLine: anchors match content, the cable meets them and sags between', () => {
    MAIL_LINE.anchor.forEach((anchor, v) => {
      const g = buildProp('mailLine', 1, v, 0);
      expect(hooks(g).cable.anchor).toEqual(anchor.map((x) => expect.closeTo(x, 5)));
      expect(hooks(g).sack.at[1]).toBeGreaterThan(0);
      expect(size(g).y).toBeGreaterThan(MAIL_LINE.height[v]);
    });
    const a = { x: 2, y: 9, z: -4 };
    const b = { x: 32, y: 3.5, z: 14 };
    const rng = createRng(5).fork('cable');
    const c0 = buildMailCable(rng, a, b, 0);
    const c1 = buildMailCable(rng, a, b, 1);
    expect(verts(c1)).toBeLessThan(verts(c0));
    for (const g of [c0, c1]) {
      for (const n of ['position', 'normal', 'color', 'wind', 'ao', 'emissive'])
        expect(
          num(g, n).every((x) => Number.isFinite(x)),
          n,
        ).toBe(true);
    }
    c0.computeBoundingBox();
    const bb = c0.boundingBox as THREE.Box3;
    expect(bb.min.x).toBeLessThan(a.x + 0.2);
    expect(bb.max.x).toBeGreaterThan(b.x - 0.2);
    expect(hooks(c0).cable.sag).toBeGreaterThan(MAIL_LINE.sagMin - 1e-6);
    // the curve sags below the straight chord at mid span and meets the ends exactly
    const mid = mailCablePoint(a, b, 0.5);
    expect(mid.y).toBeLessThan((a.y + b.y) / 2 - 0.3);
    expect(mailCablePoint(a, b, 0)).toEqual(a);
    expect(mailCablePoint(a, b, 1)).toEqual(b);
  });
});

describe('TASK-465 Design details', () => {
  const spinW = (g: THREE.BufferGeometry): number[] =>
    g.getAttribute('aSpin') ? num(g, 'aSpin').filter((_, i) => i % 4 === 3) : [];

  it('conservatory: stained surface tag on the glass at LOD0 only; lantern glows; 4 open bays', () => {
    const g0 = buildProp('conservatory', 1, 0, 0);
    const g1 = buildProp('conservatory', 1, 0, 1);
    expect(spinW(g0).filter((w) => w === -12).length).toBeGreaterThan(500);
    expect(g1.getAttribute('aSpin')).toBeUndefined();
    expect(Math.max(...num(g0, 'emissive'))).toBeGreaterThanOrEqual(1);
    expect(CONSERVATORY.height).toBeGreaterThan(9);
    // looking through a bay (+z): no vertex in the doorway column above the floor below the lintel
    const p = g0.getAttribute('position');
    let blocked = 0;
    for (let i = 0; i < p.count; i++)
      if (Math.abs(p.getX(i)) < 1.0 && p.getY(i) > 1 && p.getY(i) < 2.8 && p.getZ(i) > 6.5)
        blocked++;
    expect(blocked).toBe(0);
  });

  it('glasshouse: the 5 pane tints differ', () => {
    const cols = GLASSHOUSE_HUES.map((_, v) => num(buildProp('glasshouse', 1, v, 0), 'color'));
    for (let v = 1; v < cols.length; v++) expect(cols[v]).not.toEqual(cols[0]);
  });

  it('glassBridge: documented span / width, arch rise, stained tag on the balustrade', () => {
    const g = buildProp('glassBridge', 1, 0, 0);
    const w = hooks(g).walk;
    expect(w).toEqual({
      span: GLASS_BRIDGE.span,
      width: GLASS_BRIDGE.width,
      endY: GLASS_BRIDGE.endY,
      midY: GLASS_BRIDGE.midY,
    });
    expect(GLASS_BRIDGE.midY).toBeGreaterThan(GLASS_BRIDGE.endY);
    expect(size(g).z).toBeCloseTo(GLASS_BRIDGE.width, 0);
    expect(spinW(g).filter((x) => x === -12).length).toBeGreaterThan(20);
  });

  it('prismArch: pool hook on the ground under the arch, the path is clear', () => {
    const g = buildProp('prismArch', 1, 0, 0);
    const pool = hooks(g).pool as { at: number[]; radius: number; source: number[] };
    expect(pool.at).toEqual([0, 0, 0]);
    expect(pool.radius).toBe(PRISM_ARCH.poolRadius);
    expect(pool.source[1]).toBeGreaterThan(PRISM_ARCH.crownY);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++)
      if (Math.abs(p.getX(i)) < 0.55 && p.getY(i) < 1.4)
        throw new Error('something stands in the passage');
  });

  it('stainedWindmill: rotor spins about the hub (aSpin w = 1), axis +z; the tower does not', () => {
    for (const lod of [0, 1] as const) {
      const g = buildProp('stainedWindmill', 1, 0, lod);
      const hub = g.userData.hub as number[];
      expect(hub).toEqual(
        [0, STAINED_WINDMILL.hubY, STAINED_WINDMILL.hubZ].map((x) => expect.closeTo(x, 1)),
      );
      expect(g.userData.spinAxis).toEqual([0, 0, 1]);
      expect(hooks(g).rotor.sails).toBe(4);
      const w = spinW(g);
      const n = w.filter((x) => x === 1).length;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(w.length);
      expect(w.every((x) => x === 0 || x === 1)).toBe(true);
      expect(num(g, 'wind').every((x) => x === 0)).toBe(true);
    }
  });
});
