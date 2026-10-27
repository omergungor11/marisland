/**
 * QA Customs Port placement (M30 TASK-508, D-087; kit TASK-506, D-086): a compact quay on Palmlagoon's lee
 * cove terrace with the quay crane (customsYard v1, facing the water), one inspection line (v2) behind
 * the quay edge, an optional container stack (v4), the scanner arch (Q8) over the ship lane and two or
 * three quarantine pontoons (Q9) in the cove. The ship the movers sail (render/culture-movers.ts) uses the
 * dredged berth, the spin spot and the lane laid out by gen/customs-port.ts.
 *
 * Planned before the pier: `customsCandidates` ranks the spots (pure, nothing is changed), the island
 * plan asks `findDock` for a pier that keeps off a candidate's water and takes the first that has one,
 * then `commitCustomsPort` places it. Island anchors: `customs` (crane x / z / rotY), `customsFlip`
 * (z = lane side sl), `customsLane` (x = the lane variant). Numbers: CUSTOMS_PORT.
 */
import { CUSTOMS_PORT as C } from '../../../content/themes/qa-customs.ts';
import { DOCK } from '../../../content/settlements.ts';
import type { IslandData, XZ } from '../../types.ts';
import { heightAt } from '../../types.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
import {
  fixtureRot,
  frameToWorld,
  pathAt,
  portLayout,
  waterProbes,
  type PortLayout,
  type PortSpec,
} from '../customs-port.ts';
import {
  addPad,
  addShape,
  carveWater,
  clear,
  discShape,
  dist,
  onLand,
  rectShape,
  relief,
  sdfAt,
  type Shape,
  type SiteCtx,
} from '../sites.ts';

export interface PortCandidate {
  /** Crane origin (world) and fixture turn. */
  o: XZ;
  rotY: number;
  spec: PortSpec;
  score: number;
  /** Index of the PASSES entry that found it (0 = the cove, 2 = the last resort). */
  pass: number;
}

interface Pass {
  /** Search radius round the harbour anchor (u). */
  radius: number;
  relief: number;
  gap: number;
  /** Landing pontoon: deepest allowed seabed and least shore distance. */
  pontoon: { y: number; sd: number };
}

const PASSES: readonly Pass[] = [
  { radius: 40, relief: C.strip.relief, gap: 1.5, pontoon: { y: -0.45, sd: 4.2 } },
  { radius: 140, relief: C.strip.relief + 0.8, gap: 0.8, pontoon: { y: -0.45, sd: 4.2 } },
  // last resort (a small or crooked cove): a pontoon closer in, the whole rim, the roughest pad
  { radius: 140, relief: C.strip.relief + 1.8, gap: 0.5, pontoon: { y: -0.2, sd: 3.2 } },
];

/** Strip shape of a port at origin `o` turned `rotY` (crane frame -> world). */
function stripShape(o: XZ, rotY: number): Shape {
  const c = frameToWorld(o.x, o.z, rotY, C.strip.x, C.strip.z);
  return rectShape(c.x, c.z, rotY, C.strip.w, C.strip.d);
}

/** Score of a candidate port (lower is better), or Infinity when it does not fit. */
function evaluate(
  ctx: SiteCtx,
  isl: IslandData,
  o: XZ,
  rotY: number,
  spec: PortSpec,
  pass: Pass,
): number {
  const strip = stripShape(o, rotY);
  if (!onLand(ctx, isl, strip, C.strip.minShore)) return Infinity;
  const rl = relief(ctx, strip);
  if (rl > pass.relief || !clear(ctx, isl, strip, pass.gap)) return Infinity;
  const lay = portLayout(spec);
  const w = (p: XZ): XZ => frameToWorld(o.x, o.z, rotY, p.x, p.z);
  // the water the ship uses: open water, off other land (boat routes keep out of it:
  // RouteInput.keepOut)
  for (const pr of waterProbes(lay)) {
    const q = w(pr);
    const y = heightAt(ctx.h, q.x, q.z);
    const sd = -sdfAt(ctx, q.x, q.z);
    if (pr.kind === 'near') {
      // the dredge deepens a shallow berth: it only has to be water
      if (y > -0.02 || sd < 0.5) return Infinity;
    } else if (pr.kind === 'ring') {
      if (y > -0.02 || sd < 0.5) return Infinity;
    } else if (pr.kind === 'spot') {
      if (y > -0.3 || sd < C.spotClear) return Infinity;
    } else {
      if (y > -0.3 || sd < pr.r * 0.6 + C.landGap) return Infinity;
    }
  }
  // the landing pontoon is required; the others are optional (checked again when placing)
  if (!pontoonFits(ctx, w(lay.pontoons[0]), pass.pontoon)) return Infinity;
  return rl * 2 + spec.lane * 6;
}

