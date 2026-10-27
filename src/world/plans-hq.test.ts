import { describe, expect, it } from 'vitest';
import { PROP_DEFS, PROP_DEF_INDEX } from '../content/props.ts';
import { LANDMARK_RENDER } from '../content/landmark-render.ts';
import { THEMES } from '../content/themes/index.ts';
import { HQ_PLAN } from '../content/themes/hq.ts';
import { CULTURE_GATE, mailAnchorWorld, mailCablePoint } from '../content/props-themes/m20.ts';
import { generateWorld, heightAt, zoneAt, Zone, type WorldData } from './index.ts';
import { StageHash } from './gen/hash.ts';
import { HQ_CULTURE, HQ_CULTURE_SITE, HQ_FERRY } from '../content/cultures/hq.ts';
import { isStreetZone, streetZone, THEME_IDS, type ZoneId } from './types.ts';

const DEG = Math.PI / 180;
/** Shared signage kit pieces the HQ plan places (TASK-420). */
const SIGNAGE = ['pierSignpost', 'pennantLine', 'cargoCrate'];
const cellIndex = (w: WorldData, x: number, z: number): number =>
  Math.round((z - w.height.originZ) / w.height.cellSize) * w.height.n +
  Math.round((x - w.height.originX) / w.height.cellSize);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);
/** Signed angle difference in degrees (−180, 180]. */
const dAng = (a: number, b: number): number => {
  let d = (a - b) / DEG;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
};

/**
 * HQ Seven Gates Crossroads plan (M20 TASK-466, D-057 / D-058 / D-060): 30-seed acceptance and a
 * per-theme snapshot of the HQ island's settlement data.
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
  if (!s || !s.plaza) throw new Error('no HQ settlement / plaza');
  return { isl, s, plaza: s.plaza };
};

/** Cozy-village leftovers that must never appear on the HQ island (lots, fixtures). */
const REMOVED = ['marketStall', 'stiltHut', 'well'];

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

/** Distance (u) from `p` to the nearest footpath segment of the island. */
function pathDist(w: WorldData, islandId: number, p: { x: number; z: number }): number {
  let best = Infinity;
  for (const pl of w.paths) {
    if (pl.islandId !== islandId || pl.kind === 'boardwalk') continue;
    const pts = pl.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const l2 = vx * vx + vz * vz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2)) : 0;
      best = Math.min(best, Math.hypot(p.x - a.x - vx * t, p.z - a.z - vz * t));
    }
  }
  return best;
}

/**
 * HQ-local settlement data (positions, defs, landmarks, docks, moorings, fixtures, districts).
 * Lot variants are left out: they are coloured over every island's lots at once.
 */
