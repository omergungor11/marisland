import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPropBatcher } from './batcher.ts';
import { createPropStore, PropFlag } from '../../world/prop-store.ts';
import { PROP_DEF_INDEX, type PropDef } from '../../content/props.ts';
import { Scope } from '../../core/scope.ts';
import { withFakeDefs } from './fake-defs.test-util.ts';

/** TASK-408: `PropFlag.noShadow` defs get no shadow-pass draw even when shadows are on. */
const FAKES: PropDef[] = [
  { id: 'fakeLit', geo: 'barrel', tier: 3, variants: 1, footprint: 0.3, flags: PropFlag.grounded },
  {
    id: 'fakeNoShadow',
    geo: 'barrel',
    tier: 3,
    variants: 1,
    footprint: 0.3,
    flags: PropFlag.grounded | PropFlag.noShadow,
  },
];

describe('PropFlag.noShadow', () => {
  const restore = { fn: (): void => {} };
  beforeAll(() => {
    restore.fn = withFakeDefs(FAKES);
  });
  afterAll(() => restore.fn());

  it('castShadow is off for the flagged def, on for its sibling', () => {
    const store = createPropStore(8);
    for (const id of ['fakeLit', 'fakeNoShadow'])
      store.push(PROP_DEF_INDEX[id], 0, 0, 1, 0, 0, 1, 0, 0, PropFlag.grounded);
    const b = createPropBatcher(store, {
      scope: new Scope('t'),
      seed: 1,
      counters: {
        hardPops: 0,
        instances: 0,
        groundCover: 0,
        agents: 0,
        particles: 0,
        gpuMemoryMB: 0,
        rebuilds: 0,
      },
      materialFor: () => new THREE.MeshLambertMaterial(),
      softAppear: true,
      castShadows: true,
    });
    const shadow = (id: string): boolean[] =>
      b.groups.filter((g) => g.def.id === id).map((g) => g.mesh.castShadow);
    expect(shadow('fakeLit').length).toBeGreaterThan(0);
    expect(shadow('fakeLit').every(Boolean)).toBe(true);
    expect(shadow('fakeNoShadow').length).toBeGreaterThan(0);
    expect(shadow('fakeNoShadow').some(Boolean)).toBe(false);
  });
});
