import * as THREE from 'three';
import type { Quality } from '../core/params.ts';
import type { Scope } from '../core/scope.ts';
import { CODING_M33_PROP_IDS } from '../content/props-themes/coding-m33.ts';
import { CODING_FOUNDRY_MOTION as M } from '../content/themes/coding-foundry-motion.ts';
import { buildProp } from '../geo/index.ts';
import type { Lod } from '../geo/types.ts';
import type { WorldData } from '../world/types.ts';
import {
  ITEM,
  botTrackOf,
  foundryFrame,
  foundryLineOf,
  newFoundryFrame,
  trackBotFrame,
  walkerPeriods,
  type FoundryItem,
  type ItemKind,
} from './foundry-motion.ts';
import { makeDepthMaterial, makeLitMaterial } from './materials/factory.ts';
import { SHARED } from './uniforms.ts';

/**
 * The Coding M33 movers (TASK-545, D-124): the line's arms, parts and bots, the bots walking off it and
 * the first-step bots on the test track (all instances, none is an agent: the cap is full), plus the
 * tethered cloud. Geo-only meshes in the lit instanced program the cargo ships use (no new program), one
 * InstancedMesh per (def, variant, LOD), built on first use, so a camera that never comes near pays
 * nothing. Each group skips on the seeds where its site has no room.
 */
export interface FoundryMoversView {
  group: THREE.Group;
  /** `awake` 0..1: the shift (D-133), 1 - the Coding island's culture lamp level; default 1. */
  update(time: number, camPos: THREE.Vector3, awake?: number): void;
  /** Instances drawn last frame (tests, debugging). */
  stats(): { instances: number };
}

/**
 * Low quality holds no LOD0 of the M33 kit (as the coaster track, D-122): both slots share the LOD1 mesh,
 * since low's memory line is already full (D-123). Other qualities keep the registry's two meshes.
 */
export function foundryKitGeometry(
  world: WorldData,
  quality: Quality,
): (id: string, lod: Lod, variant: number) => THREE.BufferGeometry | null {
  if (quality !== 'low') return () => null;
  const ids = new Set(CODING_M33_PROP_IDS);
  const shared = new Map<string, THREE.BufferGeometry>();
  return (id, _lod, variant) => {
    if (!ids.has(id)) return null;
    const key = `${id}:${variant}`;
    let g = shared.get(key);
    if (!g) shared.set(key, (g = buildProp(id, world.seed, variant, 1)));
    return g;
  };
}

const DEG = Math.PI / 180;
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _r = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisX = new THREE.Vector3(1, 0, 0);
const _white = new THREE.Color(1, 1, 1);
const _night = new THREE.Color(M.night.tint);

interface Pool {
  meshes: Partial<Record<Lod, THREE.InstancedMesh>>;
  n: number;
  cur: THREE.InstancedMesh | null;
}

