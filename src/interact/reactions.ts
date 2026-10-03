import * as THREE from 'three';
import {
  AGENT_REACTIONS,
  COOLDOWN_S,
  DEFAULT_SPEC,
  FX_COLORS,
  GEO_FAMILY,
  HOVER,
  LEAF_COLORS,
  mergeSpec,
  PROP_REACTIONS,
  REDUCED,
  SPARKLES,
  specDuration,
  SQUASH,
  STREAK_SPECIAL,
  STREAK_WINDOW_S,
  type ReactionSpec,
} from '../anim/reaction-data.ts';
import { damp, easeOutCubic, makeSpring, stepSpring, type Spring } from '../anim/spring.ts';
import { unitHash } from '../core/hash.ts';
import type { Scope } from '../core/scope.ts';
import { PROP_GEO } from '../geo/index.ts';
import type { AgentKind } from '../life/agents.ts';
import type { LifeSystem } from '../life/index.ts';
import { Fx, FxPool } from './fx.ts';
import type { PickResult } from './picker.ts';

const DEG = Math.PI / 180;

export interface ReactionEffect {
  /** Effect id from the reaction data (treeShake, doorPeek, volcanoBurp, toot, honk, baa, …). */
  id: string;
  result: PickResult;
  streak: number;
}

export interface ReactionDeps {
  scope: Scope;
  seed: number;
  life?: LifeSystem | null;
  water?: { splat(x: number, z: number, radius: number, strength: number): void } | null;
  /** Hook for things only the app can do (camera shake, bird burst, lamp flash, …). Skipped in reduced motion. */
  onEffect?: (e: ReactionEffect) => void;
  /** Terrain height for falling leaves/apples (defaults to the click point). */
  heightAt?: (x: number, z: number) => number;
}

export interface Reactions {
  /** Add to the scene. */
  readonly group: THREE.Group;
  /** Start the reaction for a picked target. Returns false when ignored (cooldown / nothing to do). */
  react(r: PickResult): boolean;
  /** Hover pulse (1.04 scale) on a prop instance or agent; null clears. */
  setHover(r: PickResult | null): void;
  setReducedMotion(on: boolean): void;
  /** Per frame, `dt` from the engine clock (clamped to 0.1 s). */
  update(dt: number, camera: THREE.Camera): void;
  /** Restore every touched matrix/overlay immediately. */
  clear(): void;
  readonly stats: { reactions: number; hovers: number; particles: number; clicks: number };
  dispose(): void;
}

/** One running reaction: springs + analytic timeline, sampled into a pose. */
export class Rx {
  age = 0;
  readonly q: Spring = makeSpring();
  readonly wob: Spring = makeSpring();
  readonly sink: Spring = makeSpring(1);
  readonly dur: number;
  // output pose
  sy = 1;
  sxz = 1;
  hopY = 0;
  yaw = 0;
  roll = 0;

  constructor(
    readonly spec: ReactionSpec,
    readonly reduced: boolean,
    sign = 1,
  ) {
    this.dur = reduced ? REDUCED.duration : specDuration(spec);
    if (!reduced && spec.wobble) {
      this.wob.v = sign * spec.wobble.deg * DEG * Math.sqrt(spec.wobble.k) * 1.15;
    }
  }

  get done(): boolean {
    return this.age >= this.dur;
  }

  step(dt: number): void {
    const s = this.spec;
    this.age += dt;
    const a = this.age;
    this.sy = 1;
    this.sxz = 1;
    this.hopY = 0;
    this.yaw = 0;
    this.roll = 0;
    if (this.reduced) {
      const u = Math.min(a / REDUCED.duration, 1);
      const k = 1 + (REDUCED.scale - 1) * Math.sin(Math.PI * u);
      this.sy = k;
      this.sxz = k;
      return;
    }
    let t0 = 0;
    if (s.squash) {
      t0 = SQUASH.down;
      if (a < SQUASH.down) {
        this.q.x = easeOutCubic(a / SQUASH.down);
        this.q.v = 0;
      } else stepSpring(this.q, 0, SQUASH.k, SQUASH.c, dt);
      this.sy = 1 - (1 - SQUASH.depth) * this.q.x;
      this.sxz = 1 + (SQUASH.wide - 1) * this.q.x;
    }
    if (s.hop) {
      const period = s.hop.dur + 0.1;
      const ha = a - t0;
      if (ha >= 0) {
        const idx = Math.floor(ha / period);
        const local = ha - idx * period;
        if (idx < s.hop.count && local < s.hop.dur) {
          const u = local / s.hop.dur;
          this.hopY = s.hop.height * 4 * u * (1 - u);
          const st = 1 + 0.1 * Math.sin(Math.PI * u);
          this.sy *= st;
          this.sxz /= Math.sqrt(st);
        }
      }
    }
    if (s.spin) {
      const sa = a - t0;
      if (sa > 0)
        this.yaw = s.spin.turns * Math.PI * 2 * easeOutCubic(Math.min(sa / s.spin.dur, 1));
    }
    if (s.wobble) {
      stepSpring(this.wob, 0, s.wobble.k, s.wobble.c, dt);
      this.roll = this.wob.x;
    }
    if (s.sink) {
      const target = a < s.sink.down + s.sink.stay ? s.sink.to : 1;
      stepSpring(this.sink, target, 220, 16, dt);
      this.sy *= this.sink.x;
      this.sxz *= 1 + (1 - this.sink.x) * 0.3;
    }
  }
}

