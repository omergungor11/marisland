/**
 * Courier ships (M51, TASK-621, D-164): one agent per island, moored at its berth, sailing the
 * island's fleet hand-offs. The pose is a pure function of `courierState` (gates + sessions) and
 * the clock `clockMs` (wall ms live; capture clock + sim time under freeze), so frozen frames are
 * identical and a reconnect lands on the right place.
 *
 * Drawing: one InstancedMesh per island ship geometry (7 draw calls, 1 instance each, hidden when
 * the island has no berth), one for the lantern halo, one InstancedMesh per crate variant and per
 * scroll variant (only the ones in use are visible), plus the shared foam wake (1). Crates, scrolls
 * and halo follow the ship's matrix; hops are closed-form arcs between the deck slot and the dock.
 */
import * as THREE from 'three';
import { COURIER, courierSpec } from '../content/fleet-ships.ts';
import { SAILBOAT } from '../content/life.ts';
import { FIXED_STEP } from '../core/clock.ts';
import { pointAtLength } from '../core/math/catmull-rom.ts';
import { buildProp } from '../geo/index.ts';
import type { FleetGate, FleetSession } from '../fleet/protocol.ts';
import { swellY } from '../shared/fields.ts';
import { THEME_IDS, type ThemeId } from '../world/types.ts';
import { AgentKind, easeInOut, rotYFor, wrapAngle, type AgentKindOpts } from './agents.ts';
import { litCreatureMaterial, orientBoat } from './boats.ts';
import {
  berthOf,
  voyageDist,
  voyageProfile,
  voyageRoute,
  type Berth,
  type CourierWorld,
  type VoyageProfile,
  type VoyageRoute,
} from './courier-route.ts';
import { courierState, type CourierPlan } from './courier-state.ts';
import type { LifeCtx } from './ctx.ts';
import { hex, TriBuilder, v3 } from './geo/builder.ts';
import { WakeFoam } from './wake.ts';

const DEG = Math.PI / 180;
const S = 1000;

export interface CourierDeps {
  gates: () => Iterable<FleetGate>;
  sessions: () => ReadonlyMap<string, FleetSession>;
  /** Fleet clock in ms for the engine's sim time `simT` (s): wall time live, capture clock + simT frozen. */
  clockMs: (simT: number) => number;
}

type Opts = Omit<AgentKindOpts, 'name' | 'capacity' | 'geometry' | 'material'>;

interface Leg {
  route: VoyageRoute;
  prof: VoyageProfile;
}

const _m = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _v2 = { x: 0, y: 0 };
const _v2a = { x: 0, y: 0 };
const _v2b = { x: 0, y: 0 };

/** Prop-space point (x lateral, y up, z forward) -> life space (bow +x) with the draft applied. */
const toLife = (x: number, y: number, z: number, draft: number): [number, number, number] => [
  z,
  y - draft,
  -x,
];

/** A small InstancedMesh with a per-frame write cursor. */
class Bin {
  readonly mesh: THREE.InstancedMesh;
  n = 0;
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, name: string) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.name = name;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  put(m: THREE.Matrix4): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    m.toArray(this.mesh.instanceMatrix.array as Float32Array, this.n * 16);
    this.n++;
  }
  flush(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n > 0) this.mesh.instanceMatrix.needsUpdate = true;
    this.n = 0;
  }
}

function lanternGlow(): THREE.BufferGeometry {
  const b = new TriBuilder();
  b.setLimb(0, 0, 0, 0);
  b.setEmissive(COURIER.lantern.emissive);
  const r = COURIER.glow.radius;
  b.ellipsoid(v3(0, 0, 0), r, r, r, 8, 4, () => hex('#FFE6A0'));
  return b.finish();
}

export class Couriers extends AgentKind {
  readonly foam: WakeFoam;
  /** The seven ship meshes (index = THEME_IDS index); `ships[0]` is `mesh`. */
  readonly ships: THREE.InstancedMesh[] = [];
  readonly berths: (Berth | null)[];
  /** Latest plan per island (for picking / the card, TASK-622). */
  plans: CourierPlan[] = [];
  nowMs = 0;
  private readonly legs = new Map<string, Leg>();
  private readonly lantern: THREE.Vector3[] = [];
  private readonly drafts: number[] = [];
  private readonly odo = new Float64Array(THEME_IDS.length);
  private readonly last = new Float32Array(THEME_IDS.length * 2).fill(Number.NaN);
  private readonly wakeAt = new Float64Array(THEME_IDS.length).fill(Number.NaN);
  private readonly trailAt = new Float64Array(THEME_IDS.length).fill(Number.NaN);
  private readonly crates: Bin[] = [];
  private readonly scrolls: Bin[] = [];
  private readonly glow: Bin;

