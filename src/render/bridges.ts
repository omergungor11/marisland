import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { Quality } from '../core/params.ts';
import { BRIDGES } from '../content/bridges.ts';
import type { BridgeData, WorldData } from '../world/index.ts';
import { buildBridgeGeometry } from '../geo/bridge.ts';
import { makeDepthMaterial, makeLitMaterial } from './materials/factory.ts';

/**
 * Stone viaducts between near islands (TASK-394): ONE InstancedMesh with one model bay per span
 * piece, on the shared lit program (no new program). Every bay is placed along its bridge's axis,
 * pitched to the deck slope and stretched along z so the bays tile the gap exactly. Static: the
 * matrices are written once. Casts shadows on medium / high through the usual depth material.
 */
export interface BridgesView {
  mesh: THREE.InstancedMesh | null;
}

export interface BayPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Stretch along the span relative to the model bay. */
  stretch: number;
}

/** Every bay of every bridge (pure; shared by the renderer and tests). */
export function bridgeBays(bridges: readonly BridgeData[]): BayPose[] {
  const out: BayPose[] = [];
  for (const b of bridges) {
    const pitch = -Math.atan2(b.by - b.ay, b.length);
    const stretch = b.length / b.bays / BRIDGES.model.bay;
    for (let i = 0; i < b.bays; i++) {
      const f = (i + 0.5) / b.bays;
      out.push({
        x: b.ax + (b.bx - b.ax) * f,
        y: b.ay + (b.by - b.ay) * f,
        z: b.az + (b.bz - b.az) * f,
        yaw: b.yaw,
        pitch,
        stretch,
      });
    }
  }
  return out;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3();

export function createBridges(world: WorldData, quality: Quality, scope: Scope): BridgesView {
  const bays = bridgeBays(world.bridges);
  if (!bays.length) return { mesh: null };
  const features = { instanced: true, emissive: true, rim: true };
  const geo = scope.add(buildBridgeGeometry(quality === 'low' ? 1 : 0));
  const mat = scope.add(makeLitMaterial(features, { name: 'bridges' }));
  const mesh = new THREE.InstancedMesh(geo, mat, bays.length);
  mesh.name = 'bridges';
  mesh.castShadow = quality !== 'low';
  mesh.receiveShadow = true;
  if (mesh.castShadow) mesh.customDepthMaterial = scope.add(makeDepthMaterial(features, mat.fade));
  scope.add(mesh);
  bays.forEach((b, i) => {
    _e.set(b.pitch, b.yaw, 0);
    _q.setFromEuler(_e);
    mesh.setMatrixAt(i, _m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(1, 1, b.stretch)));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return { mesh };
}
