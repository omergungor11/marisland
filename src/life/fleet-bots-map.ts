/**
 * Session -> bot slot mapping (TASK-564). Pure: no three.js, no clock. A session claims the slot
 * `hash(id) mod n` among its island's workers, probing linearly (+1, wrapping) while that slot is
 * taken. Sessions already holding a slot (`keep`) keep it, so a newcomer never moves a lit bot; the
 * others are placed in id order, so the same set of sessions always lights the same bots.
 */
import { hashString, unitHash } from '../core/hash.ts';

export interface BotSession {
  id: string;
  island: string;
}

/** `counts[island]` = workers of that island; returns session id -> slot (0..count-1). */
export function assignBots(
  sessions: readonly BotSession[],
  counts: Readonly<Record<string, number>>,
  keep: ReadonlyMap<string, number> = new Map(),
): Map<string, number> {
  const out = new Map<string, number>();
  const taken = new Map<string, Set<number>>();
  const slots = (island: string): Set<number> => {
    let s = taken.get(island);
    if (!s) taken.set(island, (s = new Set()));
    return s;
  };
  const room = (s: BotSession): number => Math.floor(counts[s.island] ?? 0);
  for (const s of sessions) {
    const slot = keep.get(s.id);
    if (slot === undefined || slot >= room(s) || slots(s.island).has(slot)) continue;
    slots(s.island).add(slot);
    out.set(s.id, slot);
  }
  const rest = sessions.filter((s) => !out.has(s.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const s of rest) {
    const n = room(s);
    const used = slots(s.island);
    if (n <= 0 || used.size >= n) continue;
    let slot = Math.floor(unitHash(0, hashString(s.id)) * n);
    while (used.has(slot)) slot = (slot + 1) % n;
    used.add(slot);
    out.set(s.id, slot);
  }
  return out;
}
