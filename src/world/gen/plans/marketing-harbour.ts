/**
 * Marketing "Carnival Pier" (M31 TASK-536, D-126): the Marketing instance on the harbour skeleton
 * (harbour.ts). Pure data, no rng. `planCarnivalPier` runs right after the skeleton and reserves the
 * boardwalk, a wing of the pier over the water on its open side (the Rock's cove land is narrow and
 * steep, so everything big stands on piles); `placeCarnivalKit` runs in the plan's `finish`.
 * Numbers: content/themes/marketing-harbour.ts.
 *
 * Anchor contract (world u; rotY = xz heading (cos, sin); `y` = world height):
 * - `carnivalDeck` + `carnivalDeckSize`: the wing's centre, rotY = the pier heading, y = deck height;
 *   size { x: width across the pier, z: depth along it }. Missing when it does not fit (0 / 32 seeds,
 *   plans-marketing-harbour.test): the pier keeps its arches and cannons, no wheel or screen.
 * - `carnivalWheel`: the small wheel's pivot on the planks; `carnivalScreen`: the WELCOME screen's
 *   pivot on the planks, front to the sea.
 * - `carnivalCannon0` / `carnivalCannon1`: the confetti cannons on the T crossbar, rotY = barrel heading.
 * `harbourBooth` is the island's own megaphone kiosk (marketing.ts `placeKiosk`): it sells the tickets.
 */
import { CARNIVAL_PIER as K } from '../../../content/themes/marketing-harbour.ts';
import { DOCK } from '../../../content/settlements.ts';
import { heightAt, type IslandData, type XZ } from '../../types.ts';
import { addShape, clear, rectShape, shapeDist, type SiteCtx } from '../sites.ts';
import { framePoint, harbourParams, type Harbour } from './harbour.ts';
import * as dm from '../../../core/math/dmath.ts';

/** The boardwalk a seed got: `sea` = its sea edge along the pier (u from the root). */
export interface CarnivalPier {
  hb: Harbour;
  deck: { sea: number } | null;
}

function publish(isl: IslandData, key: string, p: XZ, rotY: number, y?: number): void {
  isl.anchors[key] = y === undefined ? { x: p.x, z: p.z, rotY } : { x: p.x, z: p.z, rotY, y };
}

/** Plan the boardwalk off the pier's open side, nearest the head where it fits. */
export function planCarnivalPier(ctx: SiteCtx, hb: Harbour): CarnivalPier {
  const D = K.deck;
  const L = hb.site.segments * DOCK.segment;
  const seaMax = L - hb.P.pier.head.d / 2 - D.headGap;
  for (let slide = 0; slide <= D.slide + 1e-6; slide += D.step) {
    const sea = seaMax - slide;
    const c = framePoint(hb, sea - D.d / 2, -(D.pierHalf + D.w / 2));
    const sh = rectShape(c.x, c.z, hb.rotY, D.w, D.d);
    if (sea - D.d < 0 || !wet(ctx, hb, sea) || !clear(ctx, hb.isl, sh, D.gap)) continue;
    addShape(ctx, hb.isl, sh, false);
    publish(hb.isl, 'carnivalDeck', c, hb.rotY, hb.P.kit.deckY);
    publish(hb.isl, 'carnivalDeckSize', { x: D.w, z: D.d }, 0);
    return { hb, deck: { sea } };
  }
  return { hb, deck: null };
}

/** The seabed (or land) stays under `maxGround` on the whole wing, sampled every u. */
function wet(ctx: SiteCtx, hb: Harbour, sea: number): boolean {
  for (let u = sea - K.deck.d; u <= sea + 1e-6; u += 1)
    for (let v = 0; v <= K.deck.w + 1e-6; v += 1) {
      const p = framePoint(hb, u, -(K.deck.pierHalf + v));
      if (heightAt(ctx.h, p.x, p.z) > K.deck.maxGround) return false;
    }
  return true;
}

