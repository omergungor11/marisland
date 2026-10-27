import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { Quality } from '../core/params.ts';
import { DEVOPS_M25 } from '../content/themes/devops-m25.ts';
import { DEVOPS_M25_MOTION } from '../content/themes/devops-m25-site.ts';
import { mailCablePoint } from '../content/props-themes/m20.ts';
import { buildProp } from '../geo/registry.ts';
import { carPose, newCarPose, railFromLevels, type RailLine } from '../world/funicular.ts';
import type { PropStore } from '../world/prop-store.ts';
import type { WorldData } from '../world/types.ts';
import { SHARED } from './uniforms.ts';
import { makeDepthMaterial, makeLitMaterial } from './materials/factory.ts';
import { oreLines, type OreLine } from './mail-lines.ts';

/**
 * DevOps M25 line movers (TASK-507, D-089): the D4 funicular cars and the D13 ore buckets.
 * Closed forms of the sim time on the shared lit program (no new program), hidden past the fade:
 * - one car per funicular section (world.fences kind 'funicular', stored joint levels): the lower
 *   section's car starts at the foot, the upper one's at the top, so they meet at the mid station;
 *   orange livery below, teal above (one instanced mesh per livery);
 * - `bucket.count` loaded buckets per ore cableway (render/mail-lines.ts oreLines) ride the sagging
 *   spans from the quarry to the furnace hopper, tip there and shrink away, and grow back out at
 *   the quarry station (one instanced mesh).
 */
export interface DevopsLinesView {
  group: THREE.Group;
  /** Funicular sections (world frame rail lines), for the culture movers' vertex lamps. */
  rails: RailLine[];
  update(time: number, camPos: THREE.Vector3): void;
}

const _m = new THREE.Matrix4();
const _g = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

/** Rail lines of the world's funicular sections (in fence order: lower section first). */
export function funicularRails(world: WorldData): RailLine[] {
  const out: RailLine[] = [];
  for (const f of world.fences) {
    if (f.kind !== 'funicular' || !f.levels) continue;
    const L = railFromLevels(f.points, f.levels);
    if (L) out.push(L);
  }
  return out;
}

/** Bucket position along an ore line at horizontal arc `s` (pivot = cable − grip). */
function bucketAt(
  line: OreLine,
  cum: readonly number[],
  s: number,
  out: { x: number; y: number; z: number; yaw: number },
): void {
  let k = 0;
  while (k < line.spans.length - 1 && cum[k + 1] < s) k++;
  const sp = line.spans[k];
  const len = cum[k + 1] - cum[k];
  const t = len > 0 ? Math.max(0, Math.min(1, (s - cum[k]) / len)) : 0;
  const c = mailCablePoint(sp.a, sp.b, t);
  out.x = c.x;
  out.y = c.y - DEVOPS_M25.ore.bucket.grip;
  out.z = c.z;
  out.yaw = Math.atan2(sp.b.x - sp.a.x, sp.b.z - sp.a.z);
}

