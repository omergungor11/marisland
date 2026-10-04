import { describe, expect, it } from 'vitest';
import { createRng, type Rng } from '../core/rng.ts';
import { EDIT_BRUSH, EDIT_DERIVE, EDIT_PROPS } from '../content/edit.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../content/props.ts';
import {
  applyEdit,
  canPlace,
  canonicalCmd,
  CHUNK_CELLS,
  CHUNKS_PER_SIDE,
  decodeLog,
  EDIT_PROP_ID_BASE,
  editHash,
  encodeLog,
  generateWorld,
  growPropStore,
  heightAt,
  propCapacity,
  propIdAt,
  propIndexOf,
  PropFlag,
  replay,
  slopeAtCell,
  Zone,
  type DirtyRegion,
  type EditCommand,
  type EditLog,
  type WorldData,
} from './index.ts';
import { cellX, cellZ } from './gen/grid.ts';
import { createOccupancy } from './gen/scatter.ts';
import { DOCK } from '../content/settlements.ts';

const SEED = 42;
const base = generateWorld(SEED);
const clone = (): WorldData => structuredClone(base);

/** Everything an edit may touch, copied (props over `count` only). */
function snap(w: WorldData): Record<string, Uint8Array> {
  const b = (a: Float32Array | Uint8Array | Uint16Array, len = a.length): Uint8Array =>
    new Uint8Array(a.buffer, a.byteOffset, len * a.BYTES_PER_ELEMENT).slice();
  const s = w.props;
  const out: Record<string, Uint8Array> = {
    height: b(w.height.data),
    zone: b(w.zone),
    painted: b(w.zonePainted),
    sdf: b(w.shoreSdf),
    islandMap: b(w.islandMap),
    fieldColor: b(w.fieldColor),
    chunkFlags: b(w.chunkFlags),
    count: new Uint8Array(new Uint32Array([s.count]).buffer),
  };
  for (const k of [
    'defId',
    'variant',
    'x',
    'y',
    'z',
    'rotY',
    'scale',
    'islandId',
    'chunkId',
    'flags',
  ] as const)
    out[`p.${k}`] = b(s[k], s.count);
  return out;
}

function expectSame(a: Record<string, Uint8Array>, b: Record<string, Uint8Array>): void {
  for (const k of Object.keys(a)) {
    const same = a[k].length === b[k].length && a[k].every((v, i) => v === b[k][i]);
    expect(same, `${k} differs`).toBe(true);
  }
}

const N = base.height.n;

/** First cell (scan order from a seeded start) matching `pred`, as world xz. */
function findCell(
  _w: WorldData,
  pred: (i: number, ix: number, iz: number) => boolean,
  salt = 0,
): { x: number; z: number; i: number } {
  const start = (salt * 7919) % (N * N);
  for (let k = 0; k < N * N; k++) {
    const i = (start + k * 104729) % (N * N);
    const ix = i % N;
    const iz = (i - ix) / N;
    if (ix < 25 || iz < 25 || ix > N - 26 || iz > N - 26) continue;
    if (pred(i, ix, iz)) return { x: cellX(ix), z: cellZ(iz), i };
  }
  throw new Error('no cell');
}

const coastal = (w: WorldData, salt = 0): { x: number; z: number; i: number } =>
  findCell(w, (i) => Math.abs(w.shoreSdf[i]) <= 1 && w.zone[i] !== Zone.lagoon, salt);
const inland = (w: WorldData, salt = 0): { x: number; z: number; i: number } =>
  findCell(
    w,
    (i, ix, iz) =>
      w.shoreSdf[i] > 12 &&
      slopeAtCell(w.height, ix, iz) < 0.3 &&
      w.zone[i] !== Zone.path &&
      w.zone[i] !== Zone.plaza,
    salt,
  );

