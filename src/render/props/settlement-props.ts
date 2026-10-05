import { createRng, type Rng } from '../../core/rng.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { THEMES } from '../../content/themes.ts';
import { LANDMARK_RENDER } from '../../content/landmark-render.ts';
import {
  EMITTERS,
  FIXTURE_EMITTERS,
  INTERIOR_OF,
  OFFICE_DEFS,
  type EmitterSpot,
} from '../../content/offices.ts';
import { FLOATING_FIXTURES } from '../../content/settlements.ts';
import { createPropStore, PropFlag, type PropStore } from '../../world/prop-store.ts';
import { heightAt, type DistrictKind, type WorldData } from '../../world/types.ts';
import { lotLocalToWorld, lotPivotY, lotYaw } from '../../world/lot-frame.ts';
import { chunkIdAt } from '../../world/gen/scatter.ts';

/**
 * Settlement geometry as prop instances: lots, landmarks, dock segments, fence
 * segments, fixtures, plus a seeded decor pass (laundry, lanterns, bunting,
 * barrels, benches). Appended to the scattered PropStore for the batcher.
 * Phase 3 (TASK-304): office lots also get their interior (content/offices INTERIOR_OF), their
 * emitters (EMITTERS) and theme decor (THEMES[theme].decor); landmarks take the island theme's
 * `landmarkVariant`. Themed extras draw from their own RNG fork so the legacy decor stream
 * (and every pre-Phase-3 world) is unchanged.
 * M14b (TASK-373): `world.districts` emit lattice props (solar rows) after everything else, and
 * polylines of kind 'pipe' draw pipe segments through the fence loop (elbows on right-angle bends).
 * TASK-380: plaza decor from `THEMES[theme].plazaDecor`, floating fixtures at the waterline,
 * steam on fixtures / scattered props (FIXTURE_EMITTERS), boardwalk paths as dock planks.
 */

export interface SettlementEmitters {
  /**
   * Smoke / steam emitters of lot buildings (content/offices EMITTERS) and of single props
   * (FIXTURE_EMITTERS). `lot`: index into `world.lots` (the emitter's building; it follows the
   * lot's flood state), −1 for a single prop; `prop`: the owner's render index when it is not a lot.
   */
  chimneys: {
    x: number;
    y: number;
    z: number;
    lot: number;
    prop?: number;
    preset: EmitterSpot['preset'];
  }[];
}

/**
 * Render indices that belong together (sweep D1: a flooded lot or pier hides as one unit).
 * `lots[l]`: the building of `world.lots[l]` first, then its interior (office lots) and side
 * decor (laundry / barrel / crate; theme decor on office lots). `docks[d]`: the plank segments of `world.docks[d]` (root first), the cargo on them and
 * the lantern post at the root. Lots / docks that pushed nothing have empty lists.
 */
export interface SettlementGroups {
  lots: number[][];
  docks: number[][];
}