/** The kit on the final anchors: deck, arches, wheel, screen, lanterns, cannons. */
export function placeCarnivalKit(ctx: SiteCtx, pier: CarnivalPier): void {
  const { hb, deck } = pier;
  const { isl, P } = hb;
  const y = P.kit.deckY;
  const fix = (
    defId: string,
    p: XZ,
    variant: number,
    fy: number,
    rotY = hb.rotY,
    scale?: number,
  ): void => {
    ctx.fixtures.push({
      defId,
      x: p.x,
      z: p.z,
      rotY,
      islandId: isl.id,
      variant,
      y: fy,
      ...(scale === undefined ? {} : { scale }),
    });
  };
  const L = hb.site.segments * DOCK.segment;
  const A = K.arch;
  for (let k = A.pierFrom; k < hb.site.segments; k += A.pierEvery)
    fix('bunting', framePoint(hb, k * DOCK.segment + DOCK.segment / 2, 0), A.variant, y);
  // the cannons on the crossbar, barrels splayed out over the ferry's bow
  const C = K.cannon;
  [-1, 1].forEach((s, k) => {
    const p = framePoint(hb, L + C.u, s * C.v);
    const rot = hb.rotY - hb.sigma * s * C.splay;
    publish(isl, `carnivalCannon${k}`, p, rot, y + P.kit.head.lift);
    fix('confettiCannon', p, C.variant, y + P.kit.head.lift, rot);
  });
  const [hu, hv] = K.lantern.head;
  for (const s of [-1, 1])
    fix('lanternPost', framePoint(hb, L + hu, s * hv), K.lantern.variant, y + P.kit.head.lift);
  if (!deck) return;
  const D = K.deck;
  const w = D.w;
  const d = D.d;
  fix('sailboat', framePoint(hb, deck.sea - d / 2, -(D.pierHalf + w / 2)), D.variant, 0);
  const far = D.pierHalf + w;
  const W = K.wheel;
  const wheel = framePoint(hb, deck.sea - d / 2, -(far - W.out));
  publish(isl, 'carnivalWheel', wheel, hb.rotY, y);
  fix('ferrisWheel', wheel, 0, y, hb.rotY, W.scale);
  const S = K.screen;
  const p = framePoint(hb, deck.sea - d + S.back, -(D.pierHalf + S.out));
  publish(isl, 'carnivalScreen', p, hb.rotY, y);
  fix('billboardV2', p, S.variant, y);
  // arches across the deck, lanterns on its sea edge (both clear of the screen's face)
  for (const at of A.deckAt)
    fix(
      'bunting',
      framePoint(hb, deck.sea - d / 2, -(far - at)),
      A.variant,
      y,
      hb.rotY + Math.PI / 2,
      A.deckScale,
    );
  for (const at of K.lantern.at)
    fix(
      'lanternPost',
      framePoint(hb, deck.sea - K.lantern.inset, -(far - at)),
      K.lantern.variant,
      y,
    );
}

/** Boat-route keep-out discs along the boardwalk (world/index.ts). */
export function carnivalKeepOut(
  islands: readonly IslandData[],
): { x: number; z: number; r: number; hard: number }[] {
  const out: { x: number; z: number; r: number; hard: number }[] = [];
  for (const isl of islands) {
    const c = isl.anchors.carnivalDeck;
    const size = isl.anchors.carnivalDeckSize;
    const hard = harbourParams(isl.theme)?.keepOut.hard;
    // (TASK-671: the fun park's platform is lunaKeepOut's)
    if (!c || !size || hard === undefined || isl.anchors.lunaDeck) continue;
    const side = { x: dm.sin(c.rotY), z: -dm.cos(c.rotY) };
    const n = Math.ceil(size.x / size.z);
    for (let k = 0; k < n; k++) {
      const t = ((k + 0.5) / n - 0.5) * size.x;
      out.push({
        x: c.x + side.x * t,
        z: c.z + side.z * t,
        r: Math.max(size.z, size.x / n) * 0.75 + K.deck.keepOut,
        hard,
      });
    }
  }
  return out;
}

/** Distance (u) from `p` to the reserved boardwalk rect of `isl` (Infinity without one). */
export function carnivalDeckDist(isl: IslandData, p: XZ): number {
  const c = isl.anchors.carnivalDeck;
  const size = isl.anchors.carnivalDeckSize;
  if (!c || !size) return Infinity;
  return shapeDist(rectShape(c.x, c.z, c.rotY, size.x, size.z), p.x, p.z);
}