/** Independent reading of the dirty rule from array diffs (content margins). */
function expectedDirty(
  before: WorldData,
  after: WorldData,
): Omit<DirtyRegion, 'props' | 'sdf'> & { sdf: boolean } {
  const flag = new Uint8Array(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE);
  let minI = N;
  let maxI = -1;
  let minJ = N;
  let maxJ = -1;
  const C = CHUNK_CELLS;
  const mark = (ix: number, iz: number, m: number): void => {
    for (let cz = 0; cz < CHUNKS_PER_SIDE; cz++)
      for (let cx = 0; cx < CHUNKS_PER_SIDE; cx++)
        if (cx * C <= ix + m && cx * C + C >= ix - m && cz * C <= iz + m && cz * C + C >= iz - m)
          flag[cz * CHUNKS_PER_SIDE + cx] = 1;
  };
  let sdf = false;
  for (let i = 0; i < N * N; i++) {
    const ix = i % N;
    const iz = (i - ix) / N;
    const dh = before.height.data[i] !== after.height.data[i];
    const dz =
      before.zone[i] !== after.zone[i] ||
      before.fieldColor[i] !== after.fieldColor[i] ||
      before.islandMap[i] !== after.islandMap[i];
    const dp = before.zonePainted[i] !== after.zonePainted[i];
    const ds = before.shoreSdf[i] !== after.shoreSdf[i];
    if (dh) mark(ix, iz, EDIT_DERIVE.renderMarginCells);
    if (dz) mark(ix, iz, 0);
    if (
      ds &&
      (Math.abs(after.shoreSdf[i]) <= EDIT_DERIVE.sdfMeshBand ||
        Math.abs(before.shoreSdf[i]) <= EDIT_DERIVE.sdfMeshBand)
    )
      mark(ix, iz, EDIT_DERIVE.sdfMargin);
    if (ds) sdf = true;
    if (dh || dz || dp || ds) {
      minI = Math.min(minI, ix);
      maxI = Math.max(maxI, ix);
      minJ = Math.min(minJ, iz);
      maxJ = Math.max(maxJ, iz);
    }
  }
  const chunks: number[] = [];
  flag.forEach((f, c) => f && chunks.push(c));
  return maxI < 0
    ? { chunks, minI: 0, maxI: -1, minJ: 0, maxJ: -1, sdf }
    : { chunks, minI, maxI, minJ, maxJ, sdf };
}

/** Apply, check the inverse restores byte-identically, and redo via the inverse's inverse. */
function roundTrip(w: WorldData, cmd: EditCommand): void {
  const before = snap(w);
  const r = applyEdit(w, cmd);
  expect(r.ok, r.reason).toBe(true);
  const after = snap(w);
  let redo: EditCommand[] = [];
  for (const inv of r.inverse) {
    const ri = applyEdit(w, inv);
    expect(ri.ok).toBe(true);
    redo = [...ri.inverse, ...redo];
  }
  expectSame(before, snap(w));
  for (const c of redo) expect(applyEdit(w, c).ok).toBe(true);
  expectSame(after, snap(w));
}

const placeable = (w: WorldData, def: string, salt: number): { x: number; z: number } => {
  for (let k = 0; k < 400; k++) {
    const p = inland(w, salt + k);
    if (canPlace(w, { k: 'propAdd', def, x: p.x, z: p.z, rotY: 0, scale: 1 }).ok) return p;
  }
  throw new Error('no placeable spot');
};

describe('edit commands — inverse round trips (byte-identical)', () => {
  it('raise / lower / flatten / smooth on the coast (land↔water flips) and inland', () => {
    const w = clone();
    const c = coastal(w, 3);
    const l = inland(w, 5);
    roundTrip(w, { k: 'raise', x: c.x, z: c.z, r: 18, s: 3.5 });
    roundTrip(w, { k: 'lower', x: c.x + 6, z: c.z - 4, r: 22, s: 4 });
    roundTrip(w, { k: 'flatten', x: l.x, z: l.z, r: 30, s: 2 });
    roundTrip(w, { k: 'smooth', x: c.x, z: c.z, r: 25, s: 1 });
    roundTrip(w, { k: 'raise', x: l.x, z: l.z, r: 30, s: 4 });
  });

  it('paint, propAdd, propRemove (scatter + edit), propMove', () => {
    const w = clone();
    const l = inland(w, 9);
    roundTrip(w, { k: 'paint', x: l.x, z: l.z, r: 12, zone: 'sand' });
    const p = placeable(w, 'roundTree', 11);
    roundTrip(w, { k: 'propAdd', def: 'roundTree', x: p.x, z: p.z, rotY: 1, scale: 1.2 });
    // a live edit prop to remove / move
    const add: EditCommand = { k: 'propAdd', def: 'bush', x: p.x + 0.5, z: p.z, rotY: 0, scale: 1 };
    const q = placeable(w, 'bush', 21);
    add.x = q.x;
    add.z = q.z;
    expect(applyEdit(w, add).ok).toBe(true);
    const id = add.k === 'propAdd' && add.id !== undefined ? add.id : -1;
    expect(id).toBe(EDIT_PROP_ID_BASE + 1); // the redone roundTree holds BASE
    const m = placeable(w, 'bush', 31);
    roundTrip(w, { k: 'propMove', id, x: m.x, z: m.z, rotY: 2 });
    roundTrip(w, { k: 'propRemove', id: EDIT_PROP_ID_BASE }); // not the last slot: flagged
    roundTrip(w, { k: 'propRemove', id }); // last slot: popped
    // scatter prop: hidden by flag, slot stays
    let sc = 0;
    while (w.props.flags[sc] & PropFlag.groundCover) sc++;
    roundTrip(w, { k: 'propRemove', id: sc });
    let sm = sc + 1;
    while (w.props.flags[sm] & PropFlag.groundCover) sm++;
    const m2 = placeable(w, PROP_DEFS[w.props.defId[sm]].id, 41);
    roundTrip(w, { k: 'propMove', id: sm, x: m2.x, z: m2.z, rotY: 0.5 });
  });

  it('propAdd inverse is the mirror propRemove; removing the last edit slot pops it', () => {
    const w = clone();
    const n0 = w.props.count;
    const p = placeable(w, 'pine', 3);
    const cmd: EditCommand = { k: 'propAdd', def: 'pine', x: p.x, z: p.z, rotY: 0, scale: 1 };
    const r = applyEdit(w, cmd);
    expect(r.inverse).toEqual([{ k: 'propRemove', id: EDIT_PROP_ID_BASE }]);
    expect(w.props.count).toBe(n0 + 1);
    expect(propIndexOf(w, EDIT_PROP_ID_BASE)).toBe(n0);
    expect(propIdAt(w, n0)).toBe(EDIT_PROP_ID_BASE);
    expect(w.props.y[n0]).toBeCloseTo(heightAt(w.height, w.props.x[n0], w.props.z[n0]), 5);
    applyEdit(w, r.inverse[0]);
    expect(w.props.count).toBe(n0);
    // redo with the id written back into the command reuses the same id
    expect(applyEdit(w, cmd).ok).toBe(true);
    expect(propIndexOf(w, EDIT_PROP_ID_BASE)).toBe(n0);
  });
});

