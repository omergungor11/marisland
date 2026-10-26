import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import { hashInts } from '../core/hash.ts';
import { WHALE } from '../content/whale.ts';
import { buildWhale, WHALE_RINGS } from '../geo/whale.ts';
import { SLAP_IMPACT, makePose, whalePose, type WhalePose } from '../life/whale-pose.ts';
import {
  planWhaleRoute,
  routeAt,
  whaleEventAt,
  whaleEvents,
  type WhaleEvent,
  type WhaleRoute,
  type WhaleWorld,
} from '../world/gen/whale-route.ts';
import { makeLitMaterial } from './materials/factory.ts';
import { SHARED } from './uniforms.ts';
import type { PlacedPuffs } from './particles/puffs.ts';

/**
 * The whale (M23 TASK-489, `W:D6`): one grey whale for the whole archipelago, a world mover — not
 * an agent. It follows the loop of world/gen/whale-route.ts (open sea only) and surfaces on the
 * schedule from the culture-clock day (`CultureState.day`): back rises, blows, tail slap, fluke-up
 * dive (life/whale-pose.ts). Every pose is a function of the day seconds + seed, so a capture
 * (`?freeze=1&time=…&simt=…`) replays it exactly; only a click adds state (a slap started at sim
 * time `pokeAt`). One InstancedMesh (count 1) on the existing `mar-lit` program — the vertices are
 * re-posed on the CPU (≈ 900 triangles, a few µs) — hidden between surfacings (no draw call). The
 * spout and the splash are placed slots of the puff program (D-066).
 */
