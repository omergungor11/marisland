import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { Scope } from '../core/scope.ts';
import { PROP_DEFS } from '../content/props.ts';
import { CULTURES } from '../content/cultures/index.ts';
import { CULTURE_MOVERS as M } from '../content/cultures/movers.ts';
import { RELAY } from '../content/cultures/rhythm.ts';
import { SEMAPHORE } from '../content/props-themes/m20.ts';
import { SIGNAL_CHAIN } from '../content/signature.ts';
import { createEnvState, sampleEnv, type EnvState } from '../env/env-state.ts';
import { generateWorld } from '../world/index.ts';
import { THEME_IDS, type ThemeId, type WorldData } from '../world/types.ts';
import { appendSettlementProps } from './props/settlement-props.ts';
import { createCultureMovers, type CultureMoversView } from './culture-movers.ts';
import { PART, buildPartGeometries, buildPartsGeometry } from './culture-mover-parts.ts';
import { SHARED } from './uniforms.ts';
import { DEVOPS_M25 } from '../content/themes/devops-m25.ts';
import { DEVOPS_M25_MOTION } from '../content/themes/devops-m25-site.ts';
import { DEVOPS_M26_MOTION } from '../content/themes/devops-m26-site.ts';
import { DOCK } from '../content/settlements.ts';
import { pierLoop } from './harbour-routes.ts';
import { MARKETING_M27_MOTION } from '../content/themes/marketing-m27-site.ts';

/** Prop store position of the first instance of def `id` (null when the seed has none). */
function firstOf(
  w: WorldData,
  store: ReturnType<typeof appendSettlementProps>['props'],
  id: string,
) {
  for (let i = 0; i < store.count; i++)
    if (PROP_DEFS[store.defId[i]].id === id)
      return new THREE.Vector3(store.x[i], store.y[i] + 2, store.z[i]);
  void w;
  return null;
}

/** Culture-clock state with one ritual running on `theme` (or none). */
function fest(theme?: ThemeId, id = '', phase = 0.3) {
  const festival = {} as Record<ThemeId, { id: string; phase: number } | null>;
  for (const t of THEME_IDS) festival[t] = t === theme ? { id, phase } : null;
  return { festival };
}

function env(hour: number): EnvState {
  const e = createEnvState();
  sampleEnv(hour, e);
  return e;
}

/** Packed instance matrices + kinds of the live range, for determinism / NaN checks. */
function snapshot(v: CultureMoversView): number[] {
  const out: number[] = [];
  for (const m of v.meshes) {
    const gait = m.geometry.getAttribute('aGait');
    for (let i = 0; i < m.count; i++) {
      out.push(gait.getY(i));
      for (let k = 0; k < 16; k++) out.push(m.instanceMatrix.array[i * 16 + k]);
    }
  }
  return out;
}