  constructor(
    o: Opts,
    private readonly ctx: LifeCtx,
    private readonly world: CourierWorld,
    private readonly deps: CourierDeps,
  ) {
    const n = THEME_IDS.length;
    const geos = THEME_IDS.map((_, k) =>
      orientBoat(buildProp('courierShip', o.seed, k, 0), courierSpec(k).draft),
    );
    const mat = litCreatureMaterial('life:couriers');
    super({ ...o, name: 'couriers', capacity: n, geometry: geos[0], material: mat });
    this.ships.push(this.mesh);
    for (let k = 1; k < n; k++) {
      const m = new THREE.InstancedMesh(geos[k], mat, 1);
      m.name = `life:couriers:${THEME_IDS[k]}`;
      m.count = 0;
      m.frustumCulled = true;
      m.castShadow = false;
      m.receiveShadow = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      o.group.add(m);
      o.scope.add(geos[k]);
      o.scope.add(m);
      this.ships.push(m);
    }
    geos.forEach((g, k) => {
      const spec = courierSpec(k);
      const piv = (g.userData.hooks as { lantern: { pivot: [number, number, number] } }).lantern
        .pivot;
      const [lx, ly, lz] = toLife(piv[0], piv[1], piv[2], spec.draft);
      this.lantern.push(new THREE.Vector3(lx, ly, lz));
      this.drafts.push(spec.draft);
    });
    // deck cargo
    const cap = n * (COURIER.maxCrates + 1);
    for (let k = 0; k < n; k++) {
      const g = buildProp('courierCrate', o.seed, k, 0);
      const bin = new Bin(g, mat, cap, `life:courier-crate:${THEME_IDS[k]}`);
      o.group.add(bin.mesh);
      o.scope.add(g);
      o.scope.add(bin.mesh);
      this.crates.push(bin);
    }
    for (let k = 0; k < 2; k++) {
      const g = buildProp('reportScroll', o.seed, k, 0);
      const bin = new Bin(g, mat, n, `life:courier-scroll:${k}`);
      o.group.add(bin.mesh);
      o.scope.add(g);
      o.scope.add(bin.mesh);
      this.scrolls.push(bin);
    }
    const gg = lanternGlow();
    this.glow = new Bin(gg, mat, n, 'life:courier-glow');
    o.group.add(this.glow.mesh);
    o.scope.add(gg);
    o.scope.add(this.glow.mesh);
    this.foam = new WakeFoam(o, ctx, n);

    this.berths = THEME_IDS.map((t) => berthOf(world, t));
    this.pickRadius = 3.5;
    this.pickHeight = 1.2;
    this.beginStep(0, 0);
    for (let i = 0; i < n; i++) {
      this.active[i] = this.berths[i] ? 1 : 0;
      this.stepAgent(i, 0, 0);
      this.snap(i);
    }
  }

  private leg(from: ThemeId, to: ThemeId): Leg | null {
    const key = `${from}>${to}`;
    let l = this.legs.get(key);
    if (!l) {
      const route = voyageRoute(this.world, from, to);
      if (!route) return null;
      l = { route, prof: voyageProfile(route.total) };
      this.legs.set(key, l);
    }
    return l;
  }

  /** Voyage seconds for the plan (default when a route is missing). */
  private voyageS = (from: ThemeId, to: ThemeId): number =>
    this.leg(from, to)?.prof.dur ?? COURIER.voyageS[0];

  protected override beginStep(_dt: number, t: number): void {
    this.nowMs = this.deps.clockMs(t);
    this.plans = courierState(this.deps.gates(), this.deps.sessions(), this.nowMs, {
      voyageS: this.voyageS,
    });
  }

  private heading(l: Leg, d: number, out: { x: number; y: number }): void {
    const a = pointAtLength(l.route.pts, l.route.lens, d + 1.5, false, _v2a);
    const b = pointAtLength(l.route.pts, l.route.lens, d - 1.5, false, _v2b);
    const len = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    out.x = (a.x - b.x) / len;
    out.y = (a.y - b.y) / len;
  }

