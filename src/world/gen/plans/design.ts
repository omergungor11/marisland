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
import { DESIGN_CULTURE_SITE as C } from '../../../content/cultures/design.ts';
import { FIXTURE_RADIUS, FLATTEN, PATHS } from '../../../content/settlements.ts';
import type { IslandData, StorySpot, XZ } from '../../types.ts';
import { heightAt, Zone } from '../../types.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
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
  dirOf,
  discShape,
  dist,
  landmarkAccess,
  linkLandmark,
  newPlan,
  onIsland,
  onLand,
  pushLandmark,
  rectShape,
  sdfAt,
  relief,
  ring,
  shapeDist,
  shapesOverlap,
  unit,
  type Shape,
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
  // Glass & Light culture (M19 TASK-425): after the lots, before the links (paths route round it)
  plan.stories = glassAndLight(ctx, isl, plan, rng.fork('culture'), {
    quad,
    centre,
    garden,
    grove,
    stream,
    tree: ctx.landmarks[ti],
  });
  // connections: the tree, the garden centre, the bank path (in order along the stream), the grove
  linkLandmark(ctx, plan, ti, centre);
  if (garden) pathLink(plan, garden);
  for (const p of easelPins) pathLink(plan, p);
  if (grove) pathLink(plan, grove);
  return plan;
};

// ---------------------------------------------------------------------------
// Glass & Light Studio (M19 TASK-425, ISLAND_CULTURES §2.6)

interface GlassSite {
  quad: XZ | null;
  /** Quad centre (or the hub when no quad fits). */
  centre: XZ;
  garden: XZ | null;
  grove: XZ | null;
  stream: readonly XZ[];
  tree: XZ;
}

/** Point at (x, z) in the frame of a prop at `p` with yaw `rotY` (local +z = dirOf(rotY)). */
const local = (p: XZ, rotY: number, x: number, z: number): XZ => ({
  x: p.x + Math.sin(rotY) * x + Math.cos(rotY) * z,
  z: p.z - Math.cos(rotY) * x + Math.sin(rotY) * z,
});

/** No obstacle within `gap` (shapes tagged in `skip` ignored) and off the lane lines. */
function freeOf(
  ctx: SiteCtx,
  isl: IslandData,
  sh: Shape,
  gap: number,
  skip: readonly string[] = [],
): boolean {
  for (const o of ctx.shapes[isl.id]) {
    if (o.tag && skip.includes(o.tag)) continue;
    if (shapesOverlap(o, sh, gap)) return false;
  }
  for (const lane of ctx.lanes[isl.id])
    for (const p of lane) if (shapeDist(sh, p.x, p.z) < PATHS.halfWidth + 0.4) return false;
  return true;
}

/** Paint the island's land cells inside `sh` with `zone` (the hot shop's terrazzo yard). */
function paintZone(ctx: SiteCtx, isl: IslandData, sh: Shape, zone: number): void {
  const R = Math.hypot(sh.hw, sh.hd) + 1;
  const [x0, x1] = gridRange(sh.x - R, sh.x + R);
  const [z0, z1] = gridRange(sh.z - R, sh.z + R);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) continue;
      if (shapeDist(sh, cellX(ix), cellZ(iz)) <= 0) ctx.zone[i] = zone;
    }
}

/**
 * The Glass & Light kit round the Atelier Glade: the hot shop (workshop heart) on the quad's lee
 * rim with its clutter, the gather ring, prisms between the garden sculptures (each with its
 * caustic), stained screens between the easels, orbs and caustics on the lawns, glass chime lines
 * across the lanes, the glass-roof gallery, one rainbow over a glade, and the story spots. Numbers
 * in DESIGN_CULTURE_SITE; one rng sub-fork per kit piece / story.
 */
