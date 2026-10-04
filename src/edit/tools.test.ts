import { describe, expect, it } from 'vitest';
import type { EditCommand } from '../world/edit-types.ts';
import { EDIT_UI, EDIT_TOOLS } from '../content/edit-ui.ts';
import {
  StrokeSampler,
  commandFor,
  createToolState,
  nextPlacement,
  setRadius,
  type EditHit,
} from './tools.ts';
import { createEditSession } from './session.ts';
import { FakeHistory, FakeWorld, ManualTimer, decode, encode } from './test-fakes.ts';

const hit = (x: number, z = 0, ground = 2, prop: EditHit['prop'] = null): EditHit => ({
  x,
  z,
  ground,
  prop,
});

describe('commandFor', () => {
  it('builds the command of every tool', () => {
    const s = createToolState(1001, { radius: 12, strength: 0.5, zone: 'sand', def: 'pine' });
    const h = hit(3, 4, 2.5, { id: 77, rotY: 1.2 });
    const out: Record<string, EditCommand | null> = {};
    for (const t of EDIT_TOOLS) {
      s.tool = t;
      out[t] = commandFor(s, h, { startGround: 1.5, prop: { id: 77, rotY: 1.2 } });
    }
    const d = 0.5 * EDIT_UI.brushDelta;
    expect(out.raise).toEqual({ k: 'raise', x: 3, z: 4, r: 12, s: d });
    expect(out.lower).toEqual({ k: 'lower', x: 3, z: 4, r: 12, s: d });
    // flatten targets the height under the stroke's first sample
    expect(out.flatten).toEqual({ k: 'flatten', x: 3, z: 4, r: 12, s: 1.5 });
    expect(out.smooth).toEqual({ k: 'smooth', x: 3, z: 4, r: 12, s: 0.5 * EDIT_UI.smoothBlend });
    expect(out.paint).toEqual({ k: 'paint', x: 3, z: 4, r: 12, zone: 'sand' });
    const p = nextPlacement(s);
    expect(out.prop).toEqual({
      k: 'propAdd',
      def: 'pine',
      x: 3,
      z: 4,
      rotY: p.rotY,
      scale: p.scale,
      variant: p.variant,
    });
    expect(out.erase).toEqual({ k: 'propRemove', id: 77 });
    expect(out.move).toEqual({ k: 'propMove', id: 77, x: 3, z: 4, rotY: 1.2 });
    s.tool = null;
    expect(commandFor(s, h)).toBeNull();
    s.tool = 'erase';
    expect(commandFor(s, hit(0))).toBeNull();
  });

  it('draws placements from a label-forked rng: deterministic, varied, in range', () => {
    const s = createToolState(1001, { variants: 3 });
    const a = [0, 1, 2, 3, 4].map((n) => nextPlacement(s, n));
    const b = [0, 1, 2, 3, 4].map((n) => nextPlacement(createToolState(1001, { variants: 3 }), n));
    expect(a).toEqual(b);
    expect(new Set(a.map((p) => p.rotY.toFixed(4))).size).toBe(5);
    for (const p of a) {
      expect(p.rotY).toBeGreaterThanOrEqual(0);
      expect(p.rotY).toBeLessThan(Math.PI * 2);
      expect(p.scale).toBeGreaterThanOrEqual(EDIT_UI.propScale[0]);
      expect(p.scale).toBeLessThan(EDIT_UI.propScale[1]);
      expect(p.variant).toBeGreaterThanOrEqual(0);
      expect(p.variant).toBeLessThan(3);
    }
    expect(nextPlacement(createToolState(2024, { variants: 3 }), 0)).not.toEqual(a[0]);
    expect(nextPlacement(createToolState(1001, { variant: 2, variants: 3 }), 0).variant).toBe(2);
  });

  it('clamps the radius to 4–40 u', () => {
    const s = createToolState(1);
    expect(setRadius(s, 1)).toBe(EDIT_UI.radius.min);
    expect(setRadius(s, 99)).toBe(EDIT_UI.radius.max);
    expect(EDIT_UI.radius.min).toBe(4);
    expect(EDIT_UI.radius.max).toBe(40);
  });
});