  protected stepAgent(i: number, _dt: number, t: number): void {
    const berth = this.berths[i];
    const plan = this.plans[i];
    if (!berth || !plan) return;
    const now = this.nowMs;
    const out = { x: Math.cos(berth.rotY), y: Math.sin(berth.rotY) };
    let x = berth.x;
    let z = berth.z;
    let fx = out.x;
    let fz = out.y;
    let speed = 0;
    let turn = 0;
    const sailing = plan.phase === 'outbound' || plan.phase === 'returning';
    const arrived = plan.phase === 'delivered' || (plan.phase === 'idle' && plan.from !== plan.to);
    if (sailing || arrived) {
      const l = this.leg(plan.from, plan.to);
      const tb = this.berths[THEME_IDS.indexOf(plan.to)];
      if (l) {
        const el = sailing ? (now - plan.t0) / S : l.prof.dur;
        const d = voyageDist(l.prof, el);
        const p = pointAtLength(l.route.pts, l.route.lens, d, false, _v2);
        x = p.x;
        z = p.y;
        const h = { x: 0, y: 0 };
        this.heading(l, d, h);
        fx = h.x;
        fz = h.y;
        if (sailing) {
          speed = (voyageDist(l.prof, el + 0.25) - d) / 0.25;
          const h1 = { x: 0, y: 0 };
          const h2 = { x: 0, y: 0 };
          this.heading(l, d + 3, h1);
          this.heading(l, d - 3, h2);
          turn = wrapAngle(Math.atan2(h1.y, h1.x) - Math.atan2(h2.y, h2.x));
        } else {
          // arrived: swing round to the pier heading over the unload dwell (delivered: the target's)
          const tgt =
            plan.phase === 'delivered' && tb ? tb : this.berths[THEME_IDS.indexOf(plan.to)];
          if (tgt) {
            const u = Math.min(
              1,
              Math.max(0, (now - plan.t0) / (COURIER.dwell.unload * S * COURIER.turnShare)),
            );
            const a0 = Math.atan2(fz, fx);
            const a1 = tgt.rotY;
            const a = a0 + wrapAngle(a1 - a0) * easeInOut(u);
            fx = Math.cos(a);
            fz = Math.sin(a);
          }
        }
      }
    }
    const sw = this.ctx.swell;
    const rx = -fz;
    const rz = fx;
    const ts = SAILBOAT.tapSide;
    const tf = SAILBOAT.tapFront;
    const sL = swellY(x - rx * ts, z - rz * ts, t, sw);
    const sR = swellY(x + rx * ts, z + rz * ts, t, sw);
    const sF = swellY(x + fx * tf, z + fz * tf, t, sw);
    const sB = swellY(x - fx * tf, z - fz * tf, t, sw);
    const calm = this.ctx.motion.scale < 1;
    const heel = calm
      ? 0
      : Math.max(-1, Math.min(1, ((turn / 6) * speed) / SAILBOAT.heelRate)) *
        SAILBOAT.heelDeg *
        DEG *
        COURIER.heelScale;
    this.x[i] = x;
    this.z[i] = z;
    this.y[i] = swellY(x, z, t, sw);
    this.yaw[i] = rotYFor(fx, fz);
    this.roll[i] = Math.atan((sL - sR) / (2 * ts)) * COURIER.bobScale + heel;
    this.pitch[i] = Math.atan((sF - sB) / (2 * tf)) * COURIER.bobScale;
    // wake: stamp by distance moved
    const px = this.last[i * 2];
    if (!Number.isNaN(px)) this.odo[i] += Math.hypot(x - px, z - this.last[i * 2 + 1]);
    this.last[i * 2] = x;
    this.last[i * 2 + 1] = z;
    if (speed > 0.3 && t > 0) this.stampWake(i, x, z, fx, fz);
  }

  private stampWake(i: number, x: number, z: number, fx: number, fz: number): void {
    const d = this.odo[i];
    const T = SAILBOAT.trail;
    if (Number.isNaN(this.trailAt[i]) || Math.abs(d - this.trailAt[i]) >= T.spacing) {
      this.trailAt[i] = d;
      this.ctx.water.splat(x - fx * T.back, z - fz * T.back, T.radius.ferry, T.strength, T.life, 0);
    }
    const w = SAILBOAT.wake;
    if (this.ctx.getTier() < w.minTier) return;
    if (!Number.isNaN(this.wakeAt[i]) && Math.abs(d - this.wakeAt[i]) < w.spacing) return;
    this.wakeAt[i] = d;
    this.foam.stamp(i, x - fx * w.back, z - fz * w.back, -fz, fx, this.simT);
  }

  override fixedUpdate(dt?: number): void {
    super.fixedUpdate(dt);
    this.foam.fixedUpdate(dt);
  }

  override update(alpha: number): void {
    super.update(alpha);
    this.foam.update(alpha);
    const a = Math.min(Math.max(alpha, 0), 1);
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    const nowR = this.deps.clockMs(this.simT - (1 - a) * FIXED_STEP);
    const calm = this.ctx.motion.scale < 1;
    for (let i = 0; i < THEME_IDS.length; i++) {
      const on = this.active[i] === 1;
      const m = this.ships[i];
      if (i > 0 && on) {
        (m.instanceMatrix.array as Float32Array).set(arr.subarray(i * 16, i * 16 + 16));
        m.instanceMatrix.needsUpdate = true;
      }
      m.count = on ? 1 : 0;
      m.visible = on;
      if (on) m.computeBoundingSphere();
      if (on) this.cargo(i, arr, nowR, calm);
    }
    for (const b of this.crates) b.flush();
    for (const b of this.scrolls) b.flush();
    this.glow.flush();
  }

