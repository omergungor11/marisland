/**
 * Research island plan (Lonely Palm sandbar; M14b §2.7, TASK-368). The legacy outpost stays as
 * it is (palm landmark, message bottle, researchHut off the W9 hero line, telescope, short dock
 * with a rowboat); the theme adds an observatory dome and a weather mast beside the hut, under
 * the same W9 rules so the palm silhouette stays clean. Instrument buoys and starfish come from
 * the theme scatter (content/themes/research.ts).
 */
import { FLATTEN, PATHS, RESEARCH_OUTPOST } from '../../../content/settlements.ts';
import { RESEARCH_SITE } from '../../../content/themes/research.ts';
import type { IslandData, XZ } from '../../types.ts';
import { gridRange } from '../grid.ts';
import {
  addPad,
  addShape,
  ang,
  clear,
  discShape,
  dist,
  dirOf,
  doorOf,
  heroHeading,
  onLand,
  islandWindow,
  nearestPathCell,
  ring,
  unit,
  type SiteCtx,
} from '../sites.ts';
import type { ThemePlanner } from './types.ts';

export const planResearch: ThemePlanner = (a) => {
  const plan = a.legacy();
  const { ctx, isl } = a;
  const palm = isl.anchors.palm;
  const hut = plan && plan.lots.length > 0 ? ctx.lots[plan.lots[0]] : null;
  if (!plan || !hut || !palm) return plan;
  const S = RESEARCH_SITE;
  // camera-controls azimuth → view direction −(sin az, cos az) (as the legacy outpost)
  const az = (heroHeading(isl, ctx.islands) * Math.PI) / 180;
  const view = { x: -Math.sin(az), z: -Math.cos(az) };
  const lineCos = Math.cos((RESEARCH_OUTPOST.viewClearDeg * Math.PI) / 180);
  const door = dirOf(hut.rotY);
  // fixtures block the path grid: each one must leave the door → pier walk open
  const ends = [doorOf(hut), ...plan.docks.map((di) => ctx.docks[di])];
  const walkable = (): boolean => connected(ctx, isl, ends);
  const ok = (p: XZ, r: number): boolean => {
    const u = unit(palm, p);
    if (Math.abs(u.x * view.x + u.z * view.z) >= lineCos) return false;
    if (dist(p, palm) < RESEARCH_OUTPOST.palmClear) return false;
    const h = unit(hut, p);
    if (h.x * door.x + h.z * door.z > S.doorCos) return false;
    const sh = discShape(p.x, p.z, r);
    return onLand(ctx, isl, sh, S.minShore, S.cornerMin) && clear(ctx, isl, sh, S.gap);
  };
  const obs = place(ctx, isl, hut, S.observatory, 'observatory', ok, walkable);
  if (obs) addPad(ctx, isl, discShape(obs.x, obs.z, S.observatory.radius), FLATTEN.discMargin);
  place(ctx, isl, hut, S.weatherMast, 'weatherMast', ok, walkable);
  return plan;
};

/**
 * Nearest spot to the hut on the ring that passes `ok` and keeps `walkable`; pushes the fixture
 * (a spot that would cut the walk is rolled back: shape, blocked cells, fixture).
 */
function place(
  ctx: SiteCtx,
  isl: IslandData,
  hut: XZ,
  spec: { ring: readonly [number, number]; radius: number },
  defId: string,
  ok: (p: XZ, r: number) => boolean,
  walkable: () => boolean,
): XZ | null {
  const r = spec.radius;
  for (const p of ring(hut, spec.ring[0], spec.ring[1], 0.4, 32, 0)) {
    if (!ok(p, r)) continue;
    const [x0, x1] = gridRange(p.x - r - 2, p.x + r + 2);
    const [z0, z1] = gridRange(p.z - r - 2, p.z + r + 2);
    const before: number[] = [];
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) before.push(ctx.blocked[iz * ctx.n + ix]);
    addShape(ctx, isl, discShape(p.x, p.z, r), true);
    if (!walkable()) {
      ctx.shapes[isl.id].pop();
      let k = 0;
      for (let iz = z0; iz <= z1; iz++)
        for (let ix = x0; ix <= x1; ix++) ctx.blocked[iz * ctx.n + ix] = before[k++];
      continue;
    }
    const face = unit(p, hut);
    ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY: ang(face.x, face.z), islandId: isl.id });
    return p;
  }
  return null;
}

/** All `pts` lie on one walkable, unblocked component of the island (8-connected flood). */
function connected(ctx: SiteCtx, isl: IslandData, pts: readonly XZ[]): boolean {
  const cells = pts.map((p) => nearestPathCell(ctx, isl, p));
  if (cells.some((c) => c < 0)) return false;
  const { x0, x1, z0, z1 } = islandWindow(ctx, isl);
  const n = ctx.n;
  const ok = (i: number): boolean =>
    ctx.islandMap[i] === isl.id + 1 && ctx.sdf[i] >= PATHS.minShore && !ctx.blocked[i];
  const seen = new Set<number>([cells[0]]);
  const stack = [cells[0]];
  while (stack.length > 0) {
    const c = stack.pop() as number;
    const cx = c % n;
    const cz = (c - cx) / n;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < x0 || x > x1 || z < z0 || z > z1) continue;
        const j = z * n + x;
        if (seen.has(j) || !ok(j)) continue;
        seen.add(j);
        stack.push(j);
      }
  }
  return cells.every((c) => seen.has(c));
}
