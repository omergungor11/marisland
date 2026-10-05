import { describe, expect, it } from 'vitest';
import { PROP_DEFS, PROP_DEF_INDEX } from '../content/props.ts';
import { LANDMARK_RENDER } from '../content/landmark-render.ts';
import { THEMES } from '../content/themes/index.ts';
import { HQ_PLAN } from '../content/themes/hq.ts';
import { generateWorld, heightAt, zoneAt, Zone, type WorldData } from './index.ts';
import { StageHash } from './gen/hash.ts';

/**
 * HQ island plan (M14b §2.1, TASK-362): theme-first campus on Hearthholm, 30-seed acceptance
 * (plan §5 common acceptance) and a per-theme snapshot of the HQ island's settlement data.
 */

const SEEDS = Array.from({ length: 30 }, (_, k) => 1000 + k * 263);
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) cache.set(seed, (w = generateWorld(seed)));
  return w;
};
const hqOf = (w: WorldData) => {
  const isl = w.islands.find((i) => i.theme === 'hq');
  if (!isl) throw new Error('no HQ island');
  const s = w.settlements.find((x) => x.islandId === isl.id);
  return { isl, s };
};

/** Cozy-village leftovers that must never appear on the HQ island (lots, fixtures). */
const REMOVED = ['cottage', 'towerHouse', 'laundryLine', 'marketStall', 'stiltHut', 'well'];

function reachable(w: WorldData, start: number): Uint8Array {
  const n = w.pathGraph.nodes.length / 2;
  const adj: number[][] = Array.from({ length: n }, () => []);
  const e = w.pathGraph.edges;
  for (let i = 0; i < e.length; i += 2) {
    adj[e[i]].push(e[i + 1]);
    adj[e[i + 1]].push(e[i]);
  }
  const seen = new Uint8Array(n);
  if (start < 0) return seen;
  const q = [start];
  seen[start] = 1;
  while (q.length > 0) {
    const c = q.pop() as number;
    for (const m of adj[c])
      if (!seen[m]) {
        seen[m] = 1;
        q.push(m);
      }
  }
  return seen;
}

/**
 * HQ-local settlement data (positions, defs, landmarks, docks, moorings, fixtures, districts).
 * Lot variants are left out: they are coloured over every island's lots at once.
 */
function hqHash(w: WorldData): string {
  const { isl, s } = hqOf(w);
  const h = new StageHash().u32(s ? s.lots.length : -1);
  for (const li of s?.lots ?? []) {
    const l = w.lots[li];
    h.str(l.defId).float(l.x).float(l.z).float(l.rotY).str(l.role);
  }
  for (const l of w.landmarks.filter((x) => x.islandId === isl.id))
    h.str(l.kind).float(l.x).float(l.z).float(l.rotY);
  for (const d of w.docks.filter((x) => x.islandId === isl.id))
    h.float(d.x).float(d.z).float(d.rotY).u32(d.segments);
  for (const m of w.moorings.filter((x) => x.islandId === isl.id))
    h.str(m.defId).float(m.x).float(m.z);
  for (const f of w.fixtures.filter((x) => x.islandId === isl.id))
    h.str(f.defId).float(f.x).float(f.z).float(f.rotY);
  for (const d of w.districts.filter((x) => x.islandId === isl.id))
    h.str(d.kind).float(d.x).float(d.z).float(d.w).float(d.d);
  return h.hex();
}

