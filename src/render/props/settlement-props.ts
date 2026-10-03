import { createRng } from '../../core/rng.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { createPropStore, type PropStore } from '../../world/prop-store.ts';
import { heightAt, type WorldData } from '../../world/types.ts';
import { chunkIdAt } from '../../world/gen/scatter.ts';

/**
 * Settlement geometry as prop instances: lots, landmarks, dock segments, fence
 * segments, fixtures, plus a seeded decor pass (laundry, lanterns, bunting,
 * barrels, benches). Appended to the scattered PropStore for the batcher.
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

export interface SettlementEmitters {
  chimneys: { x: number; y: number; z: number }[];
}

export function appendSettlementProps(world: WorldData): {
  props: PropStore;
  emitters: SettlementEmitters;
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
  const h = world.height;
  const chimneys: { x: number; y: number; z: number }[] = [];
  const push = (
    defName: string,
    x: number,
    z: number,
    rotY: number,
    scale: number,
    islandId: number,
    y?: number,
    variant?: number,
  ): number => {
    const defIndex = PROP_DEF_INDEX[defName];
    if (defIndex === undefined) return -1;
    const def = PROP_DEFS[defIndex];
    if (s.count >= s.defId.length - 1) return -1;
    const v = variant ?? rng.int(0, def.variants - 1);
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
      def.flags,
    );
  };
  const facing = (rotY: number): [number, number] => [Math.cos(rotY), Math.sin(rotY)];

  // lots
  for (const lot of world.lots) {
    // our prop pivots face +z by convention? geometry faces −z (door on −z) → rotate so the door faces rotY.
    const yaw = Math.atan2(Math.cos(lot.rotY), Math.sin(lot.rotY));
    // variant = worldgen's roof-colour pick (neighbours never share a roof colour)
    push(
      lot.defId,
      lot.x,
      lot.z,
      yaw,
      1,
      lot.islandId,
      lot.kind === 'hut' ? 0 : undefined,
      lot.variant,
    );
    if (lot.defId === 'cottage' || lot.defId === 'logCabin' || lot.defId === 'towerHouse') {
      const [fx, fz] = facing(lot.rotY);
      const y = heightAt(h, lot.x, lot.z);
      chimneys.push({
        x: lot.x - fz * 0.9 + fx * 0.4,
        y: y + (lot.defId === 'towerHouse' ? 6 : 3.6),
        z: lot.z + fx * 0.9 + fz * 0.4,
      });
      // decor beside the house: laundry line or barrel/crate
      const side = rng.chance(0.5) ? 1 : -1;
      const sx = lot.x - fz * side * (lot.w / 2 + 2.4);
      const sz = lot.z + fx * side * (lot.w / 2 + 2.4);
      if (rng.chance(0.45)) push('laundryLine', sx, sz, lot.rotY, 1, lot.islandId);
      else if (rng.chance(0.6))
        push(
          rng.chance(0.5) ? 'barrel' : 'crate',
          sx,
          sz,
          rng.range(0, Math.PI * 2),
          1,
          lot.islandId,
        );
    }
  }
  // landmarks
  for (const lm of world.landmarks) {
    const m = LANDMARK_DEF[lm.kind];
    if (!m) continue;
    const yaw = Math.atan2(Math.cos(lm.rotY), Math.sin(lm.rotY));
    push(
      m.def,
      lm.x,
      lm.z,
      yaw,
      m.scale,
      lm.islandId,
      m.underwater ? heightAt(h, lm.x, lm.z) : undefined,
    );
  }
  // docks: 2 u plank segments along the facing, planks at the waterline (pivot y = 0)
  for (const d of world.docks) {
    const [fx, fz] = facing(d.rotY);
    // dock planks span local +x → rotate so +x points seaward
    const yaw = Math.atan2(-fz, fx);
    for (let k = 0; k < d.segments; k++) {
      const x = d.x + fx * (k * 2 + 1);
      const z = d.z + fz * (k * 2 + 1);
      push('dock', x, z, yaw, 1, d.islandId, 0, k === d.segments - 1 ? 1 : 0);
      if (k > 0 && rng.chance(0.25))
        push(
          rng.chance(0.5) ? 'barrel' : 'crate',
          x - fz * 0.45,
          z + fx * 0.45,
          rng.range(0, 6.28),
          0.8,
          d.islandId,
          1.0,
        );
    }
    if (d.segments > 1)
      push(
        'lanternPost',
        d.x + fx * 0.6 - fz * 0.5,
        d.z + fz * 0.6 + fx * 0.5,
        yaw,
        0.9,
        d.islandId,
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
  // plaza decor: bunting across + benches + lanterns at the plaza edge
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
  // lantern posts along paths (every ~5th node on villages)
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
    const arch = world.islands[isl]?.archetype;
    if (arch !== 'hearthholm' && arch !== 'millbrook') continue;
    if (!rng.chance(0.6)) continue;
    push(
      'lanternPost',
      x + rng.range(-1.2, 1.2),
      z + rng.range(-1.2, 1.2),
      rng.range(0, 6.28),
      1,
      isl,
    );
  }
  return { props: s, emitters: { chimneys } };
}
