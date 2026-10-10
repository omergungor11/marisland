import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { Quality } from '../core/params.ts';
import { createRng } from '../core/rng.ts';
import { SKY_CRAFT } from '../content/sky-craft.ts';
import type { WorldData } from '../world/index.ts';
import { buildAirshipGeometry, buildBalloonGeometry } from '../geo/sky-craft.ts';
import { makeLitMaterial } from './materials/factory.ts';

/**
 * Sky craft (TASK-335, D-038): hot-air balloons and an airship drifting over the archipelago.
 * One InstancedMesh per kind on the shared lit program (drones' key, no new program); every pose
 * is a closed-form function of the sim time, so captures freeze them. They cast no shadows:
 * the fitted shadow slab stops far below their altitude and the cloud shadows are analytic.
 */
export interface SkyCraftView {
  meshes: THREE.InstancedMesh[];
  update(time: number): void;
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
    });
  }
  for (let i = 0; i < count.airships; i++) {
    const k = SKY_CRAFT.airshipRadiusFrac;
    out.push({
      kind: 'airship',
      cx,
      cz,
      rx: k * hx,
      rz: k * hz,
      y: SKY_CRAFT.airshipY,
      w: -SKY_CRAFT.airshipSpeed / (k * ((hx + hz) / 2)),
      phase: rng.fork('airship', i).range(0, Math.PI * 2),
      scale: SKY_CRAFT.airshipScale,
      yaw: 0,
    });
  }
  return out;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3();

/** Pose of craft `c` (index `k`) at time `t` into `_p` / `_q`. */
function pose(c: CraftPath, t: number, k: number): void {
  const a = c.phase + c.w * t;
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
  const groups = (['balloon', 'airship'] as const)
    .map((kind) => ({ kind, items: paths.filter((p) => p.kind === kind) }))
    .filter((g) => g.items.length > 0)
    .map((g) => {
      const geo = scope.add(g.kind === 'balloon' ? buildBalloonGeometry() : buildAirshipGeometry());
      const mesh = new THREE.InstancedMesh(geo, mat, g.items.length);
      mesh.name = `sky-${g.kind}`;
      mesh.castShadow = false;
      scope.add(mesh);
      return { mesh, items: g.items };
    });
  const update = (time: number): void => {
    let k = 0;
    for (const g of groups) {
      g.items.forEach((c, i) => {
        pose(c, time, k++);
        _m.compose(_p, _q, _s.setScalar(c.scale));
        g.mesh.setMatrixAt(i, _m);
      });
      g.mesh.instanceMatrix.needsUpdate = true;
      g.mesh.computeBoundingSphere();
    }
  };
  update(0);
  return { meshes: groups.map((g) => g.mesh), update };
}
