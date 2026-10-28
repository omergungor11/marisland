/** TASK-517: Marketing M27 signature kit (cable car, sea billboard, ON AIR neon, dive tower, guyed mast). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SURFACE } from '../../content/activity.ts';
import { cultureCapOverride } from '../../content/budgets.ts';
import { MARKETING_CULTURE } from '../../content/cultures/marketing.ts';
import { validateCultures } from '../../content/cultures/validate.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { MARKETING_M27_PROP_DEFS } from '../../content/props-themes/marketing-m27.ts';
import { MARKETING_M27 as F } from '../../content/themes/marketing-m27.ts';
import { isLargeStructure } from '../../render/props/batcher.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { PROP_GEO, buildProp } from '../registry.ts';

const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
const box = (g: THREE.BufferGeometry): THREE.Box3 => {
  g.computeBoundingBox();
  return g.boundingBox as THREE.Box3;
};
const size = (g: THREE.BufferGeometry): THREE.Vector3 => box(g).getSize(new THREE.Vector3());
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hooks = (g: THREE.BufferGeometry): Record<string, any> => g.userData.hooks ?? {};
const arr = (g: THREE.BufferGeometry, n: string): ArrayLike<number> => g.getAttribute(n).array;

/** LOD0 triangle budgets per added variant. */
const BUDGET: Record<string, number> = {
  'mailLine:4': 1300,
  'mailLine:5': 450,
  'mailLine:6': 450,
  'billboardV2:2': 450,
  'billboardV2:3': 800,
  'antennaTower:2': 1000,
  diveTower: 1200,
};

describe('TASK-517 Marketing M27 defs', () => {
  it('diveTower is the last def, geo and PropDef agree', () => {
    expect(MARKETING_M27_PROP_DEFS.map((d) => d.id)).toEqual(['diveTower']);
    expect(PROP_DEF_INDEX.diveTower).toBe(PROP_DEFS.length - 1);
    expect(PROP_GEO.diveTower.variants).toBe(PROP_DEFS[PROP_DEF_INDEX.diveTower].variants);
    expect(PROP_GEO.diveTower.windy).toBe(
      (PROP_DEFS[PROP_DEF_INDEX.diveTower].flags & PropFlag.windy) !== 0,
    );
  });

  it('variants of old defs: geo and PropDef agree, random rolls keep the old variants', () => {
    for (const [id, variants, roll] of [
      ['mailLine', 7, 2],
      ['billboardV2', 4, 2],
      ['antennaTower', 3, 1],
    ] as const) {
      const d = PROP_DEFS[PROP_DEF_INDEX[id]];
      expect(PROP_GEO[id].variants, id).toBe(variants);
      expect(PROP_GEO[id].heights, id).toHaveLength(variants);
      expect(d.variants, id).toBe(variants);
      expect(d.rollVariants, id).toBe(roll);
    }
  });

  it('ledger: 11 defs = the Marketing cap override, one tier-1, valid; only the dive tower is new', () => {
    expect(cultureCapOverride.marketing).toEqual({ defs: 11, tier1: 1 });
    expect(MARKETING_CULTURE.kit).toHaveLength(11);
    expect(MARKETING_CULTURE.kit.at(-1)?.id).toBe('diveTower');
    expect(validateCultures([MARKETING_CULTURE])).toEqual([]);
    const k = MARKETING_CULTURE.kit.at(-1);
    const d = PROP_DEFS[PROP_DEF_INDEX.diveTower];
    expect(k?.tier).toBe(d.tier);
    expect(k?.flags).toBe(d.flags);
  });

  it('older variants are unchanged (mailLine 0-3, billboardV2 0-1, antennaTower 0-1)', () => {
    expect(hooks(buildProp('mailLine', 5, 0, 0)).cable.anchor).toBeDefined();
    expect(hooks(buildProp('mailLine', 5, 3, 0)).ore.at).toBeDefined();
    expect(hooks(buildProp('billboardV2', 5, 0, 0)).screen.size).toEqual([5.2, 2.6]);
    expect(hooks(buildProp('antennaTower', 5, 1, 0)).lamp).toBeUndefined();
  });
});

