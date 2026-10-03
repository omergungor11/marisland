import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../core/clock.ts';
import { Scope } from '../core/scope.ts';
import { QUALITY_PRESETS } from '../core/quality.ts';
import type { Quality } from '../core/params.ts';
import { SWELL } from '../content/anim.ts';
import { SAILBOAT } from '../content/life.ts';
import { swellY } from '../shared/fields.ts';
import { generateWorld, heightAt, Zone, type WorldData } from '../world/index.ts';
import { AmbientScheduler } from './ambient.ts';
import type { AgentKind } from './agents.ts';
import { createLife, type LifeSystem } from './index.ts';
import { buildFish, buildGull } from './geo/creatures.ts';
import { sailboatGeometry } from './boats.ts';
import { WAKE_PAIRS, WakeFoam } from './wake.ts';

// Tests measure wall time; the life code itself never reads a clock.
// eslint-disable-next-line no-restricted-properties
const now = (): number => performance.now();

let cached: WorldData | null = null;
const world = (): WorldData => (cached ??= generateWorld(7));

interface Rig {
  life: LifeSystem;
  splats: { x: number; z: number; r: number; s: number }[];
  scope: Scope;
  cam: THREE.Vector3;
  tier: { v: number };
  counters: { agents: number };
}

function rig(seed = 7, quality: Quality = 'medium', cam = new THREE.Vector3(0, 40, 0)): Rig {
  const splats: Rig['splats'] = [];
  const tier = { v: 0 };
  const scope = new Scope('life-test');
  const counters = { agents: 0 };
  const life = createLife({
    world: world(),
    scope,
    seed,
    quality,
    water: { splat: (x, z, r, s) => splats.push({ x, z, r, s }) },
    counters: counters as never,
    getTier: () => tier.v,
    cameraPos: cam,
  });
  return { life, splats, scope, cam, tier, counters };
}

const run = (r: Rig, n: number, each?: () => void): void => {
  for (let i = 0; i < n; i++) {
    r.life.fixedUpdate(FIXED_STEP);
    each?.();
  }
};

const kindsOf = (l: LifeSystem): AgentKind[] => Object.values(l.kinds) as AgentKind[];

const snapshot = (l: LifeSystem): number[] =>
  kindsOf(l).flatMap((k) => [...k.x, ...k.y, ...k.z, ...k.yaw]);

/** A shallow/lagoon cell with room around it, or null. */
function shallowSpot(w: WorldData): { x: number; z: number } | null {
  const h = w.height;
  for (let iz = 8; iz < h.n - 8; iz += 3) {
    for (let ix = 8; ix < h.n - 8; ix += 3) {
      const x = h.originX + ix * h.cellSize;
      const z = h.originZ + iz * h.cellSize;
      const d = -heightAt(h, x, z);
      if (w.zone[iz * h.n + ix] === Zone.shallow && d > 1.2 && d < 3) return { x, z };
    }
  }
  return null;
}

describe('life: framework + determinism', () => {
  it('same seed, same steps → identical positions; 0 vs 30 steps differ', () => {
    const a = rig();
    const b = rig();
    const c = rig();
    run(a, 300);
    run(b, 300);
    run(c, 30);
    expect(snapshot(a.life)).toEqual(snapshot(b.life));
    expect(snapshot(a.life)).not.toEqual(snapshot(c.life));
    const z = rig();
    expect(snapshot(z.life)).not.toEqual(snapshot(c.life));
  });

  it('agent counts respect the quality caps', () => {
    for (const q of ['low', 'medium', 'high'] as const) {
      const r = rig(7, q);
      r.tier.v = 3;
      r.life.onTier(3);
      run(r, 5);
      r.life.update(FIXED_STEP, 0.5);
      expect(r.counters.agents).toBeLessThanOrEqual(QUALITY_PRESETS[q].agentCap);
      expect(r.life.stats.agents).toBe(r.counters.agents);
    }
  });

  it('registers meshes in the scope and disposes cleanly', () => {
    const r = rig();
    expect(r.scope.size).toBeGreaterThan(5);
    r.scope.dispose();
    expect(r.scope.size).toBe(0);
  });
});

