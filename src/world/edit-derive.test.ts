import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.ts';
import { edtNearest, shoreSdf } from './gen/coast.ts';
import { buildChunkFlags } from './gen/chunks.ts';
import { cellX, cellZ } from './gen/grid.ts';
import { deriveZoneCell, zoneNoise } from './gen/zones.ts';
import { EDIT_DERIVE } from '../content/edit.ts';
import {
  applyEdit,
  canPlace,
  CHUNK_CELLS,
  CHUNKS_PER_SIDE,
  CHUNK_HAS_LAND,
  decodeLog,
  generateWorld,
  slopeAtCell,
  Zone,
  type EditCommand,
  type WorldData,
} from './index.ts';

// Tests measure wall time; edits themselves never read a clock.
// eslint-disable-next-line no-restricted-properties
const now = (): number => performance.now();

const base = generateWorld(42);
const clone = (): WorldData => structuredClone(base);
const N = base.height.n;

function cellWhere(_w: WorldData, pred: (i: number) => boolean, salt: number): number {
  for (let k = 0; k < N * N; k++) {
    const i = (salt * 7919 + k * 104729) % (N * N);
    const ix = i % N;
    const iz = (i - ix) / N;
    if (ix < 25 || iz < 25 || ix > N - 26 || iz > N - 26) continue;
    if (pred(i)) return i;
  }
  throw new Error('no cell');
}
const at = (i: number): { x: number; z: number } => ({
  x: cellX(i % N),
  z: cellZ(Math.floor(i / N)),
});

describe('incremental shore SDF', () => {
  it('matches a full recompute within 1 cell after 20 random coastal edits (+ new open-sea land)', () => {
    const w = clone();
    const rng = createRng(5).fork('sdf');
    let worst = 0;
    const check = (): void => {
      const land = new Uint8Array(N * N);
      for (let i = 0; i < N * N; i++) land[i] = w.height.data[i] > 0 ? 1 : 0;
      const full = shoreSdf(land, N);
      let signs = 0;
      for (let i = 0; i < N * N; i++) {
        if (w.shoreSdf[i] > 0 !== full[i] > 0) signs++;
        const e = Math.abs(w.shoreSdf[i] - full[i]);
        if (e > worst) worst = e;
      }
      expect(signs).toBe(0);
    };
    for (let k = 0; k < 20; k++) {
      const i = cellWhere(w, (j) => Math.abs(w.shoreSdf[j]) < 3, rng.int(0, 1e6));
      const kind = rng.pick(['raise', 'lower', 'smooth', 'flatten'] as const);
      const s = kind === 'flatten' ? rng.range(-3, 3) : kind === 'smooth' ? 1 : 4;
      const r = applyEdit(w, { k: kind, ...at(i), r: rng.range(6, 36), s });
      expect(r.ok).toBe(true);
      check();
    }
    // a brand-new islet in deep water: 12 stacked raises
    const deep = cellWhere(w, (j) => w.shoreSdf[j] < -60, 3);
    let islet = 0;
    for (let k = 0; k < 12; k++) {
      const t0 = now();
      const r = applyEdit(w, { k: 'raise', ...at(deep), r: 14, s: 4 });
      if (r.dirty.sdf) islet = Math.max(islet, now() - t0);
    }
    console.info(`open-sea islet: worst raise incl. far-field sdf ${islet.toFixed(2)} ms`);
    expect(w.height.data[deep]).toBeGreaterThan(0);
    check();
    console.info(`incremental sdf vs full recompute: max |Δ| ${worst.toFixed(3)} u`);
    expect(worst).toBeLessThanOrEqual(2); // 1 cell
  });
});