describe('TASK-517 per-variant budgets, bounds, determinism', () => {
  const rows: [string, number][] = [
    ['mailLine', 4],
    ['mailLine', 5],
    ['mailLine', 6],
    ['billboardV2', 2],
    ['billboardV2', 3],
    ['antennaTower', 2],
    ['diveTower', 0],
  ];
  for (const [id, v] of rows) {
    it(`${id} v${v}: triangle budget, LOD1 <= 30 %, ground pivot, nominal height, whole emissive faces`, () => {
      const g0 = buildProp(id, 7, v, 0);
      const g1 = buildProp(id, 7, v, 1);
      expect(tris(g0)).toBeLessThanOrEqual(BUDGET[`${id}:${v}`] ?? BUDGET[id]);
      expect(tris(g1)).toBeLessThanOrEqual(0.3 * tris(g0));
      const b = box(g0);
      expect(b.min.y).toBeGreaterThanOrEqual(-0.05);
      expect(b.min.y).toBeLessThanOrEqual(0.05);
      const h = PROP_GEO[id].heights?.[v] ?? PROP_GEO[id].height;
      expect(b.max.y).toBeGreaterThanOrEqual(h * 0.9);
      expect(b.max.y).toBeLessThanOrEqual(h * 1.1);
      for (const g of [g0, g1]) {
        const em = arr(g, 'emissive');
        for (let f = 0; f < em.length; f += 3)
          expect(em[f] === em[f + 1] && em[f] === em[f + 2]).toBe(true);
        const hasLit = Array.from(em).some((x) => x > 0);
        // (the dive tower's lamp is a near-LOD detail)
        if (g === g0 || id !== 'diveTower')
          expect(hasLit, `${id} v${v} lod${g === g0 ? 0 : 1} glows`).toBe(true);
      }
      expect(Array.from(arr(g0, 'position')).every(Number.isFinite)).toBe(true);
      // deterministic per seed, seed-sensitive (colour jitter)
      const a = Array.from(arr(buildProp(id, 3, v, 0), 'color'));
      expect(a).toEqual(Array.from(arr(buildProp(id, 3, v, 0), 'color')));
      expect(a).not.toEqual(Array.from(arr(buildProp(id, 4, v, 0), 'color')));
    });
  }
});

describe('TASK-517 cable car (mailLine 4 / 5 / 6)', () => {
  it('sea pylon: cable seats front / back on the sheaves, 9 u tall, landing flush with the gondola floor', () => {
    const g = buildProp('mailLine', 5, F.pylon.variant, 0);
    const h = hooks(g);
    expect(h.cable.anchor).toEqual([0, F.pylon.anchorY, F.pylon.sheaveZ]);
    expect(h.cable.back).toEqual([0, F.pylon.anchorY, -F.pylon.sheaveZ]);
    expect(h.sheaves.list).toHaveLength(2);
    expect(box(g).max.y).toBeGreaterThan(F.pylon.anchorY);
    expect(box(g).max.y).toBeGreaterThan(9);
    // the gondola floor hangs `grip` under the cable seat
    const floorY = F.pylon.anchorY - F.gondola.grip;
    expect(Math.abs(h.landing.y - floorY)).toBeLessThan(0.15);
    // the landing is beside the line, clear of the cabin half width
    expect(h.landing.at[0] - h.landing.size[0] / 2).toBeGreaterThan(F.gondola.w / 2 + 0.1);
    // never mistaken for an HQ mail pylon (render/mail-lines.ts skips variants >= 2)
    expect(F.pylon.variant).toBeGreaterThanOrEqual(2);
  });

  it('gondolas: grip over the pivot, hanger pin below the grip, swing axis = the cable (z), two liveries', () => {
    const colours: string[] = [];
    for (const v of F.gondola.variants) {
      const g = buildProp('mailLine', 5, v, 0);
      const h = hooks(g).gondola;
      expect(h.grip).toEqual([0, F.gondola.grip, 0]);
      expect(h.pivot[1]).toBeLessThan(h.grip[1]);
      expect(h.pivot[1]).toBeGreaterThan(F.gondola.h);
      expect(h.axis).toEqual([0, 0, 1]);
      expect(h.floor).toEqual([0, 0, 0]);
      expect(box(g).max.y).toBeGreaterThan(h.grip[1]);
      const s = size(g);
      expect(s.x).toBeLessThan(1.6);
      expect(s.y).toBeGreaterThan(2.2);
      // windows are lit lamp-class faces
      const em = arr(g, 'emissive');
      expect(Array.from(em).filter((x) => x === 1).length).toBeGreaterThan(30);
      const c = arr(g, 'color');
      colours.push(
        Array.from(c)
          .slice(0, 60)
          .map((x) => x.toFixed(2))
          .join(),
      );
    }
    expect(colours[0]).not.toBe(colours[1]);
  });
});

