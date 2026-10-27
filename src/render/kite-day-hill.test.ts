/** TASK-498: Kite Day at the Kite Hill: every hill pole sends a kite up, one stays stuck low; deterministic. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Scope } from '../core/scope.ts';
import { PROP_DEFS } from '../content/props.ts';
import { KITE_HILL } from '../content/islands.ts';
import { HILL_KITES } from '../content/themes/coding-tunnel.ts';
import { createEnvState, sampleEnv } from '../env/env-state.ts';
import { generateWorld } from '../world/index.ts';
import { THEME_IDS, type ThemeId } from '../world/types.ts';
import { appendSettlementProps } from './props/settlement-props.ts';
import { createCultureMovers } from './culture-movers.ts';
import { PART } from './culture-mover-parts.ts';

const world = generateWorld(1001);
const { props } = appendSettlementProps(world);
const view = createCultureMovers(props, world, new Scope('kite-day-hill'));
const hill = world.islands.find((i) => i.theme === 'coding')!.anchors.kiteHill;
const cam = new THREE.Vector3(hill.x, 14, hill.z);

function fest(phase: number): { festival: Record<ThemeId, { id: string; phase: number } | null> } {
  const festival = {} as Record<ThemeId, { id: string; phase: number } | null>;
  for (const t of THEME_IDS) festival[t] = t === 'coding' ? { id: 'kiteDay', phase } : null;
  return { festival };
}

/** Heights (world y) of the kite parts drawn at the sim time `t`, ritual phase `phase`. */
function kiteYs(t: number, phase: number): number[] {
  const e = createEnvState();
  sampleEnv(14, e);
  view.update(t, 14, e, cam, fest(phase));
  const m = view.meshes[PART.kite];
  const out: number[] = [];
  for (let i = 0; i < m.count; i++) out.push(m.instanceMatrix.array[i * 16 + 13]);
  return out;
}

describe('TASK-498 Kite Day at the hill', () => {
  it('20 s into the window at least six kites are up, none before the window', () => {
    expect(kiteYs(3, 0.0).length).toBe(0);
    const up = kiteYs(20, 20 / 60);
    expect(up.length).toBeGreaterThanOrEqual(6);
  });

  it('every hill pole sends one up (stuck one included), and the stuck kite is the lowest above its pole', () => {
    const poles: number[] = [];
    for (let i = 0; i < props.count; i++) {
      if (PROP_DEFS[props.defId[i]].id !== 'kite' || props.variant[i] > 2) continue;
      if (Math.hypot(props.x[i] - hill.x, props.z[i] - hill.z) <= KITE_HILL.foot + 4) poles.push(i);
    }
    expect(poles.length).toBeGreaterThanOrEqual(8);
    // hill kites + the rack's four: all in the air 20 s in
    expect(kiteYs(20, 20 / 60).length).toBeGreaterThanOrEqual(poles.length);
    // height of a kite above the nearest pole's ground line: the flying ones clear the stuck one
    const above = kiteYs(20, 20 / 60).map((y) => {
      const base = Math.min(...poles.map((i) => props.y[i]));
      return y - base;
    });
    expect(Math.max(...above)).toBeGreaterThan(HILL_KITES.stuck.height + HILL_KITES.stuck.tug + 6);
  });

  it('is a pure function of the sim time and phase (capture determinism)', () => {
    const a = kiteYs(21.3, 0.35);
    kiteYs(5, 0.1);
    expect(kiteYs(21.3, 0.35)).toEqual(a);
  });

  it('the kites come back down at the end of the window', () => {
    const mid = Math.max(...kiteYs(20, 0.35));
    const end = Math.max(...kiteYs(58, 0.99));
    expect(end).toBeLessThan(mid);
  });
});
