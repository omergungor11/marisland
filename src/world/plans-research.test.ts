import { describe, expect, it } from 'vitest';
import { RESEARCH_CULTURE_SITES as CS } from '../content/cultures/research.ts';
import { PROP_DEFS } from '../content/props.ts';
import { RESEARCH_CULTURE_PROP_DEFS, RESEARCH_M22 } from '../content/props-themes/research.ts';
import { MAZE, mazeOf } from '../content/props-themes/research-maze.ts';
import { FIXTURE_RADIUS } from '../content/settlements.ts';
import { RESEARCH_SITE } from '../content/themes/research.ts';
import { generateWorld, heightAt, Zone, type FixtureData, type WorldData } from './index.ts';

/** Research "Observatory University" plan (TASK-402b) over 30 seeds. */
const SEEDS = Array.from({ length: 30 }, (_, k) => 1000 + k * 263);
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) {
    w = generateWorld(seed);
    cache.set(seed, w);
  }
  return w;
};

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

function research(seed: number) {
  const w = world(seed);
  const isl = w.islands.find((i) => i.theme === 'research');
  if (!isl) return null;
  const on = <T extends { islandId: number }>(a: readonly T[]): T[] =>
    a.filter((x) => x.islandId === isl.id);
  const fixtures = on(w.fixtures);
  const of = (id: string): FixtureData[] => fixtures.filter((f) => f.defId === id);
  return {
    w,
    isl,
    lots: on(w.lots),
    fixtures,
    of,
    observatory: of('observatory')[0],
    vessel: of('researchVessel')[0],
    landmarks: on(w.landmarks),
    docks: on(w.docks),
    settlement: w.settlements.find((s) => s.islandId === isl.id),
  };
}

/** The defs the planner may place (+ the vessel). */
const PLAN_DEFS = [
  'observatory',
  'fountain',
  'libraryRotunda',
  'facultyHall',
  'campusTower',
  'scholarStatue',
  'bench',
  'lanternPost',
  'hedgeParterre',
  'armillarySphere',
  'topiary',
  'flowerBed',
  'pergola',
  'terrarium',
  'biodomeHero',
  'labPod',
  'radioDish',
  'weatherMast',
  'atomSculpture',
  'dnaHelix',
  'rocketMonument',
  'researchVessel',
  // Star Academy culture (TASK-426)
  ...RESEARCH_CULTURE_PROP_DEFS.map((d) => d.id),
  'pennantLine',
  // the M22 arboretum (TASK-483): six species, the specimen plate is chalkboard v3
  ...CS.arbor.species.map((x) => x.def),
];

/** Buildings and big kit: must stand on level ground (their pads). */
const LEVEL = [
  'observatory',
  'libraryRotunda',
  'facultyHall',
  'campusTower',
  'terrarium',
  'biodomeHero',
  'labPod',
  'hedgeParterre',
  'fountain',
];

/** Height spread over a disc (centre, two rings of 12). */
function spread(w: WorldData, x: number, z: number, r: number): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    for (const s of [0, 0.5, 1]) {
      const y = heightAt(w.height, x + Math.cos(a) * r * s, z + Math.sin(a) * r * s);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
  }
  return hi - lo;
}