function pontoonFits(ctx: SiteCtx, q: XZ, lim: Pass['pontoon'] = PASSES[0].pontoon): boolean {
  return heightAt(ctx.h, q.x, q.z) <= lim.y && -sdfAt(ctx, q.x, q.z) >= lim.sd;
}

/**
 * Ranked candidate ports near `near` (the harbour anchor): the first pass with any fit, best first,
 * at most `limit`. Pure: nothing is placed. Candidates are scanned in grid order.
 */
export function customsCandidates(
  ctx: SiteCtx,
  isl: IslandData,
  near: XZ,
  limit = 8,
): PortCandidate[] {
  for (let passIdx = 0; passIdx < PASSES.length; passIdx++) {
    const pass = PASSES[passIdx];
    const out: PortCandidate[] = [];
    const R = pass.radius;
    const [x0, x1] = gridRange(near.x - R, near.x + R);
    const [z0, z1] = gridRange(near.z - R, near.z + R);
    for (let iz = Math.max(2, z0); iz <= z1; iz++)
      for (let ix = Math.max(2, x0); ix <= x1; ix++) {
        const i = iz * ctx.n + ix;
        if (ctx.islandMap[i] !== isl.id + 1) continue;
        const sd = ctx.sdf[i];
        if (sd <= 0 || sd > 2.5) continue;
        const p = { x: cellX(ix), z: cellZ(iz) };
        if (dist(p, near) > R) continue;
        // shore normal over +-4 u (the SDF gradient), seaward
        const g = DOCK.normalSpan;
        const gx = sdfAt(ctx, p.x + g, p.z) - sdfAt(ctx, p.x - g, p.z);
        const gz = sdfAt(ctx, p.x, p.z + g) - sdfAt(ctx, p.x, p.z - g);
        const gl = Math.hypot(gx, gz);
        if (gl < 1e-3) continue;
        const d = { x: -gx / gl, z: -gz / gl };
        // the crane stands `shoreZ` back from the waterline
        const o = { x: p.x + d.x * (sd - C.shoreZ), z: p.z + d.z * (sd - C.shoreZ) };
        const rotY = Math.atan2(d.z, d.x);
        for (const sl of [1, -1] as const)
          for (let lane = 0; lane < C.lanes.length; lane++) {
            const spec: PortSpec = { sl, lane };
            const score = evaluate(ctx, isl, o, rotY, spec, pass) + 0.12 * dist(o, near);
            if (score < Infinity) out.push({ o, rotY, spec, score, pass: passIdx });
          }
      }
    if (out.length) {
      // distinct spots first: the best of each crane origin, then best score
      out.sort((a, b) => a.score - b.score);
      const seen: XZ[] = [];
      const top: PortCandidate[] = [];
      for (const c of out) {
        if (seen.some((q) => dist(q, c.o) < 6)) continue;
        seen.push(c.o);
        top.push(c);
        if (top.length >= limit) break;
      }
      return top;
    }
  }
  return [];
}

