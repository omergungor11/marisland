/**
 * Design island plan (M14b §2.6, TASK-367): an art campus in the Mossgrove forest dome.
 * - Atelier Tree landmark on the giant-tree anchor (variant from the theme).
 * - Atelier Glade: mosaic quad + ateliers / gallery pavilions (campus quad, lanes, ring fill).
 * - Sculpture Garden: a levelled meadow clearing ≥ 12 u wide with 3–5 T0 sculptures.
 * - Easel Walk: easels on a stream bank facing the water, joined by a bank path.
 * - Mushroom Grove: a cluster of giant mushrooms in the forest.
 * Every decision draws from forks of `rng`; numbers live in content/themes/design.ts.
 */
import type { Rng } from '../../../core/rng.ts';
import { DESIGN_SITES } from '../../../content/themes/design.ts';
import { THEMES } from '../../../content/themes/index.ts';
import { FLATTEN } from '../../../content/settlements.ts';
import type { IslandData, XZ } from '../../types.ts';
import { heightAt, Zone } from '../../types.ts';
import { forSamplesNearSegment, resample } from '../paths.ts';
import {
  add,
  addPad,
  addShape,
  ang,
  bestSample,
  campusLots,
  campusQuad,
  clear,
  discShape,
  dist,
  landmarkAccess,
  linkLandmark,
  newPlan,
  onLand,
  pushLandmark,
  relief,
  ring,
  unit,
  type SiteCtx,
  type SitePlan,
} from '../sites.ts';
import type { ThemePlanner } from './types.ts';

const S = DESIGN_SITES;

/** A fixture with its own obstacle radius (pushFixture uses FIXTURE_RADIUS, unset for these). */
function fixture(
  ctx: SiteCtx,
  isl: IslandData,
  defId: string,
  p: XZ,
  rotY: number,
  r: number,
): void {
  ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id });
  addShape(ctx, isl, discShape(p.x, p.z, r), true);
}

const pathLink = (plan: SitePlan, pin: XZ): void => {
  plan.links.push({ pin, kind: 'path', done: () => undefined });
};

/** Distance from `p` to the nearest point of a polyline sampled at ≤ 1 u. */
const lineDist = (pts: readonly XZ[], p: XZ): number => {
  let best = Infinity;
  for (const q of pts) best = Math.min(best, dist(p, q));
  return best;
};

/** Sculpture Garden: levelled meadow disc, sculptures on a ring facing its centre. */
function sculptureGarden(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  quad: XZ,
  stream: readonly XZ[],
  rng: Rng,
): XZ | null {
  const C = S.clearing;
  const R = C.radius;
  // one pass: the first relief tier a sample meets dominates its score (= tiered passes)
  const tiers = C.maxRelief;
  const centre = bestSample(ctx, isl, quad, isl.reach, (p, i) => {
    if (ctx.sdf[i] < R + 2) return Infinity;
    const sh = discShape(p.x, p.z, R);
    const r = relief(ctx, sh);
    const tier = tiers.findIndex((m) => r <= m);
    if (tier < 0 || !onLand(ctx, isl, sh, R + 2) || !clear(ctx, isl, sh, C.gap)) return Infinity;
    if (lineDist(stream, p) < R + C.streamClear) return Infinity;
    return tier * 1000 + r + C.quadDistCost * Math.abs(dist(p, quad) - C.quadDist);
  });
  if (!centre) return null;
  const c = centre;
  addShape(ctx, isl, { ...discShape(c.x, c.z, R), tag: 'clearing' }, false);
  addPad(ctx, isl, discShape(c.x, c.z, R), FLATTEN.discMargin);
  // open meadow ground (no forest floor) across the disc
  forSamplesNearSegment(ctx.h, c, c, R + 1, (i) => {
    if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) return;
    const z = ctx.zone[i];
    if (z === Zone.forest || z === Zone.grass || z === Zone.rock) ctx.zone[i] = Zone.meadow;
  });
  const n = rng.int(C.sculptures[0], C.sculptures[1]);
  const kinds = rng.shuffle([...C.kinds]);
  // sculptures on an arc round the centre, open toward the quad: the path walks in through
  // the gap (a closed ring of obstacles would wall the centre off on the 2 u path grid)
  const toQuad = unit(c, quad);
  const gap = (C.entranceDeg * Math.PI) / 180;
  const a0 = ang(toQuad.x, toQuad.z) + gap / 2 + rng.range(-0.1, 0.1);
  for (let k = 0; k < n; k++) {
    const a = a0 + ((k + 0.5) / n) * (Math.PI * 2 - gap);
    const p = add(c, { x: Math.cos(a), z: Math.sin(a) }, R * C.ringFrac);
    const face = unit(p, c);
    fixture(ctx, isl, kinds[k % kinds.length], p, ang(face.x, face.z), 1.6);
  }
  plan.districts.push({
    islandId: isl.id,
    kind: 'sculpture',
    x: c.x,
    z: c.z,
    rotY: 0,
    w: 2 * R,
    d: 2 * R,
  });
  return c;
}