describe('edit commands — dirty regions', () => {
  it('chunks / bounds / sdf flag match the array diffs exactly', () => {
    const w = clone();
    const cmds: EditCommand[] = [
      { k: 'raise', ...xz(coastal(w, 1)), r: 20, s: 4 },
      { k: 'lower', ...xz(coastal(w, 2)), r: 16, s: 4 },
      { k: 'smooth', ...xz(inland(w, 3)), r: 30, s: 1 },
      { k: 'paint', ...xz(inland(w, 4)), r: 10, zone: 'rock' },
      // chunk-edge brush: centre on a shared chunk edge sample
      { k: 'raise', x: cellX(5 * CHUNK_CELLS), z: cellZ(6 * CHUNK_CELLS), r: 6, s: 2 },
    ];
    for (const cmd of cmds) {
      const before = structuredClone(w);
      const r = applyEdit(w, cmd);
      expect(r.ok).toBe(true);
      const e = expectedDirty(before, w);
      expect(r.dirty.chunks).toEqual(e.chunks);
      expect([r.dirty.minI, r.dirty.maxI, r.dirty.minJ, r.dirty.maxJ]).toEqual([
        e.minI,
        e.maxI,
        e.minJ,
        e.maxJ,
      ]);
      expect(r.dirty.sdf).toBe(e.sdf);
      // props: exactly the slots whose record changed
      const ids: number[] = [];
      for (let i = 0; i < Math.max(before.props.count, w.props.count); i++) {
        const a = before.props;
        const b = w.props;
        const live = i < a.count && i < b.count;
        if (
          !live ||
          a.y[i] !== b.y[i] ||
          a.flags[i] !== b.flags[i] ||
          a.x[i] !== b.x[i] ||
          a.z[i] !== b.z[i]
        )
          ids.push(propIdAt(w, i));
      }
      expect(r.dirty.props).toEqual(ids);
    }
  });

  it('chunk-edge samples dirty both neighbours; a prop command dirties only its id', () => {
    const w = clone();
    const r = applyEdit(w, {
      k: 'raise',
      x: cellX(5 * CHUNK_CELLS),
      z: cellZ(5 * CHUNK_CELLS + 10),
      r: 2,
      s: 1,
    });
    const c = (cx: number, cz: number): number => cz * CHUNKS_PER_SIDE + cx;
    expect(r.dirty.chunks).toEqual(expect.arrayContaining([c(4, 5), c(5, 5)]));
    const p = placeable(w, 'bush', 7);
    const a = applyEdit(w, { k: 'propAdd', def: 'bush', x: p.x, z: p.z, rotY: 0, scale: 1 });
    expect(a.dirty.chunks).toEqual([]);
    expect(a.dirty.props).toEqual([EDIT_PROP_ID_BASE]);
  });
});