describe('StrokeSampler', () => {
  const sampler = (init: Parameters<typeof createToolState>[1] = {}, ok = true) => {
    const s = createToolState(1001, { radius: 10, ...init });
    const cmds: EditCommand[] = [];
    const smp = new StrokeSampler(s, (c) => {
      cmds.push(c);
      return ok;
    });
    return { s, cmds, smp };
  };
  const xs = (cmds: EditCommand[]): number[] =>
    cmds.map((c) => ('x' in c ? Math.round(c.x * 1000) / 1000 : NaN));

  it('emits at pointer-down, then every radius × 0.35 of terrain travel', () => {
    const { cmds, smp } = sampler();
    expect(EDIT_UI.sampleSpacing).toBe(0.35);
    expect(smp.spacing).toBeCloseTo(3.5);
    smp.begin(hit(0));
    for (let x = 1; x <= 10; x++) smp.move(hit(x));
    expect(smp.end()).toBe(3);
    expect(xs(cmds)).toEqual([0, 3.5, 7]);
  });

  it('fills the gap of a fast drag along the segment, capped per move', () => {
    const { cmds, smp } = sampler();
    smp.begin(hit(0, 0));
    smp.move(hit(0, 20)); // 20 u → 5 samples at 3.5 u
    expect(cmds.map((c) => ('z' in c ? Math.round(c.z * 100) / 100 : NaN))).toEqual([
      0, 3.5, 7, 10.5, 14, 17.5,
    ]);
    cmds.length = 0;
    smp.move(hit(0, 200)); // far: capped, the last sample lands on the pointer
    expect(cmds).toHaveLength(EDIT_UI.maxSamplesPerMove);
    expect(cmds.at(-1)).toMatchObject({ z: 200 });
    cmds.length = 0;
    smp.move(hit(0, 202)); // continues from the pointer, no catch-up burst
    expect(cmds).toHaveLength(0);
    smp.end();
  });

  it('no samples while not stroking; spacing follows the radius', () => {
    const { s, cmds, smp } = sampler({ radius: 40 });
    smp.move(hit(100));
    expect(cmds).toHaveLength(0);
    smp.begin(hit(0));
    smp.move(hit(13)); // < 14
    expect(cmds).toHaveLength(1);
    smp.move(hit(14.01));
    expect(cmds).toHaveLength(2);
    smp.end();
    setRadius(s, 4);
    smp.begin(hit(0));
    smp.move(hit(1.5));
    expect(cmds).toHaveLength(4);
  });

  it('prop: one placement per stroke; the counter advances only when applied', () => {
    const ok = sampler({ tool: 'prop' });
    ok.smp.begin(hit(1));
    ok.smp.move(hit(30));
    ok.smp.end();
    expect(ok.cmds).toHaveLength(1);
    expect(ok.s.placed).toBe(1);
    const no = sampler({ tool: 'prop' }, false);
    no.smp.begin(hit(1));
    no.smp.end();
    expect(no.s.placed).toBe(0);
  });

  it('erase removes each prop once per stroke; move drops the grabbed prop at pointer-up', () => {
    const er = sampler({ tool: 'erase' });
    er.smp.begin(hit(0, 0, 0, { id: 5, rotY: 0 }));
    er.smp.move(hit(1, 0, 0, { id: 5, rotY: 0 }));
    er.smp.move(hit(2, 0, 0, null));
    er.smp.move(hit(3, 0, 0, { id: 6, rotY: 0 }));
    er.smp.end();
    expect(er.cmds).toEqual([
      { k: 'propRemove', id: 5 },
      { k: 'propRemove', id: 6 },
    ]);
    const mv = sampler({ tool: 'move' });
    mv.smp.begin(hit(0, 0, 0, { id: 9, rotY: 0.7 }));
    mv.smp.move(hit(5, 5));
    expect(mv.cmds).toHaveLength(0);
    mv.smp.end();
    expect(mv.cmds).toEqual([{ k: 'propMove', id: 9, x: 5, z: 5, rotY: 0.7 }]);
    const none = sampler({ tool: 'move' });
    none.smp.begin(hit(0));
    none.smp.end(hit(4));
    expect(none.cmds).toHaveLength(0);
  });

  it('flatten keeps the first sample height for the whole stroke', () => {
    const { cmds, smp } = sampler({ tool: 'flatten' });
    smp.begin(hit(0, 0, 3.25));
    smp.move(hit(8, 0, 9));
    smp.end();
    expect(cmds.length).toBeGreaterThan(1);
    for (const c of cmds) expect(c).toMatchObject({ k: 'flatten', s: 3.25 });
  });

  it('a stroke through the session is one undo step', () => {
    const world = new FakeWorld();
    const session = createEditSession({
      seed: 1001,
      apply: world.apply,
      rebuild: () => {},
      history: new FakeHistory(),
      encode,
      decode,
      storage: null,
      timer: new ManualTimer(),
      now: () => 0,
    });
    const s = createToolState(1001, { radius: 10 });
    const smp = new StrokeSampler(s, (c) => session.apply(c).ok);
    const empty = world.snapshot();
    session.beginStroke();
    smp.begin(hit(0));
    for (let x = 1; x <= 30; x++) smp.move(hit(x));
    smp.end();
    session.endStroke();
    expect(session.count).toBe(9);
    expect(session.undo()).toBe(true);
    expect(session.count).toBe(0);
    expect(world.snapshot()).toBe(empty);
    expect(session.undo()).toBe(false);
  });
});