describe('local zone re-derivation', () => {
  /** Owner of every cell from an exact full feature transform (generation semantics). */
  const owners = (w: WorldData): Uint8Array => {
    const land = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) land[i] = w.height.data[i] > 0 ? 1 : 0;
    const near = edtNearest(land, N, N, 1).nearest;
    const out = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) out[i] = near[i] >= 0 ? w.islandMap[near[i]] : 0;
    return out;
  };

  it('touched samples follow the generation rules; paint wins until the height changes', () => {
    const w = clone();
    const c = cellWhere(
      w,
      (i) =>
        w.shoreSdf[i] > 8 &&
        w.shoreSdf[i] < 30 &&
        w.zone[i] !== Zone.path &&
        w.zone[i] !== Zone.plaza &&
        w.zone[i] !== Zone.field,
      2,
    );
    const p = at(c);
    applyEdit(w, { k: 'paint', ...p, r: 12, zone: 'rock' });
    expect(w.zone[c]).toBe(Zone.rock);
    expect(w.zonePainted[c]).toBe(1);
    // raise a hill whose disc covers the east half of the painted disc
    const before = w.height.data.slice();
    applyEdit(w, { k: 'raise', x: p.x + 12, z: p.z, r: 12, s: 3 });
    const ctx = {
      h: w.height,
      sdf: w.shoreSdf,
      islandMap: w.islandMap,
      tags: w.genAux.tags,
      islands: w.islands,
      windDir: w.windDir,
      noise: zoneNoise(createRng(w.seed).fork('zones')),
    };
    const own = owners(w);
    let kept = 0;
    let rederived = 0;
    const rc = 12 / 2;
    for (let dz = -rc; dz <= rc; dz++)
      for (let dx = -rc; dx <= rc; dx++) {
        if (dx * dx + dz * dz >= rc * rc) continue;
        const i = c + dz * N + dx;
        if (w.height.data[i] <= 0) continue;
        if (before[i] !== w.height.data[i]) {
          expect(w.zonePainted[i]).toBe(0);
          const ix = i % N;
          expect(w.zone[i]).toBe(deriveZoneCell(ctx, ix, (i - ix) / N, own[i]));
          rederived++;
        } else {
          expect(w.zonePainted[i]).toBe(1);
          expect(w.zone[i]).toBe(Zone.rock);
          kept++;
        }
      }
    expect(kept).toBeGreaterThan(10);
    expect(rederived).toBeGreaterThan(10);
  });

  it('painting water is a no-op; pathGraph is never rebuilt', () => {
    const w = clone();
    const deep = cellWhere(w, (i) => w.shoreSdf[i] < -20, 1);
    const r = applyEdit(w, { k: 'paint', ...at(deep), r: 10, zone: 'grass' });
    expect(r.ok).toBe(true);
    expect(r.inverse).toEqual([]);
    const graph = w.pathGraph;
    const nodes = graph.nodes.slice();
    const node = { x: graph.nodes[0], z: graph.nodes[1] };
    applyEdit(w, { k: 'raise', ...node, r: 20, s: 4 });
    expect(w.pathGraph).toBe(graph);
    expect(w.pathGraph.nodes).toEqual(nodes);
  });
});

