/**
 * Sea-top fun park life plan (M53 TASK-672, D-172). Pure data: no three.js, no clock, no
 * `Math.random`; every choice is a hash of (world seed, slot). The park's anchors
 * (world/gen/plans/marketing-luna.ts) become `TableauBot`s of the Workers kind, exactly as the
 * marina town does (marina-world.ts): strollers on a closed-form walk round the `lunaStroll` loop,
 * browsers at the `lunaStall*` spots and a greeter inside the gate. Tableau bots are placed at a
 * fixed y and never consult the fixture mask, so the gangway's `dock` pieces (0.9 fixture radius)
 * cannot block them. Numbers: content/life-luna.ts.
 */
import { LUNA_LIFE as L, lunaCounts } from '../content/life-luna.ts';
import { unitHash } from '../core/hash.ts';
import type { WorldData } from '../world/types.ts';
import { strollAt, type StrollPose, type StrollRoute } from './marina-world.ts';
import type { TableauBot } from './workers-world.ts';

const SALT = 0x6c6e;

type Anchors = WorldData['islands'][number]['anchors'];
type Leg = StrollRoute['legs'][number];
type Shift = readonly [number, number];

export interface LunaPlan {
  island: number;
  /** Deck centre (world xz, y = plank top) the camera focus is measured from. */
  centre: { x: number; y: number; z: number };
  bots: TableauBot[];
  strollers: number;
  browsers: number;
  gate: number;
}

const heading = (dx: number, dz: number): number => Math.atan2(dz, dx);

/** The anchors `key0, key1, …` of an island, in order. */
function listOf(A: Anchors, key: string): Anchors[string][] {
  const out: Anchors[string][] = [];
  for (let k = 0; A[`${key}${k}`]; k++) out.push(A[`${key}${k}`]);
  return out;
}

