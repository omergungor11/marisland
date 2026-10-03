import * as THREE from 'three';
import { GULLS, LIFE_PLAN, PICK_DEFAULT, PICK_SPHERES } from '../content/life.ts';
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
import { mooringsOf, resolveRoutes, Rowboats, Sailboats } from './boats.ts';
import { makeCtx, setMotion, type LifeDeps } from './ctx.ts';
import { FishSchools } from './fish.ts';
import { flockCentres, Gulls, type Perch } from './gulls.ts';
import { Capybaras, Cats, Crabs, Ducks, Sheep } from './animals.ts';
import type { CritterKind } from './critter-base.ts';
import { Villagers } from './villagers.ts';

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
    parked?: Rowboats;
    gulls?: Gulls;
    fish?: FishSchools;
    jumpers?: ArcKind;
    dolphins?: ArcKind;
    villagers?: Villagers;
    cats?: Cats;
    sheep?: Sheep;
    crabs?: Crabs;
    ducks?: Ducks;
    capybaras?: Capybaras;
  };
  /**
   * Visit every live agent as a pick sphere (centre in world u). Used by the picker; `kind` is the
   * kind's `name`, `index` the instance index inside that kind's InstancedMesh.
   */
  forEachAgent(
    cb: (kind: AgentKind, index: number, x: number, y: number, z: number, r: number) => void,
  ): void;
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
  const moorings = mooringsOf(ctx, 'rowboat', plan.rowboats);
  if (moorings.length > 0) {
    kinds.rowboats = new Rowboats(base, ctx, moorings);
    all.push(kinds.rowboats);
  }
  const parked = mooringsOf(ctx, 'sailboat', plan.parked);
  if (parked.length > 0) {
    kinds.parked = new Rowboats(base, ctx, parked, 'parked');
    all.push(kinds.parked);
  }

  const perches: Perch[] = [];
  for (const d of ctx.world.docks ?? []) {
    const reach = d.segments * 2;
    perches.push({
      x: d.x + Math.cos(d.rotY) * reach,
      y: GULLS.land.perchY,
      z: d.z + Math.sin(d.rotY) * reach,
    });
  }
  for (const l of ctx.world.landmarks ?? []) {
    const top = GULLS.land.landmarkTop[l.kind];
    if (top !== undefined) perches.push({ x: l.x, y: ctx.h(l.x, l.z) + top, z: l.z });
  }
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

  const tiered: CritterKind[] = [];
  const addCritter = (k: CritterKind | undefined): void => {
    if (k && k.capacity > 0) {
      all.push(k);
      tiered.push(k);
    }
  };
  if (ctx.world.pathGraph.nodes.length > 0) {
    const v = plan.villagers;
    const vk = new Villagers(base, ctx, {
      perIsland: [
        { archetype: 'hearthholm', count: v.hearth },
        { archetype: 'millbrook', count: v.other },
        { archetype: 'mossgrove', count: v.other },
      ],
    });
    if (vk.capacity > 0) kinds.villagers = vk;
    addCritter(kinds.villagers);
  }
  const hour = ctx.getHour;
  if (plan.cats > 0) addCritter((kinds.cats = new Cats(base, ctx, plan.cats, hour)));
  if (plan.sheep > 0) addCritter((kinds.sheep = new Sheep(base, ctx, plan.sheep)));
  if (plan.crabs > 0) addCritter((kinds.crabs = new Crabs(base, ctx, plan.crabs)));
  if (plan.ducks > 0) addCritter((kinds.ducks = new Ducks(base, ctx, plan.ducks)));
  if (plan.capybaras > 0) addCritter((kinds.capybaras = new Capybaras(base, ctx, plan.capybaras)));
  for (const k of Object.keys(kinds) as (keyof typeof kinds)[]) {
    if (kinds[k] && (kinds[k] as AgentKind).capacity === 0) {
      (kinds[k] as AgentKind).mesh.visible = false;
      delete kinds[k];
    }
  }

  const ambient = new AmbientScheduler(deps.seed);
  const spotRng = ctx.rngFor('spots');
  const counts = { coconutDrops: 0 };
  ambient.on('fishJump', (e) => {
    if (!kinds.jumpers || deps.getTier() < 2) return;
    if (e.x !== undefined && e.z !== undefined) {
      const a = e.r * Math.PI * 2 + (e.x * 0.37 + e.z * 0.11);
      kinds.jumpers.trigger(e.x, e.z, Math.cos(a), Math.sin(a));
      return;
    }
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
      const tier = deps.getTier();
      kinds.fish?.syncTier(tier);
      for (const k of tiered) k.syncTier(tier);
      ambient.fixedUpdate();
      for (const k of all) k.fixedUpdate(dt);
    },
    update(_dt, alpha) {
      for (const k of all) k.update(alpha);
      recount();
    },
    onTier(tier) {
      kinds.fish?.syncTier(tier);
      for (const k of tiered) k.syncTier(tier);
    },
    forEachAgent(cb) {
      for (const k of all) {
        const ps = PICK_SPHERES[k.name] ?? PICK_DEFAULT;
        for (let i = 0; i < k.capacity; i++) {
          if (!k.active[i]) continue;
          cb(k, i, k.x[i], k.y[i] + k.ovY[i] + ps.y, k.z[i], ps.r);
        }
      }
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