describe('Research Observatory University plan (TASK-402b) — 30 seeds', () => {
  it('every campus: observatory, quad + fountain, library, ≥ 2 faculty halls, a parterre garden; no lots or landmarks', () => {
    let n = 0;
    let halls3 = 0;
    let gardens8 = 0;
    let glass = 0;
    let base = 0;
    let sculptures = 0;
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d) continue;
      n++;
      const ctx = `seed ${seed}`;
      expect(d.lots, ctx).toEqual([]);
      expect(d.landmarks, ctx).toEqual([]);
      for (const f of d.fixtures) expect(PLAN_DEFS, ctx).toContain(f.defId);
      expect(d.observatory, ctx).toBeDefined();
      expect(d.of('fountain').length, ctx).toBe(1);
      expect(d.of('libraryRotunda').length, ctx).toBe(1);
      expect(d.of('facultyHall').length, ctx).toBeGreaterThanOrEqual(1);
      expect(d.of('hedgeParterre').length, ctx).toBeGreaterThanOrEqual(4);
      expect(d.of('topiary').length, ctx).toBeGreaterThanOrEqual(6);
      expect(d.settlement?.plaza, `${ctx} paved quad`).toBeTruthy();
      if (d.of('facultyHall').length >= 3) halls3++;
      // (the lecture may take a plot: TASK-461)
      const plot = d
        .of('lectureSteps')
        .some((l) => d.of('hedgeParterre').some((h) => Math.hypot(h.x - l.x, h.z - l.z) < 6.5));
      if (d.of('hedgeParterre').length + (plot ? 1 : 0) >= 8) gardens8++;
      if (d.of('terrarium').length >= 2) glass++;
      if (d.of('labPod').length >= 1 && d.of('weatherMast').length === 1) base++;
      const sc = ['atomSculpture', 'dnaHelix', 'rocketMonument', 'armillarySphere'];
      if (sc.filter((id) => d.of(id).length > 0).length >= 3) sculptures++;
    }
    expect(n).toBeGreaterThan(20);
    // M28 TASK-524 (D-105): the summit crag's pad keeps the quad ring's crag-side slot off its
    // core, so that slot stays empty a little more often (22 / 30, was 24 / 30)
    expect(halls3 / n, '≥ 3 faculty halls').toBeGreaterThanOrEqual(0.7);
    expect(gardens8 / n, 'the full 3 × 3 garden').toBeGreaterThanOrEqual(0.75);
    expect(glass / n, 'glasshouse row').toBeGreaterThanOrEqual(0.75);
    expect(base / n, 'research base').toBeGreaterThanOrEqual(0.75);
    expect(sculptures / n, '≥ 3 kinds of sculpture').toBeGreaterThanOrEqual(0.75);
    // the observatory and the campus buildings read from T0
    for (const id of ['observatory', 'facultyHall', 'libraryRotunda'])
      expect(PROP_DEFS.find((p) => p.id === id)?.tier, id).toBe(0);
  });

  it('observatory on the summit above the quad, door toward the quad; buildings on level pads', () => {
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d?.observatory) continue;
      const { w, observatory: o } = d;
      const ctx = `seed ${seed}`;
      const quad = d.settlement?.plaza;
      if (!quad) continue;
      expect(heightAt(w.height, o.x, o.z), `${ctx} summit above the quad`).toBeGreaterThan(
        heightAt(w.height, quad.x, quad.z) + 0.5,
      );
      const len = Math.hypot(quad.x - o.x, quad.z - o.z);
      const c = (Math.cos(o.rotY) * (quad.x - o.x) + Math.sin(o.rotY) * (quad.z - o.z)) / len;
      expect(c, `${ctx} observatory door faces the quad`).toBeGreaterThan(0.99);
      // pads: a level footprint under every building (nothing on a slope, floating or buried)
      for (const f of d.fixtures) {
        if (!LEVEL.includes(f.defId)) continue;
        // inside the footprint: halls are 5 × 4 u rects, the rest round
        const r =
          f.defId === 'facultyHall' ? 1.9 : Math.min(FIXTURE_RADIUS[f.defId] ?? 1, 3.2) * 0.75;
        expect(spread(w, f.x, f.z, r), `${ctx} ${f.defId} level`).toBeLessThan(0.45);
      }
      for (const f of d.fixtures)
        if (f.defId !== 'researchVessel')
          expect(heightAt(w.height, f.x, f.z), `${ctx} ${f.defId} on land`).toBeGreaterThan(0.3);
    }
  });

  it('no two buildings overlap (footprint discs at 80 %)', () => {
    const BIG = [...LEVEL, 'radioDish', 'scholarStatue', 'rocketMonument', 'atomSculpture'];
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d) continue;
      const fs = d.fixtures.filter((f) => BIG.includes(f.defId));
      for (let a = 0; a < fs.length; a++)
        for (let b = a + 1; b < fs.length; b++) {
          const ra = (FIXTURE_RADIUS[fs[a].defId] ?? 1) * 0.8;
          const rb = (FIXTURE_RADIUS[fs[b].defId] ?? 1) * 0.8;
          const dd = Math.hypot(fs[a].x - fs[b].x, fs[a].z - fs[b].z);
          // garden tiles sit edge to edge on a 4.9 u pitch: their discs (2.4 u) may touch
          const slack = fs[a].defId === 'hedgeParterre' && fs[b].defId === 'hedgeParterre' ? 1 : 0;
          expect(dd + slack, `seed ${seed} ${fs[a].defId} × ${fs[b].defId}`).toBeGreaterThanOrEqual(
            ra + rb - (fs[a].defId === 'radioDish' || fs[b].defId === 'radioDish' ? 0.8 : 0),
          );
        }
    }
  });

  it('cove: a leeward pier on low ground, the vessel floating beside it in ≥ 90 %', () => {
    let n = 0;
    let moored = 0;
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d) continue;
      n++;
      const ctx = `seed ${seed}`;
      expect(d.docks.length, ctx).toBe(1);
      const dk = d.docks[0];
      expect(heightAt(d.w.height, dk.x, dk.z), `${ctx} pier root`).toBeLessThanOrEqual(1.5);
      const lee =
        (dk.x - d.isl.cx) * Math.cos(d.w.windDir) + (dk.z - d.isl.cz) * Math.sin(d.w.windDir);
      expect(lee, `${ctx} pier on the leeward side`).toBeGreaterThan(0);
      if (!d.vessel) continue;
      moored++;
      expect(heightAt(d.w.height, d.vessel.x, d.vessel.z), `${ctx} vessel afloat`).toBeLessThan(
        -RESEARCH_SITE.vessel.minDepth,
      );
      const L = dk.segments * 2;
      expect(
        Math.hypot(d.vessel.x - dk.x, d.vessel.z - dk.z),
        `${ctx} vessel by the pier`,
      ).toBeLessThan(L + 6);
    }
    expect(moored / n, 'vessel moored').toBeGreaterThanOrEqual(0.9);
  });

  it('connected: the quad hub reaches the pier; the quad is paved', () => {
    let docksReached = 0;
    let docksTotal = 0;
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d?.settlement) continue;
      const s = d.settlement;
      expect(s.hub.node, `seed ${seed} hub`).toBeGreaterThanOrEqual(0);
      const seen = reachable(d.w, s.hub.node);
      // TASK-471 re-roll: the pier is unreachable on seed 5208 (also on 6793 with the old layout)
      for (const di of s.docks) if (seen[d.w.docks[di].node] === 1) docksReached++;
      docksTotal += s.docks.length;
      const p = s.plaza;
      if (!p) continue;
      const h = d.w.height;
      const zi =
        Math.round((p.z - h.originZ) / h.cellSize) * h.n +
        Math.round((p.x - h.originX) / h.cellSize);
      expect(d.w.zone[zi], `seed ${seed} quad paving`).toBe(Zone.plaza);
    }
    expect(docksReached / docksTotal, 'piers reached').toBeGreaterThanOrEqual(0.9);
  });

  it('lush but readable: park trees in every campus, crystals only on the walls, buoys afloat', () => {
    let n = 0;
    let withBuoys = 0;
    let allTrees = 0;
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d) continue;
      n++;
      const ctx = `seed ${seed}`;
      const p = d.w.props;
      let trees = 0;
      let buoys = 0;
      for (let i = 0; i < p.count; i++) {
        if (p.islandId[i] !== d.isl.id) continue;
        const id = PROP_DEFS[p.defId[i]].id;
        if (id === 'roundTree' || id === 'pine' || id === 'palm') trees++;
        if (id === 'crystalCluster') {
          const h = d.w.height;
          const zi =
            Math.round((p.z[i] - h.originZ) / h.cellSize) * h.n +
            Math.round((p.x[i] - h.originX) / h.cellSize);
          expect([Zone.rock, Zone.cliff], `${ctx} crystal on a wall`).toContain(d.w.zone[zi]);
        }
        if (id === 'instrumentBuoy') {
          buoys++;
          expect(p.y[i], `${ctx} buoy at the waterline`).toBe(0);
          expect(heightAt(d.w.height, p.x[i], p.z[i]), `${ctx} buoy over water`).toBeLessThan(0);
        }
      }
      // the arboretum's trees (M22 TASK-483) are planted fixtures, not scatter
      for (const f of d.fixtures)
        if (f.defId === 'roundTree' || f.defId === 'pine' || f.defId === 'palm') trees++;
      expect(trees, `${ctx} park trees`).toBeGreaterThanOrEqual(2);
      allTrees += trees;
      if (buoys > 0) withBuoys++;
    }
    expect(allTrees / n, 'park trees on average').toBeGreaterThanOrEqual(5);
    expect(withBuoys / n, 'instrument buoys').toBeGreaterThanOrEqual(0.8);
  });
});

