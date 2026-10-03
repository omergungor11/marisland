import type { Rng } from '../../core/rng.ts';
import { TAU } from '../../core/math/index.ts';
import type { ArchetypeId, IslandData } from '../types.ts';
import { WORLD_SIZE } from '../types.ts';
import { ARCHETYPES, LAYOUT, NAME_SYLLABLES } from '../../content/islands.ts';

export interface LayoutOptions {
  /** 1 = M1 single Hearthholm; 'auto' = archipelago (TASK-111). */
  islands: 1 | 'auto';
}

export interface Layout {
  windDir: number;
  islands: IslandData[];
}

/** Keep every island's evaluation bounds this far inside the world edge. */
const EDGE_MARGIN = 24;

/** Fixed archetype order: island ids follow it, so ids are stable per roster. */
export const ARCHETYPE_ORDER = Object.keys(ARCHETYPES) as ArchetypeId[];

/**
 * Build one IslandData from an archetype + centre + radius. Peak fields are
 * filled by the heightfield stage.
 */
export function islandAt(
  id: number,
  archetype: ArchetypeId,
  cx: number,
  cz: number,
  radius: number,
): IslandData {
  const p = ARCHETYPES[archetype];
  const half = radius * p.boundsScale;
  const lim = WORLD_SIZE / 2 - EDGE_MARGIN;
  return {
    id,
    archetype,
    name: p.displayName,
    archetypeName: p.displayName,
    cx,
    cz,
    radius,
    reach: radius * p.reachScale,
    heightClass: p.heightClass,
    colorClass: p.colorClass,
    peakY: 0,
    peakX: cx,
    peakZ: cz,
    minX: Math.max(-lim, cx - half),
    minZ: Math.max(-lim, cz - half),
    maxX: Math.min(lim, cx + half),
    maxZ: Math.min(lim, cz + half),
    anchors: {},
  };
}

/** Radius rolled from the archetype's bible diameter range. */
export function makeIsland(
  id: number,
  archetype: ArchetypeId,
  cx: number,
  cz: number,
  rng: Rng,
): IslandData {
  const p = ARCHETYPES[archetype];
  return islandAt(id, archetype, cx, cz, rng.range(p.diameter[0], p.diameter[1]) / 2);
}

/** M1: a single Hearthholm close to the origin. */
function singleIsland(rng: Rng): IslandData[] {
  const r = rng.fork('island', 0);
  const cx = r.range(-6, 6);
  const cz = r.range(-6, 6);
  return [makeIsland(0, 'hearthholm', cx, cz, r)];
}

// ---------------------------------------------------------------- roster

export interface RosterEntry {
  archetype: ArchetypeId;
  radius: number;
  /** Bounding-disc radius. */
  reach: number;
  sizeClass: 'hero' | 'medium' | 'small' | 'tiny';
}

function pickCount(rng: Rng): number {
  let total = 0;
  for (const [, w] of LAYOUT.countWeights) total += w;
  let t = rng.next() * total;
  for (const [c, w] of LAYOUT.countWeights) {
    t -= w;
    if (t < 0) return c;
  }
  return LAYOUT.countWeights[LAYOUT.countWeights.length - 1][0];
}

/**
 * Roster rules (ART_BIBLE §4): Hearthholm always, ≥ 1 tall landmark island,
 * no repeats, 2–3 mediums, ≥ 1 small/tiny, hero largest. Lonely Palm in
 * ~LAYOUT.lonelyPalmChance of seeds. Returns entries in ARCHETYPE_ORDER.
 */