function glassAndLight(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  rng: Rng,
  s: GlassSite,
): StorySpot[] {
  const stories: StorySpot[] = [];
  const story = (kind: string, p: XZ, rotY: number, defs: readonly string[], y = 0): void => {
    stories.push({ kind, islandId: isl.id, pos: { x: p.x, y, z: p.z }, rotY, defs });
  };
  const place = (defId: string, p: XZ, rotY: number, variant: number, pad = true): void => {
    ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id, variant });
    const r = FIXTURE_RADIUS[defId];
    addShape(ctx, isl, discShape(p.x, p.z, r), true);
    if (pad) addPad(ctx, isl, discShape(p.x, p.z, r + 0.2), FLATTEN.discMargin);
  };
  /** Flat light patch: walkable (not path-blocking), but nothing grows or stands on it. */
  const caustic = (p: XZ, rotY: number, variant: number): void => {
    ctx.fixtures.push({ defId: 'causticDecal', x: p.x, z: p.z, rotY, islandId: isl.id, variant });
    addShape(ctx, isl, discShape(p.x, p.z, 0.55), false);
    addPad(ctx, isl, discShape(p.x, p.z, 0.6), FLATTEN.discMargin);
  };
  /** Small-prop site: on land, high enough, gentle, free. */
  const fits = (
    p: XZ,
    r: number,
    gap: number = C.gap,
    skip: readonly string[] = [],
    maxRelief: number = C.smallRelief,
  ): boolean => {
    const sh = discShape(p.x, p.z, r);
    return (
      onLand(ctx, isl, sh, 1.5) &&
      heightAt(ctx.h, p.x, p.z) >= C.minY &&
      relief(ctx, sh) <= maxRelief &&
      freeOf(ctx, isl, sh, gap, skip)
    );
  };
  const qR = s.quad ? S.glade.quadR : 0;
  const qc = s.centre;
  /** First ring candidate round `c` (radii r0..r1, nearest first) passing `ok`. */
  const firstOnRing = (
    c: XZ,
    r0: number,
    r1: number,
    rr: Rng,
    ok: (p: XZ) => boolean,
  ): XZ | null => {
    for (const p of ring(c, r0, r1, 1, 20, rr.range(0, 1))) if (ok(p)) return p;
    return null;
  };
  const isLawn = (p: XZ): boolean => {
    const ix = Math.round((p.x - ctx.h.originX) / ctx.h.cellSize);
    const iz = Math.round((p.z - ctx.h.originZ) / ctx.h.cellSize);
    const z = ctx.zone[iz * ctx.n + ix];
    return z === Zone.grass || z === Zone.meadow;
  };

  // ---- the gallery: the pavilion lot nearest the quad gets the faceted glass roof
  const pavilions = ctx.lots
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.islandId === isl.id && l.defId === 'galleryPavilion');
  if (pavilions.length) {
    const g = pavilions.reduce((a, b) => (dist(b.l, qc) < dist(a.l, qc) ? b : a));
    ctx.lots[g.i].pin = C.glassPavilionVariant;
  }

  // ---- the hot shop on the quad rim, the lee side first (its smoke drifts off the glade)
  const H = C.hotShop;
  const hr = rng.fork('kit', 0);
  const lee = dirOf(ctx.windDir);
  let shop: { p: XZ; rotY: number } | null = null;
  const shopCand = ring(qc, qR + H.ring[0], qR + H.ring[1], H.step, H.samples, hr.range(0, 1));
  for (const maxRel of H.maxRelief) {
    let bs = Infinity;
    for (const p of shopCand) {
      const toQ = unit(p, qc);
      const rotY = ang(toQ.x, toQ.z);
      const yc = local(p, rotY, 0, H.yardZ);
      const yard = rectShape(yc.x, yc.z, rotY, H.core[0], H.core[1]);
      if (!onLand(ctx, isl, yard, 2) || relief(ctx, yard) > maxRel) continue;
      if (!clear(ctx, isl, yard, H.gap) || lineDist(s.stream, p) < H.yard[0] / 2 + 1) continue;
      const out = unit(qc, p);
      const sc =
        H.distCost * (dist(p, qc) - qR) + (H.leeCost * (1 - (out.x * lee.x + out.z * lee.z))) / 2;
      if (sc < bs) {
        bs = sc;
        shop = { p, rotY };
      }
    }
    if (shop) break;
  }
  let shopP: XZ | null = null;
  if (shop) {
    const { p, rotY } = shop;
    shopP = p;
    const yc = local(p, rotY, 0, H.yardZ);
    const yard = rectShape(yc.x, yc.z, rotY, H.core[0], H.core[1]);
    const heat = hr.int(0, 2);
    ctx.fixtures.push({ defId: 'hotShop', x: p.x, z: p.z, rotY, islandId: isl.id, variant: heat });
    addShape(ctx, isl, rectShape(p.x, p.z, rotY, H.rect[0], H.rect[1]), true);
    addPad(ctx, isl, yard, FLATTEN.discMargin);
    paintZone(ctx, isl, yard, Zone.plaza);
    // workshop clutter: blowpipe rack by the furnace, the seconds shelf by the annealer, crates
    const W = C.workshop;
    const at = (xz: readonly number[]): XZ => local(p, rotY, xz[0], xz[1]);
    /** A clutter slot beside the shop: on land, gentle, touching nothing. */
    const slot = (q: XZ, defId: string): boolean => fits(q, FIXTURE_RADIUS[defId], 0.05);
    /** First free slot of `slots` for `defId`: its position and yaw. */
    const firstSlot = (slots: readonly (readonly number[])[], defId: string) => {
      for (const xz of slots) {
        const q = at(xz);
        if (slot(q, defId)) return { q, yaw: rotY + (xz[2] ? Math.PI : 0) };
      }
      return null;
    };
    const rack = firstSlot(W.blowpipeRack, 'blowpipeRack');
    if (rack) place('blowpipeRack', rack.q, rack.yaw, 0);
    const shelf = firstSlot(W.seconds, 'sampleShelf');
    if (shelf) {
      place('sampleShelf', shelf.q, shelf.yaw, W.secondsVariant);
      story('secondsGull', shelf.q, shelf.yaw, ['sampleShelf'], C.secondsGullY);
    }
    const hues = hr.shuffle([0, 1, 2, 3, 4]);
    const nc = hr.int(W.culletCount[0], W.culletCount[1]);
    W.cullet.slice(0, nc).forEach((xz, k) => {
      const q = at(xz);
      if (slot(q, 'culletCrate')) place('culletCrate', q, rotY + hr.range(-0.4, 0.4), hues[k]);
    });
    const cat = C.annealerCat;
    story('annealerCat', local(p, rotY, cat[0], cat[2]), rotY, ['hotShop'], cat[1]);
    const gaffer = local(p, rotY, C.gaffer[0], C.gaffer[2]);
    story('gafferTurn', gaffer, rotY + Math.PI, ['hotShop', 'blowpipeRack']);
    pathLink(plan, local(p, rotY, 0, H.rect[1] / 2 + 2));
  }

  // ---- the gather ring (critique / demonstration circle) on the glade rim, apart from the shop
  const G = C.gather;
  const gr = rng.fork('kit', 3);
  const gR = FIXTURE_RADIUS.gatherRing;
  const gatherOk = (p: XZ): boolean => {
    if (shopP && dist(p, shopP) < G.shopDist) return false;
    const sh = discShape(p.x, p.z, gR + 0.6);
    return (
      onLand(ctx, isl, sh, 2) &&
      heightAt(ctx.h, p.x, p.z) >= C.minY &&
      relief(ctx, sh) <= G.maxRelief &&
      clear(ctx, isl, sh, 0.6)
    );
  };
  // on the glade rim, else just outside the sculpture garden
  const R7 = S.clearing.radius;
  const gp =
    firstOnRing(qc, qR + G.ring[0], qR + G.ring[1], gr, gatherOk) ??
    (s.garden ? firstOnRing(s.garden, R7 + 2, R7 + 10, gr, gatherOk) : null);
  if (gp) {
    place('gatherRing', gp, gr.range(0, Math.PI * 2), 0, false);
    addPad(ctx, isl, discShape(gp.x, gp.z, gR + 0.6), FLATTEN.discMargin);
    story('critique', gp, ang(qc.x - gp.x, qc.z - gp.z), ['gatherRing']);
    pathLink(plan, add(gp, unit(gp, qc), gR + 1));
  }

  // ---- prisms between the garden's sculptures (each throws a caustic toward the centre)
  const P = C.prisms;
  const pr = rng.fork('kit', 1);
  const wantPrisms = pr.int(P.count[0], P.count[1]);
  const prisms: { decal: XZ; toC: XZ }[] = [];
  const addPrism = (p: XZ, c: XZ): void => {
    const toC = unit(p, c);
    const v = pr.int(0, 2);
    place('prismSculpture', p, ang(toC.x, toC.z), v);
    const decal = add(p, toC, P.caustic);
    caustic(decal, ang(toC.x, toC.z) + Math.PI / 2, P.causticOf[v]);
    prisms.push({ decal, toC });
  };
  if (s.garden) {
    const g = s.garden;
    const R = S.clearing.radius;
    const kinds: readonly string[] = S.clearing.kinds;
    const sculpt = ctx.fixtures
      .filter((f) => f.islandId === isl.id && kinds.includes(f.defId) && dist(f, g) <= R)
      .map((f) => Math.atan2(f.z - g.z, f.x - g.x))
      .sort((a, b) => a - b);
    // internal gaps: every gap between neighbours but the widest (the entrance toward the quad)
    const gaps = sculpt.map((a, k) => {
      const b = k + 1 < sculpt.length ? sculpt[k + 1] : sculpt[0] + Math.PI * 2;
      return { mid: (a + b) / 2, w: b - a };
    });
    const widest = gaps.reduce((m, x, k) => (x.w > gaps[m].w ? k : m), 0);
    const inner = pr.shuffle(gaps.filter((_, k) => k !== widest));
    for (const gap of inner) {
      if (prisms.length >= wantPrisms) break;
      for (const f of P.ringFrac) {
        const p = add(g, dirOf(gap.mid), R * f);
        // inside the clearing pad (levelled later): no relief cap
        if (!fits(p, FIXTURE_RADIUS.prismSculpture, 0.3, ['clearing'], Infinity)) continue;
        addPrism(p, g);
        break;
      }
    }
  }
  // fallback: just outside the garden, then round the quad (prism + its caustic need the room)
  const prismRings: [XZ | null, number, number][] = [
    [s.garden, S.clearing.radius + P.outRing[0], S.clearing.radius + P.outRing[1]],
    [qc, qR + P.quadRing[0], qR + P.quadRing[1]],
  ];
  for (const [c, r0, r1] of prismRings)
    while (c && prisms.length < wantPrisms) {
      const p = firstOnRing(c, r0, r1, pr, (q) =>
        fits(q, FIXTURE_RADIUS.prismSculpture + P.caustic, C.gap, [], P.outRelief),
      );
      if (!p) break;
      addPrism(p, c);
    }
  if (prisms.length) {
    // the bot with a small prism and its mini rainbow, past the first prism's caustic
    const f = prisms[0];
    story('prismRainbow', add(f.decal, f.toC, C.prismBot), ang(-f.toC.x, -f.toC.z), [
      'prismSculpture',
      'causticDecal',
    ]);
  }

  // ---- stained screens between the easels along the walk, faces alternating east / west
  const SC = C.screens;
  const sr = rng.fork('kit', 2);
  const wantScreens = sr.int(SC.count[0], SC.count[1]);
  const screens: XZ[] = [];
  const sR = FIXTURE_RADIUS.stainedScreen;
  const addScreen = (p: XZ): void => {
    const rotY = (screens.length % 2 ? Math.PI : 0) + sr.range(-0.3, 0.3);
    place('stainedScreen', p, rotY, sr.int(0, 1));
    screens.push(p);
  };
  const nearestK = (p: XZ): number => {
    let best = 0;
    for (let k = 1; k < s.stream.length; k++)
      if (dist(s.stream[k], p) < dist(s.stream[best], p)) best = k;
    return best;
  };
  const easels = ctx.fixtures
    .filter((f) => f.islandId === isl.id && f.defId === 'easel')
    .map((f) => ({ p: { x: f.x, z: f.z }, k: nearestK(f) }))
    .sort((a, b) => a.k - b.k);
  for (let e = 0; e + 1 < easels.length && screens.length < wantScreens; e++) {
    const a = easels[e].p;
    const b = easels[e + 1].p;
    if (dist(a, b) > SC.maxPair || s.stream.length === 0) continue;
    const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const ts = unit(m, s.stream[nearestK(m)]);
    for (const off of [0.6, 0, 1.2]) {
      const p = add(m, ts, off);
      if (lineDist(s.stream, p) < sR + 0.8 || !fits(p, sR, 0.4, [], SC.maxRelief)) continue;
      addScreen(p);
      break;
    }
  }
  // fallback: round the garden edge, then the quad
  const fallbacks: [XZ | null, number][] = [
    [s.garden, S.clearing.radius],
    [qc, qR],
  ];
  for (const [c, r0] of fallbacks) {
    while (c && screens.length < wantScreens) {
      const p = firstOnRing(
        c,
        r0 + SC.ring[0],
        r0 + SC.ring[1],
        sr,
        (q) => screens.every((o) => dist(o, q) > 3) && fits(q, sR + 0.6, C.gap, [], SC.maxRelief),
      );
      if (!p) break;
      addScreen(p);
    }
  }

  // ---- glass orbs on the glade lawns, each with its own caustic
  const O = C.orbs;
  const or = rng.fork('kit', 5);
  const wantOrbs = or.int(O.count[0], O.count[1]);
  const orbs: XZ[] = [];
  for (const p of ring(qc, qR + O.ring[0], qR + O.ring[1], 1.5, 20, or.range(0, 1))) {
    if (orbs.length >= wantOrbs) break;
    if (orbs.some((q) => dist(q, p) < O.spacing) || !isLawn(p)) continue;
    if (!fits(p, FIXTURE_RADIUS.glassOrb + 1.0)) continue;
    const v = or.int(0, 2);
    place('glassOrb', p, or.range(0, Math.PI * 2), v);
    const a = or.range(0, Math.PI * 2);
    caustic(add(p, dirOf(a), 0.95), a + Math.PI / 2, O.causticOf[v]);
    orbs.push(p);
  }

  // ---- the bot holding a vase to the sun over one big amber caustic
  const V = C.vase;
  const vr = rng.fork('story', 4);
  const vp = firstOnRing(
    qc,
    qR + V.ring[0],
    qR + V.ring[1],
    vr,
    (p) => isLawn(p) && fits(p, 1.6, C.gap, [], V.maxRelief),
  );
  if (vp) {
    const a = vr.range(0, Math.PI * 2);
    caustic(add(vp, dirOf(a), V.caustic), a + Math.PI / 2, V.causticVariant);
    story('vaseToSun', vp, a, ['causticDecal']);
    // the bot's spot: walkable, but kept clear of the later kit
    addShape(ctx, isl, discShape(vp.x, vp.z, 0.6), false);
  }

  // ---- shards sorted in rainbow order: a cullet crate, the five caustics in hue order
  const SH = C.shards;
  const shr = rng.fork('story', 3);
  const rowLen = SH.first + 4 * SH.spacing + 0.5;
  let shards: { p: XZ; rotY: number } | null = null;
  // beside the hot shop, else on the glade rim; the row runs outward
  const phase = shr.range(0, 1);
  const shardRings: [XZ | null, number][] = [
    [shopP, SH.shopR],
    [qc, qR + 1],
  ];
  for (const [c, r0] of shardRings) {
    if (!c || shards) continue;
    for (const p of ring(c, r0 + SH.ring[0], r0 + SH.ring[1], 1, 16, phase)) {
      const d = unit(c, p);
      const rotY = ang(d.x, d.z);
      const mid = add(p, d, rowLen / 2 - 0.4);
      const strip = rectShape(mid.x, mid.z, rotY, 1.4, rowLen + 0.8);
      if (!onLand(ctx, isl, strip, 1.5) || relief(ctx, strip) > SH.maxRelief) continue;
      if (heightAt(ctx.h, p.x, p.z) < C.minY || !freeOf(ctx, isl, strip, 0.3)) continue;
      shards = { p, rotY };
      break;
    }
  }
  if (shards) {
    const { p, rotY } = shards;
    const d = dirOf(rotY);
    const mid = add(p, d, rowLen / 2 - 0.4);
    addPad(ctx, isl, rectShape(mid.x, mid.z, rotY, 1.4, rowLen + 0.8), FLATTEN.discMargin);
    place('culletCrate', p, rotY + 0.7, shr.int(0, 4));
    for (let k = 0; k < 5; k++) caustic(add(p, d, SH.first + k * SH.spacing), rotY, k);
    story('rainbowShards', add(p, d, SH.first + 2 * SH.spacing), rotY, [
      'culletCrate',
      'causticDecal',
    ]);
  }

  // ---- the fox staring at an orb at the forest edge (round the mushroom grove, else the garden)
  const F = C.foxOrb;
  const fr = rng.fork('story', 2);
  let fox: { p: XZ; c: XZ } | null = null;
  const foxRings: [XZ | null, number][] = [
    [s.grove, 0],
    [s.garden, S.clearing.radius - F.ring[0] + 2],
    [qc, qR + 4],
  ];
  for (const [fc, r0] of foxRings) {
    if (!fc || fox) continue;
    const p = firstOnRing(fc, r0 + F.ring[0], r0 + F.ring[1], fr, (q) => {
      if (!fits(q, FIXTURE_RADIUS.glassOrb + 0.2)) return false;
      return fits(add(q, unit(fc, q), F.fox), 0.5, 0.2);
    });
    if (p) fox = { p, c: fc };
  }
  if (fox) {
    place('glassOrb', fox.p, fr.range(0, Math.PI * 2), F.orbVariant);
    const out = unit(fox.c, fox.p);
    story('foxOrb', add(fox.p, out, F.fox), ang(-out.x, -out.z), ['glassOrb']);
  }

  // ---- glass chime lines (bunting v3) across the glade lanes, poles off the lane
  const CH = C.chimes;
  const cr = rng.fork('kit', 6);
  const wantChimes = cr.int(CH.count[0], CH.count[1]);
  const lines: XZ[] = [];
  const pole = (q: XZ): boolean =>
    onIsland(ctx, isl, q.x, q.z) &&
    heightAt(ctx.h, q.x, q.z) >= C.minY &&
    freeOf(ctx, isl, discShape(q.x, q.z, CH.poleR), 0.2);
  for (const lane of cr.shuffle([...ctx.lanes[isl.id]])) {
    if (lines.length >= wantChimes) break;
    for (let k = 1; k + 1 < lane.length; k++) {
      const p = lane[k];
      if (dist(p, qc) < qR + CH.start || lines.some((q) => dist(q, p) < CH.spacing)) continue;
      const t = unit(lane[k - 1], lane[k + 1]);
      const nrm = { x: -t.z, z: t.x };
      const a = add(p, nrm, CH.half);
      const b = add(p, nrm, -CH.half);
      if (!pole(a) || !pole(b)) continue;
      if (Math.abs(heightAt(ctx.h, a.x, a.z) - heightAt(ctx.h, b.x, b.z)) > CH.maxStep) continue;
      const rotY = ang(t.x, t.z);
      ctx.fixtures.push({
        defId: 'bunting',
        x: p.x,
        z: p.z,
        rotY,
        islandId: isl.id,
        variant: CH.variant,
      });
      addShape(ctx, isl, discShape(a.x, a.z, CH.poleR), true);
      addShape(ctx, isl, discShape(b.x, b.z, CH.poleR), true);
      addShape(ctx, isl, rectShape(p.x, p.z, rotY, 2 * CH.half, CH.cordDepth), false);
      lines.push(p);
      break;
    }
  }

  // ---- one rainbow in the sea off the bluff foot (the spray rainbow of a waterfall), its plane
  // along the shore, near the stream mouth; pivot at the waterline (FLOATING_FIXTURES)
  const RB = C.rainbow;
  const mouth = s.stream.length
    ? [s.stream[0], s.stream[s.stream.length - 1]].reduce((a, b) =>
        sdfAt(ctx, b.x, b.z) < sdfAt(ctx, a.x, a.z) ? b : a,
      )
    : { x: isl.cx, z: isl.cz };
  const harbour = [
    ...ctx.docks.filter((d) => d.islandId === isl.id),
    ...ctx.moorings.filter((m) => m.islandId === isl.id),
  ];
  /** Lowest point of the arc's underside above `s` along it (0 past the inner band). */
  const under = (t: number): number =>
    Math.abs(t) < RB.inner ? Math.sqrt(RB.inner * RB.inner - t * t) : 0;
  let arc: { c: XZ; th: number } | null = null;
  let as = Infinity;
  const [bx0, bx1] = gridRange(isl.minX - 16, isl.maxX + 16);
  const [bz0, bz1] = gridRange(isl.minZ - 16, isl.maxZ + 16);
  for (let iz = bz0; iz <= bz1; iz += RB.step)
    for (let ix = bx0; ix <= bx1; ix += RB.step) {
      const c = { x: cellX(ix), z: cellZ(iz) };
      const sd = sdfAt(ctx, c.x, c.z);
      if (sd < RB.offshore[0] || sd > RB.offshore[1]) continue;
      if (harbour.some((d) => dist(d, c) < RB.dockClear)) continue;
      for (let k = 0; k < RB.angles; k++) {
        const th = (k / RB.angles) * Math.PI;
        const d = dirOf(th);
        let ok = true;
        for (let t = -RB.half; t <= RB.half + 1e-6 && ok; t += 1) {
          const g = heightAt(ctx.h, c.x + d.x * t, c.z + d.z * t);
          ok = g <= Math.max(RB.legMaxY, under(t) - RB.clearance);
        }
        if (!ok) continue;
        const a = add(c, d, RB.half);
        const b = add(c, d, -RB.half);
        const sc =
          RB.mouthCost * dist(c, mouth) +
          RB.alongCost * Math.abs(sdfAt(ctx, a.x, a.z) - sdfAt(ctx, b.x, b.z));
        if (sc < as) {
          as = sc;
          arc = { c, th };
        }
      }
    }
  if (arc)
    ctx.fixtures.push({
      defId: 'rainbowArc',
      x: arc.c.x,
      z: arc.c.z,
      // local x (the arc's span) along dirOf(th)
      rotY: arc.th + Math.PI / 2,
      islandId: isl.id,
      variant: 0,
    });
  return stories;
}
