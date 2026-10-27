/**
 * HQ yacht marina and star fort (M29 TASK-505, D-081 / D-085; hq-design.md H9 / H10 / H11 / H18):
 * a post-route stage like the seamarks, because the ferry route decides where the water is free.
 * Pure data, numbers in content/themes/hq-marina.ts (HQ_MARINA).
 *
 * 1. Spines: from the ferry pier root the shore contour `offshore` u out to sea is walked (SDF
 *    iso-line) in both directions, `maxLen` u or until the heading has turned `maxTurn` degrees, the
 *    contour turns its back on the cove (a horn's tip) or the water leaves the depth window. The
 *    direction whose end is nearer the ferry stop (the horn at the cove mouth) is the main spine,
 *    the other one the second comb. Each is smoothed and carries spine pieces (`marinaPier` v2).
 * 2. Fort: the star fort stands just seaward of the main spine's end, on the horn's tip; its
 *    landing (local +z) faces the pier.
 * 3. Comb: a finger pier (v0, else the short v1) leaves a spine every `pitch` u, seaward, where the
 *    water holds (depth window, clear of the routes, the ferry pier and the fort).
 * 4. Berths: a boat each side of a finger every `berths.pitch` u (sailboat variants 6 / 7 sloops,
 *    8 tender, 0 / 1 the old sloops), `min`–`max` in all; every fixture floats (FLOATING_FIXTURES).
 * 5. Breakwater: an arm of `marinaPier` v3 pieces and a v4 head (green harbour light) from the fort
 *    towards the pier side, bent as little as the routes allow; the fort carries the red light.
 * 6. Gates (H11): 4 pairs of red / green `buoy` fixtures along the HQ ferry route round its stop;
 *    the stop's neighbourhood is reserved so the generic seamarks leave it alone.
 */
import type { Rng } from '../../core/rng.ts';
import { DOCK } from '../../content/settlements.ts';
import { HQ_MARINA as M, MARINA_PIER_V as PV } from '../../content/themes/hq-marina.ts';
import type { DockData, FixtureData, Heightfield, IslandData, Polyline, XZ } from '../types.ts';
import { heightAt, sampleGrid } from '../types.ts';
import { discShape, type Shape } from './sites.ts';

export interface MarinaInput {
  h: Heightfield;
  sdf: Float32Array;
  islands: readonly IslandData[];
  docks: readonly DockData[];
  routes: readonly Polyline[];
}

export interface MarinaResult {
  fixtures: FixtureData[];
  /** Blocking shapes for the scatter (the fort's horn). */
  shapes: Shape[];
  /** Circles the generic seamarks keep out of (the HQ ferry stop's channel). */
  reserved: { x: number; z: number; r: number }[];
  /** The boats among `fixtures` (count), for tests. */
  boats: number;
}

interface Spine {
  pts: XZ[];
  len: number;
  at: (s: number) => { p: XZ; t: XZ };
}

const DEG = Math.PI / 180;
const EMPTY: MarinaResult = { fixtures: [], shapes: [], reserved: [], boats: 0 };
const dist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);
const headingOf = (dx: number, dz: number): number => Math.atan2(dz, dx);

/** Distance from p to the segment a-b. */
function segDist(p: XZ, a: XZ, b: XZ): number {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const l2 = vx * vx + vz * vz || 1;
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2));
  return Math.hypot(p.x - (a.x + vx * t), p.z - (a.z + vz * t));
}

const arcOf = (pts: readonly XZ[]): number =>
  pts.reduce((s, q, i) => s + (i ? dist(q, pts[i - 1]) : 0), 0);

/** A smoothed polyline with arc-length lookup. */
function makeSpine(raw: XZ[]): Spine {
  let sp = raw.slice();
  for (let pass = 0; pass < M.spine.smooth; pass++) {
    const prev = sp;
    sp = prev.map((q, i) =>
      i === 0 || i === prev.length - 1
        ? q
        : {
            x: (prev[i - 1].x + 2 * q.x + prev[i + 1].x) / 4,
            z: (prev[i - 1].z + 2 * q.z + prev[i + 1].z) / 4,
          },
    );
  }
  const len = arcOf(sp);
  const at = (s: number): { p: XZ; t: XZ } => {
    let acc = 0;
    for (let i = 1; i < sp.length; i++) {
      const d = dist(sp[i], sp[i - 1]);
      if (acc + d >= s || i === sp.length - 1) {
        const f = d > 0 ? Math.min(1, Math.max(0, (s - acc) / d)) : 0;
        return {
          p: {
            x: sp[i - 1].x + (sp[i].x - sp[i - 1].x) * f,
            z: sp[i - 1].z + (sp[i].z - sp[i - 1].z) * f,
          },
          t: { x: (sp[i].x - sp[i - 1].x) / (d || 1), z: (sp[i].z - sp[i - 1].z) / (d || 1) },
        };
      }
      acc += d;
    }
    return { p: sp[sp.length - 1], t: { x: 1, z: 0 } };
  };
  return { pts: sp, len, at };
}

