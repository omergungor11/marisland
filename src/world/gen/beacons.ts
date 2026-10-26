import { BEACON_NET } from '../../content/signature.ts';
import type { IsletData, IslandData } from '../types.ts';

/**
 * Which skerries carry a mini lighthouse (M23 TASK-490, W:B1): at most `BEACON_NET.skerries`, spread
 * around the archipelago — the farthest skerry from the HQ first, then each next one the farthest from
 * those already picked (max-min distance). Pure and order-independent; ties break on the islet id.
 */
export function pickBeaconSkerries(
  islands: readonly Pick<IslandData, 'theme' | 'cx' | 'cz'>[],
  islets: readonly Pick<IsletData, 'id' | 'kind' | 'cx' | 'cz'>[],
): Set<number> {
  const skerries = islets.filter((s) => s.kind === 'skerry');
  const hq = islands.find((i) => i.theme === 'hq') ?? { cx: 0, cz: 0 };
  const picked: typeof skerries = [];
  const d2 = (a: { cx: number; cz: number }, b: { cx: number; cz: number }): number =>
    (a.cx - b.cx) ** 2 + (a.cz - b.cz) ** 2;
  while (picked.length < Math.min(BEACON_NET.skerries, skerries.length)) {
    let best: (typeof skerries)[number] | null = null;
    let bestD = -1;
    for (const s of skerries) {
      if (picked.includes(s)) continue;
      const d = picked.length === 0 ? d2(s, hq) : Math.min(...picked.map((p) => d2(s, p)));
      if (d > bestD + 1e-9 || (Math.abs(d - bestD) <= 1e-9 && best !== null && s.id < best.id)) {
        best = s;
        bestD = d;
      }
    }
    if (!best) break;
    picked.push(best);
  }
  return new Set(picked.map((s) => s.id));
}