describe('TASK-517 sea billboard (billboardV2 2)', () => {
  it('6 u wide, on the slides surface, face rect and rock-face mount hooks', () => {
    const g = buildProp('billboardV2', 5, F.seaBoard.variant, 0);
    const h = hooks(g);
    expect(h.screen.size).toEqual([6, 3]);
    expect(h.screen.normal).toEqual([0, 0, 1]);
    expect(h.mount.normal).toEqual([0, 0, 1]);
    expect(h.mount.face[2]).toBe(-F.seaBoard.reach);
    expect(box(g).min.z).toBeLessThanOrEqual(-F.seaBoard.reach);
    expect(size(g).x).toBeGreaterThan(6);
    const spin = arr(g, 'aSpin');
    let slides = 0;
    for (let i = 3; i < spin.length; i += 4) if (spin[i] === -SURFACE.slides) slides++;
    expect(slides).toBeGreaterThan(20);
  });
});

describe('TASK-517 ON AIR neon (billboardV2 3)', () => {
  it('five letters top to bottom, each its own contiguous emissive slot', () => {
    const g = buildProp('billboardV2', 5, F.onAir.variant, 0);
    const list = hooks(g).letters.list as {
      index: number;
      char: string;
      first: number;
      count: number;
      center: number[];
      slot: number;
    }[];
    expect(list.map((l) => l.char).join('')).toBe('ONAIR');
    const em = arr(g, 'emissive');
    let end = 0;
    for (const [k, l] of list.entries()) {
      expect(l.slot).toBeCloseTo(F.onAir.slot.base + k * F.onAir.slot.step, 6);
      expect(l.first).toBeGreaterThanOrEqual(end);
      end = l.first + l.count;
      expect(l.count).toBeGreaterThan(90);
      for (let i = l.first; i < l.first + l.count; i++) expect(em[i]).toBeCloseTo(l.slot, 5);
      if (k > 0) expect(l.center[1]).toBeLessThan(list[k - 1].center[1]);
    }
    // nothing else glows with a slot value: every lit vertex belongs to a letter
    const lit = Array.from(em).filter((x) => x > 0).length;
    expect(lit).toBe(list.reduce((n, l) => n + l.count, 0));
    expect(hooks(g).glow).toEqual({ slotBase: F.onAir.slot.base, slotStep: F.onAir.slot.step });
    expect(hooks(g).mount.reach).toBe(F.onAir.reach);
    expect(box(g).min.z).toBeLessThanOrEqual(-F.onAir.reach);
    // letters are ~1.4 u (the study's 1.4 u / letter): 1.2 u strokes on 1.5 u plates
    expect(list.length * (F.onAir.plate.h + F.onAir.gap)).toBeGreaterThan(7);
  });

  it('LOD1 keeps one lit slab per letter with the same slot values', () => {
    const g = buildProp('billboardV2', 5, F.onAir.variant, 1);
    const slots = new Set(
      Array.from(arr(g, 'emissive'))
        .filter((x) => x > 0)
        .map((x) => +x.toFixed(2)),
    );
    expect([...slots].sort()).toEqual(['1.00', '1.01', '1.02', '1.03', '1.04'].map(Number).sort());
    expect(hooks(g).letters.list).toHaveLength(5);
  });
});