describe('HQ island plan (TASK-362)', () => {
  it('content: civic ground table, Orchestrator Tower variant, no farm scatter', () => {
    const t = THEMES.hq;
    for (const z of [Zone.grass, Zone.meadow, Zone.forest, Zone.path, Zone.plaza, Zone.field])
      expect(t.ground[z], `zone ${z}`).toBeDefined();
    expect(t.ground[Zone.grass]?.base).toBe('#8FCB62');
    expect(t.ground[Zone.plaza]?.material).toBe('paving');
    expect(t.landmarkVariant.clocktower).toBe(2);
    expect(t.scatterOff).toContain('cropRow');
    for (const [d] of t.lotMix) expect(REMOVED).not.toContain(d);
    // the tower and every HQ structure are tier-0 defs (exist from the far view)
    const tower = PROP_DEFS[PROP_DEF_INDEX[LANDMARK_RENDER.clocktower.def]];
    expect(tower.tier).toBe(0);
    expect(PROP_DEFS[PROP_DEF_INDEX.ferryOffice].tier).toBe(0);
  });

  it(
    '30 seeds: tower, quad, kiosks, garden, ferry office, lots ≥ 8, all connected, no leftovers',
    { timeout: 120_000 },
    () => {
      let lotsOk = 0;
      let gardens = 0;
      const fails: string[] = [];
      for (const seed of SEEDS) {
        const w = world(seed);
        const { isl, s } = hqOf(w);
        const ctx = `seed ${seed}`;
        expect(s, ctx).toBeDefined();
        if (!s) continue;
        // (c) leftover audit: no removed def anywhere on the island
        const onIsl = <T extends { islandId: number }>(a: readonly T[]): T[] =>
          a.filter((x) => x.islandId === isl.id);
        for (const l of onIsl(w.lots)) expect(REMOVED, `${ctx} lot`).not.toContain(l.defId);
        for (const f of onIsl(w.fixtures)) expect(REMOVED, `${ctx} fixture`).not.toContain(f.defId);
        expect(onIsl(w.lots).filter((l) => l.kind === 'hut').length, ctx).toBe(0);
        // (a) the Orchestrator Tower, on or at the quad
        const towers = s.landmarks
          .map((i) => w.landmarks[i])
          .filter((l) => l.kind === 'clocktower');
        expect(towers.length, `${ctx} tower`).toBe(1);
        expect(s.plaza, `${ctx} quad`).not.toBeNull();
        if (s.plaza) {
          expect(zoneAt(w.height, w.zone, s.plaza.x, s.plaza.z), ctx).toBe(Zone.plaza);
          const d = Math.hypot(towers[0].x - s.plaza.x, towers[0].z - s.plaza.z);
          expect(d, `${ctx} tower off the quad`).toBeLessThanOrEqual(s.plaza.r + 0.6);
        }
        const count = (def: string): number => s.lots.filter((i) => w.lots[i].defId === def).length;
        expect(count('coffeeKiosk'), `${ctx} kiosks`).toBe(HQ_PLAN.kiosks.count);
        expect(count('hqAnnex'), `${ctx} crown`).toBe(1);
        expect(count('hqOffice'), `${ctx} offices`).toBeGreaterThanOrEqual(3);
        // ferry terminal: one pier with boats, the ferry office in the shallows beside it
        expect(s.docks.length, ctx).toBe(1);
        expect(w.moorings.filter((m) => m.dock === s.docks[0]).length, ctx).toBeGreaterThan(0);
        const ferry = onIsl(w.fixtures).filter((f) => f.defId === 'ferryOffice');
        expect(ferry.length, `${ctx} ferry office`).toBe(1);
        const fy = heightAt(w.height, ferry[0].x, ferry[0].z);
        expect(fy, ctx).toBeGreaterThanOrEqual(HQ_PLAN.ferry.depth[0] - 0.3);
        expect(fy, ctx).toBeLessThanOrEqual(HQ_PLAN.ferry.depth[1] + 0.3);
        const dk = w.docks[s.docks[0]];
        expect(Math.hypot(ferry[0].x - dk.x, ferry[0].z - dk.z), ctx).toBeLessThan(8);
        // meeting garden
        if (w.districts.some((d) => d.islandId === isl.id && d.kind === 'garden')) gardens++;
        // (b) lot minimum
        if (s.lots.length >= 8) lotsOk++;
        else fails.push(`${ctx}: ${s.lots.length} lots`);
        // (d) everything connected to the hub
        const seen = reachable(w, s.hub.node);
        for (const li of s.lots) {
          const l = w.lots[li];
          expect(l.node, `${ctx} ${l.defId}`).toBeGreaterThanOrEqual(0);
          expect(seen[l.node], `${ctx} ${l.defId} unreachable`).toBe(1);
        }
        for (const di of s.docks) expect(seen[w.docks[di].node], `${ctx} dock`).toBe(1);
        // every HQ lot is in the settlement (none dropped as unconnected)
        expect(onIsl(w.lots).length, ctx).toBe(s.lots.length);
      }
      expect(fails, fails.join('\n')).toHaveLength(SEEDS.length - lotsOk);
      expect(lotsOk).toBeGreaterThanOrEqual(Math.ceil(SEEDS.length * 0.9));
      expect(gardens).toBeGreaterThanOrEqual(Math.ceil(SEEDS.length * 0.9));
    },
  );

  it('per-theme snapshot: HQ settlement data is pinned and deterministic', () => {
    const got = [1, 42, 1001].map((seed) => hqHash(world(seed)));
    expect(got).toEqual(['8d26fb3d236dd405', '69dc4b240fcf8c8c', '636412759612d22e']);
    expect(hqHash(generateWorld(1001))).toBe(got[2]);
  });
});
