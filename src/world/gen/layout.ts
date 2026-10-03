import type { Rng } from '../../core/rng.ts';
import { TAU } from '../../core/math/index.ts';
import type { ArchetypeId, IslandData } from '../types.ts';
import { WORLD_SIZE } from '../types.ts';
import { ARCHETYPES } from './params.ts';

export interface LayoutOptions {
  /** 1 = M1 single Hearthholm; 'auto' = archipelago (TASK-111, not yet). */
  islands: 1 | 'auto';
}

export interface Layout {
  windDir: number;
  islands: IslandData[];
}

/** Keep every island's evaluation bounds this far inside the world edge. */
const EDGE_MARGIN = 24;

/**
 * Build one IslandData from an archetype + centre. Radius and bounds come from
 * the archetype table; peak fields are filled by the heightfield stage.
 */
export function makeIsland(
  id: number,
  archetype: ArchetypeId,
  cx: number,
  cz: number,
  rng: Rng,
): IslandData {
  const p = ARCHETYPES[archetype];
  const radius = rng.range(p.diameter[0], p.diameter[1]) / 2;
  const half = radius * p.boundsScale;
  const lim = WORLD_SIZE / 2 - EDGE_MARGIN;
  return {
    id,
    archetype,
    name: p.displayName,
    cx,
    cz,
    radius,
    heightClass: p.heightClass,
    colorClass: p.colorClass,
    peakY: 0,
    peakX: cx,
    peakZ: cz,
    minX: Math.max(-lim, cx - half),
    minZ: Math.max(-lim, cz - half),
    maxX: Math.min(lim, cx + half),
    maxZ: Math.min(lim, cz + half),
    anchors: {},
  };
}

/** M1: a single Hearthholm close to the origin. */
function singleIsland(rng: Rng): IslandData[] {
  const r = rng.fork('island', 0);
  const cx = r.range(-6, 6);
  const cz = r.range(-6, 6);
  return [makeIsland(0, 'hearthholm', cx, cz, r)];
}

/**
 * Layout stage. Every stream is label-forked from `rng` so later stages
 * (and the M2 multi-island layout) never shift existing values.
 */
export function generateLayout(rng: Rng, opts: LayoutOptions): Layout {
  const windDir = rng.fork('wind').range(0, TAU);
  // TODO(TASK-111): 'auto' → 5–7 archetypes, dart-throw with gap r1+r2+40…90,
  // relax, re-centre, neighbour-contrast rule. Each island gets
  // rng.fork('island', id) so adding islands never reshuffles earlier ones.
  const islands = opts.islands === 1 ? singleIsland(rng) : singleIsland(rng);
  return { windDir, islands };
}