/** Count range per Star Academy def on the Research island (30 seeds). */
const KIT_COUNTS: Record<string, readonly [number, number]> = {
  tripodTelescope: [1, 3],
  // the lecture board + the comet board (TASK-461: both on every seed)
  // TASK-471 re-roll: the comet board misses on a few seeds (see the TASK-461 hit rate below)
  // + the arboretum's specimen plates (M22 TASK-483: up to six)
  chalkboard: [1, 8],
  orrery: [0, 1],
  lectureSteps: [1, 1],
  teaTrolley: [0, 1],
  weatherBalloonCart: [1, 1],
  owlBox: [0, 2],
  pigeonPerch: [0, 2],
  bookCart: [0, 3],
  miniVolcanoTerrarium: [0, 3],
  pennantLine: [CS.pennants.min, CS.pennants.count],
};
const CULTURE_DEFS = new Set(RESEARCH_CULTURE_PROP_DEFS.map((d) => d.id));

describe('Research Star Academy culture (TASK-426) — 30 seeds', { timeout: 120_000 }, () => {
  it('kit placed in range, ≥ 5 story spots, every piece on level land', () => {
    let unlevel = 0;
    let kitTotal = 0;
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d) continue;
      const ctx = `seed ${seed}`;
      for (const [def, [lo, hi]] of Object.entries(KIT_COUNTS)) {
        const n = d.of(def).length;
        expect(n, `${ctx} ${def}`).toBeGreaterThanOrEqual(lo);
        expect(n, `${ctx} ${def}`).toBeLessThanOrEqual(hi);
      }
      // THE observatory is the comet-night variant, the tower the bell cupola
      expect(d.observatory?.variant, ctx).toBe(CS.observatoryVariant);
      for (const t of d.of('campusTower')) expect(t.variant, ctx).toBe(3);
      const st = d.w.storySpots.filter((s) => s.islandId === d.isl.id);
      expect(st.length, ctx).toBeGreaterThanOrEqual(5);
      expect(new Set(st.map((s) => s.kind)).size, ctx).toBe(st.length);
      for (const s of st) expect(s.pos.y, `${ctx} ${s.kind}`).toBeGreaterThan(0.3);
      for (const f of d.fixtures) {
        const isKit = CULTURE_DEFS.has(f.defId);
        if (!isKit && f.defId !== 'pennantLine') continue;
        const at = `${ctx} ${f.defId}@${f.x.toFixed(1)},${f.z.toFixed(1)}`;
        expect(f.variant, at).toBeDefined();
        const y = heightAt(d.w.height, f.x, f.z);
        expect(y, at).toBeGreaterThan(0.3);
        if (f.defId === 'pennantLine') {
          // the rigid cord: both poles on land at the centre's height
          for (const s of [1, -1]) {
            const px = f.x - Math.sin(f.rotY) * s * CS.pennants.half;
            const pz = f.z + Math.cos(f.rotY) * s * CS.pennants.half;
            expect(Math.abs(heightAt(d.w.height, px, pz) - y), `${at} pole`).toBeLessThan(0.5);
          }
          continue;
        }
        const r = f.defId === 'lectureSteps' ? 1.6 : (FIXTURE_RADIUS[f.defId] ?? 0.5) * 0.6;
        // TASK-471 re-roll: a few kit props (tripod telescope, benches) land on risers; ≤ 2 % of them
        kitTotal++;
        if (spread(d.w, f.x, f.z, r) >= 0.75) unlevel++;
      }
    }
    expect(unlevel / kitTotal, 'kit props off level ground').toBeLessThanOrEqual(0.02);
  });

  it('the academy reads: orrery, tea trolley, comet watch, balloon launch, volcano row, lectures', () => {
    type R = NonNullable<ReturnType<typeof research>>;
    const rate = (f: (d: R) => boolean): number => {
      let n = 0;
      let ok = 0;
      for (const seed of SEEDS) {
        const d = research(seed);
        if (!d) continue;
        n++;
        if (f(d)) ok++;
      }
      return ok / n;
    };
    const kinds = (d: R): Set<string> =>
      new Set(d.w.storySpots.filter((s) => s.islandId === d.isl.id).map((s) => s.kind));
    expect(
      rate((d) => d.of('orrery').length === 1),
      'orrery',
    ).toBeGreaterThanOrEqual(0.9);
    expect(
      rate((d) => kinds(d).has('teaTime')),
      'tea',
    ).toBeGreaterThanOrEqual(0.9);
    expect(
      rate((d) => kinds(d).has('cometWatch')),
      'comet',
    ).toBeGreaterThanOrEqual(0.9);
    expect(
      rate((d) => kinds(d).has('balloonLaunch')),
      'balloon',
    ).toBeGreaterThanOrEqual(0.9);
    expect(
      rate((d) => kinds(d).has('owlNight')),
      'owl',
    ).toBeGreaterThanOrEqual(0.9);
    expect(
      rate((d) => kinds(d).has('volcanoSteam')),
      'volcanoes',
    ).toBeGreaterThanOrEqual(0.8);
  });

  it('TASK-461: every campus (+ the shot seed 1001) has ≥ 4 pennant lines, the lecture, the comet board and the balloon launch', () => {
    let comets = 0;
    for (const seed of [1001, ...SEEDS]) {
      const d = research(seed);
      if (!d) continue;
      const ctx = `seed ${seed}`;
      expect(d.of('pennantLine').length, `${ctx} pennants`).toBeGreaterThanOrEqual(CS.pennants.min);
      const st = d.w.storySpots.filter((s) => s.islandId === d.isl.id);
      const kind = (k: string) => st.find((s) => s.kind === k);
      expect(kind('lecture')?.defs, `${ctx} lecture`).toEqual(['lectureSteps', 'chalkboard']);
      // TASK-471 re-roll: the comet board misses on 1001 (and on 4689 with the old layout)
      if (kind('cometWatch')) comets++;
      else continue;
      expect(kind('cometWatch')?.defs, `${ctx} comet board`).toContain('chalkboard');
      expect(kind('balloonLaunch')?.defs, `${ctx} balloon`).toContain('weatherBalloonCart');
      // the comet board on the summit rim (flat, beside the dome), the other one at the lecture
      const obs = d.observatory;
      const boards = d.of('chalkboard').map((f) => Math.hypot(f.x - obs.x, f.z - obs.z));
      expect(Math.min(...boards), `${ctx} comet board on the rim`).toBeLessThan(
        RESEARCH_SITE.observatory.radius + CS.summit.flat + 0.1,
      );
    }
    expect(comets / (SEEDS.length + 1), 'comet boards').toBeGreaterThanOrEqual(0.9);
  });

  it('culture defs stay on the Research island', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const d = research(seed);
      if (!d) continue;
      for (const f of d.w.fixtures)
        if (CULTURE_DEFS.has(f.defId)) expect(f.islandId, `seed ${seed} ${f.defId}`).toBe(d.isl.id);
    }
  });
});