/** Shapes a pier must keep off for candidate `c` (the quay strip, the turn-around spot, the lane). */
export function customsAvoid(c: PortCandidate): Shape[] {
  const lay = portLayout(c.spec);
  const w = (p: XZ): XZ => frameToWorld(c.o.x, c.o.z, c.rotY, p.x, p.z);
  const out: Shape[] = [stripShape(c.o, c.rotY)];
  const s = w(lay.spot);
  out.push(discShape(s.x, s.z, 10.5));
  const a = { x: 0, z: 0, hx: 0, hz: 0 };
  for (let d = 5; d <= lay.path.length; d += 5) {
    const q = w(pathAt(lay.path, d, a));
    out.push(discShape(q.x, q.z, 5));
  }
  for (const p of lay.pontoons.slice(0, 2)) {
    const q = w(p);
    out.push(discShape(q.x, q.z, 3.6));
  }
  return out;
}

/** Place the chosen port: fixtures, shapes, the level pad, the dredged water, the island anchors. */
export function commitCustomsPort(ctx: SiteCtx, isl: IslandData, c: PortCandidate): PortLayout {
  const { o, rotY, spec } = c;
  const layout = portLayout(spec);
  const strip = stripShape(o, rotY);
  const w = (p: XZ): XZ => frameToWorld(o.x, o.z, rotY, p.x, p.z);
  const push = (defId: string, p: XZ, turn: number, variant: number): void => {
    ctx.fixtures.push({
      defId,
      x: p.x,
      z: p.z,
      rotY: fixtureRot(rotY, turn),
      islandId: isl.id,
      variant,
    });
  };
  // quay: one blocking shape and one level pad for the crane and the line
  addShape(ctx, isl, strip, true);
  addPad(ctx, isl, strip, C.strip.pad);
  push('customsYard', o, 0, 1);
  push('customsYard', w(layout.ok), layout.ok.turn, layout.ok.variant);
  // an optional container stack where it fits (it hides the crates the line clears)
  for (const st of C.stacks) {
    const q = w({ x: st.x, z: st.z });
    const sh = rectShape(q.x, q.z, rotY, st.w, st.d);
    if (!onLand(ctx, isl, sh, 1) || relief(ctx, sh) > C.stackRelief || !clear(ctx, isl, sh, 0.4))
      continue;
    push('customsYard', q, 0, st.variant);
    addShape(ctx, isl, sh, true);
    addPad(ctx, isl, sh, C.strip.pad);
    break;
  }
  // the water: arch over the lane, pontoons (the landing one always, the others where they fit)
  push('scannerArch', w(layout.arch), layout.arch.turn, 0);
  layout.pontoons.forEach((pt, k) => {
    const q = w(pt);
    if (k > 0 && !pontoonFits(ctx, q, PASSES[2].pontoon)) return;
    push('quarantinePontoon', q, pt.turn, pt.variant);
    addShape(ctx, isl, discShape(q.x, q.z, 3.6), false);
  });
  // the ship's water stays free of later pieces (stilt lab, buoys) and is dredged for the hull
  const spot = w(layout.spot);
  addShape(ctx, isl, discShape(spot.x, spot.z, 10.5), false);
  const berth = w(layout.berth);
  addShape(ctx, isl, discShape(berth.x, berth.z, 5), false);
  const p = layout.path;
  const a = { x: 0, z: 0, hx: 0, hz: 0 };
  let prev = spot;
  for (let d = 5; d <= p.length + 4.9; d += 5) {
    const q = w(pathAt(p, Math.min(d, p.length), a));
    carveWater(ctx, prev, q, C.carveCore, C.carveFall, C.carveDepth);
    if (d % 10 < 5) addShape(ctx, isl, discShape(q.x, q.z, 5), false);
    prev = q;
  }
  carveWater(ctx, spot, spot, 9.5, 2.2, C.carveDepth);
  const e0 = w({ x: layout.berth.x - 9.5, z: layout.berth.z });
  const e1 = w({ x: layout.berth.x + 9.5, z: layout.berth.z });
  carveWater(ctx, e0, e1, C.carveCore, C.carveFall, C.carveDepth);
  carveWater(ctx, berth, spot, C.carveCore, C.carveFall, C.carveDepth);
  isl.anchors.customs = { x: o.x, z: o.z, rotY };
  isl.anchors.customsFlip = { x: 1, z: spec.sl, rotY: 0 };
  isl.anchors.customsLane = { x: spec.lane, z: c.pass, rotY: 0 };
  return layout;
}
