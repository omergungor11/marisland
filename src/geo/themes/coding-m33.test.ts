/** TASK-543: Coding M33 kit (Bot Foundry, Drone Port, test track, Data Lake kit). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cultureCapOverride } from '../../content/budgets.ts';
import { CODING_CULTURE } from '../../content/cultures/coding.ts';
import { validateCultures } from '../../content/cultures/validate.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { CODING_M33_PROP_DEFS } from '../../content/props-themes/coding-m33.ts';
import { BOT_SCALE, CODING_M33 as F } from '../../content/themes/coding-m33.ts';
import { DRONES } from '../../content/activity.ts';
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

/** LOD0 triangle budgets per `def:variant` (default per def). */
const BUDGET: Record<string, number> = {
  conveyorLine: 800,
  assemblyArm: 800,
  foundryPart: 700,
  dronePad: 900,
  chargeMast: 400,
  droneHangar: 500,
  botCourse: 500,
  serverPod: 700,
  cloudBalloon: 1000,
  quantumPavilion: 1800,
};
/** Variants whose mesh floats above the ground pivot by design (the arm's swing group and the gantry pendulum). */
const NOT_GROUND = new Set(['assemblyArm:3', 'assemblyArm:5']);
const GLOWS = new Set([
  'assemblyArm:0',
  'assemblyArm:1',
  'assemblyArm:3',
  'foundryPart:2',
  'foundryPart:5',
  'dronePad:0',
  'chargeMast:0',
  'chargeMast:1',
  'droneHangar:0',
  'serverPod:0',
  'quantumPavilion:0',
]);

describe('TASK-543 defs and ledger', () => {
  it('ten new defs at the very end of PROP_DEFS, geo and PropDef agree', () => {
    expect(CODING_M33_PROP_DEFS).toHaveLength(10);
    const tail = PROP_DEFS.slice(-10).map((d) => d.id);
    expect(tail).toEqual(CODING_M33_PROP_DEFS.map((d) => d.id));
    for (const d of CODING_M33_PROP_DEFS) {
      const pd = PROP_DEFS[PROP_DEF_INDEX[d.id]];
      expect(PROP_GEO[d.id].variants, d.id).toBe(pd.variants);
      if (PROP_GEO[d.id].heights) expect(PROP_GEO[d.id].heights, d.id).toHaveLength(pd.variants);
      if (pd.variants > 1) expect(pd.rollVariants, d.id).toBe(1); // placed on purpose, a random roll keeps v0
      expect(pd.tier).toBe(d.id === 'foundryPart' ? 3 : 2);
      if (pd.tier === 3) expect(pd.flags & PropFlag.noShadow).toBeTruthy();
    }
  });

  it('ledger: 22 defs = the Coding cap override, 2 tier-1, valid', () => {
    expect(cultureCapOverride.coding).toEqual({ defs: 22, tier1: 2 });
    expect(CODING_CULTURE.kit).toHaveLength(22);
    expect(CODING_CULTURE.kit.slice(-10).map((k) => k.id)).toEqual(
      CODING_M33_PROP_DEFS.map((d) => d.id),
    );
    expect(CODING_CULTURE.kit.filter((k) => k.tier === 1)).toHaveLength(2);
    expect(validateCultures([CODING_CULTURE])).toEqual([]);
    for (const k of CODING_CULTURE.kit.slice(-10)) {
      const d = PROP_DEFS[PROP_DEF_INDEX[k.id]];
      expect(k.tier).toBe(d.tier);
      expect(k.flags).toBe(d.flags);
    }
  });

  it('tier hazard (D-096): every variant of a def is on the same side of the large-structure rule', () => {
    const large = new Set(['dronePad', 'cloudBalloon', 'quantumPavilion']);
    for (const d of CODING_M33_PROP_DEFS) {
      const pd = PROP_DEFS[PROP_DEF_INDEX[d.id]];
      for (let v = 0; v < d.variants; v++)
        expect(isLargeStructure(pd, size(buildProp(d.id, 5, v, 0))), `${d.id} v${v}`).toBe(
          large.has(d.id),
        );
    }
  });
});