interface PropEntry {
  kind: 'prop';
  key: string;
  mesh: THREE.InstancedMesh;
  index: number;
  orig: THREE.Matrix4;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: THREE.Vector3;
  hov: number;
  hovTarget: number;
  rx: Rx | null;
}
interface AgentEntry {
  kind: 'agent';
  key: string;
  agent: AgentKind;
  index: number;
  hov: number;
  hovTarget: number;
  rx: Rx | null;
  color: THREE.Color | null;
}
type Entry = PropEntry | AgentEntry;

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qx = new THREE.Quaternion();
const _white = new THREE.Color(1, 1, 1);
const _c = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);

export function createReactions(deps: ReactionDeps): Reactions {
  const fx = new FxPool(deps.scope, {
    sparkles: SPARKLES.bursts * SPARKLES.count,
    leaves: 24,
    puffs: 24,
    bubbles: 6,
  });
  const entries = new Map<string, Entry>();
  const clicks = new Map<string, { last: number; streak: number }>();
  const stats = { reactions: 0, hovers: 0, particles: 0, clicks: 0 };
  let t = 0;
  let reduced = false;
  let hoverKey: string | null = null;

  const propKey = (mesh: THREE.InstancedMesh, index: number): string => `p:${mesh.id}:${index}`;
  const agentKey = (a: AgentKind, index: number): string => `a:${a.name}:${index}`;

  function entryFor(r: PickResult): Entry | null {
    if (r.kind === 'prop' && r.instance) {
      const { group, index } = r.instance;
      const mesh = group.mesh;
      const key = propKey(mesh, index);
      let e = entries.get(key) as PropEntry | undefined;
      if (!e) {
        const orig = new THREE.Matrix4().fromArray(mesh.instanceMatrix.array, index * 16);
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        orig.decompose(pos, quat, scale);
        e = {
          kind: 'prop',
          key,
          mesh,
          index,
          orig,
          pos,
          quat,
          scale,
          hov: 0,
          hovTarget: 0,
          rx: null,
        };
        entries.set(key, e);
      }
      return e;
    }
    if (r.kind === 'agent' && r.agent) {
      const { kind, index } = r.agent;
      const key = agentKey(kind, index);
      let e = entries.get(key) as AgentEntry | undefined;
      if (!e) {
        e = { kind: 'agent', key, agent: kind, index, hov: 0, hovTarget: 0, rx: null, color: null };
        entries.set(key, e);
      }
      return e;
    }
    return null;
  }

  const writeProp = (e: PropEntry, m: THREE.Matrix4): void => {
    m.toArray(e.mesh.instanceMatrix.array as Float32Array, e.index * 16);
    e.mesh.instanceMatrix.addUpdateRange(e.index * 16, 16);
    e.mesh.instanceMatrix.needsUpdate = true;
  };

  function release(e: Entry): void {
    if (e.kind === 'prop') writeProp(e, e.orig);
    else {
      e.agent.clearOverlay(e.index);
      if (e.color && e.agent.mesh.instanceColor) {
        e.agent.mesh.setColorAt(e.index, e.color);
        e.agent.mesh.instanceColor.needsUpdate = true;
      }
    }
    entries.delete(e.key);
  }

  function apply(e: Entry): void {
    const rx = e.rx;
    const hv = 1 + (HOVER.scale - 1) * e.hov;
    const sy = (rx?.sy ?? 1) * hv;
    const sxz = (rx?.sxz ?? 1) * hv;
    const hop = rx?.hopY ?? 0;
    const yaw = rx?.yaw ?? 0;
    const roll = rx?.roll ?? 0;
    if (e.kind === 'prop') {
      _p.set(e.pos.x, e.pos.y + hop, e.pos.z);
      _qy.setFromAxisAngle(_yAxis, yaw);
      _qx.setFromAxisAngle(_xAxis, roll);
      _q.copy(_qy).multiply(_qx).multiply(e.quat);
      _s.set(e.scale.x * sxz, e.scale.y * sy, e.scale.z * sxz);
      _m.compose(_p, _q, _s);
      writeProp(e, _m);
    } else {
      const a = e.agent;
      const i = e.index;
      a.ovY[i] = hop;
      a.ovYaw[i] = yaw;
      a.ovRoll[i] = roll;
      a.ovSx[i] = sxz;
      a.ovSy[i] = sy;
      a.ovSz[i] = sxz;
      if (rx?.reduced && a.mesh.instanceColor) {
        if (!e.color) {
          e.color = new THREE.Color();
          a.mesh.getColorAt(i, e.color);
        }
        const tint = REDUCED.tint * Math.sin(Math.PI * Math.min(rx.age / REDUCED.duration, 1));
        _c.copy(e.color).lerp(_white, tint);
        a.mesh.setColorAt(i, _c);
        a.mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  const groundAt = (x: number, z: number, fallback: number): number =>
    deps.heightAt ? deps.heightAt(x, z) : fallback;

  function propInfo(r: PickResult): {
    family: string;
    height: number;
    baseY: number;
    cx: number;
    cz: number;
  } {
    const g = r.instance?.group;
    const geo = g ? PROP_GEO[g.def.geo] : undefined;
    const e = entryFor(r) as PropEntry | null;
    const sc = e ? e.scale.y : 1;
    return {
      family: g ? (GEO_FAMILY[g.def.geo] ?? 'default') : 'default',
      height: (geo?.height ?? 1) * sc,
      baseY: e ? e.pos.y : r.y,
      cx: e ? e.pos.x : r.x,
      cz: e ? e.pos.z : r.z,
    };
  }

  function react(r: PickResult): boolean {
    const now = t;
    const rec = clicks.get(r.id) ?? { last: -1e9, streak: 0 };
    if (now - rec.last < COOLDOWN_S) return false;
    rec.streak = now - rec.last <= STREAK_WINDOW_S ? rec.streak + 1 : 1;
    rec.last = now;
    clicks.set(r.id, rec);
    stats.clicks++;
    const n = stats.clicks;
    const special = rec.streak >= STREAK_SPECIAL;
    const sign = unitHash(deps.seed, n, 91) < 0.5 ? -1 : 1;
    const emit = (spec: ReactionSpec): void => {
      if (spec.effect && !reduced)
        deps.onEffect?.({ id: spec.effect, result: r, streak: rec.streak });
    };

    if (r.kind === 'terrain') {
      if (!reduced)
        fx.sparkles(
          now,
          r.x,
          r.y + 0.15,
          r.z,
          SPARKLES.count,
          SPARKLES.radius,
          SPARKLES.size,
          SPARKLES.life,
          SPARKLES.color,
          unitHash(deps.seed, n, 92) * 6.28,
        );
      if (special) rec.streak = 0;
      return true;
    }
    if (r.kind === 'water') {
      if (reduced) deps.water?.splat(r.x, r.z, 1.2, 0.3);
      else {
        deps.water?.splat(r.x, r.z, 1.8, 0.9);
        fx.sparkles(
          now,
          r.x,
          r.y + 0.15,
          r.z,
          SPARKLES.count,
          SPARKLES.radius,
          SPARKLES.size,
          SPARKLES.life,
          SPARKLES.color,
          unitHash(deps.seed, n, 92) * 6.28,
        );
        if (unitHash(deps.seed, n, 93) < 0.3) deps.life?.ambient.fire('fishJump', r.x, r.z);
      }
      if (special) rec.streak = 0;
      return true;
    }

    const e = entryFor(r);
    if (!e) return false;
    let spec: ReactionSpec;
    if (r.kind === 'prop') {
      const info = propInfo(r);
      spec = PROP_REACTIONS[info.family] ?? DEFAULT_SPEC;
    } else {
      spec =
        AGENT_REACTIONS[(r.agent as NonNullable<PickResult['agent']>).kind.name] ?? DEFAULT_SPEC;
    }
    spec = mergeSpec(spec, rec.streak);
    e.rx = new Rx(spec, reduced, sign);
    stats.reactions++;

    if (!reduced) {
      fx.sparkles(
        now,
        r.x,
        r.y + 0.1,
        r.z,
        SPARKLES.count,
        SPARKLES.radius,
        SPARKLES.size,
        SPARKLES.life,
        SPARKLES.color,
        unitHash(deps.seed, n, 92) * 6.28,
      );
      spawnExtras(r, e, spec, now, n);
      if (e.kind === 'agent' && spec.hold > 0)
        e.agent.hold[e.index] = Math.max(e.agent.hold[e.index], spec.hold);
      emit(spec);
    }
    if (special) rec.streak = 0;
    return true;
  }

  function spawnExtras(r: PickResult, e: Entry, spec: ReactionSpec, now: number, n: number): void {
    const h = (salt: number): number => unitHash(deps.seed, n, salt);
    let x: number;
    let z: number;
    let top: number;
    let baseY: number;
    let height = 1;
    if (e.kind === 'prop') {
      const info = propInfo(r);
      x = info.cx;
      z = info.cz;
      height = info.height;
      baseY = info.baseY;
      top = baseY + height;
    } else {
      x = e.agent.x[e.index];
      z = e.agent.z[e.index];
      baseY = e.agent.y[e.index];
      top = baseY + 1;
    }
    for (const extra of spec.extras) {
      switch (extra) {
        case 'leaves': {
          const count = 3 + Math.floor(h(94) * 3);
          for (let k = 0; k < count; k++) {
            const a = h(95 + k) * Math.PI * 2;
            const rr = 0.3 + h(110 + k) * 0.9;
            const sy = baseY + height * (0.6 + 0.3 * h(120 + k));
            const gx = x + Math.cos(a) * rr;
            const gz = z + Math.sin(a) * rr;
            const fall = Math.max(sy - groundAt(gx, gz, baseY), 0.6);
            fx.leaf(
              now,
              k * 0.07,
              gx,
              sy,
              gz,
              fall,
              h(130 + k) * 6.28,
              LEAF_COLORS[Math.floor(h(140 + k) * LEAF_COLORS.length)],
            );
          }
          break;
        }
        case 'puff':
          fx.puff(now, 0.1, Fx.Heart, x, top, z, 0.5, FX_COLORS.heart, 1.2);
          break;
        case 'doublePuff':
          fx.puff(now, 0.1, Fx.Heart, x + 0.4, top, z, 0.4, FX_COLORS.heart, 1.2);
          fx.puff(now, 0.4, Fx.Heart, x - 0.4, top, z, 0.4, FX_COLORS.heart, 1.2);
          break;
        case 'apple':
          fx.puff(
            now,
            0.15,
            Fx.Apple,
            x + 0.5,
            baseY + height * 0.65,
            z + 0.3,
            0.3,
            FX_COLORS.apple,
            1.8,
            groundAt(x + 0.5, z + 0.3, baseY),
          );
          break;
        case 'sandPuff':
          for (let k = 0; k < 3; k++) {
            const a = (k / 3) * Math.PI * 2 + h(150) * 2;
            fx.puff(
              now,
              0.05 * k,
              Fx.Sand,
              x + Math.cos(a) * 0.25,
              baseY + 0.1,
              z + Math.sin(a) * 0.25,
              0.5,
              FX_COLORS.sand,
              0.9,
            );
          }
          break;
        case 'ring':
          deps.water?.splat(x, z, 2.2, 0.5);
          break;
        case 'fishJump':
          deps.life?.ambient.fire('fishJump', x, z);
          break;
      }
    }
    if (spec.emote && e.kind === 'agent') {
      const a = e.agent;
      const i = e.index;
      fx.bubble(now, x, baseY + 1.1, z, () =>
        a.active[i] ? { x: a.x[i], y: a.y[i] + a.ovY[i] + 1.1, z: a.z[i] } : null,
      );
    }
  }

  function setHover(r: PickResult | null): void {
    const e = r ? entryFor(r) : null;
    const key = e?.key ?? null;
    if (key === hoverKey) return;
    if (hoverKey) {
      const old = entries.get(hoverKey);
      if (old) old.hovTarget = 0;
    }
    hoverKey = key;
    if (e) e.hovTarget = 1;
    else if (r && (r.kind === 'terrain' || r.kind === 'water')) hoverKey = null;
  }

  return {
    group: fx.group,
    stats,
    react,
    setHover,
    setReducedMotion(on) {
      reduced = on;
    },
    update(dt, camera) {
      const d = Math.min(Math.max(dt, 0), 0.1);
      t += d;
      for (const e of [...entries.values()]) {
        e.hov = damp(e.hov, e.hovTarget, HOVER.lambda, d);
        if (Math.abs(e.hov - e.hovTarget) < 0.002) e.hov = e.hovTarget;
        if (e.rx) {
          e.rx.step(d);
          if (e.rx.done) e.rx = null;
        }
        if (!e.rx && e.hov === 0 && e.hovTarget === 0) {
          release(e);
          continue;
        }
        apply(e);
      }
      stats.hovers = entries.size;
      fx.update(t, camera);
      stats.particles = fx.active;
    },
    clear() {
      for (const e of [...entries.values()]) release(e);
      hoverKey = null;
    },
    dispose() {
      for (const e of [...entries.values()]) release(e);
      fx.group.removeFromParent();
    },
  };
}