/** Easel Walk: easels on one bank, downstream then upstream of the point nearest `from`. */
function easelWalk(ctx: SiteCtx, isl: IslandData, stream: readonly XZ[], from: XZ, rng: Rng): XZ[] {
  const E = S.easels;
  const pins: XZ[] = [];
  if (stream.length < 3) return pins;
  const want = rng.int(E.count[0], E.count[1]);
  let start = 0;
  for (let k = 1; k < stream.length; k++)
    if (dist(stream[k], from) < dist(stream[start], from)) start = k;
  const order: number[] = [];
  for (let k = Math.max(1, start); k < stream.length - 1; k++) order.push(k);
  for (let k = start - 1; k >= 1; k--) order.push(k);
  const used: XZ[] = [];
  for (const k of order) {
    if (used.length >= want) break;
    const p = stream[k];
    if (used.some((q) => dist(q, p) < E.spacing)) continue;
    const t = unit(stream[k - 1], stream[k + 1]);
    const nrm = { x: -t.z, z: t.x };
    // the bank facing `from` first
    const pref = (from.x - p.x) * nrm.x + (from.z - p.z) * nrm.z >= 0 ? 1 : -1;
    slot: for (const off of E.offsets)
      for (const side of [pref, -pref]) {
        const q = add(p, nrm, side * off);
        const sh = discShape(q.x, q.z, E.radius);
        if (!onLand(ctx, isl, sh, 1.5) || heightAt(ctx.h, q.x, q.z) < 0.6) continue;
        if (lineDist(stream, q) < off - 0.4) continue;
        if (relief(ctx, discShape(q.x, q.z, 1.2)) > E.maxRelief) continue;
        if (!clear(ctx, isl, sh, 0.8)) continue;
        const face = unit(q, p);
        fixture(ctx, isl, 'easel', q, ang(face.x, face.z), E.radius);
        used.push(p);
        pins.push(add(q, face, -E.pinBack));
        break slot;
      }
  }
  return pins;
}

/** Mushroom Grove: giant mushrooms clustered on forest ground away from the other sites. */
function mushroomGrove(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  quad: XZ,
  avoid: readonly XZ[],
  stream: readonly XZ[],
  rng: Rng,
): XZ | null {
  const G = S.grove;
  // tiered: forest ground within the relief cap first, then rougher forest, then any green ground
  const c = bestSample(ctx, isl, quad, isl.reach, (p, i) => {
    const z = ctx.zone[i];
    const green = z === Zone.forest || z === Zone.grass || z === Zone.meadow;
    if (!green || ctx.sdf[i] < G.radius + 2) return Infinity;
    if (dist(p, quad) < G.minSep || avoid.some((q) => dist(p, q) < G.minSep)) return Infinity;
    const sh = discShape(p.x, p.z, G.radius);
    const r = relief(ctx, sh);
    const tier =
      G.maxRelief.findIndex((m) => r <= m) + (z === Zone.forest ? 0 : G.maxRelief.length);
    if (r > G.maxRelief[G.maxRelief.length - 1] || !clear(ctx, isl, sh, 1)) return Infinity;
    if (lineDist(stream, p) < G.radius + 2) return Infinity;
    return tier * 1000 + r + 0.05 * Math.abs(dist(p, quad) - G.quadDist);
  });
  if (!c) return null;
  const want = rng.int(G.mushrooms[0], G.mushrooms[1]);
  const cand = rng.shuffle(ring(c, 1.5, G.radius - 1, 1.2, 10, rng.range(0, 1)));
  const placed: XZ[] = [];
  for (const p of cand) {
    if (placed.length >= want) break;
    if (placed.some((q) => dist(q, p) < G.spacing)) continue;
    const sh = discShape(p.x, p.z, G.mushroomR);
    if (!onLand(ctx, isl, sh, 2) || !clear(ctx, isl, sh, 0.4)) continue;
    fixture(ctx, isl, 'giantMushroom', p, rng.range(0, Math.PI * 2), G.mushroomR);
    placed.push(p);
  }
  if (placed.length === 0) return null;
  plan.districts.push({
    islandId: isl.id,
    kind: 'garden',
    x: c.x,
    z: c.z,
    rotY: 0,
    w: 2 * G.radius,
    d: 2 * G.radius,
  });
  return c;
}

export const planDesign: ThemePlanner = ({ ctx, isl, rng, sIdx }) => {
  const theme = THEMES[isl.theme];
  // landmarks on their anchors (the Atelier Tree); the plan needs the tree
  const lms: number[] = [];
  for (const key of Object.keys(theme.landmarks).sort()) {
    const a = isl.anchors[key];
    if (a) lms.push(pushLandmark(ctx, isl, theme.landmarks[key].kind, a, a.rotY));
  }
  const treeAnchor = isl.anchors.giantTree;
  if (!treeAnchor || lms.length === 0) return null;
  const ti = lms[0];
  const plan = newPlan('campus', treeAnchor);
  plan.landmarks.push(...lms);
  plan.hub = landmarkAccess(ctx, ti, { x: isl.cx, z: isl.cz });

  const stream = resample(ctx.streams.find((s) => s.islandId === isl.id)?.points ?? [], 1, false);
  // Atelier Glade: the mosaic quad first, then the other sites, then the lots around the quad
  const quad = campusQuad(ctx, isl, plan, S.glade);
  const centre = quad ?? plan.hub;
  if (quad)
    plan.districts.push({
      islandId: isl.id,
      kind: 'quad',
      x: quad.x,
      z: quad.z,
      rotY: 0,
      w: 2 * S.glade.quadR,
      d: 2 * S.glade.quadR,
    });
  const garden = sculptureGarden(ctx, isl, plan, centre, stream, rng.fork('sculptures'));
  const easelPins = easelWalk(ctx, isl, stream, centre, rng.fork('easels'));
  const grove = mushroomGrove(
    ctx,
    isl,
    plan,
    centre,
    garden ? [garden, treeAnchor] : [treeAnchor],
    stream,
    rng.fork('grove'),
  );
  campusLots(ctx, isl, plan, S.glade, rng.fork('glade'), sIdx, quad);
  // connections: the tree, the garden centre, the bank path (in order along the stream), the grove
  linkLandmark(ctx, plan, ti, centre);
  if (garden) pathLink(plan, garden);
  for (const p of easelPins) pathLink(plan, p);
  if (grove) pathLink(plan, grove);
  return plan;
};