export function pickRoster(rng: Rng): RosterEntry[] {
  const count = pickCount(rng.fork('count'));
  const lonely = count === 7 || rng.fork('lonely').chance(LAYOUT.lonelyPalmChance);
  const pool = ARCHETYPE_ORDER.filter((a) => a !== 'hearthholm' && a !== 'lonelypalm');
  const need = count - 1 - (lonely ? 1 : 0);
  for (let attempt = 0; ; attempt++) {
    const shuffled = rng.fork('pick', attempt).shuffle([...pool]);
    const chosen = new Set<ArchetypeId>(shuffled.slice(0, need));
    chosen.add('hearthholm');
    if (lonely) chosen.add('lonelypalm');
    if (!LAYOUT.tallLandmarks.some((a) => chosen.has(a)) && attempt < 50) continue;
    const list = ARCHETYPE_ORDER.filter((a) => chosen.has(a));
    const cls = new Map<ArchetypeId, RosterEntry['sizeClass']>();
    for (const a of list) cls.set(a, ARCHETYPES[a].sizeClass);
    let mediums = list.filter((a) => cls.get(a) === 'medium');
    if (mediums.length > LAYOUT.medium[1]) {
      const demote = mediums.find((a) => ARCHETYPES[a].demotedDiameter);
      if (demote) cls.set(demote, 'small');
      mediums = list.filter((a) => cls.get(a) === 'medium');
    }
    const smalls = list.filter((a) => cls.get(a) === 'small' || cls.get(a) === 'tiny');
    const ok =
      mediums.length >= LAYOUT.medium[0] && mediums.length <= LAYOUT.medium[1] && smalls.length > 0;
    if (!ok && attempt < 50) continue;
    const heroP = ARCHETYPES.hearthholm;
    const heroD = rng.fork('size', 0).range(heroP.diameter[0], heroP.diameter[1]);
    return list.map((a) => {
      const p = ARCHETYPES[a];
      const sizeClass = cls.get(a) ?? p.sizeClass;
      let d = heroD;
      if (a !== 'hearthholm') {
        const range = sizeClass === 'small' && p.demotedDiameter ? p.demotedDiameter : p.diameter;
        const hi = Math.min(range[1], heroD * LAYOUT.heroDominance);
        d = rng.fork('size', ARCHETYPE_ORDER.indexOf(a)).range(range[0], Math.max(range[0], hi));
      }
      const radius = d / 2;
      return { archetype: a, radius, reach: radius * p.reachScale, sizeClass };
    });
  }
}

// ---------------------------------------------------------------- placement

interface Disc {
  x: number;
  z: number;
  r: number;
}

const gapOf = (a: Disc, b: Disc): number => Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;

/** Nearest-neighbour coast gap per disc. */
export function nearestGaps(discs: readonly Disc[]): number[] {
  return discs.map((a, i) => {
    let best = Infinity;
    discs.forEach((b, j) => {
      if (j !== i) best = Math.min(best, gapOf(a, b));
    });
    return best;
  });
}

/**
 * Adjacent pairs [i, j] (i < j): j is i's nearest neighbour or vice versa,
 * or the channel between them is no wider than LAYOUT.maxNearestGap.
 */
export function adjacentPairs(discs: readonly Disc[]): [number, number][] {
  const near = nearestGaps(discs);
  const out: [number, number][] = [];
  for (let i = 0; i < discs.length; i++)
    for (let j = i + 1; j < discs.length; j++) {
      const g = gapOf(discs[i], discs[j]);
      if (g <= LAYOUT.maxNearestGap || g <= near[i] + 1e-6 || g <= near[j] + 1e-6) out.push([i, j]);
    }
  return out;
}

/** Islands differ in height class or colour class. */
export function contrasts(a: ArchetypeId, b: ArchetypeId): boolean {
  const pa = ARCHETYPES[a];
  const pb = ARCHETYPES[b];
  return pa.heightClass !== pb.heightClass || pa.colorClass !== pb.colorClass;
}