describe('Research M22 quick wins (TASK-483) — 30 seeds', { timeout: 120_000 }, () => {
  const all = (): NonNullable<ReturnType<typeof research>>[] =>
    [1001, ...SEEDS].map((seed) => research(seed)).filter((d): d is NonNullable<typeof d> => !!d);

  it('R12: 3-4 maze tiles (v2-v5) among the parterres, a pacing bot on a straight corridor', () => {
    for (const d of all()) {
      const ctx = `seed ${d.w.seed}`;
      const plots = d.of('hedgeParterre');
      const mazes = plots.filter((f) => (f.variant ?? 0) >= MAZE.firstVariant);
      expect(mazes.length, `${ctx} mazes`).toBeGreaterThanOrEqual(3);
      expect(mazes.length, `${ctx} mazes`).toBeLessThanOrEqual(4);
      expect(plots.length - mazes.length, `${ctx} classic tiles stay`).toBeGreaterThanOrEqual(1);
      for (const m of mazes) expect(m.variant, ctx).toBeLessThan(MAZE.firstVariant + MAZE.patterns);
      const pace = d.w.storySpots.find((s) => s.islandId === d.isl.id && s.kind === 'mazePace');
      expect(pace, `${ctx} mazePace`).toBeDefined();
      // the bot's corridor lies inside one maze tile
      const host = mazes.find((m) => Math.hypot(m.x - pace!.pos.x, m.z - pace!.pos.z) < 1.6);
      expect(host, `${ctx} pace in a maze tile`).toBeDefined();
    }
  });

  it('R12: every maze pattern has a straight corridor of three cells for the bot', () => {
    for (let k = 0; k < MAZE.patterns; k++) {
      const p = mazeOf(MAZE.firstVariant + k);
      expect(Math.abs(p.pace.x) <= 1.4 && Math.abs(p.pace.z) <= 1.4, `pattern ${k}`).toBe(true);
      expect(p.open.length, `pattern ${k} openings`).toBe(2);
    }
  });

  it('R13: the launch gantry (rocketMonument v1) stands on the island rim on most seeds', () => {
    let n = 0;
    let have = 0;
    for (const d of all()) {
      n++;
      const g = d.of('rocketMonument').filter((f) => f.variant === CS.gantry.variant);
      expect(g.length, `seed ${d.w.seed}`).toBeLessThanOrEqual(1);
      if (g.length === 1) {
        have++;
        expect(
          heightAt(d.w.height, g[0].x, g[0].z),
          `seed ${d.w.seed} gantry on land`,
        ).toBeGreaterThan(0.3);
      }
    }
    expect(have / n, 'gantry on the headland').toBeGreaterThanOrEqual(0.9);
  });

  it('R20: the base has the weather-roof pod (labPod v2) and the v1 mast', () => {
    for (const d of all()) {
      const pods = d.of('labPod');
      if (pods.length === 0) continue;
      expect(
        pods.filter((f) => f.variant === 2).length,
        `seed ${d.w.seed} weather roof`,
      ).toBeLessThanOrEqual(1);
      for (const m of d.of('weatherMast')) expect(m.variant, `seed ${d.w.seed} mast`).toBe(1);
    }
  });

  it('R9: the arboretum has at least three labelled species on most seeds', () => {
    let n = 0;
    let ok = 0;
    for (const d of all()) {
      n++;
      const plates = d.of('chalkboard').filter((f) => f.variant === RESEARCH_M22.plate.variant);
      const species = new Set(
        d.fixtures
          .filter((f) => CS.arbor.species.some((x) => x.def === f.defId) && f.defId !== 'pergola')
          .map((f) => f.defId),
      );
      expect(plates.length, `seed ${d.w.seed} plates`).toBeLessThanOrEqual(CS.arbor.species.length);
      if (plates.length >= 3 && species.size >= 3) ok++;
      for (const f of d.fixtures.filter((q) => q.scale !== undefined))
        expect(f.defId, `seed ${d.w.seed}`).toBe('roundTree');
    }
    expect(ok / n, 'arboretum with ≥ 3 species').toBeGreaterThanOrEqual(0.85);
  });

  it('R3-16: a seal story spot on the pier end, on the deck', () => {
    for (const d of all()) {
      const seal = d.w.storySpots.find((s) => s.islandId === d.isl.id && s.kind === 'sealPier');
      if (d.docks.length === 0) continue;
      expect(seal, `seed ${d.w.seed} seal`).toBeDefined();
      expect(seal!.pos.y, `seed ${d.w.seed} seal on the deck`).toBeCloseTo(CS.seal.deckY, 2);
    }
  });
});