function xz(p: { x: number; z: number }): { x: number; z: number } {
  return { x: p.x, z: p.z };
}

describe('edit commands — placement validation', () => {
  const w = clone();
  const ok = placeable(w, 'roundTree', 1);
  const add = (def: string, x: number, z: number, scale = 1): EditCommand => ({
    k: 'propAdd',
    def,
    x,
    z,
    rotY: 0,
    scale,
  });
  const reason = (cmd: EditCommand): string | undefined => {
    const before = editHash(w);
    const r = applyEdit(w, cmd);
    expect(r.ok).toBe(false);
    expect(r.inverse).toEqual([]);
    expect(editHash(w)).toBe(before);
    expect(canPlace(w, cmd).ok).toBe(false);
    return r.reason;
  };

  it('rejects water, slope, occupancy, collisions, bounds, unknown defs and ids', () => {
    const deep = findCell(w, (i) => w.shoreSdf[i] < -20);
    expect(reason(add('roundTree', deep.x, deep.z))).toBe('under water');
    expect(reason(add('rowboat', ok.x, ok.z))).toBe('on land');
    const steep = findCell(
      w,
      (i, ix, iz) => w.shoreSdf[i] > 2 && slopeAtCell(w.height, ix, iz) > 1.5,
    );
    expect(reason(add('cottage', steep.x, steep.z))).toBe('too steep');
    const lot = w.lots[0];
    expect(reason(add('bush', lot.x, lot.z))).toBe('occupied');
    let t = 0;
    while (
      PROP_DEFS[w.props.defId[t]].id !== 'roundTree' &&
      PROP_DEFS[w.props.defId[t]].id !== 'pine'
    )
      t++;
    expect(reason(add(PROP_DEFS[w.props.defId[t]].id, w.props.x[t] + 0.1, w.props.z[t]))).toBe(
      'collides',
    );
    expect(reason(add('bush', 500, 0))).toBe('outside world');
    expect(reason(add('treeBlob', ok.x, ok.z))).toBe('unknown def');
    expect(reason(add('nope', ok.x, ok.z))).toBe('unknown def');
    expect(reason({ k: 'propRemove', id: EDIT_PROP_ID_BASE + 5 })).toBe('unknown id');
    expect(reason({ k: 'propMove', id: t, x: deep.x, z: deep.z, rotY: 0 })).toBe('under water');
    expect(reason({ k: 'raise', x: Number.NaN, z: 0, r: 5, s: 1 })).toBe('invalid command');
    expect(reason({ k: 'raise', x: 2000, z: 0, r: 5, s: 1 })).toBe('outside world');
    expect(
      reason({
        k: 'propAdd',
        id: EDIT_PROP_ID_BASE - 1,
        def: 'bush',
        x: ok.x,
        z: ok.z,
        rotY: 0,
        scale: 1,
      }),
    ).toBe('bad id');
  });

  it('accepts a free spot, then the same spot collides; removed props cannot be removed twice', () => {
    const c = add('roundTree', ok.x, ok.z);
    expect(canPlace(w, c)).toMatchObject({ ok: true });
    expect(applyEdit(w, c).ok).toBe(true);
    expect(canPlace(w, add('roundTree', ok.x + 0.3, ok.z)).reason).toBe('collides');
    // ground cover ignores prop collisions (scatter semantics)
    expect(canPlace(w, add('flower', ok.x + 0.3, ok.z)).ok).toBe(true);
    let sc = 0;
    while (w.props.flags[sc] & PropFlag.groundCover) sc++;
    expect(applyEdit(w, { k: 'propRemove', id: sc }).ok).toBe(true);
    expect(w.props.flags[sc] & PropFlag.removed).toBeTruthy();
    expect(reason({ k: 'propRemove', id: sc })).toBe('removed');
  });

  it('floating defs sit at y = 0 on water, seabed / underwater defs on the ground', () => {
    const shallow = findCell(
      w,
      (i) => w.shoreSdf[i] < -4 && w.shoreSdf[i] > -12 && w.height.data[i] < -0.3,
      3,
    );
    const b = canPlace(w, add('buoy', shallow.x, shallow.z));
    expect(b).toMatchObject({ ok: true, y: 0 });
    const s = canPlace(w, add('seaStack', shallow.x, shallow.z));
    if (s.ok) expect(s.y).toBeCloseTo(heightAt(w.height, shallow.x, shallow.z), 5);
  });
});

