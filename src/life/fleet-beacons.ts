/**
 * Fleet beacons (TASK-564 / 571): one small InstancedMesh, one draw call, count = bound bots (no bot bound =
 * `visible = false`, no call, no triangles). Each instance follows its bot (same prev -> cur interpolation as the
 * bots, so it does not jitter), takes the department accent through the instance colour and bobs / spins on the
 * shader clock `uTime` (frozen and deterministic under capture, calmer under reduced motion). Same life material
 * program as the bots; the geometry is `geo/workers.ts` `buildFleetBeacon` (emissive class 1: glows at night only).
 */
import * as THREE from 'three';
import { FLEET_BOTS } from '../content/fleet.ts';
import { THEMES } from '../content/themes.ts';
import type { Scope } from '../core/scope.ts';
import type { System } from '../core/loop.ts';
import { SHARED } from '../render/uniforms.ts';
import type { ThemeId } from '../world/types.ts';
import { wrapAngle, type AgentKind } from './agents.ts';
import { buildFleetBeacon } from './geo/workers.ts';

/** A bot holding a session: its slot in the workers kind and its department. */
export interface BoundBot {
  bot: number;
  island: ThemeId;
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _c = new THREE.Color();

export function createFleetBeacons(
  group: THREE.Object3D,
  scope: Scope,
  workers: AgentKind,
  bound: () => readonly BoundBot[],
): System {
  const cap = FLEET_BOTS.maxBeacons;
  const geo = buildFleetBeacon();
  // the bots' own material (owned by the workers kind): same program, no extra compile
  const mat = workers.mesh.material as THREE.Material;
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.name = 'life:fleet-beacons';
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // the instance colour exists from the start: the program key (USE_INSTANCING_COLOR) is the bots' own
  mesh.setColorAt(0, _c.set('#FFFFFF'));
  group.add(mesh);
  scope.add(geo);
  scope.add(mesh);
  // which bot each instance currently shows (the accent is only rewritten when it changes)
  const shown = new Int32Array(cap).fill(-1);
  const M = FLEET_BOTS.beaconMotion;

  return {
    name: 'fleet-beacons',
    update(_dt, alpha) {
      const list = bound();
      const a = Math.min(Math.max(alpha, 0), 1);
      const t = SHARED.uTime.value as number;
      const ms = workers.motionScale;
      let n = 0;
      for (const { bot: i, island } of list) {
        if (n >= cap) break;
        if (!workers.active[i] || workers.scale[i] <= 0) continue;
        const sc = workers.pscale[i] + (workers.scale[i] - workers.pscale[i]) * a;
        const ph = workers.phase[i];
        const bob = Math.sin((t / M.period + ph) * Math.PI * 2) * M.bob * ms * sc;
        _p.set(
          workers.px[i] + (workers.x[i] - workers.px[i]) * a,
          workers.py[i] + (workers.y[i] - workers.py[i]) * a + bob,
          workers.pz[i] + (workers.z[i] - workers.pz[i]) * a,
        );
        const yaw = workers.pyaw[i] + wrapAngle(workers.yaw[i] - workers.pyaw[i]) * a;
        _e.set(0, yaw + (t * M.spin + ph * Math.PI * 2) * ms, 0, 'YZX');
        _q.setFromEuler(_e);
        _s.set(sc, sc, sc);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(n, _m);
        if (shown[n] !== i) {
          shown[n] = i;
          mesh.setColorAt(n, _c.set(THEMES[island].accent));
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
        n++;
      }
      mesh.count = n;
      mesh.visible = n > 0;
      if (n > 0) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