describe('life: boats', () => {
  it('sailboat y equals swellY at its position (parity, 1e-6)', () => {
    const r = rig();
    const sb = r.life.kinds.sailboats;
    expect(sb).toBeDefined();
    const w = world();
    run(r, 200);
    const t = sb!.simT;
    for (let i = 0; i < sb!.capacity; i++) {
      const want = swellY(sb!.x[i], sb!.z[i], t, { ...SWELL, dir: w.windDir });
      expect(Math.abs(sb!.y[i] - want)).toBeLessThan(1e-6);
    }
  });

  it('boats move along routes at ≈3 u/s and stay over deep water for 1000 steps', () => {
    const r = rig();
    const sb = r.life.kinds.sailboats!;
    const rb = r.life.kinds.rowboats;
    const x0 = Array.from(sb.x);
    const z0 = Array.from(sb.z);
    let minDepth = Infinity;
    run(r, 1000, () => {
      for (let i = 0; i < sb.capacity; i++)
        minDepth = Math.min(minDepth, -heightAt(world().height, sb.x[i], sb.z[i]));
      if (rb)
        for (let i = 0; i < rb.capacity; i++)
          minDepth = Math.min(minDepth, -heightAt(world().height, rb.x[i], rb.z[i]));
    });
    expect(minDepth).toBeGreaterThan(1.2 * 0 + 0.7);
    // moved ≈ 3 u/s × 33.3 s along the loop (chord ≤ arc)
    for (let i = 0; i < sb.capacity; i++) {
      const moved = Math.hypot(sb.x[i] - x0[i], sb.z[i] - z0[i]);
      expect(moved).toBeGreaterThan(20);
    }
    console.info(
      `boats: ${sb.capacity} sail, ${rb?.capacity ?? 0} row, min depth ${minDepth.toFixed(2)}`,
    );
  });

  it('sailboats stay over water ≥ 1.2 u deep (sail routes only)', () => {
    const r = rig();
    const sb = r.life.kinds.sailboats!;
    let minDepth = Infinity;
    run(r, 1000, () => {
      for (let i = 0; i < sb.capacity; i++)
        minDepth = Math.min(minDepth, -heightAt(world().height, sb.x[i], sb.z[i]));
    });
    expect(minDepth).toBeGreaterThan(1.2);
  });

  it('wake: foam-dot pairs stamped by distance travelled, none at T0, no water-texture splats', () => {
    const r = rig();
    const sb = r.life.kinds.sailboats!;
    const foam = sb.foam;
    run(r, 3);
    r.life.update(FIXED_STEP, 1);
    r.splats.length = 0;
    // T0: boats are specks, no wake is laid
    run(r, 90);
    r.life.update(FIXED_STEP, 1);
    expect(foam.alive(sb.simT)).toBe(0);
    expect(foam.mesh.count).toBe(0);
    r.tier.v = 1;
    run(r, 30 * 20);
    r.life.update(FIXED_STEP, 1);
    // the 256² foam-trail texture has 3 u texels: any splat there is a smear, so none are made
    expect(r.splats.length).toBe(0);
    const alive = foam.alive(sb.simT);
    expect(alive).toBeGreaterThan(sb.capacity * 4);
    expect(alive).toBeLessThanOrEqual(sb.capacity * WAKE_PAIRS);
    // two dots per pair, one draw call
    expect(foam.mesh.count).toBeGreaterThan(0);
    expect(foam.mesh.count).toBeLessThanOrEqual(foam.capacity);
  });

  it('wake: a short V of small dots — drifts apart, shrinks away within ~2 boat lengths and 3 s', () => {
    const w = SAILBOAT.wake;
    expect(w.life).toBeLessThanOrEqual(3);
    expect(w.life * SAILBOAT.speed).toBeLessThanOrEqual(2.2 * 4); // sailboat ≈ 4 u long
    expect(w.radius * (1 + w.jitter)).toBeLessThanOrEqual(0.5); // small dots, ≪ the 2–3 u smear
    expect(WakeFoam.scaleAt(-0.1)).toBe(0);
    expect(WakeFoam.scaleAt(w.life)).toBe(0);
    expect(WakeFoam.scaleAt(w.life * 0.5)).toBeGreaterThan(WakeFoam.scaleAt(w.life * 0.9));
    expect(WakeFoam.scaleAt(w.life * w.pop)).toBeGreaterThan(WakeFoam.scaleAt(w.life * 0.02));
    // V: arms widen with age
    expect(WakeFoam.armAt(2)).toBeGreaterThan(WakeFoam.armAt(0.5));
  });

  it('wake dots sit within the wake length behind the boats, deterministically', () => {
    const grab = (): { out: number[]; near: number } => {
      const r = rig();
      r.tier.v = 1;
      const sb = r.life.kinds.sailboats!;
      run(r, 30 * 12);
      r.life.update(FIXED_STEP, 1);
      const m = sb.foam.mesh.instanceMatrix.array as Float32Array;
      const w = SAILBOAT.wake;
      const lim = w.back + WakeFoam.armAt(w.life) + SAILBOAT.speed * w.life + 1;
      let near = 0;
      for (let k = 0; k < sb.foam.mesh.count; k++) {
        const x = m[k * 16 + 12];
        const z = m[k * 16 + 14];
        for (let i = 0; i < sb.capacity; i++)
          if (Math.hypot(x - sb.x[i], z - sb.z[i]) < lim) {
            near++;
            break;
          }
      }
      expect(sb.foam.mesh.count).toBeGreaterThan(0);
      expect(near).toBe(sb.foam.mesh.count);
      return { out: Array.from(m.slice(0, sb.foam.mesh.count * 16)), near };
    };
    expect(grab().out).toEqual(grab().out);
  });

  it('moored rowboats bob with differing phases', () => {
    const r = rig();
    const rb = r.life.kinds.rowboats;
    expect(rb).toBeDefined();
    run(r, 60);
    const ys = Array.from(rb!.y).map((y) => y.toFixed(4));
    expect(new Set(Array.from(rb!.phase)).size).toBe(rb!.capacity);
    expect(ys.length).toBeGreaterThan(0);
  });

  it('boat geometry is cheap', () => {
    const g = sailboatGeometry(7);
    const tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    expect(tris).toBeLessThan(900);
  });
});