/** Validates a placed layout; null = OK, otherwise the failed rule. */
export function layoutProblem(
  roster: readonly RosterEntry[],
  discs: readonly Disc[],
): string | null {
  const ext = LAYOUT.extent;
  for (const d of discs)
    if (Math.abs(d.x) + d.r > ext || Math.abs(d.z) + d.r > ext) return 'extent';
  for (let i = 0; i < discs.length; i++)
    for (let j = i + 1; j < discs.length; j++)
      if (gapOf(discs[i], discs[j]) < LAYOUT.minGap) return 'overlap';
  const near = nearestGaps(discs);
  if (near.some((g) => g > LAYOUT.maxNearestGap)) return 'isolated';
  // connectivity over channels ≤ maxNearestGap
  const seen = new Uint8Array(discs.length);
  const stack = [0];
  seen[0] = 1;
  while (stack.length > 0) {
    const i = stack.pop() as number;
    for (let j = 0; j < discs.length; j++)
      if (!seen[j] && gapOf(discs[i], discs[j]) <= LAYOUT.maxNearestGap) {
        seen[j] = 1;
        stack.push(j);
      }
  }
  if (seen.some((v) => v === 0)) return 'disconnected';
  for (const [i, j] of adjacentPairs(discs))
    if (!contrasts(roster[i].archetype, roster[j].archetype)) return 'contrast';
  return null;
}

/**
 * Dart-throw: hero at the origin, then by decreasing reach each island is
 * attached to a random placed one at gap ∈ LAYOUT.attachGap; of
 * LAYOUT.candidates valid darts the one nearest the centroid wins. Then
 * relax (push overlapping pairs apart, pull loners in) and re-centre.
 */
function place(roster: readonly RosterEntry[], rng: Rng): Disc[] | null {
  const discs: (Disc | null)[] = roster.map(() => null);
  const order = roster.map((_, i) => i).sort((a, b) => roster[b].reach - roster[a].reach || a - b);
  const placed: Disc[] = [];
  for (const i of order) {
    const r = roster[i].reach;
    if (placed.length === 0) {
      const d = { x: 0, z: 0, r };
      discs[i] = d;
      placed.push(d);
      continue;
    }
    let cx = 0;
    let cz = 0;
    for (const p of placed) {
      cx += p.x;
      cz += p.z;
    }
    cx /= placed.length;
    cz /= placed.length;
    let best: Disc | null = null;
    let bestScore = Infinity;
    const dr = rng.fork('dart', i);
    for (let c = 0; c < LAYOUT.candidates; c++) {
      const anchor = dr.pick(placed);
      const a = dr.range(0, TAU);
      const dist = anchor.r + r + dr.range(LAYOUT.attachGap[0], LAYOUT.attachGap[1]);
      const cand = { x: anchor.x + Math.cos(a) * dist, z: anchor.z + Math.sin(a) * dist, r };
      if (placed.some((p) => gapOf(p, cand) < LAYOUT.minGap)) continue;
      const score = Math.hypot(cand.x - cx, cand.z - cz) + dr.range(0, 20);
      if (score < bestScore) {
        bestScore = score;
        best = cand;
      }
    }
    if (!best) return null;
    discs[i] = best;
    placed.push(best);
  }
  const out = discs as Disc[];
  relax(out);
  recentre(out);
  return out;
}

function relax(discs: Disc[]): void {
  const n = discs.length;
  const target = (LAYOUT.attachGap[0] + LAYOUT.attachGap[1]) / 2;
  for (let it = 0; it < LAYOUT.relaxIterations; it++) {
    // push apart overlapping pairs (equal shares)
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = discs[i];
        const b = discs[j];
        const g = gapOf(a, b);
        if (g >= LAYOUT.minGap + 1) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        const push = (LAYOUT.minGap + 1 - g) / 2;
        a.x -= (dx / len) * push;
        a.z -= (dz / len) * push;
        b.x += (dx / len) * push;
        b.z += (dz / len) * push;
      }
    // pull islands with a wide channel toward their nearest neighbour
    const near = nearestGaps(discs);
    for (let i = 0; i < n; i++) {
      if (near[i] <= target) continue;
      let nj = -1;
      for (let j = 0; j < n; j++)
        if (j !== i && Math.abs(gapOf(discs[i], discs[j]) - near[i]) < 1e-9) nj = j;
      if (nj < 0) continue;
      const a = discs[i];
      const b = discs[nj];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const move = (near[i] - target) * LAYOUT.pull;
      a.x += (dx / len) * move;
      a.z += (dz / len) * move;
    }
  }
}