describe('TASK-543 per-variant budgets, bounds, determinism', () => {
  for (const d of CODING_M33_PROP_DEFS)
    for (let v = 0; v < d.variants; v++) {
      const key = `${d.id}:${v}`;
      it(`${key}: tris, LOD1, ground pivot, nominal height, finite, glow`, () => {
        const g0 = buildProp(d.id, 7, v, 0);
        const g1 = buildProp(d.id, 7, v, 1);
        expect(tris(g0)).toBeLessThanOrEqual(BUDGET[d.id]);
        expect(tris(g1)).toBeLessThanOrEqual(0.3 * tris(g0)); // the generic geo.test rule
        const b = box(g0);
        if (!NOT_GROUND.has(key)) {
          expect(b.min.y).toBeGreaterThanOrEqual(-0.05);
          expect(b.min.y).toBeLessThanOrEqual(0.05);
        }
        const h = PROP_GEO[d.id].heights?.[v] ?? PROP_GEO[d.id].height;
        expect(b.max.y).toBeGreaterThanOrEqual(h * 0.92);
        expect(b.max.y).toBeLessThanOrEqual(h * 1.08 + 0.02);
        for (const g of [g0, g1]) {
          const pos = arr(g, 'position');
          expect(Array.from(pos).every(Number.isFinite)).toBe(true);
          const em = arr(g, 'emissive');
          for (let f = 0; f < em.length; f += 3)
            expect(em[f] === em[f + 1] && em[f] === em[f + 2]).toBe(true);
          for (let i = 0; i < pos.length; i += 9) {
            const a = new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]);
            const bb = new THREE.Vector3(pos[i + 3], pos[i + 4], pos[i + 5]);
            const c = new THREE.Vector3(pos[i + 6], pos[i + 7], pos[i + 8]);
            expect(bb.sub(a).cross(c.sub(a)).length()).toBeGreaterThan(1e-9);
          }
        }
        if (GLOWS.has(key)) expect(Array.from(arr(g0, 'emissive')).some((x) => x > 0)).toBe(true);
        const a = Array.from(arr(buildProp(d.id, 3, v, 0), 'color'));
        expect(a).toEqual(Array.from(arr(buildProp(d.id, 3, v, 0), 'color')));
        expect(a).not.toEqual(Array.from(arr(buildProp(d.id, 4, v, 0), 'color')));
      });
    }
});

