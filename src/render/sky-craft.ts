import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { Quality } from '../core/params.ts';
import { createRng } from '../core/rng.ts';
import { SKY_CRAFT } from '../content/sky-craft.ts';
import { CULTURE_CLOCK, CULTURE_RHYTHM } from '../content/cultures/rhythm.ts';
import { THEME_IDS, heightAt, type ThemeId } from '../world/types.ts';
import type { WorldData } from '../world/index.ts';
import { buildAirshipGeometry, buildFleetGeometry } from '../geo/sky-craft.ts';
import type { CultureState } from './culture-clock.ts';
import { makeLitMaterial } from './materials/factory.ts';

/**
 * Sky craft (TASK-335, D-038; culture pass TASK-441): the Hype Fleet of hot-air balloons and the
 * Orchestrator airship drifting over the archipelago. Every pose is a closed-form function of the
 * sim time (and the culture day clock for the Launch Show), so captures freeze them. They cast no
 * shadows: the fitted shadow slab stops far below their altitude and the cloud shadows are analytic.
 *
 * Draw calls: the whole fleet is ONE mesh (balloons are baked liveries in one merged geometry,
 * posed on the CPU each frame) and the airship is one more; both on the shared lit program.
 * The fleet's single instance sits at `FLEET_ANCHOR` (far from every camera and island, so the
 * program's per-instance distance fade and island-lamp lookups see "far, no island" and stay
 * identity); vertices are stored relative to it. The per-balloon near fade is done on the CPU
 * (the balloon shrinks away inside `fadeNear`).
 */
export interface SkyCraftView {
  meshes: THREE.InstancedMesh[];
  /** `culture` = WorldView.culture.state (Launch Show); `cam` = camera position (near fade). */
  update(time: number, culture?: CultureState, cam?: THREE.Vector3): void;
}

export interface CraftPath {
  kind: 'balloon' | 'airship';
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  y: number;
  /** Angular speed (rad/s, signed) and start angle. */
  w: number;
  phase: number;
  scale: number;
  yaw: number;
  /** Hype Fleet: the balloon's culture and its secondary-gore culture. */
  theme?: ThemeId;
  alt?: ThemeId;
  /** Launch balloon: where its basket stands at the launch mast (world u). */
  launchSite?: [number, number, number];
  /** Airship: orbit angle of the HQ crossing (it slows down there). */
  hqAngle?: number;
}

/** Basket stand of the Launch Show: beside the Marketing launch mast, on the ground. */
export function launchSite(world: WorldData): [number, number, number] | null {
  const L = SKY_CRAFT.launch;
  const spot = world.storySpots.find((s) => s.kind === L.story);
  if (!spot) return null;
  const x = spot.pos.x + Math.cos(spot.rotY) * L.offset;
  const z = spot.pos.z - Math.sin(spot.rotY) * L.offset;
  return [x, Math.max(heightAt(world.height, x, z), spot.pos.y) + L.groundLift, z];
}

