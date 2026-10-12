import { describe, expect, it } from 'vitest';
import { CULTURES } from './index.ts';
import { paletteHexes, validateCultures } from './validate.ts';
import { THEME_IDS } from '../../world/types.ts';
import { cultureDefsPerIsland } from '../budgets.ts';
import type { CultureDef, KitEntry } from './types.ts';

const all = (): CultureDef[] => THEME_IDS.map((t) => CULTURES[t]);
const entry = (id: string, tier: KitEntry['tier']): KitEntry => ({ id, tier, flags: 0 });
const withKit = (kit: KitEntry[]): CultureDef => ({ ...CULTURES.hq, kit });

describe('culture contract (TASK-408)', () => {
  it('one culture per theme, with unique ids and relay steps 1..7', () => {
    expect(THEME_IDS.every((t) => CULTURES[t].theme === t)).toBe(true);
    expect(new Set(all().map((c) => c.id)).size).toBe(7);
    expect(
      all()
        .map((c) => c.relay.order)
        .sort(),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(cultureDefsPerIsland).toBe(10);
  });

  it('ledgers obey the cap and tier mix; colours come only from the palette tables', () => {
    expect(validateCultures(all())).toEqual([]);
    for (const c of all()) expect(c.kit.length).toBeLessThanOrEqual(cultureDefsPerIsland);
    expect(paletteHexes().has('#E8735A')).toBe(true);
  });

  it('a valid full ledger passes', () => {
    const kit = [
      ...Array.from({ length: 8 }, (_, i) => entry(`a${i}`, i % 2 ? 2 : 3)),
      entry('b0', 1),
      entry('b1', 2),
    ];
    expect(validateCultures([withKit(kit)])).toEqual([]);
  });

  it('negative: over the cap, tier-0, too many tier-1, low tier-2+ share, bad colour all fail', () => {
    const over = Array.from({ length: cultureDefsPerIsland + 1 }, (_, i) => entry(`o${i}`, 3));
    expect(validateCultures([withKit(over)]).join()).toMatch(/cap/);
    expect(validateCultures([withKit([entry('z', 0), entry('y', 3)])]).join()).toMatch(/tier-0/);
    expect(
      validateCultures([withKit([entry('p', 1), entry('q', 1), entry('r', 3)])]).join(),
    ).toMatch(/tier-1/);
    const lowShare = [entry('s0', 1), entry('s1', 2), entry('s2', 2), entry('s3', 0 as 1)];
    expect(validateCultures([withKit(lowShare)]).join()).toMatch(/70 %/);
    const bad: CultureDef = {
      ...CULTURES.hq,
      palette: { ...CULTURES.hq.palette, trims: ['#123456'] },
    };
    expect(validateCultures([bad]).join()).toMatch(/#123456/);
  });
});