export function appendSettlementProps(world: WorldData): {
  props: PropStore;
  emitters: SettlementEmitters;
  groups: SettlementGroups;
} {
  const base = world.props;
  const extra = 4000;
  const s = createPropStore(base.count + extra);
  // copy
  for (let i = 0; i < base.count; i++) {
    s.push(
      base.defId[i],
      base.variant[i],
      base.x[i],
      base.y[i],
      base.z[i],
      base.rotY[i],
      base.scale[i],
      base.islandId[i],
      base.chunkId[i],
      base.flags[i],
    );
  }
  const rng = createRng(world.seed).fork('settlement-decor');
  const themeRng = createRng(world.seed).fork('settlement-theme');
  const h = world.height;
  const chimneys: SettlementEmitters['chimneys'] = [];
  const groups: SettlementGroups = { lots: [], docks: [] };
  /** Steam of a single prop (FIXTURE_EMITTERS) at render index `r`: local spot × yaw × scale. */
  const propEmitters = (r: number, defName: string): void => {
    const spots = r >= 0 ? FIXTURE_EMITTERS[defName] : undefined;
    if (!spots) return;
    const sc = s.scale[r];
    const c = Math.cos(s.rotY[r]);
    const sn = Math.sin(s.rotY[r]);
    for (const e of spots[s.variant[r] % spots.length]) {
      // three's yaw about +y: local (x, z) → (x cos + z sin, −x sin + z cos)
      const x = s.x[r] + (e.x * c + e.z * sn) * sc;
      const z = s.z[r] + (-e.x * sn + e.z * c) * sc;
      chimneys.push({ x, y: s.y[r] + e.y * sc, z, lot: -1, prop: r, preset: e.preset });
    }
  };
  /** Push into a group (`push` returns −1 when the def is unknown or the store is full). */
  const into = (g: number[], r: number): void => {
    if (r >= 0) g.push(r);
  };
  const push = (
    defName: string,
    x: number,
    z: number,
    rotY: number,
    scale: number,
    islandId: number,
    y?: number,
    variant?: number,
    r: Rng = rng,
  ): number => {
    const defIndex = PROP_DEF_INDEX[defName];
    if (defIndex === undefined) return -1;
    const def = PROP_DEFS[defIndex];
    if (s.count >= s.defId.length - 1) return -1;
    const v = variant ?? r.int(0, def.variants - 1);
    return s.push(
      defIndex,
      v,
      x,
      y ?? heightAt(h, x, z),
      z,
      rotY,
      scale,
      islandId,
      chunkIdAt(x, z),
      // interiors are never clustered into T0 blobs (whatever their def flags say)
      def.interior ? def.flags & ~PropFlag.clusterable : def.flags,
    );
  };
  const facing = (rotY: number): [number, number] => [Math.cos(rotY), Math.sin(rotY)];

  for (let i = 0; i < base.count; i++) propEmitters(i, PROP_DEFS[base.defId[i]]?.id ?? '');
  // lots
  for (const [li, lot] of world.lots.entries()) {
    const group: number[] = [];
    groups.lots.push(group);
    // geometry has its door on local +z → rotate so the door faces rotY (world/lot-frame.ts)
    const yaw = lotYaw(lot);
    const y0 = lotPivotY(lot, h);
    // variant = worldgen's roof-colour pick (neighbours never share a roof colour)
    const house = push(lot.defId, lot.x, lot.z, yaw, 1, lot.islandId, y0, lot.variant);
    into(group, house);
    // an unknown def (geometry not landed yet) gets no interior, smoke or decor
    if (house < 0) continue;
    const inner = INTERIOR_OF[lot.defId];
    if (inner) into(group, push(inner.def, lot.x, lot.z, yaw, 1, lot.islandId, y0, inner.variant));
    // emitter y is above the building's pivot
    for (const e of EMITTERS[lot.defId] ?? []) {
      const p = lotLocalToWorld(lot, e.x, e.z);
      chimneys.push({ x: p.x, y: y0 + e.y, z: p.z, lot: li, preset: e.preset });
    }
    if (lot.defId === 'cottage' || lot.defId === 'logCabin' || lot.defId === 'towerHouse') {
      const [fx, fz] = facing(lot.rotY);
      // decor beside the house: laundry line or barrel/crate
      const side = rng.chance(0.5) ? 1 : -1;
      const sx = lot.x - fz * side * (lot.w / 2 + 2.4);
      const sz = lot.z + fx * side * (lot.w / 2 + 2.4);
      if (rng.chance(0.45)) into(group, push('laundryLine', sx, sz, lot.rotY, 1, lot.islandId));
      else if (rng.chance(0.6))
        into(
          group,
          push(
            rng.chance(0.5) ? 'barrel' : 'crate',
            sx,
            sz,
            rng.range(0, Math.PI * 2),
            1,
            lot.islandId,
          ),
        );
    } else if (OFFICE_DEFS[lot.defId] && lot.kind !== 'hut') {
      // theme decor: 1–2 items beside the building, one per side
      const decor = THEMES[world.islands[lot.islandId].theme].decor;
      const n = themeRng.chance(0.5) ? 2 : 1;
      const side0 = themeRng.chance(0.5) ? 1 : -1;
      for (let k = 0; k < n; k++) {
        const side = k === 0 ? side0 : -side0;
        const p = lotLocalToWorld(
          lot,
          side * (lot.w / 2 + 1.2),
          themeRng.range(-lot.d / 4, lot.d / 4),
        );
        const name = weighted(themeRng, decor);
        const rot = themeRng.range(0, Math.PI * 2);
        if (!name || heightAt(h, p.x, p.z) < 0.2) continue; // never on the water
        into(group, push(name, p.x, p.z, rot, 1, lot.islandId, undefined, undefined, themeRng));
      }
    }
  }
  // landmarks
  for (const lm of world.landmarks) {
    const m = LANDMARK_RENDER[lm.kind];
    const def = m && PROP_DEFS[PROP_DEF_INDEX[m.def]];
    if (!m || !def) continue;
    const yaw = Math.atan2(Math.cos(lm.rotY), Math.sin(lm.rotY));
    // rolled even when the theme overrides it: keeps the decor stream of the world stable
    const rolled = rng.int(0, def.variants - 1);
    const ov = THEMES[world.islands[lm.islandId].theme].landmarkVariant[lm.kind];
    push(
      m.def,
      lm.x,
      lm.z,
      yaw,
      m.scale,
      lm.islandId,
      m.underwater ? heightAt(h, lm.x, lm.z) : undefined,
      // a planner / theme override past the def's variants (geometry not landed yet) is ignored
      lm.variant !== undefined && lm.variant < def.variants
        ? lm.variant
        : ov !== undefined && ov < def.variants
          ? ov
          : rolled,
    );
  }
  // docks: 2 u plank segments along the facing, planks at the waterline (pivot y = 0)
  for (const d of world.docks) {
    const group: number[] = [];
    groups.docks.push(group);
    const [fx, fz] = facing(d.rotY);
    // dock planks span local +x → rotate so +x points seaward
    const yaw = Math.atan2(-fz, fx);
    for (let k = 0; k < d.segments; k++) {
      const x = d.x + fx * (k * 2 + 1);
      const z = d.z + fz * (k * 2 + 1);
      into(group, push('dock', x, z, yaw, 1, d.islandId, 0, k === d.segments - 1 ? 1 : 0));
      if (k > 0 && rng.chance(0.25))
        into(
          group,
          push(
            rng.chance(0.5) ? 'barrel' : 'crate',
            x - fz * 0.45,
            z + fx * 0.45,
            rng.range(0, 6.28),
            0.8,
            d.islandId,
            1.0,
          ),
        );
    }
    if (d.segments > 1)
      into(
        group,
        push(
          'lanternPost',
          d.x + fx * 0.6 - fz * 0.5,
          d.z + fz * 0.6 + fx * 0.5,
          yaw,
          0.9,
          d.islandId,
        ),
      );
  }
  // fences (and M14b pipes, kind 'pipe') along polylines: segments span local +x
  for (const f of world.fences) {
    const seg = LINE_SEGMENT[f.kind] ?? LINE_SEGMENT.fence;
    const pts = f.points;
    const n = f.closed ? pts.length : pts.length - 1;
    // right-angle bends of open lines with an elbow variant: elbow yaw per vertex (NaN = none)
    const elbowYaw = pts.map((a, i) => {
      if (seg.elbow === undefined || f.closed || i === 0 || i === pts.length - 1) return NaN;
      const p = pts[i - 1];
      const b = pts[i + 1];
      const li = Math.hypot(a.x - p.x, a.z - p.z);
      const lo = Math.hypot(b.x - a.x, b.z - a.z);
      if (li < 2 || lo < 2) return NaN;
      const [ux, uz] = [(a.x - p.x) / li, (a.z - p.z) / li];
      const [ox, oz] = [(b.x - a.x) / lo, (b.z - a.z) / lo];
      const turn = Math.atan2(ux * oz - uz * ox, ux * ox + uz * oz);
      if (Math.abs(Math.abs(turn) - Math.PI / 2) > ELBOW_TOLERANCE) return NaN;
      // the elbow joins local −x → +z (its arms reach 1 u): local +x along the way in for a
      // left turn, along the reversed way out for a right turn (walked +z → −x)
      return turn > 0 ? Math.atan2(-uz, ux) : Math.atan2(oz, -ox);
    });
    let carry = 0;
    let made = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) continue;
      const yaw = Math.atan2(-dz, dx); // fence rails span local +x
      if (!Number.isNaN(elbowYaw[i])) {
        push(seg.def, a.x, a.z, elbowYaw[i], 1, f.islandId, undefined, seg.elbow);
        carry = 1;
      }
      const stop = len - (Number.isNaN(elbowYaw[i + 1]) ? 0 : 1);
      for (let t = carry; t + seg.len <= stop + 1e-3; t += seg.len) {
        const x = a.x + (dx / len) * (t + seg.len / 2);
        const z = a.z + (dz / len) * (t + seg.len / 2);
        // fences roll their variant from the decor stream (unchanged); listed variants cycle
        const v = seg.variants ? seg.variants[made++ % seg.variants.length] : undefined;
        push(seg.def, x, z, yaw, 1, f.islandId, undefined, v);
        carry = t + seg.len - len;
      }
      if (carry < 0) carry = 0;
    }
  }
  // fixtures (well, buoy, tidePool, messageBottle …)
  for (const fx of world.fixtures) {
    const yaw = Math.atan2(Math.cos(fx.rotY), Math.sin(fx.rotY));
    const def = PROP_DEFS[PROP_DEF_INDEX[fx.defId]];
    if (!def) continue;
    const y = FLOATING_FIXTURES.includes(fx.defId) ? 0 : undefined;
    // rolled even when the planner chose one: keeps the decor stream of the world stable
    const rolled = rng.int(0, def.variants - 1);
    const v = fx.variant !== undefined && fx.variant < def.variants ? fx.variant : rolled;
    propEmitters(push(fx.defId, fx.x, fx.z, yaw, 1, fx.islandId, y, v), fx.defId);
  }
  // plaza decor (every campus quad, THEMES[theme].plazaDecor): posts at the rim, seats between
  // them, `across` items halfway in. The rolls are made even for a null def (stable stream).
  for (const st of world.settlements) {
    if (!st.plaza) continue;
    const { x, z, r } = st.plaza;
    const pd = THEMES[world.islands[st.islandId].theme].plazaDecor;
    const n = 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(0, 0.6);
      if (pd.posts)
        push(pd.posts, x + Math.cos(a) * (r - 0.8), z + Math.sin(a) * (r - 0.8), a, 1, st.islandId);
      if (rng.chance(0.7) && pd.seats) {
        const b = a + Math.PI / n;
        push(
          pd.seats,
          x + Math.cos(b) * (r - 1.2),
          z + Math.sin(b) * (r - 1.2),
          b + Math.PI / 2,
          1,
          st.islandId,
        );
      }
    }
    for (let i = 0; i < 2; i++) {
      const a = rng.range(0, Math.PI * 2);
      if (pd.across)
        push(
          pd.across,
          x + Math.cos(a) * r * 0.5,
          z + Math.sin(a) * r * 0.5,
          a + Math.PI / 2,
          1,
          st.islandId,
        );
    }
  }
  // lantern posts along paths (every ~5th node, per-theme density)
  const nodes = world.pathGraph.nodes;
  for (let i = 0; i < nodes.length / 2; i += 5) {
    const x = nodes[i * 2];
    const z = nodes[i * 2 + 1];
    if (!Number.isFinite(x)) continue;
    const isl =
      world.islandMap[
        Math.round((z - h.originZ) / h.cellSize) * h.n + Math.round((x - h.originX) / h.cellSize)
      ] - 1;
    if (isl < 0) continue;
    const theme = world.islands[isl]?.theme;
    const p = theme ? THEMES[theme].pathLanterns : 0;
    if (!(p > 0) || !rng.chance(p)) continue;
    push(
      'lanternPost',
      x + rng.range(-1.2, 1.2),
      z + rng.range(-1.2, 1.2),
      rng.range(0, 6.28),
      1,
      isl,
    );
  }
  // districts (M14b): lattice props over the district rectangle (e.g. solar rows). Last, from
  // their own RNG fork, so every earlier store index and the decor stream stay unchanged.
  const districtRng = createRng(world.seed).fork('settlement-districts');
  for (const dist of world.districts) {
    const lat = DISTRICT_LATTICE[dist.kind];
    if (!lat) continue;
    const [ax, az] = facing(dist.rotY); // rows run along `d`
    const yaw = Math.atan2(-az, ax); // row segments span local +x (like fence rails)
    const rows = Math.max(1, Math.floor((dist.w - 2 * lat.margin) / lat.pitch) + 1);
    const segs = Math.max(1, Math.floor((dist.d - 2 * lat.margin) / lat.len));
    for (let r = 0; r < rows; r++) {
      const across = (r - (rows - 1) / 2) * lat.pitch;
      for (let k = 0; k < segs; k++) {
        const along = (k - (segs - 1) / 2) * lat.len;
        const x = dist.x + ax * along - az * across;
        const z = dist.z + az * along + ax * across;
        if (heightAt(h, x, z) < 0.2) continue; // never on the water
        push(lat.def, x, z, yaw, 1, dist.islandId, undefined, undefined, districtRng);
      }
    }
  }
  // boardwalk paths (stilt lab → shore): dock planks at the waterline every 2 u, last so every
  // earlier store index stays put; variants fixed (no decor rolls)
  for (const p of world.paths) {
    if (p.kind !== 'boardwalk') continue;
    const pts = p.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1e-3) continue;
      const fx = (b.x - a.x) / len;
      const fz = (b.z - a.z) / len;
      const k = Math.max(1, Math.round(len / 2));
      for (let j = 0; j < k; j++) {
        const t = ((j + 0.5) / k) * len;
        push('dock', a.x + fx * t, a.z + fz * t, Math.atan2(-fz, fx), 1, p.islandId, 0, 0);
      }
    }
  }
  return { props: s, emitters: { chimneys }, groups };
}

