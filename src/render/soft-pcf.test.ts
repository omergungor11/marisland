import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { softenPcf } from './lighting.ts';
import { SOFT_SHADOW } from '../content/lighting.ts';

describe('softenPcf (TASK-606)', () => {
  it('swaps the directional 5-tap PCF sum for the SOFT_SHADOW.taps loop, once', () => {
    const before = THREE.ShaderChunk.shadowmap_pars_fragment;
    softenPcf();
    const after = THREE.ShaderChunk.shadowmap_pars_fragment;
    expect(after).not.toBe(before);
    expect(after).toContain(`vogelDiskSample( i, ${SOFT_SHADOW.taps}, phi )`);
    expect(after).not.toContain('vogelDiskSample( 0, 5, phi ) * radius');
    // the point-light branch keeps its own 5 samples
    expect(after).toContain('vec2 sample0 = vogelDiskSample( 0, 5, phi );');
    softenPcf();
    expect(THREE.ShaderChunk.shadowmap_pars_fragment).toBe(after);
  });
});
