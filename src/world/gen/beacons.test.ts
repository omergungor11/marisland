import { describe, expect, it } from 'vitest';
import { BEACON_NET } from '../../content/signature.ts';
import { PROP_DEFS } from '../../content/props.ts';
import { generateWorld } from '../index.ts';
import { pickBeaconSkerries } from './beacons.ts';

describe('pickBeaconSkerries (W:B1)', () => {
  const hq = { theme: 'hq' as const, cx: 0, cz: 0 };
  const sk = (id: number, cx: number, cz: number) => ({ id, kind: 'skerry' as const, cx, cz });

  it('takes at most BEACON_NET.skerries, only skerries, spread out', () => {
    const islets = [
      sk(8, 100, 0),
      sk(9, 110, 5),
      sk(10, -100, 0),
      sk(11, 0, 120),
      { id: 12, kind: 'sandbar' as const, cx: 300, cz: 300 },
    ];
    const got = pickBeaconSkerries([hq], islets);
    expect(got.size).toBe(BEACON_NET.skerries);
    expect(got.has(12)).toBe(false);
    // the close pair (8, 9) never both carry one while a far skerry is free
    expect(got.has(8) && got.has(9)).toBe(false);
  });

  it('is independent of the islet order and handles few skerries', () => {
    const a = [sk(8, 90, 0), sk(9, -90, 10), sk(10, 5, 120)];
    expect([...pickBeaconSkerries([hq], a)].sort()).toEqual(
      [...pickBeaconSkerries([hq], [...a].reverse())].sort(),
    );
    expect(pickBeaconSkerries([hq], [sk(8, 5, 5)]).size).toBe(1);
    expect(pickBeaconSkerries([hq], []).size).toBe(0);
  });
});

describe('beacon towers in the world', () => {
  for (const seed of [1001, 1]) {
    it(
      `seed ${seed}: one mini lighthouse on each picked skerry's peak`,
      { timeout: 60_000 },
      () => {
        const w = generateWorld(seed, {});
        const picked = pickBeaconSkerries(w.islands, w.islets);
        const def = PROP_DEFS.findIndex((d) => d.id === 'beaconTower');
        expect(def).toBeGreaterThan(0);
        const placed: number[] = [];
        for (let i = 0; i < w.props.count; i++) {
          if (w.props.defId[i] !== def) continue;
          const islet = w.islets.find((s) => s.id === w.props.islandId[i]);
          expect(islet?.kind).toBe('skerry');
          expect(Math.hypot(w.props.x[i] - islet!.peakX, w.props.z[i] - islet!.peakZ)).toBeLessThan(
            1,
          );
          placed.push(w.props.islandId[i]);
        }
        expect(placed.sort()).toEqual([...picked].sort());
        expect(placed.length).toBeGreaterThanOrEqual(Math.min(2, BEACON_NET.skerries));
      },
    );
  }
});
