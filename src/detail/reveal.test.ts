import { describe, expect, it } from 'vitest';
import {
  GROUND_COVER_FADE,
  LOD_HANDOFF,
  PROP_DEFS,
  PROP_DEF_INDEX,
  TIER_FADE,
} from '../content/props.ts';
import {
  armTier,
  bandCasts,
  bandReaches,
  fadeAt,
  fadeBand,
  isInverted,
  lodArmed,
} from './reveal.ts';

const def = (id: string) => PROP_DEFS[PROP_DEF_INDEX[id]];
const tier0 = { ...def('cottage'), tier: 0 as const };

describe('continuous reveal (TASK-611)', () => {
  it('arms tier 2–3 defs one orbit tier ahead, LOD0 from T1, LOD1 of far-view defs always', () => {
    expect(armTier(def('bench'))).toBe(1);
    expect(armTier(def('grassTuft'))).toBe(2);
    expect(armTier(def('pine'))).toBe(1);
    expect(lodArmed(tier0, 1, false, 0)).toBe(true);
    expect(lodArmed(tier0, 0, false, 0)).toBe(false);
    for (const t of [1, 2, 3]) {
      expect(lodArmed(tier0, 0, false, t)).toBe(true);
      expect(lodArmed(tier0, 1, false, t)).toBe(true);
    }
    expect(lodArmed(def('pine'), 1, false, 0)).toBe(false); // T0: cluster blobs
    expect(lodArmed(def('bench'), 1, false, 3)).toBe(false); // tier 2: LOD0 only
    expect(lodArmed(def('bench'), 0, false, 1)).toBe(true);
    expect(lodArmed(def('grassTuft'), 0, true, 1)).toBe(false);
    expect(lodArmed(def('grassTuft'), 0, true, 2)).toBe(true);
    expect(lodArmed(def('treeBlob'), 0, false, 0)).toBe(true);
    expect(lodArmed(def('treeBlob'), 0, false, 1)).toBe(false);
  });

  it('bands: LOD0 over the hand-over band, LOD1 opaque until LOD0 is, then out', () => {
    expect(fadeBand(tier0, 0, false)).toEqual(LOD_HANDOFF.band);
    const l1 = fadeBand(tier0, 1, false);
    expect(isInverted(l1)).toBe(true);
    // LOD1 is fully there wherever LOD0 is not yet fully there (no holes in the cross-fade)
    for (let d = 0; d <= 400; d += 2.5)
      if (fadeAt(d, LOD_HANDOFF.band) < 1) expect(fadeAt(d, l1)).toBe(1);
    // and gone a little inside the band
    expect(fadeAt(LOD_HANDOFF.band[0] - LOD_HANDOFF.lod1Out, l1)).toBe(0);
    // tier-1 LOD1 leaves too (a slatted dock would show its solid LOD1); trees keep their far fade
    expect(fadeBand(def('dock'), 1, false)).toEqual(l1);
    expect(fadeBand(def('pine'), 1, false)).toEqual(def('pine').fade);
    // ground cover its own band; tier 2 the tier band
    expect(fadeBand(def('grassTuft'), 0, true)).toEqual(GROUND_COVER_FADE);
    expect(fadeBand(def('bench'), 0, false)).toEqual(TIER_FADE[2]);
    // the cluster proxy never fades
    expect(fadeBand(def('treeBlob'), 0, false)).toEqual(TIER_FADE[0]);
  });

  it('the reveal starts earlier than T2 (D-161 numbers)', () => {
    expect(TIER_FADE[2][0]).toBeGreaterThanOrEqual(180);
    expect(TIER_FADE[3][1]).toBeGreaterThan(TIER_FADE[3][0]);
    expect(fadeAt(230, TIER_FADE[2])).toBeCloseTo(0.5, 5);
  });

  it('skip tests work for both ramp directions', () => {
    const out = [200, 260] as const;
    const inv = [200, 175] as const;
    expect(bandReaches(250, 300, out)).toBe(true);
    expect(bandReaches(270, 300, out)).toBe(false);
    expect(bandReaches(100, 170, inv)).toBe(false);
    expect(bandReaches(100, 180, inv)).toBe(true);
    expect(bandCasts(235, 300, out)).toBe(false);
    expect(bandCasts(100, 190, inv)).toBe(true);
  });
});