describe('zone drift (sweep defect 2): unchanged slope keeps its zone', () => {
  const shore = new Set<number>(EDIT_DERIVE.sdfZones);
  /** Samples whose own height or one of their 8 neighbours changed between a and b. */
  const slopeChanged = (a: Float32Array, b: Float32Array, n: number): Uint8Array => {
    const out = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) {
      if (a[i] === b[i]) continue;
      const ix = i % n;
      const iz = (i - ix) / n;
      for (let oz = -1; oz <= 1; oz++)
        for (let ox = -1; ox <= 1; ox++) {
          const x = ix + ox;
          const z = iz + oz;
          if (x >= 0 && z >= 0 && x < n && z < n) out[z * n + x] = 1;
        }
    }
    return out;
  };
  /** Zone changes on samples with an unchanged 3×3 height that are not shore-band moves. */
  const drift = (
    w: WorldData,
    h0: Float32Array,
    z0: Uint8Array,
  ): { bad: string[]; shoreMoves: number } => {
    const n = w.height.n;
    const moved = slopeChanged(h0, w.height.data, n);
    const bad: string[] = [];
    let shoreMoves = 0;
    for (let i = 0; i < n * n; i++) {
      if (moved[i] || w.zone[i] === z0[i]) continue;
      const a = z0[i];
      const b = w.zone[i];
      const ok = (shore.has(a) || shore.has(b)) && b !== Zone.rock && b !== Zone.cliff;
      if (ok) shoreMoves++;
      else bad.push(`${i}: ${a} → ${b}`);
    }
    return { bad, shoreMoves };
  };

  it('20 random coastal edits on 5 seeds: only sand / water bands move outside the 3×3 of a height change', () => {
    let moves = 0;
    for (const seed of [7, 42, 1001, 2024, 5005]) {
      const w = seed === 42 ? clone() : generateWorld(seed);
      const n = w.height.n;
      const rng = createRng(seed).fork('zone-drift');
      for (let k = 0; k < 20; k++) {
        let i = -1;
        for (let t = 0; t < n * n && i < 0; t++) {
          const j = (rng.int(0, n * n - 1) + t * 104729) % (n * n);
          const ix = j % n;
          const iz = (j - ix) / n;
          if (ix > 25 && iz > 25 && ix < n - 26 && iz < n - 26 && Math.abs(w.shoreSdf[j]) < 3)
            i = j;
        }
        const kind = rng.pick(['raise', 'lower', 'lower', 'smooth', 'flatten'] as const);
        const s = kind === 'flatten' ? rng.range(-3, 3) : kind === 'smooth' ? 1 : 4;
        const h0 = w.height.data.slice();
        const z0 = w.zone.slice();
        const r = applyEdit(w, {
          k: kind,
          x: cellX(i % n),
          z: cellZ(Math.floor(i / n)),
          r: rng.range(6, 30),
          s,
        });
        if (!r.ok) continue;
        const d = drift(w, h0, z0);
        expect(d.bad, `seed ${seed} edit ${k} (${kind})`).toEqual([]);
        moves += d.shoreMoves;
      }
    }
    // the rule is exercised: shore distance moved sand / water bands outside the brushes
    expect(moves).toBeGreaterThan(100);
  });

  it('seed 2024 harbour flood (QA log): the terraces beside the tower stay meadow', () => {
    const w = generateWorld(2024);
    const h0 = w.height.data.slice();
    const z0 = w.zone.slice();
    // mar-docs/qa/edit-sweep-2026-10-04-logs.json → 2024.logs.flood.enc (12 lowers, r 14)
    const log = decodeLog(
      'AegPAAwBjGOOSMADgAwBoAK_AQAAAZ8CwAoAAAGfAr8EAAAB4AbfBgAAAd8GwAQAAAEAwAQAAAGACf8IAAAB3wPADQAAAZ8CAAAAAeAG3w8AAAGfBYASAAA',
    );
    let applied = 0;
    for (const c of log.cmds) if (applyEdit(w, c).ok) applied++;
    expect(applied).toBe(12);
    const d = drift(w, h0, z0);
    expect(d.bad).toEqual([]);
    let terrace = 0;
    const moved = slopeChanged(h0, w.height.data, w.height.n);
    for (let i = 0; i < z0.length; i++)
      if (!moved[i] && z0[i] === Zone.meadow && w.zone[i] !== Zone.meadow) terrace++;
    expect(terrace).toBe(0);
  });
});