describe('edit commands — terrain side effects on props', () => {
  it('lowering land under a prop floods it (removed, listed, restored by the inverse)', () => {
    const w = clone();
    const c = coastal(w, 12);
    // a land prop just inland of the coast
    let spot: { x: number; z: number } | null = null;
    for (let k = 0; k < 2000 && !spot; k++) {
      const p = findCell(w, (i) => w.shoreSdf[i] > 1 && w.shoreSdf[i] < 4, k);
      if (canPlace(w, { k: 'propAdd', def: 'driftwood', x: p.x, z: p.z, rotY: 0, scale: 1 }).ok)
        spot = p;
    }
    expect(spot).not.toBeNull();
    if (!spot) return;
    void c;
    const add: EditCommand = { k: 'propAdd', def: 'driftwood', ...spot, rotY: 0, scale: 1 };
    expect(applyEdit(w, add).ok).toBe(true);
    const before = snap(w);
    const r = applyEdit(w, { k: 'lower', ...spot, r: 10, s: 4 });
    const slot = propIndexOf(w, EDIT_PROP_ID_BASE);
    expect(w.props.flags[slot] & PropFlag.removed).toBeTruthy();
    expect(r.dirty.props).toContain(EDIT_PROP_ID_BASE);
    for (const inv of r.inverse) applyEdit(w, inv);
    expectSame(before, snap(w));
  });

  it('raising ground under a prop re-grounds it', () => {
    const w = clone();
    const p = placeable(w, 'pine', 17);
    applyEdit(w, { k: 'propAdd', def: 'pine', ...p, rotY: 0, scale: 1 });
    const slot = propIndexOf(w, EDIT_PROP_ID_BASE);
    const y0 = w.props.y[slot];
    const r = applyEdit(w, { k: 'raise', ...p, r: 8, s: 2 });
    expect(w.props.y[slot]).toBeGreaterThan(y0 + 1);
    expect(w.props.y[slot]).toBeCloseTo(heightAt(w.height, w.props.x[slot], w.props.z[slot]), 5);
    expect(r.dirty.props).toContain(EDIT_PROP_ID_BASE);
  });
});

describe('edit log — replay, codec, determinism', () => {
  const randomLog = (rng: Rng, n: number, w: WorldData): EditLog => {
    const cmds: EditCommand[] = [];
    const isl = w.islands;
    for (let k = 0; k < n; k++) {
      const I = isl[rng.int(0, isl.length - 1)];
      const x = I.cx + rng.range(-1.2, 1.2) * I.radius;
      const z = I.cz + rng.range(-1.2, 1.2) * I.radius;
      const t = rng.next();
      if (t < 0.5)
        cmds.push({
          k: rng.pick(['raise', 'lower', 'flatten', 'smooth'] as const),
          x,
          z,
          r: rng.range(4, 40),
          s: rng.range(0, 4),
        });
      else if (t < 0.6)
        cmds.push({
          k: 'paint',
          x,
          z,
          r: rng.range(4, 30),
          zone: rng.pick(['grass', 'meadow', 'forest', 'sand', 'rock'] as const),
        });
      else if (t < 0.85)
        cmds.push({
          k: 'propAdd',
          def: rng.pick(EDIT_PROPS.placeable),
          x,
          z,
          rotY: rng.range(-7, 7),
          scale: rng.range(0.5, 1.6),
          ...(rng.chance(0.3) ? { variant: rng.int(0, 2) } : {}),
        });
      else if (t < 0.93)
        cmds.push({
          k: 'propRemove',
          id: rng.chance(0.5) ? rng.int(0, 3000) : EDIT_PROP_ID_BASE + rng.int(0, 40),
        });
      else
        cmds.push({
          k: 'propMove',
          id: rng.chance(0.5) ? rng.int(0, 3000) : EDIT_PROP_ID_BASE + rng.int(0, 40),
          x,
          z,
          rotY: rng.range(0, 6),
        });
    }
    return { v: 1, seed: w.seed, cmds };
  };

  it('generateWorld + replay twice → identical editHash; decoded log replays identically', () => {
    const log = randomLog(createRng(7).fork('log'), 120, base);
    const raw = structuredClone(log);
    const a = clone();
    const da = replay(a, log);
    const b = generateWorld(SEED);
    replay(b, structuredClone(raw));
    expect(editHash(a)).toBe(editHash(b));
    expect(editHash(a)).not.toBe(editHash(base));
    const c = clone();
    const dc = replay(c, decodeLog(encodeLog(raw)));
    expect(editHash(c)).toBe(editHash(a));
    expect(dc).toEqual(da);
    // replay wrote the assigned ids back: the applied log round-trips the codec exactly
    expect(decodeLog(encodeLog(log))).toEqual(log);
    // no edit → hashes of generation untouched (headroom does not leak into hashes)
    expect(editHash(clone())).toBe(editHash(generateWorld(SEED)));
  });

  it('codec: canonical round trip, URL-safe, versioned, < 4 KB for 200 commands', () => {
    const rng = createRng(11).fork('codec');
    const log = randomLog(rng, 200, base);
    const canon: EditLog = { ...log, cmds: log.cmds.map((c) => canonicalCmd(c) as EditCommand) };
    const s = encodeLog(log);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeLog(s)).toEqual(canon);
    expect(encodeLog(decodeLog(s))).toBe(s);
    console.info(`edit log: 200 mixed commands → ${s.length} chars`);
    expect(s.length).toBeLessThan(4096);
    // a 200-sample brush stroke is much smaller
    const stroke: EditLog = {
      v: 1,
      seed: 42,
      cmds: Array.from({ length: 200 }, (_, k) => ({
        k: 'raise' as const,
        x: k * 3.1 - 300,
        z: 40 + Math.sin(k) * 20,
        r: 12,
        s: 1.5,
      })),
    };
    expect(encodeLog(stroke).length).toBeLessThan(2000);
    expect(() => decodeLog('Ag')).toThrow();
    expect(() => decodeLog('Zm9v!')).toThrow();
    expect(() =>
      encodeLog({ v: 1, seed: 1, cmds: [{ k: 'patch', data: undefined as never }] }),
    ).toThrow();
    expect(() => replay(clone(), { v: 1, seed: 43, cmds: [] })).toThrow();
  });

  it('fuzz: 1 000 seeded commands never throw, heights stay finite, undo-all restores the world', () => {
    const w = clone();
    const h0 = editHash(w);
    const log = randomLog(createRng(1234).fork('fuzz'), 1000, w);
    const undo: EditCommand[][] = [];
    let applied = 0;
    for (const cmd of log.cmds) {
      const r = applyEdit(w, cmd);
      if (r.ok) applied++;
      undo.push(r.inverse);
    }
    for (const v of w.height.data) expect(Number.isFinite(v)).toBe(true);
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of w.height.data) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(lo).toBeGreaterThanOrEqual(-40);
    expect(hi).toBeLessThanOrEqual(EDIT_BRUSH.maxY);
    // every land sample belongs to an island (zones read islands[islandMap − 1])
    for (let i = 0; i < N * N; i++)
      if (w.height.data[i] > 0) expect(w.islandMap[i]).toBeGreaterThan(0);
    console.info(`fuzz: ${applied}/1000 commands applied`);
    expect(applied).toBeGreaterThan(400);
    for (let k = undo.length - 1; k >= 0; k--) for (const inv of undo[k]) applyEdit(w, inv);
    expect(editHash(w)).toBe(h0);
  });
});

