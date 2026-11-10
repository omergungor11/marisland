import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CULTURE_CLOCK } from '../content/cultures/rhythm.ts';
import { CULTURE_BOATS } from '../content/life.ts';
import { RESEARCH_HARBOUR_MOTION as M } from '../content/themes/research-harbour-site.ts';
import { arcLengths, pointAtLength, smoothPolyline } from '../core/math/catmull-rom.ts';
import { ferryCallAt } from '../life/boats.ts';
import {
  arrivalEnvelope,
  buildFerrySchedule,
  ferryDist,
  sinceFerryArrival,
} from '../life/ferry.ts';
import { generateWorld, type WorldData } from '../world/index.ts';
import { Scope } from '../core/scope.ts';
import { HARBOUR } from '../content/themes/harbours.ts';
import { createEnvState, sampleEnv } from '../env/env-state.ts';
import { THEME_IDS, type ThemeId } from '../world/types.ts';
import { PART } from './culture-mover-parts.ts';
import { createCultureMovers } from './culture-movers.ts';
import { createBeam } from './night/beam.ts';
import { createBeaconNet } from './night/beacons.ts';
import { appendSettlementProps } from './props/settlement-props.ts';
import { SHARED } from './uniforms.ts';
import { harbourCalmMask } from './world-textures.ts';
import {
  cruiseS,
  diveAt,
  newSubPose,
  subBelow,
  subPathOf,
  subPose,
  surfaceAt,
  type SubPath,
} from './tide-lab-motion.ts';
import { Zone } from '../world/types.ts';

const SPH = CULTURE_CLOCK.secondsPerHour;
const seeds = [1001, 1263, 2315];
const worlds = new Map<number, WorldData>(seeds.map((s) => [s, generateWorld(s)]));
const research = (w: WorldData) => w.islands.find((i) => i.theme === 'research')!;
const path = (w: WorldData): SubPath => subPathOf(research(w))!;

describe('tide sub day (TASK-534)', () => {
  it('dives at 09:00 and surfaces at 16:00, at the dive point', () => {
    for (const w of worlds.values()) {
      const P = path(w);
      const dive = research(w).anchors.subDive;
      const p = newSubPose();
      subPose(P, diveAt() - 0.01, p);
      expect(p.phase).toBe('out');
      subPose(P, diveAt() + 0.01, p);
      expect(p.phase).toBe('sink');
      expect(Math.hypot(p.x - dive.x, p.z - dive.z)).toBeLessThan(0.05);
      subPose(P, 12 * SPH, p);
      expect(p.phase).toBe('down');
      subPose(P, surfaceAt() + 0.01, p);
      expect(p.phase).toBe('rise');
      expect(diveAt()).toBe(9 * SPH);
      expect(surfaceAt()).toBe(16 * SPH);
    }
  });

  it('is moored at its slot, bow out, through the night', () => {
    for (const w of worlds.values()) {
      const P = path(w);
      const m = research(w).anchors.subMooring;
      const p = newSubPose();
      for (const hour of [0, 4, 7, 20, 23.9]) {
        subPose(P, hour * SPH, p);
        expect(p.phase, `${hour}`).toBe('moored');
        expect(Math.hypot(p.x - m.x, p.z - m.z)).toBeLessThan(0.05);
        expect(p.heading).toBeCloseTo(m.rotY, 5);
      }
    }
  });

  it('never jumps: position and heading are continuous over the whole day', () => {
    for (const w of worlds.values()) {
      const P = path(w);
      const a = newSubPose();
      const b = newSubPose();
      subPose(P, 0, a);
      // (a snap does not shrink with the step: the turn rate stays ≤ 2.5 rad/s)
      const step = 0.01;
      for (let d = step; d < 24 * SPH; d += step) {
        subPose(P, d, b);
        expect(Math.hypot(b.x - a.x, b.z - a.z), `day ${d}`).toBeLessThan(
          M.sub.speed * 2.2 * step + 1e-3,
        );
        const dh = Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading));
        expect(Math.abs(dh), `day ${d} heading`).toBeLessThan(0.025);
        expect(Math.abs(b.y - a.y), `day ${d} y`).toBeLessThan(0.01);
        Object.assign(a, b);
      }
    }
  });

  it('the cruise takes less than the mooring-to-dive morning', () => {
    for (const w of worlds.values()) {
      expect(cruiseS(path(w))).toBeLessThan(2 * SPH);
    }
  });

  it('bubbles run only while the hull is below', () => {
    expect(subBelow(8.9 * SPH)).toBe(false);
    expect(subBelow(diveAt())).toBe(true);
    expect(subBelow(12 * SPH)).toBe(true);
    expect(subBelow(surfaceAt() + M.sub.sink + 0.01)).toBe(false);
  });
});