  /** Crates, scroll and lantern halo of ship `i` at fleet time `now` (ms). */
  private cargo(i: number, arr: Float32Array, now: number, calm: boolean): void {
    const plan = this.plans[i];
    const spec = courierSpec(i);
    const C = COURIER;
    const ship = _m.fromArray(arr, i * 16).clone();
    const hopMs = C.crateHop.seconds * S;
    const slot = (k: number, lift = 0): THREE.Vector3 => {
      const sp = spec.crates[k % spec.crates.length];
      const [lx, ly, lz] = toLife(
        sp[0],
        spec.hullH + Math.floor(k / spec.crates.length) * 0.34 + lift,
        sp[1],
        spec.draft,
      );
      return _a.set(lx, ly, lz).applyMatrix4(ship);
    };
    const dock = (theme: ThemeId): THREE.Vector3 | null => {
      const bt = this.berths[THEME_IDS.indexOf(theme)];
      return bt ? _b.set(bt.head.x, C.moor.dockY, bt.head.y) : null;
    };
    const putAt = (
      bin: Bin,
      from: THREE.Vector3,
      to: THREE.Vector3 | null,
      u: number,
      sc = 1,
    ): void => {
      const k = calm ? 1 : Math.min(1, Math.max(0, u));
      _p.copy(from);
      if (to) _p.lerp(to, k);
      if (!calm && u > 0 && u < 1) _p.y += C.crateHop.height * 4 * u * (1 - u);
      _q.setFromRotationMatrix(ship.clone().setPosition(0, 0, 0));
      _s.set(sc, sc, sc);
      bin.put(_t.compose(_p, _q, _s));
    };
    const hopU = (): number => (now - (plan.hopAt ?? -Infinity)) / hopMs;

    // crates on deck (the newest one hops in from the pier while loading)
    const n = Math.min(plan.crates.length, C.maxCrates);
    for (let k = 0; k < n; k++) {
      const bin = this.crates[THEME_IDS.indexOf(plan.crates[k])];
      const deck = slot(k).clone();
      if (plan.phase === 'loading' && k === n - 1 && hopU() < 1) {
        const from = dock(plan.island);
        if (from) {
          putAt(bin, from.clone(), deck, hopU());
          continue;
        }
      }
      putAt(bin, deck, null, 1);
    }
    // unloaded crate: hops to the pier head, rests, goes
    if (plan.phase === 'delivered') {
      const el = now - plan.t0;
      const to = dock(plan.to)?.clone();
      if (to && el < hopMs + C.moor.restS * S) {
        putAt(this.crates[THEME_IDS.indexOf(plan.to)], slot(0).clone(), to, el / hopMs);
      }
    }
    // denied crate lifts off
    if (plan.lift && !calm) {
      const u = Math.min(1, Math.max(0, hopU()));
      const p0 = slot(0).clone();
      p0.y += C.crateHop.height * 2 * u;
      putAt(this.crates[THEME_IDS.indexOf(plan.lift)], p0, null, 1, 1 - u * u);
    }
    // report scroll: loaded at the target pier, unloaded at home
    if (plan.scroll) {
      const bin = this.scrolls[plan.scroll === 'fail' ? 1 : 0];
      if (plan.phase === 'returning') {
        const from = dock(plan.from);
        const u = hopU();
        if (from && u < 1) putAt(bin, from.clone(), slot(0).clone(), u);
        else putAt(bin, slot(0).clone(), null, 1);
      } else {
        const to = dock(plan.island);
        const el = now - plan.t0;
        if (to && el < hopMs + C.moor.restS * S)
          putAt(bin, slot(0).clone(), to.clone(), el / hopMs);
      }
    }
    // lantern halo: lit while loading / sailing, fades at the berth
    const fade = C.glow.fadeS * S;
    const lit =
      plan.phase === 'delivered'
        ? 1 - Math.min(1, (now - plan.t0) / fade)
        : plan.phase === 'idle'
          ? 0
          : Math.min(1, Math.max(0, (now - plan.t0) / fade));
    if (lit > 0.01) {
      const l = this.lantern[i];
      _p.copy(l).applyMatrix4(ship);
      _q.identity();
      _s.setScalar(lit);
      this.glow.put(_t.compose(_p, _q, _s));
    }
  }
}