describe('TASK-517 dive tower', () => {
  const g = buildProp('diveTower', 5, 0, 0);
  const h = hooks(g);

  it('board tip out front above the deck, ladder foot on the ground, splash straight ahead', () => {
    expect(h.deck.y).toBe(F.dive.deckY);
    expect(h.board.tip[1]).toBeGreaterThan(F.dive.deckY);
    expect(h.board.tip[1]).toBeLessThan(F.dive.deckY + 0.6);
    expect(h.board.tip[2]).toBeGreaterThan(F.dive.deck / 2 + 1.5);
    expect(h.ladder.foot[1]).toBeLessThan(0.4);
    expect(h.ladder.top[1]).toBeGreaterThan(F.dive.deckY);
    expect(h.splash.dir).toEqual([0, 0, 1]);
    expect(h.splash.ahead).toBe(F.dive.splashAhead);
    expect(h.flag.at[1]).toBeGreaterThan(F.dive.deckY);
    expect(h.lamps.list.length).toBeGreaterThan(0);
    // the tip is the front-most point of the geometry bar the board's own end cap
    expect(box(g).max.z).toBeGreaterThanOrEqual(h.board.tip[2] - 0.01);
  });

  it('is a large structure (drawn from T0 by size) and the pennant carries wind weights', () => {
    expect(isLargeStructure(PROP_DEFS[PROP_DEF_INDEX.diveTower], size(g))).toBe(true);
    expect(Array.from(arr(g, 'wind')).some((x) => x > 0)).toBe(true);
    expect(Array.from(arr(g, 'wind')).every((x) => x >= 0 && x <= 1)).toBe(true);
  });
});

describe('TASK-517 guyed transmitter (antennaTower 2)', () => {
  it('blink lamp hook on the tip, tagged as a beacon at LOD0; three eye blocks', () => {
    const g = buildProp('antennaTower', 5, F.guyed.variant, 0);
    const h = hooks(g);
    expect(h.lamp.at[1]).toBeGreaterThan(F.guyed.height);
    expect(box(g).max.y).toBeGreaterThan(h.lamp.at[1]);
    expect(h.guys.eyes).toHaveLength(F.guyed.count);
    const spin = arr(g, 'aSpin');
    const em = arr(g, 'emissive');
    let blink = 0;
    for (let i = 0; i < em.length; i++) {
      if (spin[i * 4 + 3] === -SURFACE.beacon) {
        blink++;
        expect(em[i]).toBe(1);
      }
    }
    expect(blink).toBeGreaterThan(10);
    // the tagged lamp sits at the hook
    const pos = arr(g, 'position');
    let ymax = 0;
    for (let i = 0; i < em.length; i++)
      if (spin[i * 4 + 3] === -SURFACE.beacon) ymax = Math.max(ymax, pos[i * 3 + 1]);
    expect(ymax).toBeGreaterThan(h.lamp.at[1] - 0.05);
    // guys reach the eye radius at LOD0, never beyond
    const b = box(g);
    expect(Math.max(b.max.x, b.max.z, -b.min.x, -b.min.z)).toBeLessThan(F.guyed.radius + 0.3);
    expect(Math.max(b.max.x, b.max.z, -b.min.x, -b.min.z)).toBeGreaterThan(F.guyed.radius - 0.4);
  });

  it('taller than the short v1 transmitter, and v1 stays unguyed', () => {
    const v1 = buildProp('antennaTower', 5, 1, 0);
    const v2 = buildProp('antennaTower', 5, 2, 0);
    expect(box(v2).max.y).toBeGreaterThan(box(v1).max.y + 1);
    expect(hooks(v1).guys).toBeUndefined();
    expect(Math.max(size(v1).x, size(v1).z)).toBeLessThan(2.3);
  });
});