/**
 * Polyline kind → segment def, length (u) and the variants to cycle (pipe: the straight ones,
 * geo/themes/devops.ts spans x ∈ [−1, 1]). Unlisted kinds draw fences (pre-M14b behaviour).
 * TODO(content): move to src/content.
 */
const LINE_SEGMENT: Readonly<
  Record<string, { def: string; len: number; variants?: readonly number[]; elbow?: number }>
> = {
  fence: { def: 'fence', len: 1.5 },
  pipe: { def: 'pipe', len: 2, variants: [0, 2], elbow: 1 },
};
/** A polyline bend within this of 90° (rad) gets the line's elbow variant. */
const ELBOW_TOLERANCE = 0.45;

/**
 * District kind → lattice of row segments: `pitch` between rows (across `w`), `len` per segment
 * (along `d`), `margin` kept free at the rectangle edges. Unknown defs push nothing (−1).
 * solarRow (geo/themes/coding.ts) spans local x: 3 or 4 panels = 3.5 / 4.7 u, 1.25 u deep.
 * TODO(content): move to src/content.
 */
const DISTRICT_LATTICE: Readonly<
  Partial<Record<DistrictKind, { def: string; pitch: number; len: number; margin: number }>>
> = {
  solar: { def: 'solarRow', pitch: 3, len: 5, margin: 1.5 },
};

/** Weighted pick from `[id, weight]` pairs (null when empty). */
function weighted(r: Rng, list: readonly (readonly [string, number])[]): string | null {
  let total = 0;
  for (const [, w] of list) total += w;
  let t = r.next() * total;
  for (const [id, w] of list) {
    t -= w;
    if (t < 0) return id;
  }
  return list.length ? list[list.length - 1][0] : null;
}