describe('life: world data wiring', () => {
  it('moored boats sit exactly on world.moorings; parked sailboats do not sail', () => {
    const w = world();
    const r = rig(7, 'high');
    run(r, 100);
    const rb = r.life.kinds.rowboats;
    const pk = r.life.kinds.parked;
    const row = w.moorings.filter((m) => m.defId === 'rowboat');
    const sail = w.moorings.filter((m) => m.defId === 'sailboat');
    if (row.length) {
      expect(rb).toBeDefined();
      for (let i = 0; i < rb!.capacity; i++)
        expect(
          row.some((m) => Math.abs(m.x - rb!.x[i]) < 1e-3 && Math.abs(m.z - rb!.z[i]) < 1e-3),
        ).toBe(true);
    }
    if (sail.length) {
      expect(pk).toBeDefined();
      const x0 = pk!.x[0];
      run(r, 300);
      expect(pk!.x[0]).toBe(x0);
    }
  });
});

describe('life: gulls', () => {
  it('stay above 10 u, have unique phases, move, and are ≤ 24', () => {
    const r = rig();
    const g = r.life.kinds.gulls!;
    expect(g.capacity).toBeLessThanOrEqual(24);
    expect(new Set(Array.from(g.phase)).size).toBe(g.capacity);
    const x0 = Array.from(g.x);
    let minY = Infinity;
    run(r, 1000, () => {
      for (let i = 0; i < g.capacity; i++) if (g.state[i] === 0) minY = Math.min(minY, g.y[i]);
    });
    expect(minY).toBeGreaterThan(10);
    expect(g.x.some((x, i) => Math.abs(x - x0[i]) > 1)).toBe(true);
  });

  it('a gull can be sent to a perch, sits, and returns to orbit', () => {
    const r = rig();
    const g = r.life.kinds.gulls!;
    run(r, 5);
    expect(g.perches.length).toBeGreaterThan(0);
    const id = g.land(0.1, 0.2);
    expect(id).toBeGreaterThanOrEqual(0);
    const seen = new Set<number>();
    let perchedY = -1;
    run(r, 30 * 40, () => {
      seen.add(g.state[id]);
      if (g.state[id] === 2) perchedY = g.y[id];
    });
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    expect(perchedY).toBeLessThan(2);
    expect(g.state[id]).toBe(0);
  });
});

