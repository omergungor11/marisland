/**
 * Per-theme settlement planners (M14b, D-029). The archetype supplies the island shape and its
 * anchors; the theme planner decides districts, landmarks, lots and fixtures on it.
 *
 * `buildSettlements` (world/gen/settlements.ts) calls `THEME_PLANNERS[isl.theme]` once per island
 * (wired in TASK-361) with the shared planner state. Until a theme's plan task (TASK-362…368)
 * lands, its planner returns `legacy()` = today's archetype planner + campus, so the world is
 * hash-identical.
 */
import type { Rng } from '../../../core/rng.ts';
import type { IslandData } from '../../types.ts';
import type { SiteCtx, SitePlan } from '../settlements.ts';

export type { SiteCtx, SitePlan };

export interface ThemePlanArgs {
  /** Shared planner state (heightfield, zones, path network, lots, landmarks, docks …). */
  ctx: SiteCtx;
  isl: IslandData;
  /** `rng.fork('sites', isl.id)`: fork further by label, never consume it out of order. */
  rng: Rng;
  /** Index of this island's settlement in `world.settlements` (lots record it). */
  sIdx: number;
  /** Today's behaviour: the archetype planner plus the department campus on top. */
  legacy: () => SitePlan | null;
}

/** Returns the island's plan, or null when the island has no settlement. */
export type ThemePlanner = (a: ThemePlanArgs) => SitePlan | null;
