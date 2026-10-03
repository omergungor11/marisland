import * as THREE from 'three';
import type { Rng } from '../core/rng.ts';
import type { Scope } from '../core/scope.ts';
import type { System } from '../core/loop.ts';
import { ROOFS, WALLS, WATER, GRASS } from '../content/palette.ts';

/**
 * TASK-003 placeholder scene: a seeded field of bevel-less boxes on a sea plane
 * with warm sun + blue-violet hemisphere so the harness, API and post chain can
 * be validated before terrain/water land in M1.
 */
export interface TestScene {
  group: THREE.Group;
  system: System;
  hash: string;
}

export function buildTestScene(rng: Rng, scope: Scope): TestScene {
  const group = new THREE.Group();
  const sea = new THREE.Mesh(
    scope.add(new THREE.PlaneGeometry(1200, 1200)),
    scope.add(new THREE.MeshLambertMaterial({ color: new THREE.Color(WATER.mid) })),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.receiveShadow = true;
  group.add(sea);

  const island = new THREE.Mesh(
    scope.add(new THREE.CylinderGeometry(70, 90, 8, 12, 1)),
    scope.add(
      new THREE.MeshLambertMaterial({ color: new THREE.Color(GRASS[2]), flatShading: true }),
    ),
  );
  island.position.y = 2;
  island.receiveShadow = true;
  island.castShadow = true;
  group.add(island);

  const r = rng.fork('test-scene');
  const box = scope.add(new THREE.BoxGeometry(1, 1, 1));
  const wallMat = scope.add(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const count = 40;
  const houses = new THREE.InstancedMesh(box, wallMat, count);
  houses.castShadow = true;
  houses.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const color = new THREE.Color();
  let hash = 0x811c9dc5;
  for (let i = 0; i < count; i++) {
    const a = r.range(0, Math.PI * 2);
    const d = r.range(5, 55);
    p.set(Math.cos(a) * d, 6 + 1.75, Math.sin(a) * d);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.range(0, Math.PI * 2));
    s.set(3, 3.5, 3);
    m.compose(p, q, s);
    houses.setMatrixAt(i, m);
    color.set(i % 3 === 0 ? r.pick(ROOFS) : r.pick(WALLS));
    houses.setColorAt(i, color);
    hash = (Math.imul(hash ^ Math.round(p.x * 100), 0x01000193) ^ Math.round(p.z * 100)) >>> 0;
  }
  houses.instanceMatrix.needsUpdate = true;
  if (houses.instanceColor) houses.instanceColor.needsUpdate = true;
  houses.computeBoundingSphere();
  group.add(houses);
  scope.defer(() => houses.dispose());

  const sun = new THREE.DirectionalLight(new THREE.Color('#FFF6E5'), 3);
  sun.position.set(120, 180, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -120;
  sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120;
  sun.shadow.camera.bottom = -120;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  group.add(sun);
  group.add(sun.target);
  scope.defer(() => sun.shadow.dispose());
  const hemi = new THREE.HemisphereLight(
    new THREE.Color('#CFEAFF'),
    new THREE.Color('#B9D08A'),
    1.2,
  );
  group.add(hemi);

  const system: System = {
    name: 'test-scene',
    update: () => {
      /* static for now */
    },
  };

  return { group, system, hash: hash.toString(16).padStart(8, '0') };
}
