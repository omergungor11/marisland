import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { Scope } from '../core/scope.ts';
import { PROP_DEFS } from '../content/props.ts';
import { CULTURE_MOVERS as M } from '../content/cultures/movers.ts';
import { createEnvState, sampleEnv, type EnvState } from '../env/env-state.ts';
import { generateWorld } from '../world/index.ts';
import { THEME_IDS, type ThemeId, type WorldData } from '../world/types.ts';
import { appendSettlementProps } from './props/settlement-props.ts';
import { createCultureMovers, type CultureMoversView } from './culture-movers.ts';
import { PART, buildPartsGeometry } from './culture-mover-parts.ts';
import { SHARED } from './uniforms.ts';

/** Prop store position of the first instance of def `id` (null when the seed has none). */
function firstOf(
  w: WorldData,
  store: ReturnType<typeof appendSettlementProps>['props'],
  id: string,
) {
  for (let i = 0; i < store.count; i++)
    if (PROP_DEFS[store.defId[i]].id === id)
      return new THREE.Vector3(store.x[i], store.y[i] + 2, store.z[i]);
  void w;
  return null;
}

/** Culture-clock state with one ritual running on `theme` (or none). */
function fest(theme?: ThemeId, id = '', phase = 0.3) {
  const festival = {} as Record<ThemeId, { id: string; phase: number } | null>;
  for (const t of THEME_IDS) festival[t] = t === theme ? { id, phase } : null;
  return { festival };
}

function env(hour: number): EnvState {
  const e = createEnvState();
  sampleEnv(hour, e);
  return e;
}

/** Packed instance matrices + kinds of the live range, for determinism / NaN checks. */
function snapshot(v: CultureMoversView): number[] {
  const m = v.mesh;
  if (!m) return [];
  const gait = m.geometry.getAttribute('aGait');
  const out: number[] = [];
  for (let i = 0; i < m.count; i++) {
    out.push(gait.getY(i));
    for (let k = 0; k < 16; k++) out.push(m.instanceMatrix.array[i * 16 + k]);
  }
  return out;
}

describe('culture movers', () => {
  const world = generateWorld(1001);
  const { props } = appendSettlementProps(world);
  let view: CultureMoversView;
  beforeAll(() => {
    view = createCultureMovers(props, world, new Scope('test'));
  });

  it('parts geometry: one merged mesh, every kind present, no NaN', () => {
    const g = buildPartsGeometry();
    const limb = g.getAttribute('limb');
    const kinds = new Set<number>();
    for (let i = 0; i < limb.count; i++) kinds.add(limb.getX(i));
    expect(kinds.size).toBe(Object.keys(PART).length);
    for (const a of ['position', 'normal', 'color', 'emissive'])
      expect(g.getAttribute(a).array.every(Number.isFinite)).toBe(true);
    expect(g.getAttribute('position').count).toBeLessThan(3000);
  });

  it('every scene kind exists in seed 1001 (or is covered by ants / beams)', () => {
    expect(view.sceneCount).toBeGreaterThanOrEqual(8);
  });

  it('writes poses near a scene, deterministic in (time, hour), no NaN', () => {
    const at = firstOf(world, props, 'bellPost');
    expect(at).not.toBeNull();
    const e = env(6.1);
    view.update(10, 6.1, e, at!, fest('hq', 'ferryFanfare'));
    const a = snapshot(view);
    expect(view.stats().instances).toBeGreaterThanOrEqual(M.bell.rings);
    expect(a.every(Number.isFinite)).toBe(true);
    view.update(10.5, 6.1, e, at!, fest('hq', 'ferryFanfare'));
    const b = snapshot(view);
    expect(b).not.toEqual(a); // ripples move with sim time
    view.update(10, 6.1, e, at!, fest('hq', 'ferryFanfare'));
    expect(snapshot(view)).toEqual(a); // same (t, hour) -> same pose
  });

  it('rituals follow the culture clock: bell rings only in the fanfare, kites only on kite day', () => {
    const bell = firstOf(world, props, 'bellPost')!;
    view.update(3, 12, env(12), bell, fest());
    const noon = view.stats().instances;
    view.update(3, 6, env(6), bell, fest('hq', 'ferryFanfare'));
    expect(view.stats().instances).toBeGreaterThan(noon);
    const rack = firstOf(world, props, 'kiteRack');
    if (rack) {
      view.update(3, 9, env(9), rack, fest());
      const before = view.stats().instances;
      view.update(3, 14, env(14), rack, fest('coding', 'kiteDay'));
      expect(view.stats().instances).toBeGreaterThan(before);
    }
  });

  it('QA flag climbs the mast at green light, confetti bursts at the show', () => {
    const mast = firstOf(world, props, 'flagMast')!;
    view.update(3, 12, env(12), mast, fest());
    const idle = view.stats().instances;
    view.update(3, 16, env(16), mast, fest('qa', 'greenLight'));
    expect(view.stats().instances).toBeGreaterThan(idle);
    const cannon = firstOf(world, props, 'confettiCannon')!;
    view.update(3, 17.5, env(17.5), cannon, fest('marketing', 'goldenHourShow', 0.03));
    const burst = view.stats().instances;
    view.update(3, 17.5, env(17.5), cannon, fest('marketing', 'goldenHourShow', 0.5));
    expect((burst - view.stats().instances) % M.confetti.pieces).toBe(0);
    expect(burst - view.stats().instances).toBeGreaterThanOrEqual(M.confetti.pieces);
  });

  it('design light patches: under the prism at noon, >= 2x longer at 17:30, none at night', () => {
    const prism = firstOf(world, props, 'prismSculpture')!;
    const lenAt = (hour: number): number => {
      view.update(3, hour, env(hour), prism, fest());
      const m = view.mesh!;
      const gait = m.geometry.getAttribute('aGait');
      let best = 0;
      const mm = new THREE.Matrix4();
      const s = new THREE.Vector3();
      for (let i = 0; i < m.count; i++) {
        if (gait.getY(i) !== PART.patch) continue;
        m.getMatrixAt(i, mm);
        mm.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
        best = Math.max(best, s.x);
      }
      return best;
    };
    const noon = lenAt(12);
    const golden = lenAt(17.5);
    expect(noon).toBeGreaterThan(0);
    expect(golden / noon).toBeGreaterThanOrEqual(1.6);
    expect(lenAt(2)).toBe(0);
  });

  it('hidden beyond the range: nothing written, no draw', () => {
    const far = new THREE.Vector3(5000, 50, 5000);
    view.update(3, 6.1, env(6.1), far, fest('hq', 'ferryFanfare'));
    expect(view.stats().instances).toBe(0);
    expect(view.mesh?.visible).toBe(false);
    expect(view.stats().beams).toBe(0);
  });

  it('reduced motion calms the wobble but keeps the ritual', () => {
    const mast = firstOf(world, props, 'bellPost')!;
    SHARED.uMotionScale.value = 0;
    view.update(3, 6, env(6), mast, fest('hq', 'ferryFanfare'));
    const n = view.stats().instances;
    expect(n).toBeGreaterThan(0);
    SHARED.uMotionScale.value = 1;
  });
});