describe('TASK-543 frames and hooks', () => {
  it('conveyor: belt along +x centred, v1 adds a ramp down to the ground', () => {
    const h0 = hooks(buildProp('conveyorLine', 5, 0, 0));
    const h1 = hooks(buildProp('conveyorLine', 5, 1, 0));
    expect(h0.belt.dir).toEqual([1, 0, 0]);
    expect(h0.belt.from[0]).toBeCloseTo(-F.conveyor.length / 2, 6);
    expect(h0.belt.to[0]).toBeCloseTo(F.conveyor.length / 2, 6);
    expect(h0.ramp).toBeUndefined();
    expect(h1.ramp.to[1]).toBeLessThan(0.1);
    expect(h1.ramp.from[0]).toBeCloseTo(F.conveyor.length / 2, 6);
    expect(size(buildProp('conveyorLine', 5, 1, 0)).x).toBeGreaterThan(
      size(buildProp('conveyorLine', 5, 0, 0)).x + 1,
    );
  });

  it('assembly arm / gantry: a yaw joint on the vertical axis, a pendulum joint on z', () => {
    for (const v of [0, 3]) {
      const j = hooks(buildProp('assemblyArm', 5, v, 0)).joint;
      expect(j.kind).toBe('yaw');
      expect(j.axis).toEqual([0, 1, 0]);
      expect(j.restDir).toEqual([1, 0, 0]);
      expect(j.grip[0]).toBeCloseTo(F.arm.reach, 6);
    }
    for (const v of [1, 4, 5]) {
      const j = hooks(buildProp('assemblyArm', 5, v, 0)).joint;
      expect(j.kind).toBe('pendulum');
      expect(j.axis).toEqual([0, 0, 1]);
      expect(j.restDir).toEqual([0, -1, 0]);
    }
    // the pendulum-only variant keeps the gantry's origin: it hangs from the same pivot height
    const b = box(buildProp('assemblyArm', 5, 5, 0));
    expect(b.max.y).toBeCloseTo(F.gantry.pivotY, 1);
    expect(b.min.y).toBeGreaterThan(0.5);
    expect(hooks(buildProp('assemblyArm', 5, 5, 0)).joint.at).toEqual(
      hooks(buildProp('assemblyArm', 5, 1, 0)).joint.at,
    );
    // the swing group sits above the base, the base has no swing hook
    expect(hooks(buildProp('assemblyArm', 5, 2, 0)).joint).toBeUndefined();
    expect(box(buildProp('assemblyArm', 5, 3, 0)).min.y).toBeGreaterThan(0.6);
  });

  it('bot stages match the world bot size, forward +x, heights grow 0 -> 2', () => {
    const hs = [3, 4, 5].map((v) => hooks(buildProp('foundryPart', 5, v, 0)).bot);
    expect(hs.map((h) => h.stage)).toEqual([0, 1, 2]);
    for (const h of hs) {
      expect(h.forward).toEqual([1, 0, 0]);
      expect(h.scale).toBe(BOT_SCALE);
    }
    expect(hs[0].height).toBeLessThan(hs[1].height);
    expect(hs[1].height).toBeLessThan(hs[2].height);
    const full = size(buildProp('foundryPart', 5, 5, 0));
    expect(full.y).toBeGreaterThan(1.8);
    expect(full.y).toBeLessThan(2.2);
    expect(full.x).toBeLessThan(0.8);
    // only the complete stage has lit eyes + antenna ball; the stage 1 head is dark
    const lit = (v: number): number =>
      Array.from(arr(buildProp('foundryPart', 5, v, 0), 'emissive')).filter((x) => x > 0).length;
    expect(lit(5)).toBeGreaterThan(lit(4));
  });

  it('crates: 1.4 x 1.0 u with a slot hook', () => {
    for (const v of [0, 1, 2]) {
      const g = buildProp('foundryPart', 5, v, 0);
      expect(hooks(g).slot.size).toEqual([1.4, 1.0]);
      expect(size(g).x).toBeLessThan(1.7);
    }
  });

  it('drone pad fits the courier drone, lights at the rim, landing hook', () => {
    const g = buildProp('dronePad', 5, 0, 0);
    const h = hooks(g);
    const droneSpan = (0.55 + 0.2) * 2 * DRONES.scale;
    expect(h.pad.ringR * 2).toBeGreaterThan(droneSpan * 1.4);
    expect(h.pad.radius).toBeGreaterThan(h.pad.ringR);
    expect(h.lights.list).toHaveLength(F.pad.lights);
    for (const [x, , z] of h.lights.list) expect(Math.hypot(x, z)).toBeCloseTo(F.pad.lightR, 5);
    expect(h.landing.at[1]).toBeGreaterThan(0.5);
  });

  it('charge mast lamp slot and cradle; hangar door faces +z', () => {
    for (const v of [0, 1]) {
      const h = hooks(buildProp('chargeMast', 5, v, 0));
      expect(h.lamp.at).toHaveLength(3);
      expect(h.cradle.r).toBeGreaterThan(0.1);
    }
    expect(hooks(buildProp('droneHangar', 5, 0, 0)).door.dir).toEqual([0, 0, 1]);
  });

  it('test track: obstacles stay low, all run along +x, one def four looks', () => {
    for (let v = 0; v < 4; v++) {
      const g = buildProp('botCourse', 5, v, 0);
      expect(hooks(g).path.dir).toEqual([1, 0, 0]);
      expect(size(g).y).toBeLessThan(1.0);
    }
  });

  it('server pod: led strip, steam emit hook above the chimney, intake on the lake side', () => {
    const g = buildProp('serverPod', 5, 0, 0);
    const h = hooks(g);
    expect(h.led.size[0]).toBeGreaterThan(0.05);
    expect(h.steam.dir).toEqual([0, 1, 0]);
    expect(h.steam.at[1]).toBeGreaterThan(F.pod.h);
    expect(h.intake.dir).toEqual([0, 0, 1]);
    expect(h.intake.at[2]).toBeGreaterThan(F.pod.d / 2);
  });

  it('cloud balloon: tether + body hooks, body above the tether top, v1 has no anchor block', () => {
    const g0 = buildProp('cloudBalloon', 5, 0, 0);
    const g1 = buildProp('cloudBalloon', 5, 1, 0);
    for (const g of [g0, g1]) {
      const h = hooks(g);
      expect(h.tether.top[1]).toBeCloseTo(F.cloud.tetherH, 6);
      expect(h.body.center[1]).toBeGreaterThan(h.tether.top[1]);
      expect(size(g).y).toBeGreaterThan(8);
    }
    expect(hooks(g0).anchor).toBeDefined();
    expect(hooks(g1).anchor).toBeUndefined();
    expect(tris(g1)).toBeLessThan(tris(g0));
  });

  it('pavilion: glow slot inside, gold chandelier hangs from the roof apex', () => {
    const g = buildProp('quantumPavilion', 5, 0, 0);
    const h = hooks(g);
    expect(h.glow.at[1]).toBeGreaterThan(0.8);
    expect(h.glow.at[1]).toBeLessThan(F.pavilion.postH);
    expect(h.chandelier.top[1]).toBeGreaterThan(F.pavilion.postH);
    expect(h.chandelier.bottom[1]).toBeLessThan(h.glow.at[1]);
    expect(h.door.dir).toEqual([0, 0, 1]);
  });
});
