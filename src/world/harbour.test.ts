import { describe, expect, it } from 'vitest';
import { HARBOURS } from '../content/harbours.ts';
import { DOCK } from '../content/settlements.ts';
import { smoothstep } from '../core/math/index.ts';
import { shoreSdf } from './gen/coast.ts';
import { cellX, cellZ, GRID_ORIGIN } from './gen/grid.ts';
import { createNetwork } from './gen/paths.ts';
import {
  armAt,
  armLength,
  frameOf,
  framePoint,
  harbourKeepOut,
  inApproach,
  placeKiosks,
  planHarbour,
  type Harbour,
} from './gen/plans/harbour.ts';
import type { DockSite, SiteCtx } from './gen/sites.ts';
import { waterBandZone } from './gen/zones.ts';
import { CELL_SIZE, GRID_N, heightAt, Zone, type IslandData } from './types.ts';

/** Harbour skeleton (TASK-532) on a synthetic round island: unit tests of the pure-data module. */
const P = HARBOURS.research as NonNullable<typeof HARBOURS.research>;
const R0 = 26;

/** A round island at the origin (radius R0, shelf and drop off), optionally a second body. */
function synth(other?: { x: number; z: number; r: number }): { ctx: SiteCtx; isl: IslandData } {
  const n = GRID_N;
  const data = new Float32Array(n * n);
  const islandMap = new Uint8Array(n * n);
  for (let iz = 0; iz < n; iz++)
    for (let ix = 0; ix < n; ix++) {
      const x = cellX(ix);
      const z = cellZ(iz);
      const d = Math.hypot(x, z) - R0;
      const i = iz * n + ix;
      if (d < 0) {
        data[i] = Math.min(5, 0.4 - d * 0.3);
        islandMap[i] = 1;
      } else {
        data[i] = -0.1 - 1.5 * smoothstep(0, 11, d) - 8 * smoothstep(11, 30, d);
      }
      if (other && Math.hypot(x - other.x, z - other.z) < other.r) {
        data[i] = 2;
        islandMap[i] = 2;
      }
    }
  const land = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) land[i] = data[i] > 0 ? 1 : 0;
  const sdf = shoreSdf(land, n);
  const isl = {
    id: 0,
    theme: 'research',
    archetype: 'lonelypalm',
    cx: 0,
    cz: 0,
    radius: R0,
    reach: R0 + 2,
    anchors: {},
  } as unknown as IslandData;
  const islands = [isl];
  const zone = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++)
    zone[i] =
      sdf[i] > 0
        ? Zone.grass
        : waterBandZone(islands, [], 0, cellX(i % n), cellZ(Math.floor(i / n)), -sdf[i], 1);
  const h = { data, n, cellSize: CELL_SIZE, originX: GRID_ORIGIN, originZ: GRID_ORIGIN };
  const ctx = {
    h,
    n,
    sdf,
    zone,
    islandMap,
    windDir: 0,
    islands,
    streams: [],
    fields: [],
    net: createNetwork(n),
    blocked: new Uint8Array(n * n),
    passable: new Uint8Array(n * n),
    hasNet: [false],
    reach: [null],
    pads: [],
    shapes: [[]],
    lanes: [[]],
    lots: [],
    landmarks: [],
    docks: [],
    moorings: [],
    fixtures: [],
  } as unknown as SiteCtx;
  return { ctx, isl };
}

/** The lee cove dock of the synthetic island: on the +x coast, heading +x. */
const SITE: DockSite = { root: { x: R0, z: 0 }, dir: { x: 1, z: 0 }, segments: 3, carve: true };

function plan(other?: { x: number; z: number; r: number }): { ctx: SiteCtx; hb: Harbour } {
  const { ctx, isl } = synth(other);
  const hb = planHarbour(ctx, isl, SITE);
  if (!hb) throw new Error('no harbour');
  placeKiosks(ctx, hb, { x: 0, z: 0 });
  return { ctx, hb };
}