export function createDevopsLines(
  world: WorldData,
  store: PropStore,
  quality: Quality,
  scope: Scope,
): DevopsLinesView {
  const group = new THREE.Group();
  group.name = 'devops-lines';
  const rails = funicularRails(world);
  const lines = oreLines(store);
  const C = DEVOPS_M25_MOTION.car;
  const B = DEVOPS_M25_MOTION.bucket;
  const features = { instanced: true, dither: true, emissive: true, rim: true };
  const mat =
    rails.length + lines.length > 0
      ? scope.add(
          makeLitMaterial(features, {
            fadeNear: C.fadeNear,
            fadeFar: C.fadeFar,
            name: 'devops-lines',
          }),
        )
      : null;
  const mesh = (geo: THREE.BufferGeometry, n: number, name: string, shadow: boolean) => {
    const m = new THREE.InstancedMesh(scope.add(geo), mat as THREE.Material, n);
    m.name = name;
    m.castShadow = shadow && quality !== 'low';
    if (m.castShadow) m.customDepthMaterial = scope.add(makeDepthMaterial(features, mat!.fade));
    // bounds of this frame's instances (one or a few): a mesh wholly out of view costs no call
    m.frustumCulled = true;
    scope.add(m);
    group.add(m);
    return m;
  };
  // cars: livery k % 2 per section k
  const liveries = [0, 1].map((v) => rails.filter((_, k) => k % 2 === v));
  const cars = liveries.map((ls, v) =>
    ls.length > 0
      ? mesh(buildProp('funicularCar', world.seed, v, 0), ls.length, `funicular-car-${v}`, true)
      : null,
  );
  const bucketMesh =
    lines.length > 0
      ? mesh(buildProp('oreBucket', world.seed, 1, 0), lines.length * B.count, 'ore-buckets', false)
      : null;
  const cums = lines.map((l) => {
    const c = [0];
    for (const sp of l.spans)
      c.push(c[c.length - 1] + Math.hypot(sp.b.x - sp.a.x, sp.b.z - sp.a.z));
    return c;
  });
  // the visibility test: every line's midpoint against the fade far edge
  const centres: THREE.Vector3[] = [
    ...rails.map((L) => {
      const p = L.pts[Math.floor(L.pts.length / 2)];
      return new THREE.Vector3(p.x, p.y, p.z);
    }),
    ...lines.map((l) => {
      const sp = l.spans[Math.floor(l.spans.length / 2)];
      return new THREE.Vector3(sp.a.x, sp.a.y, sp.a.z);
    }),
  ];
  const pose = newCarPose();
  const bp = { x: 0, y: 0, z: 0, yaw: 0 };
  const smooth = (t: number): number => {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  };
  const update = (time: number, camPos: THREE.Vector3): void => {
    const far = C.fadeFar + 20;
    group.visible = centres.some((c) => c.distanceToSquared(camPos) < far * far);
    if (!group.visible) return;
    liveries.forEach((ls, v) => {
      const m = cars[v];
      if (!m) return;
      ls.forEach((L, j) => {
        const k = j * 2 + v;
        carPose(L, time, k % 2 === 0 ? 0 : 0.5, pose);
        _p.set(pose.x, pose.y, pose.z);
        // yaw about +y, then nose up about the car's x (local +z climbs)
        _q.setFromEuler(_e.set(-pose.pitch, pose.yaw, 0, 'YXZ'));
        m.setMatrixAt(j, _m.compose(_p, _q, _s.set(1, 1, 1)));
      });
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    });
    if (bucketMesh) {
      const motion = SHARED.uMotionScale.value;
      lines.forEach((l, li) => {
        const cum = cums[li];
        const total = cum[cum.length - 1];
        const travel = total / B.speed;
        const period = travel + B.tip + 2 * B.pop;
        for (let k = 0; k < B.count; k++) {
          const u = ((((time / period + k / B.count) % 1) + 1) % 1) * period;
          let s: number;
          let sc = 1;
          let tip = 0;
          if (u < B.pop) {
            s = 0;
            sc = smooth(u / B.pop);
          } else if (u < B.pop + travel) s = (u - B.pop) * B.speed;
          else if (u < B.pop + travel + B.tip) {
            s = total;
            const f = (u - B.pop - travel) / B.tip;
            tip = Math.sin(Math.PI * Math.min(1, f * 1.4)) * ((B.tipDeg * Math.PI) / 180);
          } else {
            s = total;
            sc = 1 - smooth((u - B.pop - travel - B.tip) / B.pop);
          }
          bucketAt(l, cum, s, bp);
          const sway = B.sway * motion * Math.sin(time * 1.7 + k * 2.1 + li);
          // hang from the grip G (on the cable): pivot = G − q·(0, grip·sc, 0) (tip about x, sway
          // about z, both round the grip)
          _q.setFromEuler(_e.set(tip, bp.yaw, sway, 'YXZ'));
          const g = DEVOPS_M25.ore.bucket.grip;
          _g.set(0, g * sc, 0).applyQuaternion(_q);
          _p.set(bp.x, bp.y + g, bp.z).sub(_g);
          bucketMesh.setMatrixAt(li * B.count + k, _m.compose(_p, _q, _s.set(sc, sc, sc)));
        }
      });
      bucketMesh.instanceMatrix.needsUpdate = true;
      bucketMesh.computeBoundingSphere();
    }
  };
  update(0, centres[0] ?? new THREE.Vector3());
  return { group, rails, update };
}