describe('ferry call (TASK-534)', () => {
  it('the closed-form arrival is when the boat stands at this pier', () => {
    const F = CULTURE_BOATS.ferry;
    for (const w of worlds.values()) {
      const isl = research(w);
      const di = w.docks.findIndex((d) => d.islandId === isl.id);
      const call = ferryCallAt(w, di, 2);
      expect(call).not.toBeNull();
      const route = w.boatRoutes
        .filter((r) => r.kind === 'ferry')
        .find((r) => r.stops?.includes(di))!;
      const pts = smoothPolyline(
        route.points.map((p) => ({ x: p.x, y: p.z })),
        4,
        true,
      );
      const lens = arcLengths(pts, true);
      const stops = (route.stops ?? []).map((k) => {
        const d = w.docks[k];
        return {
          x: d.x + Math.cos(d.rotY) * d.segments * 2,
          y: d.z + Math.sin(d.rotY) * d.segments * 2,
        };
      });
      const arcs = stops.map((s) => {
        let best = 0;
        let bd = Infinity;
        pts.forEach((p, i) => {
          const q = (p.x - s.x) ** 2 + (p.y - s.y) ** 2;
          if (q < bd) {
            bd = q;
            best = i;
          }
        });
        return lens[best];
      });
      const sch = buildFerrySchedule(
        lens[lens.length - 1],
        arcs,
        route.dwell ?? 0,
        F.speed,
        F.decel,
      );
      const berth = isl.anchors.ferryBerth;
      // first arrival in the cycle: stands within ROUTES reach of the berth for the whole dwell
      let t = 0;
      while (sinceFerryArrival(call!, t) > 0.5) t += 0.25;
      for (const u of [0.5, call!.dwell / 2, call!.dwell - 0.5]) {
        const d = ferryDist(sch, t + u + call!.offs[0]);
        const p = pointAtLength(pts, lens, d % sch.total, true, { x: 0, y: 0 });
        expect(Math.hypot(p.x - berth.x, p.y - berth.z), `seed ${w.seed} u ${u}`).toBeLessThan(5);
      }
    }
  });

  it('a line with no boat gets no call; every line runs with two boats', () => {
    for (const w of worlds.values()) {
      const di = w.docks.findIndex((d) => d.islandId === research(w).id);
      expect(ferryCallAt(w, di, 2)).not.toBeNull();
      const lines = w.boatRoutes.filter((r) => r.kind === 'ferry');
      const line = lines.findIndex((r) => r.stops?.includes(di));
      expect(ferryCallAt(w, di, 1) === null).toBe(line === 1);
    }
  });

  it('arrival envelope: up, held through the dwell, down, then nothing', () => {
    const e = (u: number): number => arrivalEnvelope(u, 8, 1, 2, 3);
    expect(e(0)).toBe(0);
    expect(e(1)).toBe(1);
    expect(e(5)).toBe(1);
    expect(e(11)).toBe(1);
    expect(e(12)).toBeGreaterThan(0);
    expect(e(12)).toBeLessThan(1);
    expect(e(13)).toBe(0);
    expect(e(200)).toBe(0);
  });
});

describe('harbour calm mask (TASK-534)', () => {
  it('marks lagoon water on the coast side of the arm only', () => {
    for (const w of worlds.values()) {
      const isl = research(w);
      const mask = harbourCalmMask(w);
      const h = w.height;
      let n = 0;
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        n++;
        expect(w.zone[i]).toBe(Zone.lagoon);
        const x = h.originX + (i % h.n) * h.cellSize;
        const z = h.originZ + Math.floor(i / h.n) * h.cellSize;
        // (TASK-536: every harbour's lagoon, each near its own island)
        const armed = w.islands.filter((o) => o.anchors.harbourArm0);
        expect(
          Math.min(...armed.map((o) => Math.hypot(x - o.cx, z - o.cz) - o.reach)),
        ).toBeLessThan(30);
      }
      expect(n, `seed ${w.seed}`).toBeGreaterThan(8);
      // the city's slots are all sheltered
      const c = isl.anchors.sunkenCity;
      const i =
        Math.round((c.z - h.originZ) / h.cellSize) * h.n +
        Math.round((c.x - h.originX) / h.cellSize);
      expect(mask[i], `seed ${w.seed} city`).toBe(255);
      // the dive point lies outside
      const d = isl.anchors.subDive;
      const j =
        Math.round((d.z - h.originZ) / h.cellSize) * h.n +
        Math.round((d.x - h.originX) / h.cellSize);
      expect(mask[j], `seed ${w.seed} dive`).toBe(0);
    }
  });

  // TASK-674 (D-173): the marina is an open crescent quay on the bay now; the mask still calms the
  // lagoon cells of the `marinaBasin` disc (its berth strips at the back of the bay) and leaves the
  // open sea past the mouth (the follow-up shader task re-fits it to the quay)
  it('calms the berths at the back of the bay and fades out through its mouth (TASK-664)', () => {
    const w = worlds.get(1001)!;
    const m = w.islands.find((o) => o.anchors.marinaBasin)!;
    const A = m.anchors;
    const mask = harbourCalmMask(w);
    const h = w.height;
    const at = (x: number, z: number): number =>
      mask[
        Math.round((z - h.originZ) / h.cellSize) * h.n + Math.round((x - h.originX) / h.cellSize)
      ];
    const c = A.marinaBasin;
    const dx = Math.cos(c.rotY);
    const dz = Math.sin(c.rotY);
    // the berth strip off the quay point at the back of the bay (farthest from the mouth)
    let back = A.marinaQuay0;
    for (let k = 0; A[`marinaQuay${k}`]; k++) {
      const q = A[`marinaQuay${k}`];
      if ((q.x - c.x) * dx + (q.z - c.z) * dz < (back.x - c.x) * dx + (back.z - c.z) * dz) back = q;
    }
    const o = A.marinaQuaySize.x / 2 + 4;
    expect(at(back.x - Math.sin(back.rotY) * o, back.z + Math.cos(back.rotY) * o)).toBe(255);
    // past the mouth: open sea
    const mo = A.marinaMouth;
    expect(at(mo.x + Math.cos(mo.rotY) * 12, mo.z + Math.sin(mo.rotY) * 12)).toBe(0);
  });
});