export function placeMarina(input: MarinaInput, rng: Rng): MarinaResult {
  const { h, sdf, islands, docks, routes } = input;
  const hq = islands.find((i) => i.theme === 'hq');
  if (!hq) return EMPTY;
  const dockIdx = docks.findIndex((d) => d.islandId === hq.id);
  if (dockIdx < 0) return EMPTY;
  const dock = docks[dockIdx];
  const dir = { x: Math.cos(dock.rotY), z: Math.sin(dock.rotY) };
  const root: XZ = { x: dock.x, z: dock.z };
  const L = dock.segments * DOCK.segment;
  const pierEnd: XZ = { x: root.x + dir.x * L, z: root.z + dir.z * L };

  const depthAt = (p: XZ): number => -heightAt(h, p.x, p.z);
  const sdfAt = (p: XZ): number => sampleGrid(h, sdf, p.x, p.z, -999);
  /** Unit gradient of the SDF (points inland). */
  const gradAt = (p: XZ): XZ => {
    const e = 1.5;
    const gx = sdfAt({ x: p.x + e, z: p.z }) - sdfAt({ x: p.x - e, z: p.z });
    const gz = sdfAt({ x: p.x, z: p.z + e }) - sdfAt({ x: p.x, z: p.z - e });
    const l = Math.hypot(gx, gz);
    return l < 1e-4 ? { x: 0, z: 0 } : { x: gx / l, z: gz / l };
  };

  // ---- ferry routes of HQ's pier and their stop (the cove mouth)
  const ferries = routes.filter((r) => r.kind === 'ferry' && r.stops?.includes(dockIdx));
  const stopOf = (r: Polyline): { i: number; p: XZ } => {
    let best = 0;
    r.points.forEach((p, i) => {
      if (dist(p, pierEnd) < dist(r.points[best], pierEnd)) best = i;
    });
    return { i: best, p: r.points[best] };
  };
  const stop: XZ | null = ferries.length > 0 ? stopOf(ferries[0]).p : null;
  const routeClear = (p: XZ, clear: number): boolean =>
    routes.every((r) =>
      r.points.every(
        (q) => Math.abs(q.x - p.x) > clear || Math.abs(q.z - p.z) > clear || dist(p, q) >= clear,
      ),
    );

  // ---- 1. spines: the contour `offshore` u off the shore, walked away from the pier
  const S = M.spine;
  const D = M.depth;
  let p0: XZ | null = null;
  for (let t = 0; t <= 16 && !p0; t += 0.5) {
    const p = { x: root.x + dir.x * t, z: root.z + dir.z * t };
    if (sdfAt(p) <= -S.offshore) p0 = p;
  }
  if (!p0) return EMPTY;
  const walk = (sign: 1 | -1): XZ[] => {
    let p = p0 as XZ;
    const rec: XZ[] = [];
    let travelled = 0;
    let turn = 0;
    let prev: XZ | null = null;
    for (let i = 0; i < ((S.pierGap + S.maxLen) / S.step) * 1.4; i++) {
      const g = gradAt(p);
      if (g.x === 0 && g.z === 0) break;
      const t = { x: -g.z * sign, z: g.x * sign };
      if (prev) turn += Math.atan2(prev.x * t.z - prev.z * t.x, prev.x * t.x + prev.z * t.z);
      prev = t;
      if (Math.abs(turn) > S.maxTurn * DEG) break;
      let q = { x: p.x + t.x * S.step, z: p.z + t.z * S.step };
      for (let k = 0; k < 2; k++) {
        const gq = gradAt(q);
        const d = sdfAt(q) + S.offshore;
        q = { x: q.x - gq.x * d, z: q.z - gq.z * d };
      }
      // the contour has turned its back on the cove (a horn's tip): the spine ends there
      const gc = gradAt(q);
      const vx = pierEnd.x - q.x;
      const vz = pierEnd.z - q.z;
      if (-(gc.x * vx + gc.z * vz) < -0.1 * Math.hypot(vx, vz)) break;
      const dp = depthAt(q);
      if (dp < D.min || dp > D.finger + 0.8) break;
      travelled += dist(p, q);
      p = q;
      if (travelled >= S.pierGap) rec.push(q);
      if (travelled >= S.pierGap + S.maxLen) break;
    }
    return rec;
  };
  const walks = ([1, -1] as const).map((s) => walk(s)).filter((c) => arcOf(c) >= S.minLen);
  if (walks.length === 0) return EMPTY;
  // the main spine ends nearest the cove mouth (the ferry stop); without a stop the longer one
  walks.sort((a, b) =>
    stop ? dist(a[a.length - 1], stop) - dist(b[b.length - 1], stop) : arcOf(b) - arcOf(a),
  );
  const spines = walks.map(makeSpine);
  const main = spines[0];

  const out: FixtureData[] = [];
  const push = (defId: string, p: XZ, rotY: number, variant: number): void => {
    out.push({ defId, x: p.x, z: p.z, rotY, islandId: hq.id, variant });
  };

  // ---- 2. fort: on the horn's tip, just seaward of the main spine's end
  const F = M.fort;
  const end = main.pts[main.pts.length - 1];
  const gEnd = gradAt(end);
  let fort: XZ | null = null;
  for (let shift = F.seaward; shift >= 0 && !fort; shift -= 0.75) {
    const c = { x: end.x - gEnd.x * shift, z: end.z - gEnd.z * shift };
    if (depthAt(c) <= D.mole - 1 && routeClear(c, F.clearRoute)) fort = c;
  }
  const shapes: Shape[] = [];
  if (fort) {
    // the landing faces the pier (local +z), where the marina is
    push('starFort', fort, headingOf(pierEnd.x - fort.x, pierEnd.z - fort.z), 0);
    shapes.push(discShape(fort.x, fort.z, F.keepOut));
  }
  const fortFree = (p: XZ, clear: number): boolean => !fort || dist(p, fort) >= clear;

  // ---- spine pieces and 3. comb fingers
  const FG = M.fingers;
  const fingers: { root: XZ; n: XZ; len: number }[] = [];
  for (const sp of spines) {
    const pieces = Math.floor(sp.len / S.piece);
    for (let i = 0; i < pieces; i++) {
      const a = sp.at(i * S.piece).p;
      const b = sp.at((i + 1) * S.piece).p;
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      if (!fortFree(mid, F.keepOut + 1)) continue;
      push('marinaPier', mid, headingOf(b.x - a.x, b.z - a.z), PV.spine);
    }
    let made = 0;
    for (
      let s = FG.first;
      s <= sp.len - 2 && made < FG.max && fingers.length < FG.total;
      s += FG.pitch
    ) {
      const { p } = sp.at(s);
      const g = gradAt(p);
      if (g.x === 0 && g.z === 0) continue;
      const n = { x: -g.x, z: -g.z };
      const r0 = { x: p.x + n.x * FG.rootOff, z: p.z + n.z * FG.rootOff };
      for (const [flen, variant] of FG.lengths) {
        let good = true;
        for (let t = 1; t <= flen + 1 && good; t += 1) {
          const q = { x: r0.x + n.x * t, z: r0.z + n.z * t };
          const dp = depthAt(q);
          good =
            dp >= D.min &&
            dp <= D.finger &&
            segDist(q, root, pierEnd) >= FG.pierClear &&
            routeClear(q, FG.routeClear) &&
            fortFree(q, F.keepOut + 1.5) &&
            fingers.every(
              (f) =>
                segDist(q, f.root, { x: f.root.x + f.n.x * f.len, z: f.root.z + f.n.z * f.len }) >=
                FG.apart,
            );
        }
        const tipP = { x: r0.x + n.x * flen, z: r0.z + n.z * flen };
        if (!good || sdfAt(tipP) > -FG.tipShore) continue;
        fingers.push({ root: r0, n, len: flen });
        push('marinaPier', r0, headingOf(n.x, n.z), variant);
        made++;
        break;
      }
    }
  }

  // ---- 4. breakwater arm from the fort towards the pier side (its lee side carries berths too)
  const moleSlots: { p: XZ; yaw: number }[] = [];
  if (fort) {
    const MO = M.mole;
    const hd = { x: -gEnd.x, z: -gEnd.z };
    const toPier = Math.atan2(pierEnd.z - fort.z, pierEnd.x - fort.x);
    const a0 = Math.atan2(hd.z, hd.x);
    let delta = toPier - a0;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta <= -Math.PI) delta += 2 * Math.PI;
    const sgn = delta >= 0 ? 1 : -1;
    let placed = false;
    for (const bend of MO.bends) {
      for (const total of MO.lengths) {
        if (placed) break;
        const a = a0 + sgn * Math.min(Math.abs(delta), bend * DEG);
        const d = { x: Math.cos(a), z: Math.sin(a) };
        const A = { x: fort.x + d.x * MO.from, z: fort.z + d.z * MO.from };
        let good = true;
        for (let t = 0; t <= total && good; t += MO.step) {
          const q = { x: A.x + d.x * t, z: A.z + d.z * t };
          const dp = depthAt(q);
          good =
            dp >= -0.4 &&
            dp <= D.mole &&
            routeClear(q, MO.routeClear) &&
            (!stop || dist(q, stop) >= MO.stopClear) &&
            fingers.every(
              (f) =>
                segDist(q, f.root, { x: f.root.x + f.n.x * f.len, z: f.root.z + f.n.z * f.len }) >=
                MO.fingerClear,
            ) &&
            segDist(q, root, pierEnd) >= MO.pierClear;
        }
        if (!good) continue;
        const n = Math.max(0, Math.floor((total - 5.6) / 8));
        for (let i = 0; i < n; i++)
          push(
            'marinaPier',
            { x: A.x + d.x * (4 + 8 * i), z: A.z + d.z * (4 + 8 * i) },
            a,
            PV.mole,
          );
        const head = 8 * n + 2.5;
        push('marinaPier', { x: A.x + d.x * head, z: A.z + d.z * head }, a, PV.moleHead);
        placed = true;
        // berths along the arm's lee side (the pier's side), parallel to it
        const perp = { x: -d.z, z: d.x };
        const lee = perp.x * (pierEnd.x - A.x) + perp.z * (pierEnd.z - A.z) >= 0 ? 1 : -1;
        for (let t = MO.berthFirst; t + 2.6 < 8 * n + 1; t += MO.berthPitch)
          moleSlots.push({
            p: {
              x: A.x + d.x * t + perp.x * lee * MO.berthSide,
              z: A.z + d.z * t + perp.z * lee * MO.berthSide,
            },
            yaw: a,
          });
      }
      if (placed) break;
    }
  }

  // ---- 5. berths
  const B = M.berths;
  const bRng = rng.fork('boats');
  const mixTotal = B.mix.reduce((a, [, w]) => a + w, 0);
  const pickVariant = (): number => {
    let t = bRng.next() * mixTotal;
    for (const [v, w] of B.mix) {
      t -= w;
      if (t < 0) return v;
    }
    return B.mix[0][0];
  };
  interface Slot {
    p: XZ;
    yaw: number;
    keep: boolean;
    variant: number;
    /** Priority: 0 finger sides, 1 tenders, 2 breakwater, 3 spines. */
    group: number;
  }
  const slots: Slot[] = [];
  for (const f of fingers) {
    const perp = { x: -f.n.z, z: f.n.x };
    for (let a = B.first; a + 2.0 <= f.len + 1.4; a += B.pitch)
      for (const side of [1, -1]) {
        const along = a + bRng.range(-B.alongJit, B.alongJit);
        const p = {
          x: f.root.x + f.n.x * along + perp.x * side * B.side,
          z: f.root.z + f.n.z * along + perp.z * side * B.side,
        };
        const fwd = bRng.chance(0.7) ? 1 : -1;
        const yaw = headingOf(f.n.x * fwd, f.n.z * fwd) + bRng.range(-B.yawJit, B.yawJit);
        // every roll is made for every slot (a fixed stream), whether or not it fits
        const keep = bRng.chance(B.fill);
        const variant = pickVariant();
        const fits = [-2.2, 0, 2.2].every(
          (d) => depthAt({ x: p.x + f.n.x * d, z: p.z + f.n.z * d }) >= D.min,
        );
        if (fits) slots.push({ p, yaw, keep, variant, group: 0 });
      }
  }
  // a tender at the end of every finger, bow on, and the berths along the breakwater
  for (const f of fingers) {
    const p = {
      x: f.root.x + f.n.x * (f.len + B.tenderBeyond),
      z: f.root.z + f.n.z * (f.len + B.tenderBeyond),
    };
    const keep = bRng.chance(B.fill);
    if (depthAt(p) >= D.min)
      slots.push({ p, yaw: headingOf(f.n.x, f.n.z), keep, variant: B.tender, group: 1 });
  }
  for (const m of moleSlots) {
    const keep = bRng.chance(B.fill);
    const variant = pickVariant();
    if (depthAt(m.p) >= D.min && fortFree(m.p, F.keepOut))
      slots.push({ p: m.p, yaw: m.yaw, keep, variant, group: 2 });
  }
  // boats alongside the spines' seaward edge, between the fingers
  for (const sp of spines)
    for (let t = B.spineFirst; t <= sp.len - 2; t += B.spinePitch) {
      const { p, t: tan } = sp.at(t);
      const g = gradAt(p);
      if (g.x === 0 && g.z === 0) continue;
      const pos = { x: p.x - g.x * B.spineSide, z: p.z - g.z * B.spineSide };
      const keep = bRng.chance(B.fill);
      const variant = pickVariant();
      const yaw = headingOf(tan.x, tan.z) + (bRng.chance(0.5) ? 0 : Math.PI);
      const clear =
        depthAt(pos) >= D.min &&
        fortFree(pos, F.keepOut) &&
        routeClear(pos, B.routeClear) &&
        fingers.every(
          (f) =>
            segDist(pos, f.root, { x: f.root.x + f.n.x * f.len, z: f.root.z + f.n.z * f.len }) >=
            B.fingerClear,
        );
      if (clear) slots.push({ p: pos, yaw, keep, variant, group: 3 });
    }
  // no two boats closer than `sep` (priority order: finger sides, tenders, breakwater, spines)
  const placedSlots: Slot[] = [];
  for (const s of slots) if (placedSlots.every((o) => dist(o.p, s.p) >= B.sep)) placedSlots.push(s);
  // top up to `min` (first skipped slots), then thin to `max` (seeded, the lowest-priority groups first)
  let kept = placedSlots.filter((s) => s.keep).length;
  for (const s of placedSlots) {
    if (s.keep || kept >= B.min) continue;
    s.keep = true;
    kept++;
  }
  for (let g = 3; g >= 0 && kept > B.max; g--) {
    const idx = placedSlots.map((s, i) => (s.keep && s.group === g ? i : -1)).filter((i) => i >= 0);
    for (const i of bRng.shuffle(idx)) {
      if (kept <= B.max) break;
      placedSlots[i].keep = false;
      kept--;
    }
  }
  let boats = 0;
  for (const s of placedSlots)
    if (s.keep) {
      push('sailboat', s.p, s.yaw, s.variant);
      boats++;
    }

  // ---- 6. H11 gates round the HQ ferry stop
  const G = M.gates;
  const reserved: MarinaResult['reserved'] = [];
  if (ferries.length > 0 && stop) {
    reserved.push({ x: stop.x, z: stop.z, r: G.reserve });
    const r = ferries[0];
    const pts = r.points;
    const arcs = new Float64Array(pts.length + 1);
    for (let i = 0; i < pts.length; i++)
      arcs[i + 1] = arcs[i] + dist(pts[i], pts[(i + 1) % pts.length]);
    const total = arcs[pts.length];
    const s0 = arcs[stopOf(r).i];
    for (const off of G.arcs) {
      const s = (((s0 + off) % total) + total) % total;
      let seg = 0;
      while (seg < pts.length - 1 && arcs[seg + 1] < s) seg++;
      const p0 = pts[seg];
      const p1 = pts[(seg + 1) % pts.length];
      const l = arcs[seg + 1] - arcs[seg] || 1;
      const f = (s - arcs[seg]) / l;
      const c = { x: p0.x + (p1.x - p0.x) * f, z: p0.z + (p1.z - p0.z) * f };
      const tx = (p1.x - p0.x) / l;
      const tz = (p1.z - p0.z) / l;
      const port = { x: c.x + tz * G.lateral, z: c.z - tx * G.lateral };
      const star = { x: c.x - tz * G.lateral, z: c.z + tx * G.lateral };
      const wet = (q: XZ): boolean => depthAt(q) >= G.minDepth && sdfAt(q) <= -G.minShore;
      if (!wet(port) || !wet(star)) continue;
      const rot = bRng.range(0, Math.PI * 2);
      push('buoy', port, rot, G.port);
      push('buoy', star, rot, G.starboard);
    }
  }
  return { fixtures: out, shapes, reserved, boats };
}