/** Orbits of every craft for this world / quality (pure; shared by the renderer and tests). */
export function skyCraftPaths(world: WorldData, quality: Quality, seed: number): CraftPath[] {
  const isl = world.islands;
  if (!isl.length) return [];
  const count = SKY_CRAFT.count[quality];
  const rng = createRng(seed).fork('sky-craft');
  const minX = Math.min(...isl.map((i) => i.minX));
  const maxX = Math.max(...isl.map((i) => i.maxX));
  const minZ = Math.min(...isl.map((i) => i.minZ));
  const maxZ = Math.max(...isl.map((i) => i.maxZ));
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const hx = Math.max(60, (maxX - minX) / 2);
  const hz = Math.max(60, (maxZ - minZ) / 2);
  const out: CraftPath[] = [];
  const n = count.balloons;
  const [k0, k1] = SKY_CRAFT.radiusFrac;
  const [y0, y1] = SKY_CRAFT.balloonY;
  const [s0, s1] = SKY_CRAFT.scale;
  const layers = rng.fork('layers').shuffle(Array.from({ length: n }, (_, i) => i));
  const w = SKY_CRAFT.balloonSpeed / (((k0 + k1) / 2) * ((hx + hz) / 2));
  // fleet cultures: the launch balloon's first, the rest shuffled (seeded); secondary = next one
  const lt = SKY_CRAFT.fleet.launchTheme as ThemeId;
  const fleet = [lt, ...rng.fork('fleet').shuffle(THEME_IDS.filter((t) => t !== lt))];
  const site = launchSite(world);
  for (let i = 0; i < n; i++) {
    const r = rng.fork('balloon', i);
    const k = n > 1 ? k0 + ((k1 - k0) * i) / (n - 1) : (k0 + k1) / 2;
    out.push({
      kind: 'balloon',
      cx,
      cz,
      rx: k * hx,
      rz: k * hz,
      y: n > 1 ? y0 + ((y1 - y0) * layers[i]) / (n - 1) : (y0 + y1) / 2,
      w,
      phase: ((i + r.range(-SKY_CRAFT.phaseJitter, SKY_CRAFT.phaseJitter)) / n) * Math.PI * 2,
      scale: r.range(s0, s1),
      yaw: r.range(0, Math.PI * 2),
      theme: fleet[i % fleet.length],
      alt: fleet[(i + 1) % fleet.length],
      ...(i === 0 && site ? { launchSite: site } : {}),
    });
  }
  const hq = isl.find((i) => i.theme === 'hq');
  for (let i = 0; i < count.airships; i++) {
    const k = SKY_CRAFT.airshipRadiusFrac;
    const rx = k * hx;
    const rz = k * hz;
    out.push({
      kind: 'airship',
      cx,
      cz,
      rx,
      rz,
      y: SKY_CRAFT.airshipY,
      w: -SKY_CRAFT.airshipSpeed / (k * ((hx + hz) / 2)),
      phase: rng.fork('airship', i).range(0, Math.PI * 2),
      scale: SKY_CRAFT.airshipScale,
      yaw: 0,
      ...(hq ? { hqAngle: Math.atan2((hq.cz - cz) / rz, (hq.cx - cx) / rx) } : {}),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Orchestrator speed profile: the orbit angle as a closed-form function of time
// ---------------------------------------------------------------------------------------------

const TAU = Math.PI * 2;
const WARP_N = 720;
const mod = (a: number, m: number): number => ((a % m) + m) % m;

interface Warp {
  /** Cumulative time (s) to reach orbit step i from the HQ crossing, i = 0 … WARP_N. */
  t: Float64Array;
  period: number;
}
const warps = new Map<string, Warp>();

/** Time table of one lap starting at the HQ crossing: angular speed |w| x f(u), f dips at u = 0. */
function warpOf(c: CraftPath): Warp {
  const key = `${c.w}|${SKY_CRAFT.orchestrator.slow.floor}|${SKY_CRAFT.orchestrator.slow.sigma}`;
  let wp = warps.get(key);
  if (wp) return wp;
  const { floor, sigma } = SKY_CRAFT.orchestrator.slow;
  const t = new Float64Array(WARP_N + 1);
  const du = TAU / WARP_N;
  for (let i = 0; i < WARP_N; i++) {
    const u = (i + 0.5) * du;
    const d = (u > Math.PI ? u - TAU : u) / sigma;
    const f = 1 - (1 - floor) * Math.exp(-d * d);
    t[i + 1] = t[i] + du / (Math.abs(c.w) * f);
  }
  wp = { t, period: t[WARP_N] };
  warps.set(key, wp);
  return wp;
}

/** Orbit angle of craft `c` at `t` (the airship dwells over HQ; balloons are linear). */
export function orbitAngle(c: CraftPath, t: number): number {
  if (c.kind !== 'airship' || c.hqAngle === undefined) return c.phase + c.w * t;
  const wp = warpOf(c);
  const dir = Math.sign(c.w) || 1;
  // step index of the start angle, then the time at which the craft reaches step `s`
  const u0 = mod(dir * (c.phase - c.hqAngle), TAU);
  const s0 = (u0 / TAU) * WARP_N;
  const i0 = Math.min(WARP_N - 1, Math.floor(s0));
  const t0 = wp.t[i0] + (wp.t[i0 + 1] - wp.t[i0]) * (s0 - i0);
  const tau = mod(t + t0, wp.period);
  // invert the cumulative table
  let lo = 0;
  let hi = WARP_N;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (wp.t[mid] <= tau) lo = mid;
    else hi = mid;
  }
  const s = lo + (tau - wp.t[lo]) / (wp.t[lo + 1] - wp.t[lo]);
  return c.hqAngle + dir * (s / WARP_N) * TAU;
}

// ---------------------------------------------------------------------------------------------
// Launch Show timeline
// ---------------------------------------------------------------------------------------------

const SPH = CULTURE_CLOCK.secondsPerHour;
const DAY = 24 * SPH;
const smooth = (x: number): number => {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
};

/** Day seconds the Launch Show slot starts at (rhythm table; 0 if the slot is missing). */
export function launchStartDay(): number {
  const L = SKY_CRAFT.launch;
  const slot = CULTURE_RHYTHM[L.theme as ThemeId].slots.find((s) => s.id === L.slot);
  return slot ? slot.hour * SPH : 0;
}

/**
 * The launch balloon at `day` (day seconds): `k` 0 = at the mast, 1 = on the fleet orbit; `scale`
 * = envelope scale factor (packed 0.16 … 1). Before the show it descends to the mast and deflates,
 * at the show it inflates, then lifts off and joins the orbit (phase reset: the orbit at that time).
 */
export function launchBlend(day: number): { k: number; scale: number } {
  const L = SKY_CRAFT.launch;
  const u = mod(day - launchStartDay(), DAY);
  if (u < L.inflateS)
    return { k: 0, scale: L.packedScale + (1 - L.packedScale) * smooth(u / L.inflateS) };
  if (u < L.inflateS + L.liftS) return { k: smooth((u - L.inflateS) / L.liftS), scale: 1 };
  if (u < DAY - L.preS) return { k: 1, scale: 1 };
  const p = (u - (DAY - L.preS)) / L.preS;
  return { k: 1 - smooth(p), scale: 1 - (1 - L.packedScale) * smooth((p - 0.6) / 0.4) };
}

// ---------------------------------------------------------------------------------------------
// Poses
// ---------------------------------------------------------------------------------------------

const _m = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3();
const _tint = new THREE.Color();

/** Pose of craft `c` (index `k`) at time `t` into `_p` / `_q`. */
function pose(c: CraftPath, t: number, k: number): void {
  const a = orbitAngle(c, t);
  const bob = SKY_CRAFT.bob;
  const sway = SKY_CRAFT.sway;
  const ph = (t * Math.PI * 2) / bob.period + k * 1.9;
  _p.set(c.cx + c.rx * Math.cos(a), c.y + bob.amp * Math.sin(ph), c.cz + c.rz * Math.sin(a));
  const sp = (t * Math.PI * 2) / sway.period + k * 2.3;
  if (c.kind === 'balloon') {
    _e.set(sway.amp * Math.cos(sp), c.yaw + 0.02 * t * (k % 2 ? 1 : -1), sway.amp * Math.sin(sp));
  } else {
    // heading along the tangent; bank into the turn (the airship counter-rotates: w < 0)
    const sgn = Math.sign(c.w) || 1;
    const dx = -c.rx * Math.sin(a) * sgn;
    const dz = c.rz * Math.cos(a) * sgn;
    _e.set(0.02 * Math.sin(sp), Math.atan2(dx, dz), -sgn * SKY_CRAFT.airshipBank);
  }
  _q.setFromEuler(_e);
}

/** World position of craft `c` at `t` (tests / harness). */
export function skyCraftPosition(c: CraftPath, t: number, k = 0): [number, number, number] {
  pose(c, t, k);
  return [_p.x, _p.y, _p.z];
}

/**
 * Pose of the launch balloon at sim time `t` / culture day `day`: the orbit pose blended with the
 * mast stand by `launchBlend`. Writes `_p` / `_q`; returns the envelope scale factor.
 */
function launchPose(c: CraftPath, t: number, k: number, day: number): number {
  pose(c, t, k);
  const site = c.launchSite;
  if (!site) return 1;
  const { k: b, scale } = launchBlend(day);
  if (b >= 1) return 1;
  // basket bottom (-10 u in model space) rests on the ground while the envelope inflates
  const sy = site[1] + 10 * c.scale * scale;
  _p.set(site[0] + (_p.x - site[0]) * b, sy + (_p.y - sy) * b, site[2] + (_p.z - site[2]) * b);
  return scale;
}

/** Far, above everything: the fleet's single instance origin (see the file header). */
export function fleetAnchor(world: WorldData): THREE.Vector3 {
  const isl = world.islands;
  const cx = (Math.min(...isl.map((i) => i.minX)) + Math.max(...isl.map((i) => i.maxX))) / 2;
  const cz = (Math.min(...isl.map((i) => i.minZ)) + Math.max(...isl.map((i) => i.maxZ))) / 2;
  return new THREE.Vector3(cx + 4096, 2048, cz + 4096);
}

export function createSkyCraft(
  world: WorldData,
  quality: Quality,
  scope: Scope,
  seed: number,
): SkyCraftView {
  const paths = skyCraftPaths(world, quality, seed);
  if (!paths.length) return { meshes: [], update: () => undefined };
  const features = { instanced: true, dither: true, emissive: true, rim: true };
  const mat = scope.add(
    makeLitMaterial(features, {
      fadeNear: SKY_CRAFT.fadeNear,
      fadeFar: SKY_CRAFT.fadeFar,
      name: 'sky-craft',
    }),
  );
  const meshes: THREE.InstancedMesh[] = [];
  const anchor = fleetAnchor(world);
  const balloons = paths.filter((p) => p.kind === 'balloon');
  const airships = paths.filter((p) => p.kind === 'airship');

  // ---- Hype Fleet: one mesh, balloons baked as liveries, posed on the CPU
  let fleetUpdate: ((t: number, culture?: CultureState, cam?: THREE.Vector3) => void) | null = null;
  if (balloons.length) {
    const fleet = buildFleetGeometry(
      balloons.map((b) => ({ theme: b.theme ?? 'hq', alt: b.alt ?? 'coding' })),
    );
    const geo = scope.add(fleet.geometry);
    const posA = geo.getAttribute('position') as THREE.BufferAttribute;
    const norA = geo.getAttribute('normal') as THREE.BufferAttribute;
    posA.setUsage(THREE.DynamicDrawUsage);
    norA.setUsage(THREE.DynamicDrawUsage);
    const basePos = Float32Array.from(posA.array);
    const baseNor = Float32Array.from(norA.array);
    const mesh = new THREE.InstancedMesh(geo, mat, 1);
    mesh.name = 'sky-balloon';
    mesh.castShadow = false;
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.setColorAt(0, _tint.setRGB(1, 1, 1));
    scope.add(mesh);
    meshes.push(mesh);
    const centre = new THREE.Vector3();
    let lastKey = '';
    fleetUpdate = (t, culture, cam) => {
      const day = culture?.day;
      const key = `${t}|${day}|${cam ? `${cam.x},${cam.y},${cam.z}` : ''}`;
      if (key === lastKey) return;
      lastKey = key;
      const pos = posA.array as Float32Array;
      const nor = norA.array as Float32Array;
      const near = SKY_CRAFT.fadeNear;
      const far = SKY_CRAFT.fadeFar;
      centre.set(0, 0, 0);
      const centres: Array<[number, number, number]> = [];
      balloons.forEach((c, i) => {
        let show = 1;
        if (day === undefined) pose(c, t, i);
        else show = launchPose(c, t, i, day);
        let sc = c.scale * show;
        // the launch balloon stays visible up close while it is at / near the mast
        const grounded =
          c.launchSite !== undefined && day !== undefined && launchBlend(day).k < 0.6;
        if (cam && !grounded) {
          // near fade on the CPU: shrink away inside fadeNear (the lit program's dither is off here)
          const d = Math.hypot(cam.x - _p.x, cam.y - _p.y, cam.z - _p.z);
          sc *= Math.max(1e-4, Math.min(1, (d - far) / (near - far)));
        }
        _m.compose(_p.clone().sub(anchor), _q, _s.setScalar(sc));
        _r.makeRotationFromQuaternion(_q);
        const e = _m.elements;
        const re = _r.elements;
        const { start, count } = fleet.ranges[i];
        for (let v = start; v < start + count; v++) {
          const o = v * 3;
          const x = basePos[o];
          const y = basePos[o + 1];
          const z = basePos[o + 2];
          pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
          pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
          const nx = baseNor[o];
          const ny = baseNor[o + 1];
          const nz = baseNor[o + 2];
          nor[o] = re[0] * nx + re[4] * ny + re[8] * nz;
          nor[o + 1] = re[1] * nx + re[5] * ny + re[9] * nz;
          nor[o + 2] = re[2] * nx + re[6] * ny + re[10] * nz;
        }
        centres.push([_p.x - anchor.x, _p.y - anchor.y, _p.z - anchor.z]);
        centre.x += centres[i][0];
        centre.y += centres[i][1];
        centre.z += centres[i][2];
      });
      centre.multiplyScalar(1 / balloons.length);
      let rad = 0;
      for (const c of centres)
        rad = Math.max(rad, Math.hypot(c[0] - centre.x, c[1] - centre.y, c[2] - centre.z));
      const maxS = Math.max(...balloons.map((b) => b.scale));
      geo.boundingSphere = geo.boundingSphere ?? new THREE.Sphere();
      geo.boundingSphere.set(centre, rad + 14 * maxS);
      mesh.boundingSphere = null;
      mesh.computeBoundingSphere();
      posA.needsUpdate = true;
      norA.needsUpdate = true;
    };
  }

  // ---- Orchestrator: instanced as before
  let shipUpdate: ((t: number) => void) | null = null;
  if (airships.length) {
    const geo = scope.add(buildAirshipGeometry());
    const mesh = new THREE.InstancedMesh(geo, mat, airships.length);
    mesh.name = 'sky-airship';
    mesh.castShadow = false;
    // colour attribute allocated on both meshes so they share one program
    for (let i = 0; i < airships.length; i++) mesh.setColorAt(i, _tint.setRGB(1, 1, 1));
    scope.add(mesh);
    meshes.push(mesh);
    shipUpdate = (t) => {
      airships.forEach((c, i) => {
        pose(c, t, balloons.length + i);
        _m.compose(_p, _q, _s.setScalar(c.scale));
        mesh.setMatrixAt(i, _m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
  }

  const update = (time: number, culture?: CultureState, cam?: THREE.Vector3): void => {
    fleetUpdate?.(time, culture, cam);
    shipUpdate?.(time);
  };
  update(0);
  return { meshes, update };
}