/** Centre the bounding box of all discs on the origin. */
function recentre(discs: Disc[]): void {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const d of discs) {
    x0 = Math.min(x0, d.x - d.r);
    x1 = Math.max(x1, d.x + d.r);
    z0 = Math.min(z0, d.z - d.r);
    z1 = Math.max(z1, d.z + d.r);
  }
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  for (const d of discs) {
    d.x -= mx;
    d.z -= mz;
  }
}

// ---------------------------------------------------------------- names

const VOWELS = /[aeiouy]$/i;
const STARTS_VOWEL = /^[aeiouy]/i;

/** 2–3 syllable pronounceable name; never two vowels across a syllable seam. */
function syllableName(rng: Rng): string {
  const { first, mid, last, threeChance } = NAME_SYLLABLES;
  let s = rng.pick(first);
  const parts = rng.chance(threeChance) ? [mid, last] : [last];
  for (const bank of parts) {
    let next = rng.pick(bank);
    for (let k = 0; k < 8 && VOWELS.test(s) && STARTS_VOWEL.test(next); k++) next = rng.pick(bank);
    if (VOWELS.test(s) && STARTS_VOWEL.test(next)) next = 'n' + next;
    s += next;
  }
  return s;
}

/** Unique names per seed; Hearthholm keeps its own. */
export function nameIslands(archetypes: readonly ArchetypeId[], rng: Rng): string[] {
  const used = new Set<string>(ARCHETYPE_ORDER.map((a) => ARCHETYPES[a].displayName.toLowerCase()));
  return archetypes.map((a) => {
    if (a === 'hearthholm') return ARCHETYPES.hearthholm.displayName;
    for (;;) {
      const n = syllableName(rng);
      if (n.length < 4 || n.length > 11 || used.has(n.toLowerCase())) continue;
      used.add(n.toLowerCase());
      return n;
    }
  });
}

// ---------------------------------------------------------------- entry

/** Roster + placement (no names); exported for the fast layout property test. */
export function archipelago(rng: Rng): { roster: RosterEntry[]; discs: Disc[] } {
  let fallback: { roster: RosterEntry[]; discs: Disc[] } | null = null;
  for (let ra = 0; ra < 8; ra++) {
    const roster = pickRoster(rng.fork('roster', ra));
    for (let pa = 0; pa < LAYOUT.attempts; pa++) {
      const discs = place(roster, rng.fork('place', ra, pa));
      if (!discs) continue;
      const problem = layoutProblem(roster, discs);
      if (problem === null) return { roster, discs };
      if (!fallback && problem === 'contrast') fallback = { roster, discs };
    }
  }
  if (fallback) return fallback;
  throw new Error('layout: no valid archipelago (raise LAYOUT.attempts)');
}

/**
 * Layout stage. Every stream is label-forked from `rng` so later stages
 * never shift existing values.
 */
export function generateLayout(rng: Rng, opts: LayoutOptions): Layout {
  const windDir = rng.fork('wind').range(0, TAU);
  if (opts.islands === 1) return { windDir, islands: singleIsland(rng) };
  const { roster, discs } = archipelago(rng);
  const names = nameIslands(
    roster.map((e) => e.archetype),
    rng.fork('names'),
  );
  const islands = roster.map((e, id) => {
    const isl = islandAt(id, e.archetype, discs[id].x, discs[id].z, e.radius);
    isl.name = names[id];
    return isl;
  });
  return { windDir, islands };
}