function hqHash(w: WorldData): string {
  const { isl, s } = hqOf(w);
  const h = new StageHash().u32(s.lots.length);
  for (const li of s.lots) {
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
    h.str(f.defId)
      .float(f.x)
      .float(f.z)
      .float(f.rotY)
      .u32(f.variant ?? 255);
  for (const d of w.districts.filter((x) => x.islandId === isl.id))
    h.str(d.kind).float(d.x).float(d.z).float(d.w).float(d.d);
  return h.hex();
}

describe('HQ Seven Gates plan (TASK-466)', () => {
  it('content: street tints, lot mix with cottages / barn / tower house, civic ground', () => {
    const t = THEMES.hq;
    for (const z of [Zone.grass, Zone.meadow, Zone.forest, Zone.path, Zone.plaza, Zone.field])
      expect(t.ground[z], `zone ${z}`).toBeDefined();
    // one tinted paving per culture, all different
    const tints = THEME_IDS.map((_, k) => t.ground[streetZone(k) as ZoneId]?.base);
    for (const b of tints) expect(b).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(tints).size).toBe(THEME_IDS.length);
    for (const k of THEME_IDS.keys())
      expect(t.ground[streetZone(k) as ZoneId]?.material).toBe('paving');
    expect(t.landmarkVariant.clocktower).toBe(2);
    expect(t.scatterOff).toContain('cropRow');
    const mix = t.lotMix.map(([d]) => d);
    for (const d of ['hqOffice', 'cottage', 'barn', 'towerHouse']) expect(mix).toContain(d);
    expect(t.defSwap.cottage).toBeUndefined();
    expect(t.defSwap.towerHouse).toBeUndefined();
    // the tower and every HQ structure are tier-0 defs (exist from the far view)
    const tower = PROP_DEFS[PROP_DEF_INDEX[LANDMARK_RENDER.clocktower.def]];
    expect(tower.tier).toBe(0);
    expect(PROP_DEFS[PROP_DEF_INDEX.ferryOffice].tier).toBe(0);
    expect(PROP_DEFS[PROP_DEF_INDEX.hqOffice].variants).toBe(4);
  });

  it(
    '30 seeds: compass plaza, tower, kiosks, seven gates aimed at their islands, shore gates, lots connected',
    { timeout: 180_000 },
    () => {
      const R = HQ_PLAN.plaza.radius;
      let seven = 0;
      let moored = 0;
      let shoreGates = 0;
      let lotsOk = 0;
      for (const seed of SEEDS) {
        const w = world(seed);
        const { isl, s, plaza } = hqOf(w);
        const ctx = `seed ${seed}`;
        const onIsl = <T extends { islandId: number }>(a: readonly T[]): T[] =>
          a.filter((x) => x.islandId === isl.id);
        for (const l of onIsl(w.lots)) expect(REMOVED, `${ctx} lot`).not.toContain(l.defId);
        for (const f of onIsl(w.fixtures)) expect(REMOVED, `${ctx} fixture`).not.toContain(f.defId);
        // (Z1) the round compass plaza: R 10, paved, a 'compass' district on it, the tower at its rim
        expect(plaza.r, ctx).toBe(R);
        expect(zoneAt(w.height, w.zone, plaza.x, plaza.z), ctx).toBe(Zone.plaza);
        const compass = onIsl(w.districts).filter((d) => d.kind === 'compass');
        expect(compass.length, `${ctx} compass district`).toBe(1);
        expect(dist(compass[0], plaza), ctx).toBeLessThan(0.01);
        const towers = s.landmarks
          .map((i) => w.landmarks[i])
          .filter((l) => l.kind === 'clocktower');
        expect(towers.length, `${ctx} tower`).toBe(1);
        expect(dist(towers[0], plaza), `${ctx} tower off the plaza`).toBeLessThanOrEqual(R + 0.6);
        const count = (def: string): number => s.lots.filter((i) => w.lots[i].defId === def).length;
        // kiosks keep off the street rays: a seed with rays on every rim angle holds one
        expect(count('coffeeKiosk'), `${ctx} kiosks`).toBeGreaterThanOrEqual(1);
        expect(count('coffeeKiosk'), `${ctx} kiosks`).toBeLessThanOrEqual(HQ_PLAN.kiosks.count);
        // (Z2) gates: one per culture, each aimed at its island, on a path, level, not on the water
        const gates = onIsl(w.fixtures).filter((f) => f.defId === 'cultureGate');
        expect(gates.length, `${ctx} gates`).toBeGreaterThanOrEqual(5);
        if (gates.length === THEME_IDS.length) seven++;
        expect(new Set(gates.map((g) => g.variant)).size, `${ctx} gate cultures`).toBe(
          gates.length,
        );
        for (const g of gates) {
          const k = g.variant ?? -1;
          const theme = THEME_IDS[k];
          const d = dist(g, plaza);
          // sea gates stand on the plaza paving just inside the rim (HQ_PLAN.streets.minRun)
          expect(d, `${ctx} ${theme} gate distance`).toBeGreaterThanOrEqual(
            R + HQ_PLAN.streets.minRun - 0.5,
          );
          expect(d, `${ctx} ${theme} gate distance`).toBeLessThanOrEqual(
            R + HQ_PLAN.streets.maxRun + 2,
          );
          if (theme !== 'hq') {
            const o = w.islands.find((i) => i.theme === theme);
            expect(o, `${ctx} ${theme} island`).toBeDefined();
            if (!o) continue;
            const ideal = Math.atan2(o.cz - plaza.z, o.cx - plaza.x);
            const real = Math.atan2(g.z - plaza.z, g.x - plaza.x);
            // short streets bend round the plaza kiosks: a rim gate may sit a few degrees off
            expect(Math.abs(dAng(real, ideal)), `${ctx} ${theme} gate heading`).toBeLessThanOrEqual(
              d > R + 6 ? 18 : 30,
            );
          }
          // on its street (a rim gate stands on the plaza paving where the rays meet)
          if (d > R + 1)
            expect(
              pathDist(w, isl.id, g),
              `${ctx} ${theme} gate on the street`,
            ).toBeLessThanOrEqual(2.2);
          // level: both post feet within 0.6 u of each other, on this island's land
          const ax = { x: Math.sin(g.rotY), z: -Math.cos(g.rotY) };
          const ys = [1, -1].map((sg) =>
            heightAt(
              w.height,
              g.x + ax.x * sg * CULTURE_GATE.postX,
              g.z + ax.z * sg * CULTURE_GATE.postX,
            ),
          );
          expect(Math.abs(ys[0] - ys[1]), `${ctx} ${theme} gate level`).toBeLessThan(0.75);
          expect(Math.min(...ys), `${ctx} ${theme} gate feet`).toBeGreaterThan(0.2);
          expect(w.islandMap[cellIndex(w, g.x, g.z)], ctx).toBe(isl.id + 1);
          // D-058 shore gate: near the water → a mooring post past it
          const sdf = w.shoreSdf[cellIndex(w, g.x, g.z)];
          if (sdf <= 5 && theme !== 'hq') {
            shoreGates++;
            const post = onIsl(w.fixtures).some(
              (f) => f.defId === HQ_PLAN.shoreGate.def && dist(f, g) <= 9,
            );
            if (post) moored++;
          }
        }
        // the gates' streets: ≥ 4 culture street zones painted, all of it beside a footpath
        const zones = new Set<number>();
        for (let i = 0; i < w.zone.length; i++)
          if (w.islandMap[i] === isl.id + 1 && isStreetZone(w.zone[i])) zones.add(w.zone[i]);
        // (a heading that shares the harbour lane or leaves the rim straight into water has none)
        expect(zones.size, `${ctx} street zones`).toBeGreaterThanOrEqual(3);
        // lots: a mix, all connected to the hub, none dropped
        if (s.lots.length >= 8) lotsOk++;
        expect(s.lots.length, ctx).toBeGreaterThanOrEqual(5);
        const seen = reachable(w, s.hub.node);
        for (const li of s.lots) {
          const l = w.lots[li];
          expect(l.node, `${ctx} ${l.defId}`).toBeGreaterThanOrEqual(0);
          expect(seen[l.node], `${ctx} ${l.defId} unreachable`).toBe(1);
        }
        expect(s.docks.length, ctx).toBe(1);
        for (const di of s.docks) expect(seen[w.docks[di].node], `${ctx} dock`).toBe(1);
        expect(onIsl(w.lots).length, ctx).toBe(s.lots.length);
        // ferry terminal: boats, the office in the shallows beside the pier, the stone quay
        expect(w.moorings.filter((m) => m.dock === s.docks[0]).length, ctx).toBeGreaterThan(0);
        const ferry = onIsl(w.fixtures).filter((f) => f.defId === 'ferryOffice');
        expect(ferry.length, `${ctx} ferry office`).toBe(1);
        const dk = w.docks[s.docks[0]];
        expect(dist(ferry[0], dk), ctx).toBeLessThan(8);
        let quay = 0;
        for (let i = 0; i < w.zone.length; i++) {
          if (w.islandMap[i] !== isl.id + 1 || w.zone[i] !== Zone.plaza) continue;
          const x = w.height.originX + (i % w.height.n) * w.height.cellSize;
          const z = w.height.originZ + Math.floor(i / w.height.n) * w.height.cellSize;
          if (Math.hypot(x - dk.x, z - dk.z) <= 6) quay++;
        }
        expect(quay, `${ctx} quay paving by the pier root`).toBeGreaterThanOrEqual(4);
      }
      // a culture whose heading shares the harbour lane's rim yields to the HQ gate
      expect(seven, 'seeds with all seven gates').toBeGreaterThanOrEqual(
        Math.ceil(SEEDS.length * 0.55),
      );
      expect(shoreGates, 'shore gates over 30 seeds').toBeGreaterThan(10);
      expect(moored / shoreGates, 'shore gates with a mooring post').toBeGreaterThanOrEqual(0.7);
      expect(lotsOk, 'seeds with ≥ 8 lots').toBeGreaterThanOrEqual(Math.ceil(SEEDS.length * 0.6));
    },
  );

  it(
    '30 seeds: stalls and pennants match their street, terrace, summit semaphore, post yard + mail line',
    { timeout: 180_000 },
    () => {
      const R = HQ_PLAN.plaza.radius;
      let terraces = 0;
      let mailLines = 0;
      let stairs = 0;
      let lookouts = 0;
      let stallRows = 0;
      let cranes = 0;
      let sevenCrates = 0;
      let semaphores = 0;
      for (const seed of SEEDS) {
        const w = world(seed);
        const { isl, s, plaza } = hqOf(w);
        const ctx = `seed ${seed}`;
        const fx = w.fixtures.filter((f) => f.islandId === isl.id);
        const n = (def: string): number => fx.filter((f) => f.defId === def).length;
        /**
         * The street a kit piece stands on: the culture street zone painted under the nearest
         * footpath sample (null inside the plaza, where the rays meet).
         */
        const streetOf = (p: { x: number; z: number }): number | null => {
          let best: { x: number; z: number } | null = null;
          let bd = 4.5;
          for (const pl of w.paths) {
            if (pl.islandId !== isl.id || pl.kind === 'boardwalk') continue;
            for (const q of pl.points) {
              const d = dist(p, q);
              if (d < bd) {
                bd = d;
                best = q;
              }
            }
          }
          if (!best || dist(best, plaza) <= R + 2.5) return null;
          const z = w.zone[cellIndex(w, best.x, best.z)];
          return isStreetZone(z) ? z - streetZone(0) : null;
        };
        // (H4) goods stalls sell their street's culture (the post yard's parcels stall is HQ's)
        const stalls = fx.filter((f) => f.defId === 'goodsStall');
        expect(stalls.length, `${ctx} stalls`).toBeGreaterThanOrEqual(1);
        if (stalls.length >= 3) stallRows++;
        const yard = w.districts.find((d) => d.islandId === isl.id && d.kind === 'yard');
        for (const st of stalls) {
          if (yard && dist(st, yard) <= HQ_PLAN.yard.radius + 1) {
            expect(st.variant, `${ctx} yard stall`).toBe(THEME_IDS.indexOf('hq'));
            continue;
          }
          const k = streetOf(st);
          if (k !== null)
            expect(st.variant, `${ctx} stall at ${st.x.toFixed(0)},${st.z.toFixed(0)}`).toBe(k);
        }
        // pennant lines fly their street's cut, just past the plaza rim
        const lines = fx.filter((f) => f.defId === 'pennantLine');
        expect(lines.length, ctx).toBeGreaterThanOrEqual(1);
        for (const ln of lines) {
          expect(dist(ln, plaza), ctx).toBeLessThan(R + 8);
          const k = streetOf(ln);
          if (k !== null) expect(ln.variant, `${ctx} pennant`).toBe(k);
        }
        // (Z6) Guild Terrace: hqAnnex v2 once, on the terrace when one fits (above the plaza,
        // reached by a stair link), else the crown lot on a street
        const halls = s.lots.map((i) => w.lots[i]).filter((l) => l.defId === 'hqAnnex');
        expect(halls.length, `${ctx} guild hall`).toBe(1);
        expect(halls[0].variant, ctx).toBe(HQ_CULTURE_SITE.guildHallVariant);
        const terrace = w.districts.find((d) => d.islandId === isl.id && d.kind === 'terrace');
        if (terrace) {
          terraces++;
          expect(dist(halls[0], terrace), `${ctx} hall on the terrace`).toBeLessThan(
            HQ_PLAN.terrace.radius + 1,
          );
          const rise =
            heightAt(w.height, halls[0].x, halls[0].z) - heightAt(w.height, plaza.x, plaza.z);
          expect(rise, `${ctx} terrace above the plaza`).toBeGreaterThanOrEqual(1.5);
          if (w.paths.some((p) => p.islandId === isl.id && p.kind === 'stair')) stairs++;
        }
        // (Z7) the semaphore on the summit
        const sema = fx.filter((f) => f.defId === 'semaphoreTower');
        expect(sema.length, `${ctx} semaphore`).toBeLessThanOrEqual(1);
        if (sema.length) {
          semaphores++;
          expect(dist(sema[0], { x: isl.peakX, z: isl.peakZ }), ctx).toBeLessThan(22);
          expect(heightAt(w.height, sema[0].x, sema[0].z), ctx).toBeGreaterThan(isl.peakY * 0.75);
        }
        // (Z5) post yard + mail line: v0 high, v1 by the pier, the cable clear of the ground
        const pylons = fx.filter((f) => f.defId === 'mailLine');
        expect(pylons.length, ctx).toBeLessThanOrEqual(2);
        if (pylons.length === 2) {
          mailLines++;
          const hi = pylons.find((f) => f.variant === 0);
          const lo = pylons.find((f) => f.variant === 1);
          expect(hi && lo, `${ctx} one high and one low pylon`).toBeTruthy();
          if (!hi || !lo) continue;
          const yh = heightAt(w.height, hi.x, hi.z);
          const yl = heightAt(w.height, lo.x, lo.z);
          expect(yh - yl, `${ctx} mail line falls`).toBeGreaterThanOrEqual(3);
          expect(yard, `${ctx} yard district`).toBeDefined();
          const dk = w.docks[s.docks[0]];
          expect(dist(lo, dk), `${ctx} low pylon by the pier`).toBeLessThan(16);
          const a = mailAnchorWorld(0, { x: hi.x, y: yh, z: hi.z }, hi.rotY);
          const b = mailAnchorWorld(1, { x: lo.x, y: yl, z: lo.z }, lo.rotY);
          for (let k = 1; k < 24; k++) {
            const c = mailCablePoint(a, b, k / 24);
            // the plan keeps 2.2 u over the pre-pad ground; a pad plateau may rise under it
            expect(
              c.y - heightAt(w.height, c.x, c.z),
              `${ctx} cable clearance ${k}`,
            ).toBeGreaterThan(0.3);
          }
        }
        // (Z8) ridge lookouts: fence rails on the plateau behind the bluff lips
        if (w.fences.some((f) => f.islandId === isl.id && f.kind === 'fence')) lookouts++;
        // (Z9) the beach keeps its tide pools; the kit stays on dry land
        expect(n('tidePool'), ctx).toBeGreaterThanOrEqual(1);
        const quayDefs = ['harbourCrane', 'gullPerch', 'cargoCrate'];
        for (const f of fx) {
          const def = PROP_DEFS[PROP_DEF_INDEX[f.defId]];
          if (!HQ_CULTURE.kit.some((k) => k.id === f.defId) && !SIGNAGE.includes(f.defId)) continue;
          expect(def, f.defId).toBeDefined();
          const y = heightAt(w.height, f.x, f.z);
          const min = quayDefs.includes(f.defId)
            ? HQ_CULTURE_SITE.quayY[0] - 0.05
            : HQ_CULTURE_SITE.minY - 0.15;
          expect(y, `${ctx} ${f.defId} at ${f.x.toFixed(1)},${f.z.toFixed(1)}`).toBeGreaterThan(
            min,
          );
          expect(w.islandMap[cellIndex(w, f.x, f.z)], `${ctx} ${f.defId}`).toBe(isl.id + 1);
        }
        // the pier kit of TASK-420 is still there (the crane misses on a seed or two whose shore
        // streets and moorings take the quay room)
        for (const def of ['pierSignpost', 'coffeeCart', 'guildNoticeBoard'])
          expect(n(def), `${ctx} ${def}`).toBe(1);
        expect(n('harbourCrane'), ctx).toBeLessThanOrEqual(1);
        cranes += n('harbourCrane');
        const colours = new Set(fx.filter((f) => f.defId === 'cargoCrate').map((f) => f.variant));
        expect(colours.size, `${ctx} crate colours`).toBeGreaterThanOrEqual(3);
        if (colours.size === THEME_IDS.length) sevenCrates++;
        // story spots: one per kind, each on its anchor def
        const st = w.storySpots.filter((x) => x.islandId === isl.id);
        expect(st.length, `${ctx} story spots`).toBeGreaterThanOrEqual(5);
        expect(new Set(st.map((x) => x.kind)).size, ctx).toBe(st.length);
        for (const x of st) {
          const anchor = [...fx, ...w.lots].some(
            (f) => x.defs.includes(f.defId) && Math.hypot(f.x - x.pos.x, f.z - x.pos.z) < 0.01,
          );
          expect(anchor, `${ctx} ${x.kind} anchor`).toBe(true);
        }
        // ferries: HQ_FERRY.lines loops from HQ's pier, every island with a pier served once
        const ferries = w.boatRoutes.filter((r) => r.kind === 'ferry');
        expect(ferries.length, ctx).toBe(HQ_FERRY.lines);
        const served = new Set<number>();
        for (const r of ferries) {
          expect(r.stops?.[0], ctx).toBe(s.docks[0]);
          for (const d of (r.stops ?? []).slice(1)) served.add(w.docks[d].islandId);
        }
        const withPier = new Set(w.docks.map((d) => d.islandId).filter((id) => id !== isl.id));
        expect([...served].sort(), ctx).toEqual([...withPier].sort());
      }
      expect(semaphores, 'seeds with the summit semaphore').toBeGreaterThanOrEqual(
        Math.ceil(SEEDS.length * 0.9),
      );
      expect(sevenCrates, 'seeds with all seven crate colours').toBeGreaterThanOrEqual(
        Math.ceil(SEEDS.length * 0.8),
      );
      expect(cranes, 'seeds with the harbour crane').toBeGreaterThanOrEqual(
        Math.ceil(SEEDS.length * 0.85),
      );
      expect(stallRows, 'seeds with ≥ 3 goods stalls').toBeGreaterThanOrEqual(
        Math.ceil(SEEDS.length * 0.7),
      );
      expect(terraces, 'seeds with a Guild Terrace').toBeGreaterThanOrEqual(
        Math.ceil(SEEDS.length * 0.8),
      );
      expect(stairs, 'terraces reached by a stair').toBeGreaterThanOrEqual(
        Math.ceil(terraces * 0.8),
      );
      // the cable must clear the ground, roofs and the tower: tight bays lose it
      expect(mailLines, 'seeds with a mail line').toBeGreaterThanOrEqual(
        Math.ceil(SEEDS.length * 0.65),
      );
      expect(lookouts, 'seeds with ridge lookouts').toBeGreaterThanOrEqual(
        Math.ceil(SEEDS.length * 0.8),
      );
    },
  );

  it('per-theme snapshot: HQ settlement data is pinned and deterministic', () => {
    const got = [1, 42, 1001].map((seed) => hqHash(world(seed)));
    expect(got).toEqual(['5e153f49e969859d', '75a1340f6fcd4bd9', 'e4c9f4c2d58aebda']);
    expect(hqHash(generateWorld(1001))).toBe(got[2]);
  });
});
