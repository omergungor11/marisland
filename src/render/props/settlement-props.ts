import { createRng, type Rng } from '../../core/rng.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { THEMES } from '../../content/themes.ts';
import { EMITTERS, INTERIOR_OF, OFFICE_DEFS, type EmitterSpot } from '../../content/offices.ts';
import { createPropStore, PropFlag, type PropStore } from '../../world/prop-store.ts';
import { heightAt, type ThemeId, type WorldData } from '../../world/types.ts';
import { lotLocalToWorld, lotYaw } from '../../world/lot-frame.ts';
import { chunkIdAt } from '../../world/gen/scatter.ts';

/**
 * Settlement geometry as prop instances: lots, landmarks, dock segments, fence
 * segments, fixtures, plus a seeded decor pass (laundry, lanterns, bunting,
 * barrels, benches). Appended to the scattered PropStore for the batcher.
 * Phase 3 (TASK-304): office lots also get their interior (content/offices INTERIOR_OF), their
 * emitters (EMITTERS) and theme decor (THEMES[theme].decor); landmarks take the island theme's
 * `landmarkVariant`. Themed extras draw from their own RNG fork so the legacy decor stream
 * (and every pre-Phase-3 world) is unchanged.
 */
const LANDMARK_DEF: Record<string, { def: string; scale: number; underwater?: boolean }> = {
  lighthouse: { def: 'lighthouse', scale: 1 },
  clocktower: { def: 'clocktower', scale: 1 },
  windmill: { def: 'windmill', scale: 1 },
  hotSpring: { def: 'hotSpring', scale: 1 },
  volcanoCrater: { def: 'volcanoCrater', scale: 1 },
  sunkenShip: { def: 'sunkenShip', scale: 1, underwater: true },
  giantTree: { def: 'giantTree', scale: 1 },
  lonelyPalm: { def: 'palm', scale: 1.35 },
};

/**
 * Path lanterns per theme: chance per sampled path node (every 5th). hq / coding keep the
 * pre-Phase-3 village density. TODO(content): belongs in ThemeDef (content/themes.ts).
 */
const PATH_LANTERNS: Readonly<Record<ThemeId, number>> = {
  hq: 0.6,
  coding: 0.6,
  devops: 0.5,
  marketing: 0.4,
  qa: 0.4,
  design: 0.35,
  research: 0,
};

export interface SettlementEmitters {
  /**
   * Smoke / steam emitters of lot buildings (content/offices EMITTERS). `lot`: index into
   * `world.lots` (the emitter's building; it follows the lot's flood state).
   */
  chimneys: { x: number; y: number; z: number; lot: number; preset: EmitterSpot['preset'] }[];
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

  // lots
  for (const [li, lot] of world.lots.entries()) {
    const group: number[] = [];
    groups.lots.push(group);
    // geometry has its door on local +z → rotate so the door faces rotY (world/lot-frame.ts)
    const yaw = lotYaw(lot);
    const y0 = lot.kind === 'hut' ? 0 : undefined;
    // variant = worldgen's roof-colour pick (neighbours never share a roof colour)
    const house = push(lot.defId, lot.x, lot.z, yaw, 1, lot.islandId, y0, lot.variant);
    into(group, house);
    // an unknown def (geometry not landed yet) gets no interior, smoke or decor
    if (house < 0) continue;
    const inner = INTERIOR_OF[lot.defId];
    if (inner) into(group, push(inner.def, lot.x, lot.z, yaw, 1, lot.islandId, y0, inner.variant));
    // emitter y is above the ground at the lot centre (the building's pivot)
    const baseY = y0 ?? heightAt(h, lot.x, lot.z);
    for (const e of EMITTERS[lot.defId] ?? []) {
      const p = lotLocalToWorld(lot, e.x, e.z);
      chimneys.push({ x: p.x, y: baseY + e.y, z: p.z, lot: li, preset: e.preset });
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
    const m = LANDMARK_DEF[lm.kind];
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
      // an override past the def's variants (geometry not landed yet) is ignored
      ov !== undefined && ov < def.variants ? ov : rolled,
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
  // fences along polylines
  for (const f of world.fences) {
    const pts = f.points;
    const n = f.closed ? pts.length : pts.length - 1;
    let carry = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) continue;
      const yaw = Math.atan2(-dz, dx); // fence rails span local +x
      for (let t = carry; t + 1.5 <= len + 1e-3; t += 1.5) {
        const x = a.x + (dx / len) * (t + 0.75);
        const z = a.z + (dz / len) * (t + 0.75);
        push('fence', x, z, yaw, 1, f.islandId);
        carry = t + 1.5 - len;
      }
      if (carry < 0) carry = 0;
    }
  }
  // fixtures (well, buoy, tidePool, messageBottle …)
  for (const fx of world.fixtures) {
    const yaw = Math.atan2(Math.cos(fx.rotY), Math.sin(fx.rotY));
    const def = PROP_DEFS[PROP_DEF_INDEX[fx.defId]];
    if (!def) continue;
    const y = fx.defId === 'buoy' ? 0 : undefined;
    push(fx.defId, fx.x, fx.z, yaw, 1, fx.islandId, y);
  }
  // plaza decor (every campus quad): bunting across + benches + lanterns at the plaza edge
  for (const st of world.settlements) {
    if (!st.plaza) continue;
    const { x, z, r } = st.plaza;
    const n = 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(0, 0.6);
      push(
        'lanternPost',
        x + Math.cos(a) * (r - 0.8),
        z + Math.sin(a) * (r - 0.8),
        a,
        1,
        st.islandId,
      );
      if (rng.chance(0.7)) {
        const b = a + Math.PI / n;
        push(
          'bench',
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
      push(
        'bunting',
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
    const p = theme ? PATH_LANTERNS[theme] : 0;
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
  return { props: s, emitters: { chimneys }, groups };
}

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