describe('prop store growth', () => {
  it('generation allocates headroom; growPropStore keeps identity and data', () => {
    const w = clone();
    const s = w.props;
    expect(s.editBase).toBe(s.count);
    expect(propCapacity(s)).toBe(s.count + EDIT_PROPS.propHeadroom);
    const x = s.x[3];
    expect(growPropStore(s, EDIT_PROPS.propHeadroom + 10)).toBe(true);
    expect(w.props).toBe(s);
    expect(s.x[3]).toBe(x);
    expect(propCapacity(s)).toBeGreaterThanOrEqual(s.count + EDIT_PROPS.propHeadroom + 10);
    expect(s.x[s.count]).toBe(0);
  });

  it('appending past the headroom grows in place', () => {
    const w = clone();
    const s = w.props;
    s.x = s.x.slice(0, s.count); // simulate a full store: capacity = count
    for (const k of [
      'defId',
      'variant',
      'y',
      'z',
      'rotY',
      'scale',
      'islandId',
      'chunkId',
      'flags',
    ] as const)
      (s[k] as unknown) = s[k].slice(0, s.count);
    const p = placeable(w, 'bush', 5);
    expect(applyEdit(w, { k: 'propAdd', def: 'bush', ...p, rotY: 0, scale: 1 }).ok).toBe(true);
    expect(w.props).toBe(s);
    expect(s.defId[s.count - 1]).toBe(PROP_DEF_INDEX.bush);
  });
});