export interface WhaleView {
  /** The one draw (hidden between surfacings). */
  mesh: THREE.InstancedMesh;
  route: WhaleRoute;
  events: readonly WhaleEvent[];
  /** Reserve the spout / splash slots on the world's puff mesh (before its `finalize`). */
  bindPuffs(puffs: { reserve(n: number): PlacedPuffs | null }): void;
  /** `day` = culture-clock day seconds, `time` = engine sim time (click slaps), `cam` = camera. */
  update(day: number, time: number, cam: THREE.Vector3): void;
  /** Ray (unit direction) vs the whale; distance along it or -1. Only while it is up and visible. */
  hit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number;
  /** Click: tail slap + splash. False when it is not at the surface or already slapping. */
  poke(time: number): boolean;
  /** Last frame: running event index (-1 none), event second, mesh visible, triangles. */
  stats(): { event: number; u: number; visible: boolean; tris: number };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _ax = new THREE.Vector3(0, 1, 0);
const _ar = new THREE.Vector3(1, 0, 0);
const _r = { x: 0, z: 0, hx: 0, hz: 0 };
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const easeOut = (x: number): number => 1 - Math.pow(1 - clamp01(x), 2.4);
const rnd = (a: number, b: number, c: number): number => hashInts(a, b, c) / 4294967296;

export function createWhale(world: WhaleWorld, seed: number, scope: Scope): WhaleView | null {
  const route = planWhaleRoute(world, seed);
  if (!route) return null;
  const events = whaleEvents(route, seed);
  const rig = buildWhale();
  const geo = scope.add(rig.geometry);
  const mat = scope.add(
    makeLitMaterial(
      { instanced: true, dither: true, emissive: true, rim: true },
      { fadeNear: WHALE.fade.near, fadeFar: WHALE.fade.far, name: 'whale' },
    ),
  );
  const mesh = new THREE.InstancedMesh(geo, mat, 1);
  mesh.name = 'whale';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.visible = false;
  scope.add(mesh);

  const E = WHALE.event;
  const SP = WHALE.spout;
  const SL = WHALE.splash;
  let puffs: PlacedPuffs | null = null;
  let lastPuffs = 0;
  let pokeAt = Number.NaN;
  let last = { event: -1, u: 0, visible: false };
  const pose: WhalePose = makePose();
  const tmp: WhalePose = makePose();

  /** Matrix of the whale at event `ev`, second `u`, for pose `p` (writes `_m`). */
  const place = (ev: WhaleEvent, p: WhalePose): THREE.Matrix4 => {
    routeAt(route, ev.s + p.forward, _r);
    _q.setFromAxisAngle(_ax, Math.atan2(-_r.hz, _r.hx));
    _qr.setFromAxisAngle(_ar, p.roll);
    _q.multiply(_qr);
    return _m.compose(_p.set(_r.x, p.y, _r.z), _q, _v.set(1, 1, 1));
  };

  const clickTau = (time: number): number => (Number.isNaN(pokeAt) ? Number.NaN : time - pokeAt);

  /** Blowhole (world) of the current pose; writes `_p`. */
  const blowhole = (m: THREE.Matrix4): THREE.Vector3 => {
    const k = WHALE_RINGS.blowK;
    const phi = Math.atan2(
      rig.spine.y[k + 1] - rig.spine.y[k - 1],
      rig.spine.x[k - 1] - rig.spine.x[k + 1],
    );
    return _p
      .set(
        rig.spine.x[k] - Math.sin(phi) * WHALE_RINGS.blowR,
        rig.spine.y[k] + Math.cos(phi) * WHALE_RINGS.blowR + SP.blowhole.lift,
        0,
      )
      .applyMatrix4(m);
  };

  const hidePuffs = (from: number): void => {
    if (!puffs) return;
    for (let i = from; i < lastPuffs; i++) puffs.set(i, 0, -1e3, 0, 0, 0, 1);
  };

  const writePuffs = (ev: WhaleEvent, u: number, time: number, m: THREE.Matrix4): void => {
    if (!puffs) return;
    let n = 0;
    // spout: blow k, puffs released one after another, riding up on an ease-out column
    for (let k = 0; k < E.blows.length; k++) {
      const t = u - E.blows[k];
      if (t < 0 || t > E.blowSeconds[k] + SP.life) continue;
      const hole = blowhole(m);
      const bx = hole.x;
      const by = hole.y;
      const bz = hole.z;
      for (let i = 0; i < SP.puffs; i++) {
        const born = (i / SP.puffs) * E.blowSeconds[k];
        const age = (t - born) / SP.life;
        if (age <= 0 || age >= 1) continue;
        const j = rnd(ev.s | 0, k * 64 + i, 489);
        const j2 = rnd(ev.s | 0, k * 64 + i, 490);
        const h = SP.height * easeOut(age) * (0.9 + 0.1 * j);
        const side = (j - 0.5) * 2 * SP.spread * (0.4 + age * 1.6);
        const drift = (j2 - 0.5) * 2 * SP.spread * age;
        const size = SP.size[0] + (SP.size[1] - SP.size[0]) * Math.sqrt(age);
        const op = SP.opacity * smooth(age / SP.fadeIn) * Math.pow(1 - age, 1.25);
        // the column stays where it was released: undo the glide since birth
        const back = (t - born) * E.glide;
        puffs.set(
          n++,
          bx - _r.hx * back + side * -_r.hz + drift * _r.hx,
          by + h + size * 0.15,
          bz - _r.hz * back + side * _r.hx + drift * _r.hz,
          size,
          op,
          SP.edge,
        );
      }
    }
    // splash: a crown of puffs thrown out of the water where the tail lands (event slap or click)
    const sources: { age: number; x: number; z: number }[] = [];
    const evAge = u - (E.slapAt + SLAP_IMPACT);
    if (evAge >= 0 && evAge < SL.life) {
      whalePose(tmp, E.slapAt + SLAP_IMPACT, SHARED.uMotionScale.value);
      rig.pose(tmp, false);
      place(ev, tmp);
      _p.copy(rig.tail).applyMatrix4(_m);
      sources.push({ age: evAge, x: _p.x, z: _p.z });
    }
    const ct = clickTau(time);
    const cAge = ct - SLAP_IMPACT;
    if (!Number.isNaN(ct) && cAge >= 0 && cAge < SL.life && sources.length === 0) {
      // the tail at the click's impact moment (pose then = event pose at u − ct + impact, slap folded in)
      const uImp = u - ct + SLAP_IMPACT;
      whalePose(tmp, uImp, SHARED.uMotionScale.value, SLAP_IMPACT);
      rig.pose(tmp, false);
      place(ev, tmp);
      _p.copy(rig.tail).applyMatrix4(_m);
      sources.push({ age: cAge, x: _p.x, z: _p.z });
    }
    for (const src of sources)
      for (let i = 0; i < SL.puffs; i++) {
        const a = src.age / SL.life;
        const ring = i % 2;
        const j = rnd(ev.s | 0, i, 491);
        const ang = (i / SL.puffs) * Math.PI * 2 + j * 0.8;
        const reach = SL.radius[0] + (SL.radius[1] - SL.radius[0]) * easeOut(a) * (ring ? 1 : 0.62);
        const arc =
          Math.sin(Math.PI * Math.pow(a, 0.7)) * SL.height * (ring ? 0.7 : 1) * (0.7 + 0.3 * j);
        const size = SL.size[0] + (SL.size[1] - SL.size[0]) * Math.sqrt(a) * (0.7 + 0.5 * j);
        const op = SL.opacity * smooth(a / 0.08) * Math.pow(1 - a, 1.2);
        puffs.set(
          n++,
          src.x + Math.cos(ang) * reach,
          0.25 + arc,
          src.z + Math.sin(ang) * reach,
          size,
          op,
          SL.edge,
        );
      }
    // the anchor poses overwrote the spine: restore this frame's (picking reads it)
    if (sources.length > 0) rig.pose(pose, false);
    if (n > 0 || lastPuffs > 0) {
      hidePuffs(n);
      puffs.upload();
    }
    lastPuffs = n;
  };

  const update = (day: number, time: number, cam: THREE.Vector3): void => {
    const run = whaleEventAt(events, day, 0);
    if (!run || run.u < 0) {
      if (mesh.visible || lastPuffs > 0) {
        mesh.visible = false;
        hidePuffs(0);
        puffs?.upload();
        lastPuffs = 0;
      }
      last = { event: -1, u: 0, visible: false };
      return;
    }
    const ev = events[run.index];
    whalePose(pose, run.u, SHARED.uMotionScale.value, clickTau(time));
    const m = place(ev, pose);
    mesh.setMatrixAt(0, m);
    mesh.instanceMatrix.needsUpdate = true;
    const fade =
      cam.distanceToSquared(_p.setFromMatrixPosition(m)) > WHALE.fade.far * WHALE.fade.far;
    mesh.visible = pose.up && fade;
    if (pose.up) rig.pose(pose);
    last = { event: run.index, u: run.u, visible: mesh.visible };
    // placed puffs: the heading at the whale's place stays in `_r`
    writePuffs(ev, run.u, time, m);
  };

  const hit = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number => {
    if (!mesh.visible) return -1;
    mesh.getMatrixAt(0, _m);
    let best = -1;
    const K = WHALE_RINGS.count;
    for (let k = 2; k < K; k += 2) {
      _p.set(rig.spine.x[k], rig.spine.y[k], 0).applyMatrix4(_m);
      const rr = WHALE.pick.radius * (0.55 + 0.45 * Math.min(1, (K - k) / 8 + 0.4));
      const lx = _p.x - ox;
      const ly = _p.y - oy;
      const lz = _p.z - oz;
      const tca = lx * dx + ly * dy + lz * dz;
      const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
      if (tca < 0 || d2 > rr * rr) continue;
      const t = tca - Math.sqrt(rr * rr - d2);
      if (best < 0 || t < best) best = Math.max(0, t);
    }
    return best;
  };

  const poke = (time: number): boolean => {
    const run = last;
    if (!mesh.visible || SHARED.uMotionScale.value < 0.5) return false;
    // at the surface only: after the rise, before the event slap or the dive
    if (run.u < E.rise * 0.8 || run.u > E.slapAt - WHALE.slap.total - 0.1) return false;
    const ct = clickTau(time);
    if (!Number.isNaN(ct) && ct < WHALE.slap.total) return false;
    pokeAt = time;
    return true;
  };

  return {
    mesh,
    route,
    events,
    bindPuffs(p) {
      puffs = p.reserve(SP.puffs + SL.puffs);
    },
    update,
    hit,
    poke,
    stats: () => ({ ...last, tris: rig.tris }),
  };
}