export function createFoundryMovers(
  world: WorldData,
  quality: Quality,
  scope: Scope,
): FoundryMoversView | null {
  const isl = world.islands.find((i) => i.theme === 'coding');
  if (!isl) return null;
  const plan = M.plan[quality];
  const line = foundryLineOf(world, isl, plan.walkLen);
  const track = botTrackOf(isl);
  const cloud = isl.anchors.lakeCloud;
  if (!line && !track && !cloud) return null;
  const group = new THREE.Group();
  group.name = 'foundry-movers';
  const features = { instanced: true, dither: true, emissive: true, rim: true };
  const mat = scope.add(
    makeLitMaterial(features, {
      fadeNear: plan.fadeNear,
      fadeFar: plan.fadeFar,
      name: 'foundry-movers',
    }),
  );
  // D-133: the arms, parts and bots cast (medium / high); the same instanced depth program the other movers use
  const depth = quality !== 'low' ? scope.add(makeDepthMaterial(features, mat.fade)) : null;
  const pools = new Map<string, Pool>();
  const frame = newFoundryFrame(
    (line ? 3 + 3 + 3 + walkerPeriods(line) + 1 : 0) + (track ? plan.trackBots : 0),
  );
  const meshOf = (key: string, id: string, v: number, lod: Lod, cap: number, m: THREE.Material) => {
    let p = pools.get(key);
    if (!p) pools.set(key, (p = { meshes: {}, n: 0, cur: null }));
    let mesh = p.meshes[lod];
    if (!mesh) {
      const geo = scope.add(buildProp(id, world.seed, v, lod));
      mesh = new THREE.InstancedMesh(geo, m, cap);
      mesh.name = `foundry:${key}:L${lod}`;
      // only the finished bots cast (the walkers, the long shadows of the morning); arms and the small parts in flight do not (a draw call each in the shadow pass)
      mesh.castShadow = depth !== null && key === `part${ITEM.bot}`;
      if (mesh.castShadow && depth) mesh.customDepthMaterial = depth;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.visible = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scope.add(mesh);
      group.add(mesh);
      p.meshes[lod] = mesh;
    }
    return { p, mesh };
  };
  const put = (it: FoundryItem, lod: Lod): void => {
    const isArm = it.kind === ITEM.arm;
    const key = isArm ? 'arm' : `part${it.kind}`;
    const cap = isArm ? 3 : it.kind === ITEM.bot ? frame.items.length : 2;
    const { p, mesh } = meshOf(
      key,
      isArm ? 'assemblyArm' : 'foundryPart',
      isArm ? 3 : (it.kind as ItemKind),
      lod,
      cap,
      mat,
    );
    if (p.cur !== mesh) {
      p.cur = mesh;
      p.n = 0;
    }
    if (p.n >= cap) return;
    // +x along the heading: three's yaw = -heading; the roll about +x
    _q.setFromAxisAngle(_axisY, -it.heading).multiply(_r.setFromAxisAngle(_axisX, it.roll));
    _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(it.sxz, it.sy, it.sxz));
    mesh.setMatrixAt(p.n++, _m);
  };
  let drawn = 0;
  const flush = (): void => {
    drawn = 0;
    for (const p of pools.values()) {
      for (const mesh of Object.values(p.meshes)) {
        const on = mesh === p.cur && p.n > 0;
        mesh.visible = on;
        mesh.count = on ? p.n : 0;
        if (on) {
          drawn += p.n;
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingSphere();
        }
      }
      p.cur = null;
      p.n = 0;
    }
  };
  // the cloud: its own fade, seen from far (T0 by size); LOD1 only past lod0
  const C = M.cloud;
  const cloudRange = C.range[quality];
  const cloudMat = cloud
    ? scope.add(
        makeLitMaterial(features, {
          fadeNear: cloudRange * 0.85,
          fadeFar: cloudRange,
          name: 'foundry-cloud',
        }),
      )
    : null;
  const yard = isl.anchors.foundryYard;
  const trackYard = isl.anchors.botTrackYard;
  const near = (a: { x: number; y?: number; z: number } | undefined, cam: THREE.Vector3): number =>
    a ? cam.distanceTo(_p.set(a.x, a.y ?? 0, a.z)) : Infinity;
  return {
    group,
    update(time, cam, awake = 1) {
      mat.color.copy(_white).lerp(_night, SHARED.uNight.value as number);
      frame.n = 0;
      const dLine = line ? near(yard, cam) : Infinity;
      const dTrack = track ? near(trackYard, cam) : Infinity;
      if (line && dLine <= plan.range) foundryFrame(line, time, frame, awake);
      const nLine = frame.n;
      if (track && dTrack <= plan.range) {
        for (let k = 0; k < plan.trackBots; k++)
          trackBotFrame(track, k, plan.trackBots, time, frame);
      }
      for (let i = 0; i < frame.n; i++) {
        const it = frame.items[i];
        const d = i < nLine ? dLine : dTrack;
        if (it.kind !== ITEM.arm) {
          // the shift's start / end: bots and parts grow in / shrink away; none stands about at night
          it.sy *= awake;
          it.sxz *= awake;
          if (awake < 0.002) continue;
        }
        put(it, d < plan.lod0 ? 0 : 1);
      }
      if (cloud && cloudMat) {
        const dc = near(cloud, cam);
        if (dc < cloudRange) {
          const { p, mesh } = meshOf(
            'cloud',
            'cloudBalloon',
            0,
            dc < plan.lod0 ? 0 : 1,
            1,
            cloudMat,
          );
          if (p.cur !== mesh) {
            p.cur = mesh;
            p.n = 0;
          }
          const w = (i: 0 | 1): number => Math.sin((time * Math.PI * 2) / C.periods[i] + i * 1.3);
          _e.set(
            C.deg[0] * DEG * w(0),
            C.yawDeg * DEG * Math.sin((time * Math.PI * 2) / C.yawPeriod) + cloud.rotY,
            C.deg[1] * DEG * w(1),
            'YXZ',
          );
          _q.setFromEuler(_e);
          _m.compose(_p.set(cloud.x, cloud.y ?? 0, cloud.z), _q, _s.setScalar(1));
          mesh.setMatrixAt(p.n++, _m);
        }
      }
      flush();
    },
    stats: () => ({ instances: drawn }),
  };
}