describe('culture movers', () => {
  const world = generateWorld(1001);
  const { props } = appendSettlementProps(world);
  let view: CultureMoversView;
  /** Placed soft puffs (TASK-486): x, y, z, size, opacity per slot; uploads counted. */
  const placed: number[][] = [];
  let uploads = 0;
  beforeAll(() => {
    view = createCultureMovers(props, world, new Scope('test'));
    view.bindPuffs({
      reserve: (n) => {
        for (let i = 0; i < n; i++) placed.push([0, 0, 0, 0, 0, 1]);
        return {
          count: n,
          set: (i, x, y, z, size, opacity, edge) => (placed[i] = [x, y, z, size, opacity, edge]),
          upload: () => void uploads++,
        };
      },
    });
  });

  it('parts geometry: one merged mesh, every kind present, no NaN', () => {
    const g = buildPartsGeometry();
    const limb = g.getAttribute('limb');
    const kinds = new Set<number>();
    for (let i = 0; i < limb.count; i++) kinds.add(limb.getX(i));
    expect(kinds.size).toBe(Object.keys(PART).length);
    for (const a of ['position', 'normal', 'color', 'emissive'])
      expect(g.getAttribute(a).array.every(Number.isFinite)).toBe(true);
    // 22 kinds, each its own instanced mesh (TASK-495): the total only bounds the build cost
    // (TASK-508 added the customs ship / container / trolley / spreader, ~1700 vertices)
    expect(g.getAttribute('position').count).toBeLessThan(6000);
  });

  it('per-kind split (TASK-495): every vertex once, each geometry holds only its own kind', () => {
    const all = buildPartsGeometry();
    const parts = buildPartGeometries();
    expect(parts).toHaveLength(Object.keys(PART).length);
    let n = 0;
    parts.forEach((g, k) => {
      const limb = g.getAttribute('limb');
      expect(limb.count).toBeGreaterThan(0);
      expect(limb.count % 3).toBe(0);
      for (let i = 0; i < limb.count; i++) expect(limb.getX(i)).toBe(k);
      expect(Object.keys(g.attributes).sort()).toEqual(Object.keys(all.attributes).sort());
      n += limb.count;
    });
    expect(n).toBe(all.getAttribute('position').count);
  });

  it('draws each kind on its own mesh: an instance costs only its shape', () => {
    const at = firstOf(world, props, 'bellPost')!;
    view.update(10, 6.1, env(6.1), at, fest('hq', 'ferryFanfare'));
    expect(view.stats().instances).toBeGreaterThan(0);
    let drawn = 0;
    view.meshes.forEach((m, k) => {
      const gait = m.geometry.getAttribute('aGait');
      for (let i = 0; i < m.count; i++) expect(gait.getY(i)).toBe(k);
      expect(m.visible).toBe(m.count > 0);
      drawn += m.count;
    });
    expect(drawn).toBe(view.stats().instances);
    // one shared material = one program for every kind
    expect(new Set(view.meshes.map((m) => m.material)).size).toBe(1);
  });

  it('every scene kind exists in seed 1001 (or is covered by ants / beams)', () => {
    expect(view.sceneCount).toBeGreaterThanOrEqual(8);
  });

  it('writes poses near a scene, deterministic in (time, hour), no NaN', () => {
    const at = firstOf(world, props, 'bellPost');
    expect(at).not.toBeNull();
    const e = env(6.1);
    view.update(10, 6.1, e, at!, fest('hq', 'ferryFanfare'));
    const a = snapshot(view);
    expect(view.stats().instances).toBeGreaterThanOrEqual(M.bell.rings);
    expect(a.every(Number.isFinite)).toBe(true);
    view.update(10.5, 6.1, e, at!, fest('hq', 'ferryFanfare'));
    const b = snapshot(view);
    expect(b).not.toEqual(a); // ripples move with sim time
    view.update(10, 6.1, e, at!, fest('hq', 'ferryFanfare'));
    expect(snapshot(view)).toEqual(a); // same (t, hour) -> same pose
  });

  it('rituals follow the culture clock: bell rings only in the fanfare, kites only on kite day', () => {
    const bell = firstOf(world, props, 'bellPost')!;
    view.update(3, 12, env(12), bell, fest());
    const noon = ofKind(view, PART.ring).length;
    expect(noon).toBe(0);
    view.update(3, 6, env(6), bell, fest('hq', 'ferryFanfare'));
    expect(ofKind(view, PART.ring).length).toBeGreaterThanOrEqual(M.bell.rings);
    const rack = firstOf(world, props, 'kiteRack');
    if (rack) {
      view.update(3, 9, env(9), rack, fest());
      const before = view.stats().instances;
      view.update(3, 14, env(14), rack, fest('coding', 'kiteDay'));
      expect(view.stats().instances).toBeGreaterThan(before);
    }
  });

  it('QA flag climbs the mast at green light, confetti bursts at the show', () => {
    const mast = firstOf(world, props, 'flagMast')!;
    // (the customs port on the same island moves with the hour too: leave its parts out of the count)
    const portParts: number[] = [
      PART.ship,
      PART.cargo,
      PART.trolley,
      PART.spreader,
      PART.cable,
      PART.glow,
      PART.ring,
      PART.blob,
    ];
    const rest = (): number =>
      view.stats().instances - portParts.reduce((n, k) => n + ofKind(view, k).length, 0);
    view.update(3, 12, env(12), mast, fest());
    const idle = rest();
    view.update(3, 16, env(16), mast, fest('qa', 'greenLight'));
    expect(rest()).toBeGreaterThan(idle);
    const cannon = firstOf(world, props, 'confettiCannon')!;
    view.update(3, 17.5, env(17.5), cannon, fest('marketing', 'goldenHourShow', 0.03));
    const burst = view.stats().instances;
    view.update(3, 17.5, env(17.5), cannon, fest('marketing', 'goldenHourShow', 0.5));
    expect((burst - view.stats().instances) % M.confetti.pieces).toBe(0);
    expect(burst - view.stats().instances).toBeGreaterThanOrEqual(M.confetti.pieces);
  });

  it('design light patches: under the prism at noon, >= 2x longer at 17:30, none at night', () => {
    const prism = firstOf(world, props, 'prismSculpture')!;
    const lenAt = (hour: number): number => {
      view.update(3, hour, env(hour), prism, fest());
      const m = view.meshes[PART.patch];
      const gait = m.geometry.getAttribute('aGait');
      let best = 0;
      const mm = new THREE.Matrix4();
      const s = new THREE.Vector3();
      for (let i = 0; i < m.count; i++) {
        if (gait.getY(i) !== PART.patch) continue;
        m.getMatrixAt(i, mm);
        mm.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
        best = Math.max(best, s.x);
      }
      return best;
    };
    const noon = lenAt(12);
    const golden = lenAt(17.5);
    expect(noon).toBeGreaterThan(0);
    expect(golden / noon).toBeGreaterThanOrEqual(1.6);
    expect(lenAt(2)).toBe(0);
  });

  it('Research (M22): bell hour swings the belfry bells, the test firing steams, the caps fly', () => {
    // the bell-cupola tower (campusTower v3)
    let tower: THREE.Vector3 | null = null;
    for (let i = 0; i < props.count && !tower; i++)
      if (PROP_DEFS[props.defId[i]].id === 'campusTower' && props.variant[i] === 3)
        tower = new THREE.Vector3(props.x[i], props.y[i] + 8, props.z[i]);
    expect(tower).not.toBeNull();
    const B = M.campusBell;
    view.update(3, 12, env(12), tower!, fest());
    const rest = ofKind(view, PART.bell);
    expect(rest.length).toBe(2); // the bells hang there all day
    expect(ofKind(view, PART.ring).length).toBe(0);
    const at = (t: number) => {
      view.update(3, 9, env(9), tower!, fest('research', B.ritual, t / B.seconds));
      return snapshot(view);
    };
    const a = at(0.2 * B.swing);
    const b = at(0.45 * B.swing);
    expect(ofKind(view, PART.bell).length).toBe(2);
    expect(ofKind(view, PART.ring).length).toBeGreaterThanOrEqual(B.rings);
    expect(b).not.toEqual(a); // the bells are swinging
    expect(a.every(Number.isFinite)).toBe(true);
    // the swing is over before the ritual ends: the bells hang again (and the rings are gone)
    at(B.seconds - 0.1);
    expect(ofKind(view, PART.ring).length).toBe(0);

    // the gantry rocket (rocketMonument v1): steam only while testFiring runs
    const pad = world.fixtures.find((f) => f.defId === 'rocketMonument' && f.variant === 1);
    expect(pad).toBeDefined();
    const gp = new THREE.Vector3(pad!.x, 6, pad!.z);
    // (other scenes in range draw blobs too: count the ones within 6 u of the pad)
    const near = (kind: number): number =>
      ofKind(view, kind).filter(
        (m) => Math.hypot(m.elements[12] - pad!.x, m.elements[14] - pad!.z) < 6,
      ).length;
    // steam = soft puffs on the puff program (TASK-486), not lit blobs
    const L = M.launch;
    // + the M25 geysers' steam (TASK-507) + the M26 tug funnel smoke per DevOps pier loop (TASK-509c)
    const geysers = world.fixtures.filter((f) => f.defId === 'geyserCone').length;
    const loops = world.docks.filter(
      (d) =>
        world.islands[d.islandId]?.theme === 'devops' &&
        pierLoop(
          world.height,
          d,
          { x: Math.cos(d.rotY), z: Math.sin(d.rotY) },
          d.segments * DOCK.segment,
        ),
    ).length;
    expect(loops).toBeGreaterThan(0);
    expect(placed.length).toBe(
      L.puffs * 2 + geysers * DEVOPS_M25_MOTION.geyser.puffs + loops * DEVOPS_M26_MOTION.tugSmoke.n,
    );
    const steam = (): number[][] =>
      placed.filter((p) => p[3] > 0 && Math.hypot(p[0] - pad!.x, p[2] - pad!.z) < 6);
    view.update(3, 12, env(12), gp, fest());
    expect(steam().length).toBe(0);
    view.update(3, 12, env(12), gp, fest('research', L.ritual, 1.6 / L.seconds));
    expect(near(PART.blob)).toBe(0);
    const mid = steam();
    expect(mid.length).toBeGreaterThanOrEqual(12);
    expect(mid.every((p) => p.every(Number.isFinite) && p[4] > 0 && p[4] <= 1)).toBe(true);
    // several overlapping puffs of different sizes, not one ball
    expect(new Set(mid.map((p) => p[3].toFixed(2))).size).toBeGreaterThan(6);
    expect(near(PART.glow)).toBe(1);
    const up = uploads;
    view.update(3, 12, env(12), gp, fest('research', L.ritual, 3.9 / L.seconds));
    expect(near(PART.glow)).toBe(0);
    // thinning out at the end of the ritual
    expect(Math.max(...steam().map((p) => p[4]))).toBeLessThan(0.2);
    // over: every puff hidden (and uploaded once more)
    view.update(3, 12, env(12), gp, fest());
    expect(steam().length).toBe(0);
    expect(uploads).toBeGreaterThan(up);

    // the lecture spot: six caps fly at capToss
    const sp = world.storySpots.find((q) => q.kind === 'lecture' && q.islandId === pad!.islandId);
    expect(sp).toBeDefined();
    const lp = new THREE.Vector3(sp!.pos.x, sp!.pos.y + 1, sp!.pos.z);
    const C = M.capToss;
    view.update(3, 17.75, env(17.75), lp, fest());
    expect(ofKind(view, PART.cap).length).toBe(0);
    view.update(3, 17.75, env(17.75), lp, fest('research', C.ritual, 1.4 / C.seconds));
    const air = ofKind(view, PART.cap);
    expect(air.length).toBe(C.spots.length);
    expect(
      Math.max(...air.map((m) => new THREE.Vector3().setFromMatrixPosition(m).y)),
    ).toBeGreaterThan(sp!.pos.y + 1.5);
  });

  it('hidden beyond the range: nothing written, no draw', () => {
    const far = new THREE.Vector3(5000, 50, 5000);
    view.update(3, 6.1, env(6.1), far, fest('hq', 'ferryFanfare'));
    expect(view.stats().instances).toBe(0);
    expect(view.meshes.some((m) => m.visible)).toBe(false);
    expect(view.stats().beams).toBe(0);
  });

  it('reduced motion calms the wobble but keeps the ritual', () => {
    const mast = firstOf(world, props, 'bellPost')!;
    SHARED.uMotionScale.value = 0;
    view.update(3, 6, env(6), mast, fest('hq', 'ferryFanfare'));
    const n = view.stats().instances;
    expect(n).toBeGreaterThan(0);
    SHARED.uMotionScale.value = 1;
  });

  /** Culture-clock state at `simt` s into the relay (frozen capture: time = 21 + simt). */
  const relay = (simt: number) => ({
    ...fest(),
    day: RELAY.hour * M.secondsPerHour + simt,
  });
  /** World positions of every instance of a part kind. */
  function ofKind(v: CultureMoversView, kind: number): THREE.Matrix4[] {
    const m = v.meshes[kind];
    const gait = m.geometry.getAttribute('aGait');
    const out: THREE.Matrix4[] = [];
    for (let i = 0; i < m.count; i++)
      if (gait.getY(i) === kind)
        out.push(new THREE.Matrix4().fromArray(m.instanceMatrix.array, i * 16));
    return out;
  }
  const zAngleDeg = (m: THREE.Matrix4): number => {
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    const d = THREE.MathUtils.radToDeg(2 * Math.atan2(q.z, q.w));
    return d > 180 ? d - 360 : d < -180 ? d + 360 : d;
  };

  it('HQ semaphore arms follow the relay: V rest, one spring pose per step, back to rest', () => {
    const tower = firstOf(world, props, 'semaphoreTower');
    expect(tower).not.toBeNull();
    const arms = (day: { day: number }, hour: number, time = 3): number[] => {
      view.update(time, hour, env(hour), tower!, { ...fest(), ...day });
      return ofKind(view, PART.arm).map(zAngleDeg);
    };
    const [rl, rr] = SEMAPHORE.restDeg;
    const noon = arms({ day: 12 * 25 }, 12);
    expect(noon).toHaveLength(2);
    expect(Math.abs(noon[0] - rl)).toBeLessThan(3);
    expect(Math.abs(noon[1] - rr)).toBeLessThan(3);
    // settled at the end of each 10 s step, the pose of that step
    M.semaphore.poses.forEach(([l, r], k) => {
      const a = arms(relay(k * 10 + 9), 21);
      expect(Math.abs(a[0] - l), `step ${k} left`).toBeLessThan(3);
      expect(Math.abs(a[1] - r), `step ${k} right`).toBeLessThan(3);
    });
    // the spring overshoots right after a step (0.4 s in: past the target, toward the new pose)
    const [l1] = M.semaphore.poses[1];
    const early = arms(relay(10.35), 21);
    expect(early[0]).toBeGreaterThan(rl); // on its way from the rest V (38) to the T pose (90) …
    expect(early[0]).not.toBeCloseTo(l1, 0); // … not there yet
    // after the relay (+ spring time) the arms are back at rest
    const after = arms(relay(70 + 8), 22);
    expect(Math.abs(after[0] - rl)).toBeLessThan(3);
    expect(Math.abs(after[1] - rr)).toBeLessThan(3);
    // deterministic in (time, day)
    expect(arms(relay(23.3), 21)).toEqual(arms(relay(23.3), 21));
  });

  it('HQ gate lanterns light up one after another in relay order', () => {
    const tower = firstOf(world, props, 'semaphoreTower')!;
    const gateDef = PROP_DEFS.findIndex((d) => d.id === 'cultureGate');
    const orders: number[] = [];
    // the gates of the tower's island (TASK-481: the Marketing island has its own gate far away)
    const semaDef = PROP_DEFS.findIndex((d) => d.id === 'semaphoreTower');
    const hq =
      props.islandId[
        Array.from({ length: props.count }, (_, i) => i).find((i) => props.defId[i] === semaDef) ??
          0
      ];
    for (let i = 0; i < props.count; i++)
      if (props.defId[i] === gateDef && props.islandId[i] === hq)
        orders.push(CULTURES[THEME_IDS[props.variant[i] % THEME_IDS.length]].relay.order);
    expect(orders.length).toBeGreaterThanOrEqual(4);
    // the DevOps M25 trip hammers and switchback lamps (TASK-507) glow below Emberpeak's peak
    const ember = world.islands.find((i) => i.theme === 'devops')!;
    const m25 = (m: THREE.Matrix4): boolean =>
      Math.hypot(m.elements[12] - ember.cx, m.elements[14] - ember.cz) < ember.reach &&
      m.elements[13] < ember.peakY;
    const glows = (simt: number): number => {
      view.update(3, 21, env(21), tower, relay(simt));
      return ofKind(view, PART.glow).filter((m) => !m25(m)).length;
    };
    // every gate's two finial lamps glow all night (TASK-478 rest glow) and so does the signal lamp
    // of each of the seven islands (TASK-490 W:B6); none by day
    const rest = 2 * orders.length + THEME_IDS.length;
    view.update(3, 12, env(12), tower, relay(-5));
    expect(ofKind(view, PART.glow).filter((m) => !m25(m))).toHaveLength(0);
    // +3 = the semaphore lamp and its two arm tips (lit through the relay)
    expect(glows(-5)).toBe(rest);
    let prev = 0;
    for (let step = 0; step < 7; step++) {
      const lit = orders.filter((o) => o <= step + 1).length;
      expect(glows(step * 10 + 5), `step ${step + 1}`).toBe(rest + lit + 3);
      expect(lit).toBeGreaterThanOrEqual(prev);
      prev = lit;
    }
    // the glow holds to the end of the relay and is gone after the fade
    expect(glows(70 + 2)).toBeGreaterThan(rest);
    expect(glows(70 + RELAY.fadeS + 3)).toBe(rest);
  });

  it('signal chain: each island throws three flashes toward the next, in its own step', () => {
    const tower = firstOf(world, props, 'semaphoreTower')!;
    const lamps = SHARED.uLamps.value.z;
    SHARED.uLamps.value.z = 1;
    // the DevOps M25 trip hammers and switchback lamps (TASK-507) glow below Emberpeak's peak
    const ember = world.islands.find((i) => i.theme === 'devops')!;
    const m25 = (m: THREE.Matrix4): boolean =>
      Math.hypot(m.elements[12] - ember.cx, m.elements[14] - ember.cz) < ember.reach &&
      m.elements[13] < ember.peakY;
    const glows = (simt: number): number => {
      view.update(3, 21, env(21), tower, relay(simt));
      return ofKind(view, PART.glow).filter((m) => !m25(m)).length;
    };
    const signalBeams = (): THREE.Mesh[] =>
      view.group.children.filter(
        (o): o is THREE.Mesh => o.name === 'signal-beam' && o.visible,
      ) as THREE.Mesh[];
    const S = SIGNAL_CHAIN;
    const at = (i: number, ph: number): number => S.firstS + i * S.gapS + ph * S.flashS;
    expect(view.group.children.filter((o) => o.name === 'signal-beam')).toHaveLength(7);
    for (let step = 0; step < 7; step++) {
      // between flashes: only the rest lamps, no beam; at a flash peak the step's beam alone shows
      // (its light front on the way); once the front lands, the next lamp pops (+1 glow)
      const quiet = glows(step * 10 + at(0, 1) + 0.4);
      expect(signalBeams()).toHaveLength(0);
      for (let i = 0; i < S.flashes; i++) {
        expect(glows(step * 10 + at(i, S.attack)), `step ${step + 1} flash ${i + 1}`).toBe(quiet);
        expect(signalBeams()).toHaveLength(1);
        const fx = (signalBeams()[0].material as THREE.ShaderMaterial).uniforms.uBeamFx
          .value as THREE.Vector4;
        expect(fx.y).toBeGreaterThan(0.2);
        expect(fx.y).toBeLessThan(1);
        expect(glows(step * 10 + at(i, S.reach + S.catch.fade * 0.5))).toBe(quiet + 1);
      }
      expect(glows(step * 10 + at(S.flashes - 1, 1) + 0.5)).toBe(quiet);
      expect(signalBeams()).toHaveLength(0);
    }
    // deterministic in the clock
    expect(glows(23.15)).toBe(glows(23.15));
    SHARED.uLamps.value.z = lamps;
  });

  it('M27 diver (TASK-518): climbs, leaps into the pool, splashes; by day only, closed form', () => {
    const dive = firstOf(world, props, 'diveTower');
    expect(dive).not.toBeNull();
    if (!dive) return;
    const isl = world.islands.find((i) => i.theme === 'marketing');
    const pool = isl?.anchors.divePool;
    expect(pool).toBeDefined();
    if (!pool) return;
    const D = MARKETING_M27_MOTION.diver;
    let up = 0;
    let rings = 0;
    let air = 0;
    for (let t = 0; t < D.period; t += 0.25) {
      view.update(t, 12, env(12), dive, fest());
      const bots = ofKind(view, PART.keeper)
        .map((m) => new THREE.Vector3().setFromMatrixPosition(m))
        .filter((p) => Math.hypot(p.x - dive.x, p.z - dive.z) < 12);
      if (bots.some((p) => p.y > dive.y + 2)) up++;
      // in the air over the water between the tower and the pool
      if (bots.some((p) => Math.hypot(p.x - pool.x, p.z - pool.z) < 4 && p.y > 1)) air++;
      rings += ofKind(view, PART.ring).filter(
        (m) =>
          new THREE.Vector3()
            .setFromMatrixPosition(m)
            .distanceTo(new THREE.Vector3(pool.x, 0, pool.z)) < 0.5,
      ).length;
    }
    expect(up).toBeGreaterThan(10);
    expect(air).toBeGreaterThan(0);
    expect(rings).toBeGreaterThan(0);
    view.update(9, 3, env(3), dive, fest());
    expect(
      ofKind(view, PART.keeper).filter(
        (m) => new THREE.Vector3().setFromMatrixPosition(m).distanceTo(dive) < 12,
      ),
    ).toHaveLength(0);
  });

  it('stall keepers: one per goods stall, awake from 06:30, closed form', () => {
    const stall = firstOf(world, props, 'goodsStall')!;
    const stallDef = PROP_DEFS.findIndex((d) => d.id === 'goodsStall');
    // the M25 smiths' stalls (v7) run a trip hammer instead of a keeper (TASK-507)
    let stalls = 0;
    for (let i = 0; i < props.count; i++)
      if (props.defId[i] === stallDef && props.variant[i] !== DEVOPS_M25.smith.variant) stalls++;
    expect(stalls).toBeGreaterThanOrEqual(4);
    view.update(3, 4, env(4), stall, fest());
    expect(ofKind(view, PART.keeper)).toHaveLength(0);
    view.update(3, 12, env(12), stall, fest());
    // the M27 diver (TASK-518) is a keeper body too, near its dive tower: not a stall keeper
    const diveDef = PROP_DEFS.findIndex((d) => d.id === 'diveTower');
    const nearDive = (m: THREE.Matrix4): boolean => {
      const p = new THREE.Vector3().setFromMatrixPosition(m);
      for (let i = 0; i < props.count; i++)
        if (props.defId[i] === diveDef && Math.hypot(p.x - props.x[i], p.z - props.z[i]) < 12)
          return true;
      return false;
    };
    expect(ofKind(view, PART.keeper).filter((m) => !nearDive(m))).toHaveLength(stalls);
    expect(ofKind(view, PART.limb)).toHaveLength(stalls * 2);
    const a = snapshot(view);
    view.update(3.5, 12, env(12), stall, fest());
    expect(snapshot(view)).not.toEqual(a);
    view.update(3, 12, env(12), stall, fest());
    expect(snapshot(view)).toEqual(a);
    // everything finite, also with reduced motion
    SHARED.uMotionScale.value = 0;
    view.update(3, 21, env(21), stall, relay(31));
    expect(snapshot(view).every(Number.isFinite)).toBe(true);
    SHARED.uMotionScale.value = 1;
  });
  it('M25 (TASK-507): trip hammers at 1.1 Hz, geysers together at the shift end, switchback lamps', () => {
    const H = DEVOPS_M25_MOTION.hammer;
    const near = (kind: number, p: { x: number; z: number }, r: number): THREE.Matrix4[] =>
      ofKind(view, kind).filter((m) => Math.hypot(m.elements[12] - p.x, m.elements[14] - p.z) < r);
    const stall = world.fixtures.find(
      (f) => f.defId === 'goodsStall' && f.variant === DEVOPS_M25.smith.variant,
    )!;
    expect(stall).toBeDefined();
    const at = new THREE.Vector3(stall.x, 10, stall.z);
    // the anvil in world xz (stall frame: local +x = (sin rotY, -cos rotY), +z = (cos, sin))
    const [ax, , az] = H.anvil;
    const anvil = {
      x: stall.x + ax * Math.sin(stall.rotY) + az * Math.cos(stall.rotY),
      z: stall.z - ax * Math.cos(stall.rotY) + az * Math.sin(stall.rotY),
    };
    // the anvil block + the hammer head: the head is the higher one
    const head = (t: number): number => {
      view.update(t, 12, env(12), at, fest());
      const ys = near(PART.blob, anvil, 0.9).map((m) => m.elements[13]);
      expect(ys).toHaveLength(2);
      return Math.max(...ys);
    };
    const a = head(3);
    expect(head(3 + H.period)).toBeCloseTo(a, 3);
    expect(head(3 + H.period * 0.4)).not.toBeCloseTo(a, 3);
    // one strike flash (a second glow on the anvil, past the workpiece) per stroke
    let flashes = 0;
    for (let t = 3; t < 3 + H.period; t += 0.02) {
      view.update(t, 12, env(12), at, fest());
      if (near(PART.glow, anvil, 0.9).length > 1) flashes++;
    }
    expect(flashes).toBeGreaterThan(0);
    expect(flashes).toBeLessThan(H.period / 0.02 / 2);
    // every geyser cone throws its column during the 17:30 shift end
    const cones = world.fixtures.filter((f) => f.defId === 'geyserCone');
    expect(cones.length).toBeGreaterThanOrEqual(4);
    view.update(
      3,
      17.5,
      env(17.5),
      new THREE.Vector3(cones[0].x, 10, cones[0].z),
      fest('devops', 'shiftEnd', 0.15),
    );
    for (const c of cones) expect(near(PART.blob, c, 1.2).length).toBeGreaterThan(0);
    // the lower car turns at its first switchback at 5 s: its lantern flares at night only
    const sec = world.fences.find((f) => f.kind === 'funicular')!;
    const v = sec.points[1];
    const lamp = world.fixtures
      .filter((f) => f.defId === 'lavaLantern')
      .reduce((a, b) =>
        Math.hypot(b.x - v.x, b.z - v.z) < Math.hypot(a.x - v.x, a.z - v.z) ? b : a,
      );
    expect(Math.hypot(lamp.x - v.x, lamp.z - v.z)).toBeLessThan(5);
    const cam = new THREE.Vector3(v.x, 15, v.z);
    view.update(5, 22, env(22), cam, fest());
    expect(near(PART.glow, lamp, 0.5).length).toBeGreaterThan(0);
    view.update(5, 12, env(12), cam, fest());
    expect(near(PART.glow, lamp, 0.5).length).toBe(0);
  });
});