describe('brush shape (sweep defect 6): terrain, not a balloon', () => {
  it('raise falloff is modulated by a fixed per-seed field (lobed outline), bounded by maxDelta', () => {
    const w = clone();
    const p = inland(w, 13);
    const h0 = w.height.data.slice();
    const r = 16;
    const s = 3;
    expect(applyEdit(w, { k: 'raise', x: p.x, z: p.z, r, s }).ok).toBe(true);
    const { amp, stretch } = EDIT_BRUSH.noise;
    const fall = (t2: number): number => (t2 >= 1 ? 0 : Math.pow(1 - t2, EDIT_BRUSH.falloffPower));
    // Δh / (s · w(t)) on a ring: 1 for a round brush, here it varies around the ring
    const ring: number[] = [];
    const rc = r / 2;
    const cx = Math.round((p.x - w.height.originX) / w.height.cellSize);
    const cz = Math.round((p.z - w.height.originZ) / w.height.cellSize);
    for (let dz = -rc; dz <= rc; dz++)
      for (let dx = -rc; dx <= rc; dx++) {
        const t2 = (dx * dx + dz * dz) / (rc * rc);
        if (t2 >= 1) continue;
        const i = (cz + dz) * N + cx + dx;
        if (h0[i] > EDIT_BRUSH.softCap) continue;
        const d = w.height.data[i] - h0[i];
        expect(d).toBeLessThanOrEqual(EDIT_BRUSH.maxDelta);
        expect(d).toBeLessThanOrEqual(s * (1 + 1.5 * amp) * fall(t2) + 1e-4);
        const k = 1 + stretch;
        expect(d).toBeGreaterThanOrEqual(s * (1 - 1.5 * amp) * fall(t2 * k * k) - 1e-4);
        if (t2 > 0.25 && t2 < 0.5) ring.push(d / (s * fall(t2)));
      }
    expect(ring.length).toBeGreaterThan(30);
    expect(Math.max(...ring) - Math.min(...ring)).toBeGreaterThan(0.2);
    // same seed, same command → same bits (the field is per seed, not per call)
    const w2 = clone();
    applyEdit(w2, { k: 'raise', x: p.x, z: p.z, r, s });
    expect(editHash(w2)).toBe(editHash(w));
  });

  it('stacked raises taper above softCap; the inverse of a capped raise is byte-exact', () => {
    const w = clone();
    const p = inland(w, 17);
    const i = p.i;
    let last = 0;
    for (let k = 0; k < 30 && w.height.data[i] < EDIT_BRUSH.softCap + EDIT_BRUSH.capRamp; k++) {
      const before = w.height.data[i];
      applyEdit(w, { k: 'raise', x: p.x, z: p.z, r: 14, s: 4 });
      last = w.height.data[i] - before;
    }
    expect(w.height.data[i]).toBeGreaterThanOrEqual(EDIT_BRUSH.softCap + EDIT_BRUSH.capRamp);
    expect(last).toBeGreaterThan(0);
    const y0 = w.height.data[i];
    roundTrip(w, { k: 'raise', x: p.x, z: p.z, r: 14, s: 4 });
    const d = w.height.data[i] - y0;
    // full taper: × capScale of the (noise-modulated) stroke
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(4 * (1 + 1.5 * EDIT_BRUSH.noise.amp) * EDIT_BRUSH.capScale);
  });
});

