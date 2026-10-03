import * as THREE from 'three';
import { GULLS, LIFE_PLAN } from '../content/life.ts';
import type { System } from '../core/loop.ts';
import { AmbientScheduler } from './ambient.ts';
import {
  ArcKind,
  dolphinArcCfg,
  dolphinGeometry,
  fishArcCfg,
  pickDolphinSpot,
  pickJumpSpot,
} from './arcs.ts';
import type { AgentKind } from './agents.ts';
import { findMoorings, resolveRoutes, Rowboats, Sailboats } from './boats.ts';
import { makeCtx, setMotion, type LifeDeps } from './ctx.ts';
import { FishSchools } from './fish.ts';
import { flockCentres, Gulls, type Perch } from './gulls.ts';

export type { LifeDeps } from './ctx.ts';
export { AmbientScheduler } from './ambient.ts';
export type { AmbientEvent, AmbientType } from './ambient.ts';

export interface LifeSystem extends System {
  readonly group: THREE.Group;
  fixedUpdate(dt: number): void;
  update(dt: number, alpha: number): void;
  onTier(tier: number): void;
  dispose(): void;
  /** Reduced motion: 0.3, normal: 1. */
  setMotionScale(s: number): void;
  /** Fish scatter point (world xz) or null. */
  setCursorWorld(x: number | null, z?: number | null): void;
  readonly stats: { agents: number };
  readonly ambient: AmbientScheduler;
  /** Kinds by name, for tests / debug / the reaction layer. */
  readonly kinds: {
    sailboats?: Sailboats;
    rowboats?: Rowboats;
    gulls?: Gulls;
    fish?: FishSchools;
    jumpers?: ArcKind;
    dolphins?: ArcKind;
  };
  /** Seaward dock-end / mooring perches used by landing gulls. */
  readonly counts: { coconutDrops: number };
}

export function createLife(deps: LifeDeps): LifeSystem {
  const ctx = makeCtx(deps);
  const plan = LIFE_PLAN[deps.quality];
  const group = new THREE.Group();
  group.name = 'life';
  const base = { seed: deps.seed, scope: deps.scope, group, cameraPos: deps.cameraPos };
  const kinds: LifeSystem['kinds'] = {};
  const all: AgentKind[] = [];

  const routes = resolveRoutes(ctx);
  if (routes.length > 0 && plan.sailboats > 0) {
    kinds.sailboats = new Sailboats(base, ctx, routes, plan.sailboats);
    all.push(kinds.sailboats);
  }
  const moorings = findMoorings(ctx, ctx.rngFor('moorings'), plan.rowboats);
  if (moorings.length > 0) {
    kinds.rowboats = new Rowboats(base, ctx, moorings);
    all.push(kinds.rowboats);
  }

  const perches: Perch[] = [];
  for (const d of ctx.world.docks ?? []) {
    const reach = d.segments * 2 * 0.9;
    perches.push({
      x: d.x + Math.sin(d.rotY) * reach,
      y: GULLS.land.perchY,
      z: d.z + Math.cos(d.rotY) * reach,
    });
  }
  for (const m of moorings) perches.push({ x: m.x, y: 0.9, z: m.z });
  const centres = flockCentres(ctx, ctx.rngFor('flocks'));
  if (centres.length > 0 && plan.flocks > 0) {
    kinds.gulls = new Gulls(base, ctx, deps.quality, centres, perches);
    all.push(kinds.gulls);
  }
  if (plan.schools > 0) {
    kinds.fish = new FishSchools(base, ctx, deps.quality);
    all.push(kinds.fish);
  }
  if (plan.jumpers > 0) {
    kinds.jumpers = new ArcKind(base, ctx, 'jumper', plan.jumpers, fishArcCfg);
    all.push(kinds.jumpers);
  }
  if (plan.dolphins > 0) {
    kinds.dolphins = new ArcKind(
      { ...base, geometry: dolphinGeometry() },
      ctx,
      'dolphin',
      plan.dolphins,
      dolphinArcCfg,
    );
    all.push(kinds.dolphins);
  }

  const ambient = new AmbientScheduler(deps.seed);
  const spotRng = ctx.rngFor('spots');
  const counts = { coconutDrops: 0 };
  ambient.on('fishJump', (e) => {
    if (!kinds.jumpers || deps.getTier() < 2) return;
    const s = pickJumpSpot(ctx, spotRng, e.r);
    if (s) kinds.jumpers.trigger(s.x, s.z, s.dx, s.dz);
  });
  ambient.on('gullLand', (e) => {
    kinds.gulls?.land(e.r, e.r2);
  });
  ambient.on('coconutDrop', () => {
    counts.coconutDrops++; // placeholder: the prop layer subscribes to drive the real drop
  });
  ambient.on('dolphins', (e) => {
    if (!kinds.dolphins || deps.getTier() < 1) return;
    const s = pickDolphinSpot(ctx, spotRng, e.r);
    if (!s) return;
    kinds.dolphins.trigger(s.x, s.z, s.dx, s.dz, 0);
    kinds.dolphins.trigger(s.x - s.dz * 1.6, s.z + s.dx * 1.6, s.dx, s.dz, 0.1);
  });

  const stats = { agents: 0 };
  const recount = (): number => {
    let n = 0;
    for (const k of all) n += k.liveCount;
    stats.agents = n;
    deps.counters.agents = n;
    return n;
  };
  deps.scope.defer(() => group.removeFromParent());
  recount();

  return {
    name: 'life',
    group,
    kinds,
    ambient,
    counts,
    stats,
    fixedUpdate(dt) {
      kinds.fish?.syncTier(deps.getTier());
      ambient.fixedUpdate();
      for (const k of all) k.fixedUpdate(dt);
    },
    update(_dt, alpha) {
      for (const k of all) k.update(alpha);
      recount();
    },
    onTier(tier) {
      kinds.fish?.syncTier(tier);
    },
    setMotionScale(s) {
      setMotion(ctx, s);
      for (const k of all) k.motionScale = s;
    },
    setCursorWorld(x, z = null) {
      kinds.fish?.setRepel(x, z);
    },
    dispose() {
      group.removeFromParent();
    },
  };
}