/** The park of `world` for an ambient scale (null: no sea-top fun park in this world). */
export function planLuna(
  world: Pick<WorldData, 'islands' | 'seed'>,
  scale: number,
): LunaPlan | null {
  const island = world.islands.findIndex((i) => i.anchors.lunaDeck && i.anchors.lunaStroll0);
  if (island < 0) return null;
  const A = world.islands[island].anchors;
  const deck = A.lunaDeck;
  const y = A.lunaStroll0.y ?? A.carnivalDeck?.y ?? 0;
  const seed = world.seed;
  const counts = lunaCounts(scale);
  const hash = (i: number, salt: number): number => unitHash(seed ^ SALT, i, salt);
  const shiftOf = (list: readonly Shift[], rank: number, i: number): Shift => {
    const s = list[rank % list.length];
    return [s[0] + L.jitter * (2 * hash(i, 31) - 1), s[1] + L.jitter * (2 * hash(i, 32) - 1)];
  };
  const bots: TableauBot[] = [];
  const base = { island, item: undefined } as const;
  let group = 6000;

  // ---- strollers: the closed loop, doubled so a leg may run past the seam in either direction
  const loop = listOf(A, 'lunaStroll');
  const K = loop.length;
  const nPts = 2 * K + 1;
  const lx = new Float32Array(nPts);
  const lz = new Float32Array(nPts);
  const cum = new Float32Array(nPts);
  for (let k = 0; k < nPts; k++) {
    const p = loop[k % K];
    lx[k] = p.x;
    lz[k] = p.z;
    if (k > 0) cum[k] = cum[k - 1] + Math.hypot(lx[k] - lx[k - 1], lz[k] - lz[k - 1]);
  }
  const total = cum[K];
  const at = (s: number): { x: number; z: number } => {
    const f = ((s % total) + total) % total;
    let k = 0;
    while (k < K - 1 && cum[k + 1] <= f) k++;
    const len = Math.max(1e-6, cum[k + 1] - cum[k]);
    const u = (f - cum[k]) / len;
    return { x: lx[k] + (lx[k + 1] - lx[k]) * u, z: lz[k] + (lz[k + 1] - lz[k]) * u };
  };
  const nStops = Math.max(3, Math.round(total / L.stroll.stopEvery));
  const stopS: number[] = [];
  for (let k = 0; k < nStops; k++)
    stopS.push(((k + 0.5 + 0.3 * (hash(k, 40) - 0.5)) / nStops) * total);
  const lookAt = (s: number, i: number): number => {
    const p = at(s);
    return heading(deck.x - p.x, deck.z - p.z) + L.stroll.lookYaw * (2 * hash(i, 43) - 1);
  };
  for (let i = 0; i < counts.strollers; i++) {
    const mine = stopS.filter((_, k) => hash(i * 64 + k, 51) < 0.7);
    if (mine.length < 2) mine.splice(0, mine.length, stopS[0], stopS[Math.floor(nStops / 2)]);
    const rev = i % 2 === 1;
    const speed = L.stroll.speed * (1 + L.stroll.speedJitter * (2 * hash(i, 52) - 1));
    // one lap in stop order from a hashed first stop; odd strollers go the other way round
    const r = Math.floor(hash(i, 56) * mine.length);
    const ord = mine.map((_, j) => mine[(j + r) % mine.length]);
    if (rev) ord.reverse();
    const legs: Leg[] = [];
    let t = 0;
    // arc positions on the doubled lane: forward legs climb from s0 to s1 > s0, reverse legs descend
    let s0 = rev ? ord[0] + total : ord[0];
    for (let j = 0; j < ord.length; j++) {
      const b = ord[(j + 1) % ord.length];
      let s1 = b + (rev ? total : 0);
      if (rev) while (s1 >= s0) s1 -= total;
      else while (s1 <= s0) s1 += total;
      const walk = Math.abs(s1 - s0) / speed;
      const pause =
        (L.stroll.pause[0] + (L.stroll.pause[1] - L.stroll.pause[0]) * hash(i * 64 + j, 53)) *
        (1 + L.stroll.pauseJitter * (2 * hash(i * 64 + j, 54) - 1));
      legs.push({ t0: t, tw: t + walk, t1: t + walk + pause, s0, s1, face: lookAt(b, i * 64 + j) });
      t += walk + pause;
      s0 = s1;
    }
    const route: StrollRoute = { x: lx, z: lz, cum, legs, cycle: t };
    const offset = hash(i, 55) * t;
    const bot: TableauBot = {
      ...base,
      kind: 'lunaStroll',
      x: 0,
      z: 0,
      y,
      hd: 0,
      pose: 'stand',
      group: group++,
      k: 0,
      town: { shift: shiftOf(L.shifts.stroller, i, i), offset, route },
      site: 'luna',
    };
    const p0 = strollAt(route, offset, { x: 0, z: 0, hd: 0, moving: false } as StrollPose);
    bot.x = p0.x;
    bot.z = p0.z;
    bot.hd = p0.hd;
    bots.push(bot);
  }

  // ---- browsers at the stand fronts (booth, carts, prize stall), in a hashed order
  const stalls = listOf(A, 'lunaStall')
    .map((s, k) => ({ s, k, pri: hash(k, 61) }))
    .sort((p, q) => p.pri - q.pri)
    .slice(0, counts.browsers);
  const B = L.browser;
  stalls.forEach(({ s, k }, rank) => {
    bots.push({
      ...base,
      kind: 'lunaBrowser',
      x: s.x,
      z: s.z,
      y,
      hd: s.rotY,
      pose: B.poses[0],
      beats: {
        cycle: B.cycle,
        steps: [
          { to: B.gaze, pose: B.poses[0] },
          { to: B.cycle, pose: B.poses[1] },
        ],
      },
      group: group++,
      k: 0,
      town: { shift: shiftOf(L.shifts.browser, rank, 100 + k), offset: hash(k, 62) * B.cycle },
      site: 'luna',
    });
  });

  // ---- the greeter inside the gate, facing the pier, waving at the arrivals
  const gate = A.lunaGate;
  if (gate && counts.gate > 0) {
    const G = L.gate;
    const f = { x: Math.cos(gate.rotY), z: Math.sin(gate.rotY) };
    bots.push({
      ...base,
      kind: 'lunaGate',
      x: gate.x - f.x * G.inset,
      z: gate.z - f.z * G.inset,
      y,
      hd: gate.rotY,
      pose: 'stand',
      beats: {
        cycle: G.beat.cycle,
        steps: [
          { to: G.beat.wave[0], pose: 'stand' },
          { to: G.beat.wave[1], pose: G.beat.pose },
          { to: G.beat.cycle, pose: 'stand' },
        ],
      },
      group: group++,
      k: 0,
      town: { shift: shiftOf(L.shifts.gate, 0, 200), offset: hash(0, 63) * G.beat.cycle },
      site: 'luna',
    });
  }

  const strollers = bots.filter((o) => o.kind === 'lunaStroll').length;
  const browsers = bots.filter((o) => o.kind === 'lunaBrowser').length;
  return {
    island,
    centre: { x: deck.x, y, z: deck.z },
    bots,
    strollers,
    browsers,
    gate: bots.length - strollers - browsers,
  };
}