describe('islandMap / chunkFlags refresh', () => {
  it('raising land in a deep chunk makes it meshable and assigns an island', () => {
    const w = clone();
    let chunk = -1;
    for (let c = 0; c < CHUNKS_PER_SIDE * CHUNKS_PER_SIDE && chunk < 0; c++) {
      const cx = c % CHUNKS_PER_SIDE;
      const cz = (c - cx) / CHUNKS_PER_SIDE;
      if (w.chunkFlags[c] === 0 && cx > 0 && cz > 0 && cx < 11 && cz < 11) chunk = c;
    }
    expect(chunk).toBeGreaterThanOrEqual(0);
    const cx = chunk % CHUNKS_PER_SIDE;
    const cz = (chunk - cx) / CHUNKS_PER_SIDE;
    const ix = cx * CHUNK_CELLS + 16;
    const iz = cz * CHUNK_CELLS + 16;
    const i = iz * N + ix;
    const cmd: EditCommand = { k: 'raise', x: cellX(ix), z: cellZ(iz), r: 16, s: 4 };
    let sawChunk = false;
    for (let k = 0; k < 15; k++) {
      const r = applyEdit(w, { ...cmd });
      if (r.dirty.chunks.includes(chunk)) sawChunk = true;
    }
    expect(sawChunk).toBe(true);
    expect(w.height.data[i]).toBeGreaterThan(0);
    expect(w.chunkFlags[chunk] & CHUNK_HAS_LAND).toBeTruthy();
    expect(w.chunkFlags).toEqual(buildChunkFlags(w.height));
    expect(w.islandMap[i]).toBeGreaterThan(0);
    expect(w.zone[i]).toBeGreaterThanOrEqual(Zone.sandWet);
    expect(w.shoreSdf[i]).toBeGreaterThan(0);
  });
});

describe('edit performance', () => {
  const timeBrush = (w: WorldData, cmd: EditCommand): number => {
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const c = { ...cmd };
      const t0 = now();
      const r = applyEdit(w, c);
      best = Math.min(best, now() - t0);
      for (const inv of r.inverse) applyEdit(w, inv);
    }
    return best;
  };

  it('a 30 u brush edit incl. derived data ≤ 4 ms warm (best of 3)', () => {
    const w = clone();
    const inl = cellWhere(
      w,
      (i) => w.shoreSdf[i] > 12 && slopeAtCell(w.height, i % N, Math.floor(i / N)) < 0.4,
      4,
    );
    const coast = cellWhere(w, (i) => Math.abs(w.shoreSdf[i]) <= 1, 6);
    // warm-up: builds the per-world edit state (two full EDTs, once) + JIT
    for (let k = 0; k < 5; k++) {
      const r = applyEdit(w, { k: 'raise', ...at(coast), r: 30, s: 2 });
      for (const inv of r.inverse) applyEdit(w, inv);
    }
    const msInland = timeBrush(w, { k: 'raise', ...at(inl), r: 30, s: 4 });
    const msCoast = timeBrush(w, { k: 'raise', ...at(coast), r: 30, s: 4 });
    const msSmooth = timeBrush(w, { k: 'smooth', ...at(coast), r: 30, s: 1 });
    console.info(
      `30 u brush (warm, best of 3): inland raise ${msInland.toFixed(2)} ms, coastal raise ${msCoast.toFixed(2)} ms, coastal smooth ${msSmooth.toFixed(2)} ms`,
    );
    expect(msInland).toBeLessThanOrEqual(4);
    expect(msCoast).toBeLessThanOrEqual(4);
    // ghost preview: one placement check per frame
    const p = at(inl);
    canPlace(w, { k: 'propAdd', def: 'roundTree', ...p, rotY: 0, scale: 1 });
    let per = Infinity;
    for (let rep = 0; rep < 3; rep++) {
      const t0 = now();
      for (let k = 0; k < 200; k++)
        canPlace(w, {
          k: 'propAdd',
          def: 'roundTree',
          x: p.x + k * 0.01,
          z: p.z,
          rotY: 0,
          scale: 1,
        });
      per = Math.min(per, (now() - t0) / 200);
    }
    console.info(`canPlace: ${(per * 1000).toFixed(0)} µs per call (${w.props.count} props)`);
    expect(per).toBeLessThan(1);
  });
});
