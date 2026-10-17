import * as palette from '../palette.ts';
import * as paletteOffices from '../palette-offices.ts';
import * as skyCraft from '../sky-craft.ts';
import { THEMES } from '../themes.ts';
import { cultureCapOverride, cultureDefsPerIsland } from '../budgets.ts';
import type { CultureDef } from './types.ts';

const HEX = /^#[0-9a-f]{6}$/i;

function collectHex(v: unknown, out: Set<string>): void {
  if (typeof v === 'string') {
    if (HEX.test(v)) out.add(v.toUpperCase());
  } else if (Array.isArray(v)) {
    for (const x of v) collectHex(x, out);
  } else if (v !== null && typeof v === 'object') {
    for (const x of Object.values(v)) collectHex(x, out);
  }
}

/** Every hex that exists in the palette tables (palette.ts, palette-offices.ts, sky-craft.ts, theme tables). */
export function paletteHexes(): ReadonlySet<string> {
  const out = new Set<string>();
  collectHex(palette, out);
  collectHex(paletteOffices, out);
  collectHex(skyCraft, out);
  collectHex(THEMES, out); // accents, team tints, ground bases
  return out;
}

/**
 * Checks the culture ledger rules (B4/B5): ≤ `cultureDefsPerIsland` new defs per island, ≥ 70 %
 * of them tier ≥ 2, ≤ 1 tier-1 (both caps per island from `cultureCapOverride`, D-057), no tier-0, unique ids, colours only from the palette tables.
 * Returns human-readable problems; empty = valid.
 */
export function validateCultures(
  cultures: readonly CultureDef[],
  allowed: ReadonlySet<string> = paletteHexes(),
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const c of cultures) {
    const at = `${c.theme}/${c.id}`;
    const n = c.kit.length;
    const cap = cultureCapOverride[c.theme] ?? { defs: cultureDefsPerIsland, tier1: 1 };
    if (n > cap.defs) errors.push(`${at}: ${n} defs > cap ${cap.defs}`);
    const t0 = c.kit.filter((k) => k.tier === 0).length;
    const t1 = c.kit.filter((k) => k.tier === 1).length;
    const hi = c.kit.filter((k) => k.tier >= 2).length;
    if (t0 > 0) errors.push(`${at}: ${t0} tier-0 def(s)`);
    if (t1 > cap.tier1) errors.push(`${at}: ${t1} tier-1 defs > ${cap.tier1}`);
    if (n > 0 && hi / n < 0.7) errors.push(`${at}: only ${hi}/${n} defs tier >= 2 (< 70 %)`);
    for (const k of c.kit) {
      if (seen.has(k.id)) errors.push(`${at}: duplicate def id ${k.id}`);
      seen.add(k.id);
    }
    const colours = [
      c.palette.accent,
      c.pennant.accent,
      ...c.palette.roofs,
      ...c.palette.walls,
      ...c.palette.trims,
    ];
    for (const hex of colours) {
      if (!allowed.has(hex.toUpperCase()))
        errors.push(`${at}: colour ${hex} not in a palette table`);
    }
  }
  return errors;
}