describe('harbour skeleton (TASK-532)', () => {
  it('runs the dock out to the T-head pier and puts the berth past the head', () => {
    const { hb, ctx } = plan();
    expect(hb.site.segments).toBe(P.pier.segments);
    const L = P.pier.segments * DOCK.segment;
    expect(hb.end.x).toBeCloseTo(R0 + L, 6);
    expect(hb.berth.x).toBeCloseTo(R0 + L + P.berth.out, 6);
    expect(heightAt(ctx.h, hb.berth.x, hb.berth.z)).toBeLessThan(-1.5);
    const A = hb.isl.anchors;
    expect(A.harbourPier0.x).toBeCloseTo(R0, 6);
    expect(A.ferryBerth.x).toBeCloseTo(hb.berth.x, 6);
  });

  it('frame helpers round-trip and the approach corridor lies past the berth', () => {
    const { hb } = plan();
    const p = framePoint(hb, 7, -3);
    const f = frameOf(hb, p);
    expect(f.u).toBeCloseTo(7, 9);
    expect(f.v).toBeCloseTo(-3, 9);
    expect(inApproach(hb, framePoint(hb, P.pier.segments * 2 + 8, 0))).toBe(true);
    expect(inApproach(hb, framePoint(hb, 4, 0))).toBe(false);
    expect(inApproach(hb, framePoint(hb, 20, P.berth.approach.half + 3))).toBe(false);
  });

  it('grows the arm along the offset contour, as land of the island joined to the coast', () => {
    const { hb, ctx } = plan();
    const A = P.arm;
    expect(armLength(hb)).toBeGreaterThanOrEqual(A.minLength);
    for (let k = 0; k <= hb.bend; k++) {
      const p = hb.arm[k];
      // on the pre-arm contour: offset u from the round coast
      expect(Math.hypot(p.x, p.z) - R0).toBeGreaterThan(A.offset - 1.2);
      expect(Math.hypot(p.x, p.z) - R0).toBeLessThan(A.offset + 1.2);
      expect(heightAt(ctx.h, p.x, p.z)).toBeGreaterThan(A.crestY * (1 - A.crestDome) - 0.2);
    }
    // the root ends on the coast
    const root = hb.arm[hb.arm.length - 1];
    expect(Math.hypot(root.x, root.z)).toBeLessThan(R0 + 1);
    // every new land sample belongs to the island, and the tip is joined to the body
    for (const i of hb.land) expect(ctx.islandMap[i]).toBe(1);
    const n = ctx.n;
    const tip =
      Math.round((hb.arm[0].z - GRID_ORIGIN) / 2) * n + Math.round((hb.arm[0].x - GRID_ORIGIN) / 2);
    const seen = new Uint8Array(n * n);
    const stack = [tip];
    seen[tip] = 1;
    let body = false;
    while (stack.length > 0 && !body) {
      const c = stack.pop() as number;
      if (Math.hypot(cellX(c % n), cellZ(Math.floor(c / n))) < R0 - 4) body = true;
      for (const j of [c - 1, c + 1, c - n, c + n])
        if (!seen[j] && ctx.h.data[j] > 0) {
          seen[j] = 1;
          stack.push(j);
        }
    }
    expect(body).toBe(true);
    // the basin mouth stays open
    const headEnd = framePoint(hb, P.pier.segments * 2, P.pier.head.w / 2);
    expect(Math.hypot(hb.arm[0].x - headEnd.x, hb.arm[0].z - headEnd.z)).toBeGreaterThan(A.mouth);
  });

  it('recomputes the shore SDF exactly and puts the enclosed water in the lagoon band', () => {
    const { hb, ctx } = plan();
    const n = ctx.n;
    const land = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) land[i] = ctx.h.data[i] > 0 ? 1 : 0;
    const ref = shoreSdf(land, n);
    let diff = 0;
    for (let i = 0; i < n * n; i++) if (ref[i] !== ctx.sdf[i]) diff++;
    expect(diff).toBe(0);
    // water between the arm and the coast (midway along the arm)
    const a = armAt(hb, armLength(hb) / 2);
    let lagoon = 0;
    let water = 0;
    for (let t = 3.5; t <= P.arm.offset - 1.5; t += 0.5) {
      const q = { x: a.x - a.nx * t, z: a.z - a.nz * t };
      const i = Math.round((q.z - GRID_ORIGIN) / 2) * n + Math.round((q.x - GRID_ORIGIN) / 2);
      if (ctx.h.data[i] >= 0) continue;
      water++;
      if (ctx.zone[i] === Zone.lagoon) lagoon++;
    }
    expect(water).toBeGreaterThan(0);
    expect(lagoon).toBe(water);
  });

  it('dredges the basin and reserves the kiosk sites on the cove land', () => {
    const { hb, ctx } = plan();
    const c = hb.isl.anchors.harbourBasin;
    expect(heightAt(ctx.h, c.x, c.z)).toBeLessThanOrEqual(-P.basin.depth + 0.3);
    for (const k of ['harbourShelter', 'harbourBooth', 'harbourBoard']) {
      const a = hb.isl.anchors[k];
      expect(a, k).toBeDefined();
      expect(frameOf(hb, a).u, k).toBeLessThan(0);
      expect(heightAt(ctx.h, a.x, a.z), k).toBeGreaterThan(0.3);
    }
  });

  it('picks the side away from another land body', () => {
    const free = plan();
    // a skerry on the free plan's arm side, inside `clearOther` of its crest
    const mid = armAt(free.hb, armLength(free.hb) / 2);
    const out = { x: mid.x + mid.nx * 10, z: mid.z + mid.nz * 10, r: 4 };
    const blocked = plan(out);
    expect(blocked.hb.sigma).toBe(-free.hb.sigma);
  });

  it('is deterministic and island-agnostic about the pier root', () => {
    const a = plan();
    const b = plan();
    expect(b.hb.isl.anchors).toEqual(a.hb.isl.anchors);
    expect(Array.from(b.ctx.h.data)).toEqual(Array.from(a.ctx.h.data));
  });

  it('keeps boat routes off the pier and the T-head, not off the berth', () => {
    const { hb } = plan();
    const discs = harbourKeepOut([hb.isl]);
    expect(discs.length).toBeGreaterThan(P.pier.segments);
    for (const d of discs)
      expect(Math.hypot(d.x - hb.berth.x, d.z - hb.berth.z)).toBeGreaterThan(d.r * 0.5);
    expect(harbourKeepOut([{ ...hb.isl, theme: 'coding' } as IslandData])).toEqual([]);
  });
});