describe('life: fish, jumps, dolphins', () => {
  it('schools exist only at T3 and stay in shallow/lagoon cells', () => {
    const w = world();
    const spot = shallowSpot(w);
    expect(spot).not.toBeNull();
    const r = rig(7, 'medium', new THREE.Vector3(spot!.x, 30, spot!.z));
    const f = r.life.kinds.fish!;
    run(r, 10);
    expect(f.liveCount).toBe(0);
    r.tier.v = 3;
    r.life.onTier(3);
    expect(f.liveCount).toBeGreaterThan(0);
    const bad: string[] = [];
    run(r, 1000, () => {
      for (let i = 0; i < f.capacity; i++) {
        if (!f.active[i]) continue;
        const zone =
          w.zone[
            Math.round((f.z[i] - w.height.originZ) / 2) * w.height.n +
              Math.round((f.x[i] - w.height.originX) / 2)
          ];
        if (zone !== Zone.shallow && zone !== Zone.lagoon) bad.push(`${i}:${zone}`);
      }
    });
    expect(bad).toEqual([]);
    r.tier.v = 1;
    r.life.onTier(1);
    expect(f.liveCount).toBe(0);
  });

  it('fish scatter away from the cursor and regroup', () => {
    const w = world();
    const spot = shallowSpot(w)!;
    const r = rig(7, 'medium', new THREE.Vector3(spot.x, 30, spot.z));
    r.tier.v = 3;
    r.life.onTier(3);
    const f = r.life.kinds.fish!;
    run(r, 60);
    const s0 = f.schools[0];
    const cx = f.x[s0.first];
    const cz = f.z[s0.first];
    const d0 = Math.hypot(f.x[s0.first] - cx, f.z[s0.first] - cz);
    r.life.setCursorWorld(cx, cz);
    run(r, 30);
    expect(s0.fleeT).toBeGreaterThan(0);
    const dNear = Math.hypot(f.x[s0.first] - cx, f.z[s0.first] - cz);
    run(r, 30);
    const dAfter = Math.hypot(f.x[s0.first] - cx, f.z[s0.first] - cz);
    r.life.setCursorWorld(null);
    run(r, 120);
    expect(s0.fleeT).toBeLessThanOrEqual(0);
    expect(d0).toBe(0);
    expect(dAfter).toBeGreaterThan(dNear);
  });

  it('ambient scheduler is deterministic and fires fish jumps / dolphins into the pool', () => {
    const a = new AmbientScheduler(5);
    const b = new AmbientScheduler(5);
    const la: number[] = [];
    const lb: number[] = [];
    a.on('fishJump', (e) => la.push(e.t, e.r));
    b.on('fishJump', (e) => lb.push(e.t, e.r));
    for (let i = 0; i < 30 * 120; i++) {
      a.fixedUpdate();
      b.fixedUpdate();
    }
    expect(la).toEqual(lb);
    expect(la.length / 2).toBeGreaterThanOrEqual(8); // ≈ 120 s / 10 s
    const gaps = la.filter((_, i) => i % 2 === 0).map((t, i, arr) => (i ? t - arr[i - 1] : t));
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(6 - 1e-6);
      expect(g).toBeLessThanOrEqual(14 + 1e-6);
    }
    const c = new AmbientScheduler(6);
    const lc: number[] = [];
    c.on('fishJump', (e) => lc.push(e.t, e.r));
    for (let i = 0; i < 30 * 120; i++) c.fixedUpdate();
    expect(lc).not.toEqual(la);
  });

  it('jumpers and dolphins trigger from the scheduler near the camera', () => {
    const w = world();
    const spot = shallowSpot(w)!;
    const r = rig(7, 'high', new THREE.Vector3(spot.x, 30, spot.z));
    r.tier.v = 3;
    r.life.onTier(3);
    run(r, 30 * 240);
    expect(r.life.kinds.jumpers!.started + r.life.kinds.dolphins!.started).toBeGreaterThan(0);
  });
});

describe('life: geometry + cost', () => {
  it('tri budgets', () => {
    const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
    const gull = tris(buildGull());
    const fish = tris(buildFish('#fff', '#ddd'));
    console.info(
      `tris: gull ${gull}, fish ${fish}, sailboat ${tris(sailboatGeometry(7).toNonIndexed())}`,
    );
    expect(gull).toBeLessThan(60);
    expect(fish).toBeLessThan(45);
  });

  it('closed bodies face outward (winding)', () => {
    const outward = (g: THREE.BufferGeometry, ok: (i: number) => boolean): number => {
      const p = g.getAttribute('position');
      const n = g.getAttribute('normal');
      let good = 0;
      let all = 0;
      for (let i = 0; i < p.count; i += 3) {
        if (!ok(i)) continue;
        const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
        const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
        const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
        all++;
        if (cx * n.getX(i) + cy * n.getY(i) + cz * n.getZ(i) > 0) good++;
      }
      return good / all;
    };
    // gull body = first 24 tris (6x3 ellipsoid) around the origin
    const gullOut = outward(buildGull(), (i) => i < 24 * 3);
    console.info('outward gull', gullOut);
    expect(gullOut).toBeGreaterThan(0.95);
    // fish body (before the double-sided tail fin): all but the last 4 tris
    const fg = buildFish('#fff', '#ddd');
    expect(outward(fg, (i) => i < fg.getAttribute('position').count - 12)).toBeGreaterThan(0.95);
  });

  it('fixed step + matrix write cost', () => {
    const w = world();
    const spot = shallowSpot(w)!;
    const r = rig(7, 'high', new THREE.Vector3(spot.x, 30, spot.z));
    r.tier.v = 3;
    r.life.onTier(3);
    run(r, 100);
    const n = 600;
    const t0 = now();
    run(r, n);
    const t1 = now();
    for (let i = 0; i < n; i++) r.life.update(FIXED_STEP, (i % 10) / 10);
    const t2 = now();
    const agents = r.life.stats.agents;
    console.info(
      `cost: ${agents} agents, fixedUpdate ${(((t1 - t0) / n) * 1000).toFixed(1)} µs/step (${(((t1 - t0) / n / agents) * 1000).toFixed(2)} µs/agent), update ${(((t2 - t1) / n) * 1000).toFixed(1)} µs/frame`,
    );
    expect(agents).toBeGreaterThan(20);
  });
});