describe('protected ground (sweep defect 3): piers, moorings and plazas never rise', () => {
  const pierCells = (w: WorldData, d: WorldData['docks'][number]): number[] => {
    const out: number[] = [];
    const L = d.segments * DOCK.segment;
    for (let t = 0; t <= L; t += 0.5) {
      const x = d.x + Math.cos(d.rotY) * t;
      const z = d.z + Math.sin(d.rotY) * t;
      const ix = Math.round((x - w.height.originX) / w.height.cellSize);
      const iz = Math.round((z - w.height.originZ) / w.height.cellSize);
      out.push(iz * N + ix);
    }
    return Array.from(new Set(out));
  };

  it('a raise over a pier leaves every pier sample untouched and refuses when only the pier is hit', () => {
    expect(EDIT_BRUSH.protect.list).toEqual(['dock', 'mooring', 'plaza']);
    const w = clone();
    expect(w.docks.length).toBeGreaterThan(0);
    for (const d of w.docks) {
      const cells = pierCells(w, d);
      const h0 = cells.map((i) => w.height.data[i]);
      const L = d.segments * DOCK.segment;
      const mx = d.x + Math.cos(d.rotY) * (L / 2);
      const mz = d.z + Math.sin(d.rotY) * (L / 2);
      const before = snap(w);
      const r = applyEdit(w, { k: 'raise', x: mx, z: mz, r: 16, s: 4 });
      expect(cells.map((i) => w.height.data[i])).toEqual(h0);
      if (r.ok) {
        // the free samples around the pier did rise; undo is exact
        expect(r.inverse.length).toBe(1);
        for (const inv of r.inverse) applyEdit(w, inv);
        expectSame(before, snap(w));
      }
      // flatten towards a high target over the pier: no sample under it rises either
      applyEdit(w, { k: 'flatten', x: d.x, z: d.z, r: 8, s: 6 });
      expect(cells.every((i, k) => w.height.data[i] <= h0[k])).toBe(true);
    }
    // a 2 u brush on the pier middle only hits protected samples → refused, world untouched
    const d = w.docks[0];
    const mid = { x: d.x + Math.cos(d.rotY) * 2, z: d.z + Math.sin(d.rotY) * 2 };
    const h = editHash(w);
    const r = applyEdit(w, { k: 'raise', ...mid, r: 2, s: 4 });
    expect(r).toMatchObject({ ok: false, reason: 'dock', inverse: [] });
    expect(editHash(w)).toBe(h);
    // lowering stays allowed (floods are the render side's business)
    const lo = applyEdit(w, { k: 'lower', ...mid, r: 2, s: 1 });
    expect(lo.ok).toBe(true);
    expect(editHash(w)).not.toBe(h);
  });

  it('moorings and the plaza are protected; brushes beside them still work', () => {
    const w = clone();
    const m = w.moorings[0];
    expect(m).toBeDefined();
    const at = (x: number, z: number): number =>
      Math.round((z - w.height.originZ) / w.height.cellSize) * N +
      Math.round((x - w.height.originX) / w.height.cellSize);
    const hm = w.height.data[at(m.x, m.z)];
    applyEdit(w, { k: 'raise', x: m.x, z: m.z, r: 10, s: 4 });
    expect(w.height.data[at(m.x, m.z)]).toBe(hm);
    const plaza = w.settlements.find((s) => s.plaza)?.plaza;
    expect(plaza).toBeDefined();
    if (!plaza) return;
    const hp = w.height.data[at(plaza.x, plaza.z)];
    const r = applyEdit(w, { k: 'raise', x: plaza.x, z: plaza.z, r: Math.min(plaza.r, 4), s: 4 });
    expect(r).toMatchObject({ ok: false, reason: 'plaza' });
    applyEdit(w, { k: 'raise', x: plaza.x, z: plaza.z, r: plaza.r + 12, s: 4 });
    expect(w.height.data[at(plaza.x, plaza.z)]).toBe(hp);
  });
});

describe('placement on edited land (sweep: cottage never accepted)', () => {
  it('a flattened islet in open water accepts a cottage', () => {
    const w = clone();
    // open water with no prop (sunken ships, buoys) within 12 u
    const free = (i: number): boolean => {
      if (w.shoreSdf[i] > -60) return false;
      const x = cellX(i % N);
      const z = cellZ(Math.floor(i / N));
      const s = w.props;
      for (let k = 0; k < s.count; k++) if (Math.hypot(s.x[k] - x, s.z[k] - z) < 12) return false;
      return true;
    };
    const p = findCell(w, (i) => free(i), 5);
    for (let k = 0; k < 16 && w.height.data[p.i] < 3; k++)
      applyEdit(w, { k: 'raise', x: p.x, z: p.z, r: 20, s: 4 });
    expect(w.height.data[p.i]).toBeGreaterThan(0);
    for (let k = 0; k < 8; k++) applyEdit(w, { k: 'flatten', x: p.x, z: p.z, r: 12, s: 2 });
    const cottage: EditCommand = { k: 'propAdd', def: 'cottage', ...xz(p), rotY: 0, scale: 1.1 };
    expect(canPlace(w, cottage)).toMatchObject({ ok: true });
    expect(applyEdit(w, cottage).ok).toBe(true);
    expect(w.props.y[w.props.count - 1]).toBeGreaterThan(0);
  });

  it('occupancy uses the real footprint (no whole-cell rounding)', () => {
    const occ = createOccupancy();
    occ.data[occ.n * 200 + 200] = 2; // one structure cell, x/z ∈ [cell 200, 201)
    const x0 = occ.originX + 201; // its +x edge
    const z = occ.originZ + 200.5;
    const r = PROP_DEFS[PROP_DEF_INDEX.cottage].footprint; // 2.1 u
    expect(occ.isFreeDisc(x0 + r - 0.05, z, r)).toBe(false);
    expect(occ.isFreeDisc(x0 + r + 0.05, z, r)).toBe(true);
    // the scatter test rounds 2.1 u up to 3 cells plus slack
    expect(occ.isFree(x0 + r + 0.05, z, r)).toBe(false);
    // a cottage on top of a landmark stays occupied
    const w = clone();
    const lm = w.landmarks[0];
    expect(
      canPlace(w, { k: 'propAdd', def: 'cottage', x: lm.x, z: lm.z, rotY: 0, scale: 1 }),
    ).toMatchObject({ ok: false, reason: 'occupied' });
  });
});