describe('Tide-Lab scenes (TASK-534)', () => {
  const world = worlds.get(1001)!;
  const isl = research(world);
  const { props } = appendSettlementProps(world);
  const view = createCultureMovers(props, world, new Scope('tide-lab'), 2);
  const festival = Object.fromEntries(THEME_IDS.map((t) => [t, null])) as Record<ThemeId, null>;
  const count = (kind: number, near: { x: number; z: number }, r: number): number => {
    const mesh = view.meshes[kind];
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      if (Math.hypot(p.x - near.x, p.z - near.z) < r) n++;
    }
    return n;
  };
  const at = (time: number, hour: number, day: number): void =>
    view.update(
      time,
      hour,
      sampleEnv(hour, createEnvState()),
      new THREE.Vector3(isl.anchors.sunkenCity.x, 20, isl.anchors.sunkenCity.z),
      { festival, day },
    );

  it('fish swim round the ruins under the water, all day', () => {
    at(6, 12, 12 * SPH);
    const city = isl.anchors.sunkenCity;
    expect(count(PART.fish, city, 22)).toBeGreaterThanOrEqual(M.fish.n);
    const mesh = view.meshes[PART.fish];
    const m = new THREE.Matrix4();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      expect(new THREE.Vector3().setFromMatrixPosition(m).y).toBeLessThan(5);
    }
  });

  it('bubbles at the dive point only while the sub is down', () => {
    const dive = isl.anchors.subDive;
    at(6, 12, 12 * SPH);
    expect(count(PART.ring, dive, 2)).toBeGreaterThanOrEqual(M.bubbles.n);
    at(6, 20, 20 * SPH);
    expect(count(PART.ring, dive, 2)).toBe(0);
  });

  it('the ferry arrival wakes the lab: a keeper on the deck, then nothing once it has gone', () => {
    const di = world.docks.findIndex((d) => d.islandId === isl.id);
    const call = ferryCallAt(world, di, 2)!;
    let t = 0;
    while (sinceFerryArrival(call, t) > 0.25) t += 0.25;
    const lab = isl.anchors.tideLab;
    at(t + 3, 10, 10 * SPH);
    expect(count(PART.keeper, lab, 6)).toBe(1);
    expect(count(PART.glow, lab, 6)).toBeGreaterThanOrEqual(M.arrival.lamps.length);
    at(t + call.dwell + M.arrival.linger + M.arrival.fall + 5, 10, 10 * SPH);
    expect(count(PART.keeper, lab, 6)).toBe(0);
    expect(count(PART.glow, lab, 6)).toBe(0);
  });

  it('the harbour light turns with the beacon net, a beam at its lamp, near only', () => {
    const scope = new Scope('tide-beam');
    const net = createBeaconNet(props, world, createBeam(props, scope), scope);
    const L = isl.anchors.harbourLight;
    // (TASK-536: Marketing's harbour light has a beam of its own)
    const beam = net.group.children.find(
      (m) => m.name === 'harbour-beam' && Math.hypot(m.position.x - L.x, m.position.z - L.z) < 1,
    ) as THREE.Mesh;
    expect(beam).toBeDefined();
    expect(beam.position.x).toBeCloseTo(L.x, 3);
    expect(beam.position.z).toBeCloseTo(L.z, 3);
    expect(beam.position.y).toBeCloseTo((L.y ?? 0) + HARBOUR.light.lamp.y, 2);
    const lamps = SHARED.uLamps.value.z;
    SHARED.uLamps.value.z = 1;
    net.update(new THREE.Vector3(L.x, 20, L.z + 30));
    expect(beam.visible).toBe(true);
    net.update(new THREE.Vector3(L.x, 20, L.z + 400));
    expect(beam.visible).toBe(false);
    SHARED.uLamps.value.z = lamps;
  });
});
